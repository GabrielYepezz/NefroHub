'use client'

import { useTransition, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { submitPatientVitalSignsAction, requestClinicalRecordReviewAction } from './actions'
import {
  Scale,
  Heart,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Info,
  Loader2,
  Clock,
  XCircle,
  HelpCircle,
  FileText,
  User,
  FileEdit,
} from 'lucide-react'

interface PatientUpdateFormProps {
  initialWeight?: number | null
  initialPhone?: string | null
}

export function PatientUpdateForm({ initialWeight, initialPhone }: PatientUpdateFormProps) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)
    const formData = new FormData(e.currentTarget)

    startTransition(async () => {
      const result = await submitPatientVitalSignsAction(formData)
      if (result.error) {
        setMessage({ type: 'error', text: result.error })
      } else {
        setMessage({
          type: 'success',
          text: result.message || 'Envio registrado com status PENDING_VALIDATION.',
        })
      }
    })
  }

  const today = new Date().toISOString().split('T')[0]

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate={false}>
      <div className="p-3 bg-info-bg border border-info/20 rounded-xl text-xs text-info-foreground flex items-start gap-2.5">
        <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Medições de peso e pressão enviadas passarão por conferência do seu médico assistente antes de serem confirmadas no prontuário.
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="clinicalDate" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Data da Aferição <span className="text-destructive">*</span>
        </Label>
        <Input
          id="clinicalDate"
          name="clinicalDate"
          type="date"
          defaultValue={today}
          max={today}
          required
          className="focus-ring h-10 text-xs sm:text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="weight" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 text-muted-foreground" /> Peso Corporal (kg)
          </Label>
          <Input
            id="weight"
            name="weight"
            type="number"
            step="0.1"
            min="10"
            max="400"
            defaultValue={initialWeight || ''}
            placeholder="Ex: 72.5"
            className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bpSystolic" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-primary" /> PA Sistólica
          </Label>
          <Input
            id="bpSystolic"
            name="bpSystolic"
            type="number"
            min="50"
            max="260"
            placeholder="120 (mmHg)"
            className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bpDiastolic" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Heart className="w-3.5 h-3.5 text-primary/70" /> PA Diastólica
          </Label>
          <Input
            id="bpDiastolic"
            name="bpDiastolic"
            type="number"
            min="30"
            max="160"
            placeholder="80 (mmHg)"
            className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
          />
        </div>
      </div>

      <div className="space-y-1.5 pt-1">
        <Label htmlFor="phone" className="text-xs font-semibold text-foreground">
          Telefone de Contato (Atualização Cadastral)
        </Label>
        <Input
          id="phone"
          name="phone"
          defaultValue={initialPhone || ''}
          placeholder="(11) 99999-9999"
          className="focus-ring h-10 text-xs sm:text-sm"
        />
      </div>

      {message && (
        <div
          role="alert"
          className={`p-3 text-xs font-medium rounded-xl flex items-start gap-2.5 animate-in fade-in duration-150 ${
            message.type === 'success'
              ? 'bg-success-bg text-success-foreground border border-success/20'
              : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          )}
          <span className="leading-snug">{message.text}</span>
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl h-10 text-xs sm:text-sm shadow-xs focus-ring transition-colors"
        disabled={isPending}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Enviando para Validação...
          </span>
        ) : (
          'Enviar Medições para Validação'
        )}
      </Button>
    </form>
  )
}

// ============================================================================
// COMPONENTE DE HISTÓRICO COM ABAS E FEEDBACK DE REJEIÇÃO (Fase 3.3)
// ============================================================================

export interface SubmissionItem {
  id: string
  clinicalDate: string
  createdAt: string
  status: 'PENDING_VALIDATION' | 'CONFIRMED' | 'REJECTED'
  weight?: number | null
  bpSystolic?: number | null
  bpDiastolic?: number | null
  rejectionCode?: string | null
  rejectionReason?: string | null
  reviewedByDoctorName?: string | null
  reviewedAt?: string | null
}

interface PatientSubmissionsTabsProps {
  pendingList: SubmissionItem[]
  rejectedList: SubmissionItem[]
  confirmedList: SubmissionItem[]
}

const REJECTION_LABELS: Record<string, string> = {
  INVALID_VALUE: 'Valor clinicamente implausível ou fora da faixa aceita',
  DUPLICATE: 'Medição em duplicidade com envio anterior',
  UNREADABLE: 'Dados inconsistentes ou ilegíveis',
  INCOMPLETE: 'Medição incompleta (ex: falta de sistólica ou diastólica)',
  OTHER: 'Outro motivo clínico indicado pelo médico assistente',
}

export function PatientSubmissionsTabs({
  pendingList,
  rejectedList,
  confirmedList,
}: PatientSubmissionsTabsProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'rejected' | 'confirmed'>('pending')
  const [isPendingReview, startReviewTransition] = useTransition()
  const [reviewFeedback, setReviewFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleRequestReview = (recordId: string) => {
    const reason = prompt(
      'Informe o motivo ou divergência identificada nesta medição confirmada para análise da equipe clínica:'
    )
    if (!reason || reason.trim().length < 5) {
      if (reason !== null) {
        alert('Por favor, informe uma justificativa com pelo menos 5 caracteres.')
      }
      return
    }

    setReviewFeedback(null)
    startReviewTransition(async () => {
      const res = await requestClinicalRecordReviewAction({ recordId, reason: reason.trim() })
      if (res.error) {
        setReviewFeedback({ type: 'error', message: res.error })
      } else {
        setReviewFeedback({
          type: 'success',
          message: res.message || 'Solicitação de retificação enviada para a Fila 4.',
        })
      }
    })
  }

  return (
    <div className="space-y-4 font-sans">
      {/* Navegação por Abas de Submissão */}
      <div className="flex items-center gap-1.5 border-b border-border pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'pending'
              ? 'bg-warning-bg text-warning-foreground border border-warning/25 shadow-2xs'
              : 'text-muted-foreground hover:bg-secondary'
          }`}
        >
          <Clock className="w-3.5 h-3.5 text-warning" />
          <span>Aguardando Validação ({pendingList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rejected')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'rejected'
              ? 'bg-destructive-bg text-destructive-foreground border border-destructive/25 shadow-2xs'
              : 'text-muted-foreground hover:bg-secondary'
          }`}
        >
          <XCircle className="w-3.5 h-3.5 text-destructive" />
          <span>Não Aceitas ({rejectedList.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('confirmed')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'confirmed'
              ? 'bg-success-bg text-success-foreground border border-success/25 shadow-2xs'
              : 'text-muted-foreground hover:bg-secondary'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 text-success" />
          <span>Confirmadas ({confirmedList.length})</span>
        </button>
      </div>

      {/* Conteúdo da Aba 1: Pendentes */}
      {activeTab === 'pending' && (
        <div className="space-y-3">
          {pendingList.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-6 h-6 text-muted-foreground/60" />}
              title="Nenhuma medição pendente"
              description="Todas as suas submissões anteriores já foram avaliadas pelo médico."
              className="border-0 bg-transparent py-6"
            />
          ) : (
            pendingList.map((sub) => (
              <div
                key={sub.id}
                className="p-4 bg-card rounded-xl border border-border card-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-semibold text-xs text-foreground">
                      Aferição em {new Date(sub.clinicalDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <Badge variant="warning" size="sm" dot>
                      Aguardando Médico
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-4 tabular-clinical">
                    {sub.weight && (
                      <span className="flex items-center gap-1">
                        <Scale className="w-3.5 h-3.5 text-muted-foreground" />
                        Peso: <strong className="text-foreground font-semibold">{sub.weight} kg</strong>
                      </span>
                    )}
                    {sub.bpSystolic && sub.bpDiastolic && (
                      <span className="flex items-center gap-1">
                        <Heart className="w-3.5 h-3.5 text-primary" />
                        Pressão: <strong className="text-foreground font-semibold">{sub.bpSystolic}x{sub.bpDiastolic} mmHg</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground tabular-clinical">
                  Enviado em {new Date(sub.createdAt).toLocaleString('pt-BR')}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Conteúdo da Aba 2: Rejeitadas (Feedback Completo de Rejeição - Requisito Seção 6.5) */}
      {activeTab === 'rejected' && (
        <div className="space-y-3">
          {rejectedList.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="w-6 h-6 text-success" />}
              title="Nenhuma submissão recusada"
              description="Você não possui registros clínicos que tenham sido recusados pelo médico."
              className="border-0 bg-transparent py-6"
            />
          ) : (
            rejectedList.map((sub) => {
              const friendlyReason =
                (sub.rejectionCode && REJECTION_LABELS[sub.rejectionCode]) ||
                'Não aceito conforme critério clínico do médico'

              return (
                <div
                  key={sub.id}
                  className="p-4 bg-destructive-bg/30 rounded-xl border border-destructive/20 card-subtle space-y-2.5"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-destructive shrink-0" />
                      <span className="font-semibold text-xs text-destructive-foreground">
                        Aferição de {new Date(sub.clinicalDate + 'T00:00:00').toLocaleDateString('pt-BR')} não aceita
                      </span>
                      <Badge variant="destructive" size="sm">
                        {sub.rejectionCode || 'REJEITADO'}
                      </Badge>
                    </div>
                    {sub.reviewedAt && (
                      <span className="text-[11px] text-muted-foreground tabular-clinical">
                        Analisado em: {new Date(sub.reviewedAt).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  {/* Dados originais aferidos */}
                  <div className="text-xs text-foreground flex flex-wrap gap-3 pl-6 tabular-clinical">
                    {sub.weight && <span>Peso informado: <strong>{sub.weight} kg</strong></span>}
                    {sub.bpSystolic && sub.bpDiastolic && (
                      <span>PA informada: <strong>{sub.bpSystolic}x{sub.bpDiastolic} mmHg</strong></span>
                    )}
                  </div>

                  {/* Justificativa e Motivo Clínico */}
                  <div className="mt-2 p-3 bg-card rounded-lg border border-border text-xs text-foreground space-y-1">
                    <div className="flex items-start gap-1.5 font-medium text-destructive">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>Motivo Clínico: {friendlyReason}</span>
                    </div>
                    {sub.rejectionReason && (
                      <p className="text-muted-foreground pl-5 italic text-xs leading-relaxed">
                        &quot;{sub.rejectionReason}&quot;
                      </p>
                    )}
                    {sub.reviewedByDoctorName && (
                      <div className="text-[11px] text-muted-foreground pl-5 flex items-center gap-1 pt-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span>Avaliador: {sub.reviewedByDoctorName}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-muted-foreground pl-2 leading-relaxed">
                    * Este registro foi preservado para auditoria. Você pode realizar uma nova medição corrigida a qualquer momento no formulário ao lado.
                  </p>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Conteúdo da Aba 3: Confirmadas */}
      {activeTab === 'confirmed' && (
        <div className="space-y-3">
          {reviewFeedback && (
            <div
              className={`p-3 text-xs font-medium rounded-xl flex items-center justify-between ${
                reviewFeedback.type === 'success'
                  ? 'bg-success-bg text-success-foreground border border-success/20'
                  : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
              }`}
            >
              <div className="flex items-center gap-2">
                {reviewFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                )}
                <span>{reviewFeedback.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setReviewFeedback(null)}
                className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {confirmedList.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-6 h-6 text-muted-foreground/60" />}
              title="Nenhuma medição confirmada ainda"
              description="Suas aferições domiciliares confirmadas pelo médico serão listadas aqui."
              className="border-0 bg-transparent py-6"
            />
          ) : (
            confirmedList.map((sub) => (
              <div
                key={sub.id}
                className="p-4 bg-card rounded-xl border border-border card-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/40 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                    <span className="font-semibold text-xs text-foreground">
                      Aferição em {new Date(sub.clinicalDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                    </span>
                    <Badge variant="success" size="sm">
                      Confirmado pelo Médico
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-4 tabular-clinical">
                    {sub.weight && (
                      <span>Peso: <strong className="text-foreground">{sub.weight} kg</strong></span>
                    )}
                    {sub.bpSystolic && sub.bpDiastolic && (
                      <span>PA: <strong className="text-foreground">{sub.bpSystolic}x{sub.bpDiastolic} mmHg</strong></span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPendingReview}
                    onClick={() => handleRequestReview(sub.id)}
                    className="h-7 text-[11px] text-muted-foreground hover:text-foreground border-border hover:bg-secondary cursor-pointer"
                  >
                    <FileEdit className="w-3 h-3 mr-1 text-primary" />
                    Pedir Correção
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
