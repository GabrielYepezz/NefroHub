'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EmptyState } from '@/components/ui/empty-state'
import {
  createPhysicianPatientLinkAction,
  endPhysicianPatientLinkAction,
  revokeRepresentationAdminAction,
} from './actions'
import {
  approveRepresentationQueueAction,
  rejectRepresentationQueueAction,
} from '@/app/admin/filas/actions'
import {
  Link2,
  Users,
  UserPlus,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ShieldCheck,
  FileText,
  Clock,
  Loader2,
} from 'lucide-react'

export interface PhysicianLinkItem {
  id: string
  patientId: string
  patientName: string
  physicianId: string
  physicianName: string
  physicianEmail: string
  isPrimary: boolean
  status: string
  activatedAt: string | null
  createdAt: string
  reason: string | null
}

export interface RepresentationAdminItem {
  id: string
  patientId: string
  patientName: string
  representativeId: string
  representativeName: string
  representativeEmail: string
  relationshipType: string
  authorityType: string
  proofRef: string | null
  status: string
  validUntil: string | null
  createdAt: string
}

interface PatientOption {
  id: string
  name: string
}

interface DoctorOption {
  id: string
  name: string
}

interface AdminLinksClientProps {
  links: PhysicianLinkItem[]
  representations: RepresentationAdminItem[]
  availablePatients: PatientOption[]
  availableDoctors: DoctorOption[]
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
  CONSULT_ONLY: 'Apenas Consulta',
}

export function AdminLinksClient({
  links,
  representations,
  availablePatients,
  availableDoctors,
}: AdminLinksClientProps) {
  const [activeTab, setActiveTab] = useState<'links' | 'representations'>('links')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Form State para Novo Vínculo
  const [selectedPatientId, setSelectedPatientId] = useState(availablePatients[0]?.id || '')
  const [selectedDoctorId, setSelectedDoctorId] = useState(availableDoctors[0]?.id || '')
  const [isPrimary, setIsPrimary] = useState(false)
  const [reason, setReason] = useState('')

  const handleCreateLink = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (!selectedPatientId || !selectedDoctorId) {
      setFeedback({ type: 'error', message: 'Selecione um paciente e um médico.' })
      return
    }

    startTransition(async () => {
      const res = await createPhysicianPatientLinkAction({
        patientId: selectedPatientId,
        physicianUserId: selectedDoctorId,
        isPrimary,
        reason: reason.trim() || undefined,
      })

      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Vínculo criado com sucesso!' })
        setIsModalOpen(false)
        setReason('')
      }
    })
  }

  const handleEndLink = (linkId: string, docName: string, patientName: string) => {
    const reasonPrompt = prompt(`Informe a justificativa para encerrar o vínculo de Dr(a). ${docName} com ${patientName}:`)
    if (!reasonPrompt || reasonPrompt.trim() === '') return
    setFeedback(null)

    startTransition(async () => {
      const res = await endPhysicianPatientLinkAction(linkId, reasonPrompt.trim())
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Vínculo encerrado.' })
      }
    })
  }

  const handleApproveRep = (repId: string, repName: string) => {
    if (!confirm(`Deseja homologar formalmente a representação de ${repName}?`)) return
    setFeedback(null)

    startTransition(async () => {
      const res = await approveRepresentationQueueAction(repId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Representação homologada.' })
      }
    })
  }

  const handleRejectRep = (repId: string, repName: string) => {
    const reasonPrompt = prompt(`Informe a justificativa da recusa da representação de ${repName}:`)
    if (!reasonPrompt || reasonPrompt.trim() === '') return
    setFeedback(null)

    startTransition(async () => {
      const res = await rejectRepresentationQueueAction(repId, reasonPrompt.trim())
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Representação recusada.' })
      }
    })
  }

  const handleRevokeRep = (repId: string, repName: string) => {
    const reasonPrompt = prompt(`Informe a justificativa institucional para revogação da representação de ${repName}:`)
    if (!reasonPrompt || reasonPrompt.trim() === '') return
    setFeedback(null)

    startTransition(async () => {
      const res = await revokeRepresentationAdminAction(repId, reasonPrompt.trim())
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Representação revogada.' })
      }
    })
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Feedback Banner */}
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

      {/* Header com Ações */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Vínculos Clínicos & Representação
            </h1>
            <Badge variant="primary" size="sm">
              Seção 4 & 5
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Governança da relação médico-paciente e poderes delegados a representantes legais e cuidadores.
          </p>
        </div>

        <Button
          onClick={() => {
            setIsPrimary(false)
            setReason('')
            setFeedback(null)
            setIsModalOpen(true)
          }}
          className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs focus-ring h-10 px-4 rounded-xl"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Atribuir Vínculo Clínico
        </Button>
      </div>

      {/* Abas de Navegação */}
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('links')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'links'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-secondary'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          <span>Vínculos Médico-Paciente ({links.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('representations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'representations'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:bg-secondary'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Representantes Legais & Cuidadores ({representations.length})</span>
        </button>
      </div>

      {/* Aba 1: Vínculos Médico-Paciente */}
      {activeTab === 'links' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-primary-light/60 border border-primary/20 text-foreground text-xs flex items-start gap-3">
            <Link2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-primary">Regra de Invariante de Vínculo Primário (PRD Seção 4.1)</p>
              <p className="text-muted-foreground leading-relaxed">
                Um paciente pode ter médicos assistentes adicionais, mas deve possuir exatamente UM responsável clínico principal enquanto estiver ativo. O encerramento revoga imediatamente o acesso aos dados clínicos.
              </p>
            </div>
          </div>

          <Card className="border-border card-subtle">
            <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                Vínculos Estabelecidos ({links.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Controle de autorização clínica formal entre profissional e paciente
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Paciente</th>
                      <th className="px-5 py-3 font-semibold">Médico Responsável</th>
                      <th className="px-5 py-3 font-semibold">Tipo de Vínculo</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold">Data de Ativação</th>
                      <th className="px-5 py-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-card">
                    {links.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                          <EmptyState
                            icon={<Link2 className="w-6 h-6 text-muted-foreground/60" />}
                            title="Nenhum vínculo registrado"
                            description="Utilize o botão acima para atribuir o primeiro médico responsável a um paciente."
                            className="border-0 bg-transparent py-2"
                          />
                        </td>
                      </tr>
                    ) : (
                      links.map((link) => (
                        <tr key={link.id} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3.5 font-medium text-foreground">
                            {link.patientName}
                          </td>
                          <td className="px-5 py-3.5 text-foreground">
                            Dr(a). {link.physicianName}
                            <span className="block text-[11px] text-muted-foreground">{link.physicianEmail}</span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                link.isPrimary
                                  ? 'bg-primary-light text-primary border border-primary/20'
                                  : 'bg-secondary text-foreground'
                              }`}
                            >
                              {link.isPrimary ? 'Responsável Primário' : 'Médico Assistente'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <Badge
                              variant={link.status === 'ACTIVE' ? 'success' : 'secondary'}
                              size="sm"
                              dot={link.status === 'ACTIVE'}
                            >
                              {link.status === 'ACTIVE' ? 'Ativo' : 'Encerrado'}
                            </Badge>
                          </td>
                          <td className="px-5 py-3.5 text-muted-foreground tabular-clinical">
                            {link.activatedAt
                              ? new Date(link.activatedAt).toLocaleDateString('pt-BR')
                              : new Date(link.createdAt).toLocaleDateString('pt-BR')}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            {link.status === 'ACTIVE' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive-bg focus-ring"
                                disabled={isPending}
                                onClick={() => handleEndLink(link.id, link.physicianName, link.patientName)}
                              >
                                Encerrar Vínculo
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aba 2: Representantes Legais & Cuidadores */}
      {activeTab === 'representations' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-info-bg border border-info/20 text-info-foreground text-xs flex items-start gap-3">
            <Users className="w-5 h-5 text-info shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold text-foreground">Governança de Acesso Delegado (PRD Seção 2.6 & 5)</p>
              <p className="text-muted-foreground leading-relaxed">
                Representações nascem como Pendentes e exigem conferência de autoridade e procuração legal pelo administrador antes de conceder acesso aos prontuários.
              </p>
            </div>
          </div>

          <Card className="border-border card-subtle">
            <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
              <CardTitle className="text-base font-semibold text-foreground">
                Representações Registradas ({representations.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Procurações, cuidadores e tutores homologados na instalação
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Paciente Representado</th>
                      <th className="px-5 py-3 font-semibold">Representante / Cuidador</th>
                      <th className="px-5 py-3 font-semibold">Vínculo Legal</th>
                      <th className="px-5 py-3 font-semibold">Poderes</th>
                      <th className="px-5 py-3 font-semibold">Validade</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 font-semibold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 bg-card">
                    {representations.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                          <EmptyState
                            icon={<Users className="w-6 h-6 text-muted-foreground/60" />}
                            title="Nenhuma representação registrada"
                            description="Solicitações iniciadas por pacientes no portal aparecerão aqui para homologação."
                            className="border-0 bg-transparent py-2"
                          />
                        </td>
                      </tr>
                    ) : (
                      representations.map((rep) => {
                        const relLabel = RELATION_LABELS[rep.relationshipType] || rep.relationshipType
                        const authLabel = AUTHORITY_LABELS[rep.authorityType] || rep.authorityType

                        return (
                          <tr key={rep.id} className="hover:bg-secondary/30 transition-colors">
                            <td className="px-5 py-3.5 font-medium text-foreground">
                              {rep.patientName}
                            </td>
                            <td className="px-5 py-3.5 text-foreground">
                              {rep.representativeName}
                              <span className="block text-[11px] text-muted-foreground">{rep.representativeEmail}</span>
                            </td>
                            <td className="px-5 py-3.5">
                              <span className="font-medium text-foreground">{relLabel}</span>
                              {rep.proofRef && (
                                <span className="block text-[10px] text-muted-foreground" title={rep.proofRef}>
                                  Ref: {rep.proofRef}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-muted-foreground">{authLabel}</td>
                            <td className="px-5 py-3.5 tabular-clinical">
                              {rep.validUntil ? (
                                <span className="text-foreground font-medium">
                                  {new Date(rep.validUntil + 'T00:00:00').toLocaleDateString('pt-BR')}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">Indeterminada</span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <Badge
                                variant={
                                  rep.status === 'ACTIVE'
                                    ? 'success'
                                    : rep.status === 'PENDING'
                                    ? 'warning'
                                    : 'secondary'
                                }
                                size="sm"
                                dot={rep.status === 'ACTIVE' || rep.status === 'PENDING'}
                              >
                                {rep.status === 'ACTIVE'
                                  ? 'Ativo'
                                  : rep.status === 'PENDING'
                                  ? 'Aguardando Homologação'
                                  : 'Revogado / Encerrado'}
                              </Badge>
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {rep.status === 'PENDING' && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive-bg focus-ring"
                                      disabled={isPending}
                                      onClick={() => handleRejectRep(rep.id, rep.representativeName)}
                                    >
                                      Recusar
                                    </Button>
                                    <Button
                                      size="sm"
                                      className="h-7 text-xs bg-success hover:bg-success/90 text-success-foreground font-semibold focus-ring"
                                      disabled={isPending}
                                      onClick={() => handleApproveRep(rep.id, rep.representativeName)}
                                    >
                                      Homologar
                                    </Button>
                                  </>
                                )}

                                {rep.status === 'ACTIVE' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive-bg focus-ring"
                                    disabled={isPending}
                                    onClick={() => handleRevokeRep(rep.id, rep.representativeName)}
                                  >
                                    Revogar Acesso
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal: Atribuir Vínculo Clínico */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-card rounded-2xl card-elevated border border-border max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Link2 className="w-4.5 h-4.5 text-primary" />
                <h3 className="text-base font-bold text-foreground font-heading">
                  Atribuir Vínculo Clínico
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateLink} className="space-y-3.5">
              <div>
                <Label htmlFor="link-patient" className="text-xs font-semibold text-foreground">
                  Paciente *
                </Label>
                <select
                  id="link-patient"
                  value={selectedPatientId}
                  onChange={(e) => setSelectedPatientId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                >
                  {availablePatients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="link-doctor" className="text-xs font-semibold text-foreground">
                  Médico a ser Vinculado *
                </Label>
                <select
                  id="link-doctor"
                  value={selectedDoctorId}
                  onChange={(e) => setSelectedDoctorId(e.target.value)}
                  className="w-full h-10 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground"
                >
                  {availableDoctors.map((d) => (
                    <option key={d.id} value={d.id}>
                      Dr(a). {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 bg-secondary/50 rounded-xl border border-border">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPrimary}
                    onChange={(e) => setIsPrimary(e.target.checked)}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-primary accent-primary mt-0.5"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Designar como Médico Responsável Principal</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Se o paciente já tiver um médico principal, o anterior será rebaixado para médico assistente.
                    </p>
                  </div>
                </label>
              </div>

              <div>
                <Label htmlFor="link-reason" className="text-xs font-semibold text-foreground">
                  Justificativa / Motivo da Atribuição
                </Label>
                <Input
                  id="link-reason"
                  placeholder="Ex: Atendimento ambulatorial, Cobertura clínica"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-10 text-xs sm:text-sm mt-1 focus-ring"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/70">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="h-9 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs"
                  disabled={isPending}
                >
                  {isPending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Vinculando...
                    </span>
                  ) : (
                    'Estabelecer Vínculo'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
