import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { AdminSidebar } from './AdminSidebar'

export const metadata = {
  title: 'Painel do Administrador | NefroHub',
  description: 'Gestão de governança hospitalar, vínculos clínicos e auditoria',
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (role !== 'ADMIN') {
    // Redireciona se não for admin
    if (role === 'DOCTOR' || role === 'DOCTOR_MASTER') {
      redirect('/doctor')
    } else {
      redirect('/patient/dashboard')
    }
  }

  const adminName = (user.user_metadata?.name as string) || 'Administrador do Sistema'
  const adminEmail = user.email || 'admin@nefrohub.med.br'

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row font-sans">
      <AdminSidebar adminName={adminName} adminEmail={adminEmail} />
      <main className="flex-1 p-4 lg:p-8 pt-20 lg:pt-8 max-w-7xl mx-auto w-full overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
