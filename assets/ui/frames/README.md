# Molduras de actions

## Status

Os arquivos `v2` são os candidatos visuais ativos de `UI-DESIGN-002` e aguardam aprovação do Product Owner. Eles substituem o gradiente/bloom incorporado por canais azul/ciano e verde de cor sólida. Os arquivos `v1` permanecem preservados como histórico de comparação.

Todos são masters raster em alta resolução; normalização para dimensões e formatos de runtime pertence a `UI-DESIGN-008`.

## Assets

| Arquivo | Papel | Dimensões de origem | Estado base |
| --- | --- | --- | --- |
| `action-current-frame-v2.png` | Moldura ativa da ação atual, em linha própria | 1619 × 971 | Ênfase principal |
| `action-queue-frame-v2.png` | Moldura ativa reutilizada pelas três próximas recomendações | 1254 × 1254 | Prioridade secundária |
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
- os canais coloridos do `v2` permanecem estáticos e sólidos; nenhum bitmap-base será deslocado ou pulsado;
- os pontos de inserção e a política de custo estão em [`ANIMATION_HOOKS.md`](ANIMATION_HOOKS.md);
- o recorte/máscara final do ícone será preparado no kit técnico de `UI-DESIGN-008`.

## Direção visual

As molduras usam grafite e gunmetal como estrutura, prata somente nas quinas, azul/ciano sólido como assinatura principal e verde sólido como acento mínimo. O movimento será sugerido futuramente por um pequeno overlay de glow, nunca por gradiente gravado na moldura. A linguagem deriva da marca Spynon sem reproduzir o logotipo e permanece genérica entre classes e specs.

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
