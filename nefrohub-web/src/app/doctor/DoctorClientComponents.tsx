'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { confirmClinicalRecordAction, rejectClinicalRecordAction, assumeDoctorMasterCoverageAction } from './actions'
import {
  getSignedDocumentUrlAction,
  confirmDocumentAction,
  rejectDocumentAction,
} from '@/app/patient/dashboard/documentActions'
import { UploadDocumentModal } from '@/app/patient/dashboard/UploadDocumentModal'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { NewLabExamModal } from './NewLabExamModal'
import {
  PatientConditionsSection,
  ConditionDisplayItem,
} from './PatientConditionsSection'
import {
  PatientMedicationsSection,
  MedicationDisplayItem,
} from './PatientMedicationsSection'
import {
  PatientAllergiesSection,
  AllergyDisplayItem,
} from './PatientAllergiesSection'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  ShieldCheck,
  User,
  Heart,
  Scale,
  Calendar,
  AlertCircle,
  ChevronRight,
  Inbox,
  Search,
  X,
  FileText,
  ExternalLink,
} from 'lucide-react'

export interface ClinicalRecordItem {
  id: string
  date: string
  creatinine?: number | null
  eGFR?: number | null
  stage?: string | null
  weight?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
  source: string
}

export interface PendingRecordItem {
  id: string
  date: string
  createdAt: string
  recordType: string
  weight?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
}

export interface DocumentItem {
  id: string
  title: string
  documentType: string
  mimeType: string
  fileSizeBytes: number
  sha256Hash: string
  validationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  rejectionReason?: string | null
  createdAt: string
}

export interface AuthorizedPatient {
  id: string
  name: string
  birthDate: string
  age: number
  biologicalSex: 'M' | 'F'
  identifier: string
  phone: string | null
  isPrimary: boolean
  confirmedHistory: ClinicalRecordItem[]
  pendingRecords: PendingRecordItem[]
  documents?: DocumentItem[]
  conditions?: ConditionDisplayItem[]
  medications?: MedicationDisplayItem[]
  allergies?: AllergyDisplayItem[]
}

interface DoctorDashboardProps {
  patients: AuthorizedPatient[]
  doctorName?: string
  isMaster?: boolean
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

export function DoctorDashboardClient({
  patients,
  doctorName = 'Dr(a). Clínico',
  isMaster = false,
}: DoctorDashboardProps) {
  // Estado de Busca com Debounce (Fase 3.1 - Parte B)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Estados para Cobertura Emergencial do Doctor Master (documentation.md Seção 2.4 - RF-004)
  const [isMasterCoverageModalOpen, setIsMasterCoverageModalOpen] = useState(false)
  const [coveragePatientId, setCoveragePatientId] = useState('')
  const [coverageJustification, setCoverageJustification] = useState('')
  const [coverageType, setCoverageType] = useState<'PLANTÃO' | 'SUBSTITUIÇÃO' | 'INTERCORRÊNCIA' | 'COORDENAÇÃO'>('PLANTÃO')
  const [coverageError, setCoverageError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Filtragem estrita sobre os pacientes autorizados pelo servidor
  const filteredPatients = useMemo(() => {
    if (!debouncedSearch.trim()) return patients

    const cleanQuery = normalizeSearchText(debouncedSearch)
    const digitsOnlyQuery = debouncedSearch.replace(/\D/g, '')

    return patients.filter((p) => {
      const matchName = normalizeSearchText(p.name).includes(cleanQuery)
      const matchIdentifier = p.identifier.toLowerCase().includes(cleanQuery)
      const matchDigits = digitsOnlyQuery.length >= 2 && p.identifier.replace(/\D/g, '').includes(digitsOnlyQuery)
      return matchName || matchIdentifier || matchDigits
    })
  }, [patients, debouncedSearch])

  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    patients.length > 0 ? patients[0].id : null
  )

  // Ajusta a seleção caso o paciente ativo não esteja na busca
  useEffect(() => {
    if (filteredPatients.length > 0) {
      const exists = filteredPatients.some((p) => p.id === selectedPatientId)
      if (!exists) {
        setSelectedPatientId(filteredPatients[0].id)
      }
    } else {
      setSelectedPatientId(null)
    }
  }, [filteredPatients, selectedPatientId])

  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionCode, setRejectionCode] = useState<'INVALID_VALUE' | 'DUPLICATE' | 'UNREADABLE' | 'INCOMPLETE' | 'OTHER'>('INVALID_VALUE')

  const selectedPatient = patients.find((p) => p.id === selectedPatientId) || null

  const handleConfirm = (recordId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await confirmClinicalRecordAction(recordId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Registro clínico validado e confirmado com sucesso.' })
      }
    })
  }

  const handleReject = (recordId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await rejectClinicalRecordAction(recordId, rejectionCode)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Submissão rejeitada conforme protocolo clínico.' })
        setRejectingId(null)
      }
    })
  }

  const [openingDocId, setOpeningDocId] = useState<string | null>(null)

  const handleOpenDoc = (docId: string) => {
    setOpeningDocId(docId)
    startTransition(async () => {
      const res = await getSignedDocumentUrlAction(docId)
      setOpeningDocId(null)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else if (res.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer')
      }
    })
  }

  const handleConfirmDoc = (docId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await confirmDocumentAction(docId)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Laudo confirmado no prontuário!' })
    })
  }

  const handleRejectDoc = (docId: string) => {
    const reason = prompt('Informe a justificativa clínica de recusa do laudo/documento:')
    if (!reason || reason.trim() === '') return

    setFeedback(null)
    startTransition(async () => {
      const res = await rejectDocumentAction(docId, reason)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Laudo recusado.' })
    })
  }

  const handleAssumeCoverage = (e: React.FormEvent) => {
    e.preventDefault()
    setCoverageError(null)

    if (!coveragePatientId.trim()) {
      setCoverageError('Informe o identificador único (UUID) do paciente.')
      return
    }

    if (!coverageJustification.trim() || coverageJustification.trim().length < 15) {
      setCoverageError('A justificativa clínica de cobertura emergencial deve ter no mínimo 15 caracteres.')
      return
    }

    startTransition(async () => {
      const res = await assumeDoctorMasterCoverageAction({
        patientId: coveragePatientId.trim(),
        justification: coverageJustification.trim(),
        coverageType,
      })

      if (res.error) {
        setCoverageError(res.error)
      } else {
        setFeedback({ type: 'success', message: res.message || 'Cobertura emergencial ativada com sucesso.' })
        setIsMasterCoverageModalOpen(false)
        setCoveragePatientId('')
        setCoverageJustification('')
      }
    })
  }

  // Prepara dados para o Recharts (ordem cronológica crescente)
  const chartData = (selectedPatient?.confirmedHistory || [])
    .filter((h) => h.eGFR != null || h.creatinine != null)
    .map((h) => ({
      date: new Date(h.date).toLocaleDateString('pt-BR'),
      eGFR: h.eGFR,
      creatinine: h.creatinine,
    }))
    .reverse()

  return (
    <div className="space-y-6 font-sans">
      {/* Alerta de Feedback Reativo */}
      {feedback && (
        <div
          role="alert"
          className={`p-4 text-xs font-medium rounded-xl flex items-center justify-between shadow-xs animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border border-emerald-200'
              : 'bg-red-50 text-red-900 border border-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 p-1 text-sm leading-none"
            aria-label="Fechar notificação"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner Institucional do Doctor Master (RF-004 - documentation.md Seção 2.4) */}
      {isMaster && (
        <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-indigo-950">Coordenação Clínica (Doctor Master)</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  PRD Seção 2.4
                </span>
              </div>
              <p className="text-xs text-indigo-700 leading-snug">
                Autorização para cobertura clínica assistencial excepcional e substituição com justificativa auditável.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setCoverageError(null)
              setIsMasterCoverageModalOpen(true)
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shrink-0 cursor-pointer shadow-xs"
          >
            Assumir Cobertura Emergencial
          </Button>
        </div>
      )}

      {/* Modal de Cobertura Emergencial do Doctor Master (RF-004) */}
      {isMasterCoverageModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">Ativação de Cobertura Clínica</h3>
              </div>
              <button
                onClick={() => setIsMasterCoverageModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              O papel de Doctor Master permite assumir temporariamente o prontuário de pacientes em regime de plantão, intercorrência ou substituição. Toda ativação gera registro de auditoria imutável (PRD Seções 2.4 e 15.4).
            </p>

            {coverageError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <span>{coverageError}</span>
              </div>
            )}

            <form onSubmit={handleAssumeCoverage} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  ID do Paciente (UUID) <span className="text-red-500">*</span>
                </label>
                <Input
                  required
                  placeholder="Ex: 550e8400-e29b-41d4-a716-446655440000"
                  value={coveragePatientId}
                  onChange={(e) => setCoveragePatientId(e.target.value)}
                  className="font-mono text-xs rounded-xl"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Tipo de Cobertura <span className="text-red-500">*</span>
                </label>
                <select
                  value={coverageType}
                  onChange={(e) => setCoverageType(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="PLANTÃO">Plantão Nefrológico / Cobertura Horária</option>
                  <option value="INTERCORRÊNCIA">Intercorrência Clínica / Urgência</option>
                  <option value="SUBSTITUIÇÃO">Substituição por Ausência do Titular</option>
                  <option value="COORDENAÇÃO">Coordenação Clínica / Revisão Institucional</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Justificativa Clínica Obrigatória (mínimo 15 caracteres) <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Descreva o motivo assistencial formal para o acesso excepcional ao prontuário..."
                  value={coverageJustification}
                  onChange={(e) => setCoverageJustification(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsMasterCoverageModalOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold"
                >
                  {isPending ? 'Registrando cobertura...' : 'Ativar e Acessar Prontuário'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grid Principal: Lista e Busca de Pacientes à Esquerda / Detalhes Clínicos à Direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna 1: Pacientes Vinculados com Busca (4 colunas) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-slate-800">
                  Pacientes em Acompanhamento
                </CardTitle>
                <Badge variant="primary" size="sm">
                  {filteredPatients.length} de {patients.length}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500">
                Acesso estrito por vínculo ativo formal (Zero-Trust)
              </CardDescription>

              {/* Campo de Busca Clínica com Debounce (Parte B) */}
              <div className="mt-3 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-3.5 h-3.5" />
                </div>
                <Input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por nome ou documento..."
                  className="pl-9 pr-8 h-9 text-xs bg-white border-slate-200 focus-ring rounded-xl"
                  aria-label="Buscar paciente vinculado"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
                    aria-label="Limpar campo de busca"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {patients.length === 0 ? (
                <EmptyState
                  icon={<Inbox className="w-6 h-6 text-slate-400" />}
                  title="Nenhum paciente vinculado"
                  description="Você ainda não possui pacientes com vínculo ativo atribuídos a você."
                  className="m-4 border-0 bg-transparent"
                />
              ) : filteredPatients.length === 0 ? (
                <div className="p-6 text-center">
                  <EmptyState
                    icon={<Search className="w-5 h-5 text-slate-400" />}
                    title="Nenhum resultado"
                    description={`Nenhum paciente corresponde ao termo pesquisado.`}
                    action={
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 mt-2"
                        onClick={() => setSearchTerm('')}
                      >
                        Limpar busca
                      </Button>
                    }
                    className="border-0 bg-transparent p-2"
                  />
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-[640px] overflow-y-auto">
                  {filteredPatients.map((patient) => {
                    const isSelected = patient.id === selectedPatientId
                    const pendingCount = patient.pendingRecords.length

                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => {
                          setSelectedPatientId(patient.id)
                          setFeedback(null)
                          setRejectingId(null)
                        }}
                        className={`w-full text-left p-3.5 transition-all duration-150 flex items-center justify-between focus-ring rounded-lg ${
                          isSelected
                            ? 'bg-primary-light/80 border-l-3 border-primary text-foreground font-medium shadow-2xs'
                            : 'hover:bg-secondary/50 text-foreground'
                        }`}
                      >
                        <div className="truncate pr-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-xs truncate text-foreground">
                              {patient.name}
                            </span>
                            {patient.isPrimary && (
                              <Badge variant="primary" size="sm">
                                Primário
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5 tabular-clinical">
                            {patient.age} anos • {patient.biologicalSex === 'M' ? 'Masc' : 'Fem'} • {patient.identifier}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {pendingCount > 0 && (
                            <Badge variant="warning" size="sm" dot>
                              {pendingCount}
                            </Badge>
                          )}
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/60" />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna 2: Prontuário e Fila Clínica do Paciente Selecionado (8 colunas) */}
        <div className="lg:col-span-8 space-y-6">
          {!selectedPatient ? (
            <Card className="border-slate-200">
              <EmptyState
                icon={<User className="w-8 h-8 text-slate-400" />}
                title="Nenhum paciente selecionado"
                description={
                  searchTerm
                    ? "Ajuste os termos de busca para localizar e selecionar um paciente."
                    : "Escolha um paciente na lista ao lado para acessar a fila clínica e os gráficos de evolução."
                }
              />
            </Card>
          ) : (
            <>
              {/* Card de Identificação do Paciente Selecionado */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-blue-600" />
                    <h2 className="text-lg font-bold text-slate-900">{selectedPatient.name}</h2>
                    <Badge variant="success" size="sm" dot>
                      Vínculo Ativo
                    </Badge>
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 flex flex-wrap gap-4 tabular-clinical">
                    <span>Nascimento: <strong>{new Date(selectedPatient.birthDate).toLocaleDateString('pt-BR')}</strong> ({selectedPatient.age} anos)</span>
                    <span>Sexo Biológico: <strong>{selectedPatient.biologicalSex === 'M' ? 'Masculino' : 'Feminino'}</strong></span>
                    <span>Documento: <strong className="font-mono">{selectedPatient.identifier}</strong></span>
                    {selectedPatient.phone && <span>Contato: <strong>{selectedPatient.phone}</strong></span>}
                  </div>
                </div>

                <NewLabExamModal
                  patientId={selectedPatient.id}
                  patientName={selectedPatient.name}
                  birthDate={selectedPatient.birthDate}
                  biologicalSex={selectedPatient.biologicalSex}
                />
              </div>

              {/* 1. FILA DE REVISÃO CLÍNICA: Registros PENDING_VALIDATION (Seção 6.3 e 7.1) */}
              {selectedPatient.pendingRecords.length > 0 && (
                <Card className="border-warning/30 bg-warning-bg/20 card-subtle">
                  <CardHeader className="bg-warning-bg/40 border-b border-warning/25 pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-warning-foreground">
                        <Clock className="w-4 h-4 text-warning" />
                        <CardTitle className="text-sm font-bold">
                          Fila Clínica: Submissões Aguardando Validação ({selectedPatient.pendingRecords.length})
                        </CardTitle>
                      </div>
                      <Badge variant="warning" size="sm">
                        PENDING_VALIDATION
                      </Badge>
                    </div>
                    <CardDescription className="text-xs text-warning-foreground/80">
                      Medições domiciliares enviadas pelo paciente que requerem curadoria médica antes de ingressar no prontuário imutável
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    {selectedPatient.pendingRecords.map((pend) => (
                      <div
                        key={pend.id}
                        className="p-4 bg-card rounded-xl border border-warning/30 card-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs font-semibold text-foreground">
                              Aferição em {new Date(pend.date).toLocaleDateString('pt-BR')}
                            </span>
                            <span className="text-[11px] text-muted-foreground tabular-clinical">
                              (Enviado em {new Date(pend.createdAt).toLocaleString('pt-BR')})
                            </span>
                          </div>
                          <div className="text-xs text-foreground mt-1 flex flex-wrap gap-4 tabular-clinical">
                            {pend.weight && (
                              <span className="flex items-center gap-1">
                                <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                                Peso: <strong className="text-foreground">{pend.weight} kg</strong>
                              </span>
                            )}
                            {pend.bpSystolic && pend.bpDiastolic && (
                              <span className="flex items-center gap-1">
                                <Heart className="w-3.5 h-3.5 text-destructive" />
                                Pressão Arterial: <strong className="text-foreground">{pend.bpSystolic}x{pend.bpDiastolic} mmHg</strong>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Ações de Curadoria Clínica com Bloqueio Otimista */}
                        <div className="flex items-center gap-2 shrink-0">
                          {rejectingId === pend.id ? (
                            <div className="flex items-center gap-2 bg-card p-2 rounded-xl border border-border card-elevated">
                              <select
                                value={rejectionCode}
                                onChange={(e) => setRejectionCode(e.target.value as any)}
                                className="text-xs border border-border rounded-lg p-1.5 bg-card text-foreground focus-ring"
                              >
                                <option value="INVALID_VALUE">Valor Inválido</option>
                                <option value="DUPLICATE">Duplicado</option>
                                <option value="UNREADABLE">Ilegível</option>
                                <option value="INCOMPLETE">Incompleto</option>
                                <option value="OTHER">Outro</option>
                              </select>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-8 text-xs font-medium focus-ring"
                                disabled={isPending}
                                onClick={() => handleReject(pend.id)}
                              >
                                Confirmar Rejeição
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-medium"
                                onClick={() => setRejectingId(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-destructive border-destructive/25 hover:bg-destructive-bg focus-ring"
                                disabled={isPending}
                                onClick={() => setRejectingId(pend.id)}
                              >
                                <XCircle className="w-3.5 h-3.5 mr-1" /> Rejeitar
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-success hover:bg-success/90 text-success-foreground font-semibold focus-ring"
                                disabled={isPending}
                                onClick={() => handleConfirm(pend.id)}
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirmar no Prontuário
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* 2. GRÁFICO DE EVOLUÇÃO LONGITUDINAL RENAL */}
              <Card className="border-slate-200 shadow-xs">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-slate-800">
                      Curva de Evolução Longitudinal Renal
                    </CardTitle>
                    <Badge variant="outline" size="sm">
                      TFGe (CKD-EPI 2021) vs Creatinina Sérica
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-64 w-full">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E4EAED" />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#687780' }} />
                          <YAxis
                            yAxisId="left"
                            tick={{ fontSize: 11, fill: '#687780' }}
                            label={{ value: 'TFGe (mL/min)', angle: -90, position: 'insideLeft', fontSize: 11, fill: '#687780' }}
                          />
                          <YAxis
                            yAxisId="right"
                            orientation="right"
                            tick={{ fontSize: 11, fill: '#687780' }}
                            label={{ value: 'Creatinina (mg/dL)', angle: 90, position: 'insideRight', fontSize: 11, fill: '#687780' }}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#ffffff', borderRadius: '0.75rem', borderColor: '#E4EAED', fontSize: '0.75rem', color: '#24323A', boxShadow: '0 4px 12px -2px rgba(36, 50, 58, 0.08)' }}
                          />
                          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: '8px' }} />
                          <Line
                            yAxisId="left"
                            type="monotone"
                            dataKey="eGFR"
                            stroke="#367C83"
                            strokeWidth={2.5}
                            name="TFGe (CKD-EPI 2021)"
                            dot={{ r: 4, fill: '#367C83' }}
                          />
                          <Line
                            yAxisId="right"
                            type="monotone"
                            dataKey="creatinine"
                            stroke="#B95353"
                            strokeWidth={2}
                            name="Creatinina Sérica"
                            dot={{ r: 4, fill: '#B95353' }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyState
                        icon={<Activity className="w-6 h-6 text-slate-400" />}
                        title="Sem série histórica confirmada"
                        description="Nenhum exame laboratorial confirmado disponível para traçar a curva temporal."
                        className="h-full border-0 bg-transparent"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 3. HISTÓRICO DE REGISTROS CONFIRMADOS (Prontuário Imutável) */}
              <Card className="border-slate-200 shadow-xs">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-semibold text-slate-800">
                        Histórico Clínico Confirmado (Imutável)
                      </CardTitle>
                      <CardDescription className="text-xs text-slate-500">
                        Registros auditados com retenção de 20 anos (Lei 13.787/2018)
                      </CardDescription>
                    </div>
                    <Badge variant="success" size="sm">
                      CONFIRMED
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                      <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="px-5 py-3 font-semibold">Data da Aferição</th>
                          <th className="px-5 py-3 font-semibold">Creatinina</th>
                          <th className="px-5 py-3 font-semibold">TFGe (eGFR)</th>
                          <th className="px-5 py-3 font-semibold">Estágio IRC</th>
                          <th className="px-5 py-3 font-semibold">Peso / PA</th>
                          <th className="px-5 py-3 font-semibold text-right">Origem</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {selectedPatient.confirmedHistory.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                              Nenhum registro clínico confirmado no histórico deste paciente.
                            </td>
                          </tr>
                        ) : (
                          selectedPatient.confirmedHistory.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                              <td className="px-5 py-3.5 font-medium text-slate-900 tabular-clinical">
                                {new Date(item.date).toLocaleDateString('pt-BR')}
                              </td>
                              <td className="px-5 py-3.5 text-slate-700 tabular-clinical">
                                {item.creatinine ? `${item.creatinine} mg/dL` : '-'}
                              </td>
                              <td className="px-5 py-3.5 font-bold text-blue-700 tabular-clinical">
                                {item.eGFR ? `${item.eGFR} mL/min` : '-'}
                              </td>
                              <td className="px-5 py-3.5">
                                {item.stage ? (
                                  <Badge variant="primary" size="sm">
                                    {item.stage}
                                  </Badge>
                                ) : (
                                  '-'
                                )}
                              </td>
                              <td className="px-5 py-3.5 text-slate-700 tabular-clinical">
                                {item.weight && `${item.weight} kg `}
                                {item.bpSystolic && item.bpDiastolic && `(${item.bpSystolic}x${item.bpDiastolic} mmHg)`}
                                {!item.weight && !item.bpSystolic && '-'}
                              </td>
                              <td className="px-5 py-3.5 text-right text-slate-400">
                                {item.source}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* 4. LAUDOS E DOCUMENTOS DIGITALIZADOS (Fase 4.2) */}
              <Card className="border-slate-200 shadow-xs">
                <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-600" />
                        <CardTitle className="text-sm font-semibold text-slate-800">
                          Laudos e Documentos Anexados
                        </CardTitle>
                      </div>
                      <CardDescription className="text-xs text-slate-500 mt-0.5">
                        Arquivos em bucket privado com acesso via URLs assinadas de 15 minutos
                      </CardDescription>
                    </div>
                    <UploadDocumentModal patientId={selectedPatient.id} buttonLabel="Anexar Laudo" />
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  {(!selectedPatient.documents || selectedPatient.documents.length === 0) ? (
                    <EmptyState
                      icon={<FileText className="w-6 h-6 text-slate-400" />}
                      title="Nenhum documento anexado"
                      description="Nenhum laudo ou exame digitalizado anexado ao prontuário deste paciente."
                      className="border-0 bg-transparent py-4"
                    />
                  ) : (
                    <div className="divide-y divide-slate-100">
                      {selectedPatient.documents.map((doc) => {
                        const sizeMb = (doc.fileSizeBytes / (1024 * 1024)).toFixed(2)
                        const isOpening = openingDocId === doc.id

                        return (
                          <div
                            key={doc.id}
                            className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">{doc.title}</span>
                                <Badge
                                  variant={
                                    doc.validationStatus === 'CONFIRMED'
                                      ? 'success'
                                      : doc.validationStatus === 'PENDING'
                                      ? 'warning'
                                      : 'destructive'
                                  }
                                  size="sm"
                                  dot
                                >
                                  {doc.validationStatus === 'CONFIRMED'
                                    ? 'Confirmado'
                                    : doc.validationStatus === 'PENDING'
                                    ? 'Aguardando Validação'
                                    : 'Recusado'}
                                </Badge>
                              </div>
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3 tabular-clinical">
                                <span>Categoria: <strong>{doc.documentType}</strong></span>
                                <span>Tamanho: <strong>{sizeMb} MB</strong></span>
                                <span>Data: {new Date(doc.createdAt).toLocaleDateString('pt-BR')}</span>
                                <span className="font-mono text-[10px] text-slate-400">
                                  SHA: {doc.sha256Hash.slice(0, 10)}...
                                </span>
                              </div>
                              {doc.validationStatus === 'REJECTED' && doc.rejectionReason && (
                                <p className="text-xs text-red-700 mt-1 italic pl-2 border-l-2 border-red-300">
                                  Motivo: &quot;{doc.rejectionReason}&quot;
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-primary border-primary/25 hover:bg-primary-light focus-ring"
                                disabled={isOpening || isPending}
                                onClick={() => handleOpenDoc(doc.id)}
                              >
                                <ExternalLink className="w-3.5 h-3.5 mr-1" />
                                Visualizar (15 min)
                              </Button>

                              {doc.validationStatus === 'PENDING' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs text-destructive border-destructive/25 hover:bg-destructive-bg focus-ring"
                                    disabled={isPending}
                                    onClick={() => handleRejectDoc(doc.id)}
                                  >
                                    Rejeitar
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 text-xs bg-success hover:bg-success/90 text-success-foreground font-semibold focus-ring"
                                    disabled={isPending}
                                    onClick={() => handleConfirmDoc(doc.id)}
                                  >
                                    Confirmar
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 5. COMORBIDADES E DOENÇAS DE BASE (Fase 4.3) */}
              <PatientConditionsSection
                patientId={selectedPatient.id}
                conditions={selectedPatient.conditions || []}
              />

              {/* 6. MEDICAMENTOS DE USO CONTÍNUO (Fase 4.3) */}
              <PatientMedicationsSection
                patientId={selectedPatient.id}
                medications={selectedPatient.medications || []}
              />

              {/* 7. ALERGIAS E REAÇÕES ADVERSAS COM TRIPLO ESTADO (PRD Seção 8.6 - RF-054) */}
              <PatientAllergiesSection
                patientId={selectedPatient.id}
                allergies={selectedPatient.allergies || []}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
