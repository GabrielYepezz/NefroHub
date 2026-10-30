-- ============================================================================
-- NEFROHUB: SCRIPT DE VERIFICAÇÃO PÓS-APLICAÇÃO DAS MIGRATIONS 001 A 006
-- Não modifica dados. Executa checagens estritas e retorna status de cada objeto.
-- ============================================================================

DO $$
DECLARE
  v_missing_objects TEXT[] := ARRAY[]::TEXT[];
  v_rls_disabled TEXT[] := ARRAY[]::TEXT[];
  v_table_name TEXT;
  v_is_rls_enabled BOOLEAN;
BEGIN
  -- 1. Verificação de Tabelas Estruturais
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'documents') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.documents');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'condition_events') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.condition_events');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'medication_events') THEN
    v_missing_objects := array_append(v_missing_objects, 'TABELA: public.medication_events');
  END IF;

  -- 2. Verificação de Colunas Críticas
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'rejected_submission_events' AND column_name = 'clinical_record_id') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: rejected_submission_events.clinical_record_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conditions' AND column_name = 'clinical_record_id') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: conditions.clinical_record_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'conditions' AND column_name = 'version') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: conditions.version');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'medications' AND column_name = 'clinical_record_id') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: medications.clinical_record_id');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'medications' AND column_name = 'is_prescription') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: medications.is_prescription');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'medications' AND column_name = 'version') THEN
    v_missing_objects := array_append(v_missing_objects, 'COLUNA: medications.version');
  END IF;

  -- 3. Verificação de Funções RPC
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_submit_patient_vitals') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_submit_patient_vitals');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_confirm_clinical_record') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_confirm_clinical_record');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_reject_clinical_record') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_reject_clinical_record');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_lab_exam') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_lab_exam');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_request_representation') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_request_representation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_approve_representation') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_approve_representation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_reject_representation') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_reject_representation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_revoke_representation') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_revoke_representation');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_confirm_document') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_confirm_document');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_reject_document') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_reject_document');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_condition') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_condition');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_update_condition_status') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_update_condition_status');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_record_medication') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_record_medication');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'rpc_update_medication_status') THEN
    v_missing_objects := array_append(v_missing_objects, 'RPC: rpc_update_medication_status');
  END IF;

  -- 4. Verificação de Habilitação de RLS nas Tabelas
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

  -- 5. Avaliação Final
  IF array_length(v_missing_objects, 1) > 0 THEN
    RAISE EXCEPTION 'HOMOLOGAÇÃO INCOMPLETA. Objetos ausentes no banco: %', v_missing_objects;
  END IF;

  IF array_length(v_rls_disabled, 1) > 0 THEN
    RAISE EXCEPTION 'FALHA DE SEGURANÇA. Tabelas sem Row Level Security (RLS) habilitado: %', v_rls_disabled;
  END IF;

  RAISE NOTICE 'SUCESSO: Todos os objetos e políticas RLS das migrations 001 a 006 estão presentes, íntegros e protegidos!';
END $$;
