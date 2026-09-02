# Compiler SimC ↔ DSL ↔ runtime

O compilador conecta a pesquisa em SimulationCraft à Rotation DSL v1 e aos dados que o futuro
Recommendation Engine poderá consumir. O pipeline é genérico: nomes de actions, sinais de estado e
capabilities pertencem a um mapa de integração, nunca ao código do compilador.

```text
APL SimC suportada ──import──> DSL v1 canônica ──compile──> runtime JSON/Lua
         ▲                          │
         └──────── export ──────────┘
```

## Subconjunto SimC reversível

O importador reconhece linhas:

```text
actions=/action
actions+=/action,if=condition
actions.list_name=/action
actions.list_name+=/action,if=condition
```

Linhas de configuração e comentários que não começam com `actions` são ignorados. Dentro de uma
action, a v1 aceita apenas o modifier `if`. Condições aceitam:

- números e sinais presentes no mapa;
- `!`, `&`, `|` e parênteses;
- `=`, `!=`, `<`, `<=`, `>` e `>=`.

Essa estrutura acompanha a definição oficial de action lists como listas ordenadas de prioridade e
o uso de `if=` para condições. Consulte [ActionLists](https://github.com/simulationcraft/simc/wiki/ActionLists)
e [Action List Conditional Expressions](https://github.com/simulationcraft/simc/wiki/Action-List-Conditional-Expressions).

Aritmética, funções, variáveis, target selection, sequências e chamadas de sublistas são rejeitadas.
O compilador nunca remove silenciosamente um modifier para fazer uma linha “caber” na DSL.

## Mapa de integração

Arquivos `.compiler-map.json` definem a identidade do documento, o passo de prioridade e relações
bidirecionais:

```json
{
  "schemaVersion": 1,
  "document": {
    "id": "neutral.compiler_fixture",
    "version": "1.0.0",
    "entrypoint": "default",
    "priorityStep": 10
  },
  "actions": [
    { "simc": "neutral_strike", "dsl": "neutral.strike" }
  ],
  "states": [
    {
      "simc": "cooldown.neutral_strike.ready",
      "path": ["cooldowns", "neutral.strike", "ready"],
      "capability": "ADDON_AVAILABLE"
    }
  ]
}
```

Aliases duplicados, caminhos duplicados ou capabilities inválidas tornam o mapa inteiro inválido.
Na importação, prioridades são atribuídas em passos fixos e IDs de regra são derivados de forma
estável da lista, action e ocorrência.

## Bundle de runtime

O bundle inclui a identidade e o SHA-256 da DSL canônica. Cada condição é reduzida a um programa
postfix, mantendo a ordem determinística:

| Instrução | Papel |
| --- | --- |
| `PUSH_LITERAL` | coloca constante na pilha |
| `READ_STATE` | lê um caminho com capability explícita |
| `HAS_STATE` | testa disponibilidade de um caminho |
| `TRUTHY` / `NOT` | aplica operação booleana |
| `COMPARE` | compara os dois valores do topo |
| `ALL` / `ANY` | agrega uma quantidade explícita de condições |

Regras `ADDON_AVAILABLE` entram diretamente. Regras `CONDITIONALLY_SECRET` entram somente com
`onUnavailable: "skip_rule"`, já garantido pelo validador da DSL. Regras `SIM_ONLY` não entram nas
listas executáveis; aparecem em `excludedRules` com lista, regra, action e motivo.

O mesmo bundle é serializado em JSON e em uma tabela Lua compatível com Lua 5.1. A saída Lua ainda
não é carregada pelo addon; essa integração pertence ao runtime e ao módulo de spec futuros.

## Golden files

A fixture neutra em `rotation-lab/fixtures/compiler/neutral/` contém:

- baseline SimC de entrada;
- mapa de integração;
- DSL esperada;
- SimC normalizado esperado;
- runtime JSON e Lua esperados;
- manifesto `.compiler-fixture.json` que relaciona os arquivos.

```powershell
npm run compiler:check
npm run compiler:check -- --fixture caminho/arquivo.compiler-fixture.json
npm run compiler:test
```

`compiler:check` reconstrói todos os artefatos e compara o conteúdo linha a linha. Uma divergência
informa o artefato, a primeira linha diferente, o valor esperado e o valor atual; o comando não
reescreve goldens automaticamente.

## Limites atuais

A fixture comprova o pipeline, não uma rotação real nem um perfil executável do SimulationCraft.
A baseline de Enhancement será curada em `ENH-002`, depois do catálogo da spec. Novas construções
SimC só devem entrar quando puderem ser representadas sem perda e cobertas por round-trip e golden
files.
