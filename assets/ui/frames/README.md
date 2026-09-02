# Molduras de actions

## Status

Os arquivos `v4` são os candidatos visuais ativos de `UI-DESIGN-002` e aguardam aprovação do Product Owner. Eles mantêm os canais sólidos, agora em azul elétrico e verde ácido mais vívidos e próximos da identidade Spynon, sem incorporar o bloom da referência. Os arquivos `v1`, `v2` e `v3` permanecem preservados como histórico de comparação.

Todos são masters raster em alta resolução; normalização para dimensões e formatos de runtime pertence a `UI-DESIGN-008`.

## Assets

| Arquivo | Papel | Dimensões de origem | Estado base |
| --- | --- | --- | --- |
| `action-current-frame-v4.png` | Moldura ativa da ação atual, em linha própria | 1619 × 971 | Ênfase principal; trilhos vívidos |
| `action-queue-frame-v4.png` | Moldura ativa reutilizada pelas três próximas recomendações | 1254 × 1254 | Prioridade secundária; trilhos vívidos |
| `action-current-frame-v3.png` | Histórico com canais sólidos escuros | 1619 × 971 | Referência anterior |
| `action-queue-frame-v3.png` | Histórico com canais sólidos escuros | 1254 × 1254 | Referência anterior |
| `action-current-frame-v2.png` | Histórico com canais sólidos claros | 1619 × 971 | Referência anterior |
| `action-queue-frame-v2.png` | Histórico com canais sólidos claros | 1254 × 1254 | Referência anterior |
| `action-current-frame-v1.png` | Histórico com glow incorporado | 1610 × 977 | Referência anterior |
| `action-queue-frame-v1.png` | Histórico com glow incorporado | 1254 × 1254 | Referência anterior |

Os arquivos ativos possuem alpha real no exterior e na abertura central. O conteúdo preto ou quadriculado exibido por alguns visualizadores é a transparência, não um background incorporado.

## Contrato de uso

- o ícone nativo do WoW é renderizado em uma camada abaixo da moldura;
- a arte não contém ícone, nome, número, hotkey, cooldown, GCD, stacks ou informação de spec;
- a action atual mantém proporção horizontal de aproximadamente `1.65:1`;
- a fila usa a mesma moldura quadrada três vezes, sem duplicar o bitmap;
- hotkey e stacks ocupam camadas próprias nos cantos superior e inferior direitos;
- cooldown, glow e estados animados serão overlays independentes, sem alterar estes masters;
- os canais coloridos do `v4` permanecem estáticos, sólidos e saturados; nenhum bitmap-base será deslocado, clareado ou pulsado;
- os pontos de inserção e a política de custo estão em [`ANIMATION_HOOKS.md`](ANIMATION_HOOKS.md);
- o recorte/máscara final do ícone será preparado no kit técnico de `UI-DESIGN-008`.

## Direção visual

As molduras usam grafite e gunmetal como estrutura, prata somente nas quinas, azul elétrico (`#0788D8`) como assinatura principal e verde ácido (`#42C93E`) como acento mínimo. São cores-base vívidas, mas abaixo da luminosidade do overlay de glow futuro. A linguagem deriva da marca Spynon sem reproduzir o logotipo e permanece genérica entre classes e specs.

## Prompt final — revisão v4

```text
Use case: precise-object-edit
Asset type: production World of Warcraft addon UI frame overlay
Input images: Image 1 is the sole edit target; Image 2 is a luminosity and vivid-energy reference only; Image 3 is the official Spynon brand palette reference only.
Primary request: change only the colored energy rails in Image 1. Replace the overly dark v3 rails with vivid, saturated, solid brand-aligned colors: electric azure blue approximately #0788D8 and energetic lime green approximately #42C93E. The result must feel clearly more alive and closer to the Spynon blue/green identity, while remaining a flat static base below a future animated glow.
Color balance: brighter and much more saturated than Image 1, but visibly less luminous than the baked-glow rails in Image 2. Use Image 3 only to match the recognizable blue/green hue family. Keep every colored rail uniform and solid.
Invariants: preserve Image 1's exact frame geometry, line positions, line thicknesses, metal texture, bevels, corner cuts, dimensions, aspect ratio and all transparent areas.
Constraints: no gradient in the colored rails, baked glow, bloom, hotspots, traveling light, text, icons, logo, background, checkerboard or redesign. The center and exterior must remain genuinely transparent.
```

## Prompt final — revisão v3

```text
Use case: precise-object-edit
Asset type: production World of Warcraft addon UI frame overlay
Primary request: edit only the colored energy rails. Turn the cyan/blue rails into a materially darker, saturated, flat unlit teal-blue, approximately #07566D. Turn the green signature rail into a materially darker, saturated, flat unlit green, approximately #2B6F35. Reduce luminance significantly while keeping each color identifiable against the dark metal. These rails are the resting channels underneath a future bright animated glow overlay.
Invariants: preserve the exact frame geometry, line positions, line thicknesses, metal texture, bevels, corner cuts, dimensions, aspect ratio and all transparent areas.
Constraints: no gradients in the colored rails, baked glow, bloom, hotspots, text, icons, logo, background, checkerboard or redesign. The center and exterior must remain truly transparent.
```

## Prompt final — revisão v2

```text
Use case: precise-object-edit
Asset type: production game UI frame overlay
Primary request: change only the blue/cyan and green neon channels; replace each with one clean uniform solid color and remove baked gradients, hotspots, light streaks, bloom and traveling-light appearance.
Colors: electric cyan approximately #00B7FF; neon green approximately #66E23A.
Invariants: preserve frame geometry, proportions, metal, bevels, corners, line locations and thicknesses, scale, orientation, transparent exterior and transparent opening.
Constraints: no baked glow, animation trail, text, icon, logo, hotkey, cooldown, GCD, stacks, background or spec-specific element.
```

## Prompt final — ação atual

```text
Use case: stylized-concept
Asset type: production game UI frame asset for the current recommended action in a World of Warcraft addon
Primary request: one isolated, empty landscape action frame with transparent exterior and central icon opening, reusable above a native game icon.
References: annotated HUD mockup for composition/materials; Spynon logo for palette and brand language only.
Style: front-facing polished raster frame, dark graphite forged metal, restrained bevels, cyan/blue energy channels and one subtle green accent.
Composition: approximately 1.65:1, compact distinctive corners, breathing room for separate hotkey and GCD layers.
Constraints: no icon, spell art, text, logo, hotkey, cooldown, GCD, stacks, perspective, shadow or spec-specific element.
```

## Prompt final — fila

```text
Use case: stylized-concept
Asset type: production game UI frame asset for one queued recommendation in a World of Warcraft addon
Primary request: one isolated, empty square action frame with transparent exterior and central icon opening, reusable above a native game icon.
References: annotated HUD mockup for composition/materials; Spynon logo for palette and brand language only.
Style: same visual family as the current-action frame with lower visual weight, dark graphite forged metal, restrained bevels, cyan/blue energy channels and one tiny green accent.
Composition: 1:1, compact distinctive corners, breathing room for separate hotkey and stacks layers.
Constraints: no icon, spell art, text, logo, hotkey, cooldown, stacks, arrows, perspective, shadow or spec-specific element.
```

## Correção de transparência

A geração inicial do `v1` apresentou um checkerboard opaco. Foi aplicada uma edição `background-extraction` separada em cada asset para remover somente o checkerboard no exterior e no centro, preservar a moldura e converter essas regiões para alpha real sem halo branco.

Na revisão `v2`, a edição criativa produziu corretamente os canais sólidos, mas achatou novamente o alpha. A etapa final fez somente a normalização técnica dos pixels claros de fundo para transparência; não alterou geometria, metal ou cores do desenho aprovado.

Na revisão `v3`, a edição criativa escureceu somente os canais de repouso e voltou a achatar o alpha. Foi repetida a mesma normalização técnica de transparência, sem redesenhar a moldura nem incorporar o glow futuro.

Na revisão `v4`, a imagem enviada pelo Product Owner foi usada somente como referência de vivacidade e o logo oficial somente como referência de paleta. A edição elevou saturação e luminosidade dos canais sem copiar o bloom; o alpha achatado pela geração foi novamente normalizado sem alterar o desenho.
