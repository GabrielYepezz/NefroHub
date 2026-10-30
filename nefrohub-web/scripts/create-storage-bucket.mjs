#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    lines.forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=')
        const val = v.join('=').replace(/^['"]|['"]$/g, '')
        if (k && !process.env[k]) {
          process.env[k] = val
        }
      }
    })
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Credenciais ausentes')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

async function main() {
  console.log('Verificando buckets existentes...')
  const { data: buckets, error: listError } = await supabase.storage.listBuckets()
  if (listError) {
    console.error('Erro ao listar buckets:', listError.message)
    process.exit(1)
  }

  const existing = buckets?.find((b) => b.name === 'clinical-documents')
  if (existing) {
    console.log('Bucket clinical-documents já existe! Público:', existing.public)
    return
  }

  console.log('Criando bucket privado clinical-documents...')
  const { data, error } = await supabase.storage.createBucket('clinical-documents', {
    public: false,
    fileSizeLimit: 10485760, // 10 MiB
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  })

  if (error) {
    console.error('Erro ao criar bucket:', error.message)
    process.exit(1)
  }

  console.log('Bucket clinical-documents criado com sucesso! Resultado:', data)
}

main()
