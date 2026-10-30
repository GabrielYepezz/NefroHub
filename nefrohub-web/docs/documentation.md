1. Visão geral do produto
1.1. Objetivo
O NefroHub será uma aplicação web responsiva destinada ao registro, à organização e ao acompanhamento longitudinal de informações clínicas de pacientes com doenças renais ou em acompanhamento nefrológico.
A plataforma permitirá que profissionais autorizados registrem e consultem dados clínicos, acompanhem a evolução dos pacientes, visualizem resultados laboratoriais e sinais vitais em tabelas e gráficos e mantenham documentos clínicos organizados.
O paciente poderá participar do registro de suas informações, inclusive sem possuir conta própria. Quando necessário e legalmente autorizado, um representante poderá realizar ações em seu nome.
O sistema deverá preservar a integridade do prontuário, garantir rastreabilidade das alterações e impedir acessos não autorizados aos dados de saúde.
1.2. Classificação e limites do MVP
O MVP será um sistema de registro e acompanhamento clínico, com funcionalidades de armazenamento, organização, visualização e cálculo de indicadores previamente validados.
Não será desenvolvido como um sistema autônomo de diagnóstico, prescrição ou recomendação terapêutica.
A classificação regulatória não será presumida apenas com base nessa descrição. Antes de disponibilizar funcionalidades com finalidade médica específica, a instituição e os responsáveis pelo produto deverão avaliar o enquadramento aplicável, incluindo a regulamentação de software como dispositivo médico — SaMD — quando pertinente. A RDC Anvisa nº 657/2022 é uma referência para essa análise; a finalidade pretendida e o funcionamento real do software precisam ser avaliados. Referência: RDC Anvisa nº 657/2022.
1.3. Funcionalidades incluídas no MVP
Cadastro e gerenciamento de pacientes.
Cadastro e gerenciamento de médicos e administradores.
Cadastro de representantes e vínculos de representação autorizados.
Associação de cada paciente a um médico responsável.
Registro manual de informações clínicas.
Envio de dados clínicos pelo paciente, com validação médica.
Prontuário longitudinal com histórico de registros confirmados.
Histórico de doenças, comorbidades, medicamentos, alergias e internações.
Registro de exames laboratoriais e sinais vitais.
Acompanhamento de tratamentos e informações sobre diálise.
Visualização de evolução clínica em tabelas e gráficos.
Upload e visualização de documentos clínicos.
Fluxos de revisão, correção e exclusão sujeitos às regras de retenção.
Notificações por e-mail e notificações internas.
Auditoria de ações e acessos.
Gestão de sessões, autenticação multifator e recuperação de conta.
Infraestrutura isolada para cada hospital ou rede contratante.
1.4. Funcionalidades fora do MVP
Não fazem parte da primeira versão:
Inteligência artificial generativa, agentes de IA ou recomendações clínicas automatizadas.
OCR ou extração automática de informações de documentos.
Importação automática de exames ou integração com sistemas hospitalares externos.
Agendamento de consultas.
Diagnósticos ou prescrições automatizados.
Alertas que determinem automaticamente urgência ou conduta clínica.
Configuração livre de fórmulas e catálogos clínicos por administradores.
Exportação em massa ou download de prontuários por meio da interface.
Portal público de autoatendimento com criação autônoma de prontuários.
Calculadoras clínicas habilitadas antes da validação definida neste documento.
A arquitetura poderá ser preparada para expansões futuras, mas a existência de uma estrutura técnica não significa que a funcionalidade esteja disponível no MVP.
2. Usuários, papéis e permissões
2.1. Papéis do sistema
O campo users.role utilizará os seguintes valores:
ADMIN: Administração operacional da instituição e gestão de fluxos autorizados.
DOCTOR_MASTER: Responsável clínico designado para cobertura e coordenação dos vínculos, com acesso limitado por autorização explícita.
DOCTOR: Profissional habilitado que acompanha pacientes vinculados.
PATIENT: Paciente que possui uma conta própria.
LEGAL_REPRESENTANT: Pessoa com conta própria e autorização validada para atuar em nome de um paciente.
O papel, isoladamente, não concede acesso a todos os dados clínicos. O sistema deverá validar a relação do usuário com o paciente, o escopo da autorização e o estado do vínculo em cada operação.
2.2. Administrador
O administrador poderá:
Gerenciar contas e permissões operacionais.
Aprovar cadastros de profissionais conforme o processo institucional.
Validar solicitações de vínculo e representação.
Acompanhar desativações e reatribuições.
Gerenciar filas administrativas.
Gerenciar versões dos documentos legais.
Consultar metadados de operação e auditoria conforme autorização.
Encaminhar solicitações de correção clínica ao revisor adequado.
O administrador operacional não poderá decidir sozinho se uma informação clínica está correta, aprovar a própria solicitação ou alterar diretamente registros clínicos confirmados.
O acesso administrativo a dados clínicos será negado por padrão. Uma exceção de suporte, quando realmente necessária, deverá exigir motivo, escopo, prazo de validade e auditoria das leituras realizadas.
2.3. Médico
O médico poderá:
Consultar pacientes com vínculo ativo e acesso autorizado.
Registrar dados clínicos.
Criar e editar seus rascunhos.
Revisar dados enviados por pacientes ou representantes.
Confirmar, corrigir antes da confirmação ou rejeitar dados pendentes.
Solicitar correções em registros já confirmados.
Consultar a evolução clínica.
Registrar tratamentos, medicamentos, alergias, internações e informações de diálise.
Anexar documentos conforme as permissões.
Consultar o histórico de versões e auditoria disponível para seu perfil.
O médico não poderá apagar ou sobrescrever diretamente registros confirmados.
2.4. Doctor master
O doctor_MASTER será uma função de coordenação e cobertura clínica, não uma autorização irrestrita sobre toda a base.
Deverá receber acesso explícito aos pacientes cuja cobertura assumir. A consulta emergencial ou excepcional exigirá justificativa e será auditada.
O papel poderá ser usado para coordenar a substituição de profissionais, mas não dispensará as verificações de vínculo, segregação de funções e acesso mínimo necessário.
2.5. Paciente
O paciente com conta poderá:
Consultar seus dados clínicos confirmados.
Consultar o estado dos envios pendentes.
Visualizar o motivo de rejeição de um envio.
Registrar dados manualmente por formulários.
Solicitar correção de dados enviados.
Consultar documentos que estejam autorizados para visualização.
Consultar notificações e informações de privacidade.
Solicitar atendimento institucional para questões de acesso e representação.
O paciente não poderá alterar ou apagar diretamente um envio após submetê-lo à validação. Isso preserva a rastreabilidade, mas não impede a solicitação de correção.
2.6. Representante legal, responsável e cuidador
O representante terá uma conta própria. Não deverá compartilhar a conta do paciente nem receber suas credenciais.
O sistema distinguirá:
Representante legal: pessoa cuja autoridade para agir em nome do paciente foi verificada.
Responsável por menor ou pessoa legalmente incapaz: pessoa com poderes reconhecidos para o ato correspondente.
Cuidador autorizado: pessoa que recebeu permissão específica, sem que isso implique automaticamente poderes de representação legal.
A instituição deverá verificar a autoridade, a identidade, a abrangência e a validade da representação. A mera declaração de parentesco não será suficiente para conceder acesso irrestrito.
A representação será revogável, auditada e limitada ao escopo autorizado. O melhor interesse do menor ou da pessoa representada e as restrições legais aplicáveis deverão ser respeitados.
3. Identidade, cadastro e deduplicação
3.1. Separação entre pessoa e conta
A entidade patient_profiles representará a pessoa atendida. A entidade users representará uma identidade de autenticação.
O relacionamento entre elas será opcional:
Um paciente poderá não ter conta.
Uma conta de paciente será associada a, no máximo, um perfil de paciente.
Uma conta de representante será distinta do perfil da pessoa representada.
O sistema não utilizará a conta de um representante como se fosse a conta do paciente.
O identificador interno será um UUID não sequencial.
3.2. CPF e outros identificadores
O CPF será coletado quando necessário e autorizado para identificação inequívoca, conforme a política institucional. Sua ausência não impedirá necessariamente o cadastro.
Quando coletado:
O CPF será criptografado em repouso.
A interface exibirá apenas a versão mascarada, salvo necessidade autorizada.
A busca de duplicidade utilizará HMAC-SHA-256 com segredo separado e gerenciado.
A chave de HMAC terá versão, procedimento de rotação e controle de acesso.
A unicidade será aplicada sobre o HMAC correspondente à versão ativa, com estratégia definida para rotação.
CPF não será incluído em logs, URLs, métricas ou mensagens de erro.
O HMAC não substitui a criptografia do CPF. São mecanismos distintos, com finalidades diferentes.
Outros identificadores, como CNS ou identificador institucional, só serão coletados se houver justificativa, necessidade e base legal adequadas.
3.3. Pacientes sem CPF
Quando não houver CPF, o sistema utilizará nome normalizado e data de nascimento para identificar possíveis duplicidades.
Essa combinação não será considerada prova suficiente para mesclar dois registros.
Se houver correspondência provável:
A interface informará que pode existir um paciente duplicado.
A criação será encaminhada para revisão por usuário autorizado.
Será solicitado outro identificador quando disponível.
A decisão de criar um novo perfil ou relacioná-lo a um perfil existente será registrada em auditoria.
Nenhum prontuário será mesclado automaticamente.
A consolidação de dois perfis deverá preservar a origem dos registros e passar por processo controlado, com revisão clínica e técnica.
3.4. Quem pode cadastrar pacientes
No MVP, o cadastro será iniciado por um administrador autorizado ou por um médico com permissão institucional.
O cadastro de um paciente ativo deverá criar ou solicitar, na mesma operação, um vínculo com o médico responsável. O sistema não permitirá que o paciente fique ativo e sem responsável clínico atribuído.
O cadastro por autoatendimento do paciente fica fora do MVP. Se for incluído futuramente, precisará de fluxo específico de verificação de identidade, deduplicação e aprovação.
4. Vínculos entre médicos e pacientes
4.1. Modelo de vínculo
A tabela physician_patient_links terá:
id;
patient_id;
physician_id;
status;
is_primary;
created_by_user_id;
created_at;
activated_at;
ended_at;
reason;
transition_id, quando relacionado a uma transferência.
Um paciente poderá ter mais de um médico autorizado, mas deverá possuir um responsável clínico principal enquanto estiver ativo.
4.2. Estados permitidos
Os estados serão:
PENDING: solicitação aguardando decisão.
ACTIVE: vínculo autorizado.
SUSPENDED: acesso temporariamente bloqueado.
ENDED: vínculo encerrado.
REJECTED: solicitação recusada.
As transições permitidas serão:
PENDING → ACTIVE: Aprovação por perfil autorizado.
PENDING → REJECTED: Recusa justificada.
ACTIVE → SUSPENDED: Suspensão autorizada ou de segurança.
SUSPENDED → ACTIVE: Reativação autorizada.
ACTIVE → ENDED: Encerramento autorizado.
SUSPENDED → ENDED: Encerramento autorizado.
Um vínculo encerrado não será reaberto. Uma nova relação deverá ser criada.
4.3. Histórico de transições
A tabela physician_patient_link_events registrará:
vínculo relacionado;
estado anterior;
estado posterior;
autor da ação;
data/hora;
motivo;
origem da solicitação;
identificador de correlação, quando aplicável.
As transições serão validadas pelo backend e realizadas em transações. O usuário não poderá alterar o estado diretamente por uma chamada de API sem passar pelas regras de autorização.
4.4. Encerramento e acesso posterior
O encerramento do vínculo revogará imediatamente o acesso clínico do médico ao paciente.
Não haverá período automático de 30 dias. Se uma instituição necessitar de acesso temporário para transição assistencial, deverá aprovar uma exceção formal com:
justificativa;
pacientes e dados abrangidos;
usuário autorizado;
data de início e término;
auditoria de leitura;
revogação automática.
Essa exceção ficará desabilitada no MVP.
4.5. Desativação de médicos
Antes de desativar um médico, o sistema deverá:
Identificar pacientes pelos quais ele é o responsável principal.
Identificar vínculos ativos e rascunhos de sua autoria.
Transferir os vínculos para outro médico habilitado e autorizado.
Reatribuir os rascunhos para revisão, sem alterar sua autoria original.
Registrar as transições.
Revogar sessões e acesso clínico do médico.
Concluir a desativação.
A desativação do último médico responsável será bloqueada enquanto houver pacientes ativos sem reatribuição válida. O processo só poderá ser concluído quando um substituto autorizado for designado.
Os rascunhos de um médico desativado serão preservados, não poderão ser confirmados automaticamente e precisarão de revisão por outro profissional.
5. Representantes e permissões de acesso
A tabela patient_representations conterá:
id;
patient_id;
representative_user_id;
relationship_type;
authority_type;
scope;
proof_document_ref;
status;
valid_from;
valid_until;
verified_by_user_id;
verified_at;
revoked_by_user_id;
revoked_at;
revocation_reason.
Os estados do vínculo de representação serão PENDING, ACTIVE, SUSPENDED, ENDED e REJECTED.
O acesso será negado se a relação estiver pendente, suspensa, encerrada ou fora do prazo.
O sistema deverá distinguir as permissões de:
visualizar informações;
inserir dados;
enviar documentos;
solicitar correções;
acompanhar notificações;
administrar o perfil, quando legalmente autorizado.
O escopo não será determinado apenas pelo tipo de parentesco. Deverá refletir a autoridade verificada e as regras institucionais.
O representante não poderá aprovar dados clínicos em nome do médico, modificar registros confirmados ou ampliar sua própria permissão.
6. Modelo do prontuário clínico
6.1. Estados dos registros
A tabela clinical_records será a entidade de controle dos registros clínicos estruturados.
Estados permitidos:
DRAFT: rascunho ainda não submetido.
PENDING_VALIDATION: envio aguardando revisão clínica.
CONFIRMED: registro confirmado.
REJECTED: envio rejeitado, em processo de destinação do conteúdo.
O estado SUPERSEDED não será armazenado como alteração do registro antigo. A indicação de que um registro foi substituído será derivada da existência de uma nova versão que o referencia.
O estado CORRECTION_REQUESTED também não será usado no registro clínico. A solicitação será representada exclusivamente por review_requests.
6.2. Imutabilidade
Depois de confirmado, o conteúdo de um registro não poderá ser atualizado nem excluído pela aplicação.
Uma correção de dado confirmado criará uma nova versão, relacionada ao registro anterior por supersedes_record_id.
A interface poderá exibir a versão anterior como substituída, mas seu estado e conteúdo persistido permanecerão inalterados.
O banco deverá:
impedir UPDATE e DELETE de registros confirmados;
impedir ciclos na cadeia de versões;
validar que a nova versão pertence ao mesmo paciente e ao mesmo tipo de registro;
validar autorização e revisão antes de confirmar;
registrar a nova versão e sua auditoria na mesma transação;
impedir alterações diretas por rotinas administrativas comuns.
Não haverá exceção genérica para administradores. Operações excepcionais de retenção ou descarte seguirão procedimentos próprios, com autorização, registro e verificação legal.
6.3. Dados enviados pelo paciente
O paciente poderá registrar informações por formulários manuais.
Após o envio:
O conteúdo será marcado como PENDING_VALIDATION.
O paciente não poderá sobrescrevê-lo ou apagá-lo diretamente.
O registro aparecerá na fila de revisão clínica.
O médico poderá confirmar, corrigir antes da confirmação ou rejeitar.
A ação, a justificativa e a identidade do revisor serão registradas.
O envio de uma informação pelo paciente não significa que ela foi validada clinicamente.
6.4. Correção antes da confirmação
Quando o médico identificar um erro em um envio pendente, poderá ajustar os campos antes da confirmação.
A tabela clinical_submission_revisions manterá:
id;
clinical_record_id;
field_name;
original_value;
adjusted_value;
reason;
changed_by_user_id;
changed_at;
review_request_id, quando aplicável.
A interface mostrará o valor original, o ajustado e a justificativa aos perfis autorizados.
O registro só será confirmado após a revisão final. Não poderá ocorrer alteração silenciosa que descarte o valor original sem rastreabilidade.
6.5. Rejeição de envios do paciente
O médico deverá indicar um motivo para rejeitar um envio. A interface oferecerá motivos padronizados, como:
INVALID_VALUE;
DUPLICATE;
UNREADABLE;
INCOMPLETE;
OTHER.
Motivos livres serão limitados e não deverão conter detalhes clínicos desnecessários.
O paciente autenticado poderá consultar o motivo da rejeição e o estado do envio. O e-mail conterá apenas uma notificação genérica, sem dados clínicos.
A rejeição não poderá eliminar automaticamente uma informação potencialmente relevante sem considerar a continuidade do cuidado. Se a informação for clinicamente relevante, o médico deverá registrar, de forma independente e sob sua responsabilidade, o dado que considerar apropriado ao prontuário antes de concluir a rejeição.
Destinação do conteúdo rejeitado
O conteúdo rejeitado será separado da evidência de auditoria.
A evidência mínima poderá conter:
ID do evento;
paciente;
autor do envio;
revisor;
datas e horários;
tipo de dado;
código e motivo da rejeição;
estado da destinação;
referência ao evento de auditoria.
Não deverá conservar o valor clínico rejeitado sem necessidade legal documentada.
O descarte seguirá uma rotina autorizada. Se houver obrigação de conservação, o conteúdo ficará em área restrita até decisão formal de destinação. Não será criada uma exceção ampla no trigger de imutabilidade apenas para apagar registros REJECTED.
6.6. Correção após confirmação
O paciente ou profissional poderá solicitar correção por meio de review_requests.
O registro confirmado continuará visível e imutável enquanto a solicitação estiver pendente.
Se a correção for aprovada:
Será criado um novo registro.
A nova versão apontará para o registro anterior.
A justificativa e o revisor serão registrados.
A nova versão será confirmada após a revisão necessária.
A versão anterior permanecerá no histórico.
Se a correção for recusada, o registro original permanecerá intacto e o pedido será encerrado com justificativa.
O solicitante não poderá aprovar a própria solicitação.
6.7. Revisão independente
A ordem de revisão será:
Médico habilitado, vinculado ao paciente e distinto do solicitante.
Médico master com acesso explícito ao paciente, desde que distinto do solicitante.
Escalonamento ao responsável clínico da instituição quando não houver revisor elegível.
O administrador operacional poderá encaminhar e acompanhar o pedido, mas não decidirá sozinho sobre a veracidade clínica do conteúdo.
7. Filas de trabalho e notificações
7.1. Fila clínica
Os envios pendentes e os pedidos de correção formarão uma fila clínica separada das filas administrativas.
Cada item deverá apresentar:
paciente;
tipo de solicitação;
autor;
responsável atual;
data/hora de entrada;
prazo;
prioridade;
estado;
último evento;
histórico de encaminhamento.
A fila será construída a partir de clinical_records e review_requests quando possível, evitando duplicar o estado clínico em uma segunda tabela. Se houver uma tabela auxiliar de atribuição, ela armazenará apenas dados operacionais da fila.
7.2. SLA e escalonamento
Metas iniciais propostas, sujeitas à aprovação institucional:

Envio rotineiro: Revisão em até 2 dias úteis
Envio marcado como prioritário por fluxo autorizado: Revisão em até 1 dia útil
Prazo vencido: Escalonamento ao responsável clínico
Médico indisponível: Reatribuição a profissional autorizado
Esses prazos não são garantias de atendimento clínico e não determinam automaticamente urgência.
O NefroHub não é serviço de emergência. A interface informará que o usuário não deve depender da fila de revisão para situações emergenciais.
7.3. Filas administrativas
O backoffice terá cinco filas principais:
Aprovação de contas e profissionais.
Aprovação e encerramento de vínculos.
Desativação e reatribuição.
Solicitações de correção ou exclusão sujeitas a revisão.
Revisão e destinação de documentos.
Cada item terá solicitante, data, responsável, estado, comentários, decisão, justificativa e auditoria.
As decisões clínicas permanecerão sob responsabilidade de um profissional habilitado.
7.4. Notificações e falhas de envio
O sistema terá notificações internas e e-mails transacionais.
O e-mail não deverá incluir CPF, resultados laboratoriais, diagnósticos, documentos ou outros detalhes clínicos.
Os envios utilizarão:
AWS SES ou serviço equivalente formalmente aprovado;
domínio configurado com SPF, DKIM e DMARC;
retentativas controladas;
monitoramento de bounce e complaint;
fila de falhas;
mensagens genéricas e seguras.
A tabela outbox_events será gravada na mesma transação da ação de negócio. Um worker com Celery e Redis processará os eventos de forma idempotente.
Uma falha de e-mail não desfará um registro clínico confirmado. A notificação terá estado próprio e poderá ser reenviada de maneira controlada.
8. Dados clínicos e catálogo inicial
8.1. Exames laboratoriais
Cada exame deverá armazenar, conforme aplicável:
paciente e registro clínico;
nome do exame;
código e sistema de codificação;
data clínica;
tipo de amostra;
método, quando disponível;
comparador;
valor numérico ou textual;
unidade original;
unidade normalizada, se aplicável;
intervalo de referência informado pela fonte;
origem do dado;
versão do catálogo;
autor e revisor.
O código LOINC será opcional quando existir correspondência confirmada. Códigos TUSS serão usados somente quando apropriados à finalidade. Não haverá criação automática de códigos não validados.
8.2. Valores e unidades
Resultados numéricos serão armazenados em PostgreSQL NUMERIC, sem utilizar FLOAT ou REAL.
O sistema aceitará vírgula decimal na interface pt-BR, normalizando a entrada para armazenamento decimal sem perda indevida de precisão.
Os comparadores aceitos serão:
<;
<=;
=;
>=;
>.
A unidade original será preservada. Quando houver conversão validada, também serão armazenados o valor normalizado, a unidade de destino e a versão da regra de conversão.
Unidades compatíveis com UCUM serão utilizadas quando houver representação aplicável. Conversões não validadas não serão executadas automaticamente.
8.3. Catálogo inicial de sinais vitais
O catálogo inicial será fixo, versionado no código e carregado por migrations ou seed controlado.

BP_SYSTOLIC — Pressão arterial sistólica (Unidade padrão: mmHg)
BP_DIASTOLIC — Pressão arterial diastólica (Unidade padrão: mmHg)
HEART_RATE — Frequência cardíaca (Unidade padrão: bpm)
RESP_RATE — Frequência respiratória (Unidade padrão: incursões/min)
TEMPERATURE — Temperatura corporal (Unidade padrão: °C)
SPO2 — Saturação periférica de oxigênio (Unidade padrão: %)
WEIGHT — Peso (Unidade padrão: kg)
HEIGHT — Altura (Unidade padrão: cm ou m, com normalização interna)
BMI — Índice de massa corporal (Unidade padrão: kg/m²)
O IMC será derivado de peso e altura e identificado como calculado, com referências aos registros utilizados.
Limites de plausibilidade deverão ser validados por profissional clínico. Valores extremos não serão descartados automaticamente: o sistema poderá solicitar confirmação ou revisão.
8.4. Catálogo de exames renais
O catálogo inicial poderá incluir:
creatinina sérica;
ureia;
TFGe informada pelo laboratório;
potássio;
sódio;
bicarbonato;
relação albumina/creatinina urinária;
proteína urinária de 24 horas;
hemoglobina;
cálcio;
fósforo;
paratormônio;
albumina;
glicemia.
A lista deverá ser aprovada por responsável clínico antes da produção. A presença de um exame no catálogo não significa que o sistema possa interpretar seu resultado ou gerar uma conduta clínica.
8.5. Doenças e comorbidades
O sistema permitirá registrar condições e comorbidades com nome, data de início quando conhecida, estado e observações autorizadas.
CID-10 poderá ser armazenado quando existir código confirmado e apropriado. O campo será opcional, e o sistema não inferirá diagnósticos a partir de exames ou calculadoras.
8.6. Medicamentos e alergias
Medicamentos terão, conforme aplicável:
nome;
código opcional;
dose;
unidade;
via;
frequência;
início e fim;
estado;
observações.
Alergias terão substância, reação, gravidade, data e estado.
O sistema distinguirá entre “alergia conhecida”, “nenhuma alergia conhecida” e “informação não disponível”. A ausência de registro não será interpretada como ausência de alergias.
8.7. Tratamentos e diálise
Os tratamentos terão nome, início, término, estado e observações.
O registro de diálise será dividido em:
dialysis_treatments: curso de tratamento, modalidade, início, término, frequência, local opcional e estado;
dialysis_sessions: sessão, data, modalidade, duração e parâmetros pertinentes à modalidade.
Os parâmetros de sessão poderão incluir peso antes/depois, volume de ultrafiltração, acesso e pressão arterial antes/depois. A obrigatoriedade dos campos será definida por modalidade e validada clinicamente antes da produção.
O Kt/V não será calculado automaticamente nesta fase.
8.8. Internações
As internações poderão registrar instituição, data de início e fim, motivo, diagnóstico codificado quando aplicável, desfecho e observações.
As datas clínicas serão preservadas como DATE, quando não houver necessidade de horário.
9. Evolução clínica e visualizações
9.1. Linha do tempo
A evolução clínica será exibida em ordem cronológica, com possibilidade de filtrar por:
últimos 30 dias;
últimos 6 meses;
último ano;
intervalo personalizado.
Os dados exibidos serão aqueles autorizados para o usuário e adequados à visualização selecionada.
9.2. Preferências de exibição
A tabela evolution_display_preferences será mantida.
Campos:
id;
patient_id;
physician_id;
indicator_code;
display_enabled;
display_order;
created_at;
updated_at.
Cada médico poderá manter suas próprias preferências. A preferência controla apenas a apresentação e não altera os dados clínicos armazenados.
9.3. Regras para gráficos
A elegibilidade de um exame para gráfico será definida no catálogo versionado.
Antes de combinar pontos no mesmo gráfico, o sistema deverá validar unidade, comparabilidade e origem. Não misturará valores com unidades incompatíveis nem fará conversões não aprovadas.
Os gráficos deverão indicar datas, unidades, valores e origem dos dados. Registros pendentes não serão apresentados como resultados confirmados.
O sistema poderá destacar um resultado que esteja fora de um intervalo de referência fornecido, sem produzir diagnóstico ou recomendação terapêutica.
10. Calculadoras nefrológicas
10.1. Política de ativação
Todas as calculadoras clínicas permanecerão desativadas em produção até que suas fórmulas, entradas, unidades, arredondamentos, limitações e casos de teste sejam validados por profissional clínico.
A arquitetura poderá ser desenvolvida com uma flag de funcionalidade por calculadora. Uma calculadora não validada não poderá ser ativada por um administrador comum.
10.1.1. Regras gerais do backend
Todas as calculadoras deverão seguir o mesmo fluxo:
Receber os dados informados pelo médico ou selecionados de registros clínicos confirmados.
Validar a existência, o tipo, a unidade, a faixa plausível e a data de cada entrada.
Converter as unidades para as exigidas pela fórmula, sem alterar o valor original armazenado no prontuário.
Validar se os dados são suficientes para a versão específica da calculadora.
Executar a fórmula correspondente à versão explicitamente selecionada.
Preservar a precisão numérica interna e arredondar somente para apresentação, conforme regra validada.
Retornar o resultado, a unidade, a versão da fórmula, os dados utilizados, as datas de referência e eventuais limitações.
Registrar a execução como simulação ou como cálculo clínico formal, conforme a ação explícita do médico.
O backend nunca deverá escolher silenciosamente um resultado laboratorial ou um peso apenas porque é o registro mais recente. Quando houver várias opções, deverá apresentar os dados disponíveis para o médico selecionar e confirmar.
As fórmulas deverão ser implementadas com aritmética decimal ou precisão numérica adequada, evitando erros decorrentes de tipos de ponto flutuante inadequados. Divisões por zero, valores negativos incompatíveis com a fórmula, dados ausentes e unidades incompatíveis deverão produzir erros controlados, sem resultados clínicos inválidos.
10.2. Escopo de validação

IMC: Candidata à implementação após validação das unidades, arredondamento e dados ausentes.
Cockcroft-Gault: Exige definição explícita do peso e validação clínica da equação.
MDRD GFR: Equação exata a confirmar na fonte de referência.
MDRD GFR 2: Não assumir a variante; manter desativada até confirmação documental.
CKD-EPI Creatinina 2021: Candidata prioritária para validação.
CKD-EPI Creatinina/Cistatina C 2021: Exige validação de fórmula, entradas e unidades.
Kt/V: Exige definição de modalidade e variante do cálculo.
KFRE: Usar como referência o modelo não norte-americano da SBN, sujeito a validação.
A página de calculadoras da SBN será a fonte inicial de referência, mas o nome de uma calculadora não será considerado especificação suficiente para implementação. Calculadoras nefrológicas da SBN.
10.2.1. IMC — Índice de Massa Corporal
Variáveis necessárias:
weight_kg: peso em quilogramas.
height_m: altura em metros.
Lógica:
O backend deverá converter o peso e a altura para as unidades padronizadas e calcular:
IMC=peso (kg)altura (m)2
A altura deverá ser maior que zero, e peso e altura deverão passar pelas validações de plausibilidade configuradas e aprovadas clinicamente.
O resultado será expresso em kg/m². O sistema deverá armazenar os valores de entrada e identificar o resultado como derivado, com referência aos registros de peso e altura utilizados.
Caso os dados tenham datas diferentes, a interface deverá informar isso ao médico. A política para aceitar ou rejeitar essa diferença temporal deverá ser definida previamente, não presumida pelo backend.
10.2.2. Cockcroft-Gault — estimativa da depuração de creatinina
Variáveis necessárias:
age_years: idade em anos na data de referência.
weight_kg: peso selecionado pelo médico.
serum_creatinine: creatinina sérica.
creatinine_unit: unidade da creatinina.
sex_factor: fator correspondente à variante da equação aprovada.
A implementação deverá utilizar a variante clínica formalmente selecionada e validada pelo projeto.
Uma forma tradicional da equação é:
CrCl = (140 - idade) x peso (kg)72 x creatinina (mg/dL)
Na variante tradicional, aplica-se um fator de 0,85 para mulheres. A equação retorna uma estimativa em mL/min. Essa variante e seu fator deverão ser explicitamente versionados, e não aplicados sem que a instituição aprove seu uso.
O backend deverá converter creatinina para mg/dL quando a entrada estiver em outra unidade compatível.
Regra importante para o peso: o backend não escolherá automaticamente peso real, ideal ou ajustado. O médico deverá confirmar o peso utilizado. A política para obesidade, edema, amputações e outras situações especiais precisa ser definida na validação clínica.
O resultado deverá ser identificado como depuração estimada de creatinina, não como TFGe normalizada para 1,73 m².
10.2.3. MDRD GFR e MDRD GFR 2
As duas denominações não identificam, por si só, fórmulas inequívocas. Por isso, não se deve implementar uma equação presumida para MDRD GFR 2.
Antes da implementação, o responsável clínico deverá especificar qual variante da MDRD cada item representa, incluindo os coeficientes e fatores aplicáveis.
Variáveis que podem ser necessárias, conforme a variante aprovada:
serum_creatinine: creatinina sérica.
age_years: idade em anos.
sex_factor: fator definido pela equação escolhida.
creatinine_unit: unidade original.
Outros fatores somente se constarem na fórmula de referência aprovada.
O backend deverá converter a creatinina para a unidade exigida, validar as entradas e executar os coeficientes exatos da versão aprovada.
O sistema não deverá adicionar automaticamente um coeficiente racial histórico. Se a equação escolhida contiver esse componente, a decisão deverá ser revista clinicamente e documentada antes da implementação. A versão de produção deverá identificar claramente a equação utilizada.
As duas calculadoras permanecerão desativadas até a confirmação da fórmula e a criação de casos de teste de referência.
10.2.4. CKD-EPI Creatinina 2021
Esta calculadora estima a taxa de filtração glomerular a partir da creatinina sérica, utilizando a equação CKD-EPI de 2021 sem coeficiente racial.
Variáveis necessárias:
serum_creatinine: creatinina sérica.
creatinine_unit: unidade da creatinina.
age_years: idade na data de referência.
sex_factor: parâmetro definido pela equação aprovada.
reference_date: data usada para determinar a idade e a validade dos dados.
A fórmula CKD-EPI 2021 utiliza coeficientes diferentes conforme o parâmetro sexual definido na equação e o valor da creatinina em relação a um ponto de referência. Por isso, a implementação deverá utilizar a expressão matemática completa da publicação de referência, incluindo os operadores de mínimo e máximo, expoentes e coeficientes específicos.
O cálculo da Taxa de Filtração Glomerular estimada (TFGe) pela fórmula CKD-EPI Creatinina 2021 avalia o funcionamento dos rins. Esta versão atualizada removeu qualquer fator de correção baseado em raça para evitar desigualdades diagnósticas.
O cálculo é feito a partir de uma equação matemática exponencial que combina três variáveis principais:
Creatinina sérica: O nível de creatinina no sangue (em mg/dL).
Idade: Em anos completos (a função renal naturalmente diminui com o tempo).
Sexo biológico: Homens e mulheres possuem constantes matemáticas diferentes na fórmula devido à diferença média de massa muscular.
A fórmula divide o cálculo em duas partes com base no nível de creatinina do paciente, usando uma linha de corte chamada de Constante K (que é 0,7 para mulheres e 0,9 para homens):
Se a creatinina estiver abaixo ou igual ao limite (K): O valor da creatinina dividido por K é elevado a uma potência negativa suave (-0,241 para mulheres ou -0,302 para homens). Isso ajuda a dar precisão para quem tem função renal normal ou próxima do normal.
Se a creatinina estiver acima do limite (K): O valor da creatinina dividido por K é elevado a uma potência negativa muito mais agressiva (-1,200 para ambos os sexos). Isso reflete que níveis mais altos de creatinina indicam uma queda rápida na filtragem dos rins.
Por fim, esse resultado parcial é multiplicado por:
Um fator de decaimento por ano de idade do paciente.
Um fator de correção para o sexo feminino (multiplica-se por 1,012).
Uma constante inicial de 142.
O resultado final é expresso em mL/min/1,73m² e indica o volume de sangue que os rins conseguem depurar por minuto.
O backend deverá:
Converter a creatinina para mg/dL.
Calcular a idade na data de referência.
Validar os parâmetros exigidos pela equação.
Executar a fórmula oficial versionada.
Retornar a TFGe em mL/min/1,73 m².
Registrar a fórmula e as entradas utilizadas.
A equação exata deverá ser codificada a partir de fonte técnica confiável e testada contra resultados de referência antes da ativação.

10.2.6. CKD-EPI Creatinina/Cistatina C 2021
Esta calculadora utiliza creatinina sérica e cistatina C para estimar a taxa de filtração glomerular.
Variáveis necessárias:
serum_creatinine: creatinina sérica.
creatinine_unit: unidade da creatinina.
cystatin_c: cistatina C sérica.
cystatin_c_unit: unidade da cistatina C.
age_years: idade na data de referência.
sex_factor: parâmetro definido pela equação aprovada.
reference_date: data de referência.
A fórmula matemática aplica coeficientes exponenciais distintos dependendo se os exames do paciente estão acima ou abaixo de limites específicos pré-estabelecidos. Ela funciona aplicando o princípio de "mínimos" e "máximos" em relação a esses limites:
O limite da creatinina (chamado de constante K) é de 0,7 para mulheres e 0,9 para homens.
Se a creatinina for baixa (menor ou igual a K), a divisão da creatinina por K é elevada a uma potência de -0,241 (mulheres) ou -0,302 (homens).
Se a creatinina for alta (maior que K), o valor é elevado à potência de -1,200 para ambos os sexos.
O limite padrão para a cistatina C é de 0,8 mg/L para ambos os sexos.
Se a cistatina C for baixa (menor ou igual a 0,8), o resultado da cistatina C dividido por 0,8 é elevado à potência de -0,323.
Se a cistatina C for alta (maior que 0,8), o valor é elevado à potência de -0,778. 
Depois que os fatores dos dois exames são calculados e multiplicados entre si, o resultado passa por mais duas reduções: 
Multiplica-se por uma taxa de decaimento anual correspondente a 0,9961 elevado à idade do paciente.
Se o paciente for do sexo feminino, multiplica-se o valor final por 0,963.
Toda essa estrutura é multiplicada por uma constante inicial fixa de 135.
O resultado final é expresso em mL/min/1,73m²
O backend deverá converter cada biomarcador para a unidade exigida pela fórmula aprovada, validar a disponibilidade de ambos e executar a versão oficial CKD-EPI Creatinina/Cistatina C 2021.
O resultado será apresentado em mL/min/1,73 m². A execução deverá guardar separadamente os valores originais, os valores normalizados, as unidades e as referências aos exames de origem.
Se qualquer biomarcador estiver ausente ou inválido, a execução deverá ser bloqueada e o usuário informado sobre o dado faltante. O backend não poderá substituir automaticamente a equação combinada por uma equação baseada somente em creatinina.

10.2.7. Kt/V
O termo Kt/V abrange diferentes fórmulas e modalidades. A implementação deverá começar somente depois de o responsável clínico definir a modalidade e a variante pretendidas.
Variáveis possíveis, conforme a variante selecionada:
dialysis_modality: modalidade de diálise.
dialysis_duration: duração da sessão.
urea_pre: ureia antes da sessão.
urea_post: ureia após a sessão.
weight_pre_kg: peso antes da sessão, quando necessário.
weight_post_kg: peso após a sessão, quando necessário.
ultrafiltration_volume: volume de ultrafiltração, quando necessário.
Outras variáveis específicas da equação validada.
Kt/V=-CtC0-0,008t+4-3,5CtC0UFW
Para realizar essa conta, os laboratórios e softwares utilizam quatro dados principais do paciente e da sessão de diálise:
C₀ (Ureia Pré): O nível de ureia no sangue do paciente coletado imediatamente antes de iniciar a sessão de diálise.
Ct (Ureia Pós): O nível de ureia coletado imediatamente após o término da sessão.
t: A duração real da sessão de diálise expressa em horas.
UF (Ultrafiltração): A quantidade total de líquido (peso) que foi retirada do paciente durante a sessão, medida em litros ou quilos.
W (Peso Pós): O peso final do paciente em quilos, aferido logo após o término da diálise.
O backend não deverá tratar essas entradas como universalmente obrigatórias para todas as fórmulas. Cada variante terá um esquema de entrada próprio, com unidades e validações específicas.
O fluxo deverá identificar a modalidade, selecionar a fórmula correspondente, verificar se todas as entradas exigidas estão disponíveis e executar a equação versionada. Não deverá combinar entradas de sessões diferentes sem uma regra clínica expressamente aprovada.
O resultado, as entradas e a modalidade deverão ser armazenados juntos. Até que a variante seja validada, a calculadora permanecerá desativada.
A sigla Kt/V divide o processo em três conceitos fundamentais que determinam se a diálise está limpando bem o sangue:
K (Clearance/Depuração): É a capacidade que o filtro da diálise (dialisador) tem de limpar a ureia por minuto. Depende do tamanho do filtro e da velocidade do fluxo de sangue e de água do próprio aparelho.
t (Tempo): É o tempo total em que o sangue permaneceu rodando na máquina. Sessões mais longas permitem que mais toxinas saiam dos tecidos profundos e entrem no sangue para serem limpas.
V (Volume de Distribuição): É o volume total de água no corpo do paciente onde a ureia está dissolvida. Como o corpo humano é composto por cerca de 50% a 60% de água, quanto maior a pessoa, maior o seu "V" e mais diálise ela precisará para atingir a meta.
Para pacientes que fazem hemodiálise 3 vezes por semana, o valor mínimo aceitável por sessão é de 1,2.
A meta recomendada pelas diretrizes médicas (como o KDOQI) é buscar um alvo de 1,4 para garantir uma margem de segurança.
Valores abaixo de 1,2 indicam que a diálise foi insuficiente, o que exige ajustes médicos (como aumentar o tempo da sessão ou trocar o modelo do filtro).
10.2.8. KFRE
A KFRE estima o risco de progressão para falência renal dentro de um horizonte definido. Não é um diagnóstico nem uma decisão automática de tratamento.
O projeto deverá priorizar a variante não norte-americana indicada pela referência clínica adotada pela SBN, mas a fórmula exata e a população de calibração deverão ser confirmadas antes da implementação.
Variante de quatro variáveis
As entradas usuais incluem:
age_years: idade.
sex_factor: parâmetro definido pelo modelo.
egfr: taxa de filtração glomerular estimada.
urine_acr: relação albumina/creatinina urinária.
Variante de oito variáveis
Além das entradas anteriores, poderá incluir:
serum_albumin: albumina sérica.
serum_calcium: cálcio sérico.
serum_phosphate: fosfato sérico.
serum_bicarbonate: bicarbonato sérico.
A lista final, as unidades, os coeficientes e as transformações deverão corresponder à versão aprovada da equação. O sistema não poderá misturar coeficientes de versões diferentes.
Horizonte e execução
O backend deverá identificar separadamente a versão de quatro ou oito variáveis e o horizonte selecionado, de dois ou cinco anos, quando suportado pela variante validada.
O fluxo será:
Validar a população e os critérios de aplicabilidade definidos clinicamente.
Validar todas as entradas e suas unidades.
Confirmar a origem e a data de cada exame.
Executar a equação e a calibração correspondentes.
Retornar o risco estimado, o horizonte e a versão do modelo.
Apresentar limitações e avisos aprovados clinicamente.
O backend não deverá extrapolar resultados para populações não validadas nem converter a probabilidade calculada em uma recomendação terapêutica automática.
10.3. Origem e validade das entradas
Para todas as calculadoras, as entradas poderão ser:
digitadas e confirmadas pelo médico;
selecionadas entre registros clínicos já confirmados.
O sistema não buscará automaticamente dados em sistemas externos no MVP.
Cada calculadora deverá ter uma política própria de validade temporal. Por exemplo, a janela aceitável de um exame laboratorial não deverá ser definida por uma regra global que seja aplicada indiscriminadamente a todas as equações.
A execução persistida deverá conter:
calculator_code;
formula_version;
run_type;
patient_id;
performed_by_user_id;
reference_date;
executed_at;
input_values;
input_units;
source_record_ids;
normalized_inputs;
result_value;
result_unit;
rounding_rule_version;
validation_status;
limitations.
Os dados originais do prontuário não serão alterados durante o cálculo.
A idade será calculada a partir da data de nascimento e da data de referência do cálculo.
10.4. Simulações e cálculos registrados
A tabela calculation_runs armazenará execuções de cálculo com o campo run_type:
SIMULATION: exploração de cenários, sem integração automática à evolução clínica;
CLINICAL_RECORD: cálculo que o médico decidiu registrar formalmente no prontuário.
Simulações não aparecerão como cálculos clínicos confirmados nem alimentarão gráficos ou indicadores clínicos.
Para registrar um cálculo como dado clínico, o médico deverá realizar uma ação explícita, revisar as entradas e confirmar o registro.
Cada execução guardará:
calculadora e versão da equação;
versão do catálogo de entradas;
valores e unidades;
identificadores dos registros de origem;
data de referência;
data/hora da execução;
usuário responsável;
resultado com precisão interna;
regra de arredondamento exibida;
tipo de execução;
observação clínica, quando aplicável.
Atualizações de fórmulas não recalcularão resultados históricos automaticamente.
11. Documentos clínicos
11.1. Tipos e limites
O MVP aceitará:
PDF;
JPEG;
PNG.
Tamanho máximo: 10 MB por arquivo.
O upload será associado a um paciente e terá metadados de origem, autor, data, tamanho, MIME real, hash e estado de revisão.
O envio de um documento não criará automaticamente resultados laboratoriais ou registros clínicos estruturados.
11.2. Segurança de arquivos
O sistema deverá:
verificar o tipo real do arquivo, não apenas sua extensão;
validar tamanho e conteúdo;
executar antivírus;
aplicar tratamento seguro de PDFs e remover ou neutralizar conteúdo ativo quando aplicável;
remover metadados EXIF de imagens quando apropriado;
armazenar arquivos em bucket privado e criptografado;
emitir URLs assinadas de curta duração somente após autorização;
impedir acesso público aos objetos;
registrar upload, visualização, revisão e destinação.
Não haverá botão de exportação ou download no MVP. Contudo, a especificação não prometerá impedir captura de tela, cópia externa ou outras formas de reprodução do conteúdo exibido a um usuário autorizado.
11.3. Revisão e remoção
Documentos terão estados de revisão e histórico de comentários.
Solicitações de remoção serão avaliadas considerando a natureza do documento, a retenção aplicável e as obrigações legais. O administrador operacional não poderá eliminar um documento clínico apenas por uma solicitação sem que o fluxo de retenção seja verificado.
12. Termos de uso, privacidade e base legal
12.1. Papéis de tratamento de dados
Cada hospital ou rede será responsável por definir seu papel como controlador dos dados e as responsabilidades de fornecedores, que poderão atuar como operadores quando tratarem dados conforme instruções do controlador.
A relação concreta será formalizada em contrato. Não se presumirá que o fornecedor do NefroHub é sempre controlador ou sempre operador em todos os cenários.
12.2. Base legal
O tratamento de dados pessoais sensíveis deverá ter uma hipótese legal aplicável, documentada por finalidade e operação.
A tutela da saúde, nos termos do art. 11 da LGPD, poderá ser pertinente para tratamentos realizados por profissionais ou serviços de saúde, conforme as condições legais. Outras hipóteses, como cumprimento de obrigação legal ou regulatória e exercício regular de direitos, poderão ser aplicáveis a operações específicas.
Consentimento não será tratado como justificativa universal para todos os tratamentos necessários à prestação de cuidados. Quando utilizado para uma finalidade opcional, deverá ser específico, informado, destacável e revogável nos termos aplicáveis.
A instituição deverá validar as bases legais com seu jurídico e encarregado de proteção de dados. LGPD — texto compilado.
12.3. Documentos legais versionados
A tabela legal_document_versions terá:
id;
document_type;
version;
locale;
content_hash;
effective_at;
status;
created_at;
approved_by_user_id.
Tipos de documento poderão incluir:
termos de uso;
aviso ou política de privacidade;
consentimento para finalidade opcional específica;
outros avisos institucionais aprovados.
A tabela legal_acceptances terá:
id;
user_id, quando houver conta;
patient_id, quando a evidência se referir a um paciente sem conta;
document_version_id;
acceptance_type;
accepted_at;
recorded_by_user_id;
representative_relationship_id, quando aplicável;
method;
evidence_json;
withdrawn_at, quando pertinente.
Deverá existir exatamente um sujeito principal por aceite: uma conta ou um paciente sem conta. Quando o representante agir em nome de um paciente, o registro deverá apontar para a relação de representação válida e para quem registrou a ação.
O aceite de termos, a ciência do aviso de privacidade e o consentimento para uma finalidade opcional serão eventos distintos. Aceite de termos não será usado como substituto de uma base legal para tratamento de dados de saúde.
Versões históricas serão preservadas. Alterações materiais poderão exigir nova ciência ou aceite conforme o tipo de documento e a avaliação jurídica.
12.4. Política de privacidade
A política deverá informar:
identidade e contato do controlador;
contato do encarregado;
categorias de dados coletados;
finalidades e bases legais;
destinatários e operadores;
armazenamento e transferências;
medidas gerais de segurança;
prazos e critérios de retenção;
direitos dos titulares;
procedimentos para menores e representantes;
canais para solicitações e incidentes;
ausência de IA e de compartilhamento com serviços externos de IA no MVP.
12.5. Termos de uso
Os termos deverão cobrir:
finalidade da plataforma;
obrigações de cada perfil;
proibição de compartilhar contas;
limites da atuação de representantes;
responsabilidade pelo uso de credenciais;
limites de disponibilidade e suporte;
ausência de atendimento emergencial;
ausência de diagnóstico automatizado;
natureza do estado “confirmado”;
regras de acesso, suspensão e encerramento;
canais de suporte e incidentes.
O texto deverá ser revisado por assessoria jurídica antes do piloto.
12.6. RIPD e encarregado
Antes do piloto com dados reais, será elaborado um Relatório de Impacto à Proteção de Dados Pessoais (RIPD), contemplando dados, operações, finalidades, bases legais, fluxos, riscos, medidas mitigadoras, risco residual e responsáveis.
O relatório deverá ser atualizado quando houver mudanças materiais de arquitetura, finalidade, categorias de dados ou perfil de risco. A orientação da ANPD sobre RIPD será utilizada como referência. Orientação da ANPD.
O controlador deverá designar e divulgar o contato do encarregado quando aplicável, além de definir um canal para solicitações dos titulares e comunicações regulatórias.
13. Retenção e descarte
13.1. Prontuário clínico
A política de retenção deverá considerar a Lei nº 13.787/2018, que prevê prazo mínimo de 20 anos a partir do último registro para a eliminação de prontuários, observadas as condições legais aplicáveis.
O padrão inicial do NefroHub será reter o prontuário por pelo menos 20 anos desde o último registro, sem prejuízo de prazo maior exigido por normas profissionais, obrigações legais, contratos ou determinações aplicáveis. A aplicabilidade exata a cada tipo de registro deverá ser confirmada pelo jurídico e pela instituição antes da produção.
Referência: Lei nº 13.787/2018.
13.2. Auditoria
A auditoria terá política própria de retenção, definida pela instituição e revisada juridicamente. Não será adotado automaticamente um prazo de dois anos para todo evento.
Os eventos deverão evitar snapshots completos de dados clínicos quando metadados, referências e hashes forem suficientes para demonstrar a ação.
13.3. Dados rejeitados e solicitações de exclusão
O conteúdo rejeitado poderá ser eliminado conforme a política aprovada, depois de verificar se existe obrigação de retenção ou necessidade documentada de conservação.
A evidência mínima da decisão poderá ser mantida sem reproduzir o valor clínico rejeitado.
Solicitações de exclusão não implicam eliminação automática de prontuário que esteja sujeito a obrigação legal de conservação. O sistema deverá registrar a solicitação, a decisão, a justificativa e a destinação final.
13.4. Backups e arquivo de longo prazo
Backups operacionais não substituem a política de retenção do prontuário.
A instituição deverá ter estratégia separada para preservação de longo prazo, descarte autorizado, bloqueios legais e recuperação. A política de backups de curta duração não será apresentada como mecanismo suficiente para cumprir retenção de 20 anos.
14. Arquitetura técnica
14.1. Stack escolhida

Frontend: React + TypeScript + Vite
Backend: Python + Django + Django REST Framework
Banco de dados: PostgreSQL Supabase
Tarefas assíncronas: Celery + Redis
Armazenamento de arquivos: Amazon S3 privado
Hospedagem: AWS na região de São Paulo (Sa-east-1)
Execução de containers: AWS ECS Fargate
Banco gerenciado: Amazon RDS for PostgreSQL
E-mail transacional: Amazon SES
Segredos e chaves: AWS Secrets Manager e AWS KMS
Monitoramento: CloudWatch e Sentry com filtragem de dados
Controle de versão: Git
CI/CD: Pipeline automatizado com aprovações de implantação
Empacotamento: Docker
A escolha da AWS é uma decisão inicial de arquitetura, não uma promessa de custo fixo. Disponibilidade regional de cada serviço, requisitos contratuais, residência dos backups e custos deverão ser confirmados antes da contratação.
14.2. Isolamento por cliente
Cada hospital ou rede contratante terá uma implantação isolada, com:
banco de dados próprio;
armazenamento próprio;
chaves e credenciais próprias;
ambientes próprios;
política de backup própria;
permissões operacionais e de suporte delimitadas.
Não haverá tabelas clínicas compartilhadas entre diferentes clientes.
Uma rede com múltiplas unidades poderá usar a tabela care_units dentro de sua instalação. A unidade será uma subdivisão assistencial da mesma instituição ou rede, com regras próprias de autorização. Não permitirá acesso cruzado a outras instalações.
14.3. Ambientes
Serão mantidos:
desenvolvimento;
teste automatizado;
homologação;
produção.
Dados reais de produção não serão copiados para ambientes inferiores. Testes e demonstrações usarão dados sintéticos ou devidamente anonimizados.
A aplicação de migrations seguirá uma pipeline controlada, com compatibilidade de versões, rollout gradual e registro de resultados por instalação.
14.4. Atualizações e migrations
As atualizações seguirão o processo:
Criar uma versão imutável do aplicativo e das migrations.
Executar testes unitários, integração, autorização e migração.
Testar em homologação com dados sintéticos.
Liberar para instalações piloto.
Monitorar erros e indicadores.
Interromper a expansão quando os limites de falha forem ultrapassados.
Registrar versão, resultado e estado do schema por instalação.
Será usada uma estratégia de migrations compatíveis, preferencialmente expand-and-contract. A aplicação deverá recusar iniciar se o schema for incompatível. Falhas não poderão ser resolvidas apagando dados ou executando mudanças manuais sem rastreabilidade.
14.5. Observabilidade entre instalações
A observabilidade centralizada poderá receber:
identificador técnico da instalação;
versão do aplicativo;
duração e tipo da requisição;
códigos de erro;
métricas de infraestrutura;
estado de jobs e migrations;
identificadores de correlação não sensíveis.
Não receberá nomes, CPF, resultados clínicos, documentos, tokens ou conteúdo de requisições.
O suporte não poderá abrir prontuários a partir de ferramentas de monitoramento.
14.6. Estimativa de custos
O orçamento deverá separar:
infraestrutura-base por instalação;
banco de dados;
armazenamento e retenção de documentos;
backups e recuperação;
monitoramento;
e-mail;
suporte;
implantação e atualizações;
requisitos adicionais de disponibilidade.
Antes da primeira contratação, será produzido um orçamento com cenários mínimo, esperado e de crescimento. Não será fixado preço mensal universal sem definir volume, retenção e nível de serviço.
15. Segurança e controle de acesso
15.1. Autenticação
Contas de médicos, administradores e representantes deverão usar MFA com TOTP. Para pacientes, MFA será opcional inicialmente, podendo ser exigido conforme avaliação de risco institucional.
O fluxo de recuperação de conta deverá verificar identidade e não depender exclusivamente do conhecimento de dados pessoais.
Senhas deverão:
ter pelo menos 12 caracteres;
aceitar frases-senha;
ser verificadas contra listas de senhas comprometidas;
ser armazenadas usando Argon2id ou mecanismo equivalente aprovado;
ter proteção contra tentativas automatizadas;
não ser registradas em logs.
Não será exigida composição artificial de letras maiúsculas, números e símbolos se isso não for necessário à política de segurança adotada.
15.2. Recuperação de TOTP
O reset de MFA não será uma ação livre de qualquer administrador.
O processo exigirá:
Solicitação e protocolo.
Verificação de identidade por processo institucional aprovado.
Aprovação por segundo responsável autorizado, distinto do solicitante.
Revogação do autenticador anterior e das sessões conforme o risco.
Novo vínculo de configuração TOTP de uso único e validade curta.
Auditoria dos responsáveis, motivo e resultado.
Notificação de segurança ao titular por canal independente.
Configuração do novo autenticador antes de restaurar o acesso clínico.
Códigos de recuperação, se oferecidos, serão de uso único e armazenados como hashes. O suporte nunca poderá consultar o segredo TOTP existente.
15.3. Autorização centralizada
Todas as operações clínicas deverão passar por um serviço central de autorização no backend.
A verificação deverá considerar:
identidade autenticada;
papel;
vínculo ativo;
escopo de representação, quando aplicável;
unidade assistencial;
estado do registro;
finalidade da operação;
prazo e justificativa de acesso excepcional.
O frontend não será considerado mecanismo de segurança. Esconder um botão não substitui a autorização no servidor.
PostgreSQL Row-Level Security poderá ser utilizado como defesa adicional, quando compatível com a arquitetura. Não substituirá os testes e as verificações de autorização da aplicação.
15.4. Auditoria de leitura e escrita
O sistema registrará acessos e alterações relevantes a dados clínicos, incluindo:
usuário;
paciente;
recurso consultado ou alterado;
ação;
data/hora;
resultado da operação;
justificativa de acesso excepcional;
referência de correlação.
Eventos serão append-only, com permissões de banco que impeçam alterações e exclusões por perfis comuns, além de controles adicionais para detectar adulteração.
A auditoria será particionada por mês quando o volume justificar. O conteúdo completo de registros clínicos não será copiado indiscriminadamente para os logs.
15.5. Django Admin
O Django Admin não será usado para editar diretamente tabelas clínicas em produção.
A interface administrativa será construída com serviços e endpoints que executem as mesmas regras de autorização, imutabilidade, auditoria e validação da aplicação principal.
Acesso de emergência à infraestrutura será separado das permissões clínicas e auditado.
15.6. Proteção de dados e logs
Logs, Sentry e ferramentas de observabilidade não poderão conter:
CPF completo;
senhas;
tokens;
segredos TOTP;
documentos;
resultados clínicos completos;
payloads de requisições com dados sensíveis.
O sistema deverá mascarar dados antes do envio à observabilidade, e não depender apenas de filtros aplicados posteriormente.
15.7. Incidentes
A instituição deverá manter plano de resposta a incidentes que inclua detecção, contenção, investigação, preservação de evidências, avaliação de impacto, comunicação interna e notificações exigidas.
Os prazos e destinatários das notificações legais serão definidos pelo responsável jurídico conforme a legislação vigente e a natureza do incidente.
16. Modelo de dados consolidado
O modelo lógico inicial terá as seguintes entidades.

users: Contas de autenticação, papel e estado da conta.
institutions: Configuração institucional da instalação.
care_units: Unidades assistenciais dentro da mesma instalação.
physician_profiles: CRM, UF, situação profissional e validação.
patient_profiles: Identidade da pessoa atendida, com conta opcional.
patient_representations: Relação e escopo de representantes.
physician_patient_links: Vínculos entre médicos e pacientes.
physician_patient_link_events: Histórico de transições de vínculo.
clinical_records: Identidade, estado e autoria de registros clínicos.
clinical_submission_revisions: Histórico de ajustes antes da confirmação.
review_requests: Pedidos de correção, revisão e outras solicitações clínicas.
review_messages: Mensagens vinculadas a solicitações.
rejected_submission_events: Evidência mínima de rejeição e destinação.
lab_results: Resultados laboratoriais estruturados.
vital_signs: Medições de sinais vitais.
conditions: Doenças e comorbidades.
medications: Medicamentos e respectivos estados.
allergies: Alergias e estados de informação.
treatments: Tratamentos registrados.
dialysis_treatments: Cursos de tratamento dialítico.
dialysis_sessions: Sessões e parâmetros pertinentes.
hospitalizations: Histórico de internações.
documents: Metadados, armazenamento e revisão de arquivos.
evolution_display_preferences: Preferências individuais de exibição.
calculation_runs: Execuções de calculadoras, com simulações separadas.
legal_document_versions: Versões de termos e documentos legais.
legal_acceptances: Evidências de ciência e aceite.
audit_events: Eventos de auditoria append-only.
outbox_events: Eventos de negócio para processamento assíncrono.
notifications: Notificações internas e seu estado.
email_delivery_events: Histórico de envio e entrega de e-mails.
institution_settings: Configurações institucionais aprovadas.
retention_disposal_records: Decisões e evidências de descarte.
16.1. Regras de relacionamento
patient_profiles.user_id será nullable e único quando preenchido.
Cada registro clínico pertencerá a um paciente.
Registros confirmados serão imutáveis.
A nova versão de um registro referenciará a anterior por supersedes_record_id.
Pedidos de correção não alterarão o estado do registro confirmado.
Cada paciente ativo terá um médico responsável.
Representantes só acessarão pacientes por relações válidas e verificadas.
Preferências de evolução pertencerão ao médico e ao paciente.
Execuções de calculadoras guardarão suas entradas e versões.
Eventos de auditoria não serão apagados por rotinas administrativas comuns.
Dados de diferentes instalações não compartilharão tabelas clínicas.
care_units representará unidades internas de uma mesma instalação, não um mecanismo de compartilhamento entre clientes.
17. Requisitos não funcionais
17.1. Desempenho e capacidade
Para a primeira estimativa de produção, serão usados os seguintes valores provisórios por instalação:
até 10.000 pacientes;
até 300 médicos;
até 1 milhão de registros clínicos estruturados;
até 50 usuários simultâneos.
Meta inicial: percentil 95 de até 2 segundos para operações comuns de leitura e gravação, excluindo transferências de arquivos, operações administrativas pesadas e condições externas de rede.
Esses números deverão ser confirmados com a instituição e usados para testes de carga antes da contratação. O sistema deverá ser dimensionado com base em volume real, crescimento esperado e orçamento.
17.2. Disponibilidade e recuperação
Metas iniciais propostas:
disponibilidade mensal de 99,5%, excluindo manutenção planejada conforme política contratual;
RPO de até 15 minutos;
RTO de até 4 horas.
Essas metas são objetivos de projeto, não garantias, até serem confirmadas por arquitetura, orçamento, testes de restauração e contrato.
Backups deverão permanecer na região aprovada no Brasil, com criptografia e controle de acesso. A restauração será testada periodicamente.
17.3. Acessibilidade e responsividade
A interface deverá funcionar em desktop, tablet e dispositivos móveis.
O projeto seguirá como alvo WCAG 2.1 AA, incluindo navegação por teclado, foco visível, rótulos acessíveis, mensagens de erro compreensíveis e contraste adequado.
A experiência do paciente será prioritariamente simples, com formulários curtos e estados claros de envio e validação.
17.4. Consistência de dados
O sistema deverá:
utilizar transações para operações que criem ou confirmem registros;
validar novamente duplicidade no servidor durante o envio;
tratar concorrência e requisições repetidas de forma idempotente;
impedir perda silenciosa de atualizações;
preservar precisão decimal;
manter versões de catálogos e equações;
evitar que falhas de notificações desfaçam registros clínicos;
não descartar valores extremos apenas por ultrapassarem limites de plausibilidade.
17.5. Experiência de uso antes do desenvolvimento
Antes de implementar o fluxo clínico completo, será realizado um ciclo de desenho e validação com profissionais de nefrologia e, quando viável, pacientes ou representantes.
O ciclo deverá validar:
cadastro de paciente sem conta;
criação de vínculo;
envio e revisão de dados;
correção e rejeição;
leitura da evolução;
fluxo de representantes;
experiência de documentos e diálise;
acessibilidade e compreensão dos estados.
Testes com usuários utilizarão protótipos ou dados sintéticos, com procedimentos de consentimento e privacidade apropriados.
18. Estratégia de testes e critérios de aceite
18.1. Testes de autorização
A pipeline de CI deverá bloquear a entrega se houver falhas nos seguintes cenários:
médico acessando paciente sem vínculo autorizado;
representante acessando paciente sem representação válida;
médico consultando paciente após encerramento do vínculo;
usuário de uma unidade acessando dados sem permissão;
administrador operacional consultando dados clínicos sem autorização excepcional;
tentativa de confirmar ou alterar registro por perfil não autorizado;
acesso cruzado entre instalações isoladas.
18.2. Imutabilidade e correções
Testes deverão demonstrar que:
registros confirmados não aceitam UPDATE ou DELETE;
uma correção gera nova versão;
a versão antiga permanece intacta;
ciclos de versões são rejeitados;
pedidos de correção não alteram o registro original;
o solicitante não aprova a própria solicitação;
cada decisão gera auditoria;
valores ajustados antes da confirmação são rastreáveis.
18.3. Fluxos do paciente
Testes deverão cobrir:
envio de dados sem conta;
envio por paciente autenticado;
envio por representante autorizado;
bloqueio de edição direta após envio;
solicitação de correção;
consulta ao motivo da rejeição;
notificação genérica sem conteúdo clínico;
destinação de conteúdo rejeitado;
bloqueio de acesso após revogação de representação.
18.4. Vínculos e desativação
Testes deverão confirmar:
transições válidas de estado;
rejeição de transições não permitidas;
auditoria de todas as mudanças;
reatribuição de pacientes antes da desativação;
reatribuição dos rascunhos;
bloqueio da desativação do último médico responsável quando ainda houver pacientes sem substituto;
revogação de sessões e permissões do médico desativado.
18.5. Dados clínicos e unidades
Testes deverão validar:
vírgula e ponto decimal;
valores NUMERIC;
comparadores;
unidades aceitas por exame;
conversões somente com regras aprovadas;
preservação de valor e unidade originais;
limites de plausibilidade sem descarte automático;
datas clínicas sem conversão indevida de fuso horário;
comparabilidade de unidades em gráficos.
18.6. Segurança operacional
Testes deverão verificar:
MFA e recuperação de TOTP;
rate limiting e recuperação de senha;
isolamento de ambientes;
ausência de dados reais em desenvolvimento e homologação;
ausência de PII em logs e Sentry;
proteção de uploads;
autorização antes de emitir URLs assinadas;
append-only da auditoria;
backups e restauração;
falhas e retentativas do outbox;
comportamento de migrations em atualização gradual.
18.7. Calculadoras
Cada calculadora deverá possuir:
especificação clínica aprovada;
versão de fórmula;
entradas e unidades documentadas;
casos de referência;
testes de limites e dados ausentes;
comparação com a ferramenta de referência;
revisão por profissional clínico;
separação entre simulação e cálculo registrado.
Nenhuma calculadora será ativada em produção sem esses critérios.
19. Fases de implementação
Fase 0 — Descoberta e governança
Entregas:
aprovação do escopo do MVP;
definição dos fluxos de pacientes sem conta;
definição das regras de representação;
aprovação dos estados e transições;
definição da retenção com jurídico;
avaliação de privacidade e RIPD;
validação inicial do catálogo clínico;
protótipos dos fluxos principais.
Critério de saída: papéis, decisões de negócio, responsáveis clínicos e pendências regulatórias definidos.
Fase 1 — Fundação técnica e segurança
Entregas:
ambientes e implantação isolada;
banco e migrations;
autenticação e MFA;
autorização centralizada;
auditoria;
infraestrutura de e-mail;
outbox e workers;
logs e monitoramento sem PII;
pipelines de CI/CD.
Critério de saída: testes de isolamento, autenticação e autorização aprovados.
Fase 2 — Cadastro e prontuário
Entregas:
cadastro de pacientes;
pacientes sem conta;
vínculos e transições;
rascunhos;
exames e sinais vitais;
envio do paciente;
fila clínica;
confirmação, rejeição e correção;
imutabilidade e versões.
Critério de saída: fluxos clínicos e de auditoria aprovados.
Fase 3 — Recursos clínicos complementares
Entregas:
doenças e comorbidades;
medicamentos e alergias;
tratamentos;
diálise;
internações;
documentos;
evolução clínica;
preferências de exibição;
representantes.
Critério de saída: permissões, validação de dados e usabilidade aprovadas.
Fase 4 — Homologação e preparação para produção
Entregas:
testes de carga;
testes de segurança;
revisão de autorização;
validação de recuperação;
teste de backups;
revisão jurídica e de privacidade;
treinamento de usuários;
monitoramento de implantação;
procedimentos de suporte e incidentes.
Critério de saída: gates de segurança, operação e governança concluídos.
Fase 5 — Calculadoras
Entregas independentes por calculadora:
documentação da fórmula;
validação clínica;
implementação;
testes de referência;
revisão de interface e limitações;
ativação controlada por feature flag.
Critério de saída: aprovação individual para cada calculadora. Uma calculadora pendente não impedirá a utilização das demais funcionalidades já aprovadas.
20. Estimativa de esforço
Estimativa preliminar para planejamento, não compromisso de entrega:

Beta funcional: 2,5–3 meses
Versão preparada para produção: 4–6 meses
Equipe de referência: 3–4 desenvolvedores, QA e apoio parcial de design
Validação clínica e jurídica: Participação dos responsáveis institucionais ao longo do projeto
Calculadoras: Estimativa individual após validação das equações e casos de referência
A estimativa depende do nível de experiência da equipe, disponibilidade dos profissionais clínicos, infraestrutura contratada, complexidade de aprovação institucional e requisitos regulatórios.
O prazo de produção não deverá ser considerado garantido antes de concluir a fase de descoberta e validar o escopo com a instituição.
21. Pendências formais antes da produção
Os itens abaixo não são decisões em aberto para a implementação resolver por conta própria. São aprovações que deverão ser obtidas dos responsáveis apropriados.

Base legal por finalidade e operação: Jurídico e encarregado
Política de retenção e destinação: Jurídico e instituição
Regras para representação de menores e incapazes: Jurídico e instituição
SLA e prioridade da fila clínica: Responsável clínico
Catálogo e limites de plausibilidade: Nefrologista ou equipe clínica
Requisitos de assinatura de registros clínicos: Jurídico e responsável clínico
Classificação regulatória de funcionalidades futuras: Responsável regulatório/jurídico
RPO, RTO, disponibilidade e custo: Engenharia e instituição
Acesso excepcional e suporte: Segurança e instituição
As pendências não autorizam a equipe a inventar uma regra clínica ou regulatória. Quando a aprovação for necessária para a funcionalidade, ela permanecerá desativada até a decisão.
22. Referências principais
Lei nº 13.787/2018 — digitalização, guarda e manuseio de prontuários
Lei Geral de Proteção de Dados Pessoais — LGPD
ANPD — Relatório de Impacto à Proteção de Dados Pessoais
Sociedade Brasileira de Nefrologia — Calculadoras nefrológicas
Anvisa — regulamentação de software como dispositivo médico

