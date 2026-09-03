# Movimento e estados visuais do HUD

## Princípio

Movimento existe para explicar uma mudança, não para manter o HUD permanentemente ativo. Apenas a ação atual pode sustentar um fluxo lento em repouso; fila, contexto e indicadores usam animações pontuais ou segmentos de baixa saliência.

A referência conceitual de promoção está em [`promote-storyboard-concept-v1.png`](../../assets/ui/motion/promote-storyboard-concept-v1.png). A prancha técnica está em [`motion-state-reference-v1.svg`](../../assets/ui/motion/motion-state-reference-v1.svg). Nenhuma delas é asset de runtime.

## Transações da fila

| Evento | Duração aprovada | Tratamento | O que o distingue |
| --- | ---: | --- | --- |
| `MOVE` | 160 ms | Translação entre slots com escala e alpha preservados. | O item permanece no mesmo nível de hierarquia. |
| `ENTER` | 180 ms | Entra pela direita a partir de 25% da largura da célula; alpha `0 → 1`, escala `0,96 → 1`. | É o único evento que nasce fora da fila. |
| `EXIT` | 120 ms | Contrai para `0,94` e apaga no próprio slot. | Não se desloca lateralmente nem simula consumo. |
| `PROMOTE` | 220 ms | A primeira célula sobe e amplia até a âncora da ação atual, preservando identidade. | É a única transição entre níveis de hierarquia. |
| `CONSUME` | 100 ms | Ação atual comprime para `0,96`, reduz alpha e recebe um flash prateado interno único. | Não usa explosão, shake ou viagem lateral. |

Todos os deslocamentos usam desaceleração curta. Um diff de fila executa `CONSUME`, inicia `PROMOTE` e então sobrepõe parcialmente `MOVE` e `ENTER`; a transação inteira deve terminar em até 360 ms. Se uma nova recomendação chegar durante o movimento, o controlador recalcula o destino a partir da posição visual corrente e nunca faz snap de volta à origem.

## Estados locais

| Estado | Tratamento |
| --- | --- |
| Pronto | A ação atual mantém um único segmento azul percorrendo a canaleta em aproximadamente 3,2 s. |
| Cooldown | O radial swipe cinza permanece autoritativo; o número central é opcional e a energia de perímetro pausa ou escurece. |
| Proc | Um segmento verde curto ganha alpha uma vez na entrada do proc; não cria uma borda verde contínua. |
| Refresh | O encaixe inferior da aura troca para âmbar e ganha alpha uma vez; o perímetro continua azul para buff ou vermelho para debuff. |
| Indisponível | Ícone dessaturado, alpha reduzido, canaleta vazia e nenhum movimento; a UI nunca inventa disponibilidade. |

Cooldown individual continua sendo a overlay horária definida em [`HUD_COOLDOWNS.md`](HUD_COOLDOWNS.md). GCD e cast continuam usando comprimento linear como dado autoritativo e não adotam loops decorativos.

## Fluxo nas canaletas

- ação atual: segmento com 22% a 28% do perímetro; um ciclo lento de 3,2 s somente quando pronta;
- fila: sem loop ocioso; um segmento acompanha `ENTER`, `MOVE` ou `PROMOTE` uma única vez;
- aura: segmento com 14% a 18% do perímetro em ciclo de 3,6 s para manter legível o tipo buff/debuff;
- contexto: segmento com 10% a 14% do perímetro em ciclo de 4,8 s e alpha reduzido;
- limite: uma transação espacial e até dois acentos locais simultâneos.

Azul, verde, vermelho e os demais valores seguem os defaults configuráveis de [`HUD_PROCEDURAL_CHANNELS.md`](HUD_PROCEDURAL_CHANNELS.md). Trocar uma cor não altera evento, estado ou prioridade.

## Configuração e acessibilidade

O usuário poderá controlar movimento globalmente e por componente, além de intensidade e velocidade dentro de limites seguros. O modo reduzido remove viagens longas: `MOVE` atualiza o slot diretamente, `ENTER`/`EXIT` usam apenas crossfade curto, `PROMOTE` faz crossfade entre as duas âncoras e `CONSUME` usa uma única queda de alpha. Com movimento desligado, a geometria muda imediatamente e os segmentos ficam estáticos.

Labels da documentação não aparecem no HUD. Hotkey, stacks, charges e cooldown numérico mantêm suas camadas tipográficas e posições configuráveis.

## Handoff futuro

O pacote de `UI-DESIGN-008` fornece as máscaras e coordenadas de cada canaleta sem incorporar cor ou animação. A implementação técnica deve usar um controlador compartilhado de timeline, interromper animações quando o HUD estiver oculto e evitar um loop independente por elemento.
