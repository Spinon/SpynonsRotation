# Governança do project board

`project-board.json` é a única fonte canônica de estado do projeto. `docs/project/STATUS.md` é uma visão gerada e nunca deve ser editada manualmente.

## Schema v1

O contrato estrutural está em [`project-board.schema.json`](project-board.schema.json). O validador executável também aplica invariantes que JSON Schema não consegue expressar sozinho, como IDs únicos, dependências concluídas e coerência do foco.

Campos essenciais de uma task:

- `id`: identificador estável no formato `LANE-001`;
- `status`: estado do lifecycle;
- `source`: documento que autoriza e delimita a task;
- `nextAction`: próximo passo concreto, ou `null` quando concluída;
- `dependencies`: tasks que precisam estar `done` antes do trabalho;
- `acceptanceCriteria`: resultados verificáveis;
- `evidence`: comandos, arquivos, commits ou resultados que comprovam a conclusão.

## Lifecycle

```text
planned ──────> in_progress ──────> done
   │                  │
   └────> blocked <───┘
              │
              └────> planned | in_progress
```

Transições permitidas:

| Origem | Destinos permitidos |
| --- | --- |
| `planned` | `planned`, `in_progress`, `blocked` |
| `in_progress` | `in_progress`, `blocked`, `done` |
| `blocked` | `blocked`, `planned`, `in_progress` |
| `done` | `done` |

Uma task concluída é imutável no lifecycle. Reabertura exige uma nova task que referencia a evidência anterior; isso preserva o histórico.

## Invariantes da fila

- `currentFocus` sempre aponta para uma task existente e não concluída.
- No máximo uma task pode estar `in_progress`, e ela deve ser o `currentFocus`.
- Uma task ativa, concluída ou selecionada como foco só pode depender de tasks `done`.
- Tasks novas começam como `planned`.
- Nenhuma task é removida em uma transição comum.
- Mudança de status atualiza `item.updatedAt`; qualquer mudança no board atualiza `board.updatedAt`.
- `done` exige ao menos uma evidência não vazia e `nextAction: null`.
- O foco só deixa uma task `in_progress` depois que ela fica `done` ou `blocked`.

## Ciclo operacional

1. Sincronizar com `npm run project:sync`.
2. Ler `currentFocus` e a fonte da task.
3. Mudar a task de `planned` para `in_progress`, atualizar timestamps e gerar STATUS.
4. Fazer commit e push do início da task.
5. Implementar somente o escopo autorizado.
6. Executar `npm test` e checks proporcionais.
7. Registrar evidências, mudar a task para `done`, selecionar o próximo foco e gerar STATUS.
8. Executar `npm run project:check`, commit e push.

O commit de início torna a transição verificável contra `HEAD`. `project:check` compara o board em trabalho ao board do commit atual e rejeita saltos inválidos.

## Evidência aceitável

Evidência deve permitir reprodução ou inspeção. Exemplos:

- comando e resultado: `npm run project:test — todos os testes aprovados`;
- arquivo: `docs/project/project-board.schema.json`;
- commit publicado;
- relatório ou fixture determinística;
- screenshot ou checklist quando a aceitação for visual/in-game.

Frases como “parece funcionar” ou “implementado” não são evidência suficiente.

## Bloqueios

Uma task `blocked` mantém uma `nextAction` concreta para desbloqueio e registra a causa em evidência ou no documento-fonte. O foco pode permanecer nela para acompanhamento ou avançar para outra task elegível. Não se marca `done` para contornar um bloqueio.

## Migrações

Alterações incompatíveis exigem:

1. incrementar `schemaVersion`;
2. adicionar um schema versionado;
3. criar migração determinística da versão anterior;
4. manter fixtures pré e pós-migração;
5. validar que nenhuma task, dependência ou evidência foi perdida;
6. registrar a migração como task própria.

O schema v1 não possui migrações anteriores. Mudanças aditivas opcionais podem permanecer na mesma versão somente quando boards v1 existentes continuarem válidos.

## Comandos

```powershell
npm run project:test
npm run project:status
npm run project:check
npm run project:sync
```

`project:sync` aceita somente fast-forward automático. Divergência ou branch atrasada com working tree sujo interrompe o fluxo.
