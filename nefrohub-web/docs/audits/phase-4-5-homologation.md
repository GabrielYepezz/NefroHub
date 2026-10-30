# NefroHub — Preparação e Homologação Controlada do Supabase (Fase 4.5)

**Data da Auditoria e Planejamento:** 28 de Outubro de 2026  
**Responsável Técnico:** Engenharia de Software e Segurança Clínica  
**Escopo:** Revisão de segurança e idempotência das Migrations 002 a 006, mitigação de riscos de rollback destrutivo (`CASCADE`), análise de ambientes, requisitos de Storage privado e roteiro de homologação integrada.

---

## 1. Revisão de Segurança das Migrations (002 a 006)

Realizamos uma análise linha a linha das migrations versionadas localmente, avaliando permissões, `search_path`, idempotência, integridade referencial e correspondência de assinaturas com as chamadas das Server Actions.

### 1.1. Migration 002 (`002_lab_exams_and_calculation_runs_rpc.sql`)
- **Objetos Criados:** Função PostgreSQL `public.rpc_record_lab_exam`.
- **Assinatura vs. Server Action:**
  - SQL: `rpc_record_lab_exam(p_patient_id UUID, p_exam_name TEXT, p_numeric_value NUMERIC, p_original_unit TEXT, p_clinical_date DATE, p_calculate_egfr BOOLEAN)`
  - Action (`src/app/doctor/actions.ts`): Invoca os mesmos 6 parâmetros com identificadores exatos.
- **Segurança da Função:**
  - `SECURITY DEFINER` com `SET search_path = public, pg_temp` (protegida contra sequestro de esquema).
  - Verificação estrita de sessão (`auth.uid() IS NOT NULL`).
  - Verificação Zero-Trust de vínculo médico ativo (`physician_patient_links.status = 'ACTIVE'`).
  - Validação clínica: Bloqueio de exames com datas futuras e valores numéricos `<= 0`.
- **Atomicidade (ACID):** Criação de `clinical_records`, `lab_results`, cálculo de TFGe, `calculation_runs` e evento obrigatório em `audit_events` executados na **mesma transação PostgreSQL**. Se a auditoria falhar, todo o lançamento sofre rollback automático.
- **Privilégios:** `REVOKE ALL ON FUNCTION ... FROM PUBLIC` seguido de `GRANT EXECUTE ... TO authenticated`. Usuários anônimos são barrados.

### 1.2. Migration 003 (`003_feedback_and_admin_queues.sql`)
- **Objetos Criados/Alterados:**
  - Coluna `clinical_record_id UUID REFERENCES clinical_records(id) ON DELETE SET NULL` na tabela `rejected_submission_events`.
  - Habilitação de RLS em `rejected_submission_events` e `review_requests`.
  - Políticas de `SELECT` para paciente titular ler suas próprias recusas.
  - Políticas de `UPDATE` restritas exclusivamente ao papel `ADMIN` para despacho de solicitações de retificação.
- **Idempotência:** Bloco `DO $$` com tratamento de exceção `undefined_table`, `ADD COLUMN IF NOT EXISTS` e `DROP POLICY IF EXISTS`.
- **Risco de Segurança:** Nulo. Não concede permissões públicas e blinda as tabelas com RLS.

### 1.3. Migration 004 (`004_patient_representations_and_delegation.sql`)
- **Objetos Criados/Alterados:**
  - Habilitação de RLS em `patient_representations`.
  - Políticas RLS: Titular visualiza seus representantes; representante autenticado visualiza seus vínculos; inserção pelo paciente nasce estritamente em `status = 'PENDING'`.
  - 4 RPCs de Governança:
    - `rpc_request_representation`: Bloqueia auto-representação e vínculos duplicados.
    - `rpc_approve_representation`: Exclusiva para papel `ADMIN`, com bloqueio otimista contra concorrência (`WHERE status = 'PENDING'`).
    - `rpc_reject_representation`: Exclusiva para papel `ADMIN`, com justificativa obrigatória.
    - `rpc_revoke_representation`: Permitida ao paciente titular ou administrador, atualizando para `ENDED`.
- **Assinaturas vs. Server Actions:**
  - Compatibilidade de 100% com `representationActions.ts` e `admin/filas/actions.ts`.
- **Atomicidade e Rastreabilidade:** Cada RPC grava a alteração de estado e o evento correspondente em `audit_events` na mesma transação.
- **Privilégios:** Todas as 4 funções revogam acesso de `PUBLIC` e concedem apenas a `authenticated`.

### 1.4. Migration 005 (`005_clinical_documents_storage_and_curation.sql`)
- **Objetos Criados:**
  - Tabela `public.documents` com constraints rigorosas de integridade:
    - `chk_document_mime`: Aceita exclusivamente `application/pdf`, `image/jpeg` e `image/png`.
    - `chk_document_size`: Limite de 10 MiB (`10485760` bytes).
    - `chk_document_status`: `PENDING`, `CONFIRMED`, `REJECTED`.
  - Políticas RLS em `documents`: Paciente envia exclusivamente como `PENDING`; médico assistente ativo ou admin homologam/rejeitam.
  - 2 RPCs: `rpc_confirm_document` e `rpc_reject_document` (com justificativa clínica e bloqueio otimista).
- **Assinaturas vs. Server Actions:** Assinaturas idênticas às chamadas em `documentActions.ts`.
- **Dependência de Storage:** Requer a existência prévia do bucket privado `clinical-documents`.

### 1.5. Migration 006 (`006_conditions_and_medications.sql`)
- **Objetos Criados:**
  - Extensão estrutural em `conditions` e `medications` (`clinical_record_id`, `created_by_user_id`, `validation_status`, `version`, `updated_at`).
  - Distinção legal explícita: Coluna `is_prescription BOOLEAN DEFAULT FALSE` em `medications`, diferenciando histórico informado de prescrição eletrônica.
  - Criação das tabelas de histórico imutável: `condition_events` e `medication_events`.
  - 4 RPCs com controle de concorrência otimista via versões (`p_expected_version`):
    - `rpc_record_condition`, `rpc_update_condition_status`
    - `rpc_record_medication`, `rpc_update_medication_status`
- **Validação de Concorrência:** Rejeita sobrescrita silenciosa (`v_current_version <> p_expected_version`), forçando recarregamento prévio.
- **Atomicidade:** Inserção do registro clínico, estado da condição/medicamento, evento de histórico e auditoria na mesma transação.

---

## 2. Revisão Crítica do Plano de Rollback

Na auditoria da Fase 4.4, identificou-se o risco de comandos simplificados de rollback como `DROP TABLE ... CASCADE` ou `DROP COLUMN`. Em sistemas clínicos de saúde, comandos destrutivos automáticos são inaceitáveis pois eliminam prontuários e referências legais.

### 2.1. Diretrizes de Rollback Seguro
1. **Proibição de `DROP TABLE ... CASCADE`:** Caso uma migration apresente problema após a aplicação, **a tabela não deve ser excluída em cascata**, pois pode conter dados já inseridos durante o teste ou chaves estrangeiras vinculadas a `patient_profiles`.
2. **Preferência por Roll-Forward e Correção Compensatória:** Erros de lógica em RPCs devem ser corrigidos aplicando uma nova versão com `CREATE OR REPLACE FUNCTION`.
3. **Revogação Temporária de Execução:** Se uma RPC apresentar vulnerabilidade, o procedimento de mitigação imediata é revogar sua permissão (`REVOKE EXECUTE ON FUNCTION ... FROM authenticated`), mantendo o banco íntegro enquanto o patch é elaborado.
4. **Preservação de Colunas:** Colunas adicionadas com `ADD COLUMN IF NOT EXISTS` não devem ser removidas com `DROP COLUMN` em rollback de emergência, pois são `NULLABLE` ou possuem default, não quebrando o código legado.

### 2.2. Matriz de Risco de Rollback e Procedimento Compensatório

| Migration | Rollback Destrutivo (NÃO RECOMENDADO) | Risco do Rollback Destrutivo | Procedimento Seguro de Recuperação / Compensação |
| :--- | :--- | :--- | :--- |
| **002** | `DROP FUNCTION rpc_record_lab_exam;` | Médio: Indisponibiliza o lançamento de exames para os médicos. | `REVOKE EXECUTE ON FUNCTION public.rpc_record_lab_exam FROM authenticated;` e aplicação de patch corretivo na função. |
| **003** | `ALTER TABLE ... DROP COLUMN clinical_record_id;` | **Alto:** Perda de rastreabilidade de vínculos entre descarte e prontuário. | Manter a coluna (é opcional com `NULL`); ajustar apenas a policy RLS defeituosa com `DROP POLICY / CREATE POLICY`. |
| **004** | `DROP FUNCTION rpc_approve_...; DROP POLICY ...;` | Médio: Bloqueia a esteira de cuidadores. | Desativar temporariamente os privilégios das RPCs afetadas enquanto a correção é testada. |
| **005** | `DROP TABLE documents CASCADE;` | **CRÍTICO:** Perda permanente de metadados de laudos e quebra de integridade referencial com pacientes. | **Nunca executar `DROP TABLE`**. Desativar uploads na interface; revogar permissões de insert na tabela `documents`; manter os metadados preservados. |
| **006** | `DROP TABLE condition_events CASCADE;` | **CRÍTICO:** Perda do histórico longitudinal de condutas clínicas e alterações de dosagem. | Manter as tabelas de eventos. Em caso de inconsistência em RPC, aplicar correção de versão via `CREATE OR REPLACE FUNCTION`. |

---

## 3. Avaliação da Infraestrutura de Ambientes

- **Projeto Supabase Configurado:** `https://iyukangioglvtgxirgcl.supabase.co` (único projeto configurado no arquivo `.env.local`).
- **Diagnóstico de Ambientes:**
  - Não existe um segundo projeto Supabase configurado como ambiente isolado de *staging* ou homologação.
  - O projeto atual funciona como ambiente central de desenvolvimento e testes.
- **Política de Segurança Operacional:**
  - Conforme os mandatos éticos e operacionais do projeto, **não serão executados testes destrutivos nem modificações no banco remoto sem autorização explícita e formal**.
  - A aplicação das migrations 002 a 006 deve ser realizada em uma janela controlada pelo operador técnico via painel oficial do Supabase.

---

## 4. Ordem de Aplicação Comprovada e Roteiro de Execução

### 4.1. Sequência Técnica Justificada
```
Ordem de Execução:
1. Migration 002 (002_lab_exams_and_calculation_runs_rpc.sql)
2. Migration 003 (003_feedback_and_admin_queues.sql)
3. Migration 004 (004_patient_representations_and_delegation.sql)
4. Migration 005 (005_clinical_documents_storage_and_curation.sql)  --> Requer Bucket Privado
5. Migration 006 (006_conditions_and_medications.sql)
```

**Justificativa de Dependências:**
- `002` e `003` atuam sobre tabelas base existentes desde a Migration 001 (`clinical_records`, `lab_results`, `rejected_submission_events`).
- `004` ativa RLS e RPCs na tabela `patient_representations`.
- `005` possui políticas RLS que verificam explicitamente `patient_representations.scope->>'can_upload_documents'`, devendo rodar **após** a `004`.
- `006` possui políticas RLS que verificam `patient_representations.scope->>'can_view_records'`, devendo rodar **após** a `004`.

### 4.2. Roteiro de Aplicação no SQL Editor do Supabase
1. **Passo 1 — Backup / Snapshot:** Gerar ponto de restauração no painel Supabase (*Database > Backups*).
2. **Passo 2 — Criação do Bucket:** Criar o bucket `clinical-documents` no Supabase Storage com configuração privada.
3. **Passo 3 — Execução Sequencial:** Executar os scripts `002`, `003`, `004`, `005` e `006` em ordem sequencial no SQL Editor.
4. **Passo 4 — Validação Automatizada:** Executar o script `docs/migrations/verify_migrations_001_to_006.sql` no SQL Editor. Se algum objeto estiver ausente, o script lançará uma exceção identificando o item faltante.

---

## 5. Storage Privado e Governança Documental

### 5.1. Configurações Mandatórias do Bucket `clinical-documents`
- **Nome do Bucket:** `clinical-documents`
- **Visibilidade:** Privado (`public: false`). Qualquer acesso anônimo direto à URL pública do arquivo é rejeitado pelo Supabase Storage.
- **Tamanho Máximo por Arquivo:** 10 MiB (10.485.760 bytes).
- **Formatos Permitidos:** `application/pdf`, `image/jpeg`, `image/png`.

### 5.2. Emissão de URLs Assinadas e Proteção Zero-Trust
- O cliente nunca obtém links estáticos de arquivos.
- A visualização ocorre exclusivamente através da Server Action `getDocumentSignedUrlAction`, que valida no servidor:
  1. Autenticação ativa do usuário.
  2. Titularidade do prontuário (paciente titular).
  3. Ou vínculo médico ativo (`physician_patient_links.status = 'ACTIVE'`).
  4. Ou procuração de representação homologada e vigente com escopo `can_view_records = true`.
- A URL assinada é gerada com tempo de expiração fixo de **900 segundos (15 minutos)**.
- Cada emissão de URL assinada gera um registro rastreável na tabela `audit_events`.

### 5.3. Prevenção de Arquivos Órfãos
- Na Server Action `uploadDocumentAction`, caso ocorra qualquer erro na gravação dos metadados na tabela `public.documents` após o upload no Storage, uma rotina de compensação automática remove imediatamente o arquivo do Storage (`storage.remove`), prevenindo o acúmulo de arquivos órfãos sem autoria médica.

---

## 6. Matriz de Testes (Classificação por Metodologia)

| Suíte de Testes | Metodologia | Ambiente de Execução | O que Valida | O que NÃO Valida |
| :--- | :--- | :--- | :--- | :--- |
| `phase1-2-functional-integration.test.mjs` | **Integração Real (PostgREST)** | Supabase Remoto (`iyukangioglvtgxirgcl`) | Políticas RLS da Migration 001 rejeitando acesso anônimo a `clinical_records` e `audit_events`. | Chamadas autenticadas de migrations ainda não aplicadas (002-006). |
| `phase1-clinical-integrity.test.mjs` | Análise Estática / AST | Local | Ausência de funcionalidades fora do MVP; contratos de schema e nomenclatura de Server Actions. | Comportamento em tempo de execução sob latência. |
| `phase3-1-authorization-search.test.mjs` | Unitário | Local | Impossibilidade de autoatribuição de perfis administrativos; bloqueio de usuários com conta suspensa. | Concorrência de banco de dados. |
| `phase3-2-ckd-epi-lab-exams.test.mjs` | Unitário / Clínico | Local | Precisão matemática da equação race-free CKD-EPI 2021 frente a casos oficiais do NEJM. | Execução da função plpgsql no PostgreSQL. |
| `phase3-3-feedback-queues.test.mjs` | Domínio / Mocks | Local | Códigos amigáveis de descarte e bloqueio de despacho por usuários sem papel ADMIN. | Transações reais no banco. |
| `phase4-1-patient-representations.test.mjs` | Simulação Transacional | Local | Estados de representação (`PENDING` por padrão), bloqueio de auto-representação e acesso por escopo. | RPC plpgsql remota. |
| `phase4-2-clinical-documents.test.mjs` | Unitário de Segurança | Local | Assinaturas binárias (magic bytes), hashing SHA-256, proteção contra directory traversal e expiração de 15 min. | Storage remoto. |
| `phase4-3-conditions-and-medications.test.mjs` | Integração em Memória | Local | 13 cenários obrigatórios de isolamento de prontuário, bloqueio otimista de versão e histórico imutável. | Persistência remota da Migration 006. |

---

## 7. Critérios de Aprovação e Pendências para Go-Live

### 7.1. Critérios Técnicos Aprovados Localmente
- **TypeScript:** 0 erros de compilação em todo o repositório (`npx tsc --noEmit`).
- **Suíte de Testes Automatizados:** 76 testes aprovados em 33 suítes (0 falhas).
- **Build de Produção:** Next.js compilado com sucesso em 9.1s (Turbopack, 19 rotas).
- **Saneamento de Fallbacks:** 100% dos fallbacks não-atômicos foram eliminados; Server Actions operam em modo estrito.

### 7.2. Pendências Operacionais que Dependem de Ação Humana
1. **Provisionamento do Bucket:** Criar o bucket privado `clinical-documents` no painel Supabase Storage.
2. **Execução das Migrations 002 a 006:** Executar o lote de migrations no SQL Editor do Supabase remoto e rodar o script de verificação `verify_migrations_001_to_006.sql`.
3. **Ratificação Médica Formal:** Homologação clínica formal pelo responsável técnico dos limites numéricos de plausibilidade e teto de retroatividade de comorbidades pregressas.
