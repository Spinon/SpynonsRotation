# Detecção de spec e talentos

`addon/Core/SpecDetector.lua` compõe a fronteira `Compat` com o `SpecRegistry`. Ele não chama APIs Blizzard,
não conhece classes concretas e não avalia ações ou regras.

## Resultado

`Spynon.SpecDetector:Capture()` retorna:

```text
ok           true somente quando o snapshot está pronto para consumo
status       READY | PENDING | UNREGISTERED | UNAVAILABLE
code         código estável do detector ou da falha recebida de Compat
capability   proveniência do dado que permitiu ou bloqueou a captura
fallback     SKIP em todo resultado que não está READY
stage        etapa que bloqueou a captura
value        snapshot presente somente em READY
```

- `PENDING`: a informação de specialization ainda não foi inicializada pelo cliente;
- `UNREGISTERED`: a spec foi detectada, mas nenhum `SpecModule` é responsável por ela;
- `UNAVAILABLE`: dependência inválida, API indisponível ou estrutura inconsistente;
- `READY`: spec, módulo, config e talentos ativos foram normalizados integralmente.

Nenhum snapshot parcial é exposto. Isso impede que uma ausência transitória pareça um talento desabilitado e produza
uma recomendação incorreta.

## Snapshot pronto

```text
specialization     índice, specId, classId e metadados genéricos
module             SpecModule resolvido por specId
config             config ativa e treeIds ordenadas
specTreeId         árvore de classe/spec da specialization
heroTree           SubTree ativa ou nil quando não há seleção
trees              árvores da config, ordenadas e classificadas
talents            somente nodes/entries ativos e disponíveis
activeSpellRanks   mapa spellId → maior rank ativo observado
```

Choice nodes usam exclusivamente `TraitNodeInfo.activeEntry`; outras entries nunca são consultadas. Nodes de outra
spec, entries indisponíveis, nodes sem rank e SubTrees inativas não aparecem em `talents` ou `activeSpellRanks`.
Uma entry de seleção de Hero Talent é preservada como `SUBTREE_SELECTION`, mas não vira uma habilidade.

`activeSpellRanks` é a fronteira que permitirá aos consumidores genéricos excluir ações dependentes de talentos.
O detector não chama `SpecModule.getActions` nem `SpecModule.getRules`; essa composição pertence à engine futura.

## Invalidação futura

`RUN-001` deverá descartar e recapturar o snapshot após a inicialização e quando receber eventos que possam mudar a
spec ou a árvore ativa:

- `ACTIVE_COMBAT_CONFIG_CHANGED` e `SELECTED_LOADOUT_CHANGED`;
- `TRAIT_CONFIG_UPDATED`, `TRAIT_NODE_CHANGED` e `TRAIT_NODE_CHANGED_PARTIAL`;
- `TRAIT_NODE_ENTRY_UPDATED`, `TRAIT_SUB_TREE_CHANGED` e `TRAIT_TREE_CHANGED`.

Esta task apenas define a captura determinística; não registra eventos nem mantém cache incremental.
