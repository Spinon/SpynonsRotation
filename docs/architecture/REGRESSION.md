# Suíte de regressão do Rotation Lab

A suíte de regressão fecha a comparação offline do Rotation Lab sem executar processos, alterar a
DSL ou promover releases. Ela recebe três resultados já medidos na mesma matriz — baseline atual,
candidata e release anterior — e produz um relatório canônico com veredito e diagnóstico por
cenário.

```text
baseline ───────────────┐
candidata ──────────────┼── validar paridade ── comparar ── relatório + veredito
release anterior ───────┘       │
matriz + política ───────────────┘
```

## Entradas versionadas

### Política

Arquivos `.regression-policy.json` registram ID, versão, matriz alvo e duas fontes de threshold:

- candidata × baseline usa obrigatoriamente `scenario_matrix`, reutilizando os guardrails da
  LAB-004 sem redefini-los;
- candidata × release anterior usa um limite default da política e sobrescritas explícitas por
  cenário.

Baseline × release anterior é diagnóstico de deriva e não possui threshold próprio. A candidata
continua sendo comparada à release anterior, portanto uma perda herdada pela baseline não fica
oculta.

### Resultados

Cada `.regression-results.json` representa exatamente um papel: `baseline`, `candidate` ou
`previous_release`. O documento registra:

- identidade, versão e SHA-256 da matriz;
- identidade, versão e SHA-256 da rotação;
- versão de release para `previous_release`;
- ID, versão e revisão do engine, build do WoW e iterações;
- uma métrica positiva e uma seed explícita para cada cenário.

Os três resultados precisam cobrir exatamente a matriz. Campos desconhecidos, cenários ausentes ou
duplicados, valores não finitos, digests inválidos e proveniência incompleta são recusados.

## Comparabilidade

O cálculo só começa quando os três resultados usam:

- a mesma matriz e o mesmo digest canônico;
- o mesmo engine, versão, revisão e build do WoW;
- o mesmo número de iterações;
- a mesma seed para cada cenário correspondente.

Isso impede comparar resultados obtidos sob condições diferentes como se fossem uma regressão da
rotação. A seed fica no relatório final para que a execução possa ser reproduzida depois.

## Comparações

O relatório sempre contém, nesta ordem:

| Comparação | Função | Threshold | Afeta o veredito |
| --- | --- | --- | --- |
| candidata × baseline | Segurança da mudança atual | Matriz de cenários | Sim |
| candidata × release anterior | Segurança para o usuário da release | Política versionada | Sim |
| baseline × release anterior | Diagnóstico de deriva da referência | Nenhum | Não diretamente |

Cada cenário usa delta relativo:

```text
delta = ((subject / reference) - 1) * 100
```

Os agregados globais e por categoria mantêm os pesos da matriz. Um agregado positivo nunca apaga
uma violação individual: o veredito é `fail` quando qualquer comparação obrigatória ultrapassa o
threshold de um cenário.

Cada regressão informa comparação, cenário, categoria, papel de referência, delta observado e
limite. O relatório também conserva todos os valores, pesos, versões, seeds e digests usados.

## Determinismo

Política, matriz e resultados são canonicalizados antes do cálculo. Cenários e sobrescritas seguem
a ordem canônica da matriz; comparações usam uma ordem fixa. Não há timestamps nem duração de
processo no relatório. As mesmas entradas produzem bytes idênticos, independentemente da ordem
física dos objetos e medições nos arquivos.

## Fixtures e comandos

```powershell
npm run regression:check
npm run regression:test
```

As fixtures neutras comprovam três casos:

- candidata aceita nas duas comparações obrigatórias;
- candidata com regressão isolada contra a baseline, bloqueada pelo guardrail da matriz;
- candidata saudável contra a baseline, mas bloqueada contra uma release anterior mais forte.

As métricas são sintéticas e servem somente para testar o contrato. Elas não representam DPS real,
Enhancement ou validação dentro do World of Warcraft.

## Fronteiras futuras

O runner da LAB-001 e os planos da LAB-004 poderão alimentar estes resultados quando houver uma
baseline real de spec. Persistência histórica, execução em lote, promoção automática, release e
integração in-game permanecem fora da LAB-006.
