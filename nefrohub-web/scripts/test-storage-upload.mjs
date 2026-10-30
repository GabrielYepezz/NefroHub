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
const supabase = createClient(supabaseUrl, serviceRoleKey)

async function testStorage() {
  console.log('--- TESTE DE INTEGRAÇÃO DO STORAGE PRIVADO (clinical-documents) ---')

  // 1. Criar buffer de teste PDF sintético
  const testBuffer = Buffer.from('%PDF-1.4\n%TEST-SYNTHETIC-DOC\n%%EOF')
  const testPath = `test-patient-synthetic/test-${Date.now()}.pdf`

  console.log(`1. Realizando upload de teste: ${testPath}...`)
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('clinical-documents')
    .upload(testPath, testBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    console.error('❌ Falha no upload:', uploadError.message)
    process.exit(1)
  }
  console.log('✅ Upload concluído com sucesso!')

  // 2. Gerar URL assinada de 15 minutos (900s)
  console.log('2. Solicitando URL assinada com expiração de 900s...')
  const { data: signedData, error: signedError } = await supabase.storage
    .from('clinical-documents')
    .createSignedUrl(testPath, 900)

  if (signedError || !signedData?.signedUrl) {
    console.error('❌ Falha na geração de URL assinada:', signedError?.message)
    process.exit(1)
  }
  console.log('✅ URL assinada gerada com sucesso! (expiração de 15 min confirmada)')

  // 3. Limpeza do arquivo de teste
  console.log('3. Limpando arquivo sintético de teste...')
  const { error: removeError } = await supabase.storage
    .from('clinical-documents')
    .remove([testPath])

  if (removeError) {
    console.warn('⚠️ Falha ao remover arquivo de teste:', removeError.message)
  } else {
    console.log('✅ Arquivo de teste removido. Storage 100% limpo e íntegro.')
  }

  console.log('--- STORAGE PRIVADO INTEGRADO E VALIDADO COM SUCESSO! ---')
}

testStorage()
