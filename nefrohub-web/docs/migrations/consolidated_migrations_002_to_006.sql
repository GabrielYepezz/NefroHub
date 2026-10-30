-- ============================================================================
-- NEFROHUB — PACOTE CONSOLIDADO DE MIGRATIONS 002 A 006 (FASE 4.8)
-- Idempotente, sequencial e com verificação automática de integridade ao final.
-- Projeto Alvo: iyukangioglvtgxirgcl
-- ============================================================================

-- Iniciando aplicação assistida das Migrations 002 a 006...

-- ----------------------------------------------------------------------------
-- PARTE 1: MIGRATION 002 — EXAMES LABORATORIAIS E CKD-EPI 2021
-- ----------------------------------------------------------------------------
-- Aplicando Migration 002...

CREATE OR REPLACE FUNCTION public.rpc_record_lab_exam(
  p_patient_id UUID,
  p_exam_name TEXT,
  p_numeric_value NUMERIC,
  p_original_unit TEXT,
  p_clinical_date DATE DEFAULT CURRENT_DATE,
  p_calculate_egfr BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_record_id UUID;
  v_birth_date DATE;
  v_sex public.biological_sex;
  v_age INT;
  v_is_female BOOLEAN;
  v_kappa NUMERIC;
  v_alpha NUMERIC;
  v_sex_factor NUMERIC;
  v_scr_over_kappa NUMERIC;
  v_min_comp NUMERIC;
  v_max_comp NUMERIC;
  v_egfr NUMERIC := NULL;
  v_rounded_egfr NUMERIC := NULL;
  v_stage TEXT := NULL;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = p_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  IF p_exam_name IS NULL OR trim(p_exam_name) = '' THEN
    RAISE EXCEPTION 'O nome do exame laboratorial é obrigatório.';
  END IF;

  IF p_numeric_value IS NULL OR p_numeric_value <= 0 THEN
    RAISE EXCEPTION 'O valor do exame deve ser numérico e estritamente positivo.';
  END IF;

  IF p_clinical_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'A data do exame não pode ser futura.';
  END IF;

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
    'LAB_RESULT',
    'CONFIRMED',
    COALESCE(p_clinical_date, CURRENT_DATE),
    v_user_id,
    v_user_id,
    v_now
  )
  RETURNING id INTO v_record_id;

  INSERT INTO public.lab_results (
    clinical_record_id,
    exam_name,
    numeric_value,
    original_unit,
    comparator,
    source_origin
  ) VALUES (
    v_record_id,
    p_exam_name,
    p_numeric_value,
    p_original_unit,
    '=',
    'MANUAL_INPUT'
  );

  IF p_calculate_egfr OR LOWER(p_exam_name) LIKE '%creatinina%' THEN
    SELECT birth_date, biological_sex
    INTO v_birth_date, v_sex
    FROM public.patient_profiles
    WHERE id = p_patient_id;

    IF v_birth_date IS NOT NULL AND v_sex IS NOT NULL THEN
      v_age := EXTRACT(YEAR FROM AGE(p_clinical_date, v_birth_date))::INT;

      IF v_age >= 18 THEN
        v_is_female := (v_sex = 'F');
        v_kappa := CASE WHEN v_is_female THEN 0.7 ELSE 0.9 END;
        v_alpha := CASE WHEN v_is_female THEN -0.241 ELSE -0.302 END;
        v_sex_factor := CASE WHEN v_is_female THEN 1.012 ELSE 1.000 END;

        v_scr_over_kappa := p_numeric_value / v_kappa;
        v_min_comp := LEAST(v_scr_over_kappa, 1.0);
        v_max_comp := GREATEST(v_scr_over_kappa, 1.0);

        v_egfr := 142 * POWER(v_min_comp, v_alpha) * POWER(v_max_comp, -1.200) * POWER(0.9938, v_age) * v_sex_factor;
        v_rounded_egfr := ROUND(v_egfr, 1);

        IF v_rounded_egfr >= 90 THEN v_stage := 'G1';
        ELSIF v_rounded_egfr >= 60 THEN v_stage := 'G2';
        ELSIF v_rounded_egfr >= 45 THEN v_stage := 'G3a';
        ELSIF v_rounded_egfr >= 30 THEN v_stage := 'G3b';
        ELSIF v_rounded_egfr >= 15 THEN v_stage := 'G4';
        ELSE v_stage := 'G5';
        END IF;

        INSERT INTO public.calculation_runs (
          calculator_code,
          formula_version,
          run_type,
          patient_id,
          performed_by_user_id,
          reference_date,
          input_values,
          input_units,
          source_record_ids,
          result_value,
          result_unit,
          clinical_notes
        ) VALUES (
          'CKD_EPI_2021',
          'CKD-EPI-2021-CR',
          'CLINICAL_RECORD',
          p_patient_id,
          v_user_id,
          p_clinical_date,
          jsonb_build_object('creatinine', p_numeric_value, 'age', v_age, 'sex', v_sex),
          jsonb_build_object('creatinine', p_original_unit, 'age', 'years'),
          ARRAY[v_record_id],
          v_rounded_egfr,
          'mL/min/1.73m²',
          'Cálculo automático de TFGe vinculado à confirmação laboratorial.'
        );

        INSERT INTO public.lab_results (
          clinical_record_id,
          exam_name,
          numeric_value,
          original_unit,
          comparator,
          source_origin
        ) VALUES (
          v_record_id,
          'TFGe (CKD-EPI 2021)',
          v_rounded_egfr,
          'mL/min/1.73m²',
          '=',
          'CALCULATED'
        );
      END IF;
    END IF;
  END IF;

  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_user_id,
    p_patient_id,
    'LAB_EXAM_CONFIRMED',
    'clinical_records',
    'SUCCESS',
    jsonb_build_object(
      'clinical_record_id', v_record_id,
      'exam_name', p_exam_name,
      'value', p_numeric_value,
      'egfr_calculated', v_rounded_egfr
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'record_id', v_record_id,
    'egfr', v_rounded_egfr,
    'stage', v_stage,
    'message', 'Exame laboratorial registrado e confirmado com sucesso no prontuário.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_lab_exam FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_record_lab_exam TO authenticated;

-- ----------------------------------------------------------------------------
-- PARTE 2: MIGRATION 003 — FEEDBACK DE REJEIÇÃO E FILAS
-- ----------------------------------------------------------------------------
-- Aplicando Migration 003...

DO $$ BEGIN
  ALTER TABLE public.rejected_submission_events
    ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN null; END $$;

ALTER TABLE IF EXISTS public.rejected_submission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rejected_events_select_policy" ON public.rejected_submission_events;
CREATE POLICY "rejected_events_select_policy" ON public.rejected_submission_events
  FOR SELECT TO authenticated
  USING (
    submitted_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = rejected_submission_events.patient_id AND p.user_id = auth.uid())
    OR reviewed_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "review_requests_select_policy" ON public.review_requests;
CREATE POLICY "review_requests_select_policy" ON public.review_requests
  FOR SELECT TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = review_requests.patient_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "review_requests_admin_update" ON public.review_requests;
CREATE POLICY "review_requests_admin_update" ON public.review_requests
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN'));

-- ----------------------------------------------------------------------------
-- PARTE 3: MIGRATION 004 — REPRESENTANTES LEGAIS E CUIDADORES
-- ----------------------------------------------------------------------------
-- Aplicando Migration 004...

ALTER TABLE IF EXISTS public.patient_representations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "representations_select_policy" ON public.patient_representations;
CREATE POLICY "representations_select_policy" ON public.patient_representations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid())
    OR representative_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "representations_insert_policy" ON public.patient_representations;
CREATE POLICY "representations_insert_policy" ON public.patient_representations
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      status = 'PENDING'
      AND verified_by_user_id IS NULL
      AND EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "representations_update_policy" ON public.patient_representations;
CREATE POLICY "representations_update_policy" ON public.patient_representations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
    OR EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
    OR (status = 'ENDED' AND revoked_by_user_id = auth.uid())
  );

CREATE OR REPLACE FUNCTION public.rpc_request_representation(
  p_representative_email TEXT,
  p_relationship_type TEXT,
  p_authority_type TEXT DEFAULT 'FULL',
  p_proof_ref TEXT DEFAULT NULL,
  p_valid_until DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_rep_user_id UUID;
  v_rep_id UUID;
  v_default_scope JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado: Usuário não autenticado.';
  END IF;

  SELECT id INTO v_patient_id FROM public.patient_profiles WHERE user_id = v_user_id;
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Prontuário de paciente não localizado para a conta autenticada.';
  END IF;

  SELECT id INTO v_rep_user_id FROM public.users WHERE LOWER(email) = LOWER(trim(p_representative_email));
  IF v_rep_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado com o e-mail informado. O representante deve criar uma conta no NefroHub antes de ser vinculado.';
  END IF;

  IF v_rep_user_id = v_user_id THEN
    RAISE EXCEPTION 'Operação inválida: O paciente não pode solicitar representação de si mesmo.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patient_representations
    WHERE patient_id = v_patient_id
      AND representative_user_id = v_rep_user_id
      AND status IN ('ACTIVE', 'PENDING')
  ) THEN
    RAISE EXCEPTION 'Já existe uma representação ativa ou pendente para este usuário.';
  END IF;

  v_default_scope := CASE p_authority_type
    WHEN 'FULL' THEN jsonb_build_object('can_view_records', true, 'can_submit_vitals', true, 'can_upload_documents', true)
    WHEN 'SUBMIT_VITALS' THEN jsonb_build_object('can_view_records', false, 'can_submit_vitals', true, 'can_upload_documents', false)
    ELSE jsonb_build_object('can_view_records', true, 'can_submit_vitals', false, 'can_upload_documents', false)
  END;

  INSERT INTO public.patient_representations (
    patient_id, representative_user_id, relationship_type, authority_type, scope,
    proof_document_ref, status, valid_from, valid_until
  ) VALUES (
    v_patient_id, v_rep_user_id, p_relationship_type, p_authority_type, v_default_scope,
    p_proof_ref, 'PENDING', CURRENT_DATE, p_valid_until
  )
  RETURNING id INTO v_rep_id;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, metadata)
  VALUES (
    v_user_id, v_patient_id, 'PATIENT_REPRESENTATION_REQUESTED', 'patient_representations', 'SUCCESS',
    jsonb_build_object('representation_id', v_rep_id, 'representative_user_id', v_rep_user_id)
  );

  RETURN jsonb_build_object('success', true, 'id', v_rep_id, 'message', 'Solicitação de representação enviada com sucesso para homologação administrativa.');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_approve_representation(p_representation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_patient_id UUID;
  v_rows_updated INT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores podem homologar representações legais.';
  END IF;

  SELECT patient_id INTO v_patient_id FROM public.patient_representations WHERE id = p_representation_id;
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Solicitação de representação não encontrada.'; END IF;

  UPDATE public.patient_representations
  SET status = 'ACTIVE', verified_by_user_id = v_admin_id, verified_at = NOW()
  WHERE id = p_representation_id AND status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Operação concorrente ou estado inválido: Esta solicitação já foi processada.';
  END IF;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, metadata)
  VALUES (v_admin_id, v_patient_id, 'PATIENT_REPRESENTATION_APPROVED', 'patient_representations', 'SUCCESS', jsonb_build_object('representation_id', p_representation_id));

  RETURN jsonb_build_object('success', true, 'message', 'Representação legal homologada com sucesso.');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reject_representation(p_representation_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID;
  v_patient_id UUID;
  v_rows_updated INT;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores podem recusar representações legais.';
  END IF;

  SELECT patient_id INTO v_patient_id FROM public.patient_representations WHERE id = p_representation_id;
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.'; END IF;

  UPDATE public.patient_representations
  SET status = 'REJECTED', revocation_reason = p_reason
  WHERE id = p_representation_id AND status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN RAISE EXCEPTION 'Solicitação já processada anteriormente.'; END IF;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata)
  VALUES (v_admin_id, v_patient_id, 'PATIENT_REPRESENTATION_REJECTED', 'patient_representations', 'SUCCESS', p_reason, jsonb_build_object('representation_id', p_representation_id));

  RETURN jsonb_build_object('success', true, 'message', 'Solicitação de representação recusada.');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_revoke_representation(p_representation_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID;
  v_patient_id UUID;
  v_is_patient BOOLEAN;
  v_is_admin BOOLEAN;
  v_rows_updated INT;
BEGIN
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.'; END IF;

  SELECT patient_id INTO v_patient_id FROM public.patient_representations WHERE id = p_representation_id;
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Representação não localizada.'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.patient_profiles WHERE id = v_patient_id AND user_id = v_actor_id) INTO v_is_patient;
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor_id AND role = 'ADMIN') INTO v_is_admin;

  IF NOT v_is_patient AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: Somente o paciente titular ou o administrador podem revogar a representação.';
  END IF;

  UPDATE public.patient_representations
  SET status = 'ENDED', revoked_by_user_id = v_actor_id, revoked_at = NOW(),
      revocation_reason = COALESCE(p_reason, 'Revogação solicitada pelo titular ou administrador.')
  WHERE id = p_representation_id AND status IN ('ACTIVE', 'PENDING', 'SUSPENDED');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN RAISE EXCEPTION 'Esta representação já está encerrada.'; END IF;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata)
  VALUES (v_actor_id, v_patient_id, 'PATIENT_REPRESENTATION_REVOKED', 'patient_representations', 'SUCCESS', p_reason, jsonb_build_object('representation_id', p_representation_id));

  RETURN jsonb_build_object('success', true, 'message', 'Representação legal revogada com sucesso.');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_request_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_approve_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reject_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_revoke_representation FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_request_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_representation TO authenticated;

-- ----------------------------------------------------------------------------
-- PARTE 4: MIGRATION 005 — DOCUMENTOS CLÍNICOS E CURADORIA
-- ----------------------------------------------------------------------------
-- Aplicando Migration 005...

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  uploaded_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  document_type VARCHAR(50) NOT NULL DEFAULT 'EXAM_REPORT',
  title VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  reviewed_by_user_id UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_document_mime CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT chk_document_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  CONSTRAINT chk_document_status CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_documents_patient_status ON public.documents(patient_id, validation_status);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select_policy" ON public.documents;
CREATE POLICY "documents_select_policy" ON public.documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = documents.patient_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = documents.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = documents.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "documents_insert_policy" ON public.documents;
CREATE POLICY "documents_insert_policy" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      validation_status = 'PENDING'
      AND reviewed_by_user_id IS NULL
      AND uploaded_by_user_id = auth.uid()
      AND EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = documents.patient_id AND p.user_id = auth.uid())
    )
    OR EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = documents.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = documents.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_upload_documents')::boolean = true
    )
  );

DROP POLICY IF EXISTS "documents_update_curation_policy" ON public.documents;
CREATE POLICY "documents_update_curation_policy" ON public.documents
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = documents.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  )
  WITH CHECK (validation_status IN ('CONFIRMED', 'REJECTED'));

CREATE OR REPLACE FUNCTION public.rpc_confirm_document(p_document_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_rows_updated INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.'; END IF;

  SELECT patient_id INTO v_patient_id FROM public.documents WHERE id = p_document_id;
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Documento não localizado.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = v_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  UPDATE public.documents
  SET validation_status = 'CONFIRMED', reviewed_by_user_id = v_user_id, reviewed_at = v_now
  WHERE id = p_document_id AND validation_status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN RAISE EXCEPTION 'Operação concorrente: Este documento já foi processado.'; END IF;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, metadata)
  VALUES (v_user_id, v_patient_id, 'DOCUMENT_CONFIRMED', 'documents', 'SUCCESS', jsonb_build_object('document_id', p_document_id, 'confirmed_at', v_now));

  RETURN jsonb_build_object('success', true, 'message', 'Documento clínico validado e confirmado no prontuário.');
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_reject_document(p_document_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_patient_id UUID;
  v_rows_updated INT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.'; END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN RAISE EXCEPTION 'A justificativa de recusa do documento é obrigatória.'; END IF;

  SELECT patient_id INTO v_patient_id FROM public.documents WHERE id = p_document_id;
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Documento não localizado.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = v_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  UPDATE public.documents
  SET validation_status = 'REJECTED', reviewed_by_user_id = v_user_id, reviewed_at = v_now, rejection_reason = p_reason
  WHERE id = p_document_id AND validation_status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN RAISE EXCEPTION 'Operação concorrente: Este documento já foi processado.'; END IF;

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata)
  VALUES (v_user_id, v_patient_id, 'DOCUMENT_REJECTED', 'documents', 'SUCCESS', p_reason, jsonb_build_object('document_id', p_document_id, 'reason', p_reason));

  RETURN jsonb_build_object('success', true, 'message', 'Documento rejeitado e arquivado na trilha de governança.');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_confirm_document FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reject_document FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_confirm_document TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_document TO authenticated;

-- ----------------------------------------------------------------------------
-- PARTE 5: MIGRATION 006 — COMORBIDADES E MEDICAMENTOS DE USO CONTÍNUO
-- ----------------------------------------------------------------------------
-- Aplicando Migration 006...

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

ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_status') THEN
    ALTER TABLE public.conditions ADD CONSTRAINT chk_condition_status CHECK (status IN ('ACTIVE', 'RESOLVED', 'INACTIVE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_validation_status') THEN
    ALTER TABLE public.conditions ADD CONSTRAINT chk_condition_validation_status CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_condition_onset_date') THEN
    ALTER TABLE public.conditions ADD CONSTRAINT chk_condition_onset_date CHECK (onset_date IS NULL OR onset_date <= CURRENT_DATE);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conditions_patient_status ON public.conditions(patient_id, status);

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

ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES public.users(id);
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS is_prescription BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());
ALTER TABLE public.medications ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_status') THEN
    ALTER TABLE public.medications ADD CONSTRAINT chk_medication_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_validation_status') THEN
    ALTER TABLE public.medications ADD CONSTRAINT chk_medication_validation_status CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_medication_dates') THEN
    ALTER TABLE public.medications ADD CONSTRAINT chk_medication_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_medications_patient_status ON public.medications(patient_id, status);

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

ALTER TABLE public.conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conditions_select_policy" ON public.conditions;
CREATE POLICY "conditions_select_policy" ON public.conditions
  FOR SELECT TO authenticated
  USING (
    (validation_status = 'CONFIRMED' AND EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = conditions.patient_id AND p.user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = conditions.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = conditions.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
        AND conditions.validation_status = 'CONFIRMED'
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "conditions_insert_policy" ON public.conditions;
CREATE POLICY "conditions_insert_policy" ON public.conditions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = conditions.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
  );

DROP POLICY IF EXISTS "conditions_update_policy" ON public.conditions;
CREATE POLICY "conditions_update_policy" ON public.conditions
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = conditions.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
  );

DROP POLICY IF EXISTS "conditions_delete_policy" ON public.conditions;
CREATE POLICY "conditions_delete_policy" ON public.conditions FOR DELETE TO authenticated USING (false);

DROP POLICY IF EXISTS "medications_select_policy" ON public.medications;
CREATE POLICY "medications_select_policy" ON public.medications
  FOR SELECT TO authenticated
  USING (
    (validation_status = 'CONFIRMED' AND EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = medications.patient_id AND p.user_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = medications.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = medications.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
        AND medications.validation_status = 'CONFIRMED'
    )
    OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.role = 'ADMIN')
  );

DROP POLICY IF EXISTS "medications_insert_policy" ON public.medications;
CREATE POLICY "medications_insert_policy" ON public.medications
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = medications.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
  );

DROP POLICY IF EXISTS "medications_update_policy" ON public.medications;
CREATE POLICY "medications_update_policy" ON public.medications
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.physician_patient_links l WHERE l.patient_id = medications.patient_id AND l.physician_user_id = auth.uid() AND l.status = 'ACTIVE')
  );

DROP POLICY IF EXISTS "medications_delete_policy" ON public.medications;
CREATE POLICY "medications_delete_policy" ON public.medications FOR DELETE TO authenticated USING (false);

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
  v_now TIMESTAMPTZ := NOW();
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = p_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN RAISE EXCEPTION 'O nome da comorbidade é obrigatório.'; END IF;
  IF length(v_clean_name) > 255 THEN RAISE EXCEPTION 'O nome da comorbidade não pode exceder 255 caracteres.'; END IF;
  IF p_status NOT IN ('ACTIVE', 'RESOLVED', 'INACTIVE') THEN RAISE EXCEPTION 'Status da condição inválido.'; END IF;
  IF p_onset_date IS NOT NULL AND p_onset_date > CURRENT_DATE THEN RAISE EXCEPTION 'A data de início não pode ser futura.'; END IF;

  INSERT INTO public.clinical_records (patient_id, record_type, status, clinical_date, created_by_user_id, confirmed_by_user_id, confirmed_at)
  VALUES (p_patient_id, 'CONDITION', 'CONFIRMED', COALESCE(p_onset_date, CURRENT_DATE), v_user_id, v_user_id, v_now)
  RETURNING id INTO v_record_id;

  INSERT INTO public.conditions (patient_id, clinical_record_id, name, cid10, onset_date, status, notes, created_by_user_id, validation_status, version, created_at, updated_at)
  VALUES (p_patient_id, v_record_id, v_clean_name, trim(p_cid10), p_onset_date, p_status, p_notes, v_user_id, 'CONFIRMED', 1, v_now, v_now)
  RETURNING id INTO v_condition_id;

  INSERT INTO public.condition_events (condition_id, previous_status, next_status, action_by_user_id, reason, created_at)
  VALUES (v_condition_id, NULL, p_status, v_user_id, COALESCE(p_notes, 'Cadastro inicial da condição clínica'), v_now);

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata, created_at)
  VALUES (v_user_id, p_patient_id, 'RECORD_CONDITION', 'conditions', 'SUCCESS', 'Registro de comorbidade', jsonb_build_object('condition_id', v_condition_id, 'name', v_clean_name), v_now);

  RETURN jsonb_build_object('success', true, 'condition_id', v_condition_id, 'message', 'Comorbidade registrada com sucesso no prontuário.');
END;
$$;

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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.'; END IF;

  SELECT patient_id, status, version INTO v_patient_id, v_current_status, v_current_version
  FROM public.conditions WHERE id = p_condition_id;

  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Comorbidade não encontrada.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = v_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência: O registro foi alterado por outro usuário (versão atual: %, esperada: %). Recarregue a página antes de atualizar.', v_current_version, p_expected_version;
  END IF;

  IF p_next_status NOT IN ('ACTIVE', 'RESOLVED', 'INACTIVE') THEN RAISE EXCEPTION 'Status inválido.'; END IF;
  IF p_next_status = v_current_status THEN RAISE EXCEPTION 'O novo status deve ser diferente do status atual.'; END IF;

  UPDATE public.conditions
  SET status = p_next_status, notes = CASE WHEN p_reason IS NOT NULL AND trim(p_reason) <> '' THEN p_reason ELSE notes END,
      version = version + 1, updated_at = v_now
  WHERE id = p_condition_id;

  INSERT INTO public.condition_events (condition_id, previous_status, next_status, action_by_user_id, reason, created_at)
  VALUES (p_condition_id, v_current_status, p_next_status, v_user_id, p_reason, v_now);

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata, created_at)
  VALUES (v_user_id, v_patient_id, 'UPDATE_CONDITION_STATUS', 'conditions', 'SUCCESS', p_reason, jsonb_build_object('condition_id', p_condition_id, 'new_version', v_current_version + 1), v_now);

  RETURN jsonb_build_object('success', true, 'new_status', p_next_status, 'new_version', v_current_version + 1, 'message', 'Status da comorbidade atualizado com sucesso.');
END;
$$;

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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = p_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  v_clean_name := trim(p_name);
  IF v_clean_name IS NULL OR v_clean_name = '' THEN RAISE EXCEPTION 'O nome do medicamento é obrigatório.'; END IF;
  IF length(v_clean_name) > 255 THEN RAISE EXCEPTION 'O nome do medicamento não pode exceder 255 caracteres.'; END IF;
  IF p_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED') THEN RAISE EXCEPTION 'Status do medicamento inválido.'; END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RAISE EXCEPTION 'A data de término não pode ser anterior à data de início.';
  END IF;

  INSERT INTO public.clinical_records (patient_id, record_type, status, clinical_date, created_by_user_id, confirmed_by_user_id, confirmed_at)
  VALUES (p_patient_id, 'MEDICATION', 'CONFIRMED', COALESCE(p_start_date, CURRENT_DATE), v_user_id, v_user_id, v_now)
  RETURNING id INTO v_record_id;

  INSERT INTO public.medications (
    patient_id, clinical_record_id, name, dosage, unit, route, frequency, start_date, end_date,
    status, is_prescription, notes, created_by_user_id, validation_status, version, created_at, updated_at
  ) VALUES (
    p_patient_id, v_record_id, v_clean_name, p_dosage, p_unit, p_route, p_frequency, p_start_date, p_end_date,
    p_status, COALESCE(p_is_prescription, FALSE), p_notes, v_user_id, 'CONFIRMED', 1, v_now, v_now
  )
  RETURNING id INTO v_medication_id;

  INSERT INTO public.medication_events (medication_id, previous_status, next_status, action_by_user_id, reason, created_at)
  VALUES (v_medication_id, NULL, p_status, v_user_id, COALESCE(p_notes, 'Início de registro de uso do medicamento'), v_now);

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata, created_at)
  VALUES (v_user_id, p_patient_id, 'RECORD_MEDICATION', 'medications', 'SUCCESS', 'Registro de medicamento contínuo', jsonb_build_object('medication_id', v_medication_id, 'name', v_clean_name), v_now);

  RETURN jsonb_build_object('success', true, 'medication_id', v_medication_id, 'message', 'Medicamento registrado com sucesso no prontuário.');
END;
$$;

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
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autorizado: Usuário não autenticado.'; END IF;

  SELECT patient_id, status, version, start_date INTO v_patient_id, v_current_status, v_current_version, v_start_date
  FROM public.medications WHERE id = p_medication_id;

  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'Medicamento não encontrado.'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id AND patient_id = v_patient_id AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Conflito de concorrência: O registro do medicamento foi alterado por outro usuário (versão atual: %, esperada: %). Recarregue a página antes de atualizar.', v_current_version, p_expected_version;
  END IF;

  IF p_next_status NOT IN ('ACTIVE', 'SUSPENDED', 'DISCONTINUED') THEN RAISE EXCEPTION 'Status inválido.'; END IF;
  IF p_next_status = v_current_status THEN RAISE EXCEPTION 'O novo status deve ser diferente do status atual.'; END IF;

  v_target_end_date := p_end_date;
  IF (p_next_status IN ('SUSPENDED', 'DISCONTINUED')) AND v_target_end_date IS NULL THEN
    v_target_end_date := CURRENT_DATE;
  END IF;

  IF v_target_end_date IS NOT NULL AND v_start_date IS NOT NULL AND v_target_end_date < v_start_date THEN
    RAISE EXCEPTION 'A data de término não pode ser anterior à data de início.';
  END IF;

  UPDATE public.medications
  SET status = p_next_status, end_date = v_target_end_date,
      notes = CASE WHEN p_reason IS NOT NULL AND trim(p_reason) <> '' THEN p_reason ELSE notes END,
      version = version + 1, updated_at = v_now
  WHERE id = p_medication_id;

  INSERT INTO public.medication_events (medication_id, previous_status, next_status, action_by_user_id, reason, created_at)
  VALUES (p_medication_id, v_current_status, p_next_status, v_user_id, p_reason, v_now);

  INSERT INTO public.audit_events (user_id, patient_id, action, resource, result, justification, metadata, created_at)
  VALUES (v_user_id, v_patient_id, 'UPDATE_MEDICATION_STATUS', 'medications', 'SUCCESS', p_reason, jsonb_build_object('medication_id', p_medication_id, 'new_version', v_current_version + 1), v_now);

  RETURN jsonb_build_object('success', true, 'new_status', p_next_status, 'new_version', v_current_version + 1, 'message', 'Status do medicamento atualizado com sucesso.');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_record_condition FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_condition_status FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_record_medication FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_update_medication_status FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_record_condition TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_condition_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_record_medication TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_update_medication_status TO authenticated;

-- ----------------------------------------------------------------------------
-- PARTE 6: VERIFICAÇÃO AUTOMATIZADA DE INTEGRIDADE PÓS-APLICAÇÃO
-- ----------------------------------------------------------------------------
-- Executando verificação de integridade pós-aplicação...

DO $$
DECLARE
  v_missing_objects TEXT[] := ARRAY[]::TEXT[];
  v_rls_disabled TEXT[] := ARRAY[]::TEXT[];
  v_table_name TEXT;
  v_is_rls_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documents') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.documents');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'condition_events') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.condition_events');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'medication_events') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.medication_events');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_lab_exam') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_lab_exam');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_request_representation') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_request_representation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_confirm_document') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_confirm_document');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_condition') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_condition');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_medication') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_medication');
  END IF;

  FOREACH v_table_name IN ARRAY ARRAY[
    'clinical_records', 'vital_signs', 'lab_results', 'calculation_runs',
    'audit_events', 'rejected_submission_events', 'review_requests',
    'patient_representations', 'documents', 'conditions', 'condition_events',
    'medications', 'medication_events'
  ] LOOP
    SELECT relrowsecurity INTO v_is_rls_enabled
    FROM pg_class
    WHERE relname = v_table_name AND relnamespace = 'public'::regnamespace;

    IF v_is_rls_enabled IS NOT TRUE THEN
      v_rls_disabled := array_append(v_rls_disabled, v_table_name);
    END IF;
  END LOOP;

  IF array_length(v_missing_objects, 1) > 0 THEN
    RAISE EXCEPTION 'FALHA NA APLICAÇÃO: Objetos ausentes: %', v_missing_objects;
  END IF;

  IF array_length(v_rls_disabled, 1) > 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA: Tabelas sem RLS ativo: %', v_rls_disabled;
  END IF;

  RAISE NOTICE 'SUCESSO TOTAL: Migrations 002 a 006 aplicadas com RLS ativo em 100%% das tabelas!';
END $$;
