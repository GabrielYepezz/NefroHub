// src/proxy.ts
import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  const { supabaseResponse, user, aalData } = await updateSession(request)
  const path = request.nextUrl.pathname

  const isAuthRoute = path.startsWith('/login') || path.startsWith('/auth')
  const isDoctorRoute = path.startsWith('/doctor')
  const isPatientDashboardRoute = path.startsWith('/patient/dashboard')
  const isAdminRoute = path.startsWith('/admin')

  // Redireciona usuários não autenticados para /login
  if (!user && (isDoctorRoute || isPatientDashboardRoute || isAdminRoute)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user) {
    const rawRole = (user.user_metadata?.role as string | undefined)?.toUpperCase() || 'PATIENT'

    // Destino padrão de cada perfil
    const getDefaultDestination = (role: string) => {
      if (role === 'ADMIN') return '/admin'
      if (role === 'DOCTOR' || role === 'DOCTOR_MASTER') return '/doctor'
      return '/patient/dashboard'
    }

    // RF-007: Se o usuário possui segundo fator (TOTP) pendente (AAL1 com nextLevel AAL2),
    // bloqueia o acesso a rotas sensíveis e não permite bypass via auto-redirecionamento
    const isMfaPending = aalData && aalData.nextLevel === 'aal2' && aalData.currentLevel !== 'aal2'

    if (isMfaPending && (isAdminRoute || isDoctorRoute)) {
      return NextResponse.redirect(new URL('/login?mfa=true', request.url))
    }

    // Se usuário autenticado tenta acessar /login ou /auth, redireciona para seu painel apenas se MFA estiver resolvido
    if (isAuthRoute) {
      if (isMfaPending) {
        // Permite permanecer na tela de login para concluir o desafio MFA
        return supabaseResponse
      }
      return NextResponse.redirect(new URL(getDefaultDestination(rawRole), request.url))
    }

    // Guard de rota para Admin: apenas ADMIN pode acessar /admin
    if (isAdminRoute && rawRole !== 'ADMIN') {
      return NextResponse.redirect(new URL(getDefaultDestination(rawRole), request.url))
    }

    // Guard de rota para Médicos
    if (isDoctorRoute && rawRole !== 'DOCTOR' && rawRole !== 'DOCTOR_MASTER' && rawRole !== 'ADMIN') {
      return NextResponse.redirect(new URL(getDefaultDestination(rawRole), request.url))
    }

    // Guard de rota para Pacientes
    if (isPatientDashboardRoute && rawRole !== 'PATIENT' && rawRole !== 'ADMIN') {
      return NextResponse.redirect(new URL(getDefaultDestination(rawRole), request.url))
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
