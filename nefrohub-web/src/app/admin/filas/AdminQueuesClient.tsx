'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  approveDoctorQueueAction,
  rejectDoctorQueueAction,
  approveLinkQueueAction,
  rejectLinkQueueAction,
  approveRepresentationQueueAction,
  rejectRepresentationQueueAction,
  decideReviewRequestQueueAction,
  processDocumentDisposalAction,
} from './actions'
import {
  ListOrdered,
  UserCheck,
  Link2,
  UserX,
  FileEdit,
  FileCheck2,
  CheckCircle2,
  Clock,
  ShieldAlert,
  AlertCircle,
  XCircle,
  ChevronRight,
  ArrowRight,
  Loader2,
} from 'lucide-react'

export interface QueueDoctorItem {
  id: string
  name: string
  email: string
  phone: string | null
  crm?: string | null
  crmUf?: string | null
  createdAt: string
}

export interface QueueLinkItem {
  id: string
  patientName: string
  doctorName: string
  createdAt: string
}

export interface QueueRepresentationItem {
  id: string
  patientName: string
  representativeName: string
  representativeEmail: string
  relationshipType: string
  authorityType: string
  proofRef?: string | null
  createdAt: string
}

export interface QueueReviewItem {
  id: string
  patientName: string
  requestedByName: string
  reason: string
  createdAt: string
}

export interface QueueDisposalItem {
  id: string
  patientName: string
  recordType: string
  rejectionCode: string
  rejectionReason: string | null
  createdAt: string
}

interface AdminQueuesClientProps {
  doctorsQueue: QueueDoctorItem[]
  linksQueue: QueueLinkItem[]
  representationsQueue?: QueueRepresentationItem[]
  reviewsQueue: QueueReviewItem[]
  disposalsQueue: QueueDisposalItem[]
}

export function AdminQueuesClient({
  doctorsQueue,
  linksQueue,
  representationsQueue = [],
  reviewsQueue,
  disposalsQueue,
}: AdminQueuesClientProps) {
  const [selectedQueue, setSelectedQueue] = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleApproveDoctor = (userId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await approveDoctorQueueAction(userId)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Médico homologado!' })
    })
  }

  const handleRejectDoctor = (userId: string) => {
    const reason = prompt('Informe o motivo institucional da recusa do cadastro médico:')
    if (!reason) return

    setFeedback(null)
    startTransition(async () => {
      const res = await rejectDoctorQueueAction(userId, reason)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Cadastro recusado.' })
    })
  }

  const handleApproveLink = (linkId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await approveLinkQueueAction(linkId)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Vínculo ativado!' })
    })
  }

  const handleRejectLink = (linkId: string) => {
    const reason = prompt('Informe a justificativa da recusa de vínculo:')
    if (!reason) return

    setFeedback(null)
    startTransition(async () => {
      const res = await rejectLinkQueueAction(linkId, reason)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Vínculo recusado.' })
    })
  }

  const handleApproveRepresentation = (repId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await approveRepresentationQueueAction(repId)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Representação homologada!' })
    })
  }

  const handleRejectRepresentation = (repId: string) => {
    const reason = prompt('Informe a justificativa da recusa de representação legal:')
    if (!reason) return

    setFeedback(null)
    startTransition(async () => {
      const res = await rejectRepresentationQueueAction(repId, reason)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Representação recusada.' })
    })
  }

  const handleDecideReview = (requestId: string, decision: 'APPROVED' | 'REJECTED') => {
    const reason = prompt(`Informe a justificativa da ${decision === 'APPROVED' ? 'aprovação' : 'recusa'} da retificação:`) || ''

    setFeedback(null)
    startTransition(async () => {
      const res = await decideReviewRequestQueueAction(requestId, decision, reason)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Decisão registrada.' })
    })
  }

  const handleDisposeDocument = (eventId: string, decision: 'EXPURGED' | 'ARCHIVED') => {
    setFeedback(null)
    startTransition(async () => {
      const res = await processDocumentDisposalAction(eventId, decision)
      if (res.error) setFeedback({ type: 'error', message: res.error })
      else setFeedback({ type: 'success', message: res.message || 'Destinação concluída.' })
    })
  }

  const queuesMeta = [
    {
      id: 1,
      name: '1. Homologação de Contas e Profissionais',
      desc: 'Validação de CRM e credenciamento de médicos antes de liberar acesso clínico.',
      sla: 'SLA: 2 dias úteis',
      icon: UserCheck,
      count: doctorsQueue.length,
      statusColor: 'text-primary bg-primary-light border-primary/20',
    },
    {
      id: 2,
      name: '2. Aprovação de Vínculos e Representações',
      desc: 'Validação de solicitações de vínculos médico-paciente e homologação de representantes/cuidadores.',
      sla: 'SLA: 1 dia útil (prioritário)',
      icon: Link2,
      count: linksQueue.length + representationsQueue.length,
      statusColor: 'text-info bg-info-bg border-info/20',
    },
    {
      id: 3,
      name: '3. Desativação e Reatribuição Clínica',
      desc: 'Protocolo para transferência de pacientes de médicos desligados ou afastados.',
      sla: 'Bloqueio preventivo imediato',
      icon: UserX,
      count: 0,
      statusColor: 'text-warning bg-warning-bg border-warning/20',
    },
    {
      id: 4,
      name: '4. Solicitações de Correção / Retificação',
      desc: 'Despacho formal de pedidos de retificação (review_requests) de registros confirmados.',
      sla: 'SLA: 2 dias úteis',
      icon: FileEdit,
      count: reviewsQueue.length,
      statusColor: 'text-success bg-success-bg border-success/20',
    },
    {
      id: 5,
      name: '5. Destinação e Descarte de Documentos',
      desc: 'Expurgo controlado de dados clínicos rejeitados e conformidade de retenção de 20 anos.',
      sla: 'Comitê de Ética & LGPD',
      icon: FileCheck2,
      count: disposalsQueue.length,
      statusColor: 'text-muted-foreground bg-secondary border-border',
    },
  ]

  return (
    <div className="space-y-6 font-sans">
      {feedback && (
        <div
          role="alert"
          className={`p-4 text-xs font-medium rounded-xl flex items-center justify-between card-subtle animate-in fade-in duration-200 ${
            feedback.type === 'success'
              ? 'bg-success-bg text-success-foreground border border-success/20'
              : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-muted-foreground hover:text-foreground text-sm leading-none cursor-pointer"
            aria-label="Fechar notificação"
          >
            ✕
          </button>
        </div>
      )}

      {/* Grid Resumo das 5 Filas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {queuesMeta.map((q) => {
          const Icon = q.icon
          const isSelected = selectedQueue === q.id

          return (
            <Card
              key={q.id}
              onClick={() => setSelectedQueue(isSelected ? null : q.id)}
              className={`border-border hover:shadow-md transition-all cursor-pointer flex flex-col justify-between card-subtle ${
                isSelected ? 'ring-2 ring-primary border-primary shadow-xs' : ''
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className={`p-2.5 rounded-xl border ${q.statusColor}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <Badge variant={q.count > 0 ? 'warning' : 'success'} size="sm" dot>
                    {q.count > 0 ? `${q.count} pendente(s)` : 'Em dia'}
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 mt-3 leading-snug">
                  {q.name}
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 mt-1">
                  {q.desc}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 border-t border-slate-100 mt-3 pt-3 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1 text-[11px]">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{q.sla}</span>
                </div>
                <span className="font-semibold text-blue-600 flex items-center gap-1">
                  {isSelected ? 'Ocultar itens' : 'Ver pendências'}
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Detalhamento e Painel de Despacho da Fila Selecionada */}
      {selectedQueue !== null && (
        <Card className="border-blue-200 bg-white shadow-sm animate-in fade-in duration-150">
          <CardHeader className="bg-slate-50/70 border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-blue-600" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  {queuesMeta.find((q) => q.id === selectedQueue)?.name} — Itens para Despacho
                </CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7 text-slate-500"
                onClick={() => setSelectedQueue(null)}
              >
                Fechar painel
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            {/* FILA 1: Médicos Pendentes */}
            {selectedQueue === 1 && (
              doctorsQueue.length === 0 ? (
                <EmptyState
                  icon={<UserCheck className="w-6 h-6 text-slate-400" />}
                  title="Nenhum médico aguardando homologação"
                  description="Todos os cadastros profissionais foram processados pela governança."
                  className="border-0 bg-transparent py-4"
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {doctorsQueue.map((doc) => (
                    <div key={doc.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">Dr(a). {doc.name}</span>
                          <Badge variant="warning" size="sm">PENDING_APPROVAL</Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 tabular-clinical">
                          {doc.email} {doc.phone ? `• ${doc.phone}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 focus-ring"
                          disabled={isPending}
                          onClick={() => handleRejectDoctor(doc.id)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Recusar
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium focus-ring"
                          disabled={isPending}
                          onClick={() => handleApproveDoctor(doc.id)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Homologar CRM
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* FILA 2: Vínculos e Representações Pendentes */}
            {selectedQueue === 2 && (
              linksQueue.length === 0 && representationsQueue.length === 0 ? (
                <EmptyState
                  icon={<Link2 className="w-6 h-6 text-slate-400" />}
                  title="Nenhum vínculo ou representação pendente"
                  description="Não há solicitações de vínculo médico-paciente ou cuidadores aguardando aprovação."
                  className="border-0 bg-transparent py-4"
                />
              ) : (
                <div className="space-y-4">
                  {/* Sub-seção: Vínculos Médicos */}
                  {linksQueue.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Vínculos Médico-Paciente ({linksQueue.length})
                      </h4>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {linksQueue.map((link) => (
                          <div key={link.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">Paciente: {link.patientName}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-semibold text-xs text-slate-800">Médico: {link.doctorName}</span>
                              </div>
                              <span className="text-[11px] text-slate-400 tabular-clinical">
                                Solicitado em: {new Date(link.createdAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 focus-ring"
                                disabled={isPending}
                                onClick={() => handleRejectLink(link.id)}
                              >
                                Recusar
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium focus-ring"
                                disabled={isPending}
                                onClick={() => handleApproveLink(link.id)}
                              >
                                Ativar Vínculo
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Sub-seção: Representantes Legais e Cuidadores (Fase 4.1) */}
                  {representationsQueue.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Representações Legais & Cuidadores ({representationsQueue.length})
                      </h4>
                      <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                        {representationsQueue.map((rep) => (
                          <div key={rep.id} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">Paciente: {rep.patientName}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-semibold text-xs text-purple-900">Cuidador: {rep.representativeName}</span>
                                <Badge variant="primary" size="sm">{rep.relationshipType}</Badge>
                              </div>
                              <div className="text-xs text-slate-500 mt-1 flex flex-wrap gap-3 tabular-clinical">
                                <span>E-mail: <strong>{rep.representativeEmail}</strong></span>
                                <span>Autoridade: <strong>{rep.authorityType}</strong></span>
                                {rep.proofRef && <span>Doc Ref: <strong>{rep.proofRef}</strong></span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 focus-ring"
                                disabled={isPending}
                                onClick={() => handleRejectRepresentation(rep.id)}
                              >
                                Recusar
                              </Button>
                              <Button
                                size="sm"
                                className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium focus-ring"
                                disabled={isPending}
                                onClick={() => handleApproveRepresentation(rep.id)}
                              >
                                Homologar Cuidador
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            )}

            {/* FILA 3: Desativação e Reatribuição */}
            {selectedQueue === 3 && (
              <EmptyState
                icon={<UserX className="w-6 h-6 text-slate-400" />}
                title="Sem desligamentos pendentes"
                description="Todos os médicos ativos possuem cobertura e pacientes formalmente atribuídos."
                className="border-0 bg-transparent py-4"
              />
            )}

            {/* FILA 4: Solicitações de Correção */}
            {selectedQueue === 4 && (
              reviewsQueue.length === 0 ? (
                <EmptyState
                  icon={<FileEdit className="w-6 h-6 text-slate-400" />}
                  title="Nenhum pedido de correção pendente"
                  description="Todos os pedidos de retificação (review_requests) foram despachados."
                  className="border-0 bg-transparent py-4"
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {reviewsQueue.map((rev) => (
                    <div key={rev.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">Paciente: {rev.patientName}</span>
                          <span className="text-[11px] text-slate-500">(Solicitado por: {rev.requestedByName})</span>
                        </div>
                        <p className="text-xs text-slate-700 mt-1 italic">&quot;{rev.reason}&quot;</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50 focus-ring"
                          disabled={isPending}
                          onClick={() => handleDecideReview(rev.id, 'REJECTED')}
                        >
                          Recusar
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium focus-ring"
                          disabled={isPending}
                          onClick={() => handleDecideReview(rev.id, 'APPROVED')}
                        >
                          Aprovar Retificação
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}

            {/* FILA 5: Descarte de Documentos */}
            {selectedQueue === 5 && (
              disposalsQueue.length === 0 ? (
                <EmptyState
                  icon={<FileCheck2 className="w-6 h-6 text-slate-400" />}
                  title="Nenhum item aguardando destinação"
                  description="A fila de descarte e expurgo documental está em dia."
                  className="border-0 bg-transparent py-4"
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {disposalsQueue.map((disp) => (
                    <div key={disp.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-slate-900">{disp.patientName}</span>
                          <Badge variant="destructive" size="sm">{disp.rejectionCode}</Badge>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Tipo: {disp.recordType} {disp.rejectionReason ? `• Justificativa: "${disp.rejectionReason}"` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs text-slate-700 border-slate-300 focus-ring"
                          disabled={isPending}
                          onClick={() => handleDisposeDocument(disp.id, 'ARCHIVED')}
                        >
                          Arquivar (20 Anos)
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 text-xs font-medium focus-ring"
                          disabled={isPending}
                          onClick={() => handleDisposeDocument(disp.id, 'EXPURGED')}
                        >
                          Expurgar
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
