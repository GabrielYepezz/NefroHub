-- ============================================================================
-- NEFROHUB - MIGRATION 005: DOCUMENTOS CLÍNICOS E STORAGE PRIVADO (FASE 4.2)
-- Idempotente e em conformidade estrita com documentation.md (Seção 11 e 13)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABELA DE METADADOS: DOCUMENTS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  uploaded_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  document_type VARCHAR(50) NOT NULL DEFAULT 'EXAM_REPORT', -- EXAM_REPORT, BIOPSY, IMAGING, PROOF_DOCUMENT, OTHER
  title VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  file_size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  validation_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, CONFIRMED, REJECTED
  reviewed_by_user_id UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT chk_document_mime CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  CONSTRAINT chk_document_size CHECK (file_size_bytes > 0 AND file_size_bytes <= 10485760),
  CONSTRAINT chk_document_status CHECK (validation_status IN ('PENDING', 'CONFIRMED', 'REJECTED'))
);

CREATE INDEX IF NOT EXISTS idx_documents_patient_status ON public.documents(patient_id, validation_status);

-- ----------------------------------------------------------------------------
-- 2. HABILITAÇÃO DE ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 3. POLÍTICAS RLS PARA METADADOS DE DOCUMENTOS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "documents_select_policy" ON public.documents;
CREATE POLICY "documents_select_policy" ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    -- O paciente titular
    EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = documents.patient_id AND p.user_id = auth.uid()
    )
    -- Médico com vínculo ativo
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = documents.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    -- Representante legal ativo com escopo de leitura
    OR EXISTS (
      SELECT 1 FROM public.patient_representations r
      WHERE r.patient_id = documents.patient_id
        AND r.representative_user_id = auth.uid()
        AND r.status = 'ACTIVE'
        AND (r.valid_until IS NULL OR r.valid_until >= CURRENT_DATE)
        AND (r.scope->>'can_view_records')::boolean = true
    )
    -- Administrador
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "documents_insert_policy" ON public.documents;
CREATE POLICY "documents_insert_policy" ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Paciente inserindo para si mesmo (sempre PENDING)
    (
      validation_status = 'PENDING'
      AND reviewed_by_user_id IS NULL
      AND uploaded_by_user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.patient_profiles p
        WHERE p.id = documents.patient_id AND p.user_id = auth.uid()
      )
    )
    -- Médico com vínculo ativo
    OR EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = documents.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    -- Representante com escopo de upload
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
  FOR UPDATE
  TO authenticated
  USING (
    -- Somente médico com vínculo ativo ou administrador pode atualizar status de curadoria
    EXISTS (
      SELECT 1 FROM public.physician_patient_links l
      WHERE l.patient_id = documents.patient_id
        AND l.physician_user_id = auth.uid()
        AND l.status = 'ACTIVE'
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  )
  WITH CHECK (
    validation_status IN ('CONFIRMED', 'REJECTED')
  );

-- ----------------------------------------------------------------------------
-- 4. RPCS TRANSACIONAIS DE CURADORIA DOCUMENTAL
-- ----------------------------------------------------------------------------

-- Confirmação de Documento Clínico pelo Médico
CREATE OR REPLACE FUNCTION public.rpc_confirm_document(
  p_document_id UUID
)
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.';
  END IF;

  SELECT patient_id INTO v_patient_id
  FROM public.documents
  WHERE id = p_document_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Documento não localizado.';
  END IF;

  -- Validar vínculo ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  UPDATE public.documents
  SET validation_status = 'CONFIRMED',
      reviewed_by_user_id = v_user_id,
      reviewed_at = v_now
  WHERE id = p_document_id
    AND validation_status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Operação concorrente: Este documento já foi processado ou não está pendente.';
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
    v_patient_id,
    'DOCUMENT_CONFIRMED',
    'documents',
    'SUCCESS',
    jsonb_build_object('document_id', p_document_id, 'confirmed_at', v_now)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Documento clínico validado e confirmado no prontuário.'
  );
END;
$$;

-- Rejeição de Documento Clínico pelo Médico
CREATE OR REPLACE FUNCTION public.rpc_reject_document(
  p_document_id UUID,
  p_reason TEXT
)
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.';
  END IF;

  IF p_reason IS NULL OR trim(p_reason) = '' THEN
    RAISE EXCEPTION 'A justificativa de recusa do documento é obrigatória.';
  END IF;

  SELECT patient_id INTO v_patient_id
  FROM public.documents
  WHERE id = p_document_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Documento não localizado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.physician_patient_links
    WHERE physician_user_id = v_user_id
      AND patient_id = v_patient_id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'Acesso negado: Você não possui vínculo clínico ativo com este paciente.';
  END IF;

  UPDATE public.documents
  SET validation_status = 'REJECTED',
      reviewed_by_user_id = v_user_id,
      reviewed_at = v_now,
      rejection_reason = p_reason
  WHERE id = p_document_id
    AND validation_status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Operação concorrente: Este documento já foi processado ou não está pendente.';
  END IF;

  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    justification,
    metadata
  ) VALUES (
    v_user_id,
    v_patient_id,
    'DOCUMENT_REJECTED',
    'documents',
    'SUCCESS',
    p_reason,
    jsonb_build_object('document_id', p_document_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Documento rejeitado e arquivado na trilha de governança.'
  );
END;
$$;

-- Privilégios das RPCs
REVOKE ALL ON FUNCTION public.rpc_confirm_document FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reject_document FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_confirm_document TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_document TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. CONFIGURAÇÃO DE BUCKET PRIVADO NO SUPABASE STORAGE (DOCUMENTAÇÃO SQL)
-- ----------------------------------------------------------------------------
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'clinical-documents',
--   'clinical-documents',
--   false,
--   10485760,
--   ARRAY['application/pdf', 'image/jpeg', 'image/png']
-- ) ON CONFLICT (id) DO UPDATE SET public = false;
