-- ============================================================================
-- NEFROHUB - MIGRATION 003: FEEDBACK DE REJEIÇÃO E GOVERNANÇA DE FILAS (FASE 3.3)
-- Idempotente e em conformidade estrita com documentation.md (Seções 6.5, 6.6 e 7.3)
-- ============================================================================

-- 1. Relacionamento opcional entre rejected_submission_events e clinical_records
DO $$ BEGIN
  ALTER TABLE public.rejected_submission_events
    ADD COLUMN IF NOT EXISTS clinical_record_id UUID REFERENCES public.clinical_records(id) ON DELETE SET NULL;
EXCEPTION WHEN undefined_table THEN null; END $$;

-- 2. Habilitação de RLS em rejected_submission_events e review_requests
ALTER TABLE IF EXISTS public.rejected_submission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_requests ENABLE ROW LEVEL SECURITY;

-- 3. Políticas RLS para rejected_submission_events
DROP POLICY IF EXISTS "rejected_events_select_policy" ON public.rejected_submission_events;
CREATE POLICY "rejected_events_select_policy" ON public.rejected_submission_events
  FOR SELECT
  TO authenticated
  USING (
    -- O autor da submissão pode ler seus próprios descartes
    submitted_by_user_id = auth.uid()
    -- O paciente afetado
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = rejected_submission_events.patient_id AND p.user_id = auth.uid()
    )
    -- O médico que revisou
    OR reviewed_by_user_id = auth.uid()
    -- Administrador
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

-- 4. Políticas RLS para review_requests
DROP POLICY IF EXISTS "review_requests_select_policy" ON public.review_requests;
CREATE POLICY "review_requests_select_policy" ON public.review_requests
  FOR SELECT
  TO authenticated
  USING (
    requested_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.patient_profiles p
      WHERE p.id = review_requests.patient_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "review_requests_admin_update" ON public.review_requests;
CREATE POLICY "review_requests_admin_update" ON public.review_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role = 'ADMIN'
    )
  );
