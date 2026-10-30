-- ============================================================================
-- NEFROHUB - MIGRATION 001: RLS POLICIES & ATOMIC CLINICAL RPCS (REVISÃO FASE 1.3)
-- Idempotente e em conformidade estrita com documentation.md (Seções 2, 3, 4, 6 e 15)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HABILITAÇÃO DE ROW LEVEL SECURITY (RLS) - Negação por Padrão
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.physician_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.physician_patient_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.physician_patient_link_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.patient_representations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.clinical_submission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rejected_submission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lab_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vital_signs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dialysis_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.dialysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.calculation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.care_units ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. POLÍTICAS DE ACESSO: USERS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "users_select_self_or_admin" ON public.users;
CREATE POLICY "users_select_self_or_admin" ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u 
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "users_update_self" ON public.users;
CREATE POLICY "users_update_self" ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----------------------------------------------------------------------------
-- 3. POLÍTICAS DE ACESSO: PATIENT_PROFILES
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "patients_select_policy" ON public.patient_profiles;
CREATE POLICY "patients_select_policy" ON public.patient_profiles
  FOR SELECT
  TO authenticated
  USING (
    -- O próprio paciente
    user_id = auth.uid()
    -- Médico com vínculo ativo formal
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = patient_profiles.id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    -- Administrador da instituição
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "patients_insert_admin_doctor" ON public.patient_profiles;
CREATE POLICY "patients_insert_admin_doctor" ON public.patient_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ADMIN', 'DOCTOR', 'DOCTOR_MASTER')
    )
  );

DROP POLICY IF EXISTS "patients_update_self_or_admin" ON public.patient_profiles;
CREATE POLICY "patients_update_self_or_admin" ON public.patient_profiles
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- 4. POLÍTICAS DE ACESSO: PHYSICIAN_PATIENT_LINKS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "links_select_policy" ON public.physician_patient_links;
CREATE POLICY "links_select_policy" ON public.physician_patient_links
  FOR SELECT
  TO authenticated
  USING (
    physician_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = physician_patient_links.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "links_insert_admin" ON public.physician_patient_links;
CREATE POLICY "links_insert_admin" ON public.physician_patient_links
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- 5. POLÍTICAS DE ACESSO: CLINICAL_RECORDS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "clinical_records_select_policy" ON public.clinical_records;
CREATE POLICY "clinical_records_select_policy" ON public.clinical_records
  FOR SELECT
  TO authenticated
  USING (
    -- O próprio paciente visualiza seu prontuário
    EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = clinical_records.patient_id AND p.user_id = auth.uid()
    )
    -- Médico com vínculo ativo autorizado
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = clinical_records.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
  );

DROP POLICY IF EXISTS "clinical_records_insert_patient" ON public.clinical_records;
CREATE POLICY "clinical_records_insert_patient" ON public.clinical_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Paciente só insere PENDING_VALIDATION para si mesmo
    status = 'PENDING_VALIDATION'
    AND created_by_user_id = auth.uid()
    AND confirmed_by_user_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = clinical_records.patient_id AND p.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 6. POLÍTICAS DE ACESSO: VITAL_SIGNS E LAB_RESULTS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "vital_signs_select_policy" ON public.vital_signs;
CREATE POLICY "vital_signs_select_policy" ON public.vital_signs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinical_records r
      JOIN public.patient_profiles p ON p.id = r.patient_id
      WHERE r.id = vital_signs.clinical_record_id
        AND (
          p.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.physician_patient_links l
            WHERE l.patient_id = p.id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE'
          )
        )
    )
  );

DROP POLICY IF EXISTS "vital_signs_insert_policy" ON public.vital_signs;
CREATE POLICY "vital_signs_insert_policy" ON public.vital_signs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinical_records r
      WHERE r.id = vital_signs.clinical_record_id
        AND r.created_by_user_id = auth.uid()
        AND r.status = 'PENDING_VALIDATION'
    )
  );

-- ----------------------------------------------------------------------------
-- 7. POLÍTICAS DE ACESSO: AUDIT_EVENTS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "audit_events_select_admin" ON public.audit_events;
CREATE POLICY "audit_events_select_admin" ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "audit_events_insert_authenticated" ON public.audit_events;
CREATE POLICY "audit_events_insert_authenticated" ON public.audit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR user_id IS NULL
  );

-- ----------------------------------------------------------------------------
-- 8. RPC TRANSACIONAL ATÔMICA: SUBMISSÃO DE SINAIS VITAIS PELO PACIENTE
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_submit_patient_vitals(
  p_weight NUMERIC DEFAULT NULL,
  p_bp_systolic NUMERIC DEFAULT NULL,
  p_bp_diastolic NUMERIC DEFAULT NULL,
  p_clinical_date DATE DEFAULT CURRENT_DATE,
  p_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_record_id UUID;
BEGIN
  -- 1. Identificar usuário autenticado pelo token JWT
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
  END IF;

  -- 2. Resolver o paciente correspondente a este user_id
  SELECT id INTO v_patient_id
  FROM public.patient_profiles
  WHERE user_id = v_user_id;

  IF v_patient_id IS NULL THEN
    -- Fallback suave para tabela legada em transição
    SELECT id INTO v_patient_id
    FROM public.patients
    WHERE user_id = v_user_id;
  END IF;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Prontuário de paciente não localizado para a conta autenticada.';
  END IF;

  -- 3. Atualizar telefone cadastral civil se fornecido
  IF p_phone IS NOT NULL AND trim(p_phone) <> '' THEN
    UPDATE public.users SET phone = p_phone WHERE id = v_user_id;
    UPDATE public.patient_profiles SET phone = p_phone WHERE id = v_patient_id;
  END IF;

  -- 4. Se não houver medições clínicas, encerra com sucesso cadastral
  IF p_weight IS NULL AND p_bp_systolic IS NULL AND p_bp_diastolic IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Dados cadastrais atualizados com sucesso.'
    );
  END IF;

  -- Validação clínica: Data não pode ser futura
  IF p_clinical_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Data de aferição inválida: Não é permitido registrar medições futuras.';
  END IF;

  -- Validação clínica de paridade de Pressão Arterial
  IF (p_bp_systolic IS NOT NULL AND p_bp_diastolic IS NULL)
     OR (p_bp_systolic IS NULL AND p_bp_diastolic IS NOT NULL) THEN
    RAISE EXCEPTION 'Para registrar a pressão arterial, informe tanto a sistólica quanto a diastólica.';
  END IF;

  -- Validação clínica: Sistólica deve ser maior que diastólica
  IF p_bp_systolic IS NOT NULL AND p_bp_diastolic IS NOT NULL AND p_bp_systolic <= p_bp_diastolic THEN
    RAISE EXCEPTION 'Inconsistência clínica: A pressão sistólica deve ser estritamente maior que a diastólica.';
  END IF;

  -- Validação de limites numéricos no banco (Defesa em Profundidade)
  IF p_weight IS NOT NULL AND (p_weight < 10 OR p_weight > 400) THEN
    RAISE EXCEPTION 'Valor de peso corporal fora do intervalo aceito (10 a 400 kg).';
  END IF;

  IF p_bp_systolic IS NOT NULL AND (p_bp_systolic < 50 OR p_bp_systolic > 260) THEN
    RAISE EXCEPTION 'Valor de pressão sistólica fora do intervalo aceito (50 a 260 mmHg).';
  END IF;

  IF p_bp_diastolic IS NOT NULL AND (p_bp_diastolic < 30 OR p_bp_diastolic > 160) THEN
    RAISE EXCEPTION 'Valor de pressão diastólica fora do intervalo aceito (30 a 160 mmHg).';
  END IF;

  -- 5. Criar registro clínico no estado PENDING_VALIDATION
  INSERT INTO public.clinical_records (
    patient_id,
    record_type,
    status,
    clinical_date,
    created_by_user_id,
    confirmed_by_user_id,
    confirmed_at
  ) VALUES (
    v_patient_id,
    'VITAL_SIGNS',
    'PENDING_VALIDATION',
    COALESCE(p_clinical_date, CURRENT_DATE),
    v_user_id,
    NULL,
    NULL
  )
  RETURNING id INTO v_record_id;

  -- 6. Inserir itens estruturados em vital_signs
  IF p_weight IS NOT NULL THEN
    INSERT INTO public.vital_signs (clinical_record_id, sign_code, numeric_value, unit, is_calculated)
    VALUES (v_record_id, 'WEIGHT', p_weight, 'kg', FALSE);
  END IF;

  IF p_bp_systolic IS NOT NULL THEN
    INSERT INTO public.vital_signs (clinical_record_id, sign_code, numeric_value, unit, is_calculated)
    VALUES (v_record_id, 'BP_SYSTOLIC', p_bp_systolic, 'mmHg', FALSE);
  END IF;

  IF p_bp_diastolic IS NOT NULL THEN
    INSERT INTO public.vital_signs (clinical_record_id, sign_code, numeric_value, unit, is_calculated)
    VALUES (v_record_id, 'BP_DIASTOLIC', p_bp_diastolic, 'mmHg', FALSE);
  END IF;

  -- 7. Gravação OBRIGATÓRIA do evento de auditoria na MESMA transação
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_user_id,
    v_patient_id,
    'PATIENT_VITALS_SUBMITTED',
    'clinical_records',
    'SUCCESS',
    jsonb_build_object(
      'clinical_record_id', v_record_id,
      'status', 'PENDING_VALIDATION'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_record_id,
    'message', 'Medições enviadas com sucesso! Seus dados foram encaminhados para a fila de validação do médico responsável.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. RPC TRANSACIONAL ATÔMICA: CONFIRMAÇÃO CLÍNICA COM BLOQUEIO OTIMISTA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_confirm_clinical_record(
  p_record_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_record_type TEXT;
  v_rows_updated INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  -- 1. Obter paciente e tipo de registro
  SELECT patient_id, record_type INTO v_patient_id, v_record_type
  FROM public.clinical_records
  WHERE id = p_record_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Registro clínico não encontrado.';
  END IF;

  -- 2. Validar que o médico possui vínculo ACTIVE com o paciente
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 3. Atualização Atômica com Bloqueio Otimista (apenas se PENDING_VALIDATION)
  UPDATE public.clinical_records
  SET status = 'CONFIRMED',
      confirmed_by_user_id = v_user_id,
      confirmed_at = v_now
  WHERE id = p_record_id
    AND status = 'PENDING_VALIDATION';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Transição inválida ou concorrência detectada: Este registro já foi confirmado, rejeitado ou não está pendente.';
  END IF;

  -- 4. Registrar auditoria na mesma transação
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_user_id,
    v_patient_id,
    'CLINICAL_RECORD_CONFIRMED',
    'clinical_records',
    'SUCCESS',
    jsonb_build_object(
      'clinical_record_id', p_record_id,
      'confirmed_at', v_now
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Registro clínico validado e confirmado com sucesso.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 10. RPC TRANSACIONAL ATÔMICA: REJEIÇÃO CLÍNICA COM BLOQUEIO OTIMISTA
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_reject_clinical_record(
  p_record_id UUID,
  p_rejection_code TEXT,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_created_by UUID;
  v_record_type TEXT;
  v_rows_updated INT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  IF p_rejection_code NOT IN ('INVALID_VALUE', 'DUPLICATE', 'UNREADABLE', 'INCOMPLETE', 'OTHER') THEN
    RAISE EXCEPTION 'Código de rejeição inválido. Utilize um dos códigos padronizados pelo protocolo.';
  END IF;

  -- 1. Obter paciente
  SELECT patient_id, created_by_user_id, record_type 
  INTO v_patient_id, v_created_by, v_record_type
  FROM public.clinical_records
  WHERE id = p_record_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Registro clínico não encontrado.';
  END IF;

  -- 2. Validar vínculo ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  -- 3. Atualização Atômica com Bloqueio Otimista
  UPDATE public.clinical_records
  SET status = 'REJECTED'
  WHERE id = p_record_id
    AND status = 'PENDING_VALIDATION';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Transição inválida ou concorrência detectada: Este registro já foi processado e não está pendente.';
  END IF;

  -- 4. Registrar em rejected_submission_events na mesma transação
  INSERT INTO public.rejected_submission_events (
    patient_id,
    submitted_by_user_id,
    reviewed_by_user_id,
    record_type,
    rejection_code,
    rejection_reason,
    disposal_status
  ) VALUES (
    v_patient_id,
    v_created_by,
    v_user_id,
    v_record_type,
    p_rejection_code,
    p_rejection_reason,
    'PENDING_DISPOSAL'
  );

  -- 5. Registrar auditoria obrigatória
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_user_id,
    v_patient_id,
    'CLINICAL_RECORD_REJECTED',
    'clinical_records',
    'SUCCESS',
    jsonb_build_object(
      'clinical_record_id', p_record_id,
      'rejection_code', p_rejection_code
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Submissão rejeitada conforme o protocolo clínico.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 11. PRIVILÉGIOS DAS RPCS: REVOGAÇÃO DE PUBLIC E CONCESSÃO ESTRITA A AUTHENTICATED
-- ----------------------------------------------------------------------------

-- Revogação estrita de PUBLIC (que inclui anon)
REVOKE ALL ON FUNCTION public.rpc_submit_patient_vitals FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_confirm_clinical_record FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reject_clinical_record FROM PUBLIC;

-- Concessão exclusiva ao papel autenticado
GRANT EXECUTE ON FUNCTION public.rpc_submit_patient_vitals TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_clinical_record TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_clinical_record TO authenticated;
