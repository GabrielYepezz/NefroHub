'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestRepresentationAction, RequestRepresentationDTO } from './representationActions'
import { UserPlus, AlertCircle, CheckCircle2, ShieldCheck, Info } from 'lucide-react'

interface NewRepresentationModalProps {
  onSuccess?: () => void
}

export function NewRepresentationModal({ onSuccess }: NewRepresentationModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState<'LEGAL_GUARDIAN' | 'CAREGIVER' | 'PROCURATOR' | 'FAMILY'>('CAREGIVER')
  const [authority, setAuthority] = useState<'FULL' | 'CONSULT_ONLY' | 'SUBMIT_VITALS'>('FULL')
  const [proofRef, setProofRef] = useState('')
  const [validUntil, setValidUntil] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    const payload: RequestRepresentationDTO = {
      representativeEmail: email,
      relationshipType: relationship,
      authorityType: authority,
      proofRef: proofRef || undefined,
      validUntil: validUntil || undefined,
    }

    startTransition(async () => {
      const res = await requestRepresentationAction(payload)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(res.message || 'Solicitação enviada para homologação!')
        setTimeout(() => {
          setIsOpen(false)
          setSuccess(null)
          setEmail('')
          setProofRef('')
          setValidUntil('')
          if (onSuccess) onSuccess()
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
        className="bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs h-8 shadow-xs focus-ring"
      >
        <UserPlus className="w-3.5 h-3.5 mr-1" /> Delegar Acesso a Cuidador
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 card-elevated border border-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4.5 h-4.5 text-primary" />
                  <h2 className="text-base font-bold text-foreground font-heading">
                    Solicitar Representação / Cuidador
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Delegue acesso ao seu prontuário com controle estrito de poderes.
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
              <div className="p-3 bg-warning-bg border border-warning/20 rounded-xl text-xs text-warning-foreground flex items-start gap-2.5">
                <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                <span>
                  A solicitação nascerá como <strong>Pendente</strong>. O acesso clínico delegado só será liberado após homologação formal da equipe administrativa do hospital.
                </span>
              </div>

              {/* E-mail do Representante */}
              <div className="space-y-1.5">
                <Label htmlFor="repEmail" className="text-xs font-semibold text-foreground">
                  E-mail do Representante / Cuidador <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="repEmail"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="cuidador@exemplo.com.br"
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  O cuidador já deve possuir uma conta cadastrada no NefroHub.
                </p>
              </div>

              {/* Grau de Relação e Tipo de Autoridade */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="relationship" className="text-xs font-semibold text-foreground">
                    Vínculo / Relação <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="relationship"
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as any)}
                    className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                  >
                    <option value="CAREGIVER">Cuidador Domiciliar</option>
                    <option value="FAMILY">Familiar de 1º Grau</option>
                    <option value="PROCURATOR">Procurador com Poderes</option>
                    <option value="LEGAL_GUARDIAN">Tutor / Curador Legal</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="authority" className="text-xs font-semibold text-foreground">
                    Nível de Autoridade <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="authority"
                    value={authority}
                    onChange={(e) => setAuthority(e.target.value as any)}
                    className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                  >
                    <option value="FULL">Completo (Visualizar e Enviar)</option>
                    <option value="SUBMIT_VITALS">Apenas Enviar Medições</option>
                    <option value="CONSULT_ONLY">Apenas Consulta / Leitura</option>
                  </select>
                </div>
              </div>

              {/* Referência da Procuração / Certidão */}
              <div className="space-y-1.5">
                <Label htmlFor="proofRef" className="text-xs font-semibold text-foreground">
                  Referência do Instrumento Legal (Procuração / Certidão)
                </Label>
                <Input
                  id="proofRef"
                  type="text"
                  value={proofRef}
                  onChange={(e) => setProofRef(e.target.value)}
                  placeholder="Ex: Procuração Cartório 2º Ofício, Livro 45-B"
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Validade */}
              <div className="space-y-1.5">
                <Label htmlFor="validUntil" className="text-xs font-semibold text-foreground">
                  Data de Validade da Procuração (se houver)
                </Label>
                <Input
                  id="validUntil"
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

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
                  {isPending ? 'Enviando Solicitação...' : 'Enviar para Homologação'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
