# State Engine — RUN-001

`addon/Core/StateEngine.lua` produz `PlayerState` a partir de consultas declarativas do módulo ativo e dos
resultados normalizados de `Compat.State`. Não avalia regras, recomenda ações, detecta quantidade de alvos
nem implementa UI. Essas responsabilidades continuam em RUN-002/RUN-003 e nas tasks de interface.

## Uso e ownership

```lua
local snapshot = Spynon.StateEngine:GetSnapshot()
local diagnostics = Spynon.StateEngine:GetDiagnostics()
local unsubscribe = Spynon.StateEngine:Subscribe(function(nextSnapshot, nextDiagnostics)
  -- Consumir somente sinais cuja capability seja ADDON_AVAILABLE.
end)
unsubscribe()
```

`StateEngineFactory.Create(compat, detector)` permite testes com dependências injetadas. A instância padrão
é carregada depois de `SpecDetector`; o bootstrap registra seus eventos quando o próprio addon termina de
carregar. A primeira captura completa ocorre em `PLAYER_ENTERING_WORLD` (ou outro evento de reconstrução).
Não há polling, `OnUpdate`, timer nem execução de ações protegidas.

- `revision` começa em zero e cresce uma vez por evento aceito, mesmo se os valores forem iguais.
- Eventos desconhecidos, unidades irrelevantes e identificadores secretos não alteram a revisão.
- `capturedAt` usa o relógio do cliente, não hora civil. O valor zero com capability indisponível significa
  falha da leitura, não um instante utilizável. `inCombat=false` segue a mesma regra quando indisponível.
- Antes da primeira captura, não há capabilities disponíveis.
- `GetSnapshot`, `GetDiagnostics` e cada notificação recebem cópias profundas independentes.
- Assinantes são chamados em ordem de inscrição. Exceções são isoladas; alterações e chamadas reentrantes
  não modificam o snapshot publicado. Inscrições novas participam a partir da próxima notificação;
  remoções são respeitadas antes de chamar cada assinante.
- Mesma sequência de eventos, consultas e respostas públicas produz o mesmo estado e revisões.

## Consultas do módulo

O hook opcional e retrocompatível `SpecModule.getStateQueries(detectedSpec)` retorna quatro listas:

```lua
return {
  resources = {
    { id = "neutral.energy", kind = "power", powerType = 0 },
    { id = "neutral.stacks", kind = "aura_stacks", auraId = 100, maxStacks = 5 },
  },
  auras = { { id = "neutral.buff", unit = "player", spellId = 100 } },
  cooldowns = { { id = "neutral.strike", spellId = 102 } },
  talents = { { id = "neutral.talent", spellId = 103 } },
}
```

São metadados públicos, não objetos de APIs Blizzard. Listas omitidas são vazias. IDs devem ser únicos
dentro de cada lista; unidades suportadas são `player` e `target`. A engine valida, copia os campos
permitidos e ordena por ID antes de consultar. Provider inválido ou com exceção elimina o plano anterior
e registra `queries: INVALID_DATA / SKIP`. Módulo sem o hook continua válido, com plano vazio.

O módulo Enhancement traduz seu catálogo e disponibilidade por talentos para essas consultas. Não existe
condicional de classe/spec na engine. Cooldowns deste primeiro catálogo são de spells; itens e outras
fontes não são reinterpretados como spells pelo Core.

## Formato dos sinais

| Mapa | Valor público por ID |
| --- | --- |
| `resources` | `{ current, maximum }`, tanto power quanto stacks de aura |
| `auras` | `{ active, applications, duration, expirationTime }` |
| `cooldowns` | `{ startTime, duration, modRate, isEnabled, charges? }` |
| `cooldowns[id].charges` | `{ hasCharges=false }` ou `{ hasCharges=true, currentCharges, maxCharges, cooldownStartTime, cooldownDuration, chargeModRate }` |
| `talents` | rank inteiro ativo; zero somente após uma captura válida de talentos |

Capabilities usam as chaves `specId`, `queries`, `capturedAt`, `inCombat`, `resources.<id>`, `auras.<id>`,
`cooldowns.<id>`, `cooldowns.<id>.charges` e `talents.<id>`. Diagnósticos separados usam as mesmas chaves
e contêm somente `code` e `fallback`, nunca objetos opacos ou mensagens cruas de erro.

Somente um resultado bem-sucedido com `ADDON_AVAILABLE` insere um valor. Falhas removem a observação
anterior imediatamente e registram capability indisponível com `SKIP`; **ausência não significa zero,
cooldown pronto ou talento desativado**. Cooldown e cargas têm capabilities independentes: um cooldown
válido não autoriza inferir cargas quando a consulta delas falha.

Tempos são absolutos/durações retornados pela API, sem um contador regressivo armazenado que envelhece.
Uma aura ausente tem `active=false` somente se a unidade existir, estiver visível e a leitura for permitida.
A consulta retorna a primeira aura correspondente ao spell; não infere autoria do jogador, alcance,
disponibilidade de conjuração ou quantidade de alvos. A engine não infere prontidão a partir de `isOnGCD`.
Expiração entre eventos pode ser avaliada futuramente usando timestamps públicos; esta task não executa regras.

## Atualização incremental

| Evento | Seções atualizadas |
| --- | --- |
| `PLAYER_ENTERING_WORLD`, `PLAYER_SPECIALIZATION_CHANGED` (player), `PLAYER_TALENT_UPDATE`, `TRAIT_CONFIG_UPDATED`, `ACTIVE_TALENT_GROUP_CHANGED`, `SPELLS_CHANGED` | Reconstroem spec, plano e talentos; atualizam todos os sinais voláteis |
| `UNIT_POWER_UPDATE`, `UNIT_POWER_FREQUENT`, `UNIT_MAXPOWER`, `UNIT_DISPLAYPOWER` (player) | Somente recursos power |
| `UNIT_AURA` (player/target) | Auras daquela unidade; player também atualiza recursos de stacks |
| `PLAYER_TARGET_CHANGED` | Auras do target |
| `SPELL_UPDATE_COOLDOWN`, `SPELL_UPDATE_CHARGES` | Cooldowns e cargas |
| `PLAYER_REGEN_DISABLED`, `PLAYER_REGEN_ENABLED`, `PLAYER_EQUIPMENT_CHANGED` | Combate e todos os sinais voláteis; reavaliam restrições |
| `ADDON_RESTRICTION_STATE_CHANGED` | Invalida todos os sinais voláteis imediatamente, sem relê-los |

Depois da invalidação por restrição, o próximo evento aceito que não seja outra transição reavalia todos
os sinais voláteis. Durante a transição eles permanecem indisponíveis: o evento pode anteceder a ativação
efetiva, portanto uma sonda momentaneamente negativa não é suficiente para publicar esses valores.
Payloads de auras e restrições não são percorridos; somente os identificadores de unidade necessários são
classificados antes de comparar. Mudança de spec sem detecção válida remove todos os mapas, capabilities
e consultas da spec anterior. Não é feita uma nova detecção de talentos em cada mudança de recurso.

## Fronteira segura e referências

`Compat.State` consulta sondas de aura, cooldown e power antes de ler o estado. Power máximo tem sonda
própria. Cada retorno e cada campo selecionado passa por `issecretvalue` antes de validação, comparação
ou aritmética. Sonda, guard ou API ausente/falha fecha a leitura. Apenas campos conhecidos saem do adapter;
nenhuma tabela crua de aura/cooldown/cargas é publicada. A classificação estática do catálogo não prevalece
sobre a observabilidade efetiva no cliente.

Referência mantida no pin do projeto: UI Source `8ea15b61e45c0ed4eba01439c90757f86eb78d34`, inspecionada
para RUN-001 em 2026-09-14; não implica atualização do alvo Retail nem validação em jogo.

- [UnitDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua)
- [UnitAuraDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitAuraDocumentation.lua)
- [SpellDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua)
- [SpellSharedDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellSharedDocumentation.lua)
- [SecretPredicateAPIDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SecretPredicateAPIDocumentation.lua)
- [RestrictedActionsDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/RestrictedActionsDocumentation.lua)

## Evidência e limite de validação

`tests/unit/state_engine_spec.lua` usa uma spec neutra, ambiente de APIs injetado e sentinela opaca de valor
secreto. Cobre isolamento, revisão, atualização parcial, troca de spec/talentos, transição de restrições,
falhas de APIs, descarte e recuperação, além do wiring do bootstrap e provider do catálogo real.
`npm run core:test`, `npm run addon:lint`, `npm run addon:typecheck` e `npm test` reproduzem a validação offline.
Taint, combat lockdown e comportamento efetivo das APIs/eventos continuam pendentes do cliente Retail em TEST-002.
