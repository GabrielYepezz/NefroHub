// src/app/doctor/PatientAllergiesSection.tsx
'use client'

import React, { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import {
  AlertTriangle,
  ShieldCheck,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  XCircle,
  Info,
} from 'lucide-react'
import {
  recordAllergyAction,
  recordNoKnownAllergiesAction,
  inactivateAllergyAction,
} from './allergyActions'

export interface AllergyDisplayItem {
  id: string
  substance: string
  reaction?: string | null
  severity?: string | null
  status: 'KNOWN' | 'NO_KNOWN_ALLERGIES' | 'UNREPORTED' | 'RESOLVED'
  createdAt: string
}

interface PatientAllergiesSectionProps {
  patientId: string
  allergies: AllergyDisplayItem[]
}

export function PatientAllergiesSection({ patientId, allergies = [] }: PatientAllergiesSectionProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  // Formulário de cadastro de alergia
  const [formSubstance, setFormSubstance] = useState('')
  const [formReaction, setFormReaction] = useState('')
  const [formSeverity, setFormSeverity] = useState<'LEVE' | 'MODERADA' | 'GRAVE'>('MODERADA')

  // Avaliação do Triplo Estado de Informação (PRD Seção 8.6 - RF-054)
  const activeKnownAllergies = allergies.filter((a) => a.status === 'KNOWN')
  const isNoKnownAllergiesDeclared = allergies.some((a) => a.status === 'NO_KNOWN_ALLERGIES')
  const resolvedAllergies = allergies.filter((a) => a.status === 'RESOLVED')

  const handleOpenAddModal = () => {
    setFormSubstance('')
    setFormReaction('')
    setFormSeverity('MODERADA')
    setFeedback(null)
    setIsAddModalOpen(true)
  }

  const handleCreateAllergy = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (!formSubstance.trim() || formSubstance.trim().length < 2) {
      setFeedback({ type: 'error', message: 'Informe a substância ou classe alérgena (mínimo 2 caracteres).' })
      return
    }

    startTransition(async () => {
      const res = await recordAllergyAction({
        patientId,
        substance: formSubstance.trim(),
        reaction: formReaction.trim() || undefined,
        severity: formSeverity,
        status: 'KNOWN',
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Alergia registrada no prontuário.' })
        setIsAddModalOpen(false)
      }
    })
  }

  const handleDeclareNoAllergies = () => {
    if (!confirm('Confirmar declaração formal de que o paciente NEGA alergias medicamentosas ou alimentares conhecidas?')) {
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await recordNoKnownAllergiesAction(patientId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Declaração registrada no prontuário.' })
      }
    })
  }

  const handleInactivate = (allergyId: string, substance: string) => {
    const reason = prompt(`Informe o motivo clínico de inativação da alergia a "${substance}":`)
    if (!reason || reason.trim() === '') return

    setFeedback(null)
    startTransition(async () => {
      const res = await inactivateAllergyAction(allergyId, patientId, reason.trim())
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Alergia inativada.' })
      }
    })
  }

  const getSeverityBadge = (severity?: string | null) => {
    switch (severity?.toUpperCase()) {
      case 'GRAVE':
        return <Badge variant="destructive" size="sm">GRAVE / ANAFILAXIA</Badge>
      case 'MODERADA':
        return <Badge variant="warning" size="sm">MODERADA</Badge>
      case 'LEVE':
      default:
        return <Badge variant="outline" size="sm">LEVE</Badge>
    }
  }

  return (
    <Card className="border-border shadow-xs card-subtle">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-bold text-foreground">
              Alergias e Reações Adversas
            </CardTitle>
            <Badge variant="outline" className="text-[10px] text-muted-foreground border-border">
              PRD Seção 8.6
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground mt-0.5">
            Registro com triplo estado: Alergia Conhecida, Nega Alergias ou Informação Não Disponível.
          </CardDescription>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={handleDeclareNoAllergies}
            disabled={isPending}
            className="h-8 text-xs font-medium border-border hover:bg-secondary cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            Declarar: Nega Alergias
          </Button>
          <Button
            size="sm"
            onClick={handleOpenAddModal}
            disabled={isPending}
            className="h-8 text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground focus-ring cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5 mr-1" />
            Registrar Alergia
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {feedback && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center justify-between animate-in fade-in duration-150 ${
              feedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border-destructive/20'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
              )}
              <span>{feedback.message}</span>
            </div>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. ESTADO: Alergias Conhecidas Registradas */}
        {activeKnownAllergies.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Alergias Ativas Confirmadas ({activeKnownAllergies.length})
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeKnownAllergies.map((allergy) => (
                <div
                  key={allergy.id}
                  className="p-3.5 bg-card rounded-xl border border-destructive/20 shadow-xs flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-sm text-foreground">{allergy.substance}</span>
                      {getSeverityBadge(allergy.severity)}
                    </div>
                    {allergy.reaction && (
                      <p className="text-xs text-muted-foreground leading-snug">
                        <strong className="text-foreground">Reação:</strong> {allergy.reaction}
                      </p>
                    )}
                    <span className="text-[10px] text-muted-foreground block pt-0.5 tabular-clinical">
                      Registrado em: {new Date(allergy.createdAt).toLocaleDateString('pt-BR')}
                    </span>
                  </div>

                  <div className="flex items-center justify-end pt-1 border-t border-border/40">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleInactivate(allergy.id, allergy.substance)}
                      disabled={isPending}
                      className="h-6 text-[11px] text-muted-foreground hover:text-destructive cursor-pointer p-0 px-2"
                    >
                      Inativar registro
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 2. ESTADO: Paciente declarou que Nega Alergias */}
        {isNoKnownAllergiesDeclared && (
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="leading-snug">
              <strong>Declaração Registrada:</strong> Paciente refere não apresentar alergias conhecidas.
            </div>
          </div>
        )}

        {/* 3. ESTADO: Informação Não Relatada (Triplo Estado - PRD Seção 8.6) */}
        {activeKnownAllergies.length === 0 && !isNoKnownAllergiesDeclared && (
          <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Info className="w-4 h-4 text-primary" />
              <span>Informação de Alergias Não Disponível / Não Relatada</span>
            </div>
            <p className="text-[11px] leading-relaxed">
              * Conforme a Seção 8.6 do PRD, a ausência de registro <strong>não é interpretada como ausência de alergias</strong>.
              Recomenda-se questionar o paciente na anamnese e registrar os alérgenos ou formalizar a declaração de negação.
            </p>
          </div>
        )}

        {/* Histórico de Inativadas */}
        {resolvedAllergies.length > 0 && (
          <div className="pt-2 border-t border-border/50">
            <details className="text-xs text-muted-foreground cursor-pointer">
              <summary className="font-medium hover:text-foreground">
                Ver alergias inativadas / resolvidas ({resolvedAllergies.length})
              </summary>
              <div className="mt-2 space-y-1.5 pl-2 border-l border-border">
                {resolvedAllergies.map((a) => (
                  <div key={a.id} className="text-[11px] py-1 flex items-center justify-between">
                    <span>{a.substance} ({a.severity || 'Sem gravidade'})</span>
                    <Badge variant="outline" size="sm" className="text-[9px]">RESOLVED</Badge>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}
      </CardContent>

      {/* Modal de Registro de Alergia */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-card border border-border shadow-xl rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Registrar Nova Alergia</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAllergy} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="substance" className="text-xs font-semibold text-foreground">
                  Substância / Medicamento / Alimento <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="substance"
                  required
                  placeholder="Ex: Dipirona, Contraste Iodado, Penicilina..."
                  value={formSubstance}
                  onChange={(e) => setFormSubstance(e.target.value)}
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="reaction" className="text-xs font-semibold text-foreground">
                  Manifestação Clínica / Reação
                </Label>
                <Input
                  id="reaction"
                  placeholder="Ex: Broncoespasmo, Urticária, Angioedema..."
                  value={formReaction}
                  onChange={(e) => setFormReaction(e.target.value)}
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="severity" className="text-xs font-semibold text-foreground">
                  Gravidade da Reação <span className="text-destructive">*</span>
                </Label>
                <select
                  id="severity"
                  value={formSeverity}
                  onChange={(e) => setFormSeverity(e.target.value as any)}
                  className="w-full h-10 rounded-xl border border-border bg-card px-3 text-xs sm:text-sm text-foreground focus-ring"
                >
                  <option value="LEVE">Leve (Urticária localizada, prurido)</option>
                  <option value="MODERADA">Moderada (Edema generalizado, vômitos)</option>
                  <option value="GRAVE">Grave / Choque Anafilático / Hipotensão</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-xs rounded-xl cursor-pointer"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  className="text-xs font-semibold bg-primary hover:bg-primary-hover text-primary-foreground rounded-xl cursor-pointer"
                >
                  {isPending ? 'Salvando...' : 'Registrar no Prontuário'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Card>
  )
}
