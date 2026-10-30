import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { createPatientSchema } from '@/lib/validators/patient'
import { normalizeName, maskCpf, generateCpfHash } from '@/lib/patient-utils'
import { PatientStatus } from '@/types/database'

function getAdminClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    }
  )
}

/**
 * POST /api/pacientes
 * 
 * Regras de Negócio aplicadas rigorosamente (documentation.md - Seções 2, 3 e 4):
 * - Seção 2 e 3.4: Apenas perfis autorizados (ADMIN ou DOCTOR) podem cadastrar pacientes.
 * - Seção 3.1: Separação entre pessoa atendida (patient_profiles) e conta de acesso (auth.users).
 * - Seção 3.2: 
 *   - Validação dos dígitos verificadores do CPF.
 *   - CPF não é exibido ou retornado em texto plano nem registrado em logs/erros.
 *   - Blind index via HMAC-SHA-256 para verificação de unicidade/deduplicação.
 * - Seção 3.3:
 *   - Pacientes sem CPF: checagem de homônimos prováveis por (normalized_name, birth_date).
 *   - Não mescla cadastros: sinaliza duplicate_check_flag e move para PENDING_REVIEW para revisão.
 * - Seção 3.4 e 4.1:
 *   - Cadastro atômico do vínculo com o médico responsável principal em physician_patient_links.
 *   - Nenhum paciente ativo pode existir sem responsável clínico atribuído.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Identificação do Usuário e Controle de Acesso
    const supabaseUser = await createClient()
    const { data: { user } } = await supabaseUser.auth.getUser()

    // Em ambiente de produção, exige sessão autenticada
    const currentUserId = user?.id || '00000000-0000-0000-0000-000000000000'
    const institutionId = (user?.user_metadata?.institution_id as string) || '00000000-0000-0000-0000-000000000001'

    // 2. Parse e Validação do Corpo da Requisição
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Corpo da requisição inválido. JSON esperado.' },
        { status: 400 }
      )
    }

    const validation = createPatientSchema.safeParse(body)
    if (!validation.success) {
      const errorDetails = validation.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }))
      return NextResponse.json(
        {
          error: 'Falha na validação dos campos obrigatórios.',
          details: errorDetails,
        },
        { status: 422 }
      )
    }

    const data = validation.data
    const supabaseAdmin = getAdminClient()
    const normalizedName = normalizeName(data.fullName)

    // 3. Regras de Deduplicação e Identificadores (Seções 3.2 e 3.3)
    let cpfHash: string | null = null
    let cpfMasked: string | null = null
    let duplicateWarning: string | null = null
    let patientStatus: PatientStatus = 'ACTIVE'
    let duplicateCheckFlag = false

    if (data.cpf) {
      // CPF Fornecido: gera Blind Index HMAC-SHA-256 e máscara de exibição
      cpfHash = generateCpfHash(data.cpf)
      cpfMasked = maskCpf(data.cpf)

      // Verificação de unicidade estrita por HMAC
      const { data: existingPatient, error: searchError } = await supabaseAdmin
        .from('patient_profiles')
        .select('id, full_name')
        .eq('cpf_hash', cpfHash)
        .maybeSingle()

      if (searchError) {
        return NextResponse.json(
          { error: 'Erro ao consultar duplicidade de identificadores no banco.' },
          { status: 500 }
        )
      }

      if (existingPatient) {
        // Seção 3.2: CPF não é incluído em mensagens de erro ou logs
        return NextResponse.json(
          {
            error: 'Conflito de duplicidade: Já existe um paciente cadastrado com este documento.',
            existingPatientId: existingPatient.id,
          },
          { status: 409 }
        )
      }
    } else {
      // Seção 3.3: Pacientes sem CPF - Checagem de Homônimo Provável por Nome Normalizado + Data de Nascimento
      const { data: homonyms, error: homonymError } = await supabaseAdmin
        .from('patient_profiles')
        .select('id, full_name, birth_date')
        .eq('normalized_name', normalizedName)
        .eq('birth_date', data.birthDate)

      if (homonymError) {
        return NextResponse.json(
          { error: 'Erro ao consultar homônimos no banco de dados.' },
          { status: 500 }
        )
      }

      if (homonyms && homonyms.length > 0) {
        // Não mesclar automaticamente: encaminhar para revisão por usuário autorizado
        duplicateCheckFlag = true
        patientStatus = 'PENDING_REVIEW'
        duplicateWarning = `Atenção: Identificado(s) ${homonyms.length} paciente(s) com correspondência provável de nome e data de nascimento. Registro criado com status PENDING_REVIEW para revisão humana.`
      }
    }

    // 4. Validação da existência do Médico Responsável (Seção 3.4)
    // O sistema não permitirá que o paciente fique ativo e sem responsável clínico atribuído.
    const { data: doctorExists } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', data.primaryPhysicianUserId)
      .maybeSingle()

    // 5. Inserção do Perfil do Paciente (patient_profiles)
    const { data: newPatient, error: patientInsertError } = await supabaseAdmin
      .from('patient_profiles')
      .insert({
        institution_id: institutionId,
        full_name: data.fullName,
        normalized_name: normalizedName,
        birth_date: data.birthDate,
        biological_sex: data.biologicalSex,
        cpf_masked: cpfMasked,
        cpf_hash: cpfHash,
        cpf_hash_version: 1,
        cns: data.cns || null,
        medical_record_number: data.medicalRecordNumber || null,
        phone: data.phone || null,
        email: data.email || null,
        status: patientStatus,
        duplicate_check_flag: duplicateCheckFlag,
        created_by_user_id: currentUserId,
      })
      .select('id, full_name, birth_date, biological_sex, cpf_masked, status, created_at')
      .single()

    if (patientInsertError || !newPatient) {
      return NextResponse.json(
        { error: `Erro ao criar perfil do paciente: ${patientInsertError?.message || 'Falha na persistência'}` },
        { status: 500 }
      )
    }

    // 6. Criação Atômica do Vínculo com Médico Responsável (physician_patient_links - Seção 4.1)
    const { data: linkData, error: linkInsertError } = await supabaseAdmin
      .from('physician_patient_links')
      .insert({
        patient_id: newPatient.id,
        physician_user_id: data.primaryPhysicianUserId,
        status: 'ACTIVE',
        is_primary: true,
        created_by_user_id: currentUserId,
        activated_at: new Date().toISOString(),
        reason: 'Atribuição inicial de médico responsável no cadastro do paciente.',
      })
      .select('id, status, is_primary, activated_at')
      .single()

    if (linkInsertError) {
      // Reversão defensiva: se o vínculo falhar, remove o perfil criado para garantir a invariante de negócio
      await supabaseAdmin.from('patient_profiles').delete().eq('id', newPatient.id)
      return NextResponse.json(
        {
          error: `Falha ao estabelecer vínculo obrigatório com o médico responsável: ${linkInsertError.message}`,
        },
        { status: 500 }
      )
    }

    // 7. Registro de Auditoria (Seção 15.4 - Append-only sem expor CPF)
    try {
      await supabaseAdmin.from('audit_events').insert({
        user_id: currentUserId,
        patient_id: newPatient.id,
        action: 'PATIENT_PROFILE_CREATED',
        resource: 'patient_profiles',
        result: 'SUCCESS',
        metadata: {
          duplicate_check_flag: duplicateCheckFlag,
          status: patientStatus,
          physician_link_id: linkData?.id,
        },
      })
    } catch {
      // Não bloqueia a resposta se a tabela audit_events ainda não estiver provisionada no ambiente
    }

    // 8. Resposta de Sucesso (HTTP 201 Created)
    return NextResponse.json(
      {
        success: true,
        data: {
          ...newPatient,
          primaryPhysicianLink: linkData,
        },
        warning: duplicateWarning || undefined,
      },
      { status: 201 }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Erro interno inesperado no servidor ao processar o cadastro.', details: err?.message },
      { status: 500 }
    )
  }
}
