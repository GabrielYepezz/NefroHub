import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DoctorNavbar } from './DoctorNavbar'

export const metadata = {
  title: 'Portal Médico | NefroHub',
  description: 'Acompanhamento longitudinal de pacientes renais e curadoria de prontuário',
}

export default async function DoctorLayout({
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
  if (role !== 'DOCTOR' && role !== 'DOCTOR_MASTER' && role !== 'ADMIN') {
    redirect('/patient/dashboard')
  }

  const doctorName = (user.user_metadata?.name as string) || 'Dr(a). Nefrologista'
  const doctorEmail = user.email || 'medico@nefrohub.med.br'

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      <DoctorNavbar doctorName={doctorName} doctorEmail={doctorEmail} />
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}
