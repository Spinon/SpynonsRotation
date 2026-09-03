# Handoff técnico dos assets do HUD

## Resultado

Os masters aprovados foram convertidos em um kit desacoplado de cor: estrutura neutra, máscara principal, máscara de assinatura e, quando necessário, máscara de estado. O manifest está em [`assets/ui/runtime`](../../assets/ui/runtime/README.md), as texturas consumíveis estão em [`addon/UI/Media/Textures`](../../addon/UI/Media/Textures) e a prancha de inspeção está em [`technical-kit-preview-v1.png`](../../assets/ui/runtime-source/technical-kit-preview-v1.png).

O Product Owner aprovou a versão 1 como baseline de handoff em 2026-09-03. Refinamentos futuros continuam permitidos, mas devem produzir arquivos versionados em vez de sobrescrever os derivados e hashes aprovados.

Os PNGs originais continuam sendo a fonte visual de alta resolução. O script [`Build-TechnicalAssets.ps1`](../../tools/ui/Build-TechnicalAssets.ps1) redimensiona, adiciona padding transparente, neutraliza os pixels cromáticos e produz PNGs de revisão e TGAs equivalentes.

## Geometria de runtime

| Componente | Canvas | Conteúdo útil | Instâncias | Camadas tintáveis |
| --- | --- | --- | ---: | --- |
| Ação atual | 512 × 256 | `(56, 8, 400, 240)` | 1 | principal + assinatura |
| Item da fila | 256 × 256 | `(8, 8, 240, 240)` | 3 | principal + assinatura |
| Contexto | 256 × 128 | `(32, 3, 192, 122)` | 1 | principal + assinatura |
| Cast/indicadores | 1024 × 256 | `(16, 38, 992, 180)` | 1 | principal + assinatura |
| Célula de aura | 512 × 256 | `(1, 48, 510, 160)` | 1 a 5 | tipo + assinatura + estado |

O código deve aplicar o retângulo UV registrado no manifest para excluir o padding sem distorcer o conteúdo. Repetições reutilizam a mesma textura e não geram um arquivo por slot.

## Distribuição no addon

| Pasta | Conteúdo |
| --- | --- |
| `UI/Media/Textures/Actions` | ação atual e item reutilizável da fila |
| `UI/Media/Textures/Auras` | célula reutilizável, máscaras de tipo/assinatura e faixa de estado |
| `UI/Media/Textures/Cast` | moldura e máscaras da barra de cast |
| `UI/Media/Textures/Context` | cartão de contexto de combate e suas máscaras |

O caminho raiz para uso futuro no cliente é `Interface\\AddOns\\SpynonRotation\\UI\\Media\\Textures`. O GCD, o preenchimento do cast, textos e ícones nativos não geram arquivos nesta árvore.

## Ordem de composição

```text
texto configurável: hotkey, cooldown, stacks/charges
segmento procedural revelado pela máscara tintável
master neutro
cooldown radial e demais overlays locais
ícone nativo do WoW ou placeholder neutro
```

No cast e no GCD, o preenchimento linear permanece uma primitiva de runtime. A máscara principal do cast pertence apenas à canaleta da moldura; ela não representa o progresso. Na aura, a máscara principal recebe azul ou vermelho conforme o tipo e é revelada como segmento curto; a máscara inferior recebe verde, âmbar ou vermelho como preenchimento uniforme de urgência.

## Contrato de substituição

- o caminho do master neutro pode ser substituído sem alterar a lógica do componente;
- todas as máscaras compartilham canvas, padding e UV com seu master;
- cor é aplicada no runtime e não seleciona um bitmap alternativo;
- nenhum layer contém ícone de habilidade, texto, classe ou spec;
- se um arquivo estiver ausente, o placeholder local deve preservar canvas, âncora e UV;
- a implementação nunca usa previews conceituais como textura do addon.

## Limites e validação futura

Os arquivos foram validados offline quanto a dimensões, alpha, headers TGA, hashes e rastreabilidade. Eles ainda não foram carregados no cliente Retail; compatibilidade visual, escala efetiva, custo de draw calls e nitidez final devem ser confirmados pela task técnica que implementar a UI.
