'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { PlusCircle, Stethoscope, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { recordConditionAction, updateConditionStatusAction } from './clinicalHistoryActions'
import type { ConditionStatus } from '@/types/database'

export interface ConditionDisplayItem {
  id: string
  name: string
  cid10?: string | null
  onsetDate?: string | null
  status: ConditionStatus
  notes?: string | null
  validationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  version: number
  createdAt: string
}

interface PatientConditionsSectionProps {
  patientId: string
  conditions: ConditionDisplayItem[]
}

export function PatientConditionsSection({ patientId, conditions }: PatientConditionsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingCondition, setEditingCondition] = useState<ConditionDisplayItem | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Formulário de adição
  const [formName, setFormName] = useState('')
  const [formCid, setFormCid] = useState('')
  const [formOnsetDate, setFormOnsetDate] = useState('')
  const [formStatus, setFormStatus] = useState<ConditionStatus>('ACTIVE')
  const [formNotes, setFormNotes] = useState('')

  // Formulário de alteração de status
  const [nextStatus, setNextStatus] = useState<ConditionStatus>('RESOLVED')
  const [statusReason, setStatusReason] = useState('')

  const handleOpenAddModal = () => {
    setFormName('')
    setFormCid('')
    setFormOnsetDate('')
    setFormStatus('ACTIVE')
    setFormNotes('')
    setFeedback(null)
    setIsAddModalOpen(true)
  }

  const handleOpenEditModal = (cond: ConditionDisplayItem) => {
    setEditingCondition(cond)
    setNextStatus(cond.status === 'ACTIVE' ? 'RESOLVED' : 'ACTIVE')
    setStatusReason('')
    setFeedback(null)
  }

  const handleCreateCondition = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const res = await recordConditionAction({
        patientId,
        name: formName,
        cid10: formCid || undefined,
        onsetDate: formOnsetDate || undefined,
        status: formStatus,
        notes: formNotes || undefined,
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Comorbidade registrada com sucesso.' })
        setIsAddModalOpen(false)
      }
    })
  }

  const handleUpdateStatus = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingCondition) return
    setFeedback(null)

    startTransition(async () => {
      const res = await updateConditionStatusAction({
        conditionId: editingCondition.id,
        patientId,
        nextStatus,
        reason: statusReason,
        expectedVersion: editingCondition.version,
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Status atualizado com sucesso.' })
        setEditingCondition(null)
      }
    })
  }

  const getStatusBadgeVariant = (st: ConditionStatus) => {
    switch (st) {
      case 'ACTIVE':
        return 'success'
      case 'RESOLVED':
        return 'default'
      case 'INACTIVE':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getStatusLabel = (st: ConditionStatus) => {
    switch (st) {
      case 'ACTIVE':
        return 'Ativa'
      case 'RESOLVED':
        return 'Resolvida'
      case 'INACTIVE':
        return 'Inativa'
      default:
        return st
    }
  }

  return (
    <Card className="border-border card-subtle font-sans">
      <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Comorbidades e Doenças de Base
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Condições clínicas relevantes registradas no prontuário longitudinal (Seção 8.5)
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleOpenAddModal}
            className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs focus-ring"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1" />
            Adicionar Comorbidade
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs flex items-center gap-2.5 ${
              feedback.type === 'success'
                ? 'bg-success-bg border border-success/20 text-success-foreground'
                : 'bg-destructive-bg border border-destructive/20 text-destructive-foreground'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-success" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-destructive" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {conditions.length === 0 ? (
          <EmptyState
            icon={<Stethoscope className="w-6 h-6 text-muted-foreground/60" />}
            title="Nenhuma comorbidade registrada"
            description="Não há histórico de comorbidades ou doenças crônicas cadastradas para este paciente."
            className="border-0 bg-transparent py-4"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {conditions.map((item) => (
              <div
                key={item.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-foreground">{item.name}</span>
                    {item.cid10 && (
                      <Badge variant="outline" size="sm" className="font-mono text-[10px] text-muted-foreground">
                        CID: {item.cid10}
                      </Badge>
                    )}
                    <Badge variant={getStatusBadgeVariant(item.status)} size="sm">
                      {getStatusLabel(item.status)}
                    </Badge>
                    {item.validationStatus === 'PENDING' && (
                      <Badge variant="warning" size="sm" dot>
                        Aguardando Validação
                      </Badge>
                    )}
                  </div>

                  <div className="text-xs text-muted-foreground flex flex-wrap gap-4 tabular-clinical">
                    {item.onsetDate && (
                      <span>Início estimado: {new Date(item.onsetDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                    )}
                    <span>Registrado em: {new Date(item.createdAt).toLocaleDateString('pt-BR')}</span>
                    <span className="text-muted-foreground/80">v{item.version}</span>
                  </div>

                  {item.notes && (
                    <p className="text-xs text-muted-foreground italic mt-0.5">
                      Obs: {item.notes}
                    </p>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-foreground hover:bg-secondary border-border"
                    onClick={() => handleOpenEditModal(item)}
                    disabled={isPending}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Alterar Estado
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Adicionar Comorbidade */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-card rounded-2xl card-elevated border border-border max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <Stethoscope className="w-4.5 h-4.5 text-primary" />
                  <h3 className="text-base font-bold text-foreground font-heading">Nova Comorbidade</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateCondition} className="space-y-3">
                <div>
                  <Label htmlFor="cond-name" className="text-xs font-semibold text-foreground">
                    Nome da Doença / Condição *
                  </Label>
                  <Input
                    id="cond-name"
                    required
                    placeholder="Ex: Hipertensão Arterial Sistêmica, DM2"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="cond-cid" className="text-xs font-semibold text-foreground">
                      CID-10 (Opcional)
                    </Label>
                    <Input
                      id="cond-cid"
                      placeholder="Ex: I10, E11.9"
                      value={formCid}
                      onChange={(e) => setFormCid(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                    <p className="text-[10px] text-muted-foreground mt-0.5">Sem inferência diagnóstica.</p>
                  </div>

                  <div>
                    <Label htmlFor="cond-onset" className="text-xs font-semibold text-foreground">
                      Data de Início
                    </Label>
                    <Input
                      id="cond-onset"
                      type="date"
                      value={formOnsetDate}
                      max={new Date().toISOString().split('T')[0]}
                      onChange={(e) => setFormOnsetDate(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="cond-status" className="text-xs font-semibold text-foreground">
                    Estado Clínico Inicial *
                  </Label>
                  <select
                    id="cond-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as ConditionStatus)}
                    className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                  >
                    <option value="ACTIVE">Ativa (Acompanhamento Contínuo)</option>
                    <option value="RESOLVED">Resolvida (Curada / Controlada)</option>
                    <option value="INACTIVE">Inativa (Histórico Remoto)</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="cond-notes" className="text-xs font-semibold text-foreground">
                    Observações Clínicas
                  </Label>
                  <textarea
                    id="cond-notes"
                    rows={2}
                    placeholder="Detalhes relevantes sobre o diagnóstico prévio, evolução, etc."
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card text-xs sm:text-sm p-3 mt-1 focus-ring text-foreground leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setIsAddModalOpen(false)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold"
                    disabled={isPending}
                  >
                    {isPending ? 'Gravando...' : 'Salvar no Prontuário'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Alterar Estado da Comorbidade */}
        {editingCondition && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-card rounded-2xl card-elevated border border-border max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground font-heading">Atualizar Estado Clínico</h3>
                  <p className="text-xs text-muted-foreground font-medium">{editingCondition.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingCondition(null)}
                  className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-3">
                <div className="text-xs text-foreground p-3 bg-secondary/50 rounded-xl border border-border">
                  Estado atual: <strong>{getStatusLabel(editingCondition.status)}</strong> (versão {editingCondition.version})
                </div>

                <div>
                  <Label htmlFor="next-status" className="text-xs font-semibold text-foreground">
                    Novo Estado Clínico *
                  </Label>
                  <select
                    id="next-status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as ConditionStatus)}
                    className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                  >
                    {editingCondition.status !== 'ACTIVE' && <option value="ACTIVE">Ativa</option>}
                    {editingCondition.status !== 'RESOLVED' && <option value="RESOLVED">Resolvida</option>}
                    {editingCondition.status !== 'INACTIVE' && <option value="INACTIVE">Inativa</option>}
                  </select>
                </div>

                <div>
                  <Label htmlFor="status-reason" className="text-xs font-semibold text-foreground">
                    Justificativa Clínica da Mudança *
                  </Label>
                  <textarea
                    id="status-reason"
                    required
                    rows={2}
                    placeholder="Informe o motivo da alteração de estado para rastreabilidade de governança (mín. 3 caracteres)"
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    className="w-full rounded-xl border border-border bg-card text-xs sm:text-sm p-3 mt-1 focus-ring text-foreground leading-relaxed"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => setEditingCondition(null)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold"
                    disabled={isPending}
                  >
                    {isPending ? 'Atualizando...' : 'Confirmar Alteração'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
