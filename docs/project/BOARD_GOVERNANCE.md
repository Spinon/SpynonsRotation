# Governança do project board

`project-board.json` é a única fonte canônica de estado do projeto. Ele pode coordenar mais de uma trilha sem criar filas concorrentes fora do board. `docs/project/STATUS.md` é uma visão gerada e nunca deve ser editada manualmente.

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

Campos de trilha:

- `currentFocus`: foco da trilha principal de entrega técnica;
- `parallelFocus`: mapa opcional de trilhas paralelas autorizadas para seus focos atuais;
- `track`: trilha de uma task; quando ausente, assume `delivery`.

`parallelFocus.ui` coordena direção visual, mockups, especificações e produção de assets. A trilha `ui` não libera implementação antecipada no addon: código de runtime continua sujeito às tasks e dependências da trilha `delivery`.

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

## Invariantes das trilhas

- `currentFocus` sempre aponta para uma task existente, não concluída e pertencente a `delivery`.
- Cada entrada de `parallelFocus` aponta para uma task existente, não concluída e pertencente à mesma trilha indicada pela chave.
- No máximo uma task pode estar `in_progress` por trilha, e ela deve ser o foco daquela trilha.
- Uma task ativa, concluída ou selecionada como foco só pode depender de tasks `done`.
- Dependências podem atravessar trilhas e continuam obrigatórias.
- Tasks novas começam como `planned`.
- Nenhuma task é removida em uma transição comum.
- Mudança de status atualiza `item.updatedAt`; qualquer mudança no board atualiza `board.updatedAt`.
- `done` exige ao menos uma evidência não vazia e `nextAction: null`.
- O foco de uma trilha só deixa uma task `in_progress` depois que ela fica `done` ou `blocked`.

## Ciclo operacional

1. Sincronizar com `npm run project:sync`.
2. Ler o foco da trilha aplicável e a fonte da task.
3. Mudar a task de `planned` para `in_progress`, atualizar timestamps e gerar STATUS.
4. Fazer commit e push do início da task.
5. Implementar somente o escopo autorizado.
6. Executar `npm test` e checks proporcionais.
7. Registrar evidências, mudar a task para `done`, selecionar o próximo foco da mesma trilha e gerar STATUS.
8. Executar `npm run project:check`, commit e push.

O commit de início torna a transição verificável contra `HEAD`. `project:check` compara o board em trabalho ao board do commit atual e rejeita saltos inválidos em qualquer trilha.

## Trabalho paralelo

Trilhas paralelas existem para trabalhos realmente independentes. A trilha inicial autorizada é `ui`.

Pode avançar em `ui` sem aguardar toda a engine:

- direção visual e mockups;
- especificação dos componentes;
- arte final e estados visuais;
- preparação técnica de assets que não altera o runtime.

Continua na trilha `delivery` e exige dependências técnicas concluídas:

- implementação Lua da UI;
- consumo de `Recommendation`;
- integração com estado, cooldowns e APIs do WoW;
- validação em cliente Retail.

Arquivos sobrepostos entre trilhas exigem coordenação explícita. Uma trilha nunca amplia silenciosamente o escopo da outra.

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

O schema v1 não possui migrações anteriores. `parallelFocus` e `task.track` são extensões opcionais e retrocompatíveis: boards v1 sem esses campos continuam representando uma única trilha `delivery`. Outras mudanças aditivas opcionais podem permanecer na mesma versão somente quando boards v1 existentes continuarem válidos.

## Comandos

```powershell
npm run project:test
npm run project:status
npm run project:check
npm run project:sync
```

`project:sync` aceita somente fast-forward automático. Divergência ou branch atrasada com working tree sujo interrompe o fluxo.
