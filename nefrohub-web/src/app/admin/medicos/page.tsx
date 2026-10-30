import { createServerClient } from '@supabase/ssr'
import { AdminPhysiciansClient, DoctorDisplayItem } from './AdminPhysiciansClient'

export const metadata = {
  title: 'Corpo Clínico & Médicos | NefroHub Admin',
  description: 'Gestão institucional de médicos habilitados, CRM e Doctor Master',
}

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

export default async function AdminPhysiciansPage() {
  const supabaseAdmin = getAdminClient()

  // 1. Buscar médicos registrados
  const { data: usersData, error: usersError } = await supabaseAdmin
    .from('users')
    .select('id, name, email, phone, role, status, created_at')
    .in('role', ['DOCTOR', 'doctor', 'DOCTOR_MASTER'])
    .order('created_at', { ascending: false })

  if (usersError) {
    console.error('[AdminPhysiciansPage] Erro ao buscar médicos:', usersError)
  }

  const userIds = (usersData || []).map((u) => u.id)

  // 2. Buscar perfis médicos correspondentes
  const profilesMap = new Map<string, any>()
  if (userIds.length > 0) {
    const { data: profilesData, error: profilesError } = await supabaseAdmin
      .from('physician_profiles')
      .select('user_id, crm, crm_uf, specialty, validation_status, is_master')
      .in('user_id', userIds)

    if (profilesError) {
      console.error('[AdminPhysiciansPage] Erro ao buscar perfis médicos:', profilesError)
    } else if (profilesData) {
      profilesData.forEach((p) => profilesMap.set(p.user_id, p))
    }
  }

  const doctorsList: DoctorDisplayItem[] = (usersData || []).map((u: any) => {
    const profile = profilesMap.get(u.id)

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      status: u.status,
      crm: profile?.crm || null,
      crmUf: profile?.crm_uf || null,
      specialty: profile?.specialty || null,
      validationStatus: profile?.validation_status || null,
      isMaster: Boolean(profile?.is_master || u.role?.toUpperCase() === 'DOCTOR_MASTER'),
      createdAt: u.created_at,
    }
  })

  return <AdminPhysiciansClient doctors={doctorsList} />
}
