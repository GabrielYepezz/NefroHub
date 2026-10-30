import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Lock } from 'lucide-react'

export default async function AdminAuditPage() {
  const supabase = await createClient()

  // 1. Buscar logs de auditoria append-only
  const { data: rawEvents } = await supabase
    .from('audit_events')
    .select(`
      id,
      action,
      resource,
      result,
      justification,
      created_at,
      user_id,
      patient_id
    `)
    .order('created_at', { ascending: false })
    .limit(50)

  const events = rawEvents || []
  const userIds = Array.from(new Set(events.map((e) => e.user_id).filter(Boolean)))

  // 2. Mapear operadores associados
  const usersMap = new Map<string, { name: string; email: string }>()
  if (userIds.length > 0) {
    const { data: usersData } = await supabase
      .from('users')
      .select('id, name, email')
      .in('id', userIds)

    if (usersData) {
      usersData.forEach((u) => usersMap.set(u.id, { name: u.name, email: u.email }))
    }
  }

  const auditEvents = events.map((e) => ({
    ...e,
    users: usersMap.get(e.user_id) || null,
  }))

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Trilha de Auditoria & Conformidade
            </h1>
            <Badge variant="primary" size="sm">
              Seção 13 & 15.4
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Logs append-only de ações, consultas a prontuários e acessos excepcionais (Lei 13.787/2018 & LGPD).
          </p>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#1A252C] text-slate-100 text-xs flex items-start gap-3 border border-[#26353E]">
        <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-white">Garantia Técnica de Imutabilidade do Log</p>
          <p className="text-slate-300 mt-0.5 leading-relaxed">
            A tabela <code>audit_events</code> é estritamente append-only. Triggers de banco de dados rejeitam quaisquer instruções de <code>UPDATE</code> ou <code>DELETE</code>. Nenhum dado de CPF trafega nos logs.
          </p>
        </div>
      </div>

      <Card className="border-border card-subtle">
        <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Eventos Recentes do Sistema ({auditEvents.length})
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Registros dos últimos 50 eventos com carimbo de data/hora oficial
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap">
              <thead className="bg-secondary/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-5 py-3 font-semibold">Data/Hora (UTC)</th>
                  <th className="px-5 py-3 font-semibold">Ação Realizada</th>
                  <th className="px-5 py-3 font-semibold">Recurso</th>
                  <th className="px-5 py-3 font-semibold">Operador</th>
                  <th className="px-5 py-3 font-semibold">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 bg-card">
                {auditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      Nenhum evento registrado ainda. As ações do sistema são automaticamente capturadas.
                    </td>
                  </tr>
                ) : (
                  auditEvents.map((evt) => {
                    const formattedDate = new Date(evt.created_at).toLocaleString('pt-BR', {
                      timeZone: 'UTC',
                    })
                    const operator = evt.users ? `${evt.users.name} (${evt.users.email})` : 'Sistema / Automático'

                    return (
                      <tr key={evt.id} className="hover:bg-secondary/20 transition-colors">
                        <td className="px-5 py-3 text-muted-foreground tabular-clinical">{formattedDate}</td>
                        <td className="px-5 py-3 font-semibold text-foreground">
                          <code>{evt.action}</code>
                        </td>
                        <td className="px-5 py-3 text-muted-foreground">{evt.resource}</td>
                        <td className="px-5 py-3 text-foreground">{operator}</td>
                        <td className="px-5 py-3">
                          <Badge
                            variant={evt.result === 'SUCCESS' ? 'success' : 'destructive'}
                            size="sm"
                          >
                            {evt.result}
                          </Badge>
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
