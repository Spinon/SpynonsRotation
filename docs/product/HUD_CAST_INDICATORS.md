# Barra de cast e indicadores decisivos

## Objetivo

O componente combina o progresso de cast com poucos sinais que mudam a decisão imediata. Ele ocupa uma posição estável na base do HUD e evita criar um segundo painel de auras.

A arte aprovada está em [`assets/ui/cast/cast-indicator-frame-v1.png`](../../assets/ui/cast/cast-indicator-frame-v1.png). Ela é uma moldura vazia; nenhum conteúdo de combate está incorporado ao bitmap.

## Zonas estáveis

As medidas abaixo descrevem o master de origem de `1938 × 352 px`. A normalização para runtime está registrada em [`HUD_ASSET_HANDOFF.md`](HUD_ASSET_HANDOFF.md).

| Zona | Retângulo de referência | Conteúdo |
| --- | --- | --- |
| Progresso de cast | `x=107, y=48, w=1095, h=61` | Trilho e preenchimento procedurais, da esquerda para a direita. |
| Indicadores decisivos | `x=66, y=133, w=1136, h=161` | Poucos sinais contextuais, alinhados sem deslocar o centro. |
| Identidade do cast | `x=1248, y=55, w=624, h=240` | Ícone nativo à esquerda e nome da habilidade à direita. |

As três zonas mantêm âncoras independentes. Trocar o nome ou a quantidade de indicadores não desloca o centro da barra.

## Contrato de conteúdo

- o progresso é dinâmico e não pertence à moldura;
- o ícone vem do cliente do WoW, resolvido a partir da identidade genérica da action;
- o nome é texto dinâmico e não pode ser rasterizado no master;
- os indicadores recebem apenas dados genéricos e observáveis fornecidos ao HUD;
- a UI não importa módulos de classe ou spec para decidir qual indicador mostrar;
- se o ícone não estiver disponível, entra um placeholder neutro, local e com o mesmo recorte;
- cor nunca é o único sinal de um indicador: ícone ou rótulo curto preserva o significado.

O placeholder cinza e os textos do preview existem somente para demonstrar composição. Eles não são assets autorais de habilidades e não autorizam integração antecipada no runtime.

## Estados

| Estado | Comportamento |
| --- | --- |
| Cast + indicadores | Mostra progresso, indicadores, ícone e nome. |
| Somente cast | Mantém progresso e identidade; a região central fica vazia. |
| Somente indicadores | Oculta progresso, ícone e nome; os indicadores permanecem no centro. |
| Ocioso | Oculta o componente inteiro para não deixar uma moldura vazia em combate. |

A troca entre estados não muda a largura das zonas enquanto o componente estiver visível. Entradas, saídas e fades pertencem a `UI-DESIGN-007`.

## Cor e distinção do GCD

A moldura técnica final terá canaletas neutras e máscara separada para energia procedural. O preview usa ciano `#22D3EE` como default configurável para o preenchimento do cast, sem gradiente ou glow incorporado.

O GCD usa prata `#D8E1E8` como padrão aprovado para não competir com o cast ciano. Ambos usam `LINEAR_PROGRESS`, mas mantêm slots e fontes de progresso independentes. A geometria do slot do GCD não muda nessa revisão.

## Limites

Esta entrega define arte, zonas, camadas e estados. Ela não implementa chamadas de cast, resolução de ícone, leitura de buffs/debuffs, animações ou validação no cliente Retail.
