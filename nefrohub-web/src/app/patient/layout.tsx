import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { logoutAction } from '@/app/auth/actions'
import { Activity, User, LogOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export const metadata = {
  title: 'Portal do Paciente | NefroHub',
  description: 'Acompanhamento pessoal de função renal e submissão de medições domiciliares',
}

export default async function PatientLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const userName = (user?.user_metadata?.name as string) || 'Paciente'

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-xs border-b border-border shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          {/* Logo & Identificação */}
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
                  Portal do Paciente
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                Acompanhamento e Cuidado Renal Contínuo
              </p>
            </div>
          </div>

          {/* Identificação do Usuário e Logout */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary-light/50 border border-primary/15 text-xs text-foreground">
              <User className="w-3.5 h-3.5 text-primary" />
              <span className="font-medium text-foreground">{userName}</span>
            </div>

            <form action={logoutAction}>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive-bg border border-border transition-colors focus-ring cursor-pointer"
                title="Sair do portal"
                aria-label="Sair do portal"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sair</span>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
