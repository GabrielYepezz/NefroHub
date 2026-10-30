# NefroHub — Guia Oficial de Homologação Real em Staging (Fase 4.6)

**Data de Elaboração:** 28 de Outubro de 2026  
**Responsável:** Engenharia de Software, Governança e Segurança Clínica  
**Status da Integração:** Preparado para Homologação em Ambiente Isolado (Staging)

---

## 1. O que Foi Inspecionado

Conduzimos uma auditoria independente, sem presunções baseadas em relatórios prévios, cobrindo:
1. **Migrations 002 a 006**:
   - `002_lab_exams_and_calculation_runs_rpc.sql`: Assinatura de `rpc_record_lab_exam`, `SET search_path = public, pg_temp`, `SECURITY DEFINER`, cálculo atômico da equação CKD-EPI 2021 (NEJM) e inserção vinculada em `audit_events`.
   - `003_feedback_and_admin_queues.sql`: Coluna opcional `clinical_record_id` com chave estrangeira não-destrutiva, ativação de RLS e políticas de leitura de recusas e despacho de retificações restrito ao papel `ADMIN`.
   - `004_patient_representations_and_delegation.sql`: 4 RPCs de governança (`rpc_request_representation`, `rpc_approve_representation`, `rpc_reject_representation`, `rpc_revoke_representation`), bloqueio de auto-representação e RLS baseado no escopo e data de validade.
   - `005_clinical_documents_storage_and_curation.sql`: Tabela `documents`, constraints de tipo MIME (PDF/JPEG/PNG) e teto de 10 MiB, 2 RPCs de curadoria (`rpc_confirm_document`, `rpc_reject_document`) e RLS em `documents`.
   - `006_conditions_and_medications.sql`: Extensão de `conditions` e `medications`, coluna `is_prescription`, tabelas de histórico imutável `condition_events` e `medication_events`, e 4 RPCs com bloqueio otimista de versão (`p_expected_version`).
2. **Script de Verificação Estrutural**:
   - `docs/migrations/verify_migrations_001_to_006.sql`: Aprimorado para validar não apenas tabelas e RPCs, mas também colunas de concorrência (`version`), rastreabilidade e a ativação obrigatória de Row Level Security (RLS) em 13 tabelas clínicas.
3. **Server Actions e Schemas Zod**:
   - Confirmada a correspondência de 100% dos nomes e tipos de parâmetros entre Zod, Server Actions e as rotinas plpgsql.
   - Confirmada a erradicação de qualquer fallback que utilizasse chamadas REST soltas com a chave `service_role`.

---

## 2. O que Foi Efetivamente Executado

1. **Aprimoramento do Script de Validação Pós-Migração**:
   - `docs/migrations/verify_migrations_001_to_006.sql` atualizado com inspeção de RLS ativa (`pg_class.relrowsecurity`), índices e integridade de colunas versionadas.
2. **Criação da Suíte Executável para Staging**:
   - Criado `scripts/staging-integration-test-suite.mjs`, implementando a checagem dos 12 cenários de integração real (usuário anônimo, paciente titular, médico vinculado/não vinculado, representante com/sem escopo, admin, concorrência, atomicidade, storage e integridade).
   - O script possui trava de segurança: aborta imediatamente se apontado para o projeto ativo/produção, exigindo configuração explícita de `.env.staging`.
3. **Atualização da Matriz do MVP (`docs/mvp-feature-matrix.md`)**:
   - Inclusão da distinção formal de status: **Implementado no Código**, **Pendente em Staging**, **Homologado** e **Pronto para Produção**.
4. **Verificação Técnica Completa**:
   - `npx tsc --noEmit`: 0 erros de compilação TypeScript.
   - `npm test`: 76 testes aprovados em 33 suítes (0 falhas).
   - `npm run build`: 19 rotas compiladas e otimizadas em 18.6s (Turbopack).

---

## 3. O que Continua Pendente (Bloqueadores para Go-Live)

1. **Provisionamento do Projeto Supabase Isolado de Staging**:
   - O repositório possui apenas o projeto `iyukangioglvtgxirgcl` configurado. É obrigatório criar um projeto dedicado (ex.: `nefrohub-staging`) para a bateria de homologação sem dados de produção.
2. **Criação do Bucket Privado `clinical-documents`**:
   - O bucket deve ser criado no Storage do Staging com flag `Public bucket: Disabled`.
3. **Aplicação das Migrations 002 a 006 em Staging**:
   - Execução sequencial no SQL Editor do projeto de Staging e verificação via `verify_migrations_001_to_006.sql`.
4. **Execução dos Testes Reais em Staging com Múltiplos Papéis**:
   - Rodar `node scripts/staging-integration-test-suite.mjs` com as credenciais do ambiente de staging.
5. **Ratificação Médica Formal**:
   - Homologação clínica formal dos limites numéricos de sinais vitais e da política de retroatividade de comorbidades pregressas.

---

## 4. Testes Reais vs. Testes Simulados

| Escopo do Teste | Tipo Comprovado | Onde Foi Executado | Resultado Real | Evidência Técnica |
| :--- | :--- | :--- | :--- | :--- |
| **RLS Deny-by-Default (Anon)** | **Integração Real (PostgREST)** | Supabase Remoto Ativo | **PASS** (100% barrado) | Tentativa de `insert` anônimo em `clinical_records` e `audit_events` rejeitada com HTTP 401/403. |
| **Regras Clínicas de PA** | Unitário / Domínio | Local (Node.js) | **PASS** (100%) | Rejeição de pressão sistólica desacompanhada da diastólica. |
| **Equação CKD-EPI 2021** | Matemático / Clínico | Local (Node.js) | **PASS** (100%) | 4 casos KDIGO de referência do NEJM validados com exatidão decimal. |
| **Concorrência Otimista** | Simulação em Memória | Local (Node.js) | **PASS** (100%) | Conflito de versão detectado e segunda gravação rejeitada. |
| **Assinatura de Arquivos (Magic Bytes)** | Unitário de Segurança | Local (Node.js) | **PASS** (100%) | Detecção binária exata de PDF, JPEG e PNG; rejeição de executáveis renomeados. |
| **Isolamento de Cuidadores** | Simulação em Memória | Local (Node.js) | **PASS** (100%) | Bloqueio de cuidadores sem aprovação da Fila 2 ou sem flag de leitura. |
| **RPCs das Migrations 002 a 006** | **PENDENTE DE STAGING** | Ambiente Isolado (a criar) | **NÃO EXECUTADO REMOTAMENTE** | Bloqueado aguardando provisionamento de projeto de staging. |

---

## 5. Riscos Técnicos e Estratégia de Mitigação

1. **Risco de Execução Direta no Banco Ativo:**
   - *Mitigação:* A suíte de homologação foi configurada para barrar execuções sem o arquivo `.env.staging` explicitamente configurado.
2. **Risco de Rollback Destrutivo:**
   - *Mitigação:* Proibição estrita de comandos `DROP TABLE CASCADE` ou `DROP COLUMN`. Caso ocorra qualquer falha pós-migração, a estratégia oficial é `REVOKE EXECUTE` nas funções defeituosas e aplicação de *patch* corretivo (*roll-forward*).
3. **Risco de Arquivos Órfãos no Storage:**
   - *Mitigação:* Compensação reversa na Server Action `uploadDocumentAction`, que apaga o arquivo do Storage caso a gravação do registro clínico correspondente não seja concluída com sucesso.

---

## 6. Procedimento Passo a Passo para a Homologação em Staging

### Passo 1: Criar o Projeto de Staging no Supabase
1. Acesse o painel do Supabase e crie o projeto `nefrohub-staging`.
2. No menu *Project Settings > API*, colete a URL, a Anon Key e a Service Role Key.
3. No menu *Storage*, crie o bucket `clinical-documents` com visibilidade privada (`Public bucket: Disabled`).

### Passo 2: Configurar o Arquivo `.env.staging` no Repositório
Crie o arquivo `nefrohub-web/.env.staging` (não versionado no Git) com o formato:
```env
NEXT_PUBLIC_SUPABASE_URL=https://<staging-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-key>
ENCRYPTION_SECRET=staging-secret-key-32-chars-length
```

### Passo 3: Aplicar as Migrations no SQL Editor do Staging
No SQL Editor do projeto de staging, execute os scripts na ordem:
1. `docs/schema.sql` (schema estrutural base)
2. `docs/migrations/001_security_rls_and_atomic_rpc.sql`
3. `docs/migrations/002_lab_exams_and_calculation_runs_rpc.sql`
4. `docs/migrations/003_feedback_and_admin_queues.sql`
5. `docs/migrations/004_patient_representations_and_delegation.sql`
6. `docs/migrations/005_clinical_documents_storage_and_curation.sql`
7. `docs/migrations/006_conditions_and_medications.sql`

### Passo 4: Validar a Estrutura do Banco
No SQL Editor do Staging, execute o script:
```sql
docs/migrations/verify_migrations_001_to_006.sql
```
Certifique-se de que o retorno seja: `SUCESSO: Todos os objetos e políticas RLS das migrations 001 a 006 estão presentes, íntegros e protegidos!`.

### Passo 5: Executar os Testes Reais Automatizados
No terminal local, execute:
```bash
node scripts/staging-integration-test-suite.mjs
```
Todos os 12 cenários devem retornar `[PASS]`.
