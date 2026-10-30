// src/lib/security/mfa-guard.ts
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Verificação de Nível de Garantia de Autenticação Multifator (AAL) no Servidor (RF-007)
 * Impede que Server Actions sensíveis sejam invocadas com sessão AAL1 quando AAL2 é exigido.
 */
export async function assertServerMFAAssurance(
  supabase: SupabaseClient,
  userRole: string
): Promise<{ authorized: boolean; error?: string }> {
  const role = userRole?.toUpperCase()
  const isInstitutionalRole = role === 'ADMIN' || role === 'DOCTOR' || role === 'DOCTOR_MASTER'

  if (!isInstitutionalRole) {
    return { authorized: true }
  }

  const { data: aalData, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalError) {
    return { authorized: false, error: 'Falha ao verificar nível de autenticação (MFA).' }
  }

  // Se o usuário possui fator configurado (nextLevel === 'aal2') mas a sessão atual não é 'aal2'
  if (aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2') {
    return {
      authorized: false,
      error: 'Operação bloqueada: Esta ação clínica ou administrativa exige autenticação em duas etapas (TOTP) concluída na sessão atual.',
    }
  }

  return { authorized: true }
}
