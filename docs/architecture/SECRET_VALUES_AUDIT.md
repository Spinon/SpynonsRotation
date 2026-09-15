# Auditoria de valores secretos — PATCH-002

Revisão de 2026-09-15 UTC, builds 69587 e 69814. O resultado é uma auditoria offline
de fronteiras e fallbacks, não aprovação de combate, taint, rendering ou conformidade
do cliente. TEST-002 continua pendente de inspeção real. Não foram ampliadas as
capabilities de rotação nem liberados dados proibidos.

## Matriz de riscos

`tools/wow-api/secret-audit.json` é o registro verificável: sinal, classificação,
guard, fallback, limitação, arquivos e suítes associadas. Cobre todos os 16 arquivos
atuais de Compat e dez consumidores selecionados, total de 26 fontes revisadas.

| Risco | Fronteira | Decisão quando indisponível |
| --- | --- | --- |
| SECRET-01 | Combate, recursos, auras, cooldowns e cargas | SKIP; nenhum zero ou ausência fictícia |
| SECRET-02 | Build, spec e talentos | Falha estrutural controlada; metadados públicos dos pins |
| SECRET-03 | Bindings, slots e identidade de ação | Omitir tecla; invalidar cache |
| SECRET-04 | Texturas e identidade de cast | Placeholder; sem consumo presumido |
| SECRET-05 | DurationObject e GCD | Encaminhamento opaco ao widget; sem progresso inventado |
| SECRET-06 | Identidade e escrita de perfil | Recusar escrita no contexto não observável |
| SECRET-07 | Slash e diagnóstico | Descartar entrada secreta; não serializar exceção bruta |
| SECRET-08 | Quantidade de alvos | AUTO → ST como escolha segura, não medição |
| SECRET-09 | Fontes e cooldown visual | Fonte de reserva ou aparência nativa |
| SECRET-10 | Evento → estado → decisão/indicador | Retirar dado/conselho antigo; regra sem capability não avalia |

Metadados de build/spec/traits e referências próprias de UI não são tratados como
fontes de estado de combate. As fontes pinadas de ClassTalents, SharedTraits e
SpecializationInfo não marcam seus retornos como secretos. Essa é uma inferência
limitada ao snapshot documentado, não garantia eterna: mudança nos pins invalida a
revisão. Configuração estática do módulo e snapshots normalizados são precondições
dos contratos internos; o Core não aceita objetos brutos de API como substitutos.

## Achado e correção

`State.fields` guardava o container e cada retorno, mas a indexação de um campo podia
lançar erro fora de contenção. Isso poderia interromper HandleEvent após marcar
`updating`, impedindo eventos posteriores. O acesso opcional à propriedade de dono
da aura tinha o mesmo risco. Não há evidência de que tenha ocorrido na sessão do PO.

`State:ReadPublicField` agora verifica o container, faz somente a indexação selecionada
sob pcall e verifica o valor antes de validá-lo/normalizá-lo. Falha vira CALL_FAILED,
sem texto da exceção. Se o valor retornado for secreto, vira SECRET_RESTRICTED. A
propriedade opcional de dono é omitida; isso nunca autoriza tratar uma aura de alvo
como pertencente ao jogador. Bindings reutiliza essa mesma fronteira.

pcall é contenção de erro, não permissão para converter ou operar dados secretos.
Não há unwrapping, serialização, enumeração de tabelas restritas, delegate seguro,
leitura de combat log ou derivação do texto visível do cooldown. `issecretvalue` deve
retornar false explicitamente para cada valor consumido; ausência/falha fecha a leitura.

## Checks e manutenção

Revisão UX-007: Media acrescenta leitura de geometria do frame próprio, protegida
por pcall e guard/finite antes da aritmética; falhas cancelam o arraste. Controller
preserva combate público falso e commit transacional dos eixos. RecommendationEngine
altera apenas limite explícito do serviço para seis, sem mudar regras/capabilities.
Hashes desses três consumidores/fronteiras revistos com regressões hud_editor_spec;
builds e aprovação Retail permanecem inalterados.

`npm run secret:check` valida matriz, cobertura de todo Compat, presença de suítes,
pins e SHA-256 das 26 fontes. Os hashes normalizam apenas CRLF para LF. Alteração de
código, arquivo novo de Compat ou mudança de pin exige rever o risco e atualizar a
evidência. Não existe comando para aprovar automaticamente hashes novos.

Para uma mudança autorizada: revisar a fonte e seu fluxo até o consumidor, confirmar
o contrato da API pinada, adicionar/atualizar regressões e só então atualizar o hash,
a matriz se necessário e reviewedAt. Não trocar hash apenas para deixar o check verde.
`npm run secret:test` testa o próprio gate, inclusive remoção de guard representada por
mudança de fonte, falta de classificação, pins alterados e evidência ausente. Ambos
fazem parte de npm test, junto das suítes Lua comportamentais e do diff de APIs.

`secret_audit_spec.lua` acrescenta 23 casos: todos os 12 campos numéricos/booleanos
selecionados de aura/cooldown/cargas, containers secretos, indexação recusada,
ownership opcional, evento de cast, GUID/spec, slash e recuperação do State Engine.
Sentinelas impedem stringificação, comparação ordenada, aritmética e indexação;
os testes existentes completam sonda positiva/ausente/falha, poder máximo independente,
capability filha restrita, fallback AUTO, limpeza de overlays e DurationObject opaco.

Limite: LuaJIT não implementa secret scalars, secret tables ou taint do Retail.
Sentinelas e hashes encontram regressões específicas, mas não são prova formal de
fluxo de informação nem substituem uma sessão de combate real.

## Revisão UX-008 — estado visual do contexto

ContextController passa a publicar cópias de seu status já sanitizado pelo detector.
O novo observer compara somente enums, booleanos e contagem pública validada na
fronteira existente; não consulta novas APIs nem acessa valores protegidos.
O estado é atualizado antes de callbacks da engine, com proteção contra reentrada;
listeners isolados não podem alterar o snapshot de outros consumidores.
ContextTag mostra enums/labels fechados e envia somente uma das quatro escolhas
manuais já suportadas. Não usa a contagem para construir texto nem ações protegidas.
Regressões de subscribers, fonte do fallback, clique e lifecycle estão em
`context_detector_spec.lua` e `context_tag_spec.lua`. Hash de ContextController
revisado; pins e classificação SECRET-08 preservados. Retail continua PENDING.

## Revisão PATCH-004 — diagnóstico limitado

StateReader preserva exatamente os gates anteriores e acrescenta apenas um segundo
retorno enum: NOT_USABLE, USABILITY_UNAVAILABLE, COOLDOWN_ACTIVE ou COOLDOWN_UNAVAILABLE.
RecommendationEngine preserva avaliação/prioridade, acrescentando detalhe de rejeição
e metadados da avaliação (lista, quantidade de ações, revisão e contexto isolado).
DebugReport consome somente snapshots internos via getters, com ReadPublicField nos
campos selecionados. Códigos são allowlisted; IDs de configuração têm caracteres e
tamanho limitados. Exceções de getters são descartadas, nunca serializadas.
Não exporta valores de cooldown/aura/recurso, objetos Blizzard, nomes/GUIDs ou talentos.
Testes incluem sentinelas secretas, containers secretos, acesso negado, getters ausentes,
truncamento e isolamento. SECRET-10 agora cobre DebugReport; nenhum pin/Compat API mudou.
Essa revisão não torna leituras restritas disponíveis nem homologa combate Retail.

## Revisão PATCH-005 — campos públicos independentes

StateEngine agora cria container parcial para charges/usability públicos mesmo se
a leitura principal de cooldown falhar. O container não autoriza seus campos: a
capability do cooldown continua restrita e somente a capability do filho público
permite a leitura daquele filho. Atualização substitui o container, sem copiar
tempos antigos; invalidação por restrição ainda apaga todos os campos voláteis.
StateReader não foi relaxado: prontidão depende de usability E cooldown públicos.

getActions pode fornecer um segundo retorno opcional de gates estáticos da spec.
Não influencia disponibilidade ou seleção: apenas metadados, cópias isoladas,
IDs limitados e quatro códigos fechados no DebugReport. Ausência de talento não é
substituída por presunção baseada na hero tree. Regressões cobrem filhos públicos,
tempos descartados, retorno a leitura pública e gates desconhecidos/secretos.

## Fontes primárias

- [FrameScript API da build 69814](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/FrameScriptDocumentation.lua): issecretvalue e distinção entre valor e conteúdo de tabela.
- [Secret predicates](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SecretPredicateAPIDocumentation.lua): sondas específicas por spell/recurso; não substituem guards de retorno.
- [SpecializationInfo](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpecializationInfoDocumentation.lua), [ClassTalents](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/ClassTalentsDocumentation.lua) e [SharedTraits](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SharedTraitsDocumentation.lua): metadados estáticos revisados.

O diff agora inclui FrameScript e totaliza 30 arquivos em ambos os pins. Sem diferença
documentada entre eles, mas Retail continua PENDING e nenhuma release foi autorizada.
