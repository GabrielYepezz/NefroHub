import { createClient } from '@/lib/supabase/server'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

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
import {
  DoctorDashboardClient,
  AuthorizedPatient,
  ClinicalRecordItem,
  PendingRecordItem,
} from './DoctorClientComponents'

function calculateAge(birthDateStr: string): number {
  const birth = new Date(birthDateStr)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return isNaN(age) || age < 0 ? 0 : age
}

export default async function DoctorDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const role = (user.user_metadata?.role as string | undefined)?.toUpperCase()
  if (role !== 'DOCTOR' && role !== 'DOCTOR_MASTER' && role !== 'ADMIN') {
    redirect('/patient/dashboard')
  }

  const doctorName = (user.user_metadata?.name as string) || 'Dr(a). Clínico'

  // Consulta se o médico autenticado possui a função de Doctor Master (RF-004)
  const { data: dbUser } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  const { data: docProfile } = await supabase
    .from('physician_profiles')
    .select('is_master')
    .eq('user_id', user.id)
    .maybeSingle()

  const isMaster = dbUser?.role === 'DOCTOR_MASTER' || docProfile?.is_master === true

  // 1. Busca Estrita de Vínculos Autorizados (documentation.md - Seções 2.3 e 4.1)
  // Somente pacientes com status ACTIVE no vínculo com este médico são retornados.
  const { data: activeLinks, error: linksError } = await supabase
    .from('physician_patient_links')
    .select(`
      id,
      patient_id,
      is_primary,
      status,
      patient_profiles (
        id,
        full_name,
        birth_date,
        biological_sex,
        cpf_masked,
        phone,
        email,
        status
      )
    `)
    .eq('physician_user_id', user.id)
    .eq('status', 'ACTIVE')

  if (linksError) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          Erro ao consultar vínculos clínicos autorizados: {linksError.message}
        </div>
      </div>
    )
  }

  const patientsList: AuthorizedPatient[] = []

  if (activeLinks && activeLinks.length > 0) {
    for (const link of activeLinks) {
      const p = link.patient_profiles as any
      if (!p) continue

      // 2. Buscar Registros Confirmados do Paciente (Prontuário Imutável)
      const { data: confirmedRecords } = await supabase
        .from('clinical_records')
        .select(`
          id,
          clinical_date,
          created_at,
          record_type,
          lab_results (exam_name, numeric_value, normalized_value),
          vital_signs (sign_code, numeric_value, unit)
        `)
        .eq('patient_id', p.id)
        .eq('status', 'CONFIRMED')
        .order('clinical_date', { ascending: false })

      // 3. Buscar Submissões Pendentes (Fila de Curadoria Clínica - Seção 6.3)
      const { data: pendingRecords } = await supabase
        .from('clinical_records')
        .select(`
          id,
          clinical_date,
          created_at,
          record_type,
          vital_signs (sign_code, numeric_value, unit)
        `)
        .eq('patient_id', p.id)
        .eq('status', 'PENDING_VALIDATION')
        .order('created_at', { ascending: false })

      const confirmedHistory: ClinicalRecordItem[] = (confirmedRecords || []).map((rec: any) => {
        const creatinina = rec.lab_results?.find((l: any) =>
          l.exam_name?.toLowerCase().includes('creatinina')
        )?.numeric_value

        const egfr = rec.lab_results?.find((l: any) =>
          l.exam_name?.toLowerCase().includes('tfg') || l.exam_name?.toLowerCase().includes('egfr')
        )?.numeric_value

        const weight = rec.vital_signs?.find((v: any) => v.sign_code === 'WEIGHT')?.numeric_value
        const systolic = rec.vital_signs?.find((v: any) => v.sign_code === 'BP_SYSTOLIC')?.numeric_value
        const diastolic = rec.vital_signs?.find((v: any) => v.sign_code === 'BP_DIASTOLIC')?.numeric_value

        return {
          id: rec.id,
          date: rec.clinical_date,
          creatinine: creatinina ?? null,
          eGFR: egfr ?? null,
          stage: null,
          weight: weight ?? null,
          bpSystolic: systolic ?? null,
          bpDiastolic: diastolic ?? null,
          source: rec.record_type,
        }
      })

      const pendingItems: PendingRecordItem[] = (pendingRecords || []).map((pend: any) => {
        const weight = pend.vital_signs?.find((v: any) => v.sign_code === 'WEIGHT')?.numeric_value
        const systolic = pend.vital_signs?.find((v: any) => v.sign_code === 'BP_SYSTOLIC')?.numeric_value
        const diastolic = pend.vital_signs?.find((v: any) => v.sign_code === 'BP_DIASTOLIC')?.numeric_value

        return {
          id: pend.id,
          date: pend.clinical_date,
          createdAt: pend.created_at,
          recordType: pend.record_type,
          weight: weight ?? null,
          bpSystolic: systolic ?? null,
          bpDiastolic: diastolic ?? null,
        }
      })

      // 4. Buscar Laudos e Documentos do Paciente (Fase 4.2)
      const { data: patientDocs } = await supabase
        .from('documents')
        .select('id, title, document_type, mime_type, file_size_bytes, sha256_hash, validation_status, rejection_reason, created_at')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })

      const documentItems = (patientDocs || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        documentType: d.document_type,
        mimeType: d.mime_type,
        fileSizeBytes: d.file_size_bytes,
        sha256Hash: d.sha256_hash,
        validationStatus: d.validation_status,
        rejectionReason: d.rejection_reason,
        createdAt: d.created_at,
      }))

      // 5. Buscar Comorbidades e Doenças de Base (Fase 4.3)
      const { data: patientConditions } = await supabase
        .from('conditions')
        .select('id, name, cid10, onset_date, status, notes, validation_status, version, created_at')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })

      interface DbConditionRow {
        id: string
        name: string
        cid10: string | null
        onset_date: string | null
        status: 'ACTIVE' | 'RESOLVED' | 'INACTIVE'
        notes: string | null
        validation_status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
        version: number
        created_at: string
      }

      const conditionItems = ((patientConditions as unknown as DbConditionRow[]) || []).map((c) => ({
        id: c.id,
        name: c.name,
        cid10: c.cid10,
        onsetDate: c.onset_date,
        status: c.status,
        notes: c.notes,
        validationStatus: c.validation_status || 'CONFIRMED',
        version: c.version || 1,
        createdAt: c.created_at,
      }))

      // 6. Buscar Medicamentos de Uso Contínuo (Fase 4.3)
      const { data: patientMeds } = await supabase
        .from('medications')
        .select('id, name, dosage, unit, route, frequency, start_date, end_date, status, is_prescription, notes, validation_status, version, created_at')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })

      interface DbMedicationRow {
        id: string
        name: string
        dosage: string | null
        unit: string | null
        route: string | null
        frequency: string | null
        start_date: string | null
        end_date: string | null
        status: 'ACTIVE' | 'SUSPENDED' | 'DISCONTINUED'
        is_prescription: boolean
        notes: string | null
        validation_status: 'PENDING' | 'CONFIRMED' | 'REJECTED'
        version: number
        created_at: string
      }

      const medicationItems = ((patientMeds as unknown as DbMedicationRow[]) || []).map((m) => ({
        id: m.id,
        name: m.name,
        dosage: m.dosage,
        unit: m.unit,
        route: m.route,
        frequency: m.frequency,
        startDate: m.start_date,
        endDate: m.end_date,
        status: m.status,
        isPrescription: m.is_prescription || false,
        notes: m.notes,
        validationStatus: m.validation_status || 'CONFIRMED',
        version: m.version || 1,
        createdAt: m.created_at,
      }))

      // 7. Buscar Alergias do Paciente com Triplo Estado (documentation.md Seção 8.6 - RF-054)
      const supabaseAdmin = getAdminClient()
      const { data: patientAllergies } = await supabaseAdmin
        .from('allergies')
        .select('id, substance, reaction, severity, status, created_at')
        .eq('patient_id', p.id)
        .order('created_at', { ascending: false })

      interface DbAllergyRow {
        id: string
        substance: string
        reaction: string | null
        severity: string | null
        status: 'KNOWN' | 'NO_KNOWN_ALLERGIES' | 'UNREPORTED' | 'RESOLVED'
        created_at: string
      }

      const allergyItems = ((patientAllergies as unknown as DbAllergyRow[]) || []).map((a) => ({
        id: a.id,
        substance: a.substance,
        reaction: a.reaction,
        severity: a.severity,
        status: a.status,
        createdAt: a.created_at,
      }))

      patientsList.push({
        id: p.id,
        name: p.full_name,
        birthDate: p.birth_date,
        age: calculateAge(p.birth_date),
        biologicalSex: p.biological_sex,
        identifier: p.cpf_masked || p.email || 'Documento Protegido',
        phone: p.phone,
        isPrimary: link.is_primary,
        confirmedHistory,
        pendingRecords: pendingItems,
        documents: documentItems,
        conditions: conditionItems,
        medications: medicationItems,
        allergies: allergyItems,
      })
    }
  } else {
    // Fallback gracioso de transição: se ainda não houver links ativos mas houver pacientes legados
    const { data: legacyDoctor } = await supabase
      .from('doctors')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (legacyDoctor) {
      const { data: legacyPatients } = await supabase
        .from('patients')
        .select(`
          id,
          birth_date,
          gender,
          current_weight,
          users (name, email, phone),
          clinical_history (
            id,
            exam_date,
            creatinine,
            calculated_egfr,
            ckd_stage
          )
        `)
        .eq('assigned_doctor_id', legacyDoctor.id)

      if (legacyPatients) {
        for (const lp of legacyPatients) {
          const u = Array.isArray(lp.users) ? lp.users[0] : lp.users
          const history: ClinicalRecordItem[] = (lp.clinical_history || []).map((ch: any) => ({
            id: ch.id,
            date: ch.exam_date,
            creatinine: ch.creatinine,
            eGFR: ch.calculated_egfr,
            stage: ch.ckd_stage,
            source: 'LEGACY_HISTORY',
          }))

          patientsList.push({
            id: lp.id,
            name: u?.name || 'Paciente',
            birthDate: lp.birth_date,
            age: calculateAge(lp.birth_date),
            biologicalSex: lp.gender === 'male' ? 'M' : 'F',
            identifier: u?.email || 'Sem documento',
            phone: u?.phone || null,
            isPrimary: true,
            confirmedHistory: history,
            pendingRecords: [],
          })
        }
      }
    }
  }

  return (
    <div className="space-y-8 p-4 sm:p-6 max-w-7xl mx-auto font-sans">
      <DoctorDashboardClient patients={patientsList} doctorName={doctorName} isMaster={isMaster} />
    </div>
  )
}
