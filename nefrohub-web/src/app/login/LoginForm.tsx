'use client'

import { useState, useTransition, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { loginAction, resetPasswordAction, updatePasswordAction } from '@/app/auth/actions'
import {
  getMFAStatusAction,
  startMFAEnrollmentAction,
  verifyMFAEnrollmentAction,
  createMFAChallengeAction,
  verifyMFAChallengeAction,
} from '@/app/auth/mfa-actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ArrowLeft,
  KeyRound,
  ShieldCheck,
  QrCode,
  ShieldAlert,
} from 'lucide-react'

export function LoginForm() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [recoveryFeedback, setRecoveryFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Modo de Redefinição de Nova Senha (Fase 5.2 - Seção 4 & RF-009)
  const [isSettingNewPassword, setIsSettingNewPassword] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [newPasswordFeedback, setNewPasswordFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  // Modo de Autenticação Multifator MFA/TOTP (documentation.md Seção 15.1 e 15.2 - RF-007)
  const [mfaMode, setMfaMode] = useState<'CHALLENGE' | 'ENROLL' | null>(null)
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaChallengeId, setMfaChallengeId] = useState('')
  const [mfaQrCode, setMfaQrCode] = useState('')
  const [mfaSecret, setMfaSecret] = useState('')
  const [mfaRole, setMfaRole] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [mfaFeedback, setMfaFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [isHydrated, setIsHydrated] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setIsHydrated(true)
    if (searchParams.get('recovery') === 'true') {
      setIsSettingNewPassword(true)
    }
    if (searchParams.get('mfa') === 'true') {
      startTransition(async () => {
        const status = await getMFAStatusAction()
        if (!status.error && status.isRequired) {
          setMfaRole(status.role)
          if (status.isEnrolled) {
            const challenge = await createMFAChallengeAction()
            if (!challenge.error) {
              setMfaFactorId(challenge.factorId!)
              setMfaChallengeId(challenge.challengeId!)
              setMfaMode('CHALLENGE')
            }
          } else {
            const enrollment = await startMFAEnrollmentAction()
            if (!enrollment.error) {
              setMfaFactorId(enrollment.factorId!)
              setMfaQrCode(enrollment.qrCode || '')
              setMfaSecret(enrollment.secret || '')
              setMfaMode('ENROLL')
            }
          }
        }
      })
    }
  }, [searchParams])

  const navigateToRoleDashboard = (role: string) => {
    if (role === 'ADMIN') {
      router.push('/admin')
    } else if (role === 'DOCTOR' || role === 'DOCTOR_MASTER') {
      router.push('/doctor')
    } else {
      router.push('/patient/dashboard')
    }
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setMfaFeedback(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    if (!email || !password) {
      setError('Por favor, informe seu e-mail e senha.')
      return
    }

    startTransition(async () => {
      const res = await loginAction({ email, password })
      if (res?.error) {
        setError(res.error)
      } else if (res?.requiresMFA) {
        setMfaRole(res.role || 'DOCTOR')
        if (res.mode === 'CHALLENGE') {
          const challenge = await createMFAChallengeAction()
          if (challenge.error) {
            setError(challenge.error)
          } else {
            setMfaFactorId(challenge.factorId!)
            setMfaChallengeId(challenge.challengeId!)
            setMfaMode('CHALLENGE')
          }
        } else if (res.mode === 'ENROLL') {
          const enrollment = await startMFAEnrollmentAction()
          if (enrollment.error) {
            setError(enrollment.error)
          } else {
            setMfaFactorId(enrollment.factorId!)
            setMfaQrCode(enrollment.qrCode || '')
            setMfaSecret(enrollment.secret || '')
            setMfaMode('ENROLL')
          }
        }
      }
    })
  }

  const handleRecoverySubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setRecoveryFeedback(null)

    if (!recoveryEmail || !recoveryEmail.includes('@')) {
      setRecoveryFeedback({ type: 'error', message: 'Informe um endereço de e-mail institucional válido.' })
      return
    }

    startTransition(async () => {
      const res = await resetPasswordAction(recoveryEmail)
      if (res.error) {
        setRecoveryFeedback({ type: 'error', message: res.error })
      } else {
        setRecoveryFeedback({
          type: 'success',
          message: res.message || 'Se o e-mail estiver cadastrado, o link seguro foi enviado.',
        })
      }
    })
  }

  const handleNewPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNewPasswordFeedback(null)

    if (!newPassword || newPassword.length < 12) {
      setNewPasswordFeedback({
        type: 'error',
        message: 'A nova senha deve ter no mínimo 12 caracteres (frases-senha são aceitas e recomendadas).',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      setNewPasswordFeedback({ type: 'error', message: 'A confirmação de senha não confere com a nova senha.' })
      return
    }

    startTransition(async () => {
      const res = await updatePasswordAction(newPassword)
      if (res.error) {
        setNewPasswordFeedback({ type: 'error', message: res.error })
      } else {
        setNewPasswordFeedback({
          type: 'success',
          message: res.message || 'Senha atualizada com sucesso!',
        })
        setTimeout(() => {
          setIsSettingNewPassword(false)
          router.replace('/login')
        }, 2000)
      }
    })
  }

  const handleMFAChallengeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMfaFeedback(null)

    if (!totpCode || !/^\d{6}$/.test(totpCode.trim())) {
      setMfaFeedback({ type: 'error', message: 'Informe o código de 6 dígitos numéricos gerado no autenticador.' })
      return
    }

    startTransition(async () => {
      const res = await verifyMFAChallengeAction(mfaFactorId, mfaChallengeId, totpCode.trim())
      if (res.error) {
        setMfaFeedback({ type: 'error', message: res.error })
      } else {
        setMfaFeedback({ type: 'success', message: 'Segundo fator validado com sucesso! Redirecionando...' })
        setTimeout(() => {
          navigateToRoleDashboard(mfaRole)
        }, 500)
      }
    })
  }

  const handleMFAEnrollmentSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setMfaFeedback(null)

    if (!totpCode || !/^\d{6}$/.test(totpCode.trim())) {
      setMfaFeedback({ type: 'error', message: 'Informe o código de 6 dígitos para confirmar a ativação do TOTP.' })
      return
    }

    startTransition(async () => {
      const res = await verifyMFAEnrollmentAction(mfaFactorId, totpCode.trim())
      if (res.error) {
        setMfaFeedback({ type: 'error', message: res.error })
      } else {
        setMfaFeedback({ type: 'success', message: 'MFA ativado com sucesso! Redirecionando...' })
        setTimeout(() => {
          navigateToRoleDashboard(mfaRole)
        }, 500)
      }
    })
  }

  // Visualização 1: Definir Nova Senha (Vindo do link de recuperação)
  if (isSettingNewPassword) {
    return (
      <div data-hydrated={isHydrated ? 'true' : undefined} className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Definir Nova Senha</h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Sua identidade foi verificada. Cadastre agora sua nova senha pessoal de acesso ao NefroHub.
        </p>

        {newPasswordFeedback && (
          <div
            className={`flex items-start gap-2.5 p-3 text-xs rounded-xl ${
              newPasswordFeedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
            }`}
          >
            {newPasswordFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{newPasswordFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleNewPasswordSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-xs font-semibold text-foreground">
              Nova Senha (mínimo 12 caracteres - frases-senha aceitas)
            </Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground/70">
                <Lock className="w-4 h-4" />
              </div>
              <Input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••••••"
                className="pl-9.5 pr-10 h-10 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-xs sm:text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm-new-password" className="text-xs font-semibold text-foreground">
              Confirmar Nova Senha
            </Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground/70">
                <Lock className="w-4 h-4" />
              </div>
              <Input
                id="confirm-new-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="pl-9.5 h-10 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-xs sm:text-sm"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Atualizando credenciais...
              </>
            ) : (
              'Salvar Nova Senha'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setIsSettingNewPassword(false)
              router.replace('/login')
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao login
          </button>
        </form>
      </div>
    )
  }

  // Visualização 2: Solicitar E-mail de Recuperação
  if (isRecoveryMode) {
    return (
      <div className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <KeyRound className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Recuperação de Acesso</h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Informe seu e-mail cadastrado para receber instruções seguras de redefinição de senha.
        </p>

        {recoveryFeedback && (
          <div
            className={`flex items-start gap-2.5 p-3 text-xs rounded-xl ${
              recoveryFeedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
            }`}
          >
            {recoveryFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{recoveryFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleRecoverySubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="recovery-email" className="text-xs font-semibold text-foreground">
              E-mail Institucional ou Cadastrado
            </Label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground/70">
                <Mail className="w-4 h-4" />
              </div>
              <Input
                id="recovery-email"
                type="email"
                required
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                placeholder="seu.email@hospital.com.br"
                className="pl-9.5 h-10 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-xs sm:text-sm"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando link seguro...
              </>
            ) : (
              'Enviar Link de Recuperação'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setIsRecoveryMode(false)
              setRecoveryFeedback(null)
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Voltar ao login
          </button>
        </form>
      </div>
    )
  }

  // Visualização 3: Desafio MFA/TOTP (AAL2 Challenge - RF-007)
  if (mfaMode === 'CHALLENGE') {
    return (
      <div data-hydrated={isHydrated ? 'true' : undefined} className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <ShieldAlert className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Autenticação em Duas Etapas (TOTP)</h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Digite o código de 6 dígitos gerado pelo aplicativo autenticador do seu dispositivo para confirmar sua identidade.
        </p>

        {mfaFeedback && (
          <div
            className={`flex items-start gap-2.5 p-3 text-xs rounded-xl ${
              mfaFeedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
            }`}
          >
            {mfaFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{mfaFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleMFAChallengeSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-challenge-code" className="text-xs font-semibold text-foreground">
              Código TOTP (6 dígitos)
            </Label>
            <Input
              id="mfa-challenge-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="h-11 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-center text-lg tracking-widest font-mono"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || totpCode.length !== 6}
            className="w-full h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Validando segundo fator...
              </>
            ) : (
              'Confirmar Acesso Seguro'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setMfaMode(null)
              setTotpCode('')
              setMfaFeedback(null)
              router.replace('/login')
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Cancelar e voltar ao login
          </button>
        </form>
      </div>
    )
  }

  // Visualização 4: Configuração Obrigatória de MFA/TOTP (Enrollment - RF-007)
  if (mfaMode === 'ENROLL') {
    return (
      <div data-hydrated={isHydrated ? 'true' : undefined} className="space-y-4 animate-in fade-in duration-150">
        <div className="flex items-center gap-2 pb-2 border-b border-border">
          <QrCode className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Configurar Segundo Fator (MFA)</h2>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Contas institucionais exigem autenticação multifator TOTP (PRD Seção 15.1). Escaneie o QR Code no seu aplicativo (Google Authenticator, Microsoft Authenticator ou 1Password).
        </p>

        {mfaQrCode && (
          <div className="flex flex-col items-center justify-center p-3 bg-white rounded-xl border border-border shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mfaQrCode} alt="QR Code MFA" className="w-40 h-40 object-contain" />
          </div>
        )}

        {mfaSecret && (
          <div className="p-2.5 bg-muted/60 border border-border rounded-xl text-center space-y-1">
            <span className="text-[10px] text-muted-foreground block font-medium">Chave manual alternativa:</span>
            <code className="text-xs font-mono font-bold text-foreground select-all tracking-wider break-all">
              {mfaSecret}
            </code>
          </div>
        )}

        {mfaFeedback && (
          <div
            className={`flex items-start gap-2.5 p-3 text-xs rounded-xl ${
              mfaFeedback.type === 'success'
                ? 'bg-success-bg text-success-foreground border border-success/20'
                : 'bg-destructive-bg text-destructive-foreground border border-destructive/20'
            }`}
          >
            {mfaFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
            ) : (
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            )}
            <span className="leading-snug">{mfaFeedback.message}</span>
          </div>
        )}

        <form onSubmit={handleMFAEnrollmentSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="mfa-enroll-code" className="text-xs font-semibold text-foreground">
              Código de Confirmação (6 dígitos do app)
            </Label>
            <Input
              id="mfa-enroll-code"
              type="text"
              inputMode="numeric"
              maxLength={6}
              required
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="h-11 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-center text-lg tracking-widest font-mono"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending || totpCode.length !== 6}
            className="w-full h-10 text-xs font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs cursor-pointer"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Ativando segundo fator...
              </>
            ) : (
              'Ativar MFA e Entrar'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setMfaMode(null)
              setTotpCode('')
              setMfaFeedback(null)
              router.replace('/login')
            }}
            className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground pt-1 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Cancelar
          </button>
        </form>
      </div>
    )
  }

  // Visualização Padrão: Formulário de Login
  return (
    <form
      data-hydrated={isHydrated ? 'true' : undefined}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {error && (
        <div className="flex items-start gap-2.5 p-3 text-xs text-destructive-foreground bg-destructive-bg border border-destructive/20 rounded-xl animate-in fade-in duration-150">
          <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {/* Campo E-mail */}
      <div className="space-y-1.5">
        <Label htmlFor="email" className="text-xs font-semibold text-foreground">
          E-mail Institucional ou Cadastrado
        </Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground/70">
            <Mail className="w-4 h-4" />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="seu.email@hospital.com.br"
            className="pl-9.5 h-10 sm:h-11 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-xs sm:text-sm"
          />
        </div>
      </div>

      {/* Campo Senha */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-xs font-semibold text-foreground">
            Senha
          </Label>
          <button
            type="button"
            onClick={() => {
              setIsRecoveryMode(true)
              setError(null)
            }}
            className="text-[11px] font-medium text-primary hover:text-primary-hover hover:underline cursor-pointer bg-transparent border-0 p-0"
          >
            Esqueceu a senha?
          </button>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground/70">
            <Lock className="w-4 h-4" />
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="••••••••••••"
            className="pl-9.5 pr-10 h-10 sm:h-11 bg-background/50 border-border focus:bg-card focus:border-primary transition-colors rounded-xl text-xs sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Opções Auxiliares */}
      <div className="flex items-center justify-between pt-1">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="w-3.5 h-3.5 rounded text-primary border-border focus:ring-primary accent-primary"
          />
          <span>Lembrar meu acesso</span>
        </label>
        <span className="text-[11px] text-muted-foreground/80">Ambiente Seguro</span>
      </div>

      {/* Botão de Submissão */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 text-sm font-semibold rounded-xl bg-primary hover:bg-primary-hover text-primary-foreground shadow-xs transition-all cursor-pointer"
      >
        {isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Autenticando...
          </>
        ) : (
          <>
            Entrar na Plataforma
            <ArrowRight className="w-4 h-4 ml-2" />
          </>
        )}
      </Button>
    </form>
  )
}
