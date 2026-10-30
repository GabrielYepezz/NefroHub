// src/app/patient/dashboard/PatientClinicalSummary.tsx
'use client'

import React from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Stethoscope, Pill, ShieldCheck, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import type { ConditionStatus, MedicationStatus } from '@/types/database'

export interface PatientConditionItem {
  id: string
  name: string
  cid10?: string | null
  onsetDate?: string | null
  status: ConditionStatus
  notes?: string | null
  createdAt: string
}

export interface PatientMedicationItem {
  id: string
  name: string
  dosage?: string | null
  unit?: string | null
  route?: string | null
  frequency?: string | null
  startDate?: string | null
  endDate?: string | null
  status: MedicationStatus
  notes?: string | null
  createdAt: string
}

export interface PatientAllergyItem {
  id: string
  substance: string
  reaction?: string | null
  severity?: string | null
  status: 'KNOWN' | 'NO_KNOWN_ALLERGIES' | 'UNREPORTED' | 'RESOLVED'
  createdAt: string
}

interface PatientClinicalSummaryProps {
  conditions: PatientConditionItem[]
  medications: PatientMedicationItem[]
  allergies?: PatientAllergyItem[]
}

export function PatientClinicalSummary({
  conditions,
  medications,
  allergies = [],
}: PatientClinicalSummaryProps) {
  const activeConditions = conditions.filter((c) => c.status === 'ACTIVE')
  const resolvedConditions = conditions.filter((c) => c.status !== 'ACTIVE')

  const activeMeds = medications.filter((m) => m.status === 'ACTIVE')
  const inactiveMeds = medications.filter((m) => m.status !== 'ACTIVE')

  const activeKnownAllergies = allergies.filter((a) => a.status === 'KNOWN')
  const isNoKnownAllergies = allergies.some((a) => a.status === 'NO_KNOWN_ALLERGIES')

  return (
    <div className="space-y-6 font-sans">
      {/* Aviso de Governança do Portal do Paciente */}
      <div className="p-4 bg-primary-light/60 border border-primary/20 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="text-xs text-foreground space-y-1">
          <p className="font-semibold text-primary">
            Acompanhamento Clínico Estruturado (Somente Leitura)
          </p>
          <p className="leading-relaxed text-muted-foreground">
            As informações abaixo refletem o histórico de condições, tratamentos e alergias validados pelo seu médico assistente.
            Para sua segurança, modificações de dosagem, inclusão de diagnósticos ou interrupção de fármacos devem ser realizadas exclusivamente sob orientação médica formal.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Card 1: Comorbidades e Doenças de Base */}
        <Card className="border-border card-subtle">
          <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <Stethoscope className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Minhas Comorbidades
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Condições diagnosticadas no prontuário
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {conditions.length === 0 ? (
              <EmptyState
                icon={<Stethoscope className="w-6 h-6 text-muted-foreground/60" />}
                title="Nenhuma comorbidade registrada"
                description="Não há histórico de comorbidades cadastradas."
                className="border-0 bg-transparent py-4"
              />
            ) : (
              <div className="space-y-3">
                {activeConditions.map((cond) => (
                  <div key={cond.id} className="py-1.5 flex items-start justify-between gap-2 border-b border-border/40 last:border-0">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-foreground">{cond.name}</span>
                        {cond.cid10 && (
                          <Badge variant="outline" size="sm" className="font-mono text-[9px]">
                            {cond.cid10}
                          </Badge>
                        )}
                      </div>
                      {cond.notes && <p className="text-[11px] text-muted-foreground mt-0.5 italic">{cond.notes}</p>}
                    </div>
                    <Badge variant="success" size="sm">Ativa</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Medicamentos de Uso Contínuo */}
        <Card className="border-border card-subtle">
          <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <Pill className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Medicamentos Contínuos
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Fármacos e posologias informadas
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {medications.length === 0 ? (
              <EmptyState
                icon={<Pill className="w-6 h-6 text-muted-foreground/60" />}
                title="Nenhum medicamento registrado"
                description="Não há medicamentos de uso contínuo cadastrados."
                className="border-0 bg-transparent py-4"
              />
            ) : (
              <div className="space-y-3">
                {activeMeds.map((med) => (
                  <div key={med.id} className="py-1.5 flex items-start justify-between gap-2 border-b border-border/40 last:border-0">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs text-foreground">{med.name}</span>
                        {med.dosage && (
                          <span className="text-[10px] font-medium bg-secondary px-1 py-0.5 rounded border border-border">
                            {med.dosage} {med.unit || ''}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {med.frequency && <span>{med.frequency}</span>}
                        {med.route && <span> • Via: {med.route}</span>}
                      </div>
                    </div>
                    <Badge variant="success" size="sm">Em Uso</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Alergias e Reações (Triplo Estado - PRD Seção 8.6 - RF-054) */}
        <Card className="border-border card-subtle">
          <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Minhas Alergias
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Alérgenos e histórico de hipersensibilidade
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            {activeKnownAllergies.length > 0 ? (
              <div className="space-y-2.5">
                {activeKnownAllergies.map((allergy) => (
                  <div key={allergy.id} className="p-2.5 bg-destructive-bg/20 rounded-lg border border-destructive/20 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-foreground">{allergy.substance}</span>
                      <Badge variant="destructive" size="sm" className="text-[9px]">
                        {allergy.severity || 'ALERTA'}
                      </Badge>
                    </div>
                    {allergy.reaction && (
                      <p className="text-[11px] text-muted-foreground">
                        <strong>Reação:</strong> {allergy.reaction}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : isNoKnownAllergies ? (
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Nega alergias conhecidas relatadas ao médico.</span>
              </div>
            ) : (
              <div className="p-3 bg-muted/40 border border-border rounded-xl space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 font-medium text-foreground">
                  <Info className="w-3.5 h-3.5 text-primary" />
                  <span>Informação não relatada</span>
                </div>
                <p className="text-[10px] leading-relaxed">
                  Não há registro de alergias no seu prontuário. Informe seu médico na próxima consulta.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
