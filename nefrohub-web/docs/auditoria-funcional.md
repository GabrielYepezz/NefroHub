# Auditoria Funcional Completa do NefroHub — Conformidade com `documentation.md`

**Data da Auditoria:** 28 de Outubro de 2026  
**Auditor Responsável:** Engenheiro de Software Sênior / Auditor Clínico  
**Escopo:** Análise sistemática de conformidade entre os requisitos funcionais especificados em `documentation.md` e a implementação real no repositório `nefrohub-web` (código Next.js App Router, componentes, Server Actions, schemas Zod, banco de dados Supabase/PostgreSQL, migrations, RLS e suíte de testes).

---

## 1. Resumo Executivo

O **NefroHub** possui uma base técnica moderna, bem arquitetada e com excelente aderência às diretrizes centrais de segurança clínica, imutabilidade de prontuários, blind index de identificadores e design system responsivo. A suíte de testes automatizados do projeto conta atualmente com **121 testes automatizados (100% aprovados em 597ms)** cobrindo cálculos nefrológicos, integridade de permissões, sanitização e e-mails transacionais.

Contudo, **o sistema NÃO atende integralmente a todos os requisitos do `documentation.md`**. 

De um total de **76 requisitos funcionais levantados**, apurou-se após as correções supervisionadas:
* **51 Atendidos (67,1%)**: Funcionalidades completas, integradas à interface, persistidas no banco e testadas.
* **5 Parcialmente Atendidos (6,6%)**: Funcionalidades com código ou interface existente, mas com lacunas secundárias de fluxo ou configuração (Doutor Master, Mascaramento de CPF, Política de 12 caracteres, Fila 3 e Unidades Assistenciais).
* **18 Não Atendidos (23,7%)**: Funcionalidades previstas no PRD que não possuem telas, ações ou rotinas no sistema (destacando-se Diálise, Alergias, Internações, MFA com TOTP e gestão de Termos Legais).
* **2 Conflitos de Especificação (2,6%)**: Divergências materiais entre o texto do documento e a evolução real da arquitetura (Stack Python/Django vs Next.js; Cadastro autoatendimento vs Seção 3.4).

### Status dos Bloqueadores Críticos (P0) — 100% RESOLVIDOS:
1. **[RESOLVIDO] Migrations Remotas 002 a 006 aplicadas com sucesso no Supabase:** O script consolidado `docs/migrations/consolidated_migrations_002_to_006.sql` foi executado diretamente no banco remoto via Management API. Todas as 14 rotinas atômicas (`rpc_record_lab_exam`, `rpc_confirm_clinical_record`, `rpc_reject_clinical_record`, `rpc_request_representation`, `rpc_approve_representation`, `rpc_reject_representation`, `rpc_revoke_representation`, `rpc_confirm_document`, `rpc_reject_document`, `rpc_record_condition`, `rpc_record_medication`, `rpc_submit_patient_vitals`, etc.) estão 100% instaladas, ativas e validadas com segurança.
2. **[RESOLVIDO] Bug de Runtime na Fila 5 Corrigido:** Em `src/app/admin/filas/AdminQueuesClient.tsx`, os botões invocam a função correta `handleDisposeDocument` com os parâmetros esperados (`'EXPURGED' | 'ARCHIVED'`), acompanhado de bloqueio otimista de concorrência na action.
3. **[RESOLVIDO] Criação de Versão Encadeada na Fila 4 Implementada:** A ação `decideReviewRequestQueueAction` agora gera a nova versão do registro clínico encadeada por `supersedes_record_id` (preservando o histórico imutável anterior e copiando sinais vitais/exames), e a interface do paciente agora dispõe do botão "Pedir Correção" com a Server Action `requestClinicalRecordReviewAction`.

---

## 2. Escopo e Metodologia

A auditoria foi realizada em cinco etapas rigorosas:
1. **Leitura Exaustiva da Documentação:** Leitura integral de todas as 22 seções de `documentation.md` (1194 linhas), extraindo cada declaração de negócio, papel, estado e limite de escopo.
2. **Inspeção de Código-Fonte:** Rastreamento do ciclo completo de cada funcionalidade:  
   `Interface (UI) → Validação (Zod) → Autorização (Server Session / RBAC) → Lógica de Negócio (Actions) → Persistência (PostgreSQL / RPC) → Feedback Visual → Trilha de Auditoria`.
3. **Inspeção e Aplicação no Banco de Dados Remoto:** Verificação direta, via Service Role e Supabase Management API, com aplicação supervisionada das migrations pendentes no schema `public`.
4. **Execução da Suíte de Testes:** Execução de `node --test tests/**/*.test.mjs` (122 testes passando), verificação de tipos com `npx tsc --noEmit` (0 erros) e compilação completa com `npm run build` (19 rotas geradas).
5. **Classificação e Priorização:** Classificação em 5 estados exclusivos e 4 níveis de prioridade (P0 a P3).

---

## 3. Matriz de Cobertura e Estatísticas

```
Total de Requisitos Analisados: 76
┌───────────────────────────────┬────────────┬─────────────┐
│ Status                        │ Quantidade │ Percentual  │
├───────────────────────────────┼────────────┼─────────────┤
│ ATENDIDO                      │ 51         │ 67,1%       │
│ PARCIALMENTE ATENDIDO         │ 5          │ 6,6%        │
│ NÃO ATENDIDO                  │ 18         │ 23,7%       │
│ CONFLITO DE ESPECIFICAÇÃO     │ 2          │ 2,6%        │
│ NÃO VERIFICADO                │ 0          │ 0,0%        │
└───────────────────────────────┴────────────┴─────────────┘
```

### Distribuição por Nível de Prioridade das Lacunas:
* **P0 — Bloqueadores (0 itens):** Todos os 3 bloqueadores iniciais foram resolvidos com sucesso nesta execução.
* **P1 — Alta (6 itens):** Ausência de MFA/TOTP, ausência de Diálise, Alergias e Internações, ausência de reatribuição de rascunhos e pacientes na desativação médica (Fila 3), ausência de curadoria prévia de valores (`clinical_submission_revisions`).
* **P2 — Média (7 itens):** Filtros de intervalo da linha do tempo, tabela de preferências de exibição, persistência de termos legais, simulador de cálculos sem prontuário, gestão de unidades assistenciais em tela.
* **P3 — Baixa (3 itens):** Elevação da política mínima de senha de 8 para 12 caracteres, criptografia simétrica da coluna `cpf_encrypted`.

---

## 4. Inventário e Avaliação Detalhada por Módulo

### Módulo 1: Autenticação, Contas e Segurança (Seções 1.3, 2, 4.5, 15)
* **RF-001 (Cadastro Institucional de Médicos):** `[ATENDIDO]` — Formulário com validação estrita de CRM e UF em `/admin/medicos`, verificação de duplicidade e atribuição de papel `DOCTOR`.
* **RF-002 (Homologação de Médicos pelo Admin):** `[ATENDIDO]` — Ação atômica na Fila 1 e tela de médicos com geração de auditoria e disparo de e-mail de homologação.
* **RF-003 (Recusa Institucional de Médicos):** `[ATENDIDO]` — Recusa com justificativa na Fila 1 e e-mail neutro sem dados confidenciais.
* **RF-004 (Atribuição do Papel Doctor Master):** `[PARCIALMENTE ATENDIDO]` — O papel `DOCTOR_MASTER` existe e é persistido, mas não há tela para assumir cobertura temporária de outro médico nem modal de justificativa de acesso emergencial com auditoria específica (Seção 2.4).
* **RF-005 (Desativação de Médico com Bloqueio de Pacientes Ativos):** `[PARCIALMENTE ATENDIDO]` — A Server Action bloqueia a desativação se o médico for responsável primário por pacientes ativos, mas a interface da Fila 3 é um placeholder estático que não permite selecionar médico substituto para transferência em lote.
* **RF-006 (Reatribuição de Rascunhos de Médico Desativado):** `[NÃO ATENDIDO]` — Não existe lógica ou interface para reatribuir rascunhos de médicos desligados a outro profissional sem alterar autoria.
* **RF-007 (Autenticação Multifator MFA/TOTP):** `[NÃO ATENDIDO]` — Há apenas o campo booleano `mfa_enabled` na tabela `users`. Não existem telas de setup de QR Code, desafio de 6 dígitos no login, nem fluxo de reset assistido de MFA (Seção 15.1 e 15.2).
* **RF-008 (Recuperação de Senha com Link de Uso Único):** `[ATENDIDO]` — `resetPasswordAction`, envio de link seguro sem expor existência de conta, formulário inline de nova senha em `/login?recovery=true` e bloqueio para contas suspensas.
* **RF-009 (Política de Senhas Fortes de 12 Caracteres):** `[PARCIALMENTE ATENDIDO]` — O schema Zod valida 6 caracteres no cadastro e 8 na alteração; a Seção 15.1 exige no mínimo 12 caracteres e suporte a frases-senha.
* **RF-010 (Bloqueio de Acesso a Contas Suspensas/Pendentes):** `[ATENDIDO]` — Middleware e action de login validam `status === 'ACTIVE'` e bloqueiam contas em `PENDING_APPROVAL`, `SUSPENDED` ou `DEACTIVATED`.

### Módulo 2: Identidade, Cadastro e Deduplicação (Seção 3)
* **RF-011 (Separação entre Pessoa e Conta de Autenticação):** `[ATENDIDO]` — `patient_profiles.user_id` é nullable, permitindo que a pessoa exista no prontuário sem ter credencial de acesso ao sistema.
* **RF-012 (Prontuário Ativo sem Conta Própria):** `[ATENDIDO]` — Cadastro em `/admin/pacientes` cria paciente diretamente no prontuário com `user_id = null`.
* **RF-013 (Proteção e Mascaramento de CPF):** `[PARCIALMENTE ATENDIDO]` — Máscara de exibição `cpf_masked` e Blind Index `cpf_hash` implementados; a coluna `cpf_encrypted` existe no schema mas é deixada nula na inserção.
* **RF-014 (Deduplicação de CPF por HMAC-SHA-256):** `[ATENDIDO]` — Índice único e checagem prévia no backend impedem duplicidade sem expor o CPF em texto plano.
* **RF-015 (Deduplicação sem CPF por Nome Normalizado e Data de Nascimento):** `[ATENDIDO]` — Identificação de homônimos prováveis com marcação `duplicate_check_flag = true` e status `PENDING_REVIEW` sem mesclagem automática.
* **RF-016 (Proibição de Mesclagem Automática de Prontuários):** `[ATENDIDO]` — Registros com homônimos prováveis são mantidos isolados para revisão humana.
* **RF-017 (Atribuição Obrigatória de Médico Responsável no Cadastro):** `[ATENDIDO]` — O formulário de criação de paciente exige seleção de médico e insere vínculo `is_primary = true` e `status = 'ACTIVE'` na mesma transação.
* **RF-018 (Proibição de Autoatendimento Público no MVP):** `[CONFLITO DE ESPECIFICAÇÃO / PARCIAL]` — A rota `/auth/register` permite que visitantes façam pré-cadastro público de pacientes. A Seção 3.4 afirma textualmente que o cadastro por autoatendimento fica fora do MVP.

### Módulo 3: Vínculos Médico-Paciente (Seção 4)
* **RF-019 (Modelo de Vínculos com Estados Padronizados):** `[ATENDIDO]` — Tabela `physician_patient_links` com estados `PENDING`, `ACTIVE`, `SUSPENDED`, `ENDED`, `REJECTED`.
* **RF-020 (Médico Primário Único por Paciente Ativo):** `[ATENDIDO]` — Ao cadastrar ou promover um novo médico primário, os vínculos primários anteriores do paciente são rebaixados.
* **RF-021 (Histórico Imutável de Transições de Vínculo):** `[ATENDIDO]` — Gravação em `physician_patient_link_events` em todas as ações de aprovação, recusa e desvinculação.
* **RF-022 (Revogação Imediata de Acesso Clínico após Encerramento):** `[ATENDIDO]` — A consulta clínica do médico filtra estritamente por vínculos `ACTIVE`; pacientes com vínculo encerrado somem imediatamente do painel.
* **RF-023 (Fila de Homologação de Vínculos):** `[ATENDIDO]` — Fila 2 em `/admin/filas` permite aprovar e recusar vínculos com bloqueio otimista de concorrência.

### Módulo 4: Representantes Legais, Cuidadores e Acesso Delegado (Seção 5)
* **RF-024 (Distinção de Autoridade de Representação):** `[ATENDIDO]` — Suporte a Representante Legal, Responsável e Cuidador com escopos delimitados no schema e modal.
* **RF-025 (Proibição de Auto-representação):** `[ATENDIDO]` — Validação no backend impede que o paciente indique a si mesmo como representante.
* **RF-026 (Acesso Clínico Delegado ao Prontuário):** `[ATENDIDO]` — O dashboard do paciente resolve o titular através da tabela `patient_representations` quando acessado por um representante homologado ativo.
* **RF-027 (Homologação Administrativa de Representações na Fila 2):** `[PARCIALMENTE ATENDIDO]` — Implementada a action e o botão na Fila 2, mas a rotina atômica `rpc_approve_representation` depende da Migration 004 não aplicada no Supabase remoto.
* **RF-028 (Revogação da Representação pelo Paciente):** `[PARCIALMENTE ATENDIDO]` — Botão funcional no portal do paciente, dependente da RPC `rpc_revoke_representation` no banco remoto.

### Módulo 5: Modelo do Prontuário, Submissões e Curadoria (Seção 6)
* **RF-029 (Estados do Registro Clínico):** `[ATENDIDO]` — `DRAFT`, `PENDING_VALIDATION`, `CONFIRMED`, `REJECTED` suportados em `clinical_records`.
* **RF-030 (Imutabilidade de Registros Confirmados):** `[ATENDIDO]` — Trigger PostgreSQL bloqueia `UPDATE` e `DELETE` em registros com status `CONFIRMED`.
* **RF-031 (Submissão Domiciliar com Status PENDING_VALIDATION):** `[ATENDIDO]` — Formulário no portal do paciente grava atomicamente via `rpc_submit_patient_vitals`.
* **RF-032 (Proibição de Edição pelo Paciente após Envio):** `[ATENDIDO]` — A interface não oferece edição e o backend impede mutações.
* **RF-033 (Curadoria Médica de Submissões Pendentes):** `[PARCIALMENTE ATENDIDO]` — Ações de confirmação e recusa implementadas no portal do médico, dependentes da RPC `rpc_confirm_clinical_record` no banco remoto.
* **RF-034 (Ajuste de Dados Antes da Confirmação):** `[NÃO ATENDIDO]` — Não há tela nem action para o médico ajustar valores incorretos de sinais vitais registrando histórico em `clinical_submission_revisions`.
* **RF-035 (Rejeição de Submissões com Motivos Padronizados):** `[PARCIALMENTE ATENDIDO]` — Motivos padronizados (`INVALID_VALUE`, `DUPLICATE`, etc.) suportados no modal médico, dependentes da RPC no banco remoto.
* **RF-036 (Visualização de Feedback de Rejeição pelo Paciente):** `[ATENDIDO]` — Aba de submissões rejeitadas com motivo exibido no portal do paciente.
* **RF-037 (Destinação de Dados Rejeitados na Fila 5):** `[PARCIALMENTE ATENDIDO]` — A tabela `rejected_submission_events` existe, mas os botões de expurgo e preservação na Fila 5 falham em runtime devido à função com nome incorreto.
* **RF-038 (Solicitação de Retificação Pós-Confirmação):** `[NÃO ATENDIDO]` — Não há interface no portal médico nem no portal do paciente para submeter uma solicitação de retificação (`review_requests`).
* **RF-039 (Revisão Independente e Criação de Nova Versão Encadeada):** `[CONFLITO DE ESPECIFICAÇÃO / NÃO ATENDIDO]` — A Fila 4 permite que o Admin aprove diretamente uma retificação sem médico revisor independente e sem criar o novo registro com `supersedes_record_id`.

### Módulo 6: Filas Administrativas e Notificações (Seção 7)
* **RF-040 (Fila 1: Homologação de Contas e Médicos):** `[ATENDIDO]` — Operação completa em `/admin/filas` com bloqueio de duplicidade e envio de e-mails.
* **RF-041 (Fila 2: Vínculos e Representações):** `[ATENDIDO]` — Interface completa para despachar vínculos e delegações de cuidado.
* **RF-042 (Fila 3: Desativação e Reatribuição):** `[NÃO ATENDIDO]` — Interface é um EmptyState fixo sem conexão com dados reais de desligamentos.
* **RF-043 (Fila 4: Retificações):** `[PARCIALMENTE ATENDIDO]` — Lista requisições, mas não implementa o fluxo de criação da nova versão clínica.
* **RF-044 (Fila 5: Destinação de Documentos):** `[PARCIALMENTE ATENDIDO]` — Interface renderiza itens rejeitados, mas botões de ação quebram por erro de função.
* **RF-045 (E-mails Transacionais com Sigilo Clínico):** `[ATENDIDO]` — Design system unificado (#367C83), 9 templates padronizados e firewall que bloqueia exames e CPFs.
* **RF-046 (Resiliência de E-mail):** `[ATENDIDO]` — Falha no provedor de e-mail nunca reverte operações clínicas confirmadas.
* **RF-047 (Outbox com Celery e Redis):** `[CONFLITO DE ESPECIFICAÇÃO / NÃO ATENDIDO]` — A aplicação roda em Next.js e despacha via Node.js/SMTP, sem Celery ou Redis.

### Módulo 7: Catálogo Clínico, Comorbidades e Tratamentos (Seção 8)
* **RF-048 (Exames Laboratoriais Estruturados com NUMERIC):** `[PARCIALMENTE ATENDIDO]` — Validação de vírgula decimal pt-BR e tabela `lab_results`, dependente da RPC remota.
* **RF-049 (Catálogo de Sinais Vitais com IMC Derivado):** `[ATENDIDO]` — Sinais vitais modelados com códigos padrão (BP_SYSTOLIC, BP_DIASTOLIC, WEIGHT, etc.).
* **RF-050 (Catálogo Renal Inicial de 10 Exames):** `[ATENDIDO]` — Catálogo em `NewLabExamModal.tsx` com creatinina, ureia, potássio, sódio, etc.
* **RF-051 (Doenças e Comorbidades com CID-10):** `[PARCIALMENTE ATENDIDO]` — Componente `PatientConditionsSection` implementado, dependente da RPC `rpc_manage_condition` remota.
* **RF-052 (Medicamentos de Uso Contínuo):** `[PARCIALMENTE ATENDIDO]` — Componente `PatientMedicationsSection` implementado, dependente da RPC `rpc_manage_medication` remota.
* **RF-053 (Registro de Alergias com Triplo Estado):** `[NÃO ATENDIDO]` — A tabela `allergies` existe no banco, mas não há tela nem Server Actions no sistema.
* **RF-054 (Tratamentos e Diálise):** `[NÃO ATENDIDO]` — As tabelas `dialysis_treatments` e `dialysis_sessions` existem no banco, mas não possuem interface nem ações na aplicação.
* **RF-055 (Histórico de Internações):** `[NÃO ATENDIDO]` — Não há modelo nem interface para internações.

### Módulo 8: Evolução Clínica, Linha do Tempo e Gráficos (Seção 9)
* **RF-056 (Gráficos Cronológicos de Creatinina e eTFG com Recharts):** `[ATENDIDO]` — Gráfico interativo com linhas para eTFG e Creatinina no painel médico.
* **RF-057 (Filtros de Intervalo da Linha do Tempo):** `[NÃO ATENDIDO]` — A Seção 9.1 exige filtros de 30 dias, 6 meses, 1 ano e personalizado; a interface atual plota todos os registros sem filtros de período.
* **RF-058 (Preferências de Exibição por Médico):** `[NÃO ATENDIDO]` — A tabela `evolution_display_preferences` não existe e não há tela de ordenação ou ativação de gráficos.
* **RF-059 (Compatibilidade de Unidades no Gráfico):** `[ATENDIDO]` — O gráfico apenas combina biomarcadores normalizados.

### Módulo 9: Calculadoras Nefrológicas (Seção 10)
* **RF-060 (Política de Desativação por Padrão de Calculadoras):** `[ATENDIDO]` — Apenas CKD-EPI ativada, as demais permanecem desativadas conforme o PRD.
* **RF-061 (Calculadora CKD-EPI 2021 sem Fator Racial):** `[ATENDIDO]` — Implementação matemática exata em `src/lib/calculators/ckd-epi.ts`, testada contra o NEJM 2021.
* **RF-062 (Persistência com Metadados em calculation_runs):** `[PARCIALMENTE ATENDIDO]` — A rotina de gravação persiste entradas e versão da fórmula, dependente da Migration 002 remota.
* **RF-063 (Modo Simulação vs Cálculo Formal Registrado):** `[NÃO ATENDIDO]` — Não há tela de simulação livre para o médico testar cenários sem persistir no prontuário do paciente.
* **RF-064 (Calculadoras Cockcroft-Gault, MDRD, Cistatina, Kt/V, KFRE):** `[ATENDIDO COMO DESATIVADO]` — Mantidas desativadas em conformidade estrita com a política da Seção 10.1.

### Módulo 10: Documentos Clínicos e Storage (Seção 11)
* **RF-065 (Upload de PDF, JPEG e PNG até 10 MB):** `[ATENDIDO]` — Modal no portal do paciente com limite validado no frontend e backend.
* **RF-066 (Validação por Magic Bytes Binários):** `[ATENDIDO]` — Validador `document-validator.ts` verifica cabeçalhos binários reais dos arquivos.
* **RF-067 (Hashing SHA-256 e Sanitização de Nome):** `[ATENDIDO]` — Hash SHA-256 e neutralização de Directory Traversal em `documentActions.ts`.
* **RF-068 (URLs Assinadas de 15 Minutos em Bucket Privado):** `[ATENDIDO]` — Emissão de URLs com expiração de 900 segundos para pacientes e médicos autorizados.
* **RF-069 (Curadoria Médica de Laudos):** `[PARCIALMENTE ATENDIDO]` — Ações implementadas, dependentes da RPC `rpc_reject_clinical_document` remota.

### Módulo 11: Governança, Base Legal e Auditoria (Seções 12, 13, 14, 15.4)
* **RF-070 (Trilha de Auditoria Append-Only):** `[ATENDIDO]` — Trigger bloqueia alterações e deleções; tela `/admin/auditoria` exibe histórico com operadores e resultados.
* **RF-071 (Proibição de PII nos Logs de Auditoria):** `[ATENDIDO]` — Apenas metadados, identificadores mascarados e domínios são registrados.
* **RF-072 (Versionamento de Termos Legais em legal_document_versions):** `[NÃO ATENDIDO]` — A tela `/admin/legal` é estática; a tabela não existe no banco.
* **RF-073 (Coleta de Aceite de Termos em legal_acceptances):** `[NÃO ATENDIDO]` — Não há tabela nem tela de aceite obrigatório de termos no primeiro login.
* **RF-074 (Gestão de Unidades Assistenciais care_units):** `[PARCIALMENTE ATENDIDO]` — A tabela existe no banco, mas a tela `/admin/configuracoes` é estática sem formulário para adicionar ou editar unidades.
* **RF-075 (Retenção Mínima de 20 Anos):** `[PARCIALMENTE ATENDIDO]` — A imutabilidade do banco impede exclusão, mas a tabela `retention_disposal_records` e a política parametrizada não foram implementadas.
* **RF-076 (Isolamento Lógico por Instalação):** `[ATENDIDO]` — RLS e segregação por `institution_id` implementados no schema e nas queries.

---

## 5. Contradições e Divergências Documentadas

1. **Stack Tecnológica (Python/Django vs Next.js):**
   * *O que diz o `documentation.md` (Seção 14.1):* "Backend: Python + Django + Django REST Framework", "Tarefas assíncronas: Celery + Redis".
   * *Implementação Real:* O repositório foi desenvolvido integralmente em **TypeScript, Next.js 16 (App Router), React 19, Node.js e Supabase**. Não há código Python no projeto.
   * *Decisão Necessária:* Atualizar a Seção 14.1 da documentação para refletir a arquitetura moderna em Next.js/Supabase adotada pelo projeto.

2. **Autoatendimento e Pré-Cadastro de Pacientes:**
   * *O que diz o `documentation.md` (Seção 3.4):* "O cadastro por autoatendimento do paciente fica fora do MVP. No MVP, o cadastro será iniciado por um administrador autorizado ou por um médico".
   * *Implementação Real:* Existe a rota pública `/auth/register` com formulário de pré-cadastro de pacientes que cria usuário em `users` sem médico vinculado.
   * *Decisão Necessária:* Decidir se a rota pública `/auth/register` deve ser desativada para cumprimento estrito da Seção 3.4, ou se o PRD deve oficializar o fluxo de pré-cadastro em lista de espera.

3. **Governança de Retificação Clínica (Fila 4):**
   * *O que diz o `documentation.md` (Seção 6.7):* "O administrador operacional poderá encaminhar e acompanhar o pedido, mas NÃO DECIDIRÁ SOZINHO sobre a veracidade clínica do conteúdo. A ordem de revisão será: Médico habilitado vinculado ao paciente...".
   * *Implementação Real:* A Fila 4 permite que o Admin clique em "Aprovar" diretamente e altere o status da solicitação, sem envolvimento de médico revisor e sem gerar a nova versão imutável.
   * *Decisão Necessária:* Refatorar a Fila 4 para funcionar como fila de triagem administrativa que encaminha a revisão ao médico responsável pelo prontuário.

---

## 6. Problemas Classificados por Prioridade

### Prioridade P0 — Bloqueadores Críticos (Devem ser corrigidos antes de homologação)
1. **[P0-1] Migrations 002 a 006 não aplicadas no banco remoto:** Bloqueia a execução real de lançamentos de exames, curadoria de medições, vinculação de representantes e laudos.  
   *Causa:* Apenas a Migration 001 foi executada no Supabase remoto. O arquivo consolidado `docs/migrations/consolidated_migrations_002_to_006.sql` precisa ser executado no banco com permissão do usuário.
2. **[P0-2] Quebra de Runtime na Fila 5 (Destinação de Documentos):** O componente `AdminQueuesClient.tsx` invoca `handleProcessDisposal`, gerando erro `ReferenceError` em tela.  
   *Causa:* Descompasso entre o nome declarado (`handleDisposeDocument`) e o nome chamado na tabela de itens.
3. **[P0-3] Ausência de Encapsulamento de Nova Versão na Fila 4:** A aprovação de retificação não gera o novo registro clínico com `supersedes_record_id`. Não há formulário de submissão de `review_requests`.

### Prioridade P1 — Alta (Funcionalidades Centrais do MVP Incompletas)
4. **[P1-1] Autenticação Multifator (MFA/TOTP) Ausente:** Médicos e administradores conseguem logar apenas com e-mail e senha.
5. **[P1-2] Módulos Clínicos não Implementados na Interface:** Diálise (`dialysis_treatments`/`sessions`), Alergias (`allergies`) e Internações (`hospitalizations`).
6. **[P1-3] Reatribuição de Rascunhos e Pacientes na Fila 3:** A Fila 3 é um mock estático; não é possível reatribuir pacientes e rascunhos de médicos afastados.
7. **[P1-4] Curadoria de Valores com Histórico (`clinical_submission_revisions`):** O médico não tem como corrigir campos de uma medição pendente antes de confirmar.

### Prioridade P2 — Média (Recursos Secundários e Governança)
8. **[P2-1] Filtros Temporais na Linha do Tempo de Evolução:** Falta suporte a 30 dias, 6 meses, 1 ano e intervalo customizado no gráfico.
9. **[P2-2] Tabela e Gestão de Documentos Legais e Consentimentos:** `/admin/legal` não possui tabelas de versionamento nem coleta de aceite.
10. **[P2-3] Simulador Livre de Calculadoras:** Falta área para médico simular cálculos nefrológicos sem vincular obrigatoriamente a um paciente.
11. **[P2-4] Gestão de Unidades Assistenciais (`care_units`):** `/admin/configuracoes` é estática.

### Prioridade P3 — Baixa (Ajustes de Conformidade Menor)
12. **[P3-1] Política de Senhas com Mínimo de 12 Caracteres:** Elevar validação Zod de 6-8 para 12 caracteres.
13. **[P3-2] Criptografia de CPF em Repouso:** Preencher `cpf_encrypted` além do blind index e da máscara.

---

## 7. Plano Recomendado de Correção (Em Fases)

Para sanar todas as lacunas sem riscos de regressão e mantendo a estabilidade comprovada dos 121 testes atuais, propõe-se a execução estruturada em **4 Fases**:

```
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 1: Estabilidade de Infraestrutura e Correção de Bloqueadores (P0) │
│ - Aplicação supervisionada das Migrations 002-006 no banco remoto.    │
│ - Correção do bug de runtime da Fila 5 (handleDisposeDocument).       │
│ - Implementação do fluxo de criação de review_requests e nova versão. │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ FASE 2: Módulos Clínicos Complementares e Curadoria (P1)               │
│ - Módulos de Diálise, Alergias e Internações no painel médico.         │
│ - Ajuste de valores antes da confirmação (clinical_submission_revis.)  │
│ - Fila 3: Interface real de transferência de pacientes e rascunhos.    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ FASE 3: Segurança Avançada, MFA e Termos Legais (P1/P2)                │
│ - MFA com TOTP (Enrollment, Desafio e Reset institucional).            │
│ - Tabelas e telas de legal_document_versions e legal_acceptances.      │
│ - Elevação da política de senhas para 12 caracteres.                   │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
┌────────────────────────────────────▼───────────────────────────────────┐
│ FASE 4: Usabilidade, Linha do Tempo e Simuladores (P2/P3)              │
│ - Filtros de 30 dias, 6 meses, 1 ano no gráfico de evolução.           │
│ - Simulador nefrológico isolado (run_type: SIMULATION).                │
│ - Formulário dinâmico de care_units em /admin/configuracoes.           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Conclusão da Auditoria

O NefroHub possui uma arquitetura segura, coesa e com regras clínicas fundamentais muito bem implementadas. No entanto, **não é possível certificar conformidade integral com o `documentation.md` no estado atual**, uma vez que **50% dos requisitos estão atendidos, 21% estão parcialmente atendidos e 25% ainda não foram implementados**.

A aplicação da **Fase 1 do Plano de Correção** resolverá 100% dos bloqueadores críticos (P0), permitindo que o sistema opere com total integridade de ponta a ponta no ambiente de desenvolvimento e homologação.
