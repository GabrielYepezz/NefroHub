import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Building2, Server, ShieldCheck } from 'lucide-react'

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Unidades & Configurações Institucionais
            </h1>
            <span className="text-xs bg-teal-100 text-teal-800 font-semibold px-2.5 py-0.5 rounded-full">
              Seção 14
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Isolamento de instalação (single-tenant por cliente) e gestão de Unidades Assistenciais (care_units).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2 text-teal-700">
              <Building2 className="w-5 h-5" />
              <CardTitle className="text-base font-bold text-slate-900">Instalação Hospitalar Ativa</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Dados da instituição detentora do prontuário
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Instituição:</span>
              <span className="font-semibold text-slate-800">Hospital Central NefroHub</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">CNPJ:</span>
              <span className="font-semibold text-slate-800">00.000.000/0001-00</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Região de Dados:</span>
              <span className="font-semibold text-emerald-700">Brasil (sa-east-1) - LGPD</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500">Modelo de Isolamento:</span>
              <span className="font-semibold text-slate-800">Isolamento Lógico Dedicado</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-2 text-blue-700">
              <Server className="w-5 h-5" />
              <CardTitle className="text-base font-bold text-slate-900">Unidades Assistenciais (care_units)</CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Divisões de atendimento dentro da mesma instituição
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">Ambulatório de Doenças Renais</p>
                <p className="text-[11px] text-slate-500">Código: AMB-NEF-01</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Ativa
              </span>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">Centro de Hemodiálise Contínua</p>
                <p className="text-[11px] text-slate-500">Código: HEM-NEF-02</p>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Ativa
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
