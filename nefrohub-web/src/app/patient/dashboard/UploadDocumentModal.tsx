'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { uploadClinicalDocumentAction } from './documentActions'
import { MAX_FILE_SIZE_BYTES } from '@/lib/security/document-validator'
import { Upload, AlertCircle, CheckCircle2, FileText, Info, Loader2 } from 'lucide-react'

interface UploadDocumentModalProps {
  patientId?: string
  buttonLabel?: string
  defaultType?: string
}

export function UploadDocumentModal({
  patientId,
  buttonLabel = 'Anexar Laudo / Documento',
  defaultType = 'EXAM_REPORT',
}: UploadDocumentModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [title, setTitle] = useState('')
  const [documentType, setDocumentType] = useState(defaultType)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`O arquivo excede o limite estrito de 10 MB (tamanho: ${(file.size / (1024 * 1024)).toFixed(2)} MB).`)
      setSelectedFile(null)
      return
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['pdf', 'jpg', 'jpeg', 'png'].includes(ext || '')) {
      setError('Formato não permitido. São aceitos exclusivamente arquivos PDF, JPG ou PNG.')
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    if (!title) {
      setTitle(file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!selectedFile) {
      setError('Selecione um arquivo válido para anexar.')
      return
    }

    const formData = new FormData()
    formData.append('file', selectedFile)
    formData.append('title', title.trim())
    formData.append('documentType', documentType)
    if (patientId) {
      formData.append('patientId', patientId)
    }

    startTransition(async () => {
      const res = await uploadClinicalDocumentAction(formData)
      if (res.error) {
        setError(res.error)
      } else {
        setSuccess(res.message || 'Upload concluído com sucesso!')
        setTimeout(() => {
          setIsOpen(false)
          setSuccess(null)
          setSelectedFile(null)
          setTitle('')
        }, 1200)
      }
    })
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setIsOpen(true)
          setError(null)
          setSuccess(null)
        }}
        className="bg-primary hover:bg-primary-hover text-primary-foreground font-medium text-xs h-8 shadow-xs focus-ring"
      >
        <Upload className="w-3.5 h-3.5 mr-1" /> {buttonLabel}
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs font-sans">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 card-elevated border border-border animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-border/80 pb-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <FileText className="w-4.5 h-4.5 text-primary" />
                  <h2 className="text-base font-bold text-foreground font-heading">
                    Anexar Documento Clínico / Laudo
                  </h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Armazenamento em bucket privado com criptografia em repouso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted-foreground hover:text-foreground p-1 leading-none text-base cursor-pointer"
                aria-label="Fechar modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="p-3 bg-info-bg border border-info/20 rounded-xl text-xs text-info-foreground flex items-start gap-2.5">
                <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  Formatos aceitos: <strong>PDF, JPEG ou PNG</strong> (máx. <strong>10 MB</strong>). O arquivo passará por validação binária e cálculo de hash SHA-256 no servidor.
                </span>
              </div>

              {/* Título do Documento */}
              <div className="space-y-1.5">
                <Label htmlFor="docTitle" className="text-xs font-semibold text-foreground">
                  Título / Descrição do Documento <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="docTitle"
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Laudo Creatinina e Urina 24h - Laboratório Central"
                  className="focus-ring h-10 text-xs sm:text-sm"
                />
              </div>

              {/* Tipo de Documento */}
              <div className="space-y-1.5">
                <Label htmlFor="docType" className="text-xs font-semibold text-foreground">
                  Categoria Clínica
                </Label>
                <select
                  id="docType"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value)}
                  className="flex h-10 w-full rounded-xl border border-border bg-card px-3 py-2 text-xs focus-ring text-foreground"
                >
                  <option value="EXAM_REPORT">Laudo de Exame Laboratorial</option>
                  <option value="BIOPSY">Laudo Histopatológico / Biópsia Renal</option>
                  <option value="IMAGING">Exame de Imagem (Ultrassom / Tomografia)</option>
                  <option value="PROOF_DOCUMENT">Comprovante Legal / Procuração</option>
                  <option value="OTHER">Outro Documento Clínico</option>
                </select>
              </div>

              {/* Input de Arquivo */}
              <div className="space-y-1.5">
                <Label htmlFor="docFile" className="text-xs font-semibold text-foreground">
                  Arquivo Digital <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="docFile"
                  type="file"
                  required
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={handleFileChange}
                  className="focus-ring text-xs file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary-light file:text-primary hover:file:bg-primary-light/80"
                />
                {selectedFile && (
                  <p className="text-[11px] text-muted-foreground mt-1 tabular-clinical">
                    Arquivo: <strong className="text-foreground">{selectedFile.name}</strong> ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
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

              {success && (
                <div
                  role="alert"
                  className="p-3 text-xs text-success-foreground bg-success-bg border border-success/20 rounded-xl flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-3 border-t border-border/70">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-9"
                  onClick={() => setIsOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isPending || !selectedFile}
                  className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold text-xs h-9 focus-ring"
                >
                  {isPending ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Validando e Enviando...
                    </span>
                  ) : (
                    'Realizar Upload Seguro'
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
