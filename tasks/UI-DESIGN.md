# Trilha paralela de UI — direção visual e assets

## Objetivo

Permitir que a direção visual do Spynon's Rotation avance em paralelo à entrega técnica, sem implementar runtime antes das dependências da fila principal.

O mockup anotado aprovado como referência inicial está em:

`assets/ui/concepts/spynon-main-hud-annotated-concept-v2.png`

Esse arquivo é conceitual. Cada componente precisa de arte final própria, estados visuais documentados e preparação técnica compatível com o cliente do WoW.

## Limites da trilha

Esta trilha pode produzir:

- mockups e decisões de layout;
- especificações visuais;
- componentes raster ou vetoriais de origem;
- estados, máscaras, recortes e atlases;
- documentação de movimento e handoff técnico.

Esta trilha não pode:

- implementar a UI Lua antes da task correspondente em `delivery`;
- importar objetos específicos de Enhancement para a UI genérica;
- simular integração real com `Recommendation`, APIs Blizzard ou Secret Values;
- declarar validação no cliente Retail com base apenas em mockups.

## Contrato de placeholders com delivery

A ausência de arte final não bloqueia uma task técnica elegível na trilha `delivery`.

Quando um componente ainda não possuir asset aprovado, o desenvolvimento principal deve:

- usar um placeholder neutro, local e explicitamente identificado como temporário;
- preservar dimensões, âncoras, camadas e caminho de substituição esperados para a arte final;
- manter o placeholder desacoplado de classe e spec;
- registrar onde o asset aprovado será conectado;
- substituir o placeholder sem reescrever a lógica quando a entrega correspondente de `ui` ficar pronta.

Placeholders não são aprovação visual, não podem reutilizar arte externa sem licença e não contam como evidência de conclusão de uma task de arte final.

## UI-DESIGN-001 — Layout do HUD principal

Consolidar o mockup anotado, hierarquia, agrupamentos, proporções e vocabulário visual da tela operacional principal.

Entregáveis:

- ação atual em linha própria;
- fila de três próximas recomendações;
- contexto de combate;
- GCD, cooldowns individuais, hotkeys e stacks;
- barra de cast com indicadores decisivos;
- trilho de juggle de buffs/debuffs;
- separação explícita entre conceito e arte final.

## UI-DESIGN-002 — Ação atual e fila

Produzir a arte final das molduras da ação atual e da fila, incluindo proporções, recortes e estados base reutilizáveis por qualquer spec.

## UI-DESIGN-003 — Contexto, hotkeys e stacks

Produzir o módulo de contexto de combate e os badges compactos de hotkey, charges e stacks, com legibilidade periférica e variações necessárias.

## UI-DESIGN-004 — GCD e cooldown individual

Definir e produzir a barra de Global Cooldown e o overlay radial cinza em sentido horário, incluindo tipografia do cooldown numérico central.

## UI-DESIGN-005 — Barra de cast e indicadores

Produzir a barra de cast combinada com indicadores decisivos, reservando a área direita para emblema e nome da habilidade e o centro para informações contextuais.

## UI-DESIGN-006 — Juggle de buffs/debuffs

Definir um componente genérico para specs que mantêm múltiplos buffs e debuffs, mostrando duração, urgência, refresh e ausência sem recriar um painel massivo de auras.

## UI-DESIGN-007 — Movimento e estados visuais

Documentar e prototipar MOVE, ENTER, EXIT, PROMOTE e CONSUME, além de estados ready, cooldown, proc, refresh e indisponível.

## UI-DESIGN-008 — Kit técnico e handoff

Preparar os assets aprovados em formatos, dimensões, transparências e organização adequados à futura implementação da UI no runtime, mantendo fontes editáveis quando aplicável.
