# Pontos de animação das molduras

## Escopo

Este documento registra onde o glow de movimento será conectado aos candidatos `v3`. Nenhuma animação ou lógica de runtime é implementada em `UI-DESIGN-002`.

As linhas azul/ciano e verde dos masters são trilhos de repouso: estáticos, sólidos, escuros e sem gradiente. O movimento virá de um pequeno overlay monocromático com queda suave apenas no alpha, colorido no runtime e posicionado sobre os trilhos existentes. Somente esse overlay deve atingir luminosidade de glow.

| Canal | Base em repouso | Glow futuro |
| --- | --- | --- |
| Azul/ciano | `#07566D` | `#27D9FF` |
| Verde | `#2B6F35` | `#7CFF4B` |

As cores de glow são alvos de direção para `UI-DESIGN-007`, não pixels incorporados aos masters `v3`. A animação não deve elevar permanentemente o brilho do trilho inteiro.

## Ordem das camadas

```text
hotkey + stacks/charges
glow animado              <- pontos definidos neste documento
moldura estática v3
cooldown radial + número  <- limitado à abertura do ícone
ícone nativo do WoW
```

O glow não pode cobrir hotkeys, stacks, números ou a arte nativa da action.

## Hooks da ação atual

### `current.blue.perimeter`

- trilho: canal azul/ciano interno do perímetro;
- direção: sentido horário;
- início visual: encontro superior esquerdo do canal azul;
- sequência: topo → quina direita → lateral direita → base → quina esquerda → lateral esquerda;
- comportamento proposto: passagem lenta e discreta enquanto a action estiver realmente ativa;
- implementação futura: um único segmento de glow reutilizável, movido por trechos; a moldura completa permanece imóvel.

Âncoras normalizadas de referência para o master horizontal:

```text
start       (0.12, 0.08)
top-right   (0.88, 0.08)
right-low   (0.91, 0.85)
bottom-left (0.13, 0.91)
left-high   (0.09, 0.14)
```

### `current.green.signature`

- trilho: diagonal verde no canto superior esquerdo;
- direção: da base da diagonal para o topo;
- âncoras: `(0.10, 0.36)` → `(0.26, 0.08)`;
- comportamento proposto: pulso curto sincronizado a cada segunda passagem azul, sem loop próprio contínuo;
- função: assinatura visual, não indicação mecânica de classe/spec.

## Hooks da fila

### `queue.blue.promote`

- trilho: segmentos azul/ciano do topo, laterais e base da moldura quadrada;
- direção: sentido horário, respeitando as interrupções físicas da moldura;
- início visual: trilho superior após o conjunto diagonal esquerdo;
- comportamento proposto: one-shot em `ENTER` ou `PROMOTE`; itens parados na fila não mantêm animação contínua;
- implementação futura: o mesmo segmento de glow usado na ação atual, redimensionado para a fila.

Âncoras normalizadas de referência para o master quadrado:

```text
start       (0.29, 0.08)
top-right   (0.70, 0.08)
right-low   (0.88, 0.75)
bottom-left (0.27, 0.86)
left-high   (0.13, 0.23)
```

### `queue.green.confirm`

- trilho: acento verde diagonal no canto superior esquerdo;
- âncoras: `(0.14, 0.20)` → `(0.25, 0.09)`;
- comportamento proposto: flash curto ao concluir `PROMOTE`; sem animação ociosa;
- função: confirmação de transição visual, nunca representação de buff, proc ou recurso de uma spec.

## Política de desempenho

- no máximo um ciclo ocioso: `current.blue.perimeter` da action atual;
- fila usa somente animações one-shot e apenas no item afetado;
- usar uma textura pequena de glow reutilizada e colorida no runtime;
- manter o trilho-base escuro e mover apenas a janela luminosa do overlay;
- preferir grupos de animação nativos do cliente a loops próprios por frame;
- nunca deslocar, trocar ou recalcular os bitmaps completos das molduras;
- parar animações quando o HUD estiver oculto;
- modo de movimento reduzido substitui deslocamento por uma única variação curta de alpha;
- a cadência final e o asset do glow pertencem a `UI-DESIGN-007`;
- a implementação Lua pertence à task técnica do Animator na trilha `delivery`.

## Contrato de substituição

Os IDs deste documento também aparecem em `manifest.json`. O handoff técnico deve manter esses IDs estáveis mesmo se coordenadas forem normalizadas em `UI-DESIGN-008`. Nenhum hook recebe nome ou comportamento específico de classe/spec.
