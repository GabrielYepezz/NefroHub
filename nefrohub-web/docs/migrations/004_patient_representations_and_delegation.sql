-- ============================================================================
-- NEFROHUB - MIGRATION 004: REPRESENTANTES LEGAIS E CUIDADORES (FASE 4.1)
-- Idempotente e em conformidade estrita com documentation.md (Seção 5)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. HABILITAÇÃO DE ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.patient_representations ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. POLÍTICAS DE ACESSO: PATIENT_REPRESENTATIONS
-- ----------------------------------------------------------------------------

DROP POLICY IF EXISTS "representations_select_policy" ON public.patient_representations;
CREATE POLICY "representations_select_policy" ON public.patient_representations
  FOR SELECT
  TO authenticated
  USING (
    -- O paciente titular
    EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid()
    )
    -- O representante autenticado
    OR representative_user_id = auth.uid()
    -- Administrador da instituição
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "representations_insert_policy" ON public.patient_representations;
CREATE POLICY "representations_insert_policy" ON public.patient_representations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Paciente titular solicitando (sempre PENDING)
    (
      status = 'PENDING'
      AND verified_by_user_id IS NULL
      AND EXISTS (
        SELECT 1 FROM public.patient_profiles p
        WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid()
      )
    )
    -- Administrador
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "representations_update_policy" ON public.patient_representations;
CREATE POLICY "representations_update_policy" ON public.patient_representations
  FOR UPDATE
  TO authenticated
  USING (
    -- Administrador (pode homologar, rejeitar ou suspender)
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
    -- Paciente titular (apenas para revogar seu representante)
    OR (
      EXISTS (
        SELECT 1 FROM public.patient_profiles p
        WHERE p.id = patient_representations.patient_id AND p.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
    OR (
      -- Paciente só pode atualizar status para ENDED (revogação)
      status = 'ENDED'
      AND revoked_by_user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 3. RPCS TRANSACIONAIS DE GOVERNANÇA DE REPRESENTAÇÃO
-- ----------------------------------------------------------------------------

-- 3.1. Solicitação de Representação pelo Paciente
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

  -- 1. Obter paciente titular
  SELECT id INTO v_patient_id
  FROM public.patient_profiles
  WHERE user_id = v_user_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Prontuário de paciente não localizado para a conta autenticada.';
  END IF;

  -- 2. Localizar usuário representante por e-mail
  SELECT id INTO v_rep_user_id
  FROM public.users
  WHERE LOWER(email) = LOWER(trim(p_representative_email));

  IF v_rep_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não encontrado com o e-mail informado. O representante deve criar uma conta no NefroHub antes de ser vinculado.';
  END IF;

  -- 3. Proibir que o paciente represente a si mesmo
  IF v_rep_user_id = v_user_id THEN
    RAISE EXCEPTION 'Operação inválida: O paciente não pode solicitar representação de si mesmo.';
  END IF;

  -- 4. Verificar se já existe vínculo ativo ou pendente
  IF EXISTS (
    SELECT 1 FROM public.patient_representations
    WHERE patient_id = v_patient_id
      AND representative_user_id = v_rep_user_id
      AND status IN ('ACTIVE', 'PENDING')
  ) THEN
    RAISE EXCEPTION 'Já existe uma representação ativa ou pendente para este usuário.';
  END IF;

  -- 5. Definir escopo baseado na autoridade
  v_default_scope := CASE p_authority_type
    WHEN 'FULL' THEN jsonb_build_object('can_view_records', true, 'can_submit_vitals', true, 'can_upload_documents', true)
    WHEN 'SUBMIT_VITALS' THEN jsonb_build_object('can_view_records', false, 'can_submit_vitals', true, 'can_upload_documents', false)
    ELSE jsonb_build_object('can_view_records', true, 'can_submit_vitals', false, 'can_upload_documents', false)
  END;

  -- 6. Inserir em PENDING
  INSERT INTO public.patient_representations (
    patient_id,
    representative_user_id,
    relationship_type,
    authority_type,
    scope,
    proof_document_ref,
    status,
    valid_from,
    valid_until
  ) VALUES (
    v_patient_id,
    v_rep_user_id,
    p_relationship_type,
    p_authority_type,
    v_default_scope,
    p_proof_ref,
    'PENDING',
    CURRENT_DATE,
    p_valid_until
  )
  RETURNING id INTO v_rep_id;

  -- 7. Auditoria
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
    'PATIENT_REPRESENTATION_REQUESTED',
    'patient_representations',
    'SUCCESS',
    jsonb_build_object(
      'representation_id', v_rep_id,
      'representative_user_id', v_rep_user_id,
      'relationship_type', p_relationship_type
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_rep_id,
    'message', 'Solicitação de representação enviada com sucesso para homologação administrativa.'
  );
END;
$$;

-- 3.2. Homologação de Representação pelo Administrador
CREATE OR REPLACE FUNCTION public.rpc_approve_representation(
  p_representation_id UUID
)
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
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.';
  END IF;

  -- Validar papel ADMIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores podem homologar representações legais.';
  END IF;

  SELECT patient_id INTO v_patient_id
  FROM public.patient_representations
  WHERE id = p_representation_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Solicitação de representação não encontrada.';
  END IF;

  -- Atualização atômica com bloqueio otimista
  UPDATE public.patient_representations
  SET status = 'ACTIVE',
      verified_by_user_id = v_admin_id,
      verified_at = NOW()
  WHERE id = p_representation_id
    AND status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Operação concorrente ou estado inválido: Esta solicitação já foi homologada ou processada.';
  END IF;

  -- Auditoria
  INSERT INTO public.audit_events (
    user_id,
    patient_id,
    action,
    resource,
    result,
    metadata
  ) VALUES (
    v_admin_id,
    v_patient_id,
    'PATIENT_REPRESENTATION_APPROVED',
    'patient_representations',
    'SUCCESS',
    jsonb_build_object('representation_id', p_representation_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Representação legal homologada com sucesso.'
  );
END;
$$;

-- 3.3. Recusa de Representação pelo Administrador
CREATE OR REPLACE FUNCTION public.rpc_reject_representation(
  p_representation_id UUID,
  p_reason TEXT
)
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
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = v_admin_id AND role = 'ADMIN') THEN
    RAISE EXCEPTION 'Acesso negado: Apenas administradores podem recusar representações legais.';
  END IF;

  SELECT patient_id INTO v_patient_id
  FROM public.patient_representations
  WHERE id = p_representation_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada.';
  END IF;

  UPDATE public.patient_representations
  SET status = 'REJECTED',
      revocation_reason = p_reason
  WHERE id = p_representation_id
    AND status = 'PENDING';

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Solicitação já processada anteriormente.';
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
    v_admin_id,
    v_patient_id,
    'PATIENT_REPRESENTATION_REJECTED',
    'patient_representations',
    'SUCCESS',
    p_reason,
    jsonb_build_object('representation_id', p_representation_id, 'reason', p_reason)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Solicitação de representação recusada.'
  );
END;
$$;

-- 3.4. Revogação de Representação (Paciente Titular ou Administrador)
CREATE OR REPLACE FUNCTION public.rpc_revoke_representation(
  p_representation_id UUID,
  p_reason TEXT DEFAULT NULL
)
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
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Não autorizado: Sessão não encontrada.';
  END IF;

  SELECT patient_id INTO v_patient_id
  FROM public.patient_representations
  WHERE id = p_representation_id;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Representação não localizada.';
  END IF;

  -- Verificar se é o paciente titular ou administrador
  SELECT EXISTS (SELECT 1 FROM public.patient_profiles WHERE id = v_patient_id AND user_id = v_actor_id) INTO v_is_patient;
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = v_actor_id AND role = 'ADMIN') INTO v_is_admin;

  IF NOT v_is_patient AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: Somente o paciente titular ou o administrador podem revogar a representação.';
  END IF;

  UPDATE public.patient_representations
  SET status = 'ENDED',
      revoked_by_user_id = v_actor_id,
      revoked_at = NOW(),
      revocation_reason = COALESCE(p_reason, 'Revogação solicitada pelo titular ou administrador.')
  WHERE id = p_representation_id
    AND status IN ('ACTIVE', 'PENDING', 'SUSPENDED');

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Esta representação já está encerrada ou não permite revogação.';
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
    v_actor_id,
    v_patient_id,
    'PATIENT_REPRESENTATION_REVOKED',
    'patient_representations',
    'SUCCESS',
    p_reason,
    jsonb_build_object('representation_id', p_representation_id, 'revoked_by', v_actor_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Representação legal revogada com sucesso.'
  );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. PRIVILÉGIOS DE EXECUÇÃO: REVOGAÇÃO DE PUBLIC E CONCESSÃO A AUTHENTICATED
-- ----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.rpc_request_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_approve_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_reject_representation FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_revoke_representation FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.rpc_request_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_approve_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_reject_representation TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_revoke_representation TO authenticated;
