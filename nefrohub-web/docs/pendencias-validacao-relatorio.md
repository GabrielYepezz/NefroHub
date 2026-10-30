# Relatório de Pendências, Limitações e Validações Adicionais do NefroHub

**Documento:** Anexo Técnico do Relatório Acadêmico (Capítulos 4 e 5)  
**Projeto:** NefroHub — Plataforma Web de Acompanhamento Nefrológico Longitudinal  
**Data:** 29 de Outubro de 2026  
**Finalidade:** Registrar com transparência e rigor acadêmico as limitações técnicas, os módulos pendentes de desenvolvimento, as restrições de observabilidade e os itens que exigem validação clínica ou jurídica institucional.

---

## 1. Funcionalidades com Implementação Parcial

### 1.1. Histórico de Internações Hospitalares (RF-056 — Seção 8.8)
* **Situação Atual:** A modelagem relacional, constraints de integridade temporal (`discharge_date >= admission_date`), tipos enumerados de desfecho (`ALTA_MELHORADA`, `ALTA_A_PEDIDO`, `TRANSFERENCIA`, `OBITO`, `EM_ANDAMENTO`) e políticas RLS foram totalmente estruturadas na migration local `docs/migrations/008_hospitalizations.sql`. A lógica de validação de esquemas Zod foi testada com sucesso em `tests/phase4-5-allergies-and-hospitalizations.test.mjs`.
* **Pendência:** A tabela `public.hospitalizations` ainda não foi criada no banco de dados Supabase remoto para respeitar a diretriz de não-execução de DDLs em ambiente compartilhado sem autorização expressa. A interface de cadastro e visualização no portal médico aguarda a aplicação remota da tabela.

### 1.2. Hardening do Trigger de Novos Usuários (SEC-01 — Seção 15.3)
* **Situação Atual:** A vulnerabilidade de potencial auto-elevação de privilégios via API pública anônima do Supabase foi neutralizada no frontend (Server Actions fixam `role = 'PATIENT'`) e a migration corretiva para o banco de dados foi formulada em `docs/migrations/007_hardening_handle_new_auth_user.sql`.
* **Pendência:** O trigger `handle_new_auth_user` na instância PostgreSQL remota ainda opera na versão original. A aplicação do patch de segurança no banco remoto aguarda autorização administrativa formal.

### 1.3. Criptografia Simétrica de CPF em Repouso (RF-013 — Seção 3.2)
* **Situação Atual:** A deduplicação sem vazamento opera com segurança através do Blind Index criptográfico HMAC-SHA-256 (`cpf_hash`) e a interface exibe estritamente a versão mascarada (`cpf_masked`).
* **Pendência:** A coluna `cpf_encrypted` para armazenamento cifrado reversível em repouso (utilizando chave simétrica AES-GCM pelo servidor) não está ativada no fluxo de escrita, gravando-se atualmente o hash e a máscara.

---

## 2. Requisitos Previstos no PRD Não Implementados na Aplicação

### 2.1. Módulo de Diálise: Hemodiálise e Diálise Peritoneal (RF-055 — Seção 8.7)
* **Situação Atual:** As tabelas relacionais `dialysis_treatments` e `dialysis_sessions` foram criadas no schema do banco de dados na migration consolidada 002-006.
* **Pendência:** Não há interface gráfica nem Server Actions no painel médico para registrar parâmetros de diálise (acesso vascular, peso seco, ganho interdialítico, ultrafiltração, intercorrências de sessão). O módulo encontra-se pendente de desenvolvimento no frontend.

### 2.2. Fila 3: Desativação Médica e Reatribuição Clínica em Lote (RF-005, RF-006, RF-043 — Seções 4.5 e 7.3)
* **Situação Atual:** O backend valida a regra que impede a desativação de um médico se ele for o único responsável por pacientes ativos (testado em `tests/phase5-0-functional-completeness.test.mjs`). Na interface administrativa (`AdminQueuesClient.tsx`), a Fila 3 exibe um componente vazio (`EmptyState`).
* **Pendência:** Faltam a tela e o fluxo interativo para selecionar o médico substituto e transferir em lote os vínculos e rascunhos pendentes antes de efetivar a desativação.

### 2.3. Governança Dinâmica de Termos de Uso e Consentimento LGPD (RF-073, RF-074 — Seção 12.3)
* **Situação Atual:** A tela `/admin/legal` exibe o conteúdo textual estático dos Termos de Uso e Política de Privacidade.
* **Pendência:** Não estão implementadas as tabelas `legal_document_versions` e `legal_acceptances`. O sistema ainda não bloqueia o login de usuários para exigir o aceite obrigatório de novas versões de termos de privacidade.

### 2.4. Filtros Temporais Dinâmicos no Gráfico de Evolução (RF-058 — Seção 9.1)
* **Situação Atual:** O gráfico interativo Recharts plota todos os registros históricos de Creatinina e eTFG em ordem cronológica crescente.
* **Pendência:** Faltam seletores rápidos de período na interface (últimos 30 dias, 6 meses, 1 ano, personalizado) para filtrar os pontos temporais da curva.

---

## 3. Limitações Técnicas e de Observabilidade

1. **Ausência de Repositório Git Local:** O ambiente de trabalho não possui a pasta `.git` inicializada. Toda a auditoria de arquivos e versionamento baseia-se na árvore estática do sistema de arquivos e nos arquivos de configuração do ecossistema Node.js.
2. **Ambiente Supabase Compartilhado:** A base de dados é compartilhada entre desenvolvimento e apresentação institucional, exigindo a desativação de scripts de limpeza automática em massa (`ENABLE_E2E_REMOTE_CLEANUP = false`) e o uso exclusivo de dados sintéticos rastreáveis (`@nefrohub.test`).
3. **Fatores Físicos de MFA:** O fluxo de autenticação em duas etapas TOTP foi validado tecnicamente, na máquina de estados da sessão (AAL1 vs AAL2) e nos middlewares de borda. No entanto, o enrollment de aplicativos autenticadores físicos externos (ex: Google Authenticator em smartphones) não é executado automaticamente pela suíte Playwright para não consumir cotas ou travar credenciais operacionais.
4. **Armazenamento de Laudos:** Os laudos de testes automatizados utilizam buffers binários sintéticos em formato PDF legítimo (`%PDF-1.4`), assegurando testes sem manipulação de prontuários reais de pacientes.

---

## 4. Pontos que Dependem de Validação Clínica e Jurídica

1. **Validação da Calculadora CKD-EPI 2021:** A implementação matemática da fórmula CKD-EPI 2021 sem coeficiente racial (Inker et al., NEJM 2021) foi testada com 100% de precisão para 4 casos de referência da literatura médica. Contudo, recomenda-se a homologação formal por um comitê nefrológico antes do uso clínico assistencial em ambiente hospitalar.
2. **Homologação dos Termos LGPD:** Os textos e políticas de privacidade devem passar por revisão do encarregado de dados (DPO) e da assessoria jurídica da instituição hospitalar para parametrização dos prazos de guarda e retenção de prontuários (Lei Federal nº 13.787/2018).
