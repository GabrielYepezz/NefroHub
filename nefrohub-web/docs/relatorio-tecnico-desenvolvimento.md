# 4 DESENVOLVIMENTO

O desenvolvimento do NefroHub orientou-se pelo propósito de conceber uma plataforma web segura e escalável voltada ao acompanhamento clínico longitudinal de pacientes portadores de Doença Renal Crônica (DRC). No contexto da nefrologia contemporânea, a progressão silenciosa da perda da taxa de filtração glomerular e a complexidade do manejo de comorbidades correlatas — em especial a hipertensão arterial sistêmica e o diabetes mellitus — demandam a consolidação contínua de parâmetros laboratoriais e aferições domiciliares. Contudo, a inserção não supervisionada de dados por pacientes em sistemas hospitalares introduz riscos graves de contaminação do prontuário por aferições espúrias ou incorretas.

Para responder a esse desafio, o processo de desenvolvimento estruturou-se em torno de um modelo de governança clínica rigoroso. A arquitetura de software implementada separa as aferições domiciliares enviadas pelo paciente da série histórica definitiva do prontuário, exigindo a mediação ativa e a homologação formal pelo médico assistente devidamente vinculado. Adicionalmente, o desenvolvimento incorporou salvaguardas estritas de integridade transacional, imutabilidade física de registros confirmados (em conformidade com a Lei Federal nº 13.787/2018 sobre prontuários eletrônicos) e princípios de privacidade e minimização de dados pautados pela Lei Geral de Proteção de Dados Pessoais (LGPD, Lei nº 13.709/2018).

As etapas de engenharia contemplaram a análise e especificação de requisitos clínicos e institucionais, a elaboração da arquitetura baseada em componentes de servidor com renderização híbrida, a modelagem relacional de dados com controle de acesso em nível de linha (*Row Level Security* — RLS), a codificação orientada a tipos estáticos com TypeScript e a validação contínua por meio de suítes de testes unitários, testes de integração de regras clínicas e testes de ponta a ponta (*End-to-End* — E2E) com navegação real automatizada.

---

## 4.1 REQUISITOS E INTERFACE DO SISTEMA

### 4.1.1 Problema Motivador e Público-Alvo
A Doença Renal Crônica caracteriza-se pela perda progressiva e irreversível da função dos rins, classificada internacionalmente pelas diretrizes KDIGO (*Kidney Disease: Improving Global Outcomes*) em cinco estágios baseados na Taxa de Filtração Glomerular estimada (eTFG) e na albuminúria. Em estágios iniciais e intermediários (G1 a G3b), o curso clínico é frequentemente oligossintomático, dependendo criticamente do rastreamento laboratorial longitudinal de creatinina sérica e do controle rígido da pressão arterial e do peso corporal.

Identificou-se que os sistemas de informação hospitalares tradicionais frequentemente tratam o paciente de forma passiva, dispersando resultados laboratoriais em formatos impressos desestruturados (PDFs de diferentes laboratórios de análise clínica) e impossibilitando o monitoramento ambulatorial de parâmetros coletados no domicílio. Por outro lado, plataformas abertas de autoatendimento permitem a livre edição e exclusão de métricas pelo próprio usuário, inviabilizando a confiabilidade jurídica e médica do registro assistencial.

O NefroHub foi concebido para atender a quatro perfis institucionais de usuários com responsabilidades e privilégios estritamente delimitados:
1. **Paciente:** Portador de nefropatia ou pessoa em investigação clínica, responsável por registrar suas aferições domiciliares de pressão e peso, acompanhar a curva longitudinal de sua função renal e digitalizar laudos de exames complementares.
2. **Representante Legal / Cuidador:** Familiar ou responsável autorizado judicialmente ou indicado pelo titular, com capacidade de atuar no portal do paciente sob três modalidades formais de poder: poderes totais, apenas consulta ou restrito ao envio de sinais vitais.
3. **Médico (Nefrologista / Clínico Assistente):** Profissional com CRM e UF homologados, responsável pela assistência direta, lançamento de exames laboratoriais, avaliação automática de eTFG, curadoria e confirmação das medições domiciliares, acompanhamento de comorbidades, fármacos e alergias.
4. **Doctor Master (Coordenação Clínica):** Função médica de coordenação que, mantendo o princípio de menor privilégio, possui autorização para assumir cobertura clínica emergencial ou substituição temporária de plantão, condicionada à inserção de justificativa auditável obrigatória.
5. **Administrador:** Responsável pela governança institucional, homologação de contas médicas, auditoria de segurança e despacho das filas de retificação de dados e descarte documental.

### 4.1.2 Requisitos Funcionais e Não Funcionais
A especificação do sistema consolidou 76 requisitos funcionais catalogados na documentação oficial (`documentation.md`). Dentre os principais grupos funcionais destacam-se:
* **Módulo de Identidade e Vínculos (RF-001 a RF-028):** Cadastro institucional com CRM/UF; separação ontológica entre a pessoa física do paciente e sua conta digital; proibição de autoatendimento autônomo no MVP; estabelecimento obrigatório de médico assistente primário; e gestão de mandatos de representação legal revogáveis.
* **Módulo de Prontuário e Curadoria Clínica (RF-029 a RF-045):** Máquina de estados finitos (`PENDING_VALIDATION`, `CONFIRMED`, `REJECTED`, `SUPERSEDED`); imutabilidade de registros clínicos confirmados no banco de dados; fluxo formal de retificação em fila de governança com encadeamento de versão (`supersedes_record_id`); e descarte documental com expurgo ou arquivamento de 20 anos.
* **Módulo Laboratorial e Diagnóstico (RF-049 a RF-056):** Catálogo renal estruturado de exames; precisão de ponto fixo `NUMERIC` para creatinina; gestão de comorbidades (com CID-10 opcional); medicamentos de uso contínuo com posologia; e gestão de alergias com o triplo estado de informação (*Alergia Conhecida*, *Nega Alergias Conhecidas*, *Informação Não Relatada*).
* **Módulo de Cálculo e Visualização (RF-057 a RF-065):** Implementação exclusiva da equação oficial CKD-EPI 2021 sem coeficiente racial para adultos; persistência imutável dos parâmetros de cálculo em `calculation_runs`; e linha do tempo gráfica interativa correlacionando eTFG e creatinina.
* **Módulo de Documentos e Arquivos (RF-066 a RF-070):** Upload restrito a PDF, PNG e JPEG até 10 MB com validação de cabeçalho binário (*magic bytes*); hashing determinístico SHA-256; e distribuição segura por meio de URLs assinadas temporárias de 15 minutos em bucket estritamente privado.

Dentre os requisitos não funcionais, estabeleceram-se: segurança Zero-Trust com autenticação em duas etapas (MFA/TOTP) para profissionais e administradores; tempo de resposta de interface inferior a 500 ms em transições comuns; conformidade estrita com o padrão de acessibilidade WCAG 2.1 AA (contraste mínimo de 4,5:1); e firewall de privacidade clínica para impedir a evasão de dados de saúde ou identificadores completos em comunicações externas e trilhas de log.

### 4.1.3 Interface e Experiência do Usuário (UX/UI)
O projeto da interface fundamentou-se nos princípios do *Design System* moderno de saúde, priorizando legibilidade, densidade de dados equilibrada e baixa carga cognitiva. A paleta cromática adotada emprega o verde-azulado institucional (*Teal* / *Deep Slate*) como cor primária (representando estabilidade e precisão técnica), complementada por cinzas neutros de alto contraste para suporte à leitura clínica contínua.

A experiência do usuário organiza-se em layouts responsivos adaptados para computadores de mesa em consultórios, tablets em enfermarias e dispositivos móveis utilizados por pacientes em ambiente doméstico. O portal do médico estrutura-se em um grid clínico de duas colunas: à esquerda, a listagem de pacientes vinculados com barra de pesquisa clínica com *debounce* temporal (insensível a acentos e maiúsculas); à direita, o prontuário multifacetado do paciente selecionado contendo cards de identificação biológica, fila de curadoria pendente, gráfico longitudinal interativo, histórico laboratorial imutável, comorbidades, medicações e gestão de alergias.

O portal do paciente apresenta métricas resumidas dos últimos exames confirmados através de cards de destaque (eTFG, creatinina, último peso), formulário simplificado de registro de sinais vitais, listagem de documentos anexados e visualização categorizada de submissões pendentes, confirmadas e não aceitas (com a respectiva justificativa clínica informada pelo médico).

*Sugestão de Figura 1:* Captura de tela do Painel do Médico (`/doctor`) exibindo a seleção de paciente, a curva longitudinal Recharts e a Fila de Curadoria de sinais vitais pendentes.  
*Sugestão de Figura 2:* Captura de tela do Dashboard do Paciente (`/patient/dashboard`) exibindo métricas consolidadas e o formulário de envio de medições domiciliares.  
*Sugestão de Figura 3:* Captura de tela do Painel de Governança Administrativa (`/admin/filas`) exibindo as 5 filas de triagem e homologação institucional.

---

## 4.2 ARQUITETURA GERAL

A arquitetura do NefroHub segue o paradigma de aplicação web moderna baseada em componentes de servidor (*React Server Components* — RSC) integrado ao padrão *Server Actions* e arquitetura de banco de dados como serviço (BaaS) com o Supabase/PostgreSQL. A Figura 4 ilustra o modelo arquitetural implementado.

```
       +--------------------------------------------------------------+
       |                  NAVEGADOR DO CLIENTE                        |
       |  (React 19 Client Components / HTML5 / CSS3 Tailwind v4)      |
       +------------------------------+-------------------------------+
                                      | Requisições HTTP / WebSockets
                                      v
       +--------------------------------------------------------------+
       |               CAMADA DE BORDA E SERVIDOR                     |
       |                   (Next.js 16 App Router)                    |
       |                                                              |
       |  [ proxy.ts (Middleware de Borda) ]                          |
       |    - Validação de Sessão JWT                                 |
       |    - Controle de Rotas RBAC (Admin, Doctor, Patient)         |
       |    - Verificação de Garantia MFA (AAL1 vs AAL2)              |
       |                                                              |
       |  [ Server Actions & Server Components ]                      |
       |    - Validação de Entrada Zod (Camada Defensiva)             |
       |    - Verificação de Vínculo Clínico (Zero-Trust)             |
       |    - Calculadora Matemática CKD-EPI 2021                     |
       |    - Firewall de Privacidade LGPD (Sanitizer)                |
       |    - Cliente SMTP Resiliente (Nodemailer Simulado/Real)      |
       +------------------------------+-------------------------------+
                                      | Pool de Conexões TLS / REST
                                      v
       +--------------------------------------------------------------+
       |             INFRAESTRUTURA SUPABASE / POSTGRESQL 17          |
       |                                                              |
       |  [ Supabase Auth ]                                           |
       |    - Identidades de Acesso, Hashing de Senhas, Tokens MFA    |
       |                                                              |
       |  [ PostgreSQL Schema 'public' ]                              |
       |    - Políticas RLS (Row Level Security) Ativas               |
       |    - Funções SECURITY DEFINER (Desacoplamento de RLS)        |
       |    - 14 Funções RPC Atômicas (Transações Clínicas)           |
       |    - Triggers de Integridade e Imutabilidade                 |
       |    - Trilha de Auditoria Append-Only                         |
       |                                                              |
       |  [ Supabase Storage ]                                        |
       |    - Bucket Privado 'clinical-documents'                     |
       |    - Emissão de URLs Assinadas com TTL de 900s               |
       +--------------------------------------------------------------+
```
*Figura 4 — Diagrama da Arquitetura Geral do NefroHub.*

A camada de servidor do Next.js atua como barreira de segurança e orquestrador de regras de negócio. O arquivo `src/proxy.ts` intercepta todas as requisições de entrada, inspecionando o token de sessão e o nível de garantia de autenticação (*Authenticator Assurance Level* — AAL). Caso um usuário com papel de médico ou administrador possua MFA configurado e sua sessão encontre-se em AAL1, o acesso às rotas protegidas (`/doctor` e `/admin`) é sumariamente bloqueado, direcionando-o para a conclusão do desafio TOTP.

A comunicação com o banco de dados ocorre sob dois contextos de privilégio:
1. **Cliente Autenticado do Usuário (`createClient`):** Opera no contexto da sessão do usuário final, submetendo todas as consultas às restrições de RLS configuradas no PostgreSQL.
2. **Cliente Administrativo de Serviço (`createServerClient` com `service_role`):** Restrito estritamente a Server Actions protegidas no servidor para tarefas de governança (criação de médicos pelo administrador, auditoria imutável, enriquecimento desacoplado de dados em filas). A chave de serviço jamais é exposta ao código executado no navegador.

---

## 4.3 TECNOLOGIAS E FERRAMENTAS UTILIZADAS

O ecossistema tecnológico do projeto foi selecionado para garantir robustez, tipagem estática ponta a ponta e alta integridade transacional:

* **Next.js 16.2.6 & React 19:** Utilizado como framework full-stack principal. A adoção do *App Router* com *Turbopack* viabilizou a renderização otimizada de páginas no servidor, reduzindo o volume de JavaScript transferido ao cliente e eliminando a necessidade de expor APIs REST públicas desprotegidas para as operações do sistema.
* **TypeScript 5:** Linguagem adotada em todo o frontend, camada de servidor e scripts de teste, garantindo segurança de tipos estáticos em contratos de dados clínicos, interfaces de banco de dados e validação de parâmetros de cálculo.
* **Tailwind CSS v4:** Framework de estilização utilitária de última geração, empregado na implementação do Design System clínico institucional, garantindo responsividade, classes de layout semânticas e consistência visual.
* **Supabase / PostgreSQL 17.6:** Sistema de Gerenciamento de Banco de Dados Relacional. Fornece a infraestrutura de dados sob o schema `public`, com suporte avançado a tipos numéricos exatos (`NUMERIC(5,2)`), índices relacionais, funções procedurais em PL/pgSQL, triggers e políticas RLS.
* **Zod 3.24:** Biblioteca de validação e inferência de esquemas TypeScript. Empregada no servidor como primeira linha de defesa (*input validation*) para todas as Server Actions (autenticação, sinais vitais, exames laboratoriais, justificativas clínicas e arquivos).
* **Playwright Test v1.58.2:** Framework de testes de ponta a ponta que automatiza a navegação real em navegadores Chromium headless, simulando as interações de pacientes, médicos e administradores.
* **Node.js Test Runner (nativo `node:test`):** Módulo de testes unitários e de integração de alto desempenho, utilizado na validação matemática da calculadora CKD-EPI, dos sanitizadores de privacidade e das máquinas de estados.
* **Recharts:** Biblioteca de gráficos baseada em SVG e React, empregada no painel do médico para plotagem da curva temporal cronológica de eTFG e creatinina.
* **Nodemailer 6.10:** Biblioteca de transporte de e-mails integrada à camada de mensageria assíncrona, configurada com firewall de privacidade e modo simulado (*mock*) para testes.

---

## 4.4 MODELAGEM E ESTRUTURAÇÃO DO BANCO DE DADOS

O modelo lógico-relacional do NefroHub foi estruturado no schema `public` do PostgreSQL, refletindo as entidades e invariantes clínicas estabelecidas no PRD. A Figura 5 apresenta o modelo de entidades e relacionamentos central do sistema.

```
+-------------------+       +-------------------------+       +------------------------+
|   institutions    |       |      patient_profiles   |       |   physician_profiles   |
+-------------------+       +-------------------------+       +------------------------+
| id (PK)           |<---+  | id (PK)                 |<---+  | id (PK)                |
| name              |    |  | user_id (FK, nullable)  |    |  | user_id (FK, unique)   |
| code              |    +--| institution_id (FK)     |    |  | crm, crm_uf            |
+-------------------+       | full_name, birth_date   |    |  | is_master (boolean)    |
                            | cpf_hash, cpf_masked    |    |  +------------------------+
                            +-------------------------+    |              ^
                                         ^                 |              |
                                         |                 |  +-----------+------------+
                                         |                 |  | physician_patient_links|
                                         |                 |  +------------------------+
                                         |                 |  | id (PK)                |
                                         |                 +--| patient_id (FK)        |
                                         |                    | physician_user_id (FK) |
                                         |                    | status (ACTIVE, ENDED) |
                                         |                    | is_primary (boolean)   |
                                         |                    +------------------------+
                                         v
                            +-------------------------+
                            |    clinical_records     |
                            +-------------------------+
                            | id (PK)                 |
                            | patient_id (FK)         |
                            | record_type (ENUM)      |
                            | status (ENUM)           |
                            | supersedes_record_id(FK)|---+ (auto-relacionamento de
                            | clinical_date           |   |  versões encadeadas)
                            | created_by_user_id      |   |
                            | confirmed_by_user_id    |<--+
                            | confirmed_at            |
                            +-------------------------+
                                 |               |
               +-----------------+               +-----------------+
               v                                                   v
+-----------------------------+                     +-----------------------------+
|         vital_signs         |                     |         lab_results         |
+-----------------------------+                     +-----------------------------+
| id (PK)                     |                     | id (PK)                     |
| clinical_record_id (FK)     |                     | clinical_record_id (FK)     |
| sign_code (BP_SYS, WEIGHT)  |                     | exam_code, exam_name        |
| numeric_value (NUMERIC)     |                     | numeric_value (NUMERIC)     |
| unit                        |                     | original_unit               |
+-----------------------------+                     +-----------------------------+
```
*Figura 5 — Diagrama Entidade-Relacionamento das Entidades Principais do NefroHub.*

### 4.4.1 Decisões de Modelagem e Racional Técnico
1. **Desacoplamento entre Identidade Civil e Conta de Acesso (`patient_profiles` vs `users`):**  
   O campo `patient_profiles.user_id` é modelado como nulo (*nullable*). Essa decisão permite a existência de prontuários ativos de pacientes pediátricos, idosos com exclusão digital ou pessoas incapazes que não possuem smartphone ou e-mail, sendo representados formalmente por seus cuidadores através da tabela `patient_representations`.
2. **Imutabilidade Estrutural e Versionamento Encadeado (`clinical_records`):**  
   A tabela `clinical_records` não suporta mutação destrutiva em registros cujo status seja `CONFIRMED`. Quando uma retificação é homologada pela Fila 4, a Server Action cria uma nova linha na tabela com seu próprio identificador UUID, populando `supersedes_record_id` com o ID do registro anterior. Esse mecanismo assegura rastreabilidade cronológica sem perda de histórico.
3. **Especialização de Dados Clínicos por Chaves Estrangeiras 1:N:**  
   Em vez de utilizar campos genéricos em formato JSON não estruturado, as tabelas `vital_signs` e `lab_results` referenciam `clinical_records.id`. Os valores numéricos utilizam estritamente o tipo PostgreSQL `NUMERIC`, prevenindo erros de arredondamento comuns em tipos de ponto flutuante binário (*IEEE 754 float*).
4. **Resolução de Recursão Infinita em Políticas RLS:**  
   As consultas cruzadas de autorização entre pacientes e médicos geravam recursão cíclica no motor de regras do PostgreSQL (código de erro `42P17`). A arquitetura solucionou a recursão implementando as funções de segurança `public.patient_has_physician_link` e `public.link_belongs_to_patient_user` com a diretiva `SECURITY DEFINER` e `SET search_path = public, pg_temp`, garantindo validação rápida em tempo constante ($O(1)$) sem desativar o isolamento Zero-Trust.

---

## 4.5 IMPLEMENTAÇÃO DOS MÓDULOS FUNCIONAIS

### 4.5.1 Autenticação e Gerenciamento de Usuários
A camada de autenticação integra a biblioteca oficial `@supabase/ssr` e `@supabase/supabase-js`. O fluxo de login (`src/app/auth/actions.ts:loginAction`) autentica o par e-mail/senha e consulta imediatamente o status institucional da conta na tabela `public.users`: contas com status `PENDING_APPROVAL`, `SUSPENDED` ou `DEACTIVATED` são sumariamente impedidas de prosseguir, recebendo mensagem informativa de governança.

Para médicos e administradores, entra em ação o subsistema de Autenticação Multifator (MFA/TOTP). Caso o fator TOTP esteja ativo, a sessão nasce em nível AAL1 e a action retorna o modo `CHALLENGE`. O componente `LoginForm.tsx` transiciona dinamicamente para o formulário de 6 dígitos numéricos. A validação do código TOTP (`verifyMFAChallengeAction`) eleva a sessão para AAL2 e emite um evento de auditoria `MFA_CHALLENGE_VERIFIED`.

O fluxo de recuperação de acesso (`resetPasswordAction`) implementa proteção ativa contra enumeração de contas: requisições para endereços não cadastrados ou inativos respondem com a mesma mensagem neutra de sucesso, impedindo que invasores mapeiem a base de usuários do hospital.

### 4.5.2 Gerenciamento de Pacientes e Vínculos Médicos
O credenciamento de médicos é restrito ao administrador em `/admin/medicos`. Ao submeter CRM, UF e especialidade, o médico é inserido com status `PENDING_APPROVAL` e alocado na Fila 1 de homologação institucional. Somente após a checagem manual de idoneidade pelo administrador (`approveDoctorQueueAction`), a conta passa a `ACTIVE`.

O acesso de um médico aos prontuários é rigidamente condicionado à existência de uma linha com status `ACTIVE` na tabela `physician_patient_links`. Caso um médico tente consultar dados ou emitir condutas para um paciente sem vínculo, as Server Actions bloqueiam a execução e o painel de busca retorna lista vazia (*Zero-Trust*). Para assegurar a coordenação assistencial, cada paciente possui no máximo um médico com a flag `is_primary = true`; ao homologar um novo médico primário, o sistema rebaixa automaticamente o vínculo primário anterior para secundário.

O papel especial **Doctor Master** (RF-004) foi implementado para viabilizar cobertura assistencial em plantões de intercorrência ou substituição médica temporária. O componente `PatientConditionsSection` e as Server Actions exigem o preenchimento de justificativa clínica detalhada (mínimo de 15 caracteres) e a tipificação da cobertura (`PLANTÃO`, `SUBSTITUIÇÃO`, `INTERCORRÊNCIA`, `COORDENAÇÃO`), registrando o evento imutável em `audit_events` e criando o vínculo de cobertura com status ativo.

### 4.5.3 Prontuário e Registros Clínicos
A máquina de estados dos registros clínicos opera sob quatro estados fundamentais:
* `PENDING_VALIDATION`: Estado exclusivo de medições originadas pelo paciente no domicílio.
* `CONFIRMED`: Estado definitivo de registros validados por um médico ou lançados diretamente pela equipe clínica.
* `REJECTED`: Submissões recusadas na curadoria médica, arquivadas com código de justificativa.
* `SUPERSEDED`: Registros históricos que foram retificados após aprovação da Fila 4.

O paciente registra suas medições domiciliares através do componente `PatientUpdateForm`, enviando pressão arterial e peso. O sistema submete os dados por meio da Server Action `submitPatientVitalsAction`, que invoca a rotina atômica PostgreSQL `rpc_submit_patient_vitals`. O registro nasce em `PENDING_VALIDATION`, aparecendo no painel do paciente sob a aba "Aguardando Validação".

No portal médico, as medições domiciliares pendentes ingressam na "Fila de Curadoria Clínica". O médico responsável analisa a coerência dos dados e dispõe de duas ações atômicas:
1. **Confirmar no Prontuário (`confirmClinicalRecordAction`):** Aciona a função `rpc_confirm_clinical_record`, que transiciona o registro para `CONFIRMED`, preenche `confirmed_by_user_id` e o timestamp `confirmed_at`. A medição passa imediatamente a alimentar os gráficos evolutivos e indicadores clínicos.
2. **Rejeitar Submissão (`rejectClinicalRecordAction`):** Aciona a função `rpc_reject_clinical_record`, que exige um código clínico padronizado (`INVALID_VALUE`, `DUPLICATE`, `UNREADABLE`, `INCOMPLETE`, `OTHER`) e justificativa textual. O evento é registrado em `rejected_submission_events` e disponibilizado na aba de feedback do paciente.

### 4.5.4 Exames e Indicadores Laboratoriais
O lançamento de exames complementares ocorre via modal clínico (`NewLabExamModal.tsx`) exclusivo do médico. O sistema oferece um catálogo renal padronizado composto por 10 exames essenciais: Creatinina Sérica, Ureia, Potássio, Sódio, Fósforo, Cálcio Total, Hemoglobina, Proteinúria de 24h, Relação Albuminúria/Creatinúria (RAC) e Bicarbonato Sérico.

O formulário conta com máscara de entrada e aceita números decimais tanto com ponto quanto com vírgula (padrão brasileiro). O processamento é realizado pela Server Action `recordLabExamAction`, que invoca a RPC `rpc_record_lab_exam`. A rotina executa uma transação atômica em PL/pgSQL que cria o cabeçalho em `clinical_records` e a linha correspondente em `lab_results`, impedindo a gravação de exames órfãos.

### 4.5.5 Calculadoras Nefrológicas
A plataforma adota a equação **CKD-EPI 2021** (Inker et al., *New England Journal of Medicine*, 2021) para estimativa da Taxa de Filtração Glomerular a partir da creatinina sérica. Esta versão é recomendada internacionalmente por eliminar o coeficiente de ajuste racial presente na formulação anterior de 2009.

A fórmula implementada em `src/lib/calculators/ckd-epi.ts` é definida matematicamente por:
$$\text{eTFG} = 142 \times \min\left(\frac{S_{cr}}{\kappa}, 1\right)^\alpha \times \max\left(\frac{S_{cr}}{\kappa}, 1\right)^{-1.200} \times 0.9938^{\text{Idade}} \times [1.012 \text{ se Feminino}]$$
Onde:
* $S_{cr}$ é a creatinina sérica expressa em $\text{mg/dL}$.
* $\kappa = 0.7$ para o sexo feminino e $\kappa = 0.9$ para o sexo masculino.
* $\alpha = -0.241$ para o sexo feminino e $\alpha = -0.302$ para o sexo masculino.

A calculadora correlaciona o resultado numérico aos estágios de perda funcional da diretriz KDIGO:
* **G1:** Normal ou elevada ($\ge 90\text{ mL/min/1.73m}^2$)
* **G2:** Levemente diminuída ($60\text{ a }89\text{ mL/min/1.73m}^2$)
* **G3a:** Leve a moderadamente diminuída ($45\text{ a }59\text{ mL/min/1.73m}^2$)
* **G3b:** Moderada a severamente diminuída ($30\text{ a }44\text{ mL/min/1.73m}^2$)
* **G4:** Severamente diminuída ($15\text{ a }29\text{ mL/min/1.73m}^2$)
* **G5:** Falência renal / Fase terminal ($< 15\text{ mL/min/1.73m}^2$)

Ao salvar o exame de creatinina com o cálculo automático ativo, a Server Action persiste os parâmetros matemáticos em `calculation_runs` (incluindo algoritmo, versão da fórmula, dados brutos de entrada e estadiamento inferido), viabilizando reprodutibilidade clínica e auditoria de inteligência de cálculo.

*Nota de Governança:* As calculadoras secundárias (Cockcroft-Gault, MDRD-4, CKD-EPI Cistatina C, Kt/V e KFRE) permanecem mantidas como desativadas por padrão no código-fonte, em conformidade com o requisito RF-061 do PRD, aguardando validação documental de protocolo hospitalar.

### 4.5.6 Evolução Clínica e Visualização de Dados
A evolução do paciente é exibida no componente `DoctorClientComponents.tsx` por meio de uma linha do tempo gráfica desenvolvida com a biblioteca `recharts`. O componente filtra os registros históricos confirmados, mapeia a data no formato brasileiro (`DD/MM/AAAA`) e plota duas curvas contínuas com eixos de ordenadas independentes:
* Curva de eTFG ($\text{mL/min/1.73m}^2$, linha azul sólida).
* Curva de Creatinina Sérica ($\text{mg/dL}$, linha verde pontilhada).

O gráfico possui *tooltips* informativos que revelam o valor pontual ao passar o cursor e grade cartesiana para acompanhamento da inclinação da perda de função renal (declínio anual da eTFG).

### 4.5.7 Documentos e Arquivos Clínicos
O módulo de documentos digitalizados (`src/app/patient/dashboard/UploadDocumentModal.tsx`) permite que o paciente envie laudos de ultrassonografia renal, biópsias, sumários de alta e relatórios externos. O processo de submissão implementa três barreiras de segurança:
1. **Validação de Assinatura Binária (*Magic Bytes*):** O código em `src/lib/validators/document.ts` lê os primeiros 4 bytes do arquivo enviado. Arquivos renomeados com extensão `.pdf`, mas cujo cabeçalho binário não inicie exatamente com `%PDF` (hexadecimal `25 50 44 46`), são sumariamente rejeitados. O mesmo critério estrito aplica-se a JPEG (`FF D8 FF`) e PNG (`89 50 4E 47`).
2. **Cálculo de Hash SHA-256 e Sanitização de Nome:** O conteúdo binário gera uma assinatura criptográfica SHA-256 para comprovação de integridade e prevenção contra submissões idênticas em duplicidade. O nome do arquivo é higienizado com expressões regulares para eliminar sequências de *Directory Traversal* (`../`).
3. **Bucket Privado e URLs Assinadas:** Os arquivos são gravados no bucket `clinical-documents` do Supabase Storage com acesso público totalmente bloqueado. A visualização tanto pelo médico quanto pelo paciente depende da Server Action `getSignedDocumentUrlAction`, que valida o vínculo clínico e gera uma URL assinada com expiração de 900 segundos (15 minutos).

### 4.5.8 Administração e Gerenciamento de Solicitações (Filas 1 a 5)
O backoffice administrativo centraliza-se na rota `/admin/filas`, estruturada em cinco filas formais de governança operacional:
* **Fila 1 (Homologação de Médicos):** Triagem de novos cadastros médicos pendentes de homologação do CRM/UF.
* **Fila 2 (Aprovação de Vínculos e Representações):** Homologação de solicitações de cuidadores e representantes legais com análise de documentos comprobatórios.
* **Fila 3 (Desativação e Reatribuição Clínica):** Fluxo destinado à transferência de pacientes e rascunhos de profissionais desligados.
* **Fila 4 (Despacho de Retificações Históricas):** Análise e despacho de solicitações de correção submetidas por pacientes ou médicos. A aprovação gera a nova versão encadeada via `supersedes_record_id`.
* **Fila 5 (Destinação e Descarte Documental):** Execução do expurgo controlado de dados clínicos rejeitados na curadoria ou marcação de custódia documental legal para guarda obrigatória de 20 anos.

---

## 4.6 SEGURANÇA, CONTROLE DE ACESSO E PROTEÇÃO DE DADOS

A segurança da informação no NefroHub estrutura-se no princípio de defesa em profundidade (*Defense-in-Depth*), combinando controles na borda de rede, no servidor de aplicação e no mecanismo de banco de dados.

### 4.6.1 Políticas RLS (Row Level Security) e Isolamento Zero-Trust
Todas as tabelas de dados clínicos (`patient_profiles`, `clinical_records`, `vital_signs`, `lab_results`, `conditions`, `medications`, `allergies`, `documents`, `review_requests`, `audit_events`) possuem RLS habilitado no PostgreSQL. As políticas garantem que:
* Pacientes autenticados só conseguem ler e escrever linhas vinculadas ao seu respectivo `user_id`.
* Médicos só conseguem acessar pacientes para os quais exista um registro ativo em `physician_patient_links`.
* Tentativas de injeção de parâmetros de identificação arbitrários por clientes REST anônimos resultam em conjuntos vazios de retorno ou erro de violação de política.

### 4.6.2 Autenticação Multifator (MFA/TOTP) e Sessões AAL2
Para mitigar os riscos de roubo de credenciais ou ataques de dicionário contra contas profissionais, o sistema impõe Autenticação Multifator com base em senhas temporárias de 6 dígitos (*Time-based One-Time Password* — RFC 6238). O backend armazena o fator TOTP no motor de autenticação do Supabase, gerando o QR Code diretamente em vetor SVG. O guard de segurança `assertServerMFAAssurance` atua como barreira antes de qualquer mutação de dados: caso um médico tente acionar Server Actions clínicas mantendo uma sessão em AAL1 com desafio MFA pendente, a operação é rejeitada no servidor.

### 4.6.3 Firewall de Privacidade Clínica e Conformidade com a LGPD
Em estrito alinhamento com a LGPD e o sigilo médico, o NefroHub implementou um firewall anti-vazamento em `src/lib/email/sanitizer.ts`. O módulo analisa rigorosamente o conteúdo textual e o HTML de todas as comunicações antes de seu despacho:
* Expressões regulares com limites estritos de palavra (`\b`) barram o envio de termos diagnósticos (ex: "doença renal", "hemodiálise", "creatinina", "proteinúria"), medidas laboratoriais com unidades clínicas ("mg/dL", "mL/min", "mmHg") e códigos de Classificação Internacional de Doenças (CID).
* Padrões numéricos de Cadastro de Pessoas Físicas (CPFs com ou sem pontuação) e do Cartão Nacional de Saúde (CNS de 15 dígitos) são neutralizados.
* As notificações externas comunicam exclusivamente eventos operacionais neutros ("Você possui uma nova atualização em seu painel"), orientando o usuário a autenticar-se na plataforma sob canal seguro HTTPS para visualizar dados de saúde.

---

## 4.7 AUDITORIA E INTEGRIDADE DAS INFORMAÇÕES CLÍNICAS

Para atender aos requisitos de validade probatória de registros eletrônicos de saúde, o NefroHub implementa uma trilha de auditoria append-only na tabela `public.audit_events`. A tabela é estruturada com as seguintes colunas:
* `id`: Identificador UUID único do evento.
* `user_id`: Identificador do usuário que executou a ação.
* `patient_id`: Identificador do paciente relacionado (quando aplicável).
* `action`: Código padronizado da ação clínica ou institucional (ex: `PHYSICIAN_APPROVED`, `MFA_ENROLLED_SUCCESS`, `MFA_CHALLENGE_VERIFIED`, `ALLERGY_RECORDED`, `DOCTOR_MASTER_EMERGENCY_COVERAGE_ACTIVATED`).
* `resource`: Nome da entidade ou tabela afetada.
* `result`: Resultado da operação (`SUCCESS` ou `FAILURE`).
* `metadata`: Objeto JSON estruturado contendo justificativas, parâmetros de versão e contexto.
* `created_at`: Carimbo temporal inviolável gerado pelo relógio do servidor de banco (`timezone('utc'::text, now())`).

A tabela de auditoria não admite operações de `UPDATE` ou `DELETE`, configurando um histórico somente de escrita (*append-only*). As tentativas de adulteração ou exclusão de eventos de auditoria são rejeitadas pelo PostgreSQL. A rota administrativa `/admin/auditoria` expõe esses registros de forma consolidada e desacoplada, viabilizando o escrutínio contínuo de todas as ações sensíveis realizadas no sistema.
