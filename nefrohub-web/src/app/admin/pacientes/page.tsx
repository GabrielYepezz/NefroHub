import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RegisterPatientModal, PatientManageLinkButton } from '@/app/patient/AdminClientComponents'
import { ShieldCheck } from 'lucide-react'

export const metadata = {
  title: 'Gestão de Pacientes & Prontuários | NefroHub Admin',
  description: 'Controle de prontuários de pacientes, blind index de CPF e homônimos',
}

export default async function AdminPatientsPage() {
  const supabase = await createClient()

  // 1. Buscar médicos disponíveis para atribuição
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

  // 2. Buscar Pacientes com seus vínculos
  const { data: patientProfiles } = await supabase
    .from('patient_profiles')
    .select(`
      id,
      full_name,
      cpf_masked,
      birth_date,
      biological_sex,
      status,
      email,
      phone,
      duplicate_check_flag,
      created_at,
      physician_patient_links (
        id,
        status,
        is_primary,
        physician_user_id,
        users:physician_user_id (name)
      )
    `)
    .order('created_at', { ascending: false })

  const tableData = (patientProfiles || []).map((p: any) => {
    const primaryLink = (p.physician_patient_links || []).find(
      (l: any) => l.is_primary && l.status === 'ACTIVE'
    )
    const doctorName = primaryLink?.users?.name ? `Dr(a). ${primaryLink.users.name}` : 'Não atribuído'

    return {
      id: p.id,
      name: p.full_name,
      identifier: p.cpf_masked || p.email || 'Identificador não informado',
      phone: p.phone || '-',
      birthDate: p.birth_date ? new Date(p.birth_date).toLocaleDateString('pt-BR') : '-',
      sex: p.biological_sex === 'M' ? 'Masc' : 'Fem',
      doctorName,
      status: p.status,
      isDuplicateFlagged: p.duplicate_check_flag,
    }
  })

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Gestão de Pacientes & Prontuários
            </h1>
            <Badge variant="primary" size="sm">
              Seção 3
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Visualização de prontuários cadastrados, blind index de CPF e governança de homônimos prováveis.
          </p>
        </div>
        <RegisterPatientModal doctors={availableDoctors} />
      </div>

      {/* Regra de Governança de Paciente */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-primary-light/60 border border-primary/20 text-foreground text-xs">
        <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-semibold text-primary">Princípio de Identidade e Separação de Conta (documentation.md)</p>
          <p className="text-muted-foreground leading-relaxed">
            O paciente existe de forma autônoma no prontuário, independentemente de ter uma conta de acesso ao sistema. O CPF é criptografado em repouso e protegido por HMAC-SHA-256. Todo paciente ativo possui obrigatoriamente um médico responsável atribuído.
          </p>
        </div>
      </div>

      <Card className="border-border card-subtle">
        <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">
                Prontuários Institucionais ({tableData.length})
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                Lista de indivíduos em acompanhamento nefrológico nesta instalação
              </CardDescription>
            </div>
            <Badge variant="secondary" size="sm">
              Total: {tableData.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Paciente</th>
                  <th className="px-5 py-3 font-semibold">Nascimento / Sexo</th>
                  <th className="px-5 py-3 font-semibold">Contato</th>
                  <th className="px-5 py-3 font-semibold">Médico Responsável</th>
                  <th className="px-5 py-3 font-semibold">Status do Cadastro</th>
                  <th className="px-5 py-3 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {tableData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhum paciente cadastrado até o momento. Utilize o botão acima para adicionar.
                    </td>
                  </tr>
                ) : (
                  tableData.map((row) => (
                    <tr key={row.id} className="hover:bg-secondary/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-foreground">{row.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono tabular-clinical">{row.identifier}</div>
                      </td>
                      <td className="px-5 py-3.5 text-foreground tabular-clinical">
                        {row.birthDate} ({row.sex})
                      </td>
                      <td className="px-5 py-3.5 text-muted-foreground tabular-clinical">{row.phone}</td>
                      <td className="px-5 py-3.5 font-medium text-foreground">{row.doctorName}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              row.status === 'ACTIVE'
                                ? 'success'
                                : row.status === 'PENDING_REVIEW'
                                ? 'warning'
                                : 'secondary'
                            }
                            size="sm"
                            dot={row.status === 'ACTIVE'}
                          >
                            {row.status === 'ACTIVE'
                              ? 'Ativo'
                              : row.status === 'PENDING_REVIEW'
                              ? 'Revisão Pendente'
                              : 'Inativo'}
                          </Badge>
                          {row.isDuplicateFlagged && (
                            <Badge
                              variant="destructive"
                              size="sm"
                              title="Homônimo provável identificado"
                            >
                              Homônimo
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <PatientManageLinkButton patientId={row.id} />
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
  )
}
