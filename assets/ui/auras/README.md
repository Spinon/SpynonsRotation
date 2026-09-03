# Juggle de buffs e debuffs

## Status

`aura-juggle-cell-frame-v1.png` é o candidato de arte de `UI-DESIGN-006`. O mesmo master vazio é repetido de uma a cinco vezes; o uso padrão mostra três sinais e o teto de cinco atende specs com manutenção mais exigente sem criar um painel massivo de auras. A revisão visual ativa é `v2`.

## Arquivos

| Arquivo | Papel |
| --- | --- |
| `aura-juggle-cell-frame-v1.png` | Master raster vazio e reutilizável. |
| `aura-juggle-preview-v2.png` | Composição padrão ativa com três sinais em fila de urgência. |
| `aura-juggle-state-reference-v2.png` | Referência ativa de ausência, crítico, atenção, estável e desligado. |
| `aura-juggle-preview-v1.png` | Histórico anterior com labels inferiores. |
| `aura-juggle-state-reference-v1.png` | Histórico anterior com labels e shapes inferiores. |
| `manifest.json` | Geometria, estados, cores, hashes e política de seleção. |

Os ícones geométricos dos previews são placeholders neutros. O addon deve usar o ícone nativo do WoW e conservar exatamente o mesmo recorte quando precisar do fallback local.

## Decisões

- as células formam uma fila de urgência, com ausência e crítico à esquerda;
- a posição muda apenas quando a célula entra em outra faixa de urgência;
- a duração não reorganiza itens dentro da mesma faixa;
- ausência continua explícita no valor principal, enquanto o encaixe inferior fica vazio;
- indisponível/desligado usa `—`, fica à direita e nunca é interpretado como ausência;
- o encaixe inferior não usa texto ou símbolo, apenas uma cor sólida uniforme;
- verde passa a âmbar e vermelho conforme aumenta a urgência; não há gradiente espacial;
- a moldura não recebe cor de estado, gradiente ou glow incorporado;
- a composição padrão não mostra mais de três células; cinco é o teto, não o padrão;
- não há badge permanente de overflow: somente sinais ranqueados como decisivos entram no trilho.

Movimento da fila, pulsação e transições pertencem a `UI-DESIGN-007`. Dimensões finais, fonte e preparação para runtime pertencem a `UI-DESIGN-008`.

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
