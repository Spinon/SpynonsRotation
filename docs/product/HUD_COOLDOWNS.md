# Global Cooldown e cooldown individual

## Escopo

Este documento registra o contrato visual de `UI-DESIGN-004`. GCD e cooldown individual comunicam tempos diferentes e não compartilham a mesma forma visual.

## Cooldown individual

O cooldown individual usa o comportamento radial comum em interfaces de jogos e disponível no ecossistema do WoW. Não existe argola, aro decorativo, moldura adicional, glifo ou bitmap autoral para esse estado.

Sequência visual:

1. ao iniciar o cooldown, a abertura do ícone fica totalmente coberta por cinza, com cor e luminosidade reduzidas;
2. a partir da posição de 12 horas, a área colorida do ícone reaparece progressivamente no sentido horário;
3. ao ficar disponível, o cinza desaparece por completo e a arte nativa volta ao estado normal;
4. somente a abertura do ícone participa do efeito; moldura v4, hotkey, stacks/charges e glows permanecem fora do recorte.

O handoff técnico deve preferir o radial swipe nativo do cliente e seus eventos de cooldown, sem recalcular uma máscara completa por frame. A compatibilidade exata com APIs e Secret Values continua sob responsabilidade da camada técnica apropriada; a UI não inventa tempos indisponíveis.

## Valor numérico

O tempo restante é uma camada tipográfica independente, centralizada sobre a habilidade e acima do cinza radial. O valor nunca é incorporado ao ícone ou à moldura.

Controles previstos nas configurações:

- `showCooldownText`: exibe ou remove completamente o número;
- `fontFace`, `fontSize` e `outline`;
- `color`;
- `offsetX` e `offsetY` a partir do centro da habilidade;
- precisão decimal, quando essa opção for exposta pela trilha de configuração.

Com `showCooldownText = false`, o radial swipe continua funcionando normalmente. Em estado ready, nenhum `0` ou `0.0` permanece sobre o ícone.

## Global Cooldown

O GCD permanece uma barra horizontal fina integrada ao rodapé da ação atual. Ele não usa o radial swipe da habilidade e não aparece nos itens da fila. Essa diferença de forma evita confundir indisponibilidade individual com a curta janela global entre ações.

A direção final de preenchimento, cor de progresso e presença de texto na barra serão fechadas na continuação de `UI-DESIGN-004`. Nenhuma dessas decisões altera o contrato já aprovado do cooldown individual.

## Camadas

```text
hotkey + stacks/charges tipográficos
valor numérico opcional do cooldown
estados transitórios e glow da moldura
moldura estática v4
radial swipe cinza recortado
ícone nativo do WoW
```

O radial swipe e o número são componentes independentes. Desabilitar o número não muda a textura, o recorte ou o progresso do cinza.
