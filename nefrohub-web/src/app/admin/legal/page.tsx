import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { FileCheck, Shield, ExternalLink } from 'lucide-react'

export default function AdminLegalPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Documentos Legais & Consentimento
            </h1>
            <span className="text-xs bg-indigo-100 text-indigo-800 font-semibold px-2.5 py-0.5 rounded-full">
              Seção 12
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de versões de Termos de Uso, Políticas de Privacidade e rastreabilidade de consentimento LGPD.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-700">
                <FileCheck className="w-5 h-5" />
                <CardTitle className="text-base font-bold text-slate-900">Termos de Uso do Prontuário</CardTitle>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Versão 1.0 (Vigente)
              </span>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Regras de submissão, curadoria médica e responsabilidade clínica
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p>• Data de Publicação: 01/01/2026</p>
            <p>• Validade Jurídica: Em conformidade com CFM e Lei 13.787/2018</p>
            <p>• Aceite obrigatório para primeiro acesso de profissionais e pacientes</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-700">
                <Shield className="w-5 h-5" />
                <CardTitle className="text-base font-bold text-slate-900">Política de Privacidade (LGPD)</CardTitle>
              </div>
              <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">
                Versão 1.0 (Vigente)
              </span>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Bases legais de tratamento para dados sensíveis de saúde
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-xs text-slate-600">
            <p>• Finalidade: Tutela da saúde em procedimento realizado por profissionais</p>
            <p>• Blind Index: Proteção criptográfica de identificadores (HMAC-SHA-256)</p>
            <p>• Retenção: Mínimo 20 anos a partir do último registro</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
