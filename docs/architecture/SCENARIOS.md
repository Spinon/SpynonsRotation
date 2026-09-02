# Matriz de cenários e fitness

A matriz de cenários define onde uma rotação precisa ser avaliada antes de entrar em otimização ou
regressão. Ela pertence ao Rotation Lab e não altera `CombatContext`, runtime ou UI. A v1 usa JSON
com extensão `.scenario-matrix.json` e permanece neutra em relação a classe, spec, build e APL.

```text
Matriz versionada ──compile──> planos SimC determinísticos
        │
        └── resultados baseline/candidata ──evaluate──> fitness + guardrails
```

## Cobertura inicial

A matriz v1 exige exatamente os doze perfis definidos pelo contexto de produto:

| Categoria | Perfis | Alvos base | Duração inicial |
| --- | --- | --- | --- |
| Single Target | curto, médio, longo | 1 | 60s, 180s, 300s |
| Cleave | 2 alvos, 3 alvos | 2, 3 | 180s |
| AoE | 4 alvos, 5 alvos, 8 alvos | 4, 5, 8 | 120s |
| Dungeon-like | pull curto, pull prolongado, boss, waves/adds | 5, 5, 1, 1 + adds | 30s, 90s, 180s, 180s |

Essas durações e os pesos da fixture são defaults técnicos iniciais, não uma conclusão de balance
para Enhancement. A curadoria da spec poderá versionar outra matriz sem inserir nomes de classe no
código genérico.

## Planos do SimulationCraft

Cada cenário produz uma sequência ordenada e tipada com:

- `iterations` e `threads` herdados dos defaults;
- `max_time`, `fixed_time` e `vary_combat_length` para o modelo temporal;
- `desired_targets` e `fight_style` para forma e quantidade de alvos;
- `raid_events+=/adds` somente no perfil waves/adds.

A duração fixa com variação zero torna explícita a janela comparada. A documentação oficial do
SimulationCraft descreve `max_time`, `fixed_time` e `vary_combat_length` em
[Options](https://github.com/simulationcraft/simc/wiki/Options), enquanto os formatos de adds e os
estilos predefinidos estão em [RaidEvents](https://github.com/simulationcraft/simc/wiki/RaidEvents).

O plano inclui SHA-256 da matriz canônica. Reordenar fisicamente cenários ou eventos não muda o
digest nem a ordem final. A LAB-004 valida os planos, mas não executa uma baseline real; essa
execução depende da APL e do catálogo da spec.

## Fitness

Para cada cenário `i`, a comparação usa variação percentual relativa:

```text
delta_i = ((candidate_i / baseline_i) - 1) * 100
fitness = sum(weight_i * delta_i) / sum(weight_i)
```

Usar deltas relativos impede que um cenário de AoE domine a média apenas por possuir DPS absoluto
maior. O relatório também calcula o mesmo agregado por categoria.

Peso e limite máximo de regressão são dados da matriz. Um cenário pode sobrescrever o limite
global. A candidata só é elegível quando todos os deltas respeitam seus limites:

```text
eligible = todo delta_i >= -maxRegressionPercent_i
```

Assim, fitness positivo não compensa uma perda grave. A fixture de guardrail tem `+3%` de fitness
ponderado, mas é rejeitada porque waves/adds perde `10%` diante de um limite de `4%`.

Resultados precisam cobrir a matriz inteira e referenciar sua identidade e versão. Cenários
ausentes, extras, duplicados ou métricas não positivas falham antes do cálculo.

## Comandos

```powershell
npm run scenario:check
npm run scenario:check -- --matrix caminho/arquivo.scenario-matrix.json
npm run scenario:test
```

`scenario:check` valida cobertura, gera os planos duas vezes para confirmar estabilidade e prova as
fixtures de candidata aceita e regressão mascarada. O comando não executa SimulationCraft, não
altera fixtures e não produz uma recomendação de rotação.

## Fronteiras futuras

O optimizer da `LAB-005`, descrito em [`OPTIMIZER.md`](OPTIMIZER.md), consome o resultado `eligible`
para pesquisar candidatas sem duplicar o cálculo de fitness. `LAB-006`
orquestrará execuções e relatórios comparando baseline, candidata e release anterior. `ENH-002`
fornecerá a primeira APL real. Nenhuma dessas responsabilidades pertence ao schema da matriz.
