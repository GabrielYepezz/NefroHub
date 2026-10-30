# NefroHub — Auditoria Técnica de Integração e Homologação (Fase 4.4)

**Data da Auditoria:** 28 de Outubro de 2026  
**Responsável:** Engenharia de Software e Segurança Clínica  
**Escopo:** Auditoria de integridade das Fases 1 a 4.3, inspeção de estado do PostgreSQL/Supabase remoto, saneamento de Server Actions com `service_role` e matriz de compatibilidade das Migrations 001 a 006.

---

## 1. Sumário Executivo

Durante a Fase 4.4, realizamos uma inspeção técnica aprofundada da infraestrutura e código da plataforma NefroHub. O objetivo primário foi auditar o alinhamento entre o código Next.js, as Server Actions, as políticas RLS, as RPCs PostgreSQL transacionais e o estado **real** do banco de dados remoto no Supabase.

### Principais Conclusões
1. **Estado do Banco Remoto:** Apenas a **Migration 001** (`001_security_rls_and_atomic_rpc.sql`) está efetivamente aplicada no Supabase remoto. As migrations `002`, `003`, `004`, `005` e `006` permanecem versionadas exclusivamente no repositório local.
2. **Saneamento de Fallbacks:** Identificamos e removemos padrões de "fallback silencioso" nas Server Actions que tentavam simular atomicidade executando múltiplas chamadas REST com a chave `service_role`. Agora, quando uma RPC transacional necessária não está instalada ou falha, o sistema retorna um **erro controlado e explicitamente identificável**, preservando a integridade do prontuário contra persistências parciais órfãs.
3. **Storage:** O bucket privado `clinical-documents` ainda não foi provisionado no Supabase remoto, configurando um bloqueio para uploads reais em homologação.
4. **Governança Clínica:** O sistema mantém estrita separação entre histórico clínico informado e prescrição formal, além de respeitar imutabilidade e controle de concorrência otimista.

---

## 2. Achados da Auditoria Classificados por Severidade

### [CRÍTICO] SEC-01: Simulação Não-Atômica de Transações via REST (`service_role`)
- **Evidência:** As Server Actions `recordLabExamAction`, `recordConditionAction` e `recordMedicationAction` continham rotinas de fallback que, na ausência das RPCs correspondentes, realizavam inserções sequenciais e independentes via REST nas tabelas `clinical_records`, `lab_results`, `conditions`, `medications` e `audit_events`.
- **Risco:** Em caso de oscilação de rede ou queda do runtime no meio das operações REST, o prontuário ficava em estado inconsistente (ex.: registro clínico criado sem resultado de exame associado, ou registro criado sem a respectiva linha obrigatória de auditoria).
- **Ação Executada na Fase 4.4:** **Todos os fallbacks não-atômicos foram eliminados**. As Server Actions agora exigem estritamente a execução da RPC transacional ACID no PostgreSQL. Se a RPC não existir (`PGRST202`), o sistema rejeita a operação com erro controlado informando a dependência da migration correspondente.

### [ALTO] INFRA-01: Ausência das Migrations 002 a 006 no Banco Remoto
- **Evidência:** Consulta real executada via PostgREST na Fase 4.4 confirmou:
  - Tabela `documents`: Inexistente (`PGRST205`).
  - Tabelas de histórico `condition_events` e `medication_events`: Inexistentes (`PGRST205`).
  - RPCs `rpc_record_lab_exam`, `rpc_request_representation`, `rpc_approve_representation`, `rpc_revoke_representation`, `rpc_confirm_document`, `rpc_reject_document`, `rpc_record_condition`, `rpc_update_condition_status`, `rpc_record_medication`, `rpc_update_medication_status`: Inexistentes no schema cache (`PGRST202`).
- **Risco:** Falha operacional em qualquer teste que tente gravar exames, documentos, representações ou comorbidades diretamente no ambiente Supabase remoto.
- **Recomendação:** Execução controlada e sequencial das migrations 002 a 006 no SQL Editor do Supabase remoto durante a janela de homologação.

### [ALTO] STOR-01: Bucket Privado `clinical-documents` Não Provisionado
- **Evidência:** A chamada `supabase.storage.listBuckets()` retornou `buckets: []`.
- **Risco:** Tentativas de upload de laudos falham no Storage antes de atingir o banco de dados.
- **Recomendação:** Provisionar o bucket `clinical-documents` com flag `public = false` e aplicar as políticas de acesso do schema `storage.objects` definidas na Migration 005.

### [MÉDIO] CLI-01: Definição de Prazos de Retroatividade e Catálogo de Alergias
- **Evidência:** O PRD define campos para início de comorbidades e medicamentos, mas não estipula teto de retroatividade clínica para diagnósticos pregressos. A tabela `allergies` existe no schema base, mas ainda não possui interface dedicada de UI.
- **Risco:** Inconsistência de interpretação clínica entre diferentes profissionais de saúde.
- **Recomendação:** Submeter à ratificação da equipe médica nefrologista antes da liberação do piloto clínico.

---

## 3. Matriz de Compatibilidade das Migrations (001 a 006)

| Migration | Arquivo | Estado no Supabase Remoto | Dependências | Objetos Criados / Alterados | Compatibilidade & Idempotência |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **001** | `001_security_rls_and_atomic_rpc.sql` | **APLICADA** | Schema base | RLS em 22 tabelas; RPCs `rpc_submit_patient_vitals`, `rpc_confirm_clinical_record`, `rpc_reject_clinical_record`. | **100% Compatível.** Confirmada em produção/remoto com negação por padrão. |
| **002** | `002_lab_exams_and_calculation_runs_rpc.sql` | **PENDENTE** | 001 | RPC `rpc_record_lab_exam` (persistência atômica de exames e eTFG). | **Totalmente Compatível.** Idempotente (`CREATE OR REPLACE FUNCTION`). Reutiliza tabelas já existentes remotamente. |
| **003** | `003_feedback_and_admin_queues.sql` | **PENDENTE** | 001 | Coluna `clinical_record_id` em `rejected_submission_events`; RLS em `rejected_submission_events` e `review_requests`. | **Compatível.** Utiliza `ADD COLUMN IF NOT EXISTS` e `DROP POLICY IF EXISTS`. Não gera perda de dados. |
| **004** | `004_patient_representations_and_delegation.sql` | **PENDENTE** | 001, 003 | RLS em `patient_representations`; 4 RPCs de governança (`rpc_request_representation`, `rpc_approve_representation`, etc.). | **Compatível.** Tabela base `patient_representations` já existe no remoto. Idempotente. |
| **005** | `005_clinical_documents_storage_and_curation.sql` | **PENDENTE** | 001, 004 | Tabela `documents`, RLS, 2 RPCs (`rpc_confirm_document`, `rpc_reject_document`) e RLS no Storage. | **Requer Pré-requisito:** O bucket `clinical-documents` deve ser criado no Supabase Storage antes de habilitar as policies de storage. |
| **006** | `006_conditions_and_medications.sql` | **PENDENTE** | 001 | Colunas em `conditions` e `medications`; Tabelas `condition_events` e `medication_events`; 4 RPCs de governança com bloqueio otimista. | **Totalmente Compatível.** Idempotente. Não quebra dados legados; adiciona rastreabilidade imutável de condutas. |

---

## 4. Plano de Aplicação Controlada, Dependências e Rollback

### 4.1. Pré-condições Obrigatórias
1. Backup snapshot completo do banco de dados no painel Supabase.
2. Criação manual do bucket privado `clinical-documents` no painel Supabase Storage (`Public bucket: Disabled`).
3. Janela de manutenção comunicada e com tráfego externo pausado.

### 4.2. Sequência de Execução no SQL Editor do Supabase
```
Ordem de Aplicação:
1. Migration 002 (002_lab_exams_and_calculation_runs_rpc.sql)
2. Migration 003 (003_feedback_and_admin_queues.sql)
3. Migration 004 (004_patient_representations_and_delegation.sql)
4. Migration 005 (005_clinical_documents_storage_and_curation.sql)
5. Migration 006 (006_conditions_and_medications.sql)
```

### 4.3. Estratégia de Rollback por Migration
- **Rollback 002:**
  ```sql
  DROP FUNCTION IF EXISTS public.rpc_record_lab_exam(UUID, TEXT, NUMERIC, TEXT, DATE, BOOLEAN);
  ```
- **Rollback 003:**
  ```sql
  DROP POLICY IF EXISTS "patient_read_own_rejections" ON public.rejected_submission_events;
  DROP POLICY IF EXISTS "admin_manage_review_requests" ON public.review_requests;
  ALTER TABLE public.rejected_submission_events DROP COLUMN IF EXISTS clinical_record_id;
  ```
- **Rollback 004:**
  ```sql
  DROP FUNCTION IF EXISTS public.rpc_request_representation(TEXT, TEXT, TEXT, TEXT, DATE);
  DROP FUNCTION IF EXISTS public.rpc_approve_representation(UUID);
  DROP FUNCTION IF EXISTS public.rpc_reject_representation(UUID, TEXT);
  DROP FUNCTION IF EXISTS public.rpc_revoke_representation(UUID, TEXT);
  DROP POLICY IF EXISTS "patient_representations_select" ON public.patient_representations;
  ```
- **Rollback 005:**
  ```sql
  DROP FUNCTION IF EXISTS public.rpc_confirm_document(UUID);
  DROP FUNCTION IF EXISTS public.rpc_reject_document(UUID, TEXT);
  DROP TABLE IF EXISTS public.documents CASCADE;
  ```
- **Rollback 006:**
  ```sql
  DROP FUNCTION IF EXISTS public.rpc_record_condition(UUID, TEXT, TEXT, DATE, TEXT, TEXT);
  DROP FUNCTION IF EXISTS public.rpc_update_condition_status(UUID, TEXT, TEXT, INT);
  DROP FUNCTION IF EXISTS public.rpc_record_medication(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, DATE, TEXT, BOOLEAN, TEXT);
  DROP FUNCTION IF EXISTS public.rpc_update_medication_status(UUID, TEXT, TEXT, DATE, INT);
  DROP TABLE IF EXISTS public.condition_events CASCADE;
  DROP TABLE IF EXISTS public.medication_events CASCADE;
  ```

---

## 5. Matriz de Testes: Mocks vs. Testes Reais de Banco de Dados

| Categoria de Teste | Suíte / Arquivo | Tipo de Execução | Ambiente | O que Comprova | Limitações |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Integridade Clínica & Regras** | `phase1-2-functional-integration.test.mjs` | Teste Unitário / Lógica | Local (Node.js) | Co-dependência de PA, bloqueio otimista, códigos padronizados de rejeição. | Não avalia latência de rede. |
| **Segurança & PostgREST Anon** | `phase1-2-functional-integration.test.mjs` | **Integração Real (PostgREST)** | Supabase Remoto | RLS deny-by-default para chave pública anônima em `clinical_records` e `audit_events`. | Testa apenas o papel anônimo via REST. |
| **Anti-Regressão Estrutural** | `phase1-clinical-integrity.test.mjs` | Análise Estática / AST | Local | Ausência de rotas e alertas manuais fora do MVP; contratos de schema. | Não valida comportamento em runtime. |
| **Autorização & Busca Clínica** | `phase3-1-authorization-search.test.mjs` | Unitário / Contrato | Local | Prevenção de autoatribuição de privilégios; bloqueio de suspensos; debounce. | Mocks de banco de dados. |
| **Calculadora CKD-EPI 2021** | `phase3-2-ckd-epi-lab-exams.test.mjs` | Unitário / Matemático | Local | Exatidão matemática da equação NEJM 2021 contra 4 casos padrão KDIGO. | Não testa gatilho SQL no banco. |
| **Feedback de Rejeição & Filas** | `phase3-3-feedback-queues.test.mjs` | Lógica de Domínio | Local | Concorrência otimista nas filas; códigos amigáveis ao paciente. | Em memória. |
| **Representantes Legais** | `phase4-1-patient-representations.test.mjs` | Simulação Transacional | Local | Estados de solicitação, proibição de auto-representação, delegação de escopo. | RPC simulada em memória. |
| **Documentos Clínicos & Storage** | `phase4-2-clinical-documents.test.mjs` | Unitário de Segurança | Local | Magic bytes (PDF/JPG/PNG), hashing SHA-256, sanitização contra Path Traversal, expiração de 15 min. | Storage real remoto não provisionado. |
| **Comorbidades & Medicamentos** | `phase4-3-conditions-and-medications.test.mjs` | Integração em Memória | Local | 13 cenários obrigatórios de isolamento Zero-Trust, concorrência otimista e histórico imutável. | Aguarda aplicação da Migration 006 no remoto. |

---

## 6. Lista de Bloqueios para Homologação e Produção

1. **Bloqueador Remoto 1: Execução das Migrations 002 a 006 no Supabase:**
   - As RPCs e tabelas estruturais não existem no banco de dados ativo. Enquanto não forem executadas, as ações de exames, representação, documentos e comorbidades retornarão erros controlados de integridade transacional.
2. **Bloqueador Remoto 2: Criação do Bucket Privado `clinical-documents`:**
   - O armazenamento de laudos depende da existência do bucket privado no Supabase Storage.
3. **Bloqueador Clínico 3: Ratificação Nefrológica de Regras:**
   - Homologação formal dos limites de plausibilidade de sinais vitais e da política de retroatividade de início de comorbidades.
4. **Bloqueador Administrativo 4: Teste de Despacho das Filas com Dados Homologados:**
   - Validação humana do fluxo completo de homologação de médico, vínculo primário e cuidador.

---

## 7. Registro de Verificação Técnica Local

- **TypeScript (`npx tsc --noEmit`):** 0 erros.
- **Suíte de Testes (`npm test`):** 76 testes aprovados em 33 suítes (0 falhas).
- **Compilação de Produção (`npm run build`):** 19 rotas geradas com sucesso (Turbopack).
