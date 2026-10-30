import * as z from 'zod'

export const BRAZILIAN_UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export const registerDoctorSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, 'O nome completo do médico deve ter no mínimo 3 caracteres.')
    .max(255, 'O nome não pode exceder 255 caracteres.'),
  email: z
    .string()
    .trim()
    .email('Informe um endereço de e-mail institucional válido.')
    .toLowerCase(),
  phone: z
    .string()
    .trim()
    .optional()
    .or(z.literal('')),
  crm: z
    .string()
    .trim()
    .min(4, 'O CRM deve conter no mínimo 4 dígitos.')
    .max(20, 'O CRM deve conter no máximo 20 dígitos.')
    .regex(/^[0-9A-Za-z]+$/, 'O CRM deve conter apenas dígitos e/ou letras sem símbolos.'),
  crmUf: z
    .enum(BRAZILIAN_UFS, {
      message: 'Selecione uma UF de CRM válida.',
    }),
  specialty: z
    .string()
    .trim()
    .min(2, 'Especialidade inválida.')
    .default('Nefrologia'),
  isMaster: z
    .boolean()
    .default(false),
})

export type RegisterDoctorFormValues = z.infer<typeof registerDoctorSchema>
