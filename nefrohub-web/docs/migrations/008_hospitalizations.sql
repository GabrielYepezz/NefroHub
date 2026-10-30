-- docs/migrations/008_hospitalizations.sql
-- ==============================================================================
-- Migration 008: Histórico de Internações Hospitalares (documentation.md Seção 8.8 - RF-056)
-- ==============================================================================
-- Descrição:
-- Cria a tabela hospitalizations para registro formal de internações com instituição,
-- datas de início/fim, motivo de admissão, CID-10, desfecho clínico e observações.
--
-- STATUS: LOCAL (NÃO APLICADA REMOTAMENTE SEM AUTORIZAÇÃO EXPLÍCITA)
-- ==============================================================================

-- 1. Criação do Enum para Desfechos Clínicos de Internação
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'hospitalization_outcome') THEN
    CREATE TYPE public.hospitalization_outcome AS ENUM (
      'ALTA_MELHORADA',
      'ALTA_A_PEDIDO',
      'TRANSFERENCIA',
      'OBITO',
      'EM_ANDAMENTO'
    );
  END IF;
END $$;

-- 2. Tabela de Internações Hospitalares
CREATE TABLE IF NOT EXISTS public.hospitalizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  institution_name VARCHAR(255) NOT NULL,
  admission_date DATE NOT NULL,
  discharge_date DATE,
  admission_reason TEXT NOT NULL,
  cid10 VARCHAR(10),
  outcome public.hospitalization_outcome NOT NULL DEFAULT 'EM_ANDAMENTO',
  clinical_notes TEXT,
  recorded_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  -- Restrição de consistência temporal: alta nunca pode ser anterior à admissão
  CONSTRAINT chk_hospitalization_dates CHECK (discharge_date IS NULL OR discharge_date >= admission_date)
);

-- 3. Índices de Desempenho e Busca Clínica
CREATE INDEX IF NOT EXISTS idx_hospitalizations_patient_id ON public.hospitalizations(patient_id);
CREATE INDEX IF NOT EXISTS idx_hospitalizations_admission_date ON public.hospitalizations(admission_date DESC);

-- 4. Habilitação de RLS
ALTER TABLE public.hospitalizations ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Segurança RLS (Zero-Trust)
-- Política de Leitura: Paciente lê as próprias internações; Médicos com vínculo ativo e Admins leem.
DROP POLICY IF EXISTS hospitalizations_select_policy ON public.hospitalizations;
CREATE POLICY hospitalizations_select_policy ON public.hospitalizations
FOR SELECT
TO authenticated
USING (
  (EXISTS (SELECT 1 FROM public.patient_profiles p WHERE p.id = hospitalizations.patient_id AND p.user_id = auth.uid()))
  OR public.patient_has_physician_link(patient_id, auth.uid())
  OR public.is_admin()
);

-- Política de Inserção: Médicos com vínculo ativo e Administradores
DROP POLICY IF EXISTS hospitalizations_insert_policy ON public.hospitalizations;
CREATE POLICY hospitalizations_insert_policy ON public.hospitalizations
FOR INSERT
TO authenticated
WITH CHECK (
  public.patient_has_physician_link(patient_id, auth.uid())
  OR public.is_admin()
);

-- Política de Atualização: Apenas o médico autor com vínculo ativo ou Admin
DROP POLICY IF EXISTS hospitalizations_update_policy ON public.hospitalizations;
CREATE POLICY hospitalizations_update_policy ON public.hospitalizations
FOR UPDATE
TO authenticated
USING (
  (recorded_by_user_id = auth.uid() AND public.patient_has_physician_link(patient_id, auth.uid()))
  OR public.is_admin()
);

COMMENT ON TABLE public.hospitalizations IS
'Histórico de internações hospitalares dos pacientes com motivo, CID-10 e desfecho (documentation.md Seção 8.8 - RF-056).';
