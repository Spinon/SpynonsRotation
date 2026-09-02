# CORE-003 — Detecção de spec e talentos

## Objetivo

Compor `Compat` e o registry para produzir um snapshot determinístico da especialização e dos talentos realmente ativos no personagem, sem lógica específica de classe/spec.

## Escopo

- identificar a specialization ativa e localizar seu `SpecModule` no registry;
- ler o config ativo, árvore de classe/spec e Hero Talent SubTree;
- percorrer nodes, entries, definitions, seleções e ranks efetivamente alocados;
- normalizar somente IDs e metadados necessários aos consumidores genéricos;
- excluir abilities e regras sem talento disponível ou rank ativo;
- representar dados ainda não inicializados, ausentes ou inacessíveis de forma explícita;
- produzir fixtures neutras para árvore simples, choice node, ranks e hero tree;
- documentar os eventos que futuramente deverão invalidar o snapshot.

## Fora do escopo

- chamar APIs Blizzard fora de `addon/Compat/`;
- implementar catálogo ou regras de Enhancement;
- manter atualização incremental/event-driven do `PlayerState` (`RUN-001`);
- avaliar prioridades ou produzir `Recommendation`;
- interpretar a árvore como preset externo;
- declarar validação no cliente Retail.

## Critérios de aceite

- spec, classe, config, trees, hero tree, nodes, entries e ranks ativos são normalizados;
- o módulo correspondente é obtido pelo registry sem condição específica de classe;
- talentos ausentes não aparecem como abilities disponíveis;
- choice nodes preservam somente a seleção ativa;
- dados incompletos ou indisponíveis produzem estado explícito e fallback seguro;
- fixtures cobrem inicialização pendente, spec não registrada e árvore válida;
- todos os acessos ao cliente passam por `Compat`;
- `npm test` permanece verde.
