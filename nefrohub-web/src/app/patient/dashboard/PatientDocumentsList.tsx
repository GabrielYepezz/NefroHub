'use client'

import { useState, useTransition } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { UploadDocumentModal } from './UploadDocumentModal'
import { getSignedDocumentUrlAction } from './documentActions'
import { FileText, ExternalLink, AlertCircle, Loader2 } from 'lucide-react'

export interface DocumentDisplayItem {
  id: string
  title: string
  documentType: string
  mimeType: string
  fileSizeBytes: number
  sha256Hash: string
  validationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED'
  rejectionReason?: string | null
  createdAt: string
}

interface PatientDocumentsListProps {
  documents: DocumentDisplayItem[]
  patientId?: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  EXAM_REPORT: 'Laudo Laboratorial',
  BIOPSY: 'Biópsia Renal',
  IMAGING: 'Exame de Imagem',
  PROOF_DOCUMENT: 'Comprovante Legal',
  OTHER: 'Documento Clínico',
}

export function PatientDocumentsList({ documents, patientId }: PatientDocumentsListProps) {
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const handleOpenDocument = (docId: string) => {
    setError(null)
    setOpeningId(docId)

    startTransition(async () => {
      const res = await getSignedDocumentUrlAction(docId)
      setOpeningId(null)
      if (res.error) {
        setError(res.error)
      } else if (res.signedUrl) {
        window.open(res.signedUrl, '_blank', 'noopener,noreferrer')
      }
    })
  }

  return (
    <Card className="border-border card-subtle font-sans">
      <CardHeader className="bg-secondary/30 border-b border-border/80 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <CardTitle className="text-sm font-semibold text-foreground">
                Laudos e Documentos Digitalizados
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Arquivos clínicos com criptografia em repouso e URLs assinadas de 15 minutos
            </CardDescription>
          </div>
          <UploadDocumentModal patientId={patientId} />
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {error && (
          <div
            role="alert"
            className="p-3 text-xs text-destructive-foreground bg-destructive-bg border border-destructive/20 rounded-xl flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {documents.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-6 h-6 text-muted-foreground/60" />}
            title="Nenhum documento anexado"
            description="Você ainda não enviou nenhum laudo ou exame digitalizado em PDF ou imagem."
            className="border-0 bg-transparent py-4"
          />
        ) : (
          <div className="divide-y divide-border/60">
            {documents.map((doc) => {
              const typeLabel = DOC_TYPE_LABELS[doc.documentType] || doc.documentType
              const sizeMb = (doc.fileSizeBytes / (1024 * 1024)).toFixed(2)
              const isOpening = openingId === doc.id

              return (
                <div
                  key={doc.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-secondary/30 rounded-lg px-2 -mx-2 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-foreground">{doc.title}</span>
                      <Badge
                        variant={
                          doc.validationStatus === 'CONFIRMED'
                            ? 'success'
                            : doc.validationStatus === 'PENDING'
                            ? 'warning'
                            : 'destructive'
                        }
                        size="sm"
                        dot
                      >
                        {doc.validationStatus === 'CONFIRMED'
                          ? 'Validado pelo Médico'
                          : doc.validationStatus === 'PENDING'
                          ? 'Aguardando Conferência'
                          : 'Recusado'}
                      </Badge>
                    </div>

                    <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-3 tabular-clinical">
                      <span>Categoria: <strong className="text-foreground">{typeLabel}</strong></span>
                      <span>Tamanho: <strong className="text-foreground">{sizeMb} MB</strong></span>
                      <span>Data: {new Date(doc.createdAt).toLocaleDateString('pt-BR')}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/80" title={`SHA-256: ${doc.sha256Hash}`}>
                        SHA-256: {doc.sha256Hash.slice(0, 10)}...
                      </span>
                    </div>

                    {doc.validationStatus === 'REJECTED' && doc.rejectionReason && (
                      <p className="text-xs text-destructive-foreground mt-1 italic pl-2 border-l-2 border-destructive/40">
                        Motivo da recusa: &quot;{doc.rejectionReason}&quot;
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs text-primary border-primary/25 hover:bg-primary-light focus-ring"
                      disabled={isOpening}
                      onClick={() => handleOpenDocument(doc.id)}
                    >
                      {isOpening ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          <span>Gerando URL...</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink className="w-3.5 h-3.5 mr-1" />
                          <span>Visualizar (15 min)</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
