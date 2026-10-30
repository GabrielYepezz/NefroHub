#!/usr/bin/env node

/**
 * Script CLI para criação/provisionamento do usuário Administrador (ADMIN) no NefroHub.
 * 
 * Uso:
 *   npm run create:admin
 *   npm run create:admin -- --email=admin@nefrohub.med.br --password=AdminForte123! --name="Admin Principal"
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 1. Carregar variáveis de ambiente de .env.local ou .env
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env.local')
  const fallbackEnvPath = path.resolve(__dirname, '../.env')
  const targetPath = fs.existsSync(envPath) ? envPath : fs.existsSync(fallbackEnvPath) ? fallbackEnvPath : null

  if (targetPath) {
    const content = fs.readFileSync(targetPath, 'utf8')
    content.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...values] = trimmed.split('=')
        const val = values.join('=').replace(/^['"]|['"]$/g, '')
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val
        }
      }
    })
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('\x1b[31m[ERRO] Variáveis NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias no .env.local\x1b[0m')
  process.exit(1)
}

// 2. Extrair parâmetros da linha de comando
const args = process.argv.slice(2)
function getArg(key, defaultValue) {
  const found = args.find((arg) => arg.startsWith(`--${key}=`))
  if (found) return found.split('=')[1]
  return defaultValue
}

const adminEmail = getArg('email', 'admin@nefrohub.med.br')
const adminPassword = getArg('password', 'NefroAdmin@2026')
const adminName = getArg('name', 'Administrador Chefe NefroHub')

async function main() {
  console.log('\n\x1b[36m=====================================================\x1b[0m')
  console.log('\x1b[36m        NefroHub - Provisionamento de Administrador    \x1b[0m')
  console.log('\x1b[36m=====================================================\x1b[0m\n')
  console.log(`📡 Conectando ao Supabase em: ${supabaseUrl}`)
  console.log(`👤 E-mail do Admin: ${adminEmail}`)
  console.log(`🔐 Nome: ${adminName}`)

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  // 3. Verificar se o usuário já existe
  const { data: usersList, error: listError } = await supabase.auth.admin.listUsers()

  if (listError) {
    console.error('\x1b[31m[ERRO] Falha ao listar usuários no Supabase:\x1b[0m', listError.message)
    process.exit(1)
  }

  const existingUser = usersList.users.find((u) => u.email?.toLowerCase() === adminEmail.toLowerCase())

  let userId

  if (existingUser) {
    console.log(`\n\x1b[33m[AVISO] Usuário ${adminEmail} já existe no Supabase Auth. Atualizando credenciais e papel...\x1b[0m`)
    
    const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
      existingUser.id,
      {
        password: adminPassword,
        email_confirm: true,
        user_metadata: {
          name: adminName,
          role: 'ADMIN',
        },
      }
    )

    if (updateError) {
      console.error('\x1b[31m[ERRO] Falha ao atualizar usuário:\x1b[0m', updateError.message)
      process.exit(1)
    }

    userId = updated.user.id
    console.log('\x1b[32m✔ Senha e metadados de ADMIN atualizados com sucesso!\x1b[0m')
  } else {
    console.log('\nCriando novo usuário Administrador no Supabase Auth...')
    
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
      user_metadata: {
        name: adminName,
        role: 'ADMIN',
      },
    })

    if (createError) {
      console.error('\x1b[31m[ERRO] Falha ao criar usuário:\x1b[0m', createError.message)
      process.exit(1)
    }

    userId = created.user.id
    console.log('\x1b[32m✔ Usuário criado com sucesso no Supabase Auth!\x1b[0m')
  }

  // 4. Se a tabela pública 'users' existir, sincronizar o registro
  try {
    const { error: dbError } = await supabase.from('users').upsert({
      id: userId,
      email: adminEmail,
      name: adminName,
      role: 'ADMIN',
    })

    if (!dbError) {
      console.log('\x1b[32m✔ Sincronizado na tabela public.users com role ADMIN!\x1b[0m')
    }
  } catch (err) {
    // Tabela public.users pode ter schema customizado ou triggers automáticos
  }

  console.log('\n\x1b[32m=====================================================\x1b[0m')
  console.log('\x1b[32m    SUCESSO: Administrador pronto para uso!         \x1b[0m')
  console.log('\x1b[32m=====================================================\x1b[0m')
  console.log(`\n🔑 Credenciais de Acesso:`)
  console.log(`   E-mail: \x1b[33m${adminEmail}\x1b[0m`)
  console.log(`   Senha:  \x1b[33m${adminPassword}\x1b[0m`)
  console.log(`\n👉 Acesse a tela de login (/login) para entrar no sistema.\n`)
}

main().catch((err) => {
  console.error('\x1b[31m[ERRO FATAL]:\x1b[0m', err)
  process.exit(1)
})
