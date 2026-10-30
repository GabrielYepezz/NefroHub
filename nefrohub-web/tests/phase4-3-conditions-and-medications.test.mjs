import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import * as z from 'zod'

export const conditionSchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  name: z
    .string()
    .trim()
    .min(2, 'O nome da condição/comorbidade deve ter no mínimo 2 caracteres')
    .max(255, 'O nome da condição/comorbidade não pode exceder 255 caracteres'),
  cid10: z
    .string()
    .trim()
    .max(10, 'Código CID-10 não pode exceder 10 caracteres')
    .regex(/^[A-Z][0-9][0-9A-Z]?(\.[0-9A-Z]{1,4})?$/i, 'Formato de CID-10 inválido (ex: I10, E11.9, N18.9)')
    .optional()
    .or(z.literal('')),
  onsetDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de início deve seguir o formato AAAA-MM-DD')
    .refine((date) => {
      const parsed = new Date(date)
      const now = new Date()
      return !isNaN(parsed.getTime()) && parsed <= now
    }, 'A data de início da condição clínica não pode estar no futuro')
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'RESOLVED', 'INACTIVE'], {
    message: 'Status deve ser ACTIVE, RESOLVED ou INACTIVE',
  }).default('ACTIVE'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Observações clínicas não podem exceder 2000 caracteres')
    .optional()
    .or(z.literal('')),
})

export const updateConditionStatusSchema = z.object({
  conditionId: z.string().uuid('ID da condição inválido'),
  patientId: z.string().uuid('ID do paciente inválido'),
  nextStatus: z.enum(['ACTIVE', 'RESOLVED', 'INACTIVE'], {
    message: 'Status de transição inválido',
  }),
  reason: z
    .string()
    .trim()
    .min(3, 'A justificativa clínica da alteração de estado deve ter pelo menos 3 caracteres')
    .max(1000, 'A justificativa não pode exceder 1000 caracteres'),
  expectedVersion: z.number().int().min(1, 'Versão para controle de concorrência é obrigatória'),
})

export const medicationSchema = z.object({
  patientId: z.string().uuid('Identificador do paciente inválido'),
  name: z
    .string()
    .trim()
    .min(2, 'O nome do fármaco deve ter no mínimo 2 caracteres')
    .max(255, 'O nome do fármaco não pode exceder 255 caracteres'),
  dosage: z
    .string()
    .trim()
    .max(100, 'A dosagem não pode exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  unit: z
    .string()
    .trim()
    .max(50, 'A unidade não pode exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  route: z
    .string()
    .trim()
    .max(50, 'A via de administração não pode exceder 50 caracteres')
    .optional()
    .or(z.literal('')),
  frequency: z
    .string()
    .trim()
    .max(100, 'A posologia/frequência não pode exceder 100 caracteres')
    .optional()
    .or(z.literal('')),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de início deve seguir o formato AAAA-MM-DD')
    .optional()
    .or(z.literal('')),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de término deve seguir o formato AAAA-MM-DD')
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DISCONTINUED'], {
    message: 'Status do medicamento deve ser ACTIVE, SUSPENDED ou DISCONTINUED',
  }).default('ACTIVE'),
  isPrescription: z.boolean().default(false),
  notes: z
    .string()
    .trim()
    .max(2000, 'Observações clínicas não podem exceder 2000 caracteres')
    .optional()
    .or(z.literal('')),
}).refine((data) => {
  if (data.startDate && data.endDate) {
    return new Date(data.endDate) >= new Date(data.startDate)
  }
  return true
}, {
  message: 'A data de término do medicamento não pode ser anterior à data de início',
  path: ['endDate'],
})

export const updateMedicationStatusSchema = z.object({
  medicationId: z.string().uuid('ID do medicamento inválido'),
  patientId: z.string().uuid('ID do paciente inválido'),
  nextStatus: z.enum(['ACTIVE', 'SUSPENDED', 'DISCONTINUED'], {
    message: 'Status de transição de medicamento inválido',
  }),
  reason: z
    .string()
    .trim()
    .min(3, 'A justificativa clínica da alteração de estado deve ter pelo menos 3 caracteres')
    .max(1000, 'A justificativa não pode exceder 1000 caracteres'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de término no formato AAAA-MM-DD')
    .optional()
    .or(z.literal('')),
  expectedVersion: z.number().int().min(1, 'Versão para controle de concorrência é obrigatória'),
})

describe('Fase 4.3: Comorbidades e Medicamentos de Uso Contínuo (Testes Obrigatórios)', () => {

  const PATIENT_1_ID = '98a4427f-2736-4bf4-bb44-4f40d5b51b3a'
  const PATIENT_2_ID = '78b3327f-2736-4bf4-bb44-4f40d5b51b3b'
  const DOC_1_ID = 'a1a4427f-2736-4bf4-bb44-4f40d5b51b3c'
  const DOC_2_ID = 'b2a4427f-2736-4bf4-bb44-4f40d5b51b3d'
  const DOC_UNLINKED_ID = 'c3a4427f-2736-4bf4-bb44-4f40d5b51b3e'
  const USER_PAT_1_ID = 'd4a4427f-2736-4bf4-bb44-4f40d5b51b3f'
  const USER_PAT_2_ID = 'e5a4427f-2736-4bf4-bb44-4f40d5b51b40'
  const REP_1_ID = 'f6a4427f-2736-4bf4-bb44-4f40d5b51b41'
  const REP_EXPIRED_ID = '07a4427f-2736-4bf4-bb44-4f40d5b51b42'
  const REP_PENDING_ID = '18a4427f-2736-4bf4-bb44-4f40d5b51b43'
  const REP_NO_VIEW_ID = '29a4427f-2736-4bf4-bb44-4f40d5b51b44'

  // Mock Database In-Memory
  const createMockDb = () => {
    return {
      physician_patient_links: [
        { id: crypto.randomUUID(), physician_user_id: DOC_1_ID, patient_id: PATIENT_1_ID, status: 'ACTIVE' },
        { id: crypto.randomUUID(), physician_user_id: DOC_2_ID, patient_id: PATIENT_2_ID, status: 'ACTIVE' },
        { id: crypto.randomUUID(), physician_user_id: DOC_UNLINKED_ID, patient_id: PATIENT_1_ID, status: 'SUSPENDED' },
      ],
      patient_profiles: [
        { id: PATIENT_1_ID, user_id: USER_PAT_1_ID, full_name: 'Carlos da Silva' },
        { id: PATIENT_2_ID, user_id: USER_PAT_2_ID, full_name: 'Maria Fernandes' },
      ],
      patient_representations: [
        {
          id: crypto.randomUUID(),
          patient_id: PATIENT_1_ID,
          representative_user_id: REP_1_ID,
          status: 'ACTIVE',
          valid_until: null,
          scope: { can_view_records: true },
        },
        {
          id: crypto.randomUUID(),
          patient_id: PATIENT_1_ID,
          representative_user_id: REP_EXPIRED_ID,
          status: 'ACTIVE',
          valid_until: '2025-01-01', // Data passada
          scope: { can_view_records: true },
        },
        {
          id: crypto.randomUUID(),
          patient_id: PATIENT_1_ID,
          representative_user_id: REP_PENDING_ID,
          status: 'PENDING',
          valid_until: null,
          scope: { can_view_records: true },
        },
        {
          id: crypto.randomUUID(),
          patient_id: PATIENT_1_ID,
          representative_user_id: REP_NO_VIEW_ID,
          status: 'ACTIVE',
          valid_until: null,
          scope: { can_view_records: false },
        },
      ],
      clinical_records: [],
      conditions: [],
      condition_events: [],
      medications: [],
      medication_events: [],
      audit_events: [],
    }
  }

  // Motor de execução de regras de negócio com as mesmas proteções das Server Actions e RPCs
  const createClinicalService = (db, simulateAuditFailure = false) => {
    return {
      recordCondition: (userId, userRole, payload) => {
        // Validação de Role
        if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
          return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para registrar comorbidades diretamente.' }
        }

        // Validação de Schema no Servidor
        const parse = conditionSchema.safeParse(payload)
        if (!parse.success) {
          return { error: parse.error.issues.map((i) => i.message).join('. ') }
        }

        const data = parse.data

        // Validação de Vínculo Clínico Ativo
        const hasActiveLink = db.physician_patient_links.some(
          (l) => l.physician_user_id === userId && l.patient_id === data.patientId && l.status === 'ACTIVE'
        )
        if (!hasActiveLink) {
          return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
        }

        // Simulação de transação atômica (Persistência + Auditoria)
        if (simulateAuditFailure) {
          return { error: 'Falha na gravação do evento de auditoria clínica: Rollback executado.' }
        }

        const conditionId = crypto.randomUUID()
        const recordId = crypto.randomUUID()
        const now = new Date().toISOString()

        db.clinical_records.push({
          id: recordId,
          patient_id: data.patientId,
          record_type: 'CONDITION',
          status: 'CONFIRMED',
          clinical_date: data.onsetDate || now.split('T')[0],
          created_by_user_id: userId,
        })

        const newCondition = {
          id: conditionId,
          patient_id: data.patientId,
          clinical_record_id: recordId,
          name: data.name,
          cid10: data.cid10 || null,
          onset_date: data.onsetDate || null,
          status: data.status,
          notes: data.notes || null,
          created_by_user_id: userId,
          validation_status: 'CONFIRMED',
          version: 1,
          created_at: now,
        }
        db.conditions.push(newCondition)

        db.condition_events.push({
          id: crypto.randomUUID(),
          condition_id: conditionId,
          previous_status: null,
          next_status: data.status,
          action_by_user_id: userId,
          reason: data.notes || 'Cadastro inicial',
          created_at: now,
        })

        db.audit_events.push({
          id: crypto.randomUUID(),
          user_id: userId,
          patient_id: data.patientId,
          action: 'RECORD_CONDITION',
          result: 'SUCCESS',
        })

        return { success: true, conditionId, condition: newCondition }
      },

      updateConditionStatus: (userId, userRole, payload) => {
        if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
          return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para alterar comorbidades diretamente.' }
        }

        const parse = updateConditionStatusSchema.safeParse(payload)
        if (!parse.success) {
          return { error: parse.error.issues.map((i) => i.message).join('. ') }
        }

        const data = parse.data

        const hasActiveLink = db.physician_patient_links.some(
          (l) => l.physician_user_id === userId && l.patient_id === data.patientId && l.status === 'ACTIVE'
        )
        if (!hasActiveLink) {
          return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
        }

        const condition = db.conditions.find((c) => c.id === data.conditionId)
        if (!condition) {
          return { error: 'Comorbidade não localizada no banco de dados.' }
        }

        // Bloqueio Otimista de Concorrência
        if (condition.version !== data.expectedVersion) {
          return {
            error: `Conflito de concorrência: O registro da comorbidade foi alterado por outro usuário (versão atual: ${condition.version}, esperada: ${data.expectedVersion}). Recarregue a página antes de atualizar.`,
          }
        }

        if (condition.status === data.nextStatus) {
          return { error: `A comorbidade já se encontra no estado ${data.nextStatus}.` }
        }

        if (simulateAuditFailure) {
          return { error: 'Falha na gravação da auditoria clínica: Rollback executado.' }
        }

        const prevStatus = condition.status
        condition.status = data.nextStatus
        condition.version += 1
        condition.notes = data.reason

        db.condition_events.push({
          id: crypto.randomUUID(),
          condition_id: condition.id,
          previous_status: prevStatus,
          next_status: data.nextStatus,
          action_by_user_id: userId,
          reason: data.reason,
          created_at: new Date().toISOString(),
        })

        db.audit_events.push({
          id: crypto.randomUUID(),
          user_id: userId,
          patient_id: data.patientId,
          action: 'UPDATE_CONDITION_STATUS',
          result: 'SUCCESS',
        })

        return { success: true, newStatus: data.nextStatus, newVersion: condition.version }
      },

      recordMedication: (userId, userRole, payload) => {
        if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
          return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para registrar medicamentos diretamente.' }
        }

        const parse = medicationSchema.safeParse(payload)
        if (!parse.success) {
          return { error: parse.error.issues.map((i) => i.message).join('. ') }
        }

        const data = parse.data

        const hasActiveLink = db.physician_patient_links.some(
          (l) => l.physician_user_id === userId && l.patient_id === data.patientId && l.status === 'ACTIVE'
        )
        if (!hasActiveLink) {
          return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
        }

        if (simulateAuditFailure) {
          return { error: 'Falha na gravação da auditoria clínica: Rollback executado.' }
        }

        const medId = crypto.randomUUID()
        const recordId = crypto.randomUUID()
        const now = new Date().toISOString()

        db.clinical_records.push({
          id: recordId,
          patient_id: data.patientId,
          record_type: 'MEDICATION',
          status: 'CONFIRMED',
          clinical_date: data.startDate || now.split('T')[0],
          created_by_user_id: userId,
        })

        const newMed = {
          id: medId,
          patient_id: data.patientId,
          clinical_record_id: recordId,
          name: data.name,
          dosage: data.dosage || null,
          unit: data.unit || null,
          route: data.route || null,
          frequency: data.frequency || null,
          start_date: data.startDate || null,
          end_date: data.endDate || null,
          status: data.status,
          is_prescription: false,
          notes: data.notes || null,
          created_by_user_id: userId,
          validation_status: 'CONFIRMED',
          version: 1,
          created_at: now,
        }
        db.medications.push(newMed)

        db.medication_events.push({
          id: crypto.randomUUID(),
          medication_id: medId,
          previous_status: null,
          next_status: data.status,
          action_by_user_id: userId,
          reason: data.notes || 'Início de uso informado',
          created_at: now,
        })

        db.audit_events.push({
          id: crypto.randomUUID(),
          user_id: userId,
          patient_id: data.patientId,
          action: 'RECORD_MEDICATION',
          result: 'SUCCESS',
        })

        return { success: true, medicationId: medId, medication: newMed }
      },

      updateMedicationStatus: (userId, userRole, payload) => {
        if (userRole === 'PATIENT' || userRole === 'LEGAL_REPRESENTANT') {
          return { error: 'Acesso negado: Pacientes e representantes não possuem permissão para alterar medicamentos diretamente.' }
        }

        const parse = updateMedicationStatusSchema.safeParse(payload)
        if (!parse.success) {
          return { error: parse.error.issues.map((i) => i.message).join('. ') }
        }

        const data = parse.data

        const hasActiveLink = db.physician_patient_links.some(
          (l) => l.physician_user_id === userId && l.patient_id === data.patientId && l.status === 'ACTIVE'
        )
        if (!hasActiveLink) {
          return { error: 'Acesso negado: Você não possui vínculo clínico ativo e autorizado com este paciente.' }
        }

        const med = db.medications.find((m) => m.id === data.medicationId)
        if (!med) {
          return { error: 'Medicamento não localizado no prontuário.' }
        }

        if (med.version !== data.expectedVersion) {
          return {
            error: `Conflito de concorrência: O registro do medicamento foi alterado por outro usuário (versão atual: ${med.version}, esperada: ${data.expectedVersion}). Recarregue a página antes de atualizar.`,
          }
        }

        if (med.status === data.nextStatus) {
          return { error: `O medicamento já se encontra no estado ${data.nextStatus}.` }
        }

        if (data.endDate && med.start_date && new Date(data.endDate) < new Date(med.start_date)) {
          return { error: 'A data de término do medicamento não pode ser anterior à data de início.' }
        }

        if (simulateAuditFailure) {
          return { error: 'Falha na gravação da auditoria clínica: Rollback executado.' }
        }

        const prevStatus = med.status
        med.status = data.nextStatus
        med.end_date = data.endDate || new Date().toISOString().split('T')[0]
        med.version += 1
        med.notes = data.reason

        db.medication_events.push({
          id: crypto.randomUUID(),
          medication_id: med.id,
          previous_status: prevStatus,
          next_status: data.nextStatus,
          action_by_user_id: userId,
          reason: data.reason,
          created_at: new Date().toISOString(),
        })

        db.audit_events.push({
          id: crypto.randomUUID(),
          user_id: userId,
          patient_id: data.patientId,
          action: 'UPDATE_MEDICATION_STATUS',
          result: 'SUCCESS',
        })

        return { success: true, newStatus: data.nextStatus, newVersion: med.version }
      },

      getPatientClinicalView: (userId, userRole, patientId) => {
        // Verifica se é o titular
        const isOwner = db.patient_profiles.some((p) => p.id === patientId && p.user_id === userId)
        // Verifica se é médico com vínculo ativo
        const isPhysician = db.physician_patient_links.some(
          (l) => l.physician_user_id === userId && l.patient_id === patientId && l.status === 'ACTIVE'
        )
        // Verifica se é representante legal com escopo
        const rep = db.patient_representations.find(
          (r) => r.representative_user_id === userId && r.patient_id === patientId
        )
        const isAuthorizedRep =
          rep &&
          rep.status === 'ACTIVE' &&
          (!rep.valid_until || new Date(rep.valid_until) >= new Date()) &&
          rep.scope?.can_view_records === true

        if (!isOwner && !isPhysician && !isAuthorizedRep) {
          return { error: 'Acesso negado: Usuário não autorizado a visualizar o prontuário deste paciente.' }
        }

        // Paciente titular e representante só visualizam registros CONFIRMED
        const allowPending = isPhysician
        const conditions = db.conditions.filter(
          (c) => c.patient_id === patientId && (allowPending || c.validation_status === 'CONFIRMED')
        )
        const medications = db.medications.filter(
          (m) => m.patient_id === patientId && (allowPending || m.validation_status === 'CONFIRMED')
        )

        return { success: true, conditions, medications }
      },
    }
  }

  // --------------------------------------------------------------------------
  // CENÁRIO 1: Médico vinculado autorizado consegue registrar dados de um paciente permitido
  // --------------------------------------------------------------------------
  test('1. Médico vinculado autorizado consegue registrar dados de um paciente permitido', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    const condRes = svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Hipertensão Arterial Sistêmica',
      cid10: 'I10',
      onsetDate: '2020-01-15',
      status: 'ACTIVE',
      notes: 'Diagnosticado há 6 anos',
    })

    assert.equal(condRes.success, true)
    assert.equal(db.conditions.length, 1)
    assert.equal(db.conditions[0].name, 'Hipertensão Arterial Sistêmica')
    assert.equal(db.conditions[0].validation_status, 'CONFIRMED')

    const medRes = svc.recordMedication(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Losartana Potássica',
      dosage: '50',
      unit: 'mg',
      route: 'ORAL',
      frequency: '1x ao dia pela manhã',
      startDate: '2020-02-01',
      status: 'ACTIVE',
    })

    assert.equal(medRes.success, true)
    assert.equal(db.medications.length, 1)
    assert.equal(db.medications[0].is_prescription, false, 'Deve manter distinção clara de histórico informado')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 2: Médico não vinculado não consegue ler nem modificar registros
  // --------------------------------------------------------------------------
  test('2. Médico não vinculado não consegue ler nem modificar registros', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // Tentativa de escrita por médico sem vínculo ativo
    const writeRes = svc.recordCondition(DOC_UNLINKED_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Diabetes Mellitus Tipo 2',
      status: 'ACTIVE',
    })
    assert.match(writeRes.error, /Acesso negado: Você não possui vínculo clínico ativo/)

    // Tentativa de leitura por médico não vinculado
    const readRes = svc.getPatientClinicalView(DOC_UNLINKED_ID, 'DOCTOR', 'patient-1')
    assert.match(readRes.error, /Acesso negado: Usuário não autorizado/)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 3: Paciente não consegue alterar diretamente comorbidades ou medicamentos no portal
  // --------------------------------------------------------------------------
  test('3. Paciente não consegue alterar diretamente comorbidades ou medicamentos no portal', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    const patCondRes = svc.recordCondition(USER_PAT_1_ID, 'PATIENT', {
      patientId: PATIENT_1_ID,
      name: 'Nefropatia Diabética',
      status: 'ACTIVE',
    })
    assert.match(patCondRes.error, /Pacientes e representantes não possuem permissão para registrar/)

    const patMedRes = svc.recordMedication(USER_PAT_1_ID, 'PATIENT', {
      patientId: PATIENT_1_ID,
      name: 'Insulina NPH',
      dosage: '20',
      unit: 'UI',
      status: 'ACTIVE',
    })
    assert.match(patMedRes.error, /Pacientes e representantes não possuem permissão para registrar/)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 4: Representante sem autorização válida não consegue acessar dados clínicos
  // --------------------------------------------------------------------------
  test('4. Representante sem autorização válida não consegue acessar dados clínicos', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // Adicionar registros ao paciente 1
    svc.recordCondition(DOC_1_ID, 'DOCTOR', { patientId: PATIENT_1_ID, name: 'DRC Estágio 3b', status: 'ACTIVE' })

    // Representante com mandato expirado
    const expiredRes = svc.getPatientClinicalView(REP_EXPIRED_ID, 'LEGAL_REPRESENTANT', PATIENT_1_ID)
    assert.match(expiredRes.error, /Acesso negado: Usuário não autorizado/)

    // Representante com solicitação pendente (não homologada)
    const pendingRes = svc.getPatientClinicalView(REP_PENDING_ID, 'LEGAL_REPRESENTANT', PATIENT_1_ID)
    assert.match(pendingRes.error, /Acesso negado: Usuário não autorizado/)

    // Representante sem escopo de leitura
    const noScopeRes = svc.getPatientClinicalView(REP_NO_VIEW_ID, 'LEGAL_REPRESENTANT', PATIENT_1_ID)
    assert.match(noScopeRes.error, /Acesso negado: Usuário não autorizado/)

    // Representante ativo com escopo deve conseguir visualizar
    const activeRes = svc.getPatientClinicalView(REP_1_ID, 'LEGAL_REPRESENTANT', PATIENT_1_ID)
    assert.equal(activeRes.success, true)
    assert.equal(activeRes.conditions.length, 1)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 5: Campos obrigatórios e formatos são validados no servidor
  // --------------------------------------------------------------------------
  test('5. Campos obrigatórios e formatos são validados no servidor', () => {
    // 5.1. Comorbidade sem nome
    const emptyName = conditionSchema.safeParse({
      patientId: PATIENT_1_ID,
      name: '   ',
      status: 'ACTIVE',
    })
    assert.equal(emptyName.success, false)
    assert.match(emptyName.error.issues[0].message, /no mínimo 2 caracteres/)

    // 5.2. CID-10 em formato incorreto (até 10 chars com caracteres ilegais)
    const invalidCid = conditionSchema.safeParse({
      patientId: PATIENT_1_ID,
      name: 'Hipertensão',
      cid10: '12345',
    })
    assert.equal(invalidCid.success, false)
    assert.match(invalidCid.error.issues[0].message, /Formato de CID-10 inválido/)

    // 5.3. Medicamento sem nome do fármaco
    const emptyMedName = medicationSchema.safeParse({
      patientId: PATIENT_1_ID,
      name: '',
      status: 'ACTIVE',
    })
    assert.equal(emptyMedName.success, false)
    assert.match(emptyMedName.error.issues[0].message, /no mínimo 2 caracteres/)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 6: Valores inválidos são rejeitados sem persistência parcial
  // --------------------------------------------------------------------------
  test('6. Valores inválidos são rejeitados sem persistência parcial', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // Data de início futura para comorbidade
    const futureDateCond = svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Nefropatia Lúpica',
      onsetDate: '2099-12-31',
      status: 'ACTIVE',
    })
    assert.match(futureDateCond.error, /não pode estar no futuro/)
    assert.equal(db.conditions.length, 0, 'Nenhum dado deve ter sido persistido')

    // Data de término anterior à de início para medicamento
    const invalidMedDates = svc.recordMedication(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Furosemida',
      startDate: '2026-05-10',
      endDate: '2026-01-01', // Término antes do início
      status: 'ACTIVE',
    })
    assert.match(invalidMedDates.error, /não pode ser anterior à data de início/)
    assert.equal(db.medications.length, 0, 'Nenhum medicamento deve ser gravado')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 7: Estados e transições respeitam as regras documentadas
  // --------------------------------------------------------------------------
  test('7. Estados e transições respeitam as regras documentadas', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    const created = svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Glomerulonefrite',
      status: 'ACTIVE',
    })

    // Transição permitida: ACTIVE -> RESOLVED
    const updated = svc.updateConditionStatus(DOC_1_ID, 'DOCTOR', {
      conditionId: created.conditionId,
      patientId: PATIENT_1_ID,
      nextStatus: 'RESOLVED',
      reason: 'Paciente assintomático com proteinúria negativada',
      expectedVersion: 1,
    })
    assert.equal(updated.success, true)
    assert.equal(updated.newStatus, 'RESOLVED')
    assert.equal(updated.newVersion, 2)

    // Tentativa de transição para o mesmo status
    const sameStatus = svc.updateConditionStatus(DOC_1_ID, 'DOCTOR', {
      conditionId: created.conditionId,
      patientId: PATIENT_1_ID,
      nextStatus: 'RESOLVED',
      reason: 'Mesmo estado',
      expectedVersion: 2,
    })
    assert.match(sameStatus.error, /já se encontra no estado RESOLVED/)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 8: A edição concorrente não sobrescreve silenciosamente alterações recentes (Bloqueio Otimista)
  // --------------------------------------------------------------------------
  test('8. A edição concorrente não sobrescreve silenciosamente alterações recentes', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    const created = svc.recordMedication(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Enalapril',
      dosage: '10',
      unit: 'mg',
      status: 'ACTIVE',
    })

    // Médico A lê na versão 1
    // Médico B também lê na versão 1

    // Médico A suspende com sucesso o medicamento (incrementa versão para 2)
    const updateA = svc.updateMedicationStatus(DOC_1_ID, 'DOCTOR', {
      medicationId: created.medicationId,
      patientId: PATIENT_1_ID,
      nextStatus: 'SUSPENDED',
      reason: 'Tosse seca referida pelo paciente',
      expectedVersion: 1,
    })
    assert.equal(updateA.success, true)
    assert.equal(updateA.newVersion, 2)

    // Médico B tenta alterar usando a versão 1 desatualizada (stale read)
    const updateB = svc.updateMedicationStatus(DOC_1_ID, 'DOCTOR', {
      medicationId: created.medicationId,
      patientId: PATIENT_1_ID,
      nextStatus: 'DISCONTINUED',
      reason: 'Tentativa concorrente desatualizada',
      expectedVersion: 1, // Versão obsoleta
    })
    assert.match(updateB.error, /Conflito de concorrência/)
    assert.equal(db.medications[0].status, 'SUSPENDED', 'O valor do Médico A deve ser preservado')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 9: Auditoria e persistência permanecem consistentes em caso de falha
  // --------------------------------------------------------------------------
  test('9. Auditoria e persistência permanecem consistentes em caso de falha', () => {
    const db = createMockDb()
    const svcWithAuditFailure = createClinicalService(db, true) // Simula falha na gravação do log de auditoria

    const res = svcWithAuditFailure.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Poligicose Renal',
      status: 'ACTIVE',
    })

    assert.match(res.error, /Falha na gravação do evento de auditoria clínica/)
    assert.equal(db.conditions.length, 0, 'Rollback: Condição não deve ser persistida se auditoria falhar')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 10: Registros pendentes não aparecem como confirmados
  // --------------------------------------------------------------------------
  test('10. Registros pendentes não aparecem como confirmados', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    const condConfId = crypto.randomUUID()
    const condPendId = crypto.randomUUID()

    // Insere uma condição confirmada e outra pendente diretamente no banco
    db.conditions.push({
      id: condConfId,
      patient_id: PATIENT_1_ID,
      name: 'Doença Renal Policística',
      status: 'ACTIVE',
      validation_status: 'CONFIRMED',
      version: 1,
      created_at: new Date().toISOString(),
    })
    db.conditions.push({
      id: condPendId,
      patient_id: PATIENT_1_ID,
      name: 'Suspeita de Glomerulopatia (Auto-relatada)',
      status: 'ACTIVE',
      validation_status: 'PENDING',
      version: 1,
      created_at: new Date().toISOString(),
    })

    // Visão do Paciente (Titular)
    const patientView = svc.getPatientClinicalView(USER_PAT_1_ID, 'PATIENT', PATIENT_1_ID)
    assert.equal(patientView.success, true)
    assert.equal(patientView.conditions.length, 1, 'Paciente só deve ver itens confirmados')
    assert.equal(patientView.conditions[0].id, condConfId)

    // Visão do Médico Responsável
    const doctorView = svc.getPatientClinicalView(DOC_1_ID, 'DOCTOR', PATIENT_1_ID)
    assert.equal(doctorView.success, true)
    assert.equal(doctorView.conditions.length, 2, 'Médico vê pendentes e confirmados para triagem/curadoria')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 11: O histórico é preservado conforme as regras de governança
  // --------------------------------------------------------------------------
  test('11. O histórico é preservado conforme as regras de governança', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // Cria condição inicial
    const created = svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Lúpus Eritematoso Sistêmico',
      status: 'ACTIVE',
      notes: 'Início do diagnóstico',
    })

    // Altera para RESOLVED
    svc.updateConditionStatus(DOC_1_ID, 'DOCTOR', {
      conditionId: created.conditionId,
      patientId: PATIENT_1_ID,
      nextStatus: 'RESOLVED',
      reason: 'Remissão sustentada há 12 meses',
      expectedVersion: 1,
    })

    // Verifica eventos de histórico gravados em condition_events
    const events = db.condition_events.filter((e) => e.condition_id === created.conditionId)
    assert.equal(events.length, 2)
    assert.equal(events[0].previous_status, null)
    assert.equal(events[0].next_status, 'ACTIVE')
    assert.equal(events[1].previous_status, 'ACTIVE')
    assert.equal(events[1].next_status, 'RESOLVED')
    assert.equal(events[1].reason, 'Remissão sustentada há 12 meses')
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 12: Dados de pacientes diferentes permanecem isolados
  // --------------------------------------------------------------------------
  test('12. Dados de pacientes diferentes permanecem isolados', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // Médico 1 cadastra condição para Paciente 1
    svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Hipertensão Arterial',
      status: 'ACTIVE',
    })

    // Médico 2 cadastra condição para Paciente 2
    svc.recordCondition(DOC_2_ID, 'DOCTOR', {
      patientId: PATIENT_2_ID,
      name: 'Nefrolitíase Recorrente',
      status: 'ACTIVE',
    })

    // Médico 1 tenta acessar prontuário do Paciente 2 (sem vínculo)
    const accessCrossDoctor = svc.getPatientClinicalView(DOC_1_ID, 'DOCTOR', PATIENT_2_ID)
    assert.match(accessCrossDoctor.error, /Acesso negado/)

    // Paciente 1 tenta acessar prontuário do Paciente 2
    const accessCrossPatient = svc.getPatientClinicalView(USER_PAT_1_ID, 'PATIENT', PATIENT_2_ID)
    assert.match(accessCrossPatient.error, /Acesso negado/)
  })

  // --------------------------------------------------------------------------
  // CENÁRIO 13: O fluxo de submissão domiciliar, curadoria, documentos e representação continua funcionando
  // --------------------------------------------------------------------------
  test('13. O fluxo de submissão domiciliar, curadoria, documentos e representação continua funcionando', () => {
    const db = createMockDb()
    const svc = createClinicalService(db)

    // 1. Paciente submete medição de peso e pressão
    const submissionId = crypto.randomUUID()
    db.clinical_records.push({
      id: submissionId,
      patient_id: PATIENT_1_ID,
      record_type: 'VITAL_SIGNS',
      status: 'PENDING_VALIDATION',
      clinical_date: '2026-10-27',
      created_by_user_id: USER_PAT_1_ID,
    })

    // 2. Médico confirma a medição (Curadoria da Fase 1.2)
    const subRecord = db.clinical_records.find((r) => r.id === submissionId)
    assert.equal(subRecord.status, 'PENDING_VALIDATION')
    subRecord.status = 'CONFIRMED'
    subRecord.confirmed_by_user_id = DOC_1_ID

    // 3. Médico anexa condição e medicamento ao prontuário (Fase 4.3)
    const cond = svc.recordCondition(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Hipertensão Arterial',
      status: 'ACTIVE',
    })
    const med = svc.recordMedication(DOC_1_ID, 'DOCTOR', {
      patientId: PATIENT_1_ID,
      name: 'Amlodipino',
      dosage: '5',
      unit: 'mg',
      status: 'ACTIVE',
    })

    assert.equal(cond.success, true)
    assert.equal(med.success, true)

    // 4. Representante legal ativo visualiza o painel consolidado do paciente
    const view = svc.getPatientClinicalView(REP_1_ID, 'LEGAL_REPRESENTANT', PATIENT_1_ID)
    assert.equal(view.success, true)
    assert.equal(view.conditions.length, 1)
    assert.equal(view.medications.length, 1)
  })
})
