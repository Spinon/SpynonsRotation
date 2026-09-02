# Molduras de actions

## Status

Os arquivos `v1` são candidatos visuais de `UI-DESIGN-002` e aguardam aprovação do Product Owner. Eles são masters raster em alta resolução; normalização para dimensões e formatos de runtime pertence a `UI-DESIGN-008`.

## Assets

| Arquivo | Papel | Dimensões de origem | Estado base |
| --- | --- | --- | --- |
| `action-current-frame-v1.png` | Moldura da ação atual, em linha própria | 1610 × 977 | Ênfase principal |
| `action-queue-frame-v1.png` | Moldura reutilizada pelas três próximas recomendações | 1254 × 1254 | Prioridade secundária |

Ambos os arquivos possuem alpha real no exterior e na abertura central. O conteúdo preto exibido por alguns visualizadores é a transparência, não um background incorporado.

## Contrato de uso

- o ícone nativo do WoW é renderizado em uma camada abaixo da moldura;
- a arte não contém ícone, nome, número, hotkey, cooldown, GCD, stacks ou informação de spec;
- a action atual mantém proporção horizontal de aproximadamente `1.65:1`;
- a fila usa a mesma moldura quadrada três vezes, sem duplicar o bitmap;
- hotkey e stacks ocupam camadas próprias nos cantos superior e inferior direitos;
- cooldown, glow e estados animados serão overlays independentes, sem alterar estes masters;
- o recorte/máscara final do ícone será preparado no kit técnico de `UI-DESIGN-008`.

## Direção visual

As molduras usam grafite e gunmetal como estrutura, prata somente nas quinas, energia azul/ciano como assinatura principal e verde como acento mínimo. A linguagem deriva da marca Spynon sem reproduzir o logotipo e permanece genérica entre classes e specs.

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

A geração inicial apresentou um checkerboard opaco. Foi aplicada uma edição `background-extraction` separada em cada asset para remover somente o checkerboard no exterior e no centro, preservar a moldura e converter essas regiões para alpha real sem halo branco.
