'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  registerDoctorAction,
  approveDoctorAction,
  deactivateDoctorAction,
  getDoctorActivationLinkAction,
  resendDoctorInviteAction,
} from './actions'
import { RegisterDoctorFormValues, BRAZILIAN_UFS } from '@/lib/validators/physician'
import {
  UserPlus,
  Stethoscope,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  UserX,
  UserCheck,
  Info,
  Loader2,
  Link as LinkIcon,
  Copy,
  Check,
  Mail,
} from 'lucide-react'

export interface DoctorDisplayItem {
  id: string
  name: string
  email: string
  phone: string | null
  role: string
  status: string
  crm: string | null
  crmUf: string | null
  specialty: string | null
  validationStatus: string | null
  isMaster: boolean
  createdAt: string
}

interface AdminPhysiciansClientProps {
  doctors: DoctorDisplayItem[]
}

export function AdminPhysiciansClient({ doctors }: AdminPhysiciansClientProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [actionLinkData, setActionLinkData] = useState<{ name: string; email: string; link: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // Form State
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [crm, setCrm] = useState('')
  const [crmUf, setCrmUf] = useState<typeof BRAZILIAN_UFS[number]>('SP')
  const [specialty, setSpecialty] = useState('Nefrologia')
  const [isMaster, setIsMaster] = useState(false)

  const handleOpenModal = () => {
    setName('')
    setEmail('')
    setPhone('')
    setCrm('')
    setCrmUf('SP')
    setSpecialty('Nefrologia')
    setIsMaster(false)
    setFeedback(null)
    setIsModalOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    const payload: RegisterDoctorFormValues = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      crm: crm.trim(),
      crmUf,
      specialty: specialty.trim() || 'Nefrologia',
      isMaster,
    }

    startTransition(async () => {
      const res = await registerDoctorAction(payload)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Médico cadastrado com sucesso.' })
        if (res.inviteLink) {
          setActionLinkData({
            name: payload.name,
            email: payload.email,
            link: res.inviteLink,
          })
        }
        setIsModalOpen(false)
      }
    })
  }

  const handleGetLink = (userId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await getDoctorActivationLinkAction(userId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else if (res.actionLink) {
        setActionLinkData({
          name: res.name || 'Médico',
          email: res.email || '',
          link: res.actionLink,
        })
      }
    })
  }

  const handleResendEmail = (userId: string) => {
    setFeedback(null)
    startTransition(async () => {
      const res = await resendDoctorInviteAction(userId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Convite reenviado por e-mail com sucesso.' })
      }
    })
  }

  const handleApprove = (userId: string, docName: string) => {
    if (!confirm(`Deseja homologar e ativar o credenciamento de Dr(a). ${docName}?`)) return
    setFeedback(null)

    startTransition(async () => {
      const res = await approveDoctorAction(userId)
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Médico homologado com sucesso.' })
      }
    })
  }

  const handleDeactivate = (userId: string, docName: string) => {
    const reason = prompt(`Informe a justificativa institucional para desativação de Dr(a). ${docName}:`)
    if (!reason || reason.trim() === '') return
    setFeedback(null)

    startTransition(async () => {
      const res = await deactivateDoctorAction(userId, reason.trim())
      if (res.error) {
        setFeedback({ type: 'error', message: res.error })
      } else {
        setFeedback({ type: 'success', message: res.message || 'Médico desativado.' })
      }
    })
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Feedback Alert */}
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

      {/* Header com Ação Primária de Cadastro */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Corpo Clínico & Médicos
            </h1>
            <Badge variant="primary" size="sm">
              Seção 2.3 & 2.4
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão institucional de médicos habilitados, validação de CRM e designação de Doctor Master.
          </p>
        </div>

        <Button
          onClick={handleOpenModal}
          className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs focus-ring h-10 px-4 rounded-xl"
        >
          <UserPlus className="w-4 h-4 mr-2" />
          Cadastrar Médico
        </Button>
      </div>

      {/* Banner de Governança e Regra Seção 4.5 */}
      <div className="p-4 rounded-xl bg-primary-light/60 border border-primary/20 text-foreground text-xs flex items-start gap-3">
        <Stethoscope className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-primary">Regra de Desativação e Reatribuição (PRD Seção 4.5)</p>
          <p className="text-muted-foreground leading-relaxed">
            A desativação do médico responsável principal é bloqueada caso existam pacientes ativos vinculados sem um substituto habilitado formalmente designado. Os rascunhos são preservados e transferidos para revisão.
          </p>
        </div>
      </div>

      {/* Tabela de Médicos */}
      <Card className="border-border card-subtle">
        <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Médicos Habilitados ({doctors.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Profissionais autorizados a acompanhar pacientes e assinar prontuários
              </CardDescription>
            </div>
            <Badge variant="secondary" size="sm">
              Total: {doctors.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Nome do Médico</th>
                  <th className="px-5 py-3 font-semibold">CRM / UF</th>
                  <th className="px-5 py-3 font-semibold">E-mail Institucional</th>
                  <th className="px-5 py-3 font-semibold">Especialidade</th>
                  <th className="px-5 py-3 font-semibold">Papel Clínico</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {doctors.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-muted-foreground">
                      <EmptyState
                        icon={<Stethoscope className="w-6 h-6 text-muted-foreground/60" />}
                        title="Nenhum médico cadastrado"
                        description="Utilize o botão acima para cadastrar o primeiro médico do corpo clínico."
                        className="border-0 bg-transparent py-2"
                      />
                    </td>
                  </tr>
                ) : (
                  doctors.map((doc) => {
                    const isPendingApproval = doc.status === 'PENDING_APPROVAL' || doc.validationStatus === 'PENDING'
                    const isActive = doc.status === 'ACTIVE' && doc.validationStatus !== 'PENDING'
                    const isDeactivated = doc.status === 'DEACTIVATED'

                    return (
                      <tr key={doc.id} className="hover:bg-secondary/30 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-foreground">
                          Dr(a). {doc.name}
                        </td>
                        <td className="px-5 py-3.5 font-mono tabular-clinical font-semibold text-primary">
                          {doc.crm ? `${doc.crm}/${doc.crmUf || 'SP'}` : 'Não informado'}
                        </td>
                        <td className="px-5 py-3.5 text-muted-foreground">{doc.email}</td>
                        <td className="px-5 py-3.5 text-foreground">{doc.specialty || 'Nefrologia'}</td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                              doc.isMaster || doc.role?.toUpperCase() === 'DOCTOR_MASTER'
                                ? 'bg-primary-light text-primary border border-primary/20'
                                : 'bg-secondary text-foreground'
                            }`}
                          >
                            {doc.isMaster || doc.role?.toUpperCase() === 'DOCTOR_MASTER'
                              ? 'Doctor Master'
                              : 'Médico Clínico'}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {isPendingApproval ? (
                            <Badge variant="warning" size="sm" dot>
                              Aguardando Homologação
                            </Badge>
                          ) : isActive ? (
                            <Badge variant="success" size="sm" dot>
                              Ativo
                            </Badge>
                          ) : isDeactivated ? (
                            <Badge variant="destructive" size="sm">
                              Desativado
                            </Badge>
                          ) : (
                            <Badge variant="secondary" size="sm">
                              {doc.status}
                            </Badge>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-border hover:bg-secondary focus-ring cursor-pointer"
                              title="Obter Link Direto de Ativação / Primeiro Acesso"
                              disabled={isPending}
                              onClick={() => handleGetLink(doc.id)}
                            >
                              <LinkIcon className="w-3 h-3 mr-1 text-primary" />
                              Link
                            </Button>

                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-border hover:bg-secondary focus-ring cursor-pointer"
                              title="Reenviar convite por e-mail"
                              disabled={isPending}
                              onClick={() => handleResendEmail(doc.id)}
                            >
                              <Mail className="w-3 h-3 mr-1 text-muted-foreground" />
                              E-mail
                            </Button>

                            {isPendingApproval && (
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-success hover:bg-success/90 text-success-foreground font-semibold focus-ring cursor-pointer"
                                disabled={isPending}
                                onClick={() => handleApprove(doc.id, doc.name)}
                              >
                                <UserCheck className="w-3 h-3 mr-1" />
                                Homologar
                              </Button>
                            )}

                            {isActive && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive border-destructive/20 hover:bg-destructive-bg focus-ring cursor-pointer"
                                disabled={isPending}
                                onClick={() => handleDeactivate(doc.id, doc.name)}
                              >
                                <UserX className="w-3 h-3 mr-1" />
                                Desativar
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

      {/* Modal: Cadastrar Médico */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-card rounded-2xl card-elevated border border-border max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <Stethoscope className="w-4.5 h-4.5 text-primary" />
                <h3 className="text-base font-bold text-foreground font-heading">
                  Cadastrar Médico no Corpo Clínico
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

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="p-3 bg-info-bg border border-info/20 rounded-xl text-xs text-info-foreground flex items-start gap-2.5">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  O profissional receberá status <strong>Pendente de Homologação</strong>. O acesso clínico aos prontuários só será liberado após validação institucional do CRM.
                </span>
              </div>

              <div>
                <Label htmlFor="doc-name" className="text-xs font-semibold text-foreground">
                  Nome Completo do Médico <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="doc-name"
                  required
                  placeholder="Ex: Carlos Eduardo de Oliveira"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 text-xs sm:text-sm mt-1 focus-ring"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="doc-email" className="text-xs font-semibold text-foreground">
                    E-mail Institucional <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="doc-email"
                    type="email"
                    required
                    placeholder="medico@hospital.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-10 text-xs sm:text-sm mt-1 focus-ring"
                  />
                </div>

                <div>
                  <Label htmlFor="doc-phone" className="text-xs font-semibold text-foreground">
                    Telefone de Contato
                  </Label>
                  <Input
                    id="doc-phone"
                    placeholder="(11) 98888-8888"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="h-10 text-xs sm:text-sm mt-1 focus-ring tabular-clinical"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="doc-crm" className="text-xs font-semibold text-foreground">
                    Número do CRM <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="doc-crm"
                    required
                    placeholder="Ex: 123456"
                    value={crm}
                    onChange={(e) => setCrm(e.target.value)}
                    className="h-10 text-xs sm:text-sm mt-1 focus-ring tabular-clinical font-mono"
                  />
                </div>

                <div>
                  <Label htmlFor="doc-uf" className="text-xs font-semibold text-foreground">
                    UF do CRM <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="doc-uf"
                    value={crmUf}
                    onChange={(e) => setCrmUf(e.target.value as any)}
                    className="w-full h-10 rounded-xl border border-border bg-card text-xs sm:text-sm px-3 mt-1 focus-ring text-foreground font-mono"
                  >
                    {BRAZILIAN_UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor="doc-spec" className="text-xs font-semibold text-foreground">
                  Especialidade Médica
                </Label>
                <Input
                  id="doc-spec"
                  placeholder="Nefrologia"
                  value={specialty}
                  onChange={(e) => setSpecialty(e.target.value)}
                  className="h-10 text-xs sm:text-sm mt-1 focus-ring"
                />
              </div>

              <div className="p-3 bg-secondary/50 rounded-xl border border-border">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isMaster}
                    onChange={(e) => setIsMaster(e.target.checked)}
                    className="w-4 h-4 rounded text-primary border-border focus:ring-primary accent-primary mt-0.5"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-foreground">Designar como Doctor Master (Coordenação)</span>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                      Habilita o profissional para cobertura clínica excepcional e coordenação de vínculos (PRD Seção 2.4).
                    </p>
                  </div>
                </label>
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
                      Cadastrando...
                    </span>
                  ) : (
                    'Cadastrar Médico'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Link de Ativação Direto */}
      {actionLinkData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-card rounded-2xl card-elevated border border-border max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5 text-primary" />
                <h3 className="text-base font-bold text-foreground font-heading">
                  Link de Ativação / Primeiro Acesso
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActionLinkData(null)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-foreground">
              <p>
                Profissional: <strong>Dr(a). {actionLinkData.name}</strong> ({actionLinkData.email})
              </p>
              <div className="p-3 bg-secondary/60 rounded-xl border border-border font-mono text-[11px] break-all select-all text-muted-foreground max-h-32 overflow-y-auto">
                {actionLinkData.link}
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Envie este link seguro diretamente ao médico (via WhatsApp institucional, e-mail corporativo ou chat). Ao clicar, o médico confirma seu acesso e inicia sua autenticação na plataforma.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/70">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 text-xs cursor-pointer"
                onClick={() => setActionLinkData(null)}
              >
                Fechar
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs"
                onClick={() => {
                  navigator.clipboard.writeText(actionLinkData.link)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copiado para a área de transferência!' : 'Copiar Link'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
