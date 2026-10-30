import * as z from 'zod'
import { isValidCpf } from '@/lib/patient-utils'

export const createPatientSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(3, 'O nome completo deve ter pelo menos 3 caracteres'),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida (formato esperado: AAAA-MM-DD)')
    .refine((date) => {
      const parsed = new Date(date)
      const now = new Date()
      return !isNaN(parsed.getTime()) && parsed <= now
    }, 'Data de nascimento não pode estar no futuro'),
  biologicalSex: z.enum(['M', 'F'], {
    message: 'Selecione o sexo biológico (M para Masculino, F para Feminino)',
  }),
  cpf: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || isValidCpf(val), 'CPF informado é inválido'),
  phone: z.string().trim().optional(),
  email: z
    .string()
    .trim()
    .email('E-mail em formato inválido')
    .optional()
    .or(z.literal('')),
  cns: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
  medicalRecordNumber: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
  primaryPhysicianUserId: z
    .string()
    .uuid('Selecione um médico responsável válido'),
})

export type CreatePatientFormValues = z.infer<typeof createPatientSchema>
