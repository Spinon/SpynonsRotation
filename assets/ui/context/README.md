# Card de contexto de combate

## Status

`combat-context-card-frame-v1.png` é o master visual aprovado em `UI-DESIGN-003`. O arquivo permanece como fonte de alta resolução; o derivado neutro e suas máscaras estão no [`../runtime/manifest.json`](../runtime/manifest.json).

O master contém somente moldura e superfície. `AUTO`, `ST`, `CLEAVE`, `AOE`, modo resolvido, quantidade de alvos e estados de disponibilidade são texto dinâmico e não são incorporados ao PNG.

## Composição

- zona superior: modo solicitado e, em `AUTO`, modo resolvido;
- zona inferior: quantidade observável de alvos;
- canaleta neutra: estrutura de repouso;
- segmento azul procedural: identidade estrutural ativa;
- acento verde procedural: resolução válida/pronta, nunca classe ou spec;
- exterior com alpha real; superfície interna escura para legibilidade.

O mesmo bitmap atende todos os modos. A UI não seleciona uma moldura por spec e não deriva o modo somente da quantidade de alvos.

O master original preserva a referência cromática aprovada. O pacote técnico entrega a canaleta neutra e suas máscaras separadas conforme [`../procedural-channels.json`](../procedural-channels.json).

## Prompt final — candidato v1

```text
Use case: stylized-concept
Asset type: compact combat-context card frame for a World of Warcraft addon
Input images: approved HUD layout for composition; approved action frame for materials and colors; official Spynon logo for palette only.
Primary request: one empty compact card with a dark interior divided into two stable horizontal content zones, an asymmetric angular silhouette, thin gunmetal frame, restrained silver corners, a slim solid electric-azure rail and one small lime accent on the left edge.
Constraints: one isolated reusable element; genuinely transparent exterior; no baked text, letters, numbers, icon, logo, class/spec symbol, spell art, perspective, shadow, bloom or gradient in the colored rails.
```

## Normalização

A geração criativa achatou o fundo claro. Foi aplicada extração técnica somente no exterior conectado ao canvas e recorte do espaço vazio. Geometria, superfície, divisória e cores do candidato não foram redesenhadas.
