# Build de referência para iniciantes — Enhancement 12.1.0

## Resultado

A sugestão versionada para dano sustentado em alvo único é a **Stormbringer oficial**:

```text
CcQAAAAAAAAAAAAAAAAAAAAAAMzMzgZmZmZmhZmZAAAAAAAAA2AsZGDLkFYGGawCAzyMmxYZZGYmZbsMzMzMGGzAAMDjZGGBmZwgxA
```

Na confirmação de 20.000 iterações, ela mediu `232819.555252` DPS no chassi fixo. As variantes
Lightning Conduit e Surging Currents produziram exatamente a mesma média com a seed pinada. Como
nenhuma demonstrou ganho com limite inferior positivo no intervalo de confiança de 95%, a baseline
oficial foi preservada como `damageWinner`.

A mesma build é a `starterSuggestion`. A alternativa Stormbringer com Deeply Rooted Elements reduz
o proxy de complexidade de `13` para `10`, mas mediu `210603.459948` DPS e ficou muito além da
tolerância de 0,5%. Não houve alternativa comprovadamente mais simples dentro da tolerância.

## O que foi comparado

- 10 talent strings: duas baselines oficiais e oito trocas curadas de um único nó;
- Stormbringer e Totemic no mesmo personagem, equipamento, consumíveis e APL;
- cenário `neutral.st_long`: um alvo, Patchwerk, duração fixa de 300 segundos;
- triagem de 2.000 iterações com seed `620061`;
- confirmação de 20.000 iterações com seed independente `720061`;
- SimulationCraft `1210.01`, WoW `12.1.0.69587`, commit `f86979165c9b952e41d8cb6119065d3f6272abee`.

Cada variante é recriada pelo SimC a partir de sua baseline com uma troca no mesmo nó. A geração é
interrompida se a string reexportada, a Hero Tree ou a seleção observada divergir da linhagem
declarada. O arquivo `report.json` contém o inventário completo de equipamento e as métricas de cada
candidata.

## Complexidade

O proxy considera apenas a lista single-target compatível com a Hero Tree:

```text
score = ações distintas de decisão + 2 × cooldowns ativos
```

Esse valor é usado somente depois do filtro de dano de 0,5%. Ele nunca altera o ranking puro de DPS.

## Limites

Esta é uma build de referência ST/Patchwerk para o chassi e as versões pinadas, não uma afirmação de
ótimo universal. O estudo não cobre movimento, cleave, AoE, Mythic+, utilidade, sobrevivência,
equipamentos individuais ou todo o espaço de talentos. A medição foi offline no SimulationCraft e
não constitui validação dentro do cliente World of Warcraft.

## Reprodução

```text
npm run enhancement:starter-generate
npm run enhancement:starter-check
```

`starter-generate` refaz as medições longas. `starter-check` revalida fontes, strings, linhagens,
snapshots, medições e decisão sem repetir o orçamento longo.
