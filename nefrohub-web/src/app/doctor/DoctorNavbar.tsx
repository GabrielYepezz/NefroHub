'use client'

import { logoutAction } from '@/app/auth/actions'
import { Activity, Stethoscope, LogOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface DoctorNavbarProps {
  doctorName?: string
  doctorEmail?: string
}

export function DoctorNavbar({
  doctorName = 'Dr(a). Clínico',
  doctorEmail = 'medico@nefrohub.med.br',
}: DoctorNavbarProps) {
  const handleLogout = async () => {
    await logoutAction()
  }

  return (
    <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-xs border-b border-border shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Branding e Identificação de Módulo */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-xs">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight text-foreground font-heading">
                Nefro<span className="text-primary">Hub</span>
              </span>
              <Badge variant="primary" size="sm">
                Área Clínica
              </Badge>
            </div>
            <p className="text-[11px] text-muted-foreground hidden sm:block">
              Prontuário Nefrológico Longitudinal
            </p>
          </div>
        </div>

        {/* Perfil do Médico & Logout */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-primary-light/50 border border-primary/15 text-xs">
            <div className="p-1 rounded-md bg-primary-light text-primary">
              <Stethoscope className="w-3.5 h-3.5" />
            </div>
            <div className="text-left">
              <p className="font-semibold text-foreground leading-none">{doctorName}</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-1">Especialidade: Nefrologia</p>
            </div>
          </div>

          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive-bg border border-border transition-colors focus-ring cursor-pointer"
              title="Encerrar sessão médica"
              aria-label="Encerrar sessão médica"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  )
}
