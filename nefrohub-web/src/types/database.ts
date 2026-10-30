// src/types/database.ts
// Tipos de Domínio do Banco de Dados NefroHub

export type UserRole =
  | 'ADMIN'
  | 'DOCTOR_MASTER'
  | 'DOCTOR'
  | 'PATIENT'
  | 'LEGAL_REPRESENTANT'

export type AccountStatus =
  | 'ACTIVE'
  | 'PENDING_APPROVAL'
  | 'SUSPENDED'
  | 'DEACTIVATED'

export type PatientStatus =
  | 'ACTIVE'
  | 'INACTIVE'
  | 'PENDING_REVIEW'

export type BiologicalSex = 'M' | 'F'

export type LinkStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ENDED'
  | 'REJECTED'

export type ClinicalRecordStatus =
  | 'DRAFT'
  | 'PENDING_VALIDATION'
  | 'CONFIRMED'
  | 'REJECTED'

export type CalculationRunType = 'SIMULATION' | 'CLINICAL_RECORD'

// ============================================================================
// 1. INFRAESTRUTURA E USUÁRIOS
// ============================================================================

export interface Institution {
  id: string
  name: string
  cnpj: string | null
  legal_name: string | null
  created_at: string
  updated_at: string
}

export interface CareUnit {
  id: string
  institution_id: string
  name: string
  code: string | null
  created_at: string
}

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  status: AccountStatus
  phone: string | null
  mfa_enabled: boolean
  created_at: string
  updated_at: string
}

// Entidade: Administrador (Perfil Operacional)
export interface AdminProfile {
  id: string
  user_id: string
  institution_id: string
  department: string | null
  access_level: string
  can_approve_doctors: boolean
  created_at: string
  updated_at: string
}

// Entidade: Médico
export interface PhysicianProfile {
  id: string
  user_id: string
  institution_id: string
  crm: string
  crm_uf: string
  specialty: string
  validation_status: 'PENDING' | 'VALIDATED' | 'REJECTED'
  is_master: boolean
  is_active: boolean
  validated_by_user_id: string | null
  validated_at: string | null
  created_at: string
  updated_at: string
}

// ============================================================================
// 2. PACIENTES E VÍNCULOS
// ============================================================================

export interface PatientProfile {
  id: string
  user_id: string | null
  institution_id: string
  care_unit_id: string | null
  full_name: string
  normalized_name: string
  birth_date: string // YYYY-MM-DD
  biological_sex: BiologicalSex
  cpf_encrypted: string | null
  cpf_masked: string | null
  cpf_hash: string | null
  cpf_hash_version: number
  cns: string | null
  medical_record_number: string | null
  phone: string | null
  email: string | null
  status: PatientStatus
  duplicate_check_flag: boolean
  created_by_user_id: string
  created_at: string
  updated_at: string
}

export interface PhysicianPatientLink {
  id: string
  patient_id: string
  physician_user_id: string
  status: LinkStatus
  is_primary: boolean
  reason?: string | null
  transition_id?: string | null
  created_by_user_id: string
  activated_at?: string | null
  ended_at?: string | null
  created_at: string
}

export interface PhysicianPatientLinkEvent {
  id: string
  link_id: string
  previous_status: LinkStatus | null
  next_status: LinkStatus
  action_by_user_id: string
  reason: string | null
  origin: string | null
  correlation_id: string | null
  created_at: string
}

export interface PatientRepresentation {
  id: string
  patient_id: string
  representative_user_id: string
  relationship_type: string
  authority_type: string
  scope: Record<string, unknown>
  proof_document_ref: string | null
  status: LinkStatus
  valid_from: string
  valid_until: string | null
  verified_by_user_id: string | null
  verified_at: string | null
  revoked_by_user_id: string | null
  revoked_at: string | null
  revocation_reason: string | null
  created_at: string
}

// ============================================================================
// 3. PRONTUÁRIO CLÍNICO E IMUTABILIDADE
// ============================================================================

export interface ClinicalRecord {
  id: string
  patient_id: string
  record_type:
    | 'LAB_RESULT'
    | 'VITAL_SIGNS'
    | 'CONDITION'
    | 'MEDICATION'
    | 'ALLERGY'
    | 'TREATMENT'
    | 'DIALYSIS_SESSION'
    | 'HOSPITALIZATION'
    | 'CALCULATION'
  status: ClinicalRecordStatus
  supersedes_record_id: string | null
  clinical_date: string
  created_by_user_id: string
  confirmed_by_user_id: string | null
  confirmed_at: string | null
  created_at: string
}

export interface ClinicalSubmissionRevision {
  id: string
  clinical_record_id: string
  field_name: string
  original_value: string
  adjusted_value: string
  reason: string
  changed_by_user_id: string
  changed_at: string
}

export interface ReviewRequest {
  id: string
  clinical_record_id: string
  patient_id: string
  requested_by_user_id: string
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  decided_by_user_id: string | null
  decision_reason: string | null
  decided_at: string | null
  created_at: string
}

export interface RejectedSubmissionEvent {
  id: string
  patient_id: string
  submitted_by_user_id: string
  reviewed_by_user_id: string
  record_type: string
  rejection_code: string
  rejection_reason: string | null
  disposal_status: string
  created_at: string
}

// ============================================================================
// 4. DADOS ESTRUTURADOS E CALCULADORAS
// ============================================================================

export interface LabResult {
  id: string
  clinical_record_id: string
  exam_name: string
  exam_code: string | null
  coding_system: string | null
  comparator: '<' | '<=' | '=' | '>=' | '>'
  numeric_value: number | null
  text_value: string | null
  original_unit: string
  normalized_value: number | null
  normalized_unit: string | null
  reference_range: string | null
  source_origin: string
  created_at: string
}

export interface VitalSign {
  id: string
  clinical_record_id: string
  sign_code: string
  numeric_value: number
  unit: string
  is_calculated: boolean
  created_at: string
}

export type ConditionStatus = 'ACTIVE' | 'RESOLVED' | 'INACTIVE'
export type MedicationStatus = 'ACTIVE' | 'SUSPENDED' | 'DISCONTINUED'

export interface Condition {
  id: string
  patient_id: string
  clinical_record_id?: string | null
  name: string
  cid10: string | null
  onset_date: string | null
  status: ConditionStatus
  notes: string | null
  created_by_user_id?: string | null
  validation_status?: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  version: number
  created_at: string
  updated_at?: string
}

export interface ConditionEvent {
  id: string
  condition_id: string
  previous_status: ConditionStatus | null
  next_status: ConditionStatus
  action_by_user_id: string
  reason: string | null
  created_at: string
}

export interface Medication {
  id: string
  patient_id: string
  clinical_record_id?: string | null
  name: string
  dosage: string | null
  unit: string | null
  route: string | null
  frequency: string | null
  start_date: string | null
  end_date: string | null
  status: MedicationStatus
  is_prescription: boolean
  notes: string | null
  created_by_user_id?: string | null
  validation_status?: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  version: number
  created_at: string
  updated_at?: string
}

export interface MedicationEvent {
  id: string
  medication_id: string
  previous_status: MedicationStatus | null
  next_status: MedicationStatus
  action_by_user_id: string
  reason: string | null
  created_at: string
}

export interface Allergy {
  id: string
  patient_id: string
  substance: string
  reaction: string | null
  severity: string | null
  status: 'KNOWN' | 'NO_KNOWN_ALLERGIES'
  created_at: string
}

export interface DialysisTreatment {
  id: string
  patient_id: string
  modality: 'HEMODIALYSIS' | 'PERITONEAL'
  frequency: string | null
  start_date: string
  end_date: string | null
  status: 'ACTIVE' | 'COMPLETED' | 'INTERRUPTED'
  created_at: string
}

export interface DialysisSession {
  id: string
  clinical_record_id: string
  treatment_id: string | null
  session_date: string
  modality: string
  duration_minutes: number | null
  weight_pre_kg: number | null
  weight_post_kg: number | null
  ultrafiltration_volume_liters: number | null
  bp_systolic_pre: number | null
  bp_diastolic_pre: number | null
  bp_systolic_post: number | null
  bp_diastolic_post: number | null
  notes: string | null
  created_at: string
}

export interface CalculationRun {
  id: string
  calculator_code: string
  formula_version: string
  run_type: CalculationRunType
  patient_id: string
  performed_by_user_id: string
  reference_date: string
  input_values: Record<string, unknown>
  input_units: Record<string, string>
  source_record_ids: string[] | null
  result_value: number
  result_unit: string
  rounding_rule_version: string | null
  clinical_notes: string | null
  executed_at: string
}

export interface AuditEvent {
  id: string
  user_id: string | null
  patient_id: string | null
  action: string
  resource: string
  result: 'SUCCESS' | 'FORBIDDEN' | 'ERROR'
  justification: string | null
  correlation_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// DTO de criação de paciente
export interface CreatePatientDTO {
  fullName: string
  birthDate: string
  biologicalSex: BiologicalSex
  cpf?: string
  phone?: string
  email?: string
  medicalRecordNumber?: string
  cns?: string
  careUnitId?: string
  primaryPhysicianUserId: string
}
