# Plano de Implementação Incremental dos Requisitos Pendentes

**Projeto:** NefroHub Web  
**Referência:** `documentation.md` (PRD Oficial)  
**Status Atual:** Fase de Planejamento e Auditoria (Fases 1, 2 e 3 concluídas; Fase 4 aguardando autorização)

---

## 1. Visão Geral da Matriz de Requisitos

A auditoria exaustiva de todos os 76 requisitos funcionais catalogados resultou na seguinte distribuição:

* **Status de Implementação:**
  * `IMPLEMENTED`: 51 requisitos (67,1%)
  * `PARTIAL`: 5 requisitos (6,6%)
  * `MISSING`: 18 requisitos (23,7%)
  * `CONFLICT`: 2 requisitos (2,6%)
* **Status de Validação:**
  * `PASS`: 51 requisitos (67,1%) com testes reais aprovados
  * `PARTIAL`: 4 requisitos (5,3%)
  * `BLOCKED`: 19 requisitos (25,0%) dependentes de implementação
  * `NOT APPLICABLE`: 2 requisitos (2,6%) decorrentes de conflito de arquitetura

---

## 2. Conflitos de Especificação e Decisões Pendentes

Antes ou durante a implementação, os seguintes conflitos identificados na documentação requerem alinhamento:

1. **Autoatendimento Público vs. Entrada Institucional (RF-018):**
   * *Origem:* A Seção 3.4 do PRD veda o autoatendimento autônomo de pacientes no MVP, exigindo cadastro por administrador ou médico. Contudo, a Seção 2.1 e a arquitetura Next.js possuem tela pública `/auth/register`.
   * *Abordagem Proposta:* Manter o formulário `/auth/register` como um *pré-cadastro institucional de triagem* que insere o paciente com status `PENDING_APPROVAL` na Fila 2, impedindo acesso clínico imediato até aprovação e vínculo formal por um médico.
2. **Arquitetura Assíncrona Celery/Redis vs. Server Actions (RF-048):**
   * *Origem:* A Seção 7.4 e 14.1 do PRD herdou menções a Celery e Redis de uma concepção legada em Python/Django.
   * *Abordagem Atual:* O sistema utiliza Next.js App Router com Server Actions e cliente de e-mail assíncrono Nodemailer resiliente em `src/lib/email/service.ts`, mantendo a garantia de não-bloqueio transacional.
3. **Comprimento Mínimo de Senha (RF-009):**
   * *Origem:* O PRD Seção 15.1 exige 12 caracteres mínimos para todas as contas. O schema Zod atual valida 6 a 8 caracteres.
   * *Ajuste Planejado:* Elevar o critério Zod `z.string().min(12)` de forma estrita no próximo incremento.

---

## 3. Roteiro Incremental Priorizado (Fase 4)

A execução da Fase 4 será dividida em 5 incrementos sequenciais de baixo risco, sem operações destrutivas e com validação passo a passo:

### Incremento 1: Segurança, MFA/TOTP e Governança de Acesso (P0) — [CONCLUÍDO]
* **Requisitos:** RF-007 (MFA/TOTP para médicos e admins), RF-009 (Senhas fortes >= 12 chars), RF-004 (Justificativa de acesso emergencial Doctor Master), SEC-01 (Hardening do trigger de novos usuários).
* **Entregas Realizadas:**
  * Alinhamento integral com a política institucional de senhas fortes (mínimo 12 caracteres e frases-senha).
  * Implementação de Autenticação Multifator TOTP nativa com Supabase Auth MFA (QR Code SVG, segredo base32, desafio AAL2 no login e middleware).
  * Fluxo completo de cobertura assistencial emergencial e excepcional pelo Doctor Master com modal, justificativa mínima de 15 caracteres e auditoria append-only.
  * Elaboração da migration local `007_hardening_handle_new_auth_user.sql` contra escalonamento de privilégios via signups anônimos.
* **Status dos Requisitos:** RF-004 (`IMPLEMENTED / PASS`), RF-007 (`IMPLEMENTED / PASS`), RF-009 (`IMPLEMENTED / PASS`).
* **Testes de Regressão:** 148 testes em `npm test` (100% pass), 22 testes em `npm run test:e2e` (100% pass), 0 erros em `npx tsc --noEmit`.

### Incremento 2: Módulos Clínicos no Prontuário — Alergias e Internações (P1) — [CONCLUÍDO]
* **Requisitos:** RF-054 (Gestão de alergias com triplo estado), RF-056 (Histórico de internações hospitalares).
* **Entregas Realizadas:**
  * Implementação de Server Actions seguras em `src/app/doctor/allergyActions.ts` conectadas à tabela real `allergies` no Supabase com validação Zero-Trust e MFA guard.
  * Desenvolvimento da interface médica `PatientAllergiesSection.tsx` implementando com rigor o triplo estado de informação do PRD Seção 8.6 (Alergia Conhecida, Nega Alergias, Informação Não Relatada) e fluxo de inativação.
  * Integração da visualização somente leitura de alergias no portal do paciente (`PatientClinicalSummary.tsx` e `patient/dashboard/page.tsx`).
  * Preparação da migration local `docs/migrations/008_hospitalizations.sql` com constraints temporais (alta >= admissão), desfechos padronizados e políticas RLS completas.
* **Status dos Requisitos:** RF-054 (`IMPLEMENTED / PASS`), RF-056 (`PARTIAL / PARTIAL` - aguardando autorização para aplicação da migration no Supabase remoto).
* **Testes de Regressão:** 159 testes em `npm test` (100% pass), 32 cenários em `npm run test:e2e` (100% pass), 0 erros em `npx tsc --noEmit`.

### Incremento 3: Módulo de Diálise (Hemodiálise e Peritoneal) (P1) — [PRÓXIMO FOCO]
* **Requisitos:** RF-055 (Tratamentos e sessões de diálise).
* **Escopo Técnico:**
  * Adicionar aba "Diálise" no prontuário do paciente.
  * Cadastro de modalidade (HD / DP), acesso vascular, peso seco, ganho interdialítico e intercorrências.
* **Critérios de Aceite:**
  * Registro de parâmetros dialíticos persistido e exibido cronologicamente.

### Incremento 4: Fila 3 — Desativação Médica e Reatribuicão Clínica em Lote (P1)
* **Requisitos:** RF-005, RF-006, RF-043 (Fila 3 e reatribuição de vínculos e rascunhos).
* **Escopo Técnico:**
  * Interface administrativa na Fila 3 para selecionar novo médico assistente para os pacientes de um médico desativado.
  * Server Action atômica para migração dos vínculos ativos e rascunhos clínicos.
* **Critérios de Aceite:**
  * Nenhum paciente ativo fica sem médico responsável após desativação.

### Incremento 5: Governança de Termos Legais e Consentimento (P2)
* **Requisitos:** RF-073 (Versionamento de termos legais), RF-074 (Barreira de aceite no login), RF-075 (Registros de retenção).
* **Escopo Técnico:**
  * Tela de aceite de termos de privacidade no login se a versão vigente for superior à versão aceita pelo usuário.
  * Tabela de log de aceite em conformidade com a LGPD.
