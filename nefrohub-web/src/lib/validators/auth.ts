// src/lib/validators/auth.ts
import * as z from 'zod'

/**
 * Política Institucional de Senhas Fortes (documentation.md Seção 15.1 - RF-009):
 * - Mínimo de 12 caracteres.
 * - Aceita frases-senha com espaços e pontuação livre.
 * - Sem restrições artificiais que penalizem frases longas e fáceis de memorizar.
 */
export const passwordPolicySchema = z
  .string()
  .min(12, 'A senha deve ter pelo menos 12 caracteres (frases-senha com espaços são aceitas e recomendadas)')

export const loginSchema = z.object({
  email: z.string().trim().email('E-mail institucional ou cadastrado inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})

/**
 * Schema para Cadastro Público (Fase 3.1 - Regra Institucional A2 & RF-009):
 * Visitantes e auto-cadastros são ESTRITAMENTE restritos ao pré-cadastro de pacientes.
 * Não há seleção ou envio de papéis pelo cliente.
 */
export const publicRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z
    .string()
    .trim()
    .email('E-mail em formato inválido'),
  password: passwordPolicySchema,
  phone: z
    .string()
    .trim()
    .min(10, 'Telefone inválido')
    .optional()
    .or(z.literal('')),
})

/**
 * Schema Interno para Criação de Contas por Administradores (Backoffice & RF-009)
 */
export const internalRegisterSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  email: z.string().trim().email('E-mail inválido'),
  password: passwordPolicySchema,
  phone: z.string().trim().min(10, 'Telefone inválido').optional(),
  role: z.enum(['admin', 'doctor', 'patient'], {
    message: 'Selecione um papel institucional válido',
  }),
})

/**
 * Schema para Redefinição / Atualização de Senha (RF-008 & RF-009)
 */
export const updatePasswordSchema = z
  .object({
    password: passwordPolicySchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'A confirmação de senha não confere com a nova senha.',
    path: ['confirmPassword'],
  })

export type LoginFormValues = z.infer<typeof loginSchema>
export type PublicRegisterFormValues = z.infer<typeof publicRegisterSchema>
export type RegisterFormValues = z.infer<typeof internalRegisterSchema>
export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>

// Alias de retrocompatibilidade
export const registerSchema = internalRegisterSchema
