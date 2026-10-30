import { createClient } from '@/lib/supabase/server'
import {
  AdminLinksClient,
  PhysicianLinkItem,
  RepresentationAdminItem,
} from './AdminLinksClient'

export const metadata = {
  title: 'Vínculos & Representação | NefroHub Admin',
  description: 'Governança da relação médico-paciente e poderes de representantes legais',
}

export default async function AdminLinksPage() {
  const supabase = await createClient()

  // 1. Buscar vínculos médico-paciente
  const { data: rawLinks } = await supabase
    .from('physician_patient_links')
    .select(`
      id,
      patient_id,
      physician_user_id,
      status,
      is_primary,
      activated_at,
      created_at,
      reason,
      patient_profiles (id, full_name),
      users:physician_user_id (id, name, email)
    `)
    .order('created_at', { ascending: false })

  const links: PhysicianLinkItem[] = (rawLinks || []).map((l: any) => {
    const patientObj = Array.isArray(l.patient_profiles) ? l.patient_profiles[0] : l.patient_profiles
    const doctorObj = Array.isArray(l.users) ? l.users[0] : l.users

    return {
      id: l.id,
      patientId: l.patient_id,
      patientName: patientObj?.full_name || 'Paciente',
      physicianId: l.physician_user_id,
      physicianName: doctorObj?.name || 'Médico',
      physicianEmail: doctorObj?.email || '',
      isPrimary: l.is_primary,
      status: l.status,
      activatedAt: l.activated_at,
      createdAt: l.created_at,
      reason: l.reason,
    }
  })

  // 2. Buscar representações legais cadastradas
  const { data: rawReps } = await supabase
    .from('patient_representations')
    .select(`
      id,
      patient_id,
      representative_user_id,
      relationship_type,
      authority_type,
      proof_document_ref,
      status,
      valid_until,
      created_at,
      patient_profiles (id, full_name),
      users:representative_user_id (id, name, email)
    `)
    .order('created_at', { ascending: false })

  const representations: RepresentationAdminItem[] = (rawReps || []).map((r: any) => {
    const patientObj = Array.isArray(r.patient_profiles) ? r.patient_profiles[0] : r.patient_profiles
    const repUser = Array.isArray(r.users) ? r.users[0] : r.users

    return {
      id: r.id,
      patientId: r.patient_id,
      patientName: patientObj?.full_name || 'Paciente',
      representativeId: r.representative_user_id,
      representativeName: repUser?.name || 'Representante',
      representativeEmail: repUser?.email || '',
      relationshipType: r.relationship_type,
      authorityType: r.authority_type,
      proofRef: r.proof_document_ref,
      status: r.status,
      validUntil: r.valid_until,
      createdAt: r.created_at,
    }
  })

  // 3. Buscar pacientes disponíveis para vínculo
  const { data: patientsData } = await supabase
    .from('patient_profiles')
    .select('id, full_name')
    .order('full_name', { ascending: true })

  const availablePatients = (patientsData || []).map((p) => ({
    id: p.id,
    name: p.full_name,
  }))

  // 4. Buscar médicos habilitados para vínculo
  const { data: doctorsData } = await supabase
    .from('users')
    .select('id, name')
    .in('role', ['DOCTOR', 'doctor', 'DOCTOR_MASTER'])
    .order('name', { ascending: true })

  const availableDoctors = (doctorsData || []).map((d) => ({
    id: d.id,
    name: d.name,
  }))

  return (
    <AdminLinksClient
      links={links}
      representations={representations}
      availablePatients={availablePatients}
      availableDoctors={availableDoctors}
    />
  )
}
