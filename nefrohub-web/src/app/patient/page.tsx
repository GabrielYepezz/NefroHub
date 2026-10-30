import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

/**
 * Despachante seguro da rota raiz /patient.
 * 
 * Regra de Segurança (Fase 1 - Problema D):
 * A rota /patient não pode expor um painel administrativo a pacientes nem a usuários não autorizados.
 * Realiza o roteamento estrito no servidor com base na sessão e papel (role) verificado:
 * - Sem sessão: /login
 * - ADMIN: /admin/pacientes
 * - DOCTOR / DOCTOR_MASTER: /doctor
 * - PATIENT: /patient/dashboard
 */
export default async function PatientDispatcherPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const rawRole = (user.user_metadata?.role as string | undefined)?.toUpperCase()

  if (rawRole === 'ADMIN') {
    redirect('/admin/pacientes')
  }

  if (rawRole === 'DOCTOR' || rawRole === 'DOCTOR_MASTER') {
    redirect('/doctor')
  }

  // Pacientes e representantes legais
  redirect('/patient/dashboard')
}
