import * as z from 'zod'

/**
 * Validação de Comorbidades e Doenças de Base (documentation.md - Seção 8.5)
 * O CID-10 é puramente opcional e o sistema não infere diagnósticos.
 */
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

export type ConditionInput = z.infer<typeof conditionSchema>

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

export type UpdateConditionStatusInput = z.infer<typeof updateConditionStatusSchema>

/**
 * Validação de Medicamentos de Uso Contínuo (documentation.md - Seção 8.6)
 * Não é sistema de prescrição eletrônica: registra o uso informado no prontuário.
 */
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

export type MedicationInput = z.infer<typeof medicationSchema>

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

export type UpdateMedicationStatusInput = z.infer<typeof updateMedicationStatusSchema>
