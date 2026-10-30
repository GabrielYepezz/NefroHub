# 5 RESULTADOS

Neste capítulo são apresentados os resultados empíricos e funcionais obtidos a partir do desenvolvimento do NefroHub. A avaliação do produto fundamenta-se nas funcionalidades efetivamente entregues, na conformidade do comportamento do software em relação aos requisitos documentados, na integridade dos dados observada na base de dados relacional e nos resultados obtidos a partir da execução automatizada de suítes de testes unitários, testes de integração de regras clínicas e testes de ponta a ponta (*End-to-End* — E2E) no navegador.

---

## 5.1 O NEFROHUB EM FUNCIONAMENTO

O NefroHub opera como uma solução web integrada em ambiente de produção local e remoto, conectando as pontas do cuidado nefrológico ambulatorial e hospitalar. O funcionamento do sistema estrutura-se em uma jornada assistencial coesa, percorrida por meio de interfaces web reativas e responsivas.

A jornada do paciente inicia-se no formulário de auto-cadastro em `/auth/register`. O paciente registra seu nome, e-mail, telefone e define uma frase-senha em conformidade com a política de complexidade mínima de 12 caracteres. Ao concluir o envio, o sistema autentica a sessão e direciona o usuário ao seu painel em `/patient/dashboard`. Nesse portal, o paciente visualiza suas medições mais recentes e utiliza o formulário lateral para submeter sua pressão arterial diária e peso seco. A submissão ingressa imediatamente em estado de pendência (`PENDING_VALIDATION`), garantindo que o paciente compreenda que seus dados aguardam curadoria médica antes de ingressarem no histórico oficial.

Simultaneamente, o médico assistente acessa a plataforma em `/doctor`. Caso o profissional possua o segundo fator ativado, a tela de login exige o código TOTP de 6 dígitos para elevação a AAL2. No painel clínico, o médico visualiza exclusivamente os pacientes sob sua responsabilidade formal (Zero-Trust). Ao selecionar um paciente, o prontuário é renderizado dinamicamente:
* Na **Fila de Curadoria Clínica**, o médico analisa a aferição domiciliar enviada pelo paciente (ex: PA 130x85 mmHg e peso 72.5 kg). Com um único clique em `Confirmar no Prontuário`, a rotina atômica transiciona o registro para `CONFIRMED`.
* O histórico é atualizado instantaneamente, e o ponto de dado passa a alimentar os gráficos evolutivos e indicadores do paciente.
* No modal de exames laboratoriais, o médico lança um exame de Creatinina Sérica (ex: 1.4 mg/dL). O sistema calcula instantaneamente a eTFG estimada pela fórmula CKD-EPI 2021 (56 mL/min/1.73m²), classifica o paciente no estágio KDIGO G3a e plota o ponto na curva cronológica interativa Recharts.
* O paciente anexa um laudo ultrassonográfico em PDF; o sistema valida a assinatura binária `%PDF-1.4`, calcula o hash SHA-256 e o armazena em bucket privado. O médico abre o arquivo através de uma URL assinada temporária válida por 15 minutos.
* Caso haja divergência em um registro confirmado, o paciente aciona o botão `Pedir Correção`. A solicitação é enviada para a Fila 4 do Administrador (`/admin/filas`), que despacha a retificação gerando um novo registro encadeado (`supersedes_record_id`) sem apagar o histórico original.

---

## 5.2 RESULTADOS DA IMPLEMENTAÇÃO DOS MÓDULOS FUNCIONAIS

Os resultados alcançados na implementação dos módulos do sistema são sintetizados a seguir:

* **Gerenciamento de Pacientes e Identidade:** Separação física e lógica consolidada entre o perfil civil (`patient_profiles`) e a conta de autenticação (`users`). O sistema suporta pacientes sem conta própria através de representação legal revogável, garantindo atendimento a menores e pessoas sob tutela.
* **Associação Médico-Paciente e Coordenação:** Imposição do médico primário único por paciente, com rebaixamento automático de primários anteriores. Implementação do papel *Doctor Master* com modal dedicado para assumir cobertura clínica emergencial em plantões e intercorrências, auditado com justificativa mínima de 15 caracteres.
* **Prontuário e Curadoria Clínica:** Máquina de quatro estados plenamente funcional. As aferições domiciliares dos pacientes permanecem isoladas em `PENDING_VALIDATION` até a aprovação pelo médico vinculado, garantindo a idoneidade clínica do prontuário.
* **Exames Laboratoriais e Métricas:** Catálogo de 10 exames renais essenciais operando com tipo PostgreSQL `NUMERIC`, suporte nativo à notação decimal brasileira e lançamento transacional atômico via RPC `rpc_record_lab_exam`.
* **Calculadora CKD-EPI 2021:** Implementação da equação oficial sem coeficiente racial, estadiamento KDIGO automático (G1 a G5) e persistência auditável de metadados em `calculation_runs`.
* **Visualização da Curva Longitudinal:** Gráfico cronológico Recharts plotando eTFG e Creatinina com eixos de ordenadas independentes, escala temporal dinâmica e tooltips informativos.
* **Documentos e Laudos Digitalizados:** Pipeline de upload com barreira tripla de segurança (validação de *magic bytes*, hash SHA-256 e nomes sanitizados contra Directory Traversal) e emissão de URLs assinadas com TTL de 900s em bucket estritamente privado.
* **Alergias e Reações Adversas:** Módulo clínico estruturado sobre a tabela `allergies`, implementando com rigor o triplo estado de informação do PRD Seção 8.6 (*Alergia Conhecida*, *Nega Alergias*, *Informação Não Relatada*) e fluxo formal de inativação.
* **Comorbidades e Fármacos Contínuos:** Módulos de acompanhamento longitudinal no painel médico e dashboard do paciente, com suporte a CID-10 e versionamento com bloqueio otimista contra concorrência.
* **Administração, Filas e Auditoria:** Backoffice operacional composto por cinco filas de triagem e trilha de auditoria append-only (`audit_events`) consultável em `/admin/auditoria`.

---

## 5.3 APLICAÇÃO DAS REGRAS DE NEGÓCIO

A Tabela 1 relaciona as regras de negócio críticas definidas no PRD aos comportamentos concretos verificados no sistema e suas respectivas evidências.

*Tabela 1 — Mapeamento entre Regras de Negócio e Comportamentos Implementados.*

| Regra de Negócio (PRD) | Comportamento Esperado | Comportamento Observado e Evidência |
| :--- | :--- | :--- |
| **Isolamento Zero-Trust (Seção 4.1 e 4.4)** | Médico só enxerga pacientes com vínculo ativo formal. | Médico não vinculado visualiza lista vazia (`Nenhum paciente vinculado`) e buscas por terceiros retornam vazio. Testado em `04-doctor-...` e `06-full-lifecycle...`. |
| **Imutabilidade Pós-Confirmação (Seção 6.2)** | Registros em status `CONFIRMED` não podem ser alterados ou apagados. | Trigger PostgreSQL `prevent_confirmed_clinical_records_mutation` aborta tentativas de update/delete. Ausência de botões de edição na UI. |
| **Retificação com Encadeamento (Seção 6.6)** | Correções geram nova versão sem sobrescrever o registro original. | Aprovação na Fila 4 gera linha filha com `supersedes_record_id` apontando para o original, mantendo a série histórica íntegra. |
| **Triplo Estado de Alergias (Seção 8.6)** | Ausência de registro não é ausência de alergia. | Sistema distingue `KNOWN`, `NO_KNOWN_ALLERGIES` e exibe aviso clínico explícito para `UNREPORTED`. Testado em `phase4-5-...`. |
| **MFA Obrigatório para Profissionais (Seção 15.1)** | Médicos e admins exigem AAL2; pacientes operam em AAL1. | Middleware (`proxy.ts`) barra sessões AAL1 de médicos/admins redirecionando a `/login?mfa=true`. Pacientes navegam normalmente. |
| **Firewall de E-mails LGPD (Seção 7.4)** | E-mails transacionais nunca contêm exames ou diagnósticos. | Sanitizador bloqueia medições numéricas, CPFs, CNS e termos como "hemodiálise" e "creatinina". Testado em `phase5-1-...`. |
| **Anti-Escalonamento em Cadastros (Seção 3.4)** | Visitante não pode autoatribuir papel de médico ou admin. | Server Action `registerAction` fixa `role: 'PATIENT'` no servidor, descartando campos manipulados pelo cliente. |
| **Privacidade de Documentos (Seção 11.2)** | Bucket é privado; acesso apenas via link temporário. | Download direto sem token assinado retorna HTTP 403 Forbidden. URLs assinadas expiram estritamente em 15 minutos (900s). |

---

## 5.4 SEGURANÇA E CONTROLE DE ACESSO IMPLEMENTADOS

Os resultados dos mecanismos de segurança foram categorizados em quatro níveis de comprovação:

```
┌────────────────────────────────────────────────────────────────────────┐
│ NÍVEIS DE COMPROVAÇÃO DE SEGURANÇA DO NEFROHUB                         │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Verificados em Ambiente de Execução Real (E2E & Runtime)            │
│    - Barreira de rotas no middleware (proxy.ts) para RBAC e MFA AAL2.  │
│    - Isolamento de pacientes por auth.uid() e vínculos ativos.         │
│    - Imutabilidade física de registros confirmados no banco de dados.  │
│    - URLs assinadas temporárias de 15 minutos no Supabase Storage.     │
│    - Logout com invalidação de cookies e bloqueio do botão Voltar.     │
│                                                                        │
│ 2. Cobertos por Testes Automatizados Unitários e de Integração        │
│    - Firewall anti-vazamento de dados clínicos e CPFs em e-mails.      │
│    - Bloqueio otimista contra concorrência em aprovações de filas.     │
│    - Validação de cabeçalhos binários (magic bytes %PDF-1.4, JPEG).    │
│    - Regras matemáticas e limites de segurança da calculadora CKD-EPI. │
│                                                                        │
│ 3. Implementados em Migração Local Aguardando Aplicação Remota         │
│    - Hardening de trigger handle_new_auth_user contra escalonamento.   │
│    - Tabela hospitalizations com restrição temporal (alta >= admissão).│
│                                                                        │
│ 4. Pendentes de Desenvolvimento                                        │
│    - Barreira dinâmica de consentimento e termos legais no login.      │
│    - Reatribuição interativa em lote de pacientes na Fila 3.           │
└────────────────────────────────────────────────────────────────────────┘
```

A integridade do banco de dados compartilhado permaneceu rigorosamente preservada: as 4 contas institucionais preexistentes (`admin@nefrohub.com.br`, `nikolasaldo.ms@gmail.com`, `drauzio@yopmail.com`, `testlink@example.com`) foram mantidas 100% intactas, e todos os testes operaram exclusivamente com identidades sintéticas identificáveis sob o domínio `@nefrohub.test`.

---

## 5.5 TESTES E VALIDAÇÃO DOS REQUISITOS

A estratégia de testes do projeto combinou três camadas complementares de garantia da qualidade:

1. **Testes Unitários e Funcionais (Node.js Test Runner):**
   * **Total de Testes:** **159 testes aprovados (100% PASS)** em 64 suítes, com tempo total de execução de ~1,9 segundo.
   * **Escopo:** Validação dos algoritmos matemáticos da equação CKD-EPI 2021, máquina de estados finitos, firewall de privacidade LGPD, templates transacionais, rotinas de representação legal e comorbidades/alergias.
2. **Testes de Ponta a Ponta E2E (Playwright Test):**
   * **Total de Cenários:** **32 cenários aprovados (100% PASS)** em 6 arquivos de especificação (`tests/e2e/*.spec.ts`), com duração total de ~3,7 minutos em Chromium headless.
   * **Escopo:** Autenticação e MFA, governança administrativa e Filas 1 a 5, portal do paciente e submissões domiciliares, prontuário médico longitudinal e CKD-EPI, upload e curadoria de laudos, e a suíte completa de ciclo de vida (E2E-01 a E2E-10).
3. **Checagem Estática e Compilação:**
   * **TypeScript (`tsc --noEmit`):** 0 erros de tipagem estática.
   * **Compilação de Produção (`next build`):** 19 rotas compiladas com sucesso utilizando o compilador Turbopack.

*Nota Técnica:* Todos os testes foram executados contra o servidor web real na porta 3000 e a base de dados remota do Supabase em modo somente leitura para verificações pós-teste, sem disparar e-mails reais e sem executar scripts de limpeza destrutiva automática.

---

## 5.6 REQUISITOS PREVISTOS × FUNCIONALIDADES IMPLEMENTADAS

A Tabela 2 apresenta o balanço consolidado entre os requisitos definidos em `documentation.md` e a situação real encontrada no produto.

*Tabela 2 — Comparativo entre Requisitos Previstos e Funcionalidades Implementadas.*

| Módulo Funcional | Requisitos Catalogados | Concluídos (`IMPLEMENTED`) | Parciais (`PARTIAL`) | Não Implementados (`MISSING`) | Conflitos (`CONFLICT`) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **1. Identidade e Cadastro** | 8 | 6 | 1 (RF-013) | 0 | 1 (RF-018) |
| **2. Usuários e Governança** | 6 | 3 | 2 (RF-004, RF-005) | 1 (RF-006) | 0 |
| **3. Segurança e Acesso** | 4 | 4 | 0 | 0 | 0 |
| **4. Vínculos Clínicos** | 5 | 5 | 0 | 0 | 0 |
| **5. Representação Legal** | 5 | 5 | 0 | 0 | 0 |
| **6. Prontuário e Curadoria** | 12 | 11 | 0 | 1 (RF-035) | 0 |
| **7. Filas Administrativas** | 5 | 4 | 0 | 1 (RF-043) | 0 |
| **8. Comunicações e E-mails** | 3 | 2 | 0 | 0 | 1 (RF-048) |
| **9. Catálogo e Diagnóstico** | 8 | 5 | 1 (RF-056) | 2 (RF-054, RF-055) | 0 |
| **10. Visualização e Gráficos** | 4 | 2 | 0 | 2 (RF-058, RF-059) | 0 |
| **11. Calculadoras Clínicas** | 5 | 4 | 0 | 1 (RF-064) | 0 |
| **12. Documentos e Laudos** | 5 | 5 | 0 | 0 | 0 |
| **13. Auditoria e Retenção** | 6 | 4 | 1 (RF-075) | 1 (RF-073) | 0 |
| **TOTAL** | **76** | **60 (78,9%)** | **5 (6,6%)** | **9 (11,8%)** | **2 (2,6%)** |

*Análise da Cobertura:* O núcleo assistencial e de governança clínica do NefroHub alcançou **78,9% de conclusão integral**, contemplando a totalidade dos fluxos críticos de autenticação multifator, cadastro com CRM, portal do paciente, prontuário médico longitudinal, curadoria com imutabilidade física, calculadora CKD-EPI 2021, laudos privados e auditoria append-only.

---

## 5.7 LIMITAÇÕES TÉCNICAS E PONTOS PENDENTES

A análise do produto identificou limitações que delimitam o escopo atual e orientam a evolução futura da plataforma:

1. **Ausência de Módulo de Diálise na Interface:** As entidades relacionais de hemodiálise e diálise peritoneal (`dialysis_treatments` e `dialysis_sessions`) encontram-se estruturadas no banco, mas não possuem telas de lançamento ambulatorial no painel do médico.
2. **Reatribuição em Lote na Fila 3:** O bloqueio da desativação de médicos com pacientes vinculados está ativo no servidor, mas a interface administrativa ainda não disponibiliza a rotina de reatribuição em lote para transferência direta da carteira assistencial.
3. **Persistência de Termos Legais e Consentimento LGPD:** A visualização dos termos é estática em `/admin/legal`; o bloqueio obrigatório no login condicionado à aceitação de novas versões de termos de privacidade depende da criação das tabelas de aceite.
4. **Filtros Temporais no Gráfico Recharts:** A curva longitudinal plota todos os registros históricos cronológicos sem seletores rápidos de período (30 dias, 6 meses, 1 ano).
5. **Necessidade de Homologação Clínica Institucional:** Conquanto a fórmula CKD-EPI 2021 tenha sido validada com 100% de exatidão matemática frente a casos de referência da literatura médica, a adoção em ambiente hospitalar assistencial real requer aprovação e parametrização formal por um comitê de nefrologia médica da instituição contratante.
