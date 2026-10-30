import { Suspense } from 'react'
import { LoginForm } from './LoginForm'
import { Activity, ShieldCheck, FileText, Lock, HeartPulse, Loader2 } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-background font-sans">
      {/* Coluna Visual e Institucional Médica (Desktop) */}
      <div className="relative hidden lg:flex lg:w-1/2 bg-[#1A252C] text-white flex-col justify-between p-12 xl:p-16 overflow-hidden border-r border-[#26353E]">
        {/* Background Pattern de Grafismo Clínico */}
        <div className="absolute inset-0 bg-[radial-gradient(#367C83_1px,transparent_1px)] [background-size:28px_28px] opacity-15 pointer-events-none" />
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-600/15 rounded-full blur-3xl pointer-events-none" />

        {/* Topo: Logo & Identidade */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/25 border border-primary/40 flex items-center justify-center text-primary-light shadow-xs">
            <Activity className="h-6 w-6 text-emerald-300" />
          </div>
          <div>
            <span className="text-2xl font-bold tracking-tight text-white flex items-center gap-1.5 font-heading">
              Nefro<span className="text-[#4E9EA6]">Hub</span>
            </span>
            <span className="block text-[11px] font-medium tracking-wider uppercase text-slate-400">
              Acompanhamento Nefrológico Longitudinal
            </span>
          </div>
        </div>

        {/* Centro: Proposta de Valor Clínica */}
        <div className="relative z-10 my-auto py-12 max-w-lg space-y-7">
          <div className="space-y-3.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/15 border border-primary/30 text-emerald-200 text-xs font-medium">
              <HeartPulse className="w-3.5 h-3.5 text-emerald-300" />
              Gestão Especializada em Saúde Renal
            </div>
            <h1 className="text-3xl xl:text-4xl font-bold tracking-tight text-slate-50 leading-snug font-heading">
              Prontuário longitudinal e inteligência clínica para a nefrologia.
            </h1>
            <p className="text-slate-300 text-sm leading-relaxed font-normal">
              Plataforma dedicada ao monitoramento da função renal, acompanhamento da taxa de filtração glomerular (TFGe) e governança segura de dados de saúde.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3.5 pt-2">
            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-[#223038]/80 border border-[#2D3E48]">
              <div className="p-2 rounded-lg bg-primary/20 text-emerald-300 shrink-0 mt-0.5">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Prontuário Imutável</h4>
                <p className="text-xs text-slate-300/80 mt-0.5 leading-relaxed">
                  Rastreabilidade completa, histórico versionado e conformidade com a Lei nº 13.787/2018.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 p-4 rounded-xl bg-[#223038]/80 border border-[#2D3E48]">
              <div className="p-2 rounded-lg bg-primary/20 text-emerald-300 shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-100">Privacidade & Blind Index LGPD</h4>
                <p className="text-xs text-slate-300/80 mt-0.5 leading-relaxed">
                  Identificadores protegidos por HMAC-SHA-256 e segregação estrita de funções clínicas.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé da Coluna Institucional */}
        <div className="relative z-10 border-t border-[#2D3E48] pt-4 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Transmissão TLS 1.3 Criptografada</span>
          </div>
          <span>Padrão RDC Anvisa 657/2022</span>
        </div>
      </div>

      {/* Coluna do Formulário de Acesso */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-7">
          {/* Header Mobile com Logo */}
          <div className="lg:hidden flex items-center justify-center gap-2.5 pb-2">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-white shadow-xs">
              <Activity className="h-5 w-5" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Nefro<span className="text-primary">Hub</span>
            </span>
          </div>

          {/* Título do Card */}
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-foreground font-heading">
              Acesso ao Sistema
            </h2>
            <p className="text-sm text-muted-foreground">
              Entre com suas credenciais autorizadas para acessar o prontuário.
            </p>
          </div>

          {/* Card do Formulário */}
          <div className="bg-card p-7 sm:p-8 rounded-2xl card-elevated border border-border">
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-8 text-muted-foreground text-xs gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  Carregando acesso...
                </div>
              }
            >
              <LoginForm />
            </Suspense>

            <div className="mt-6 pt-5 border-t border-border/70 text-center">
              <p className="text-xs text-muted-foreground">
                Ainda não possui credencial de paciente?{' '}
                <Link
                  href="/auth/register"
                  className="font-medium text-primary hover:text-primary-hover hover:underline transition-colors"
                >
                  Solicitar Cadastro
                </Link>
              </p>
            </div>
          </div>

          {/* Aviso Institucional e Ético */}
          <div className="text-center text-[11px] text-muted-foreground leading-relaxed px-4">
            <p>
              Acesso confidencial destinado a profissionais de saúde e pacientes vinculados.
              O uso não autorizado é passível de responsabilização legal.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
