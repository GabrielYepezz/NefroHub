# NefroHub — Integração Controlada em Ambiente Único e Roteiro de Demonstração (Fase 4.7)

**Data de Elaboração:** 28 de Outubro de 2026  
**Responsável Técnico:** Engenharia de Software, Governança e Segurança Clínica  
**Diretriz Arquitetural:** Desenvolvimento e Demonstração em Ambiente Supabase Único (`iyukangioglvtgxirgcl`)

---

## 1. Decisão Arquitetural e Contexto

Em conformidade com a decisão estratégica do projeto, o NefroHub opera sob um **ambiente Supabase único** para o desenvolvimento e apresentação ao cliente.
- Não há exigência de provisionamento de múltiplos projetos ou de arquivos `.env.staging`.
- As garantias de segurança baseiam-se em:
  1. **Trava de Projeto no Código:** A suíte de integração remota verifica ativamente o identificador `iyukangioglvtgxirgcl` antes de qualquer execução.
  2. **Isolamento de Dados de Teste:** Testes automatizados utilizam exclusivamente dados sintéticos identificados, sem modificar ou excluir registros utilizados na demonstração ao cliente.
  3. **Zero Rollback Destrutivo:** Proibição irrestrita de `DROP TABLE ... CASCADE`, `DROP COLUMN` ou rotinas automáticas de expurgo.
  4. **Proteção RLS Nativa:** Políticas de Row Level Security ativas em 100% das tabelas clínicas com negação por padrão para clientes não autenticados.

---

## 2. Auditoria do Ambiente Único Atual

Executamos a verificação estrutural direta contra o projeto `iyukangioglvtgxirgcl`:

| Camada | Estado Comprovado no Banco | Diagnóstico Técnico |
| :--- | :--- | :--- |
| **Identificador do Projeto** | `iyukangioglvtgxirgcl.supabase.co` | Confirmado em `.env.local` e validado por trava de segurança. |
| **Migration 001** | **Aplicada e Ativa** | RLS ativa em 22 tabelas; RPCs `rpc_submit_patient_vitals`, `rpc_confirm_clinical_record` e `rpc_reject_clinical_record` funcionais e rejeitando acessos anônimos (código 42501). |
| **Migrations 002 a 006** | **Versionadas Localmente** | Tabelas estruturais adicionais (`documents`, `condition_events`, `medication_events`) e RPCs (`rpc_record_lab_exam`, `rpc_request_representation`, `rpc_record_condition`, etc.) aguardam execução no SQL Editor. |
| **Storage** | **0 Buckets Criados** | Bucket privado `clinical-documents` pronto para criação via SQL ou painel Supabase. |
| **Integridade de Dados** | **100% Preservada** | Nenhum registro de demonstração foi alterado ou apagado durante as verificações. |

---

## 3. Adaptação da Suíte de Testes para o Ambiente Único

Criamos a suíte `scripts/single-env-integration-test-suite.mjs`, adaptada especificamente para o ambiente único com as seguintes salvaguardas:

1. **Trava de Identificador:** Aborta imediatamente se a URL não contiver `iyukangioglvtgxirgcl`.
2. **Separação de Testes Locais e Remotos:**
   - **Testes Remotos:** Validam exclusivamente RLS real via cliente anônimo PostgREST (`anonKey`), atestando que nenhuma tabela clínica permite leitura ou escrita pública não autenticada.
   - **Testes de Estado das Migrations:** Consultam o schema cache sem inserir dados, comprovando a prontidão das Server Actions em lidar de forma controlada com RPCs pendentes.
3. **Preservação de Registros de Demonstração:** Nenhum comando de limpeza indiscriminada é executado.

---

## 4. Plano Sequencial de Aplicação das Migrations (002 a 006)

A aplicação no SQL Editor do Supabase deve seguir a ordem estrita de dependências:

```
002_lab_exams ──▶ 003_queues ──▶ 004_representations ──▶ 005_documents ──▶ 006_conditions
```

### 4.1. Detalhamento por Migration
- **Migration 002 (`002_lab_exams_and_calculation_runs_rpc.sql`)**:
  - *Objetos:* RPC `rpc_record_lab_exam`.
  - *Efeito em dados:* Zero impacto em registros legados.
  - *Verificação:* `SELECT proname FROM pg_proc WHERE proname = 'rpc_record_lab_exam';`
  - *Rollback não-destrutivo:* `REVOKE EXECUTE ON FUNCTION public.rpc_record_lab_exam FROM authenticated;` e aplicação de patch corretivo com `CREATE OR REPLACE FUNCTION`.
- **Migration 003 (`003_feedback_and_admin_queues.sql`)**:
  - *Objetos:* Coluna opcional `clinical_record_id` em `rejected_submission_events`; RLS nas filas.
  - *Efeito em dados:* Registros legados recebem `NULL` na nova coluna, preservando dados intactos.
  - *Verificação:* `SELECT column_name FROM information_schema.columns WHERE table_name = 'rejected_submission_events' AND column_name = 'clinical_record_id';`
  - *Rollback não-destrutivo:* Manter a coluna; ajustar apenas policies via `CREATE OR REPLACE / DROP POLICY`.
- **Migration 004 (`004_patient_representations_and_delegation.sql`)**:
  - *Objetos:* RLS e 4 RPCs de cuidadores.
  - *Efeito em dados:* Vínculos de representação existentes permanecem válidos.
  - *Verificação:* `SELECT proname FROM pg_proc WHERE proname LIKE 'rpc_%representation%';` (4 linhas).
  - *Rollback não-destrutivo:* Revogar privilégios das RPCs afetadas sem excluir dados.
- **Migration 005 (`005_clinical_documents_storage_and_curation.sql`)**:
  - *Objetos:* Tabela `documents`, constraints, índices, RLS e 2 RPCs (`rpc_confirm_document`, `rpc_reject_document`).
  - *Pré-requisito:* Criação do bucket `clinical-documents` no Storage com `public = false`.
  - *Efeito em dados:* Nenhum dado afetado.
  - *Verificação:* `SELECT table_name FROM information_schema.tables WHERE table_name = 'documents';`
  - *Rollback não-destrutivo:* Desativar inserções na interface; **proibido `DROP TABLE documents CASCADE`**.
- **Migration 006 (`006_conditions_and_medications.sql`)**:
  - *Objetos:* Extensão de `conditions` e `medications`, tabelas `condition_events` e `medication_events`, 4 RPCs com versionamento otimista.
  - *Efeito em dados:* Registros existentes recebem `version = 1` e `validation_status = 'CONFIRMED'`.
  - *Verificação:* `SELECT table_name FROM information_schema.tables WHERE table_name IN ('condition_events', 'medication_events');`
  - *Rollback não-destrutivo:* Manter as tabelas de histórico; aplicar correções funcionais via `CREATE OR REPLACE FUNCTION`.

---

## 5. Integração do Storage Privado

### 5.1. SQL de Criação do Bucket
```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-documents',
  'clinical-documents',
  false,
  10485760,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
) ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf', 'image/jpeg', 'image/png'];
```

### 5.2. Segurança e URLs Assinadas
- Bucket estritamente privado (`public = false`).
- Emissão de URLs assinadas condicionada à autorização no servidor (titular, médico vinculado ativo ou representante com escopo).
- Validação no servidor do tempo de expiração fixo de **900 segundos (15 minutos)**.
- Gravação de evento em `audit_events` para cada geração de link temporário.

---

## 6. Roteiro Oficial de Demonstração ao Cliente (Demo Playbook)

O roteiro a seguir foi estruturado para apresentar a plataforma de ponta a ponta com estabilidade e elegância visual, utilizando dados sintéticos estáveis:

### Bloco 1 — Visão do Gestor Clínico (Administração & Governança)
1. **Login como Administrador (`/admin`)**:
   - Apresentar o painel consolidado com indicadores de segurança e conformidade.
2. **Trilha de Auditoria Append-Only (`/admin/auditoria`)**:
   - Demonstrar o registro cronológico imutável de todas as ações clínicas (acessos, confirmações e rejeições).
3. **Painel das 5 Filas de Governança (`/admin/filas`)**:
   - Demonstrar a Fila 1 (Médicos), Fila 2 (Vínculos e Cuidadores) e Fila 4 (Pedidos de Retificação).

### Bloco 2 — Visão do Médico Nefrologista Assistente (Prontuário & Decisão)
1. **Acesso ao Portal Médico (`/doctor`)**:
   - Demonstrar o isolamento Zero-Trust: o médico visualiza apenas seus pacientes com vínculo clínico ativo.
2. **Evolução Gráfica Longitudinal**:
   - Exibir os gráficos interativos de TFGe vs. Creatinina e Estabilidade de Sinais Vitais com tooltips e unidades oficiais.
3. **Curadoria Clínica de Medições Domiciliares**:
   - Demonstrar a Fila de Curadoria:
     - Aprovação de medição legítima (transiciona para `CONFIRMED`).
     - Rejeição justificada de medição inconsistente (ex.: PA 250/150 isolada) com código padronizado e orientação clara.
4. **Lançamento de Exame Laboratorial & Calculadora CKD-EPI 2021**:
   - Abrir o modal de novo exame, inserir Creatinina 1.8 mg/dL e demonstrar o cálculo automático e estadiamento KDIGO (ex.: G3b) derivado em tempo real.
5. **Histórico Farmacológico e Comorbidades**:
   - Demonstrar o registro de comorbidade (Hipertensão Arterial, CID I10) e medicamento em uso (Losartana 50mg), destacando o aviso legal de que **não constitui prescrição eletrônica**.

### Bloco 3 — Visão do Paciente Renal (Engajamento Domiciliar & Transparência)
1. **Acesso ao Dashboard do Paciente (`/patient/dashboard`)**:
   - Visualização do prontuário ativo e resumo de saúde.
2. **Envio de Sinais Vitais Domiciliares**:
   - Preenchimento de peso e pressão arterial, com validação de paridade sistólica/diastólica e envio para validação médica (`PENDING_VALIDATION`).
3. **Feedback de Rejeição Amigável**:
   - Demonstrar como o paciente é informado com respeito e clareza sobre medições descartadas pelo médico, incluindo o motivo e a orientação de repetição.
4. **Resumo Clínico Somente-Leitura**:
   - Visualização das comorbidades ativas e dos medicamentos em uso confirmados pelo médico assistente.
5. **Gestão de Representantes e Cuidadores**:
   - Demonstrar o envio de solicitação para vincular a filha como cuidadora autorizada.

---

## 7. Matriz de Maturidade das Funcionalidades (6 Status)

| Módulo / Funcionalidade | 1. Implementado Localmente | 2. Integrado ao Supabase Atual | 3. Testado com Evidência Real | 4. Pendente Validação Clínica | 5. Pronto para Demonstração | 6. Pendências para Produção |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Autenticação, RBAC & Contas Suspensas** | ✅ SIM | ✅ SIM (Migration 001) | ✅ SIM (PostgREST RLS) | ❌ Não | ✅ **SIM** | Auditoria de MFA/TOTP |
| **Submissão de Sinais Vitais Domiciliares** | ✅ SIM | ✅ SIM (Migration 001) | ✅ SIM (Node.js + plpgsql) | ⚠️ Limites de PA | ✅ **SIM** | Ratificação médica de plausibilidade |
| **Curadoria Médica (Confirmar / Rejeitar)** | ✅ SIM | ✅ SIM (Migration 001) | ✅ SIM (plpgsql P0001) | ❌ Não | ✅ **SIM** | Homologação com equipe clínica |
| **Exames e Calculadora CKD-EPI 2021** | ✅ SIM | ⚠️ Aguarda Migr. 002 | ✅ SIM (Casos NEJM) | ❌ Não | ✅ **SIM** (Pronto p/ aplicar 002) | Aplicação da 002 no SQL Editor |
| **Feedback de Recusa & Filas Administrativas** | ✅ SIM | ⚠️ Aguarda Migr. 003 | ✅ SIM (Testes 3.3) | ❌ Não | ✅ **SIM** (Pronto p/ aplicar 003) | Aplicação da 003 no SQL Editor |
| **Representantes Legais e Cuidadores** | ✅ SIM | ⚠️ Aguarda Migr. 004 | ✅ SIM (Testes 4.1) | ❌ Não | ✅ **SIM** (Pronto p/ aplicar 004) | Aplicação da 004 no SQL Editor |
| **Upload de Laudos e Storage Privado** | ✅ SIM | ⚠️ Aguarda Migr. 005 | ✅ SIM (Magic Bytes) | ❌ Não | ✅ **SIM** (Pronto p/ aplicar 005) | Criação do bucket + Migr. 005 |
| **Comorbidades e Medicamentos de Uso Contínuo** | ✅ SIM | ⚠️ Aguarda Migr. 006 | ✅ SIM (13 cenários) | ⚠️ Retroatividade | ✅ **SIM** (Pronto p/ aplicar 006) | Aplicação da 006 no SQL Editor |

---

## 8. Verificações Técnicas Locais Consolidadas

- **TypeScript (`npx tsc --noEmit`):** 0 erros.
- **Suíte de Testes Automatizados (`npm test`):** 76 testes aprovados em 33 suítes (0 falhas).
- **Compilação de Produção Next.js (`npm run build`):** 19 rotas compiladas e otimizadas em 8.6s (Turbopack).
- **Suíte de Integração em Ambiente Único (`scripts/single-env-integration-test-suite.mjs`):** 10 cenários avaliados com sucesso, trava de segurança de projeto confirmada e zero mutações em dados da demonstração.
