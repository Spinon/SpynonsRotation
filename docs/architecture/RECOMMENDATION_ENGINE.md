# Recommendation Engine — RUN-002

O runtime consome o bytecode v1 produzido pelo Rotation Lab. A fila contém até quatro **prioridades
elegíveis no estado atual**, não uma previsão de quatro casts futuros. Ações repetidas são deduplicadas;
identidade visual é `Action.id`, independente de posição ou da regra que a promoveu.

## Componentes e API

- `Rotation/Program.lua`: interpretador limitado a 1024 instruções por regra. Suporta constantes,
  leituras, existência, truthiness SimC (zero é falso), NOT, comparações, ALL e ANY.
- `Rotation/StateReader.lua`: seleciona campos públicos do PlayerState e adapta sinais derivados.
- `Rotation/RecommendationEngine.lua`: seleção de lista, ordenação por prioridade e ID, deduplicação,
  validação de Action/Recommendation e serviço observável conectado ao State Engine.
- `RecommendationEngine.Evaluate(bundle, actions, state, context, guard, limit)` retorna
  `{ recommendations, diagnostics }`; o limite padrão é 4, máximo 12.
- `Spynon.Recommendations`: `Start`, `Stop`, `GetRecommendations`, `GetDiagnostics`, `Subscribe` e `SetContext`.
  O bootstrap inicia a assinatura antes dos eventos de estado. Callbacks recebem cópias independentes.

Módulos fornecem `getRules(selection, state, context)` como bundle compilado com o entrypoint escolhido.
`StateEngine:GetSelection()` fornece somente specId, activeSpellRanks e Hero Tree sanitizados, sem expor
os objetos de traits. Ausência de seleção ou falha do provider limpa a fila anterior. A engine genérica
não conhece Hero Trees, nomes de listas ou regras de Enhancement.

## Segurança e determinismo

Uma capability estática no bytecode não autoriza leitura: a capability efetiva no PlayerState precisa
ser `ADDON_AVAILABLE`. A classificação mais específica prevalece sobre a do mapa pai. Valores e tabelas
selecionados passam novamente pelo guard de Compat. `SIM_ONLY`, fallback ausente, opcode desconhecido,
tipos incompatíveis, pilha inválida e listas esparsas não produzem recomendações.

Ausência é **unknown**, não false/zero. Unknown permanece unknown sob NOT, HAS_STATE, ALL e ANY; a regra
inteira é descartada. Isso é deliberadamente conservador, inclusive quando outra alternativa do ANY é
verdadeira. Nenhum valor secreto é convertido, comparado ou usado como razão da recomendação.

Elegibilidade exige ação permitida pelo módulo, condição verdadeira, cooldown público pronto e
`C_Spell.IsSpellUsable` publicamente verdadeiro. Usabilidade é capturada em Compat.State e atualizada
com os eventos de estado e `SPELL_UPDATE_USABLE`; invalidação de restrições também a descarta.
Não há casts automáticos, teste de alcance ou promessa de acerto no alvo. A fila pode ficar vazia durante
GCD, cooldown, ausência de dados ou restrições. Não se preenche com prioridades inventadas.

## Sinais derivados e limites explícitos

- Talentos: rank observado → `enabled`.
- Auras: expirationTime público e relógio público → `remains`; ausência confirmada → zero.
  Aura sem duração finita não vira infinito. Aura ativa no target exige `playerOwned=true`, normalizado
  de `isFromPlayerOrPlayerPet`; aura de outro autor ou autoria indisponível resulta em unknown, sem
  supor que seja a aura do jogador nem que ela esteja ausente.
- Cooldowns: timestamps públicos → `remains`/`ready` somente com modRate 1. Outros rates ficam indisponíveis
  até validação própria; não se pressupõe uma fórmula de duração.
- Cargas: capability independente; interpolação fracionária limitada ao próximo charge, somente com
  chargeModRate 1 e timestamps públicos. Não simula recargas futuras sucessivas.
- `combat.elapsed_seconds` ainda não é observado; suas regras usam SKIP. Inicialização no meio de combate
  nunca vira uma estimativa fabricada de início.
- Contexto inicial: AUTO com fallback explícito SINGLE_TARGET. Detecção e override pertencem à RUN-003.

Essas limitações significam que o subconjunto runtime **não tem equivalência integral de DPS** com o
SimC. As medições anteriores continuam evidência de pesquisa, não desempenho comprovado do addon.

## Integração do catálogo real

`npm run enhancement:addon-generate` empacota mecanicamente o bundle auditado em `RotationData.lua`;
`npm run enhancement:addon-check` verifica proveniência e paridade byte a byte. Não modifica prioridades,
condições ou artefatos de pesquisa. O módulo usa talentos realmente detectados para filtrar actions,
Hero Tree para `single_sb`/`single_totemic`, e contexto CLEAVE/AOE para `aoe`. Não presume uma Hero Tree
quando ela é desconhecida. O primeiro runtime atua somente em combate; precombat não é executado.

## Validação

`tests/fixtures/specs/neutral_recommendations.lua` contém ordens golden revisadas para estado comum,
proc, ausência de proc e recurso protegido. `tests/unit/recommendation_engine_spec.lua` cobre interpretação,
segurança, sinais derivados, listas, identidade, callbacks e seleção do módulo real.

`npm test` inclui o check do bundle e todas as suítes existentes. Validação exclusivamente offline;
TEST-002 ainda deve verificar cliente real, restrições, rendering e utilidade da fila em combate.

APIs consultadas no snapshot fixado:
[SpellDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua)
e [AuraUtil.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_FrameXMLUtil/AuraUtil.lua).
