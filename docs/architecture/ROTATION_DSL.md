# Rotation DSL v1

A Rotation DSL é a representação intermediária declarativa entre pesquisa, compilação e runtime.
Ela descreve **o que** uma rotação prioriza sem carregar código, chamar APIs do WoW ou conhecer
SimulationCraft. A v1 usa JSON com extensão `.rotation.json`.

## Documento

```json
{
  "schemaVersion": 1,
  "id": "neutral.training_rotation",
  "version": "1.0.0",
  "entrypoint": "default",
  "lists": [
    {
      "id": "default",
      "rules": [
        {
          "id": "neutral.ready_strike",
          "priority": 10,
          "action": "neutral.strike",
          "capability": "ADDON_AVAILABLE",
          "when": { "kind": "constant", "value": true }
        }
      ]
    }
  ]
}
```

- `schemaVersion` seleciona o contrato estrutural; a única versão aceita nesta task é `1`;
- `id`, IDs de regras e ações são namespaced e independentes de classe/spec;
- `version` usa SemVer e versiona o conteúdo da rotação, não o schema;
- `entrypoint` referencia uma das listas nomeadas;
- `priority` é positiva e única dentro da lista; número menor executa primeiro;
- IDs de regra são únicos no documento inteiro;
- ordem física de listas e regras não altera o resultado canônico.

O parser rejeita campos desconhecidos em todos os níveis. Assim, um erro de digitação não vira uma
regra silenciosamente ignorada.

## Condições

Condições formam uma árvore limitada em profundidade e quantidade de nós:

| `kind` | Conteúdo | Resultado |
| --- | --- | --- |
| `constant` | `value` booleano | constante |
| `all` / `any` | `conditions[]` | composição lógica |
| `not` | `condition` | negação |
| `compare` | `operator`, `left`, `right` | comparação de valores |
| `truthy` | `value` | teste booleano futuro |
| `exists` | leitura `state` | presença futura do sinal |

Operadores de comparação: `eq`, `ne`, `lt`, `lte`, `gt` e `gte`.

Valores são `literal` ou `state`. Um literal aceita apenas valores JSON primitivos. Uma leitura de
estado usa um caminho segmentado, evitando ambiguidade entre estrutura e IDs namespaced:

```json
{
  "kind": "state",
  "path": ["cooldowns", "neutral.strike", "ready"],
  "capability": "ADDON_AVAILABLE"
}
```

A v1 não define aritmética, funções, variáveis, avaliação ou chamadas entre listas. Extensões desse
tipo exigem evolução explícita do schema ou do compilador, não campos livres.

## Capabilities e segurança

Cada leitura `state` declara exatamente uma capability do Core:

- `ADDON_AVAILABLE`: diretamente observável e elegível ao runtime;
- `CONDITIONALLY_SECRET`: pode ficar protegido ou indisponível;
- `SIM_ONLY`: existe apenas no ambiente de simulação.

A capability da regra é derivada pela condição com a precedência
`SIM_ONLY > CONDITIONALLY_SECRET > ADDON_AVAILABLE` e deve coincidir com o valor declarado.
Regras `CONDITIONALLY_SECRET` também exigem `onUnavailable: "skip_rule"`; nenhuma conversão ou
inferência de valor protegido é permitida. Regras `SIM_ONLY` permanecem no modelo para pesquisa,
mas a futura compilação de runtime deve excluí-las.

A capability da ação será cruzada com o catálogo pelo compilador da `LAB-003`. A LAB-002 valida
somente a proveniência da condição, pois a DSL não possui ou duplica o catálogo de ações.

## Parser e validação

```powershell
npm run dsl:check
npm run dsl:check -- --file caminho/rotacao.rotation.json
npm run dsl:check -- --file caminho/rotacao.rotation.json --canonical
```

O carregador aceita somente `.rotation.json` dentro do repositório, inclusive após resolver links,
e limita documentos a 1 MiB. A validação coleta até 100 problemas com caminhos como
`$.lists[0].rules[1].capability`. Quando válido, o parser devolve uma cópia congelada, com listas
ordenadas por ID e regras ordenadas por prioridade.

A fixture [`neutral-priority.rotation.json`](../../rotation-lab/fixtures/neutral-priority.rotation.json)
demonstra todas as formas de condição e as três capabilities sem representar uma rotação real.

## Fronteira com as próximas tasks

`LAB-003` traduz o subconjunto reversível SimC ↔ DSL e gera bundles determinísticos, conforme
[`COMPILER.md`](COMPILER.md). O cruzamento definitivo com o catálogo e a avaliação das regras ficam
nas tasks de spec e runtime. `LAB-004` definirá contextos e cenários; nenhum desses comportamentos é
implementado pelo parser v1.
