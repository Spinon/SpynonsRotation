# Badges de hotkey, stacks e charges

## Status

Os arquivos `v1` são candidatos visuais ativos de `UI-DESIGN-003` e aguardam revisão do Product Owner. São masters raster em alta resolução; dimensões e simplificação final para runtime pertencem a `UI-DESIGN-008`.

| Arquivo | Papel | Dimensões de origem |
| --- | --- | --- |
| `hotkey-badge-frame-v1.png` | Base vazia da hotkey no canto superior direito | 1270 × 783 |
| `stacks-badge-frame-v1.png` | Base vazia da quantidade no canto inferior direito | 952 × 601 |
| `stacks-kind-glyph-v1.png` | Marcador semântico de stacks acumulados | 1105 × 1127 |
| `charges-kind-glyph-v1.png` | Marcador semântico de charges discretas | 1238 × 1195 |

## Contrato de conteúdo

- hotkey, número e tipo da quantidade são overlays de runtime;
- hotkey aceita strings curtas e modificadores como `SHIFT-Q`, sem texto incorporado ao PNG;
- stacks usam o glifo de placas sobrepostas;
- charges usam o glifo de anel segmentado;
- se o tipo da quantidade não estiver disponível, o runtime mostra somente o número e não inventa um glifo;
- debuffs não ocupam nenhum destes badges;
- as bases são relacionadas visualmente, mas têm cortes e trilhos espelhados para reforçar suas posições.

## Prompts finais — bases v1

```text
Use case: stylized-concept
Asset type: small empty angular badge frame for a World of Warcraft addon action
Input images: approved HUD layout for placement; approved action frame for materials and colors; official Spynon logo for palette only.
Primary request: produce separate upper-right hotkey and lower-right quantity badge bases, with dark graphite fill, crisp gunmetal/silver bevels, solid electric-azure rails and a tiny lime accent; preserve a large clean central content area.
Constraints: one isolated reusable element per image; genuinely transparent exterior; no baked text, numbers, icons, logos, class/spec symbols, spell art, perspective, shadow, bloom or gradient in colored rails.
```

## Prompts finais — glifos v1

```text
Use case: stylized-concept
Asset type: tiny semantic glyph overlay for a World of Warcraft addon quantity badge
Primary request: a universal stacks glyph made of three offset diamond plates; a separate universal charges glyph made of one ring split into three segments. Strong silhouettes at small size, matching the approved graphite, silver, electric-azure and lime palette.
Constraints: one centered glyph per image; genuinely transparent background; no text, number, logo, class/spec symbol, spell art, container frame, shadow, glow or extra object.
```

## Normalização

As bases tiveram o fundo claro achatado removido apenas na região exterior conectada ao canvas e foram recortadas. Os glifos já vieram com alpha real e receberam somente recorte do espaço transparente.
