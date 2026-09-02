# Optimizer do Rotation Lab

O optimizer pesquisa variantes limitadas de uma Rotation DSL sem conhecer classes, specs ou o
processo usado para medir desempenho. A v1 implementa beam search determinístico sobre um catálogo
explícito de mutações e delega medições a um `evaluator` injetável.

```text
baseline + configuração + matriz
               │
               ▼
       screening de baixo custo
        │ gera │ mede │ filtra
               ▼
          beam limitado
               │
               ▼
       finalistas reavaliados
               │
               ▼
  candidata elegível melhor que baseline
       ou baseline preservada
```

O optimizer não executa SimulationCraft. A futura orquestração poderá implementar o mesmo contrato
de evaluator usando os planos da matriz, sem alterar o algoritmo de busca.

## Configuração

Arquivos `.optimizer.json` declaram identidade, alvos, limites, budgets e mutações:

```json
{
  "schemaVersion": 1,
  "id": "neutral.optimizer_fixture",
  "version": "1.0.0",
  "targets": {
    "rotationId": "neutral.compiler_fixture",
    "rotationVersion": "1.0.0",
    "matrixId": "neutral.initial_matrix",
    "matrixVersion": "1.0.0"
  },
  "limits": {
    "maxDepth": 2,
    "beamWidth": 2,
    "maxCandidates": 6,
    "finalists": 2
  },
  "budgets": {
    "screeningIterations": 100,
    "finalistIterations": 5000
  },
  "mutations": []
}
```

O budget de finalist deve ser maior que o de screening. Os limites têm tetos estruturais e são
aplicados pelo algoritmo; não são sugestões para o evaluator.

## Mutações suportadas

A v1 aceita somente operações declaradas e reversíveis na estrutura existente:

- `swap_rules`: troca as prioridades de duas regras da mesma lista;
- `set_numeric_literal`: altera um literal numérico alcançado por `valuePath` dentro de `when`.

Cada mutação é aplicada a uma cópia canônica e a DSL inteira é validada novamente. Lista, regra,
caminho ou tipo incorretos falham com diagnóstico. A mesma mutação não pode reaparecer numa
linhagem. Se caminhos diferentes produzirem o mesmo documento, o SHA-256 elimina a duplicata antes
da avaliação.

A v1 não cria actions, estados, capabilities, condições ou fallbacks. Ampliar o espaço exige um
novo tipo explícito de mutação com validação e testes próprios.

## Busca e reprodutibilidade

Em cada profundidade, o algoritmo:

1. combina o beam atual com as mutações ainda não usadas;
2. valida e calcula o digest de cada documento;
3. remove baseline, documentos já vistos e duplicatas da geração;
4. avalia no máximo o orçamento restante de `maxCandidates`;
5. descarta resultados bloqueados por guardrail;
6. mantém no máximo `beamWidth` candidatas pela fitness, quantidade de mutações e digest.

Mutações e candidatos são ordenados canonicamente. Empates usam o digest completo. Não há
aleatoriedade na v1; entradas e métricas iguais produzem relatório byte a byte igual mesmo se a
ordem física das mutações mudar.

## Contrato do evaluator

O callback recebe a DSL congelada e um contexto com:

- fase `screening` ou `finalist`;
- budget de iterações obrigatório;
- digest completo da candidata;
- profundidade e sequência de mutações;
- indicação explícita de baseline.

Ele devolve exatamente uma métrica positiva por cenário, além da identidade da matriz, fase,
budget e digest recebidos. Qualquer divergência interrompe a busca. A baseline é medida uma vez em
cada fase, e toda candidata é comparada somente com a baseline da mesma fase pelo fitness da
[matriz de cenários](SCENARIOS.md).

Resultados inelegíveis não entram no beam. Os melhores resultados elegíveis do screening são
medidos novamente em finalist; a pontuação de triagem nunca seleciona diretamente o vencedor. Se
nenhum finalista tiver ganho elegível e estritamente positivo, a baseline vence com fitness zero.

## Relatório

O relatório registra:

- IDs, versões e SHA-256 da configuração, baseline e matriz;
- limites e budgets efetivos;
- tentativas, deduplicações, candidatas e beam de cada geração;
- fitness, digest de métricas e violações por candidata;
- ranking separado de screening e finalist;
- documento DSL da baseline ou candidata vencedora.

Ele não contém duração de processo ou timestamps voláteis, preservando serialização determinística.

## Fixture e comandos

```powershell
npm run optimizer:check
npm run optimizer:test
```

A fixture neutra usa métricas sintéticas tabeladas. Ela limita a busca a seis candidatas, demonstra
deduplicação, leva duas candidatas à reavaliação, rejeita uma delas por guardrail e seleciona a
outra com fitness sintético de `+1,8%`. Esses números testam o algoritmo; não representam DPS,
Enhancement ou recomendação de produto.

## Fronteiras futuras

`LAB-006` conectará execução comparativa e relatórios de regressão. `ENH-002` fornecerá a primeira
baseline real. Tournament, evolutionary search, aleatoriedade e promoção automática permanecem
fora desta versão.
