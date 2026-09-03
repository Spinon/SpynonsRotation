# Fontes técnicas e previews

Os PNGs desta pasta espelham os derivados TGA para inspeção visual e comparação de alpha. Eles são reconstruídos por [`tools/ui/Build-TechnicalAssets.ps1`](../../../tools/ui/Build-TechnicalAssets.ps1) a partir dos masters aprovados em `frames`, `context`, `cast` e `auras`.

- arquivos `*-neutral-v1.png`: masters redimensionados, com os canais de cor convertidos em canaletas neutras;
- arquivos `*-primary-mask-v1.png`: caminho permitido para energia principal ou tipo da aura;
- arquivos `*-signature-mask-v1.png`: caminho permitido para o acento secundário da marca;
- `aura-juggle-cell-state-shelf-mask-v1.png`: superfície tintável de urgência;
- `technical-kit-preview-v1.svg`: prancha determinística que reúne os layers;
- `technical-kit-preview-v1.png`: render da prancha para revisão rápida.

Não edite os derivados manualmente. Altere o master aprovado ou o script e reconstrua o conjunto. Os hashes canônicos ficam em [`../runtime/manifest.json`](../runtime/manifest.json).
