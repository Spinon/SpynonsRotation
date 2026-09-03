# Referências conceituais de UI

- `spynon-main-hud-annotated-concept-v2.png`: composição aprovada do HUD principal; não deve ser recortada como atlas.
- `spynon-main-hud-procedural-channels-concept-v2.png`: referência ativa da direção com molduras neutras e energia procedural; não deve ser recortada como atlas.
- `spynon-main-hud-procedural-channels-concept-v1.png`: primeira exploração da mesma direção, preservada como histórico.

Os arquivos desta pasta são referências. O status de cada asset final pertence ao manifest do respectivo componente.

## Prompt da referência procedural v1

```text
Use case: precise-object-edit.
Asset type: World of Warcraft addon main HUD procedural-channel concept.
Input images:
- Image 1: sole composition and layout target.
- Image 2: reference for the approved current-action frame and GCD slot.
- Image 3: reference for the approved aura row and blue-buff/red-debuff semantics.
- Image 4: reference for the approved cast/indicator bar.

Primary request:
Keep Image 1's complete central HUD hierarchy, proportions and component placement, but convert every decorative colored bar and perimeter outline into a neutral recessed graphite channel designed to receive code-driven energy later.

Show the intended runtime layers sparingly:
- current action and queue frames: most of each perimeter channel is dark/empty; one short solid electric-blue segment travels inside the channel, plus a smaller lime signature segment where appropriate;
- buff aura cells: dark/empty perimeter channel with one short blue moving segment;
- debuff aura cells: dark/empty perimeter channel with one short vivid red moving segment;
- GCD: a solid neutral-silver progress fill inside its approved lower slot, growing left to right;
- cast: a solid cyan progress fill in its dedicated upper track;
- urgency shelves: retain solid green, amber or red fills only while active;
- combat context: keep the same compact card and use at most one restrained dynamic channel segment.

The static frame must read as graphite metal plus empty recessed channels. Color is a separate procedural layer, never baked across the full perimeter.

Style/medium:
Practical production UI mockup, front-facing, dark game HUD, sharp graphite/gunmetal materials, restrained high-tech brand language.

Invariants:
Preserve action icons, hotkeys, stack numbers, cooldown overlays, context information, queue count, aura order, cast information, skill identity and overall scale.

Constraints:
No fully illuminated colored perimeter, no gradient, no baked bloom, no broad neon wash, no new panels, no configuration screen, no annotations, no numbered labels, no duplicated UI, no perspective change, no watermark.
```

## Prompt da referência procedural v2

```text
Use case: precise-object-edit.
Asset type: clean World of Warcraft addon main HUD procedural-channel concept.
Input images: Image 1 is the sole edit target.

Primary request:
Clean the HUD layout without changing the procedural-channel visual direction:
1. Remove all five floating annotation cards on the right: "AÇÃO ATUAL", "HOTKEYS", "GLOBAL COOLDOWN", "COOLDOWN INDIVIDUAL", and "STACKS".
2. Move the three compact aura cells currently stacked vertically on the left into one horizontal row centered directly below the three queue icons.
3. Remove the duplicate older aura row labeled "ARMA", "MARCA", and "RITMO".
4. Keep the compact combat-context card to the left of the current action.
5. Keep the cast/indicator bar centered below the horizontal aura row and the Spynon signature below it.

Invariants:
Preserve the current action, queue icons, hotkeys, cooldown numbers, stacks, silver GCD progress, cyan cast progress, dark graphite frames, neutral recessed channels, short blue/red moving segments, and restrained green signature segments. Preserve overall scale and central hierarchy.

Constraints:
No annotations, no callout cards, no duplicate aura rows, no new labels, no numbered markers, no fully illuminated perimeter, no gradients, no baked bloom, no extra panels, no perspective change, no watermark.
```

A referência foi gerada com a ferramenta de imagem integrada. Ela comunica composição e camadas; os masters técnicos continuam sendo produzidos e validados separadamente.
