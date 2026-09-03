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

O GCD é uma barra horizontal fina integrada ao rodapé da ação atual. Ele não usa o radial swipe da habilidade e não aparece nos itens da fila. Essa diferença de forma evita confundir indisponibilidade individual com a curta janela global entre ações.

Contrato visual:

- o trilho ocupa a abertura normalizada `(x: 0.172, y: 0.892, largura: 0.657, altura: 0.024)` da ação atual `v5`;
- o preenchimento começa em `0%` e cresce linearmente da esquerda para a direita até `100%`;
- o padrão aprovado é prata neutro sólido `#D8E1E8`, configurável globalmente ou apenas para o GCD;
- o trilho de repouso é grafite azulado sólido, `#07131D`, com alpha `0.86`;
- não existe gradiente, bloom incorporado, brilho móvel ou pulso de conclusão;
- a barra não mostra label, unidade ou valor numérico;
- ao concluir, o preenchimento desaparece e somente o trilho discreto permanece.

O crescimento da barra comunica aproximação do estado ready. A cor é decorativa e nunca substitui o comprimento como fonte de progresso. O prata evita competir com azul estrutural/buff, ciano do cast, verde positivo, âmbar de atenção e vermelho de debuff/urgência. A seleção foi aprovada em `UI-DESIGN-010`.

O GCD deve ser uma composição procedural leve, não um bitmap. A moldura `action-current-frame-v5.png` fornece somente o bezel e a abertura transparente de encaixe; trilho e preenchimento ficam abaixo dela. Se o progresso real não estiver disponível de forma segura, a UI mantém apenas o trilho e não inventa duração. O contrato técnico está registrado em [`assets/ui/gcd`](../../assets/ui/gcd/README.md), com pranchas destinadas somente à documentação.

O GCD usa o modo `LINEAR_PROGRESS` do contrato de [`HUD_PROCEDURAL_CHANNELS.md`](HUD_PROCEDURAL_CHANNELS.md). Ele não adota o segmento rolável dos perímetros: seu movimento sempre representa progresso real.

## Camadas

```text
hotkey + stacks/charges tipográficos
valor numérico opcional do cooldown
estados transitórios e glow da moldura
moldura estática v4
radial swipe cinza recortado
ícone nativo do WoW

GCD procedural              <- slot separado no rodapé da ação atual
```

O radial swipe e o número são componentes independentes. Desabilitar o número não muda a textura, o recorte ou o progresso do cinza.
