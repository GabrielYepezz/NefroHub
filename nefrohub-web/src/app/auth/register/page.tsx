'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState, useTransition } from 'react'
import { Activity, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react'
import Link from 'next/link'

import { publicRegisterSchema, PublicRegisterFormValues } from '@/lib/validators/auth'
import { registerAction } from '@/app/auth/actions'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const form = useForm<PublicRegisterFormValues>({
    resolver: zodResolver(publicRegisterSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      phone: '',
    },
  })

  const onSubmit = (data: PublicRegisterFormValues) => {
    setError(null)
    startTransition(async () => {
      const result = await registerAction(data)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 sm:p-6 font-sans">
      <Card className="w-full max-w-lg card-elevated border-border">
        <CardHeader className="space-y-1.5 text-center pb-4 pt-6">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary mb-2 text-white shadow-xs">
            <Activity className="h-6 w-6" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-heading">
              Criar Conta de Paciente
            </CardTitle>
            <Badge variant="primary" size="sm">
              Pré-Cadastro
            </Badge>
          </div>
          <CardDescription className="text-xs text-muted-foreground max-w-xs mx-auto">
            Cadastre-se para acompanhar sua evolução de saúde renal no portal do paciente.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5 px-6 sm:px-8 pb-8">
          {/* Aviso Institucional de Governança (Regra A2) */}
          <div className="p-3.5 bg-primary-light/60 border border-primary/20 rounded-xl text-xs text-foreground flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-primary">Acesso de Profissionais de Saúde:</span> Médicos e administradores recebem acesso exclusivamente por convite e credenciamento administrativo do hospital.
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3.5">
            <div className="space-y-1">
              <Label htmlFor="name" className="text-xs font-semibold text-foreground">
                Nome Completo <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder="Ex: Maria das Dores Silva"
                className="focus-ring h-10 text-xs sm:text-sm"
                {...form.register('name')}
              />
              {form.formState.errors.name && (
                <p className="text-[11px] text-destructive font-medium">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                E-mail Pessoal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="paciente@exemplo.com"
                className="focus-ring h-10 text-xs sm:text-sm"
                {...form.register('email')}
              />
              {form.formState.errors.email && (
                <p className="text-[11px] text-destructive font-medium">{form.formState.errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                Senha de Acesso <span className="text-destructive">*</span>
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Mínimo 12 caracteres (frases-senha aceitas)"
                className="focus-ring h-10 text-xs sm:text-sm"
                {...form.register('password')}
              />
              {form.formState.errors.password && (
                <p className="text-[11px] text-destructive font-medium">{form.formState.errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="phone" className="text-xs font-semibold text-foreground">
                Telefone de Contato (com DDD)
              </Label>
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                className="focus-ring h-10 text-xs sm:text-sm tabular-clinical"
                {...form.register('phone')}
              />
              {form.formState.errors.phone && (
                <p className="text-[11px] text-destructive font-medium">{form.formState.errors.phone.message}</p>
              )}
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

            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-semibold rounded-xl h-10 text-xs sm:text-sm shadow-xs focus-ring transition-colors mt-2"
              disabled={isPending}
            >
              {isPending ? 'Criando pré-cadastro...' : 'Cadastrar Paciente'}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t border-border/70 text-center text-xs text-muted-foreground">
            Já tem uma conta no NefroHub?{' '}
            <Link href="/login" className="font-semibold text-primary hover:text-primary-hover hover:underline">
              Fazer Login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
