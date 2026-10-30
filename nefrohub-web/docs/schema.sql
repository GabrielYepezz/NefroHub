-- ============================================================================
-- NEFROHUB - SCHEMA CONSOLIDADO DO BANCO DE DADOS (POSTGRESQL / SUPABASE)
-- Conforme Especificação de Regras de Negócio (documentation.md - Seções 2 a 16)
-- ============================================================================

-- Habilitar extensões requeridas
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUMS DO SISTEMA
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'ADMIN',
    'DOCTOR_MASTER',
    'DOCTOR',
    'PATIENT',
    'LEGAL_REPRESENTANT'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM (
    'ACTIVE',
    'PENDING_APPROVAL',
    'SUSPENDED',
    'DEACTIVATED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_status AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'PENDING_REVIEW'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.biological_sex AS ENUM (
    'M',
    'F'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.link_status AS ENUM (
    'PENDING',
    'ACTIVE',
    'SUSPENDED',
    'ENDED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.clinical_record_status AS ENUM (
    'DRAFT',
    'PENDING_VALIDATION',
    'CONFIRMED',
    'REJECTED'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.calculation_run_type AS ENUM (
    'SIMULATION',
    'CLINICAL_RECORD'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================================
-- 2. INFRAESTRUTURA E ISOLAMENTO MULTI-INSTALAÇÃO (Seção 14.2)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.institutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(18) UNIQUE,
  legal_name VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.care_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inserção de instituição padrão para inicialização do sistema
INSERT INTO public.institutions (id, name, cnpj)
VALUES ('00000000-0000-0000-0000-000000000001', 'Hospital Central NefroHub', '00.000.000/0001-00')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 3. IDENTIDADE, AUTENTICAÇÃO E PERFIS OPERACIONAIS (Seção 2)
-- ============================================================================

-- Tabela Central de Usuários (Espelho de auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  role public.user_role NOT NULL DEFAULT 'PATIENT',
  status public.account_status NOT NULL DEFAULT 'ACTIVE',
  phone VARCHAR(20),
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Entidade: Administrador (Perfil Operacional - Seção 2.2)
CREATE TABLE IF NOT EXISTS public.admin_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  department VARCHAR(100),
  access_level VARCHAR(50) NOT NULL DEFAULT 'OPERATIONAL',
  can_approve_doctors BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Entidade: Médico / Clínico (Perfil Médico - Seções 2.3 e 2.4)
CREATE TABLE IF NOT EXISTS public.physician_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE RESTRICT,
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  crm VARCHAR(20) NOT NULL,
  crm_uf VARCHAR(2) NOT NULL,
  specialty VARCHAR(100) NOT NULL DEFAULT 'Nefrologia',
  validation_status VARCHAR(50) NOT NULL DEFAULT 'VALIDATED', -- PENDING, VALIDATED, REJECTED
  is_master BOOLEAN NOT NULL DEFAULT FALSE,                    -- DOCTOR_MASTER flag
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  validated_by_user_id UUID REFERENCES public.users(id),
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uq_physician_crm_uf UNIQUE (crm, crm_uf)
);

-- ============================================================================
-- 4. ENTIDADE PACIENTE (Seção 3)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE REFERENCES public.users(id) ON DELETE SET NULL, -- Paciente pode não ter conta própria
  institution_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,
  care_unit_id UUID REFERENCES public.care_units(id) ON DELETE SET NULL,
  
  full_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL, -- Minúsculas, sem acento para busca de homônimos
  birth_date DATE NOT NULL,
  biological_sex public.biological_sex NOT NULL,
  
  cpf_encrypted TEXT,
  cpf_masked VARCHAR(14),
  cpf_hash VARCHAR(64),
  cpf_hash_version INT DEFAULT 1,
  
  cns VARCHAR(15),
  medical_record_number VARCHAR(50),
  phone VARCHAR(20),
  email VARCHAR(255),
  
  status public.patient_status NOT NULL DEFAULT 'ACTIVE',
  duplicate_check_flag BOOLEAN NOT NULL DEFAULT FALSE,
  
  created_by_user_id UUID NOT NULL REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_profiles_cpf_hash 
  ON public.patient_profiles (cpf_hash, cpf_hash_version) 
  WHERE cpf_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_profiles_dedup_name_dob 
  ON public.patient_profiles (normalized_name, birth_date);

-- ============================================================================
-- 5. RELAÇÕES: VÍNCULOS MÉDICO-PACIENTE E REPRESENTAÇÃO (Seções 4 e 5)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.physician_patient_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  physician_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status public.link_status NOT NULL DEFAULT 'PENDING',
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  transition_id UUID,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id),
  activated_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Apenas um médico responsável ativo com is_primary=true por paciente
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_primary_physician 
  ON public.physician_patient_links (patient_id) 
  WHERE status = 'ACTIVE' AND is_primary = TRUE;

-- Eventos de Transição de Vínculo (Auditoria Obrigatória de Vínculo - Seção 4.3)
CREATE TABLE IF NOT EXISTS public.physician_patient_link_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id UUID NOT NULL REFERENCES public.physician_patient_links(id) ON DELETE RESTRICT,
  previous_status public.link_status,
  next_status public.link_status NOT NULL,
  action_by_user_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT,
  origin VARCHAR(100),
  correlation_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Representantes Legais e Cuidadores (Seção 5)
CREATE TABLE IF NOT EXISTS public.patient_representations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  representative_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  relationship_type VARCHAR(50) NOT NULL,
  authority_type VARCHAR(50) NOT NULL,
  scope JSONB NOT NULL,
  proof_document_ref TEXT,
  status public.link_status NOT NULL DEFAULT 'PENDING',
  valid_from DATE NOT NULL,
  valid_until DATE,
  verified_by_user_id UUID REFERENCES public.users(id),
  verified_at TIMESTAMPTZ,
  revoked_by_user_id UUID REFERENCES public.users(id),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 6. PRONTUÁRIO CLÍNICO CENTRAL E IMUTABILIDADE (Seção 6)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.clinical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  record_type VARCHAR(50) NOT NULL, -- LAB_RESULT, VITAL_SIGNS, CONDITION, MEDICATION, DIALYSIS, CALCULATION
  status public.clinical_record_status NOT NULL DEFAULT 'DRAFT',
  supersedes_record_id UUID REFERENCES public.clinical_records(id), -- Encadeamento imutável de versão
  clinical_date DATE NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES public.users(id),
  confirmed_by_user_id UUID REFERENCES public.users(id),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_clinical_records_patient_date 
  ON public.clinical_records (patient_id, clinical_date DESC);

-- TRIGGER DE IMUTABILIDADE: Impede UPDATE e DELETE em registros CONFIRMED (Seção 6.2)
CREATE OR REPLACE FUNCTION public.check_clinical_record_immutability()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'CONFIRMED' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Violação de Imutabilidade: Registros clínicos com status CONFIRMED não podem ser excluídos.';
    ELSIF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Violação de Imutabilidade: Registros clínicos confirmados são estritamente imutáveis. Crie uma nova versão referenciando supersedes_record_id.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinical_record_immutability ON public.clinical_records;
CREATE TRIGGER trg_clinical_record_immutability
BEFORE UPDATE OR DELETE ON public.clinical_records
FOR EACH ROW EXECUTE FUNCTION public.check_clinical_record_immutability();

-- Histórico de Ajustes Pré-Confirmação pelo Médico (Seção 6.4)
CREATE TABLE IF NOT EXISTS public.clinical_submission_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE RESTRICT,
  field_name VARCHAR(100) NOT NULL,
  original_value TEXT NOT NULL,
  adjusted_value TEXT NOT NULL,
  reason TEXT NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Solicitações de Correção Pós-Confirmação (Seção 6.6)
CREATE TABLE IF NOT EXISTS public.review_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID NOT NULL REFERENCES public.clinical_records(id),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id),
  requested_by_user_id UUID NOT NULL REFERENCES public.users(id),
  reason TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
  decided_by_user_id UUID REFERENCES public.users(id),
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Evidência Mínima de Submissões Rejeitadas (Seção 6.5)
CREATE TABLE IF NOT EXISTS public.rejected_submission_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id),
  submitted_by_user_id UUID NOT NULL REFERENCES public.users(id),
  reviewed_by_user_id UUID NOT NULL REFERENCES public.users(id),
  record_type VARCHAR(50) NOT NULL,
  rejection_code VARCHAR(50) NOT NULL, -- INVALID_VALUE, DUPLICATE, UNREADABLE, INCOMPLETE, OTHER
  rejection_reason TEXT,
  disposal_status VARCHAR(50) NOT NULL DEFAULT 'PENDING_DISPOSAL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 7. TABELAS DE DADOS CLÍNICOS E LABORATORIAIS (Seção 8)
-- ============================================================================

-- Exames Laboratoriais Estruturados (Creatinina, Ureia, Potássio, etc.)
CREATE TABLE IF NOT EXISTS public.lab_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  exam_name VARCHAR(100) NOT NULL,
  exam_code VARCHAR(50),
  coding_system VARCHAR(50), -- LOINC, TUSS
  comparator VARCHAR(2) DEFAULT '=', -- <, <=, =, >=, >
  numeric_value NUMERIC(12, 4),
  text_value TEXT,
  original_unit VARCHAR(50) NOT NULL,
  normalized_value NUMERIC(12, 4),
  normalized_unit VARCHAR(50),
  reference_range VARCHAR(100),
  source_origin VARCHAR(50) NOT NULL, -- LAB_REPORT, MANUAL_INPUT, PATIENT_FORM
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Sinais Vitais (Pressão Arterial, Peso, Altura, IMC, etc.)
CREATE TABLE IF NOT EXISTS public.vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  sign_code VARCHAR(50) NOT NULL, -- BP_SYSTOLIC, BP_DIASTOLIC, WEIGHT, HEIGHT, BMI, HEART_RATE
  numeric_value NUMERIC(10, 2) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  is_calculated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Doenças e Comorbidades
CREATE TABLE IF NOT EXISTS public.conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  name VARCHAR(255) NOT NULL,
  cid10 VARCHAR(10),
  onset_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, RESOLVED, INACTIVE
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Medicamentos
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

-- Alergias
CREATE TABLE IF NOT EXISTS public.allergies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  substance VARCHAR(255) NOT NULL,
  reaction VARCHAR(255),
  severity VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'KNOWN', -- KNOWN, NO_KNOWN_ALLERGIES
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Diálise (Tratamento Longitudinal e Sessões)
CREATE TABLE IF NOT EXISTS public.dialysis_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  modality VARCHAR(50) NOT NULL, -- HEMODIALYSIS, PERITONEAL
  frequency VARCHAR(50),
  start_date DATE NOT NULL,
  end_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.dialysis_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_record_id UUID NOT NULL REFERENCES public.clinical_records(id) ON DELETE CASCADE,
  treatment_id UUID REFERENCES public.dialysis_treatments(id) ON DELETE SET NULL,
  session_date DATE NOT NULL,
  modality VARCHAR(50) NOT NULL,
  duration_minutes INT,
  weight_pre_kg NUMERIC(6, 2),
  weight_post_kg NUMERIC(6, 2),
  ultrafiltration_volume_liters NUMERIC(6, 3),
  bp_systolic_pre INT,
  bp_diastolic_pre INT,
  bp_systolic_post INT,
  bp_diastolic_post INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 8. CALCULADORAS CLÍNICAS NEFROLÓGICAS (Seção 10)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calculation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  calculator_code VARCHAR(50) NOT NULL, -- CKD_EPI_2021, COCKCROFT_GAULT, BMI, KFRE, KT_V
  formula_version VARCHAR(20) NOT NULL,
  run_type public.calculation_run_type NOT NULL DEFAULT 'SIMULATION',
  patient_id UUID NOT NULL REFERENCES public.patient_profiles(id) ON DELETE RESTRICT,
  performed_by_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reference_date DATE NOT NULL,
  input_values JSONB NOT NULL,
  input_units JSONB NOT NULL,
  source_record_ids UUID[],
  result_value NUMERIC(12, 4) NOT NULL,
  result_unit VARCHAR(50) NOT NULL,
  rounding_rule_version VARCHAR(20),
  clinical_notes TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ============================================================================
-- 9. AUDITORIA APPEND-ONLY E GOVERNANÇA (Seção 13 e 15.4)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id),
  patient_id UUID REFERENCES public.patient_profiles(id),
  action VARCHAR(100) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  result VARCHAR(50) NOT NULL, -- SUCCESS, FORBIDDEN, ERROR
  justification TEXT,
  correlation_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Trigger para bloquear qualquer exclusão ou alteração de logs de auditoria (Append-only estrito)
CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Segurança de Auditoria: Eventos de auditoria são append-only e não podem ser modificados ou deletados.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON public.audit_events;
CREATE TRIGGER trg_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- ============================================================================
-- 10. TRIGGER PARA CRIAR USUÁRIO AUTOMATICAMENTE A PARTIR DE AUTH.USERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_role public.user_role;
  v_name text;
BEGIN
  -- Normaliza o papel vindo dos metadados
  v_role := COALESCE(
    (CASE UPPER(NEW.raw_user_meta_data->>'role')
      WHEN 'ADMIN' THEN 'ADMIN'::public.user_role
      WHEN 'DOCTOR_MASTER' THEN 'DOCTOR_MASTER'::public.user_role
      WHEN 'DOCTOR' THEN 'DOCTOR'::public.user_role
      WHEN 'PATIENT' THEN 'PATIENT'::public.user_role
      WHEN 'LEGAL_REPRESENTANT' THEN 'LEGAL_REPRESENTANT'::public.user_role
      ELSE 'PATIENT'::public.user_role
    END),
    'PATIENT'::public.user_role
  );

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.users (
    id,
    email,
    name,
    role,
    status,
    phone,
    created_at,
    updated_at
  ) VALUES (
    NEW.id,
    NEW.email,
    v_name,
    v_role,
    'ACTIVE'::public.account_status,
    NEW.raw_user_meta_data->>'phone',
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- Se for ADMIN, cria o perfil operacional de admin se não existir
  IF v_role = 'ADMIN' THEN
    INSERT INTO public.admin_profiles (user_id, institution_id, department)
    VALUES (NEW.id, '00000000-0000-0000-0000-000000000001', 'Diretoria Clínica/Administração')
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT OR UPDATE ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
