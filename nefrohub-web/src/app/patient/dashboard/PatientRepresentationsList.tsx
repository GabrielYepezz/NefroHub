'use client'

import { useTransition, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { NewRepresentationModal } from './NewRepresentationModal'
import { revokeRepresentationAction } from './representationActions'
import { Users, AlertCircle, CheckCircle2 } from 'lucide-react'

export interface RepresentationDisplayItem {
  id: string
  name: string
  email: string
  relationshipType: string
  authorityType: string
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'ENDED' | 'REJECTED'
  validUntil?: string | null
  createdAt: string
}

interface PatientRepresentationsListProps {
  representations: RepresentationDisplayItem[]
}

const RELATION_LABELS: Record<string, string> = {
  CAREGIVER: 'Cuidador Domiciliar',
  FAMILY: 'Familiar de 1º Grau',
  PROCURATOR: 'Procurador Legal',
  LEGAL_GUARDIAN: 'Tutor / Curador Legal',
}

const AUTHORITY_LABELS: Record<string, string> = {
  FULL: 'Completo (Leitura e Envio)',
  SUBMIT_VITALS: 'Envio de Sinais Vitais',
  CONSULT_ONLY: 'Apenas Leitura',
}

export function PatientRepresentationsList({ representations }: PatientRepresentationsListProps) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const handleRevoke = (id: string, name: string) => {
    if (!confirm(`Deseja revogar o acesso delegado do cuidador ${name}? O acesso será suspenso imediatamente.`)) {
      return
    }

    setFeedback(null)
    startTransition(async () => {
      const res = await revokeRepresentationAction(id)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Representação revogada com sucesso.' })
      }
    })
  }

  return (
    <Card className="border-border card-subtle font-sans">
      <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Cuidadores & Representantes Legais
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Delegue acesso seguro para familiares ou cuidadores acompanharem seu prontuário
            </CardDescription>
          </div>
          <NewRepresentationModal />
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {feedback && (
          <div
            role="alert"
            className={`p-3 text-xs rounded-xl flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}

        {representations.length === 0 ? (
          <EmptyState
            icon={<Users className="w-6 h-6 text-muted-foreground/60" />}
            title="Nenhum cuidador vinculado"
            description="Você ainda não delegou acesso ao seu prontuário para nenhum cuidador ou representante legal."
            className="border-0 bg-transparent py-4"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {representations.map((rep) => {
              const relLabel = RELATION_LABELS[rep.relationshipType] || rep.relationshipType
              const authLabel = AUTHORITY_LABELS[rep.authorityType] || rep.authorityType

              return (
                <div
                  key={rep.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">{rep.name}</span>
                      <Badge
                        variant={
                          rep.status === 'ACTIVE'
                            ? 'success'
                            : rep.status === 'PENDING'
                            ? 'warning'
                            : 'secondary'
                        }
                        size="sm"
                        dot
                      >
                        {rep.status === 'ACTIVE'
                          ? 'Ativo e Autorizado'
                          : rep.status === 'PENDING'
                          ? 'Aguardando Homologação'
                          : 'Revogado / Encerrado'}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3 tabular-clinical">
                      <span>Vínculo: <strong className="text-foreground">{relLabel}</strong></span>
                      <span>Poderes: <strong className="text-foreground">{authLabel}</strong></span>
                      <span className="text-muted-foreground/80">E-mail: {rep.email}</span>
                      {rep.validUntil && (
                        <span>Validade: <strong className="text-foreground">{new Date(rep.validUntil + 'T00:00:00').toLocaleDateString('pt-BR')}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    {rep.status === 'ACTIVE' && (
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-8 text-xs focus-ring"
                        disabled={isPending}
                        onClick={() => handleRevoke(rep.id, rep.name)}
                      >
                        Revogar Acesso
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
