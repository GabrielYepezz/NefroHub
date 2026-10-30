# Auditoria de Segurança, Integridade dos Dados e Revisão Arquitetural

**Projeto:** NefroHub Web  
**Data:** 29 de Outubro de 2026  
**Auditor:** Engenheiro de Software Sênior / Auditor de Segurança Clínica  
**Escopo:** Fases 1, 2 e 3 da Auditoria de Segurança e Integridade dos Dados, cobrindo o estado do repositório local, a infraestrutura PostgreSQL/Supabase remota, os mecanismos de RLS, as funções `SECURITY DEFINER`, as Server Actions, a integridade dos dados compartilhados e o impacto da suíte E2E.

---

## 1. Estado Inicial do Repositório e Ambiente

* **Versionamento Git:** O ambiente de trabalho local (`nefrohub` e `nefrohub-web`) **não possui repositório Git inicializado** (ausência de diretório `.git`). A auditoria de arquivos baseia-se na árvore estática do sistema de arquivos e nos arquivos de configuração do ecossistema Node.js.
* **Variáveis de Ambiente:** O arquivo `.env.local` contém estritamente as chaves necessárias para operação (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Nenhuma credencial foi exposta em código cliente ou relatórios.
* **Provedor de Banco de Dados:** Instância Supabase PostgreSQL 17 (`iyukangioglvtgxirgcl`), região `sa-east-1` (São Paulo), com status `ACTIVE_HEALTHY`.

---

## 2. Revisão Crítica de PostgreSQL e Supabase

### 2.1. Funções `SECURITY DEFINER` e Políticas RLS
Foram auditadas todas as 19 funções `SECURITY DEFINER` presentes no schema `public`.

* **Proteção de `search_path`:** Todas as 19 funções definem explicitamente `SET search_path = public, pg_temp`, eliminando vulnerabilidades de injeção de schema ou sequestro de busca de operadores no PostgreSQL.
* **Resolução da Recursão Mútua de RLS:**
  * *Problema Anterior:* As políticas originais de `patient_profiles` e `physician_patient_links` realizavam subconsultas cruzadas interdependentes, disparando erro `42P17` (*infinite recursion detected*) quando um paciente consultava seu próprio prontuário.
  * *Correção Auditada:* Criação das funções desacopladas `public.patient_has_physician_link(p_patient_id, p_physician_id)` e `public.link_belongs_to_patient_user(p_patient_id, p_user_id)`. Como rodam com privilégios de proprietário, não acionam reavaliação cíclica das políticas de tabela.
* **Função `public.is_admin()`:**
  * Executa com privilégios restritos e consulta `auth.uid()`, sem aceitar parâmetros externos que possam ser manipulados pelo cliente.

### 2.2. Vulnerabilidade Potencial Identificada (SEC-01) — Hardening Recomendado
* **Objeto Afetado:** Trigger `handle_new_auth_user` em `auth.users`.
* **Evidência:** O código fonte da função lê `v_role := UPPER(NEW.raw_user_meta_data->>'role')`. Se o valor for `'ADMIN'`, `'DOCTOR'` ou `'DOCTOR_MASTER'`, ela atribui esse papel diretamente na tabela `public.users` e provisiona `admin_profiles`.
* **Análise de Risco:**
  * Na aplicação Next.js, o formulário público `/auth/register` é rigidamente sanitizado pelo schema Zod `publicRegisterSchema` e a Server Action `registerAction` fixa no servidor `role: 'PATIENT'`, impedindo qualquer autoatribuição pelo frontend.
  * No entanto, se um invasor fizer uma requisição HTTP direta à API pública do Supabase (`POST /auth/v1/signup`) usando a chave anônima pública e injetando `raw_user_meta_data: { role: 'ADMIN' }`, o trigger aceitaria a instrução no banco.
* **Proposta de Correção no Banco (Aguardando autorização):**
  Alterar o trigger `handle_new_auth_user` para forçar `v_role := 'PATIENT'` sempre que `NEW.invited_at IS NULL` (cadastros autônomos), permitindo papéis de `DOCTOR` e `ADMIN` exclusivamente quando o usuário for criado via convite administrativo formal ou pela Service Role.

---

## 3. Revisão de Autenticação, RBAC e Server Actions

* **Prevenção de Escalonamento de Privilégios:**
  * Todas as Server Actions administrativas em `src/app/admin/` invocam `verifyAdminAuthorization()`, que valida a sessão no Supabase Auth e confirma no banco que `user.role === 'ADMIN'`.
  * As ações médicas em `src/app/doctor/actions.ts` validam a existência de vínculo clínico ativo (`status = 'ACTIVE'`) com o `patient_id` antes de qualquer leitura ou mutação.
* **Hidratação de Formulários:**
  * Foi sanado o risco de submissão nativa HTTP GET precoce no formulário de login (`LoginForm.tsx`), garantindo que formulários só submetam após a hidratação completa do React no navegador do usuário.
* **Integridade das Colunas de Prontuário:**
  * Foi auditado que a tabela `clinical_records` não possui as colunas `version` ou `institution_id` (o controle de instituição é herdado via `patient_id -> patient_profiles`). As Server Actions foram alinhadas rigorosamente com o schema físico real do banco remoto.

---

## 4. Auditoria da Integridade dos Dados no Supabase Remoto

### 4.1. Censo de Registros e Preservação de Dados Preexistentes
Foi realizada uma contagem e inspeção não-destrutiva de todas as tabelas no Supabase remoto:

* **Tabelas e Contagens:**
  * `users`: 8 registros
  * `patient_profiles`: 20 registros
  * `clinical_records`: 23 registros
  * `vital_signs`: 53 registros
  * `lab_results`: 4 registros
  * `review_requests`: 5 registros
  * `audit_events`: 32 registros
  * `documents`: 2 registros
  * `institutions`: 1 registro (`00000000-0000-0000-0000-000000000001`)

### 4.2. Usuários Preexistentes Identificados e Preservados (100% Intactos):
1. `admin@nefrohub.com.br` (`ADMIN`) — Criado em 26/10/2026.
2. `nikolasaldo.ms@gmail.com` (`DOCTOR`) — Criado em 28/10/2026.
3. `drauzio@yopmail.com` (`DOCTOR`) — Criado em 28/10/2026.
4. `testlink@example.com` (`PATIENT`) — Criado em 28/10/2026.

Nenhum desses 4 usuários foi modificado, sobrescrito ou apagado.

### 4.3. Isolamento e Rastreabilidade dos Dados Sintéticos da Suíte E2E:
* Todos os usuários de teste criados pela automação utilizam o domínio reservado `@nefrohub.test` e o prefixo `e2e-*` com timestamp (ex.: `e2e-pat-1793282218320@nefrohub.test`).
* A limpeza segura implementada em `tests/e2e/helpers/supabase-admin.ts` filtra estritamente por e-mails contendo o tag sintético único da execução, protegendo os registros da instituição contra exclusões acidentais.
* As tentativas de deleção em cascata não autorizada são contidas pelas constraints de chave estrangeira `ON DELETE RESTRICT` do PostgreSQL em `clinical_records` e `documents`.

---

## 5. Limitações de Observabilidade e Próximos Passos

1. **Repositório Git:** A ausência de `.git` impede o uso de comandos como `git diff` e `git log`. Recomenda-se inicializar o repositório (`git init`) se o usuário desejar versionamento histórico local formal.
2. **Hardening de Trigger Remoto (SEC-01):** Migration local preparada em `docs/migrations/007_hardening_handle_new_auth_user.sql` e aguardando autorização do usuário para aplicação remota.

---

## 6. Auditoria de Execução da Fase 4 — Incremento 1

### 6.1. Política Institucional de Senhas (RF-009)
* **Regra Confirmada:** PRD Seção 15.1 exige no mínimo 12 caracteres e aceitação irrestrita de frases-senha com espaços.
* **Pontos de Validação Atualizados:**
  * `src/lib/validators/auth.ts`: `passwordPolicySchema` com `z.string().min(12)`.
  * `src/app/auth/actions.ts`: `updatePasswordAction` validando contra `passwordPolicySchema`.
  * `src/app/login/LoginForm.tsx`: Validação do formulário "Definir Nova Senha" exigindo >= 12 caracteres.
  * `src/app/auth/register/page.tsx`: Indicação visual de mínimo de 12 caracteres com frases-senha aceitas.
* **Testes:** 3 novos testes em `tests/phase3-1-authorization-search.test.mjs` cobrindo rejeição de 11 caracteres, aprovação de 12 caracteres e aprovação de frase-senha com 25 caracteres.

### 6.2. Autenticação Multifator MFA/TOTP (RF-007)
* **Arquitetura Implementada:** Supabase Auth MFA nativo (`@supabase/supabase-js` v2.106.0) sem bibliotecas externas desnecessárias.
* **Server Actions Seguras:** `src/app/auth/mfa-actions.ts` exporta `getMFAStatusAction`, `startMFAEnrollmentAction`, `verifyMFAEnrollmentAction`, `createMFAChallengeAction`, `verifyMFAChallengeAction`. Nenhuma credencial ou segredo TOTP é logado.
* **Guarda de Rotas (Proxy/Middleware):** `src/proxy.ts` inspeciona `aalData` em cookies; se `nextLevel === 'aal2'` e `currentLevel === 'aal1'`, bloqueia o acesso a `/admin` e `/doctor` e redireciona para `/login?mfa=true`.
* **Proteção em Server Actions:** `assertServerMFAAssurance` em `src/lib/security/mfa-guard.ts` garante que operações clínicas ou administrativas não possam ser executadas em sessões AAL1 quando AAL2 for exigido.
* **Testes:** 15 novos testes em `tests/phase4-1-mfa-totp-security.test.mjs`.

### 6.3. Cobertura Emergencial pelo Doctor Master (RF-004)
* **Regra Confirmada:** PRD Seção 2.4 e 15.3 definem que o papel de Doctor Master é para coordenação e cobertura excepcional, exigindo vínculo explícito e justificativa clínica auditável.
* **Implementação:**
  * Server Actions `assumeDoctorMasterCoverageAction` e `endDoctorMasterCoverageAction` em `src/app/doctor/actions.ts`.
  * Exigência de justificativa clínica detalhada com no mínimo 15 caracteres.
  * Validação no servidor de que o usuário possui `role === 'DOCTOR_MASTER'` ou `is_master === true`.
  * Inserção de evento auditável append-only imutável em `audit_events`.
  * Interface visual no painel médico com badge institucional e modal `Assumir Cobertura Emergencial`.
* **Testes:** 8 novos testes em `tests/phase4-4-doctor-master-coverage.test.mjs`.

### 6.4. Hardening contra Escalonamento de Privilégios (SEC-01)
* **Diagnóstico Confirmado:** O trigger original `handle_new_auth_user` aceitava `raw_user_meta_data->>'role'` como `ADMIN` ou `DOCTOR`, permitindo que um invasor usando a API pública anônima pudesse tentar se autopromover.
* **Migration Local Criada:** `docs/migrations/007_hardening_handle_new_auth_user.sql` foi gerada localmente (SEM aplicação no Supabase remoto).
* **Regra de Hardening:** Qualquer signup público sem convite formal (`NEW.invited_at IS NULL`) tem seu papel forçadamente fixado em `'PATIENT'`, restringindo papéis privilegiados para convites administrativos formais e conexões via `service_role`.
* **Testes:** Teste de simulação da regra de hardening implementado e aprovado em `tests/phase3-1-authorization-search.test.mjs`.

---

## 7. Auditoria de Execução da Fase 4 — Incremento 2

### 7.1. Gestão de Alergias com Triplo Estado de Informação (RF-054)
* **Regra Confirmada:** PRD Seção 8.6 exige que o sistema diferencie "alergia conhecida" (`KNOWN`), "nenhuma alergia conhecida" (`NO_KNOWN_ALLERGIES`) e "informação não disponível" (`UNREPORTED`), não interpretando a ausência de registro como ausência de alergia.
* **Tabela no Banco Remoto:** A tabela `public.allergies` já existia no Supabase com colunas `substance`, `reaction`, `severity`, `status` e RLS ativado.
* **Server Actions Seguras:** `src/app/doctor/allergyActions.ts` implementa `recordAllergyAction`, `recordNoKnownAllergiesAction` e `inactivateAllergyAction` com checagem Zero-Trust de vínculo e MFA guard.
* **Interfaces Médica e do Paciente:**
  * Componente médico `PatientAllergiesSection.tsx` integrado no prontuário longitudinal com badges de gravidade e modais de registro e declaração.
  * Componente do paciente `PatientClinicalSummary.tsx` integrado no dashboard com visualização somente leitura e alerta informativo de ausência de registro.
* **Testes:** 6 novos testes em `tests/phase4-5-allergies-and-hospitalizations.test.mjs`.

### 7.2. Histórico de Internações Hospitalares (RF-056)
* **Regra Confirmada:** PRD Seção 8.8 prevê o registro de instituição, datas de início/fim, motivo da internação, CID-10, desfecho clínico e observações.
* **Migration Local Preparada:** `docs/migrations/008_hospitalizations.sql` gerada localmente (SEM aplicação no Supabase remoto). Contém constraint de consistência (`discharge_date >= admission_date`), enum `hospitalization_outcome` e políticas de segurança RLS.
* **Testes:** 5 novos testes de validação clínica em `tests/phase4-5-allergies-and-hospitalizations.test.mjs`.
