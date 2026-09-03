# Movimento e estados visuais

## Direção aprovada

Movimento comunica somente mudança real. A fila não flutua em repouso e um estado local não desloca componentes. O sistema separa:

- transações de layout: `MOVE`, `ENTER`, `EXIT`, `PROMOTE` e `CONSUME`;
- estados locais: pronto, cooldown, proc, refresh e indisponível;
- fluxo de perímetro: segmento curto dentro da canaleta neutra.

`promote-storyboard-concept-v1.png` demonstra a preservação de identidade durante `PROMOTE`. `motion-state-reference-v1.svg` é a fonte da prancha técnica de movimentos e estados, e `motion-state-reference-v1.png` é seu preview renderizado; os labels existem apenas para documentação.

O contrato estruturado e os tempos aprovados ficam em `manifest.json`. A arte desta pasta não é carregada pelo runtime.

## Prompt da referência conceitual

```text
Use case: precise-object-edit.
Asset type: production motion storyboard for the Spynon's Rotation World of Warcraft addon HUD.
Input images: Image 1 is the sole visual identity and component reference.

Primary request:
Create a clean landscape three-panel storyboard focused only on the approved current-action frame and the three-item recommendation queue. Demonstrate one PROMOTE transaction from left to right:
- panel 1: stable starting layout, one large current action above three smaller queue cells;
- panel 2: the leftmost queue cell travels upward into the current-action anchor while the old current action contracts and fades inward; the remaining queue cells translate one position left and a new cell begins entering from the right;
- panel 3: stable completed layout with the promoted icon preserved as the new current action and all queue cells aligned.

Motion language:
Use restrained translucent ghost positions, short crisp motion trails and a single bright blue leading segment inside the neutral graphite channels. Keep most perimeter channels dark. Preserve icon identity throughout the promotion. The motion must read clearly without large arrows.

Style/medium:
Practical polished game-UI storyboard, front-facing, same graphite/gunmetal construction and vivid brand accents as Image 1, sharp production mockup rather than concept art.

Composition:
Three equal panels on one dark neutral background with generous separation. Crop tightly to current action and queue. No context card, aura row, cast bar or signature.

Invariants:
Keep action icons from Image 1, hotkeys at the upper right, numeric cooldown centered when present, stacks at the lower right, silver GCD only on the large current action, neutral recessed channels, short blue flow segments and restrained green signature accents.

Constraints:
No headings, no labels, no captions, no annotation cards, no gradients, no baked bloom, no fully illuminated perimeter, no extra UI, no configuration screen, no watermark.
```

## Prompt do ajuste final

```text
Use case: precise-object-edit.
Asset type: production motion storyboard for the Spynon's Rotation addon HUD.
Input images: Image 1 is the sole edit target.

Primary request:
Remove only the visible text "GCD 0.8s" from the lower-right area of the large current-action frame in all three storyboard panels. Restore those areas as clean dark graphite channel/track surfaces. Do not add replacement text.

Invariants:
Preserve every frame, icon, hotkey, cooldown number, stack number, motion trail, ghost position, spacing, panel division, colors, lighting and the complete three-panel PROMOTE sequence exactly as in Image 1.

Constraints:
Change only the three GCD text labels; no new text, no captions, no annotations, no new UI, no watermark.
```

A referência conceitual foi produzida com a ferramenta de imagem integrada. O SVG técnico foi construído deterministicamente para manter textos, cores e tempos exatos.
