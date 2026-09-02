# CORE-001 — Contratos genéricos

## Objetivo

Definir os contratos mínimos que permitem ao runtime representar estado, ações e recomendações sem conhecer Shaman Enhancement ou qualquer outra spec concreta.

## Contratos iniciais

- `Action`;
- `Recommendation`;
- `PlayerState`;
- `CombatContext`;
- `SpecModule`;
- `Capability`.

## Escopo

- definir estruturas, invariantes e ownership de cada contrato;
- escolher representações compatíveis com Lua 5.1 e o runtime do WoW;
- separar dados de runtime de dados exclusivos do Rotation Lab;
- criar testes unitários offline;
- documentar como módulos de spec consomem e produzem esses contratos.

## Fora do escopo

- registry de classes/specs (`CORE-002`);
- chamadas reais da API Blizzard (`CORE-004`);
- catálogo ou regras de Enhancement;
- recommendation engine;
- UI.

## Critérios de aceite

- os seis contratos iniciais possuem invariantes documentadas e testes;
- nenhum arquivo genérico contém condição específica de Enhancement;
- `Recommendation` referencia `Action` sem acoplar a UI a uma classe/spec;
- capabilities distinguem `ADDON_AVAILABLE`, `SIM_ONLY` e `CONDITIONALLY_SECRET`;
- `npm test` permanece verde.
