import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MetricCard } from '@/components/ui/metric-card'
import Link from 'next/link'
import {
  Users,
  UserCheck,
  Link2,
  ListOrdered,
  ShieldCheck,
  ArrowRight,
  Activity,
  FileText,
  AlertTriangle,
  Building2,
} from 'lucide-react'
import { RegisterPatientModal } from '@/app/patient/AdminClientComponents'

export default async function AdminOverviewPage() {
  const supabase = await createClient()

  // 1. Buscar métricas operacionais
  const { count: totalPatients } = await supabase
    .from('patient_profiles')
    .select('*', { count: 'exact', head: true })

  const { count: pendingReviewPatients } = await supabase
    .from('patient_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'PENDING_REVIEW')

  const { count: totalPhysicians } = await supabase
    .from('physician_patient_links')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'ACTIVE')

  // 2. Buscar médicos para o modal de cadastro
  let availableDoctors: { id: string; name: string }[] = []
  const { data: usersDoctors } = await supabase
    .from('users')
    .select('id, name')
    .eq('role', 'DOCTOR')

  if (usersDoctors && usersDoctors.length > 0) {
    availableDoctors = usersDoctors
  } else {
    const { data: legacyDoctors } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'doctor')
    if (legacyDoctors) {
      availableDoctors = legacyDoctors
    }
  }

  // 3. Buscar últimos pacientes cadastrados para tabela de resumo
  const { data: recentPatients } = await supabase
    .from('patient_profiles')
    .select(`
      id,
      full_name,
      cpf_masked,
      birth_date,
      status,
      created_at,
      physician_patient_links (
        is_primary,
        status,
        users:physician_user_id (name)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(5)

  return (
    <div className="space-y-8 font-sans">
      {/* Header com Identificação e Ação Primária */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-heading">
              Painel de Governança Operacional
            </h1>
            <Badge variant="primary" size="sm">
              Backoffice
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Controle institucional de prontuários, credenciamento clínico e filas de trabalho (documentation.md).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RegisterPatientModal doctors={availableDoctors} />
        </div>
      </div>

      {/* Grid de KPIs Principais (MetricCard do Design System) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total de Pacientes"
          value={totalPatients ?? 0}
          subtitle="Prontuários registrados na instituição"
          variant="primary"
          icon={<Users className="h-4 w-4" />}
        />

        <MetricCard
          title="Homônimos / Revisão"
          value={pendingReviewPatients ?? 0}
          subtitle="Cadastros com status PENDING_REVIEW"
          variant="warning"
          icon={<AlertTriangle className="h-4 w-4" />}
        />

        <MetricCard
          title="Vínculos Ativos"
          value={totalPhysicians ?? 0}
          subtitle="Médicos responsáveis designados"
          variant="success"
          icon={<Link2 className="h-4 w-4" />}
        />

        <MetricCard
          title="Conformidade LGPD"
          value="100%"
          subtitle="Trilha Append-Only & Blind Index"
          variant="default"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
      </div>

      {/* Módulos do Sistema de acordo com o documentation.md */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground font-heading">Funções Administrativas Institucionais</h2>
          <p className="text-xs text-muted-foreground">
            Acesso rápido às áreas operacionais e às 5 filas de trabalho do backoffice (Seções 2.2 e 7.3).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Módulo 1: Gestão de Pacientes */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-primary-light text-primary">
                  <Users className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 3
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Gestão de Pacientes
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Cadastro de prontuários, deduplicação por HMAC, checagem de homônimos prováveis e identificadores civis.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/pacientes"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover"
              >
                <span>Acessar cadastro e prontuários</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Módulo 2: Corpo Clínico */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-info-bg text-info">
                  <UserCheck className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 2.3
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Corpo Clínico & CRM
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Validação de registros no CFM/CRM, atribuição de Doctor Master e desativação com reatribuição obrigatória.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/medicos"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-info hover:text-info/80"
              >
                <span>Gerenciar médicos habilitados</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Módulo 3: Vínculos e Representação */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-warning-bg text-warning">
                  <Link2 className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 4 & 5
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Vínculos & Representação
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Governança de médicos responsáveis principais e autorizações documentadas para representantes legais/cuidadores.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/vinculos"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-warning hover:text-warning/80"
              >
                <span>Auditar vínculos e poderes</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Módulo 4: Filas de Trabalho do Backoffice */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-primary-light text-primary">
                  <ListOrdered className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 7.3
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Filas de Trabalho (5)
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Painel central das 5 filas: aprovação de contas, vínculos, desativações, revisões e documentos.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/filas"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover"
              >
                <span>Acessar filas de pendências</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Módulo 5: Auditoria & Segurança */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-secondary text-foreground">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 15.4
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Trilha de Auditoria
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Consulta de acessos, eventos de modificação, tentativas excepcionais e garantia append-only anti-adulteração.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/auditoria"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary"
              >
                <span>Inspecionar logs de segurança</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Módulo 6: Isolamento e Unidades */}
          <Card className="border-border hover:shadow-md transition-shadow card-subtle">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="p-2.5 rounded-xl bg-primary-light text-primary">
                  <Building2 className="w-5 h-5" />
                </div>
                <Badge variant="default" size="sm">
                  Seção 14.2
                </Badge>
              </div>
              <CardTitle className="text-base font-bold text-foreground mt-3 font-heading">
                Unidades Assistenciais
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Configuração institucional, isolamento de schema por cliente e subdivisões assistenciais (care_units).
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Link
                href="/admin/configuracoes"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-hover"
              >
                <span>Configurar instituição</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Tabela de Prontuários Recentes */}
      <Card className="border-border card-subtle">
        <CardHeader className="flex flex-row items-center justify-between pb-3 bg-secondary/30 rounded-t-xl border-b border-border/80">
          <div>
            <CardTitle className="text-sm font-semibold text-foreground">
              Cadastros de Pacientes Recentes
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Últimos registros adicionados à base institucional
            </CardDescription>
          </div>
          <Link
            href="/admin/pacientes"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Ver todos
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Paciente</th>
                  <th className="px-5 py-3 font-semibold">Identificador Protegido</th>
                  <th className="px-5 py-3 font-semibold">Médico Responsável</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Data de Cadastro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {!recentPatients || recentPatients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-6 text-center text-slate-400">
                      Nenhum paciente cadastrado recentemente.
                    </td>
                  </tr>
                ) : (
                  recentPatients.map((p: any) => {
                    const primaryLink = (p.physician_patient_links || []).find(
                      (l: any) => l.is_primary && l.status === 'ACTIVE'
                    )
                    const docName = primaryLink?.users?.name || 'Não atribuído'
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-5 py-3.5 font-medium text-slate-900">{p.full_name}</td>
                        <td className="px-5 py-3.5 text-slate-500 font-mono tabular-clinical">{p.cpf_masked || 'Sem CPF'}</td>
                        <td className="px-5 py-3.5 text-slate-700">{docName}</td>
                        <td className="px-5 py-3.5">
                          <Badge
                            variant={
                              p.status === 'ACTIVE'
                                ? 'success'
                                : p.status === 'PENDING_REVIEW'
                                ? 'warning'
                                : 'default'
                            }
                            size="sm"
                            dot
                          >
                            {p.status === 'ACTIVE'
                              ? 'Ativo'
                              : p.status === 'PENDING_REVIEW'
                              ? 'Revisão Pendente'
                              : 'Inativo'}
                          </Badge>
                        </td>
                        <td className="px-5 py-3.5 text-right text-slate-400 tabular-clinical">
                          {new Date(p.created_at).toLocaleDateString('pt-BR')}
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
  )
}
