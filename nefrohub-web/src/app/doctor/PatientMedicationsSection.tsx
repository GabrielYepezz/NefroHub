'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import { Pill, PlusCircle, CheckCircle2, AlertCircle, RefreshCw, Info } from 'lucide-react'
import { recordMedicationAction, updateMedicationStatusAction } from './clinicalHistoryActions'
import type { MedicationStatus } from '@/types/database'

export interface MedicationDisplayItem {
  id: string
  name: string
  dosage?: string | null
  unit?: string | null
  route?: string | null
  frequency?: string | null
  startDate?: string | null
  endDate?: string | null
  status: MedicationStatus
  isPrescription: boolean
  notes?: string | null
  validationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  version: number
  createdAt: string
}

interface PatientMedicationsSectionProps {
  patientId: string
  medications: MedicationDisplayItem[]
}

export function PatientMedicationsSection({ patientId, medications }: PatientMedicationsSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [editingMedication, setEditingMedication] = useState<MedicationDisplayItem | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Formulário de adição
  const [formName, setFormName] = useState('')
  const [formDosage, setFormDosage] = useState('')
  const [formUnit, setFormUnit] = useState('mg')
  const [formRoute, setFormRoute] = useState('ORAL')
  const [formFrequency, setFormFrequency] = useState('')
  const [formStartDate, setFormStartDate] = useState('')
  const [formEndDate, setFormEndDate] = useState('')
  const [formStatus, setFormStatus] = useState<MedicationStatus>('ACTIVE')
  const [formNotes, setFormNotes] = useState('')

  // Formulário de alteração de status
  const [nextStatus, setNextStatus] = useState<MedicationStatus>('SUSPENDED')
  const [statusReason, setStatusReason] = useState('')
  const [statusEndDate, setStatusEndDate] = useState('')

  const handleOpenAddModal = () => {
    setFormName('')
    setFormDosage('')
    setFormUnit('mg')
    setFormRoute('ORAL')
    setFormFrequency('')
    setFormStartDate('')
    setFormEndDate('')
    setFormStatus('ACTIVE')
    setFormNotes('')
    setFeedback(null)
    setIsAddModalOpen(true)
  }

  const handleOpenEditModal = (med: MedicationDisplayItem) => {
    setEditingMedication(med)
    setNextStatus(med.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')
    setStatusReason('')
    setStatusEndDate(new Date().toISOString().split('T')[0])
    setFeedback(null)
  }

  const handleCreateMedication = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    startTransition(async () => {
      const res = await recordMedicationAction({
        patientId,
        name: formName,
        dosage: formDosage || undefined,
        unit: formUnit || undefined,
        route: formRoute || undefined,
        frequency: formFrequency || undefined,
        startDate: formStartDate || undefined,
        endDate: formEndDate || undefined,
        status: formStatus,
        isPrescription: false, // Distinção explícita: histórico clínico informado, não receita eletrônica
        notes: formNotes || undefined,
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Medicamento registrado com sucesso.' })
        setIsAddModalOpen(false)
      }
    })
  }

  const handleUpdateStatus = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingMedication) return
    setFeedback(null)

    startTransition(async () => {
      const res = await updateMedicationStatusAction({
        medicationId: editingMedication.id,
        patientId,
        nextStatus,
        reason: statusReason,
        endDate: statusEndDate || undefined,
        expectedVersion: editingMedication.version,
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Status do medicamento atualizado com sucesso.' })
        setEditingMedication(null)
      }
    })
  }

  const getStatusBadgeVariant = (st: MedicationStatus) => {
    switch (st) {
      case 'ACTIVE':
        return 'success'
      case 'SUSPENDED':
        return 'warning'
      case 'DISCONTINUED':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const getStatusLabel = (st: MedicationStatus) => {
    switch (st) {
      case 'ACTIVE':
        return 'Em Uso'
      case 'SUSPENDED':
        return 'Suspenso'
      case 'DISCONTINUED':
        return 'Descontinuado'
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
              <Pill className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Medicamentos de Uso Contínuo
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Histórico terapêutico e fármacos informados no prontuário (Seção 8.6)
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleOpenAddModal}
            className="h-8 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs focus-ring"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1" />
            Registrar Medicamento
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {/* Banner Informativo de Limites Clínicos */}
        <div className="p-3 bg-info-bg border border-info/20 rounded-xl text-xs text-info-foreground flex items-start gap-2.5">
          <Info className="w-4 h-4 shrink-0 text-info mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold text-foreground">Histórico Clínico Informado</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Este módulo registra medicamentos e posologias em uso para acompanhamento nefrológico. 
              Não substitui prescrição médica formal, não emite receitas nem realiza ajustes farmacológicos automatizados.
            </p>
          </div>
        </div>

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

        {medications.length === 0 ? (
          <EmptyState
            icon={<Pill className="w-6 h-6 text-muted-foreground/60" />}
            title="Nenhum medicamento registrado"
            description="Não há medicamentos de uso contínuo cadastrados no prontuário deste paciente."
            className="border-0 bg-transparent py-4"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {medications.map((item) => (
              <div
                key={item.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-xs text-foreground">{item.name}</span>
                    {item.dosage && (
                      <span className="text-xs font-medium text-foreground bg-secondary border border-border px-2 py-0.5 rounded">
                        {item.dosage} {item.unit || ''}
                      </span>
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
                    {item.route && <span>Via: <strong className="text-foreground">{item.route}</strong></span>}
                    {item.frequency && <span>Posologia: <strong className="text-foreground">{item.frequency}</strong></span>}
                    {item.startDate && (
                      <span>Início: {new Date(item.startDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                    )}
                    {item.endDate && (
                      <span>Término: {new Date(item.endDate + 'T00:00:00').toLocaleDateString('pt-BR')}</span>
                    )}
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

        {/* Modal: Registrar Medicamento */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-card rounded-2xl card-elevated border border-border max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div className="flex items-center gap-2">
                  <Pill className="w-4.5 h-4.5 text-primary" />
                  <h3 className="text-base font-bold text-foreground font-heading">Registrar Medicamento</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateMedication} className="space-y-3">
                <div>
                  <Label htmlFor="med-name" className="text-xs font-semibold text-foreground">
                    Nome do Fármaco / Medicamento *
                  </Label>
                  <Input
                    id="med-name"
                    required
                    placeholder="Ex: Losartana Potássica, Carbonato de Cálcio"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="med-dosage" className="text-xs font-semibold text-foreground">
                      Dose
                    </Label>
                    <Input
                      id="med-dosage"
                      placeholder="Ex: 50, 100, 500"
                      value={formDosage}
                      onChange={(e) => setFormDosage(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>

                  <div>
                    <Label htmlFor="med-unit" className="text-xs font-semibold text-foreground">
                      Unidade
                    </Label>
                    <select
                      id="med-unit"
                      value={formUnit}
                      onChange={(e) => setFormUnit(e.target.value)}
                      className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                    >
                      <option value="mg">mg (miligramas)</option>
                      <option value="mcg">mcg (microgramas)</option>
                      <option value="g">g (gramas)</option>
                      <option value="UI">UI (Unidades Internacionais)</option>
                      <option value="mL">mL (mililitros)</option>
                      <option value="gotas">gotas</option>
                      <option value="comprimido">comprimido(s)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="med-route" className="text-xs font-semibold text-foreground">
                      Via de Administração
                    </Label>
                    <select
                      id="med-route"
                      value={formRoute}
                      onChange={(e) => setFormRoute(e.target.value)}
                      className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                    >
                      <option value="ORAL">Oral</option>
                      <option value="SUBCUTANEA">Subcutânea</option>
                      <option value="INTRAVENOSA">Intravenosa</option>
                      <option value="INTRAMUSCULAR">Intramuscular</option>
                      <option value="INALATORIA">Inalatória</option>
                      <option value="TOPICA">Tópica</option>
                      <option value="OUTRA">Outra</option>
                    </select>
                  </div>

                  <div>
                    <Label htmlFor="med-frequency" className="text-xs font-semibold text-foreground">
                      Frequência / Posologia
                    </Label>
                    <Input
                      id="med-frequency"
                      placeholder="Ex: 1x ao dia, 12/12h, Pela manhã"
                      value={formFrequency}
                      onChange={(e) => setFormFrequency(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="med-start" className="text-xs font-semibold text-foreground">
                      Data de Início
                    </Label>
                    <Input
                      id="med-start"
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>

                  <div>
                    <Label htmlFor="med-end" className="text-xs font-semibold text-foreground">
                      Data de Término (Opcional)
                    </Label>
                    <Input
                      id="med-end"
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="med-status" className="text-xs font-semibold text-foreground">
                    Estado do Medicamento *
                  </Label>
                  <select
                    id="med-status"
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as MedicationStatus)}
                    className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                  >
                    <option value="ACTIVE">Em Uso (Ativo)</option>
                    <option value="SUSPENDED">Suspenso Temporariamente</option>
                    <option value="DISCONTINUED">Descontinuado</option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="med-notes" className="text-xs font-semibold text-foreground">
                    Observações e Justificativas
                  </Label>
                  <textarea
                    id="med-notes"
                    rows={2}
                    placeholder="Instruções específicas, tolerabilidade, motivo da utilização, etc."
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

        {/* Modal: Alterar Estado do Medicamento */}
        {editingMedication && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-card rounded-2xl card-elevated border border-border max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between border-b border-border/80 pb-3">
                <div>
                  <h3 className="text-base font-bold text-foreground font-heading">Atualizar Estado do Medicamento</h3>
                  <p className="text-xs text-muted-foreground font-medium">{editingMedication.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingMedication(null)}
                  className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleUpdateStatus} className="space-y-3">
                <div className="text-xs text-foreground p-3 bg-secondary/50 rounded-xl border border-border">
                  Estado atual: <strong>{getStatusLabel(editingMedication.status)}</strong> (versão {editingMedication.version})
                </div>

                <div>
                  <Label htmlFor="next-med-status" className="text-xs font-semibold text-foreground">
                    Novo Estado Clínico *
                  </Label>
                  <select
                    id="next-med-status"
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value as MedicationStatus)}
                    className="w-full h-9.5 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                  >
                    {editingMedication.status !== 'ACTIVE' && <option value="ACTIVE">Reativar / Em Uso</option>}
                    {editingMedication.status !== 'SUSPENDED' && <option value="SUSPENDED">Suspender</option>}
                    {editingMedication.status !== 'DISCONTINUED' && <option value="DISCONTINUED">Descontinuar</option>}
                  </select>
                </div>

                {(nextStatus === 'SUSPENDED' || nextStatus === 'DISCONTINUED') && (
                  <div>
                    <Label htmlFor="med-status-date" className="text-xs font-semibold text-foreground">
                      Data da Suspensão / Descontinuação
                    </Label>
                    <Input
                      id="med-status-date"
                      type="date"
                      value={statusEndDate}
                      onChange={(e) => setStatusEndDate(e.target.value)}
                      className="h-9.5 text-xs sm:text-sm mt-1 focus-ring"
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="med-reason" className="text-xs font-semibold text-foreground">
                    Justificativa Clínica da Alteração *
                  </Label>
                  <textarea
                    id="med-reason"
                    required
                    rows={2}
                    placeholder="Informe o motivo da alteração de uso (mín. 3 caracteres, ex: evento adverso, meta atingida, substituição)"
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
                    onClick={() => setEditingMedication(null)}
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
