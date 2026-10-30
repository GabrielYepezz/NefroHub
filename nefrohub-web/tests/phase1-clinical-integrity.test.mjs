import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

describe('Fase 1: Auditoria de Código e Integridade das Regras de Negócio', () => {

  describe('Problema D — Rota /patient e Redirecionamento por Papel', () => {
    test('A rota /patient não deve expor o painel administrativo na renderização', () => {
      const patientPagePath = path.join(projectRoot, 'src/app/patient/page.tsx')
      const content = fs.readFileSync(patientPagePath, 'utf8')

      // Não deve renderizar tabela administrativa nem modal de criação de usuário
      assert.ok(!content.includes('RegisterPatientModal'), 'Não deve importar nem renderizar RegisterPatientModal')
      assert.ok(!content.includes('Pacientes Cadastrados'), 'Não deve renderizar cabeçalho administrativo')
      assert.ok(!content.includes('AdminDashboardPage'), 'Não deve manter o componente AdminDashboardPage legado')

      // Deve validar autenticação e redirecionar conforme o papel
      assert.ok(content.includes('redirect(\'/login\')'), 'Deve redirecionar deslogado para /login')
      assert.ok(content.includes('redirect(\'/admin/pacientes\')'), 'Deve redirecionar ADMIN para /admin/pacientes')
      assert.ok(content.includes('redirect(\'/doctor\')'), 'Deve redirecionar médico para /doctor')
      assert.ok(content.includes('redirect(\'/patient/dashboard\')'), 'Deve redirecionar paciente para /patient/dashboard')
    })
  })

  describe('Problema C — Remoção de Funcionalidades Fora do Escopo do MVP', () => {
    test('Dashboard do paciente não deve consultar nem exibir agendamento de consultas (appointments)', () => {
      const patientDashPath = path.join(projectRoot, 'src/app/patient/dashboard/page.tsx')
      const content = fs.readFileSync(patientDashPath, 'utf8')

      assert.ok(!content.includes("from('appointments')"), 'Não deve consultar a tabela appointments')
      assert.ok(!content.includes('Próximas Consultas'), 'Não deve exibir a seção Próximas Consultas')
    })

    test('Dashboard do paciente e do médico não devem emitir ou exibir alertas manuais de conduta de urgência', () => {
      const patientDashPath = path.join(projectRoot, 'src/app/patient/dashboard/page.tsx')
      const doctorClientPath = path.join(projectRoot, 'src/app/doctor/DoctorClientComponents.tsx')
      const doctorActionsPath = path.join(projectRoot, 'src/app/doctor/actions.ts')

      const patientContent = fs.readFileSync(patientDashPath, 'utf8')
      const doctorClientContent = fs.readFileSync(doctorClientPath, 'utf8')
      const doctorActionsContent = fs.readFileSync(doctorActionsPath, 'utf8')

      assert.ok(!patientContent.includes("from('alerts')"), 'Paciente não deve consultar alertas automáticos/manuais')
      assert.ok(!doctorClientContent.includes('Emitir Alerta Urgente'), 'Médico não deve ter formulário de alerta de urgência')
      assert.ok(!doctorClientContent.includes('issueAlertAction'), 'Médico não deve chamar issueAlertAction')
      assert.ok(!doctorActionsContent.includes('issueAlertAction'), 'issueAlertAction deve ter sido removida das actions')
    })
  })

  describe('Problema B — Submissão de Dados Clínicos (clinical_records e vital_signs)', () => {
    test('A action de submissão do paciente deve criar registros com status PENDING_VALIDATION', () => {
      const actionsPath = path.join(projectRoot, 'src/app/patient/dashboard/actions.ts')
      const content = fs.readFileSync(actionsPath, 'utf8')

      assert.ok(content.includes('submitPatientVitalSignsAction'), 'Deve exportar submitPatientVitalSignsAction')
      assert.ok(content.includes('PENDING_VALIDATION'), 'Status do clinical_record deve ser PENDING_VALIDATION')
      assert.ok(content.includes('vital_signs'), 'Deve persistir sinais vitais na tabela estruturada vital_signs')
      assert.ok(content.includes('confirmed_by_user_id: null'), 'confirmed_by_user_id deve ser nulo no envio do paciente')
      assert.ok(!content.includes(".update({ current_weight:"), 'Não deve atualizar current_weight diretamente')
    })

    test('Dashboard do paciente deve separar medições pendentes de indicadores confirmados', () => {
      const pagePath = path.join(projectRoot, 'src/app/patient/dashboard/page.tsx')
      const content = fs.readFileSync(pagePath, 'utf8')

      assert.ok(content.includes('PENDING_VALIDATION'), 'Deve consultar submissões PENDING_VALIDATION')
      assert.ok(content.includes('CONFIRMED'), 'Indicadores de exames devem filtrar apenas CONFIRMED')
      assert.ok(content.includes('Minhas Submissões (Fila de Validação Médica)'), 'Deve rotular explicitamente como fila de validação')
    })
  })

  describe('Problema A — Painel do Médico e Autorização Zero-Trust', () => {
    test('Painel do médico deve buscar pacientes via physician_patient_links onde status = ACTIVE', () => {
      const doctorPagePath = path.join(projectRoot, 'src/app/doctor/page.tsx')
      const content = fs.readFileSync(doctorPagePath, 'utf8')

      assert.ok(content.includes('physician_patient_links'), 'Deve utilizar a tabela oficial de vínculos')
      assert.ok(content.includes(".eq('status', 'ACTIVE')"), 'Deve filtrar estritamente vínculos ACTIVE')
      assert.ok(content.includes('patient_profiles'), 'Deve carregar perfis oficiais patient_profiles')
      assert.ok(!content.includes(".from('doctors')\n    .select('id')\n    .eq('user_id', user.id)\n    .single()"), 'Não deve depender exclusivamente da tabela legada doctors')
    })

    test('Actions do médico devem validar vínculo ativo antes de confirmar ou rejeitar', () => {
      const doctorActionsPath = path.join(projectRoot, 'src/app/doctor/actions.ts')
      const content = fs.readFileSync(doctorActionsPath, 'utf8')

      assert.ok(content.includes('confirmClinicalRecordAction'), 'Deve existir action de confirmação')
      assert.ok(content.includes('rejectClinicalRecordAction'), 'Deve existir action de rejeição')
      assert.ok(content.includes('verifyPhysicianAuthorization'), 'Deve verificar autorização do vínculo')
      assert.ok(content.includes('CONFIRMED'), 'Deve transicionar para CONFIRMED')
      assert.ok(content.includes('REJECTED'), 'Deve transicionar para REJECTED')
      assert.ok(content.includes('rejected_submission_events'), 'Rejeição deve registrar em rejected_submission_events')
    })
  })

  describe('Integridade de Imutabilidade e Governança do Schema', () => {
    test('Trigger de imutabilidade deve estar definido no schema.sql', () => {
      const schemaPath = path.join(projectRoot, 'docs/schema.sql')
      const content = fs.readFileSync(schemaPath, 'utf8')

      assert.ok(content.includes('check_clinical_record_immutability'), 'Função de trigger de imutabilidade deve existir')
      assert.ok(content.includes('trg_clinical_record_immutability'), 'Gatilho de imutabilidade em clinical_records deve existir')
      assert.ok(content.includes('block_audit_mutation'), 'Gatilho append-only para audit_events deve existir')
    })
  })
})
