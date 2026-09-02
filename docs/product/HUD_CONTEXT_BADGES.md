# Contexto de combate, hotkeys e quantidades

## Escopo

Este documento define o contrato visual dos candidatos de `UI-DESIGN-003`. A arte permanece genérica e não implementa runtime Lua. A UI futura consome estado observável e `Recommendation`; não recebe objetos de classe/spec.

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
- o frame é fixo e o texto é uma camada dinâmica;
- strings curtas ficam centralizadas; modificadores usam redução limitada de escala, sem quebrar linha;
- ausência de binding oculta o conteúdo textual, sem substituir por instrução falsa;
- contraste usa texto claro com outline escuro e não depende do azul da borda.

## Stacks e charges

- ocupam exclusivamente o canto inferior direito;
- a quantidade fica na região central do badge;
- stacks usam placas sobrepostas e charges usam anel segmentado;
- o glifo é um overlay separado e nunca divide textura com o número;
- quantidades longas usam forma compacta como `99+` apenas quando o contrato de produto autorizar a abreviação;
- buffs e debuffs continuam no trilho de juggle, sem disputar o badge.

## Camadas

```text
texto ou número de runtime
glifo stacks/charges (quando conhecido)
frame do badge
action frame v4
cooldown radial
ícone nativo do WoW
```

No card de contexto, texto e estados ficam sobre `combat-context-card-frame-v1.png`. Nas actions, hotkey e quantidade permanecem acima de cooldown e estados transitórios.

## Handoff

Os masters, hashes e safe areas normalizadas estão nos manifests de [`assets/ui/context`](../../assets/ui/context/manifest.json) e [`assets/ui/badges`](../../assets/ui/badges/manifest.json). Recorte final, resolução de exportação, teste de legibilidade em escala e simplificação dos glifos pertencem a `UI-DESIGN-008`.
