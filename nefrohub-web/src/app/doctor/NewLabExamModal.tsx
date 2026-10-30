'use client'

import { useState, useTransition, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { recordLabExamAction } from './actions'
import { calculateCKDEPI2021 } from '@/lib/calculators/ckd-epi'
import { Plus, AlertCircle, CheckCircle2, Calculator, Calendar, FlaskConical } from 'lucide-react'

const EXAM_CATALOG = [
  { name: 'Creatinina Sérica', defaultUnit: 'mg/dL', isCreatinine: true },
  { name: 'Ureia', defaultUnit: 'mg/dL', isCreatinine: false },
  { name: 'Potássio', defaultUnit: 'mEq/L', isCreatinine: false },
  { name: 'Sódio', defaultUnit: 'mEq/L', isCreatinine: false },
  { name: 'Bicarbonato', defaultUnit: 'mEq/L', isCreatinine: false },
  { name: 'Hemoglobina', defaultUnit: 'g/dL', isCreatinine: false },
  { name: 'Relação Albumina/Creatinina Urinária (RAC)', defaultUnit: 'mg/g', isCreatinine: false },
  { name: 'Proteína Urinária de 24h', defaultUnit: 'g/24h', isCreatinine: false },
  { name: 'Cálcio Sérico', defaultUnit: 'mg/dL', isCreatinine: false },
  { name: 'Fósforo', defaultUnit: 'mg/dL', isCreatinine: false },
]

interface NewLabExamModalProps {
  patientId: string
  patientName: string
  birthDate: string
  biologicalSex: 'M' | 'F'
}

export function NewLabExamModal({
  patientId,
  patientName,
  birthDate,
  biologicalSex,
}: NewLabExamModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [selectedExam, setSelectedExam] = useState(EXAM_CATALOG[0].name)
  const [numericValue, setNumericValue] = useState('')
  const [unit, setUnit] = useState(EXAM_CATALOG[0].defaultUnit)
  const [clinicalDate, setClinicalDate] = useState(new Date().toISOString().split('T')[0])

  const currentExamConfig = EXAM_CATALOG.find((e) => e.name === selectedExam) || EXAM_CATALOG[0]

  // Prévia da Calculadora CKD-EPI 2021 em Tempo Real
  const livePreview = useMemo(() => {
    if (!currentExamConfig.isCreatinine) return null
    const val = parseFloat(numericValue)
    if (isNaN(val) || val <= 0 || val > 35) return null

    try {
      const res = calculateCKDEPI2021({
        creatinine: val,
        creatinineUnit: unit === 'umol/L' ? 'umol/L' : 'mg/dL',
        birthDate,
        referenceDate: clinicalDate,
        biologicalSex,
      })
      return res
    } catch (err: any) {
      return { error: err.message }
    }
  }, [currentExamConfig.isCreatinine, numericValue, unit, birthDate, clinicalDate, biologicalSex])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const val = parseFloat(numericValue)
    if (isNaN(val) || val <= 0) {
      setError('Informe um valor numérico estritamente positivo para o exame.')
      return
    }

    startTransition(async () => {
      const res = await recordLabExamAction({
        patientId,
        examName: selectedExam,
        numericValue: val,
        originalUnit: unit,
        clinicalDate,
        calculateEgfr: currentExamConfig.isCreatinine,
      })

      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(res.message || 'Exame registrado e confirmado no prontuário!')
        setTimeout(() => {
          setIsOpen(false)
          setSuccess(null)
          setNumericValue('')
        }, 1200)
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setIsOpen(true)
          setError(null)
          setSuccess(null)
        }}
        className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs h-8 shadow-xs focus-ring"
      >
        <Plus className="w-3.5 h-3.5 mr-1" /> Novo Exame Laboratorial
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 card-elevated border border-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <FlaskConical className="w-4.5 h-4.5 text-primary" />
                  <h2 className="text-base font-bold text-foreground font-heading">
                    Lançamento de Exame Laboratorial
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Prontuário de: <strong className="text-foreground">{patientName}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 leading-none text-base cursor-pointer"
                aria-label="Fechar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Seleção do Exame */}
              <div className="space-y-1.5">
                <Label htmlFor="examName" className="text-xs font-semibold text-foreground">
                  Exame do Catálogo Clínico <span className="text-destructive">*</span>
                </Label>
                <select
                  id="examName"
                  value={selectedExam}
                  onChange={(e) => {
                    setSelectedExam(e.target.value)
                    const cfg = EXAM_CATALOG.find((c) => c.name === e.target.value)
                    if (cfg) setUnit(cfg.defaultUnit)
                  }}
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                >
                  {EXAM_CATALOG.map((exam) => (
                    <option key={exam.name} value={exam.name}>
                      {exam.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Valor e Unidade */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="numericValue" className="text-xs font-semibold text-foreground">
                    Resultado / Valor <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="numericValue"
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={numericValue}
                    onChange={(e) => setNumericValue(e.target.value)}
                    placeholder="Ex: 1.25"
                    className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="unit" className="text-xs font-semibold text-foreground">
                    Unidade de Medida
                  </Label>
                  <Input
                    id="unit"
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
                  />
                </div>
              </div>

              {/* Data da Coleta */}
              <div className="space-y-1.5">
                <Label htmlFor="clinicalDate" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Data da Coleta / Exame <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="clinicalDate"
                  type="date"
                  required
                  max={new Date().toISOString().split('T')[0]}
                  value={clinicalDate}
                  onChange={(e) => setClinicalDate(e.target.value)}
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Painel Dinâmico de Cálculo CKD-EPI 2021 */}
              {currentExamConfig.isCreatinine && livePreview && !('error' in livePreview) && (
                <div className="p-3.5 bg-primary-light/60 border border-primary/20 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-primary" />
                      Estimativa de eTFG (CKD-EPI 2021)
                    </span>
                    <Badge variant="primary" size="sm">
                      {livePreview.ckdStage}
                    </Badge>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-foreground tabular-clinical">
                      {livePreview.rounded_eGFR}
                    </span>
                    <span className="text-primary font-medium">mL/min/1.73m²</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">
                    {livePreview.stageDescription}. Este cálculo será persistido em <code>calculation_runs</code> com auditoria.
                  </p>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="p-3 text-xs text-destructive-foreground bg-destructive-bg border border-destructive/20 rounded-xl flex items-center gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div
                  role="alert"
                  className="p-3 text-xs text-success-foreground bg-success-bg border border-success/20 rounded-xl flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border/70">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-9"
                  onClick={() => setIsOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs h-9 focus-ring"
                >
                  {isPending ? 'Gravando e Calculando...' : 'Confirmar e Assinar Exame'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
