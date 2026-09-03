# Contexto de combate e tipografia periférica

## Escopo

Este documento registra a direção aprovada em `UI-DESIGN-003`. A arte permanece genérica e não implementa runtime Lua. A UI futura consome estado observável e `Recommendation`; não recebe objetos de classe/spec.

O princípio aplicado é “menos é mais”: somente o contexto de combate recebe uma janela própria. Hotkey, stacks e charges não usam frame, badge ou glifo.

## Contexto de combate

Um único card atende `AUTO`, `ST`, `CLEAVE` e `AOE`.

| Estado | Zona superior | Zona inferior | Tratamento |
| --- | --- | --- | --- |
| AUTO | `AUTO` e modo resolvido em menor hierarquia | quantidade observável de alvos | verde reforça resolução válida; texto mantém a leitura sem depender da cor |
| ST | `ST` | quantidade observável de alvos | azul estrutural |
| CLEAVE | `CLEAVE` | quantidade observável de alvos | azul estrutural |
| AOE | `AOE` | quantidade observável de alvos | azul estrutural |
| indisponível | modo ou marcador `—` | `— ALVOS` | âmbar e texto explícito; nenhum valor é inventado |

O card apresenta o modo recebido do contrato. A UI não recalcula ST, CLEAVE ou AOE a partir da contagem e não introduz thresholds próprios.

## Hotkey

- ocupa o canto superior direito da ação atual e de cada item da fila;
- é apenas uma camada tipográfica, sem background ou moldura dedicada;
- strings curtas ficam alinhadas ao canto; modificadores usam redução limitada de escala, sem quebrar linha;
- ausência de binding oculta o conteúdo textual, sem substituir por instrução falsa;
- contraste usa texto claro com outline escuro e não depende do azul da moldura;
- fonte, tamanho, âncora e offsets horizontal/vertical serão ajustáveis nas configurações.

## Stacks e charges

- ocupam exclusivamente o canto inferior direito;
- usam somente o valor numérico, sem background, badge, glifo ou diferença ornamental entre stacks e charges;
- a origem do dado continua distinguindo stacks de charges internamente, mas a apresentação permanece deliberadamente simples;
- quantidades longas usam forma compacta como `99+` apenas quando o contrato de produto autorizar a abreviação;
- zero ou ausência de dado ocultam a camada em vez de exibir informação falsa;
- fonte, tamanho, âncora e offsets horizontal/vertical serão ajustáveis nas configurações;
- buffs e debuffs continuam no trilho de juggle, sem disputar o canto.

## Controles previstos nas configurações

Hotkey e quantidade possuem controles independentes de `fontFace`, `fontSize`, `outline`, `anchor`, `offsetX` e `offsetY`. Os defaults mantêm hotkey no canto superior direito e quantidade no canto inferior direito; alterar esses valores não modifica a moldura da action.

## Camadas

```text
hotkey e quantidade tipográficas
action frame v4
cooldown radial
ícone nativo do WoW
```

No card de contexto, texto e estados ficam sobre `combat-context-card-frame-v1.png`. Nas actions, hotkey e quantidade permanecem acima de cooldown e estados transitórios, sem texturas intermediárias.

A moldura técnica do contexto também adota a canaleta neutra compartilhada. Quando ativo, um segmento procedural curto pode usar o azul padrão com baixa saliência; texto continua sendo o canal autoritativo do modo. Cor e movimento são configuráveis pelo contrato de [`HUD_PROCEDURAL_CHANNELS.md`](HUD_PROCEDURAL_CHANNELS.md).

## Handoff

O master, hash e safe areas normalizadas do contexto estão no manifest de [`assets/ui/context`](../../assets/ui/context/manifest.json). Canvas, UV e máscaras de runtime estão em [`HUD_ASSET_HANDOFF.md`](HUD_ASSET_HANDOFF.md); os controles de usuário pertencem à trilha de configuração.
