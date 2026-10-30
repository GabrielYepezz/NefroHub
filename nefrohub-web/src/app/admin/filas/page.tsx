import { createClient } from '@/lib/supabase/server'
import {
  AdminQueuesClient,
  QueueDoctorItem,
  QueueLinkItem,
  QueueReviewItem,
  QueueDisposalItem,
} from './AdminQueuesClient'
import { ShieldAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default async function AdminQueuesPage() {
  const supabase = await createClient()

  // 1. FILA 1: Médicos aguardando homologação
  const { data: pendingDoctors } = await supabase
    .from('users')
    .select('id, name, email, phone, created_at')
    .eq('role', 'DOCTOR')
    .eq('status', 'PENDING_APPROVAL')

  const doctorsQueue: QueueDoctorItem[] = (pendingDoctors || []).map((d: any) => ({
    id: d.id,
    name: d.name,
    email: d.email,
    phone: d.phone,
    createdAt: d.created_at,
  }))

  // 2. FILA 2: Vínculos médico-paciente pendentes
  const { data: pendingLinks } = await supabase
    .from('physician_patient_links')
    .select('id, created_at, patient_id, physician_user_id')
    .eq('status', 'PENDING')

  const linkPatientIds = Array.from(new Set((pendingLinks || []).map((l) => l.patient_id).filter(Boolean)))
  const linkDocIds = Array.from(new Set((pendingLinks || []).map((l) => l.physician_user_id).filter(Boolean)))

  const { data: linkPatients } = linkPatientIds.length > 0
    ? await supabase.from('patient_profiles').select('id, full_name').in('id', linkPatientIds)
    : { data: [] }

  const { data: linkDoctors } = linkDocIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', linkDocIds)
    : { data: [] }

  const linkPatientMap = new Map((linkPatients || []).map((p) => [p.id, p.full_name]))
  const linkDoctorMap = new Map((linkDoctors || []).map((d) => [d.id, d.name]))

  const linksQueue: QueueLinkItem[] = (pendingLinks || []).map((l: any) => ({
    id: l.id,
    patientName: linkPatientMap.get(l.patient_id) || 'Paciente',
    doctorName: linkDoctorMap.get(l.physician_user_id) || 'Médico',
    createdAt: l.created_at,
  }))

  // 2.1. FILA 2: Representações legais e cuidadores pendentes (Fase 4.1)
  const { data: pendingReps } = await supabase
    .from('patient_representations')
    .select(`
      id,
      relationship_type,
      authority_type,
      proof_document_ref,
      created_at,
      patient_profiles (full_name),
      users:representative_user_id (name, email)
    `)
    .eq('status', 'PENDING')

  const representationsQueue = (pendingReps || []).map((r: any) => {
    const repUser = Array.isArray(r.users) ? r.users[0] : r.users
    return {
      id: r.id,
      patientName: r.patient_profiles?.full_name || 'Paciente',
      representativeName: repUser?.name || 'Cuidador',
      representativeEmail: repUser?.email || '',
      relationshipType: r.relationship_type,
      authorityType: r.authority_type,
      proofRef: r.proof_document_ref,
      createdAt: r.created_at,
    }
  })

  // 3. FILA 4: Solicitações de retificação/revisão (Desacoplada contra erro PGRST200)
  const { data: pendingReviews } = await supabase
    .from('review_requests')
    .select('id, reason, created_at, patient_id, requested_by_user_id')
    .eq('status', 'PENDING')

  const reviewPatientIds = Array.from(new Set((pendingReviews || []).map((r) => r.patient_id).filter(Boolean)))
  const reviewUserIds = Array.from(new Set((pendingReviews || []).map((r) => r.requested_by_user_id).filter(Boolean)))

  const { data: reviewPatients } = reviewPatientIds.length > 0
    ? await supabase.from('patient_profiles').select('id, full_name').in('id', reviewPatientIds)
    : { data: [] }

  const { data: reviewUsers } = reviewUserIds.length > 0
    ? await supabase.from('users').select('id, name').in('id', reviewUserIds)
    : { data: [] }

  const reviewPatientMap = new Map((reviewPatients || []).map((p) => [p.id, p.full_name]))
  const reviewUserMap = new Map((reviewUsers || []).map((u) => [u.id, u.name]))

  const reviewsQueue: QueueReviewItem[] = (pendingReviews || []).map((r: any) => ({
    id: r.id,
    patientName: reviewPatientMap.get(r.patient_id) || 'Paciente',
    requestedByName: reviewUserMap.get(r.requested_by_user_id) || 'Solicitante',
    reason: r.reason,
    createdAt: r.created_at,
  }))

  // 4. FILA 5: Descarte e destinação de documentos rejeitados
  const { data: pendingDisposals } = await supabase
    .from('rejected_submission_events')
    .select(`
      id,
      record_type,
      rejection_code,
      rejection_reason,
      created_at,
      patient_profiles (full_name)
    `)
    .eq('disposal_status', 'PENDING_DISPOSAL')

  const disposalsQueue: QueueDisposalItem[] = (pendingDisposals || []).map((disp: any) => ({
    id: disp.id,
    patientName: disp.patient_profiles?.full_name || 'Paciente',
    recordType: disp.record_type,
    rejectionCode: disp.rejection_code,
    rejectionReason: disp.rejection_reason,
    createdAt: disp.created_at,
  }))

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Filas de Trabalho do Backoffice
            </h1>
            <Badge variant="warning" size="sm">
              Governança Operacional
            </Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Painel institucional das cinco filas operacionais de governança, homologação e destinação documental (Seção 7.3).
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Segregação de Funções Administrativas vs Clínicas</p>
          <p className="text-amber-800/80 mt-0.5 leading-relaxed">
            O administrador operacional gerencia os fluxos de homologação, vínculos e descarte legal. Decisões clínicas sobre registros médicos confirmados pertencem exclusivamente aos profissionais de saúde habilitados (Seção 2.2).
          </p>
        </div>
      </div>

      {/* Componente Interativo com Dados Reais e Despacho */}
      <AdminQueuesClient
        doctorsQueue={doctorsQueue}
        linksQueue={linksQueue}
        representationsQueue={representationsQueue}
        reviewsQueue={reviewsQueue}
        disposalsQueue={disposalsQueue}
      />
    </div>
  )
}
