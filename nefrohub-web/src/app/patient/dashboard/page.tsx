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
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/metric-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Activity, Scale, Droplet, Clock, ShieldCheck, Heart, Calendar } from 'lucide-react'
import { PatientUpdateForm, PatientSubmissionsTabs, SubmissionItem } from './PatientClientComponents'
import { PatientRepresentationsList, RepresentationDisplayItem } from './PatientRepresentationsList'
import { PatientDocumentsList, DocumentDisplayItem } from './PatientDocumentsList'
import { PatientClinicalSummary, PatientConditionItem, PatientMedicationItem } from './PatientClinicalSummary'

export default async function PatientDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // 1. Identificar o Perfil do Paciente Associado (Titular ou Delegado por Representação Legal)
  let patient: {
    id: string
    full_name: string
    phone: string | null
    birth_date?: string
    current_weight?: number | null
  } | null = null

  let isDelegated = false
  let delegatedInfo: {
    relationshipType: string
    authorityType: string
    validUntil?: string | null
  } | null = null

  const { data: profile } = await supabase
    .from('patient_profiles')
    .select('id, full_name, phone, birth_date')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile) {
    patient = {
      id: profile.id,
      full_name: profile.full_name,
      phone: profile.phone,
      birth_date: profile.birth_date,
    }
  } else {
    const { data: legacy } = await supabase
      .from('patients')
      .select('id, current_weight, birth_date, users(name, phone)')
      .eq('user_id', user.id)
      .maybeSingle()

    if (legacy) {
      const u = Array.isArray(legacy.users) ? legacy.users[0] : legacy.users
      patient = {
        id: legacy.id,
        full_name: u?.name || 'Paciente',
        phone: u?.phone || null,
        birth_date: legacy.birth_date,
        current_weight: legacy.current_weight,
      }
    } else {
      // 1.1. Buscar acesso delegado ativo em patient_representations (PRD Seção 2.6 e 5)
      const today = new Date().toISOString().split('T')[0]
      const { data: rep } = await supabase
        .from('patient_representations')
        .select(`
          id,
          relationship_type,
          authority_type,
          scope,
          status,
          valid_until,
          patient_profiles:patient_id (
            id,
            full_name,
            phone,
            birth_date
          )
        `)
        .eq('representative_user_id', user.id)
        .eq('status', 'ACTIVE')
        .or(`valid_until.is.null,valid_until.gte.${today}`)
        .limit(1)
        .maybeSingle()

      if (rep && rep.patient_profiles) {
        const p = Array.isArray(rep.patient_profiles) ? rep.patient_profiles[0] : rep.patient_profiles
        if (p) {
          patient = {
            id: p.id,
            full_name: p.full_name,
            phone: p.phone,
            birth_date: p.birth_date,
          }
          isDelegated = true
          delegatedInfo = {
            relationshipType: rep.relationship_type,
            authorityType: rep.authority_type,
            validUntil: rep.valid_until,
          }
        }
      }
    }
  }

  if (!patient) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <EmptyState
          icon={<Clock className="w-8 h-8 text-amber-500" />}
          title="Prontuário em vinculação"
          description="Seu perfil de paciente está sendo associado pela unidade hospitalar. Entre em contato com seu médico responsável para ativar o acompanhamento."
        />
      </div>
    )
  }

  // 2. Buscar último exame CONFIRMADO no Prontuário Oficial (clinical_records CONFIRMED)
  let latestLab = { egfr: '--', creatinine: '--', stage: '--', date: '-' }

  const { data: confirmedRecord } = await supabase
    .from('clinical_records')
    .select(`
      id,
      clinical_date,
      lab_results (exam_name, numeric_value, normalized_value)
    `)
    .eq('patient_id', patient.id)
    .eq('status', 'CONFIRMED')
    .order('clinical_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (confirmedRecord && confirmedRecord.lab_results && confirmedRecord.lab_results.length > 0) {
    const creatinina = confirmedRecord.lab_results.find((l: any) =>
      l.exam_name?.toLowerCase().includes('creatinina')
    )?.numeric_value

    const egfrVal = confirmedRecord.lab_results.find((l: any) =>
      l.exam_name?.toLowerCase().includes('tfg') || l.exam_name?.toLowerCase().includes('egfr')
    )?.numeric_value

    if (creatinina) {
      latestLab.creatinine = String(creatinina)
      latestLab.date = new Date(confirmedRecord.clinical_date).toLocaleDateString('pt-BR')
    }
    if (egfrVal) {
      latestLab.egfr = String(egfrVal)
    }
  } else {
    const { data: legacyHistory } = await supabase
      .from('clinical_history')
      .select('*')
      .eq('patient_id', patient.id)
      .order('exam_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (legacyHistory) {
      latestLab = {
        egfr: legacyHistory.calculated_egfr ? String(legacyHistory.calculated_egfr) : '--',
        creatinine: legacyHistory.creatinine ? String(legacyHistory.creatinine) : '--',
        stage: legacyHistory.ckd_stage || '--',
        date: new Date(legacyHistory.exam_date).toLocaleDateString('pt-BR'),
      }
    }
  }

  // 3. Buscar Submissões do Paciente nas 3 máquinas de estado (Fase 3.3)
  // 3.1. Pendentes
  const { data: pendingRecords } = await supabase
    .from('clinical_records')
    .select(`
      id,
      clinical_date,
      created_at,
      status,
      vital_signs (sign_code, numeric_value, unit)
    `)
    .eq('patient_id', patient.id)
    .eq('status', 'PENDING_VALIDATION')
    .order('created_at', { ascending: false })
    .limit(10)

  // 3.2. Rejeitadas (com eventos e motivos de descarte - Seção 6.5)
  const { data: rejectedRecords } = await supabase
    .from('clinical_records')
    .select(`
      id,
      clinical_date,
      created_at,
      status,
      vital_signs (sign_code, numeric_value, unit)
    `)
    .eq('patient_id', patient.id)
    .eq('status', 'REJECTED')
    .order('created_at', { ascending: false })
    .limit(10)

  // Buscar os eventos de rejeição para enriquecer as justificativas clínicas
  const { data: rejectionEvents } = await supabase
    .from('rejected_submission_events')
    .select(`
      id,
      rejection_code,
      rejection_reason,
      created_at,
      reviewed_by_user_id,
      users:reviewed_by_user_id (name)
    `)
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // 3.3. Confirmadas de Sinais Vitais
  const { data: confirmedVitalsRecords } = await supabase
    .from('clinical_records')
    .select(`
      id,
      clinical_date,
      created_at,
      status,
      vital_signs (sign_code, numeric_value, unit)
    `)
    .eq('patient_id', patient.id)
    .eq('status', 'CONFIRMED')
    .eq('record_type', 'VITAL_SIGNS')
    .order('clinical_date', { ascending: false })
    .limit(10)

  // 3.4. Representantes Legais e Cuidadores Vinculados (Fase 4.1)
  const { data: repsData } = await supabase
    .from('patient_representations')
    .select(`
      id,
      relationship_type,
      authority_type,
      status,
      valid_until,
      created_at,
      users:representative_user_id (name, email)
    `)
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })

  const representationsList: RepresentationDisplayItem[] = (repsData || []).map((rep: any) => {
    const u = Array.isArray(rep.users) ? rep.users[0] : rep.users
    return {
      id: rep.id,
      name: u?.name || 'Cuidador',
      email: u?.email || '',
      relationshipType: rep.relationship_type,
      authorityType: rep.authority_type,
      status: rep.status,
      validUntil: rep.valid_until,
      createdAt: rep.created_at,
    }
  })

  // 3.5. Documentos Clínicos e Laudos Digitalizados (Fase 4.2)
  const { data: docsData } = await supabase
    .from('documents')
    .select('id, title, document_type, mime_type, file_size_bytes, sha256_hash, validation_status, rejection_reason, created_at')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })

  const documentsList: DocumentDisplayItem[] = (docsData || []).map((d: any) => ({
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

  // 3.6. Comorbidades e Medicamentos de Uso Contínuo (Fase 4.3 - Somente Leitura)
  const { data: conditionsData } = await supabase
    .from('conditions')
    .select('id, name, cid10, onset_date, status, notes, created_at')
    .eq('patient_id', patient.id)
    .eq('validation_status', 'CONFIRMED')
    .order('created_at', { ascending: false })

  interface PatientConditionDbRow {
    id: string
    name: string
    cid10: string | null
    onset_date: string | null
    status: 'ACTIVE' | 'RESOLVED' | 'INACTIVE'
    notes: string | null
    created_at: string
  }

  const conditionsList: PatientConditionItem[] = ((conditionsData as unknown as PatientConditionDbRow[]) || []).map((c) => ({
    id: c.id,
    name: c.name,
    cid10: c.cid10,
    onsetDate: c.onset_date,
    status: c.status,
    notes: c.notes,
    createdAt: c.created_at,
  }))

  const { data: medsData } = await supabase
    .from('medications')
    .select('id, name, dosage, unit, route, frequency, start_date, end_date, status, notes, created_at')
    .eq('patient_id', patient.id)
    .eq('validation_status', 'CONFIRMED')
    .order('created_at', { ascending: false })

  interface PatientMedicationDbRow {
    id: string
    name: string
    dosage: string | null
    unit: string | null
    route: string | null
    frequency: string | null
    start_date: string | null
    end_date: string | null
    status: 'ACTIVE' | 'SUSPENDED' | 'DISCONTINUED'
    notes: string | null
    created_at: string
  }

  const medicationsList: PatientMedicationItem[] = ((medsData as unknown as PatientMedicationDbRow[]) || []).map((m) => ({
    id: m.id,
    name: m.name,
    dosage: m.dosage,
    unit: m.unit,
    route: m.route,
    frequency: m.frequency,
    startDate: m.start_date,
    endDate: m.end_date,
    status: m.status,
    notes: m.notes,
    createdAt: m.created_at,
  }))

  // 3.7. Alergias e Reações Adversas com Triplo Estado (documentation.md Seção 8.6 - RF-054)
  const supabaseAdmin = getAdminClient()
  const { data: allergiesData } = await supabaseAdmin
    .from('allergies')
    .select('id, substance, reaction, severity, status, created_at')
    .eq('patient_id', patient.id)
    .order('created_at', { ascending: false })

  const allergiesList = (allergiesData || []).map((a: any) => ({
    id: a.id,
    substance: a.substance,
    reaction: a.reaction,
    severity: a.severity,
    status: a.status,
    createdAt: a.created_at,
  }))

  // Mapear listas para o componente com tipagem estrita
  const mapRecordToSubmission = (rec: any, isRejected = false): SubmissionItem => {
    const weight = rec.vital_signs?.find((v: any) => v.sign_code === 'WEIGHT')?.numeric_value
    const sys = rec.vital_signs?.find((v: any) => v.sign_code === 'BP_SYSTOLIC')?.numeric_value
    const dia = rec.vital_signs?.find((v: any) => v.sign_code === 'BP_DIASTOLIC')?.numeric_value

    let rejectionCode: string | null = null
    let rejectionReason: string | null = null
    let doctorName: string | null = null
    let reviewedAt: string | null = null

    if (isRejected && rejectionEvents && rejectionEvents.length > 0) {
      // Pega o evento de descarte mais recente correspondente
      const evt = rejectionEvents[0]
      rejectionCode = evt.rejection_code
      rejectionReason = evt.rejection_reason
      reviewedAt = evt.created_at
      const doc = Array.isArray(evt.users) ? evt.users[0] : evt.users
      doctorName = doc?.name ? `Dr(a). ${doc.name}` : null
    }

    return {
      id: rec.id,
      clinicalDate: rec.clinical_date,
      createdAt: rec.created_at,
      status: rec.status,
      weight,
      bpSystolic: sys,
      bpDiastolic: dia,
      rejectionCode,
      rejectionReason,
      reviewedByDoctorName: doctorName,
      reviewedAt,
    }
  }

  const pendingList = (pendingRecords || []).map((r) => mapRecordToSubmission(r))
  const rejectedList = (rejectedRecords || []).map((r) => mapRecordToSubmission(r, true))
  const confirmedList = (confirmedVitalsRecords || []).map((r) => mapRecordToSubmission(r))

  // 4. Buscar último peso confirmado registrado
  const { data: latestVitalSign } = await supabase
    .from('vital_signs')
    .select('numeric_value, clinical_records!inner(status)')
    .eq('clinical_records.patient_id', patient.id)
    .eq('clinical_records.status', 'CONFIRMED')
    .eq('sign_code', 'WEIGHT')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const currentConfirmedWeight = latestVitalSign?.numeric_value ?? patient.current_weight ?? null

  return (
    <div className="space-y-8 font-sans">
      {/* Banner de Modo Delegado (PRD Seção 2.6 e 5) */}
      {isDelegated && delegatedInfo && (
        <div className="p-4 bg-primary-light/70 border border-primary/30 rounded-2xl flex items-start gap-3 card-subtle animate-in fade-in duration-150">
          <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div className="text-xs text-foreground space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="font-bold text-primary font-heading text-sm">
                Acesso Clínico Delegado (Representação Legal)
              </span>
              <Badge variant="primary" size="sm">
                {delegatedInfo.authorityType === 'FULL'
                  ? 'Poderes Totais'
                  : delegatedInfo.authorityType === 'CONSULT_ONLY'
                  ? 'Apenas Consulta'
                  : 'Envio de Sinais Vitais'}
              </Badge>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Você está acessando o prontuário de <strong>{patient.full_name}</strong> com perfil de representante autorizado (vínculo: <strong>{delegatedInfo.relationshipType}</strong>).
              {delegatedInfo.validUntil && (
                <span> Validade da autorização: <strong>{new Date(delegatedInfo.validUntil + 'T00:00:00').toLocaleDateString('pt-BR')}</strong>.</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Header do Dashboard do Paciente */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-heading">
            Olá, {patient.full_name.split(' ')[0]}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            {isDelegated
              ? `Visualizando o acompanhamento renal de ${patient.full_name}.`
              : 'Acompanhe a estabilidade da sua função renal e envie suas medições domiciliares com segurança.'}
          </p>
        </div>
        <Badge variant="success" size="md" dot>
          Prontuário Ativo
        </Badge>
      </div>

      {/* Faixa Informativa sobre Imutabilidade e Curadoria */}
      <div className="p-4 rounded-xl bg-[#1A252C] text-slate-100 text-xs flex items-start gap-3 border border-[#26353E]">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-white">Transparência e Curadoria Médica (Lei nº 13.787/2018)</p>
          <p className="text-slate-300 mt-0.5 leading-relaxed">
            As medições aferidas em domicílio passam por conferência prévia do médico assistente. Somente após a validação clínica elas integram a série histórica definitiva do prontuário.
          </p>
        </div>
      </div>

      {/* Indicadores Clínicos Confirmados (Metric Cards) */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          title="Última TFGe"
          value={latestLab.egfr}
          unit="mL/min/1.73m²"
          subtitle="Taxa de Filtração Glomerular (CKD-EPI 2021)"
          variant="primary"
          icon={<Activity className="w-4 h-4" />}
        />

        <MetricCard
          title="Creatinina Sérica"
          value={latestLab.creatinine}
          unit="mg/dL"
          subtitle={`Aferida em: ${latestLab.date} (Dado Confirmado)`}
          variant="success"
          icon={<Droplet className="w-4 h-4" />}
        />

        <MetricCard
          title="Classificação KDIGO"
          value={latestLab.stage}
          subtitle="Estágio da Doença Renal Crônica"
          variant="default"
          icon={<Activity className="w-4 h-4" />}
        />
      </div>

      {/* Grid Principal: Submissões em Abas vs Formulário de Aferição */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Esquerda: Histórico e Feedback de Submissões em Abas (2 colunas) */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-border card-subtle">
            <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Histórico de Envios Domiciliares
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Minhas Submissões (Fila de Validação Médica)
                  </p>
                </div>
                <Badge variant="outline" size="sm">
                  Transparência de Curadoria
                </Badge>
              </div>
              <CardDescription className="text-xs text-muted-foreground">
                Acompanhe o status e as justificativas médicas das aferições domiciliares
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <PatientSubmissionsTabs
                pendingList={pendingList}
                rejectedList={rejectedList}
                confirmedList={confirmedList}
              />
            </CardContent>
          </Card>
        </div>

        {/* Direita: Formulário de Nova Submissão (1 coluna) */}
        <div>
          {isDelegated && delegatedInfo?.authorityType === 'CONSULT_ONLY' ? (
            <Card className="border-border card-subtle">
              <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Registrar Medição
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Envio restrito a consulta
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <EmptyState
                  icon={<ShieldCheck className="w-6 h-6 text-muted-foreground/60" />}
                  title="Apenas Leitura Autorizada"
                  description="Seu poder de representação concedido é exclusivo para consulta de informações clínicas. Para submeter dados domiciliares, solicite alteração de poderes ao paciente titular."
                  className="border-0 bg-transparent py-2"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border card-subtle">
              <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <Scale className="w-4 h-4 text-primary" />
                  <CardTitle className="text-sm font-semibold text-foreground">
                    Registrar Medição
                  </CardTitle>
                </div>
                <CardDescription className="text-xs text-muted-foreground">
                  Envie suas aferições de peso e pressão arterial
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <PatientUpdateForm
                  initialWeight={currentConfirmedWeight}
                  initialPhone={patient.phone}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Seção de Laudos e Documentos Clínicos Digitalizados (Fase 4.2) */}
      <PatientDocumentsList documents={documentsList} patientId={patient.id} />

      {/* Seção de Comorbidades, Medicamentos e Alergias (Fase 4.3 & Incremento 2) */}
      <PatientClinicalSummary
        conditions={conditionsList}
        medications={medicationsList}
        allergies={allergiesList}
      />

      {/* Seção de Cuidadores & Representantes Legais (Fase 4.1 - Apenas para o titular gerenciar) */}
      {!isDelegated && (
        <PatientRepresentationsList representations={representationsList} />
      )}
    </div>
  )
}
