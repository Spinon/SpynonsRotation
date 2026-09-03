# Canaletas procedurais do HUD

## Princípio

As molduras estáticas devem fornecer somente estrutura de grafite, recortes e canaletas neutras. Cor, preenchimento e movimento pertencem a camadas procedurais desenhadas pelo runtime. Isso impede que o HUD permaneça inteiramente iluminado quando nada exige atenção e permite trocar a paleta sem substituir bitmaps.

A referência conceitual ativa é [`spynon-main-hud-procedural-channels-concept-v2.png`](../../assets/ui/concepts/spynon-main-hud-procedural-channels-concept-v2.png). Ela demonstra a direção do sistema, não é um atlas nem valida implementação no cliente Retail.

## Modos de renderização

| Modo | Uso | Comportamento |
| --- | --- | --- |
| Canaleta de perímetro | ação atual, fila, contexto e células de aura | Um segmento curto percorre a canaleta; o restante permanece escuro. |
| Progresso linear | GCD e cast/canalização | O comprimento representa progresso observável da esquerda para a direita. |
| Preenchimento de estado | encaixe inferior das auras | Uma cor sólida uniforme aparece somente enquanto o estado correspondente estiver ativo. |

Nenhum modo incorpora gradiente, bloom ou glow ao raster. Um destaque luminoso futuro deve ser uma camada separada e descartável. Com movimento desativado, a UI usa um segmento estático ou o preenchimento de progresso normal, sem alterar a moldura.

## Paleta padrão

| Token | Padrão | Papel |
| --- | --- | --- |
| Canaleta | `#07131D` | Trilho neutro em repouso. |
| Fluxo principal | `#0788D8` | Ações, fila e estrutura ativa. |
| Assinatura | `#42C93E` | Acento curto e secundário da marca. |
| GCD | `#D8E1E8` | Candidato prata neutro, ainda sob revisão em `UI-DESIGN-010`. |
| Cast | `#22D3EE` | Progresso de cast/canalização. |
| Buff | `#0788D8` | Segmento de tipo buff. |
| Debuff | `#E5484D` | Segmento de tipo debuff. |
| Estável | `#7CFF4B` | Estado saudável. |
| Atenção | `#FFC247` | Aproximação da janela de intervenção. |
| Crítico | `#FF3F3F` | Intervenção imediata. |

Esses valores são defaults, não cores fixas. A configuração deve aceitar uma paleta global e overrides por componente. Quando não houver override, o componente herda o token global. Geometria, recortes e âncoras não mudam com a troca de cor.

## Separação entre tipo, progresso e urgência

- o perímetro de uma aura informa tipo: azul para buff e vermelho para debuff;
- o encaixe inferior informa urgência: verde, âmbar ou vermelho;
- a posição na fila informa prioridade;
- GCD e cast usam comprimento, não cor, como dado autoritativo de progresso.

Mesmo quando vermelho aparece em mais de um papel, a superfície preserva a leitura: perímetro é tipo; encaixe inferior é urgência. O runtime não infere semântica pela cor escolhida pelo usuário.

## Contrato técnico futuro

`UI-DESIGN-007` define comprimento, velocidade, direção, entrada, saída e fallback de movimento reduzido. `UI-DESIGN-008` entrega cada moldura neutra, a máscara da canaleta e os pontos de composição necessários ao runtime. A implementação deve preferir um controlador de animação compartilhado pelo HUD e evitar um ciclo de atualização independente por segmento. O handoff consolidado está em [`HUD_ASSET_HANDOFF.md`](HUD_ASSET_HANDOFF.md).

O contrato canônico dos tokens e modos está em [`assets/ui/procedural-channels.json`](../../assets/ui/procedural-channels.json).
