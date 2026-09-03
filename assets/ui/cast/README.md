# Barra de cast e indicadores

## Status

`cast-indicator-frame-v1.png` foi aprovado pelo Product Owner em `UI-DESIGN-005`. O master contém somente a moldura vazia com alpha real. O progresso, os indicadores, o ícone nativo e o nome da habilidade mostrados nos previews são camadas dinâmicas e não fazem parte do bitmap final.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `cast-indicator-frame-v1.png` | Master raster vazio e transparente. |
| `cast-indicator-preview-v1.png` | Composição de revisão com cast e indicadores ativos. |
| `cast-indicator-state-reference-v1.png` | Referência dos quatro estados de degradação. |
| `manifest.json` | Geometria, camadas, cores, hashes e tarefas de handoff. |

O ícone cinza no preview é propositalmente neutro. Ele demonstra o espaço ocupado pelo ícone nativo do WoW sem criar ou incorporar arte de habilidade. O runtime deve substituí-lo usando a identidade genérica da action e manter o mesmo recorte se precisar recorrer ao placeholder local.

## Camadas

Da base para o topo:

1. superfícies escuras procedurais;
2. trilho e preenchimento do cast;
3. indicadores decisivos;
4. ícone nativo do WoW e nome da habilidade;
5. `cast-indicator-frame-v1.png`;
6. segmento procedural de perímetro, definido em `UI-DESIGN-007`.

O preenchimento ciano `#22D3EE` aparece somente no preview e passa a ser o default configurável do cast. A moldura técnica final usa canaleta neutra e máscara separada conforme [`../procedural-channels.json`](../procedural-channels.json).

## Prompt de geração — moldura

```text
Use case: stylized-concept
Asset type: production World of Warcraft addon cast-and-decision frame overlay, isolated UI asset.

Input images:
- Image 1 is composition reference only: use the wide combined cast/indicator component near its bottom, but remove all example content.
- Image 2 is the sole geometry/material-family reference: match its restrained graphite/gunmetal, beveled silver corner language, solid electric-blue channels and minimal green signature accent.
- Image 3 is palette identity reference only. Do not reproduce its logo, letters, starfield, glow, or composition.

Primary request:
Create exactly one empty, front-facing, wide horizontal frame, approximately 5:1, compact enough for an in-combat HUD. Its internal geometry must visibly define three stable zones:
1. An upper, thin, long transparent aperture across about the left 73% for a separate procedural cast-progress layer.
2. A lower/main transparent center-safe aperture under that strip across the same left area for dynamic decisive indicators.
3. A fixed right compartment taking about 27%, separated by a beveled divider, with a transparent square icon opening on the compartment's left and a transparent text-safe opening on its right for the cast skill name.

Visual style:
- dark graphite and gunmetal structural frame;
- restrained metal texture and sharp asymmetric corner cuts;
- solid vivid electric azure structural rails approximately #0788D8;
- one very small solid energetic lime-green accent approximately #42C93E;
- visual family consistent with Image 2;
- no bulky ornament and no tall footer.

Layering and transparency:
The exterior and every content aperture must have genuine alpha transparency. The frame is an overlay only. Preserve enough opaque bezel between zones to keep them readable when content is absent.

Constraints:
No icon, spell art, emblem, logo, words, letters, numbers, labels, progress fill, status badges, class/spec symbol, lightning art, background, checkerboard, drop shadow, perspective, bloom, baked glow, gradient in colored rails, or traveling-light effect. Do not include multiple variants or an assembled HUD.
```

## Prompt de extração de fundo

```text
Use case: background-extraction
Asset type: existing production game UI frame overlay
Input image: Image 1 is the sole edit target.

Primary request:
Remove only the flat white and near-white background from the entire image, including the exterior and the four content apertures. Convert those removed regions to genuine alpha transparency.

Invariants:
Preserve the exact frame geometry, dimensions, crop, metal texture, bevels, dividers, corner cuts, solid blue rails, tiny green accent, and all dark structural pixels.

Constraints:
Do not redesign, recolor, crop, resize, add content, add shadows, add checkerboard, add background, add text, add icon, add progress, add glow, or soften the frame edges. Output one isolated transparent PNG.
```

## Normalização técnica

A geração criou a geometria aprovada, mas achatou o fundo na primeira passagem e desenhou um checkerboard opaco na extração. A etapa técnica removeu somente os pixels neutros claros do exterior e das aberturas, recortou a margem vazia e normalizou os canais energéticos para azul sólido `#0788D8` e verde sólido `#42C93E`. O master final é RGBA e não incorpora conteúdo dinâmico.
