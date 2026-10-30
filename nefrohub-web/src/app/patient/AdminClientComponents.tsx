'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPatientAction } from './actions'
import { CreatePatientFormValues } from '@/lib/validators/patient'
import { UserPlus, Link2, AlertCircle, Info, Loader2 } from 'lucide-react'

export function PatientManageLinkButton({ patientId }: { patientId: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-7 text-xs border-border hover:bg-secondary">
      <Link href="/admin/vinculos">
        <Link2 className="w-3 h-3 mr-1" />
        Vínculos
      </Link>
    </Button>
  )
}

interface DoctorOption {
  id: string
  name: string
}

interface RegisterPatientModalProps {
  doctors?: DoctorOption[]
}

export function RegisterPatientModal({ doctors = [] }: RegisterPatientModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setWarning(null)

    const form = e.currentTarget
    const formData = new FormData(form)

    const data: CreatePatientFormValues = {
      fullName: (formData.get('fullName') as string) || '',
      birthDate: (formData.get('birthDate') as string) || '',
      biologicalSex: (formData.get('biologicalSex') as 'M' | 'F') || 'M',
      cpf: (formData.get('cpf') as string) || undefined,
      phone: (formData.get('phone') as string) || undefined,
      email: (formData.get('email') as string) || undefined,
      cns: (formData.get('cns') as string) || undefined,
      medicalRecordNumber: (formData.get('medicalRecordNumber') as string) || undefined,
      primaryPhysicianUserId: (formData.get('primaryPhysicianUserId') as string) || '',
    }

    startTransition(async () => {
      const result = await createPatientAction(data)
      if (result?.error) {
        setError(result.error)
      } else {
        if (result?.warning) {
          alert(result.warning)
        }
        setIsOpen(false)
      }
    })
  }

  return (
    <>
      <Button
        onClick={() => setIsOpen(true)}
        className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs focus-ring h-10 px-4 rounded-xl"
      >
        <UserPlus className="w-4 h-4 mr-2" />
        Cadastrar Paciente
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-sans">
          <div className="w-full max-w-2xl rounded-2xl bg-card p-6 card-elevated border border-border max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-foreground font-heading">
                  Novo Cadastro de Paciente
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cadastre o perfil clínico e atribua obrigatoriamente o médico responsável principal.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nome Completo */}
              <div className="space-y-1.5">
                <Label htmlFor="fullName" className="text-xs font-semibold text-foreground">
                  Nome Completo <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fullName"
                  name="fullName"
                  required
                  placeholder="Ex: Maria das Dores Silva"
                  className="h-10 text-xs sm:text-sm focus-ring"
                />
              </div>

              {/* Data Nascimento e Sexo Biológico */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="birthDate" className="text-xs font-semibold text-foreground">
                    Data de Nascimento <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="birthDate"
                    name="birthDate"
                    type="date"
                    required
                    max={new Date().toISOString().split('T')[0]}
                    className="h-10 text-xs sm:text-sm focus-ring"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="biologicalSex" className="text-xs font-semibold text-foreground">
                    Sexo Biológico <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="biologicalSex"
                    name="biologicalSex"
                    required
                    className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                  >
                    <option value="M">Masculino</option>
                    <option value="F">Feminino</option>
                  </select>
                  <p className="text-[10px] text-muted-foreground">Necessário para cálculo de CKD-EPI 2021</p>
                </div>
              </div>

              {/* CPF e Médico Responsável */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cpf" className="text-xs font-semibold text-foreground">
                    CPF (Opcional - Criptografado)
                  </Label>
                  <Input
                    id="cpf"
                    name="cpf"
                    placeholder="000.000.000-00"
                    className="h-10 text-xs sm:text-sm focus-ring tabular-clinical font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">Protegido por blind index para deduplicação</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="primaryPhysicianUserId" className="text-xs font-semibold text-foreground">
                    Médico Responsável Principal <span className="text-destructive">*</span>
                  </Label>
                  <select
                    id="primaryPhysicianUserId"
                    name="primaryPhysicianUserId"
                    required
                    className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                  >
                    <option value="">Selecione um médico...</option>
                    {doctors.map((doc) => (
                      <option key={doc.id} value={doc.id}>
                        Dr(a). {doc.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground">Vínculo principal obrigatório para paciente ativo</p>
                </div>
              </div>

              {/* CNS e Prontuário Institucional */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="cns" className="text-xs font-semibold text-foreground">
                    CNS (Cartão Nacional de Saúde)
                  </Label>
                  <Input
                    id="cns"
                    name="cns"
                    placeholder="Ex: 700000000000000"
                    className="h-10 text-xs sm:text-sm focus-ring tabular-clinical font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="medicalRecordNumber" className="text-xs font-semibold text-foreground">
                    Nº Prontuário Hospitalar
                  </Label>
                  <Input
                    id="medicalRecordNumber"
                    name="medicalRecordNumber"
                    placeholder="Ex: PR-2024-001"
                    className="h-10 text-xs sm:text-sm focus-ring"
                  />
                </div>
              </div>

              {/* Contatos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="phone" className="text-xs font-semibold text-foreground">
                    Telefone de Contato
                  </Label>
                  <Input
                    id="phone"
                    name="phone"
                    placeholder="(11) 99999-9999"
                    className="h-10 text-xs sm:text-sm focus-ring tabular-clinical"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                    E-mail do Paciente
                  </Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="paciente@exemplo.com"
                    className="h-10 text-xs sm:text-sm focus-ring"
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 text-xs text-destructive-foreground bg-destructive-bg border border-destructive/20 rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {warning && (
                <div className="p-3 text-xs text-warning-foreground bg-warning-bg border border-warning/20 rounded-xl flex items-center gap-2">
                  <Info className="w-4 h-4 text-warning shrink-0" />
                  <span>{warning}</span>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-2.5 border-t border-border/70 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs"
                  onClick={() => setIsOpen(false)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending}
                  className="h-9 text-xs bg-primary hover:bg-primary-hover text-primary-foreground font-semibold shadow-xs"
                >
                  {isPending ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Salvando...
                    </span>
                  ) : (
                    'Confirmar Cadastro'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// Alias de retrocompatibilidade
export const RegisterUserModal = RegisterPatientModal
export const NotificationButton = PatientManageLinkButton
