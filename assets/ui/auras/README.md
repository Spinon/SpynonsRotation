# Juggle de buffs e debuffs

## Status

`aura-juggle-cell-frame-v1.png` é a arte aprovada de `UI-DESIGN-006`. O mesmo master vazio é repetido de uma a cinco vezes; o uso padrão mostra três sinais e o teto de cinco atende specs com manutenção mais exigente sem criar um painel massivo de auras. A revisão visual aprovada é `v4`.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `aura-juggle-cell-frame-v1.png` | Master raster vazio e reutilizável. |
| `aura-juggle-preview-v4.png` | Composição padrão ativa com azul para buff e vermelho para debuff. |
| `aura-juggle-state-reference-v4.png` | Referência ativa de estados, urgência e tipo pela cor do contorno. |
| `aura-juggle-preview-v3.png` | Histórico anterior com marcadores `+` e `−`. |
| `aura-juggle-state-reference-v3.png` | Histórico anterior com marcadores `+` e `−`. |
| `aura-juggle-preview-v2.png` | Histórico anterior sem distinção explícita de buff e debuff. |
| `aura-juggle-state-reference-v2.png` | Histórico anterior sem distinção explícita de buff e debuff. |
| `aura-juggle-preview-v1.png` | Histórico anterior com labels inferiores. |
| `aura-juggle-state-reference-v1.png` | Histórico anterior com labels e shapes inferiores. |
| `manifest.json` | Geometria, estados, cores, hashes e política de seleção. |

Os ícones geométricos dos previews são placeholders neutros. O addon deve usar o ícone nativo do WoW e conservar exatamente o mesmo recorte quando precisar do fallback local.

## Decisões

- as células formam uma fila de urgência, com ausência e crítico à esquerda;
- a posição muda apenas quando a célula entra em outra faixa de urgência;
- a duração não reorganiza itens dentro da mesma faixa;
- um segmento azul percorre a canaleta do buff e um vermelho percorre a do debuff;
- não existe símbolo, badge, label ou background adicional para informar o tipo;
- a cor do segmento é independente da cor de urgência e configurável por tipo;
- o master permanece único: `UI-DESIGN-008` deve entregar canaleta neutra e máscara tintável sem duplicar a moldura;
- ausência continua explícita no valor principal, enquanto o encaixe inferior fica vazio;
- indisponível/desligado usa `—`, fica à direita e nunca é interpretado como ausência;
- o encaixe inferior não usa texto ou símbolo, apenas uma cor sólida uniforme;
- verde passa a âmbar e vermelho conforme aumenta a urgência; não há gradiente espacial;
- a moldura não recebe cor de estado, gradiente ou glow incorporado;
- a composição padrão não mostra mais de três células; cinco é o teto, não o padrão;
- não há badge permanente de overflow: somente sinais ranqueados como decisivos entram no trilho.

Movimento da fila, pulsação e transições pertencem a `UI-DESIGN-007`. Dimensões finais, fonte e preparação para runtime pertencem a `UI-DESIGN-008`.

O contrato compartilhado de canaletas, defaults e overrides está em [`../procedural-channels.json`](../procedural-channels.json). A revisão v4 permanece como referência cromática; não exige que o perímetro final fique totalmente preenchido em repouso.

## Prompt de revisão v4

```text
Use case: precise-object-edit.
Asset type: World of Warcraft addon aura-juggle state reference.
Input images: Image 1 is the sole edit target.

Primary request:
Replace the buff/debuff plus and minus marker concept with frame-outline color. Image 1 already has no type glyphs.
- AURA D and AURA C are debuffs: recolor only their existing electric-blue structural outline rails to a vivid solid crimson red approximately #E5484D.
- AURA B, AURA A and AURA E are buffs: preserve their existing solid electric-blue outline rails approximately #0788D8.
- Preserve the tiny lime-green brand signature accent on every cell.

The outline color communicates effect type. The small lower shelf continues to communicate only temporal urgency and must remain exactly as shown: empty, red, amber, green, empty.

Invariants:
Preserve the exact five-cell order, frame geometry, graphite metal, icon placeholders, names, durations or state values, spacing, scale, dark background, lower shelf colors and all transparency behavior.

Constraints:
No plus sign, minus sign, BUFF/DEBUFF words, badge, new symbol, glow, bloom, gradient, regrouping, new row, extra cell or layout change. Keep all colored rails flat and solid.
```

A geração integrada validou a troca de linguagem visual. Os previews finais foram recompostos sobre a revisão v2 para preservar ícones, texto, geometria, cores de urgência e dimensões exatas.

## Prompt de revisão v3

```text
Use case: precise-object-edit.
Asset type: World of Warcraft addon aura-juggle state reference.

Treat Image 1 as the sole edit target. Preserve the existing five-cell composition, exact frame geometry, spacing, scale, icon placeholders, dark background, solid structural rails, names, central values, and lower urgency shelves.

Add one minimal effect-type marker to each cell, completely independent from the lower urgency color:
- Buff: a small cyan plus sign (+).
- Debuff: a small vivid violet minus sign (−).
Place the marker at the upper-right inside each icon aperture. Use a compact bold sans-serif glyph with only a subtle dark outline/shadow for readability. Do not add a badge or background behind it.

Classify the cells as follows:
- AURA D: debuff, violet −.
- AURA C: debuff, violet −.
- AURA B: buff, cyan +.
- AURA A: buff, cyan +.
- AURA E: buff, cyan +.

Do not group or reorder cells. Preserve the global urgency ordering and the lower shelves exactly: empty, red, amber, green, empty. The lower shelf must remain dedicated only to temporal urgency.

Do not add the words BUFF or DEBUFF. Do not add lower text, lower symbols, gradients, glow, badges, extra cells, new ornaments, or any recoloring of the urgency shelves.
```

A geração integrada validou a distinção de tipo. Os previews finais foram recompostos sobre a revisão v2 para manter geometria, texto, alinhamento, cores sólidas e dimensões exatas.

## Prompt de revisão v2

```text
Use case: precise-object-edit
Asset type: World of Warcraft addon aura-juggle state preview
Input image: Image 1 is the sole edit target.

Primary request:
Revise the five aura cells so they read as an urgency queue. Reorder the complete cells from left to right as:
1. ended/missing,
2. critical red,
3. attention amber,
4. healthy green,
5. disabled/unavailable.

Change only the small bottom docking shelves:
- remove every word, letter, question mark, circle, triangle, diamond and X from those shelves;
- replace the shelf content with one clean flat solid color swatch;
- missing/ended and disabled/unavailable shelves must be empty/dark with no colored swatch;
- critical shelf uses solid red;
- attention shelf uses solid amber;
- healthy shelf uses solid green.
Each colored shelf is uniform at one moment; no spatial gradient.

Invariants:
Preserve each frame, icon placeholder, main aura name, main duration or main state value, scale, spacing, dark background, blue/green structural rails and overall canvas. Move whole cells without redesigning them.

Constraints:
No bottom labels, bottom symbols, new text, arrows, numbering, glow, bloom, gradient, added badge, extra cell, logo or background change.
```

A geração integrada foi usada para validar visualmente a revisão. Os previews finais foram recompostos sobre o master original para preservar texto, alinhamento, cores sólidas e dimensões exatas.

## Prompt de geração do master

```text
Use case: stylized-concept
Asset type: production World of Warcraft addon aura-juggle cell frame overlay, isolated reusable UI asset.

Input images:
- Image 1 is composition reference only: use the compact horizontal buff/debuff cards in its middle-lower section as the functional idea, but remove every icon, word, duration and state.
- Image 2 is the primary material and corner-language reference.
- Image 3 is the latest family reference for thin dividers, restrained graphite metal and solid energy rails.

Primary request:
Create exactly one empty, front-facing, compact horizontal aura decision cell, approximately 2.7:1. It will be repeated horizontally up to five times. Define:
1. a transparent square icon aperture on the left, about 30% of the usable width;
2. one stable transparent text-safe aperture on the right for a short aura name and duration;
3. a very shallow centered bottom docking notch/rail reserved for a procedural state label such as refresh or absent, but do not draw any label.

Visual style:
- dark graphite/gunmetal structure;
- restrained bevels and compact angular corner cuts;
- thin solid electric-azure structural rail approximately #0788D8;
- one tiny solid lime-green signature accent approximately #42C93E;
- same visual family as Images 2 and 3, with less visual weight than an action frame;
- practical at small HUD scale.

Layering and transparency:
The exterior, icon aperture, text aperture and bottom label opening must have genuine alpha transparency. State colors are not baked into this master; they will be procedural overlays.

Constraints:
No icon, aura art, emblem, logo, word, letter, number, timer, plus/minus symbol, progress fill, state color, badge, class/spec symbol, background, checkerboard, perspective, shadow, bloom, baked glow, gradient in colored rails, or multiple variants.
```

## Normalização técnica

A geração integrada produziu a geometria e os materiais, mas achatou o fundo claro. A etapa técnica removeu somente os pixels neutros do exterior e das duas aberturas, recortou a margem vazia e normalizou os canais energéticos para azul sólido `#0788D8` e verde sólido `#42C93E`. O encaixe inferior permanece opaco para receber shape e label procedurais acima da moldura.
