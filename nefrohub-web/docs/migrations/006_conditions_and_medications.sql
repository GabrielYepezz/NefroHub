-- ============================================================================
-- NEFROHUB - MIGRATION 006: COMORBIDADES E MEDICAMENTOS DE USO CONTÍNUO (FASE 4.3)
-- Idempotente e em conformidade estrita com documentation.md (Seções 6, 8.5 e 8.6)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELAS BASE E EXTENSÕES ESTRUTURAIS
-- ----------------------------------------------------------------------------

-- 1.1. Tabela: conditions (Doenças e Comorbidades de Base)
CREATE TABLE IF NOT EXISTS public.conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  cid10 VARCHAR(20),
  onset_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Adicionar colunas de governança, integridade e concorrência otimista
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Constraints para conditions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_status'
  ) THEN
    ALTER TABLE public.conditions
      ADD CONSTRAINT chk_condition_status
      CHECK (status IN ('ACTIVE', 'RESOLVED', 'INACTIVE'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_validation_status'
  ) THEN
    ALTER TABLE public.conditions
      ADD CONSTRAINT chk_condition_validation_status
      CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_onset_date'
  ) THEN
    ALTER TABLE public.conditions
      ADD CONSTRAINT chk_condition_onset_date
      CHECK (onset_date IS NULL OR onset_date <= CURRENT_DATE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conditions_patient_status ON public.conditions(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_conditions_validation ON public.conditions(patient_id, validation_status);

-- 1.2. Tabela de Histórico de Alterações de Comorbidades (Preservação de Histórico)
CREATE TABLE IF NOT EXISTS public.condition_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id UUID NOT NULL REFERENCES public.conditions(id) ON DELETE CASCADE,
  previous_status VARCHAR(50),
  next_status VARCHAR(50) NOT NULL,
  action_by_user_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_condition_event_next_status CHECK (next_status IN ('ACTIVE', 'RESOLVED', 'INACTIVE'))
);

CREATE INDEX IF NOT EXISTS idx_condition_events_condition ON public.condition_events(condition_id, created_at DESC);

-- 1.3. Tabela: medications (Medicamentos de Uso Contínuo)
CREATE TABLE IF NOT EXISTS public.medications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  dosage VARCHAR(100),
  unit VARCHAR(50),
  route VARCHAR(50),
  frequency VARCHAR(100),
  start_date DATE,
  end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Adicionar colunas de governança, distinção prescrição x histórico e concorrência otimista
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS is_prescription BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- Constraints para medications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_status'
  ) THEN
    ALTER TABLE public.medications
      ADD CONSTRAINT chk_medication_status
      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_validation_status'
  ) THEN
    ALTER TABLE public.medications
      ADD CONSTRAINT chk_medication_validation_status
      CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_dates'
  ) THEN
    ALTER TABLE public.medications
      ADD CONSTRAINT chk_medication_dates
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_medications_patient_status ON public.medications(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_medications_validation ON public.medications(patient_id, validation_status);

-- 1.4. Tabela de Histórico de Alterações de Medicamentos (Preservação de Histórico)
CREATE TABLE IF NOT EXISTS public.medication_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id UUID NOT NULL REFERENCES public.medications(id) ON DELETE CASCADE,
  previous_status VARCHAR(50),
  next_status VARCHAR(50) NOT NULL,
  action_by_user_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_medication_event_next_status CHECK (next_status IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED'))
);

CREATE INDEX IF NOT EXISTS idx_medication_events_medication ON public.medication_events(medication_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

ALTER TABLE public.conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_events ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. POLÍTICAS RLS: CONDITIONS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "conditions_select_policy" ON public.conditions;
CREATE POLICY "conditions_select_policy" ON public.conditions
  FOR SELECT
  TO authenticated
  USING (
    -- O paciente titular só visualiza comorbidades confirmadas
    (
      validation_status = 'CONFIRMED'
      AND EXISTS (
        SELECT 1 FROM public.patient_profiles p
        WHERE p.id = conditions.patient_id AND p.user_id = auth.uid()
      )
    )
    -- Médico com vínculo ativo autorizado visualiza confirmadas e pendentes
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = conditions.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    -- Representante legal ativo com autorização vigente e escopo de leitura
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = conditions.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
        AND conditions.validation_status = 'CONFIRMED'
    )
    -- Administrador
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "conditions_insert_policy" ON public.conditions;
CREATE POLICY "conditions_insert_policy" ON public.conditions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Apenas médico com vínculo ativo confirmado pode registrar
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = conditions.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "conditions_update_policy" ON public.conditions;
CREATE POLICY "conditions_update_policy" ON public.conditions
  FOR UPDATE
  TO authenticated
  USING (
    -- Apenas médico com vínculo ativo pode atualizar estado
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = conditions.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = conditions.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  );

-- Bloqueio estrito de DELETE (Registros clínicos são imutáveis e usam status inativo/resolvido)
DROP POLICY IF EXISTS "conditions_delete_policy" ON public.conditions;
CREATE POLICY "conditions_delete_policy" ON public.conditions
  FOR DELETE
  TO authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 4. POLÍTICAS RLS: CONDITION_EVENTS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "condition_events_select_policy" ON public.condition_events;
CREATE POLICY "condition_events_select_policy" ON public.condition_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conditions c
      WHERE c.id = condition_events.condition_id
        AND (
          EXISTS (
            SELECT 1 FROM public.physician_patient_links l
            WHERE l.patient_id = c.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE'
          )
          OR EXISTS (
            SELECT 1 FROM public.patient_profiles p
            WHERE p.id = c.patient_id AND p.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'ADMIN'
          )
        )
    )
  );

DROP POLICY IF EXISTS "condition_events_insert_policy" ON public.condition_events;
CREATE POLICY "condition_events_insert_policy" ON public.condition_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    action_by_user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 5. POLÍTICAS RLS: MEDICATIONS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "medications_select_policy" ON public.medications;
CREATE POLICY "medications_select_policy" ON public.medications
  FOR SELECT
  TO authenticated
  USING (
    -- O paciente titular só visualiza medicamentos confirmados
    (
      validation_status = 'CONFIRMED'
      AND EXISTS (
        SELECT 1 FROM public.patient_profiles p
        WHERE p.id = medications.patient_id AND p.user_id = auth.uid()
      )
    )
    -- Médico com vínculo ativo autorizado
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = medications.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    -- Representante legal ativo com escopo de leitura
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = medications.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
        AND medications.validation_status = 'CONFIRMED'
    )
    -- Administrador
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "medications_insert_policy" ON public.medications;
CREATE POLICY "medications_insert_policy" ON public.medications
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Apenas médico com vínculo ativo confirmado pode registrar
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = medications.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "medications_update_policy" ON public.medications;
CREATE POLICY "medications_update_policy" ON public.medications
  FOR UPDATE
  TO authenticated
  USING (
    -- Apenas médico com vínculo ativo pode atualizar estado
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = medications.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = medications.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  );

-- Bloqueio estrito de DELETE
DROP POLICY IF EXISTS "medications_delete_policy" ON public.medications;
CREATE POLICY "medications_delete_policy" ON public.medications
  FOR DELETE
  TO authenticated
  USING (false);

-- ----------------------------------------------------------------------------
-- 6. POLÍTICAS RLS: MEDICATION_EVENTS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "medication_events_select_policy" ON public.medication_events;
CREATE POLICY "medication_events_select_policy" ON public.medication_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.medications m
      WHERE m.id = medication_events.medication_id
        AND (
          EXISTS (
            SELECT 1 FROM public.physician_patient_links l
            WHERE l.patient_id = m.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE'
          )
          OR EXISTS (
            SELECT 1 FROM public.patient_profiles p
            WHERE p.id = m.patient_id AND p.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid() AND u.role = 'ADMIN'
          )
        )
    )
  );

DROP POLICY IF EXISTS "medication_events_insert_policy" ON public.medication_events;
CREATE POLICY "medication_events_insert_policy" ON public.medication_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    action_by_user_id = auth.uid()
  );

-- ----------------------------------------------------------------------------
-- 7. RPCS TRANSACIONAIS ATÔMICAS (ACID)
-- ----------------------------------------------------------------------------

-- 7.1. Registro Atômico de Comorbidade pelo Médico Responsável
CREATE OR REPLACE FUNCTION public.rpc_record_condition(
  p_patient_id UUID,
  p_name TEXT,
  p_cid10 TEXT DEFAULT NULL,
  p_onset_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT 'ACTIVE',
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_record_id UUID;
  v_condition_id UUID;
  v_clean_name TEXT;
  v_clean_cid10 TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 2. Validar vínculo clínico ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = p_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 3. Sanitização e validação de campos obrigatórios
  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION 'O nome da comorbidade é obrigatório.';
  END IF;

  IF length(v_clean_name) > 255 THEN
    RAISE EXCEPTION 'O nome da comorbidade não pode exceder 255 caracteres.';
  END IF;

  IF p_status NOT IN ('ACTIVE', 'RESOLVED', 'INACTIVE') THEN
    RAISE EXCEPTION 'Status da condição inválido. Valores aceitos: ACTIVE, RESOLVED, INACTIVE.';
  END IF;

  IF p_onset_date IS NOT NULL AND p_onset_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data de início da condição clínica não pode ser futura.';
  END IF;

  v_clean_cid10 := trim(p_cid10);
  IF v_clean_cid10 = '' THEN
    v_clean_cid10 := NULL;
  END IF;

  -- 4. Criar registro clínico CONFIRMED (lançado pelo médico assistente)
  INSERT INTO public.clinical_records (
    patient_id,
    record_type,
    status,
    clinical_date,
    created_by_user_id,
    confirmed_by_user_id,
    confirmed_at
  ) VALUES (
    p_patient_id,
    'CONDITION',
    'CONFIRMED',
    COALESCE(p_onset_date, CURRENT_DATE),
    v_user_id,
    v_user_id,
    v_now
  )
  RETURNING id INTO v_record_id;

  -- 5. Inserir em conditions
  INSERT INTO public.conditions (
    patient_id,
    clinical_record_id,
    name,
    cid10,
    onset_date,
    status,
    notes,
    created_by_user_id,
    validation_status,
    version,
    created_at,
    updated_at
  ) VALUES (
    p_patient_id,
    v_record_id,
    v_clean_name,
    v_clean_cid10,
    p_onset_date,
    p_status,
    p_notes,
    v_user_id,
    'CONFIRMED',
    1,
    v_now,
    v_now
  )
  RETURNING id INTO v_condition_id;

  -- 6. Gravar evento de histórico inicial
  INSERT INTO public.condition_events (
    condition_id,
    previous_status,
    next_status,
    action_by_user_id,
    reason,
    created_at
  ) VALUES (
    v_condition_id,
    NULL,
    p_status,
    v_user_id,
    COALESCE(p_notes, 'Cadastro inicial da condição clínica pelo médico assistente'),
    v_now
  );

  -- 7. Registrar auditoria obrigatória
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    justification,
    metadata,
    created_at
  ) VALUES (
    v_user_id,
    p_patient_id,
    'RECORD_CONDITION',
    'conditions',
    'SUCCESS',
    'Registro de comorbidade no prontuário',
    jsonb_build_object(
      'condition_id', v_condition_id,
      'clinical_record_id', v_record_id,
      'name', v_clean_name,
      'cid10', v_clean_cid10,
      'status', p_status
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'condition_id', v_condition_id,
    'clinical_record_id', v_record_id,
    'message', 'Comorbidade registrada com sucesso no prontuário.'
  );
END;
$$;

-- 7.2. Atualização de Estado de Comorbidade com Bloqueio Otimista
CREATE OR REPLACE FUNCTION public.rpc_update_condition_status(
  p_condition_id UUID,
  p_next_status TEXT,
  p_reason TEXT,
  p_expected_version INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_current_status TEXT;
  v_current_version INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 2. Localizar condição e verificar versão (Bloqueio Otimista)
  SELECT patient_id, status, version
  INTO v_patient_id, v_current_status, v_current_version
  FROM public.conditions
  WHERE id = p_condition_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Comorbidade não encontrada.';
  END IF;

  -- 3. Validar vínculo clínico ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 4. Verificação de Concorrência Otimista
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência: O registro da comorbidade foi alterado por outro usuário (versão atual: %, esperada: %). Recarregue a página antes de atualizar.',
      v_current_version, p_expected_version;
  END IF;

  -- 5. Validação de transição de status
  IF p_next_status NOT IN ('ACTIVE', 'RESOLVED', 'INACTIVE') THEN
    RAISE EXCEPTION 'Status inválido. Aceitos: ACTIVE, RESOLVED, INACTIVE.';
  END IF;

  IF p_next_status = v_current_status THEN
    RAISE EXCEPTION 'O novo status deve ser diferente do status atual (%).', v_current_status;
  END IF;

  -- 6. Atualizar a condição com incremento de versão
  UPDATE public.conditions
  SET
    status = p_next_status,
    notes = CASE WHEN p_reason IS NOT NULL AND trim(p_reason) <> '' THEN p_reason ELSE notes END,
    version = version + 1,
    updated_at = v_now
  WHERE id = p_condition_id;

  -- 7. Gravar evento de histórico imutável
  INSERT INTO public.condition_events (
    condition_id,
    previous_status,
    next_status,
    action_by_user_id,
    reason,
    created_at
  ) VALUES (
    p_condition_id,
    v_current_status,
    p_next_status,
    v_user_id,
    p_reason,
    v_now
  );

  -- 8. Auditoria obrigatória
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    justification,
    metadata,
    created_at
  ) VALUES (
    v_user_id,
    v_patient_id,
    'UPDATE_CONDITION_STATUS',
    'conditions',
    'SUCCESS',
    COALESCE(p_reason, 'Alteração de status clínico da comorbidade'),
    jsonb_build_object(
      'condition_id', p_condition_id,
      'previous_status', v_current_status,
      'next_status', p_next_status,
      'new_version', v_current_version + 1
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'condition_id', p_condition_id,
    'new_status', p_next_status,
    'new_version', v_current_version + 1,
    'message', 'Status da comorbidade atualizado com sucesso.'
  );
END;
$$;

-- 7.3. Registro Atômico de Medicamento de Uso Contínuo pelo Médico Responsável
CREATE OR REPLACE FUNCTION public.rpc_record_medication(
  p_patient_id UUID,
  p_name TEXT,
  p_dosage TEXT DEFAULT NULL,
  p_unit TEXT DEFAULT NULL,
  p_route TEXT DEFAULT NULL,
  p_frequency TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_status TEXT DEFAULT 'ACTIVE',
  p_is_prescription BOOLEAN DEFAULT FALSE,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_record_id UUID;
  v_medication_id UUID;
  v_clean_name TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 2. Validar vínculo clínico ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = p_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 3. Sanitização e validações
  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN
    RAISE EXCEPTION 'O nome do medicamento é obrigatório.';
  END IF;

  IF length(v_clean_name) > 255 THEN
    RAISE EXCEPTION 'O nome do medicamento não pode exceder 255 caracteres.';
  END IF;

  IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED') THEN
    RAISE EXCEPTION 'Status do medicamento inválido. Aceitos: ACTIVE, SUSPENDED, DISCONTINUED.';
  END IF;

  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'A data de término do medicamento não pode ser anterior à data de início.';
  END IF;

  -- 4. Criar registro clínico CONFIRMED (prontuário imutável)
  INSERT INTO public.clinical_records (
    patient_id,
    record_type,
    status,
    clinical_date,
    created_by_user_id,
    confirmed_by_user_id,
    confirmed_at
  ) VALUES (
    p_patient_id,
    'MEDICATION',
    'CONFIRMED',
    COALESCE(p_start_date, CURRENT_DATE),
    v_user_id,
    v_user_id,
    v_now
  )
  RETURNING id INTO v_record_id;

  -- 5. Inserir em medications
  INSERT INTO public.medications (
    patient_id,
    clinical_record_id,
    name,
    dosage,
    unit,
    route,
    frequency,
    start_date,
    end_date,
    status,
    is_prescription,
    notes,
    created_by_user_id,
    validation_status,
    version,
    created_at,
    updated_at
  ) VALUES (
    p_patient_id,
    v_record_id,
    v_clean_name,
    p_dosage,
    p_unit,
    p_route,
    p_frequency,
    p_start_date,
    p_end_date,
    p_status,
    COALESCE(p_is_prescription, FALSE),
    p_notes,
    v_user_id,
    'CONFIRMED',
    1,
    v_now,
    v_now
  )
  RETURNING id INTO v_medication_id;

  -- 6. Histórico inicial de estado
  INSERT INTO public.medication_events (
    medication_id,
    previous_status,
    next_status,
    action_by_user_id,
    reason,
    created_at
  ) VALUES (
    v_medication_id,
    NULL,
    p_status,
    v_user_id,
    COALESCE(p_notes, 'Início de registro de uso do medicamento no histórico clínico'),
    v_now
  );

  -- 7. Auditoria obrigatória
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    justification,
    metadata,
    created_at
  ) VALUES (
    v_user_id,
    p_patient_id,
    'RECORD_MEDICATION',
    'medications',
    'SUCCESS',
    'Registro de medicamento contínuo no prontuário',
    jsonb_build_object(
      'medication_id', v_medication_id,
      'clinical_record_id', v_record_id,
      'name', v_clean_name,
      'dosage', p_dosage,
      'unit', p_unit,
      'status', p_status,
      'is_prescription', p_is_prescription
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'medication_id', v_medication_id,
    'clinical_record_id', v_record_id,
    'message', 'Medicamento registrado com sucesso no prontuário.'
  );
END;
$$;

-- 7.4. Atualização de Estado de Medicamento com Bloqueio Otimista
CREATE OR REPLACE FUNCTION public.rpc_update_medication_status(
  p_medication_id UUID,
  p_next_status TEXT,
  p_reason TEXT,
  p_end_date DATE DEFAULT NULL,
  p_expected_version INT DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_current_status TEXT;
  v_current_version INT;
  v_start_date DATE;
  v_target_end_date DATE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Identificar usuário autenticado
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 2. Buscar medicamento atual
  SELECT patient_id, status, version, start_date
  INTO v_patient_id, v_current_status, v_current_version, v_start_date
  FROM public.medications
  WHERE id = p_medication_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Medicamento não encontrado.';
  END IF;

  -- 3. Validar vínculo clínico ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 4. Bloqueio Otimista
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência: O registro do medicamento foi alterado por outro usuário (versão atual: %, esperada: %). Recarregue a página antes de atualizar.',
      v_current_version, p_expected_version;
  END IF;

  -- 5. Validar novo status
  IF p_next_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED') THEN
    RAISE EXCEPTION 'Status do medicamento inválido. Aceitos: ACTIVE, SUSPENDED, DISCONTINUED.';
  END IF;

  IF p_next_status = v_current_status THEN
    RAISE EXCEPTION 'O novo status deve ser diferente do status atual (%).', v_current_status;
  END IF;

  v_target_end_date := p_end_date;
  IF (p_next_status IN ('SUSPENDED', 'DISCONTINUED')) AND v_target_end_date IS NULL THEN
    v_target_end_date := CURRENT_DATE;
  END IF;

  IF v_target_end_date IS NOT NULL AND v_start_date IS NOT NULL AND v_target_end_date < v_start_date THEN
    RAISE EXCEPTION 'A data de término do medicamento não pode ser anterior à data de início.';
  END IF;

  -- 6. Atualizar medicamento
  UPDATE public.medications
  SET
    status = p_next_status,
    end_date = v_target_end_date,
    notes = CASE WHEN p_reason IS NOT NULL AND trim(p_reason) <> '' THEN p_reason ELSE notes END,
    version = version + 1,
    updated_at = v_now
  WHERE id = p_medication_id;

  -- 7. Histórico do evento
  INSERT INTO public.medication_events (
    medication_id,
    previous_status,
    next_status,
    action_by_user_id,
    reason,
    created_at
  ) VALUES (
    p_medication_id,
    v_current_status,
    p_next_status,
    v_user_id,
    p_reason,
    v_now
  );

  -- 8. Auditoria obrigatória
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    justification,
    metadata,
    created_at
  ) VALUES (
    v_user_id,
    v_patient_id,
    'UPDATE_MEDICATION_STATUS',
    'medications',
    'SUCCESS',
    COALESCE(p_reason, 'Alteração de status do medicamento de uso contínuo'),
    jsonb_build_object(
      'medication_id', p_medication_id,
      'previous_status', v_current_status,
      'next_status', p_next_status,
      'end_date', v_target_end_date,
      'new_version', v_current_version + 1
    ),
    v_now
  );

  RETURN jsonb_build_object(
    'success', true,
    'medication_id', p_medication_id,
    'new_status', p_next_status,
    'new_version', v_current_version + 1,
    'end_date', v_target_end_date,
    'message', 'Status do medicamento atualizado com sucesso.'
  );
END;
$$;

-- Conceder permissões de execução aos usuários autenticados
GRANT EXECUTE ON FUNCTION public.rpc_record_condition TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_condition_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_medication TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_medication_status TO authenticated;
