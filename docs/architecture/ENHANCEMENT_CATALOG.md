# Catálogo Enhancement

`shaman.enhancement@12.1.0-1` é o primeiro módulo real de spec. Ele contém o vocabulário
observável que as próximas tasks poderão usar, mas não define uma APL, prioridades ou decisões de
combate.

## Recorte versionado

| Grupo | Quantidade | Conteúdo |
|---|---:|---|
| Actions | 18 | Spells que podem se tornar recomendações |
| Talents | 79 | 40 de spec, 4 de classe e 35 Hero Talents |
| Hero Trees | 2 | Stormbringer e Totemic, com SubTree e entry de seleção |
| Resources | 2 | Mana e Maelstrom Weapon |
| Auras | 10 | Estados próprios ou de alvo que alteram decisões futuras |

O recorte de talentos de classe não tenta duplicar a árvore inteira de Shaman: registra somente
entries de classe que pertencem ao vocabulário curado desta spec. O conjunto de ações também não é
uma cópia do spellbook. Spells disparados automaticamente, como a explosão de Fire Nova, não são
tratados como botões recomendáveis.

## Ownership

```text
specs/shaman/enhancement/catalog.json
  ├─ schema e referências ──> specs/shaman/enhancement/catalog.mjs
  ├─ verificação DBC ───────> specs/shaman/enhancement/simc.mjs
  └─ projeção determinística > addon/Classes/Shaman/Enhancement/CatalogData.lua
                                  └─ Module.lua ──> SpecRegistry
```

- `catalog.json` é a fonte canônica editável;
- `CatalogData.lua` é um derivado e não deve ser editado manualmente;
- `Module.lua` pertence exclusivamente à spec e converte definições em `Action` genérica;
- Core, Compat, UI e outras specs não importam o catálogo;
- o módulo registra `classId=7`, `specId=263` e ainda retorna `getRules() = {}` porque a baseline
  da ENH-002 é dado de pesquisa; o contrato de avaliação e sua integração pertencem ao runtime.

## Disponibilidade

Cada ação e aura pode declarar quatro filtros observáveis:

- `requiredTalentSpellIds`: todos precisam existir em `snapshot.activeSpellRanks` com rank positivo;
- `anyTalentSpellIds`: pelo menos um precisa estar ativo;
- `forbiddenTalentSpellIds`: nenhum pode estar ativo;
- `heroTreeId`: `snapshot.heroTree.id` precisa corresponder à SubTree catalogada.

Ausência ou malformação do snapshot nunca habilita uma ação condicionada. Ações básicas continuam
disponíveis. Assim:

- `Voltaic Blaze` entra e `Flame Shock` sai quando o talento `470057` está ativo;
- `Tempest` exige o talento `454009` e a Hero Tree Stormbringer (`55`);
- `Surging Totem` exige o talento `455630` e a Hero Tree Totemic (`54`);
- `Windstrike` existe no vocabulário quando Ascendance direta ou Deeply Rooted Elements está ativo.

Esses filtros respondem somente se uma action pertence ao loadout. Cooldown, custo, aura ativa e
prioridade continuam fora desta task.

## Recursos e auras

Mana é o power type nativo `0`. Maelstrom Weapon não é modelado como um segundo power: é a aura
`344179`, observada como uma mecânica de até 10 stacks. Essa separação impede que o runtime futuro
leia Maelstrom Weapon pela API errada.

As auras registram também a unidade de observação (`player` ou `target`) e a mesma disponibilidade
por loadout usada pelas ações. Toda leitura futura do cliente deverá atravessar `addon/Compat/`.
No caso de Flame Shock, o catálogo preserva o botão Enhancement `470411` separado da aura de alvo
`188389`; Voltaic Blaze substitui o botão, mas continua aplicando a aura catalogada.

## Fontes e verificação

O catálogo está fixado em:

- WoW Retail `12.1.0.69587`, interface `120100`;
- SimulationCraft `1210.01`, engine
  [`f86979165c9b952e41d8cb6119065d3f6272abee`](https://github.com/simulationcraft/simc/tree/f86979165c9b952e41d8cb6119065d3f6272abee);
- DBC Live com hotfix de `2026-09-01`, conforme identidade emitida pelo binário pinado;
- contexto de design e balance das notas oficiais de
  [desenvolvimento 12.1](https://us.forums.blizzard.com/en/wow/t/midnight-curse-of-ulatek-ptr-development-notes/2317811/6)
  e dos [hotfixes de Midnight](https://us.forums.blizzard.com/en/wow/t/world-of-warcraft-midnight-hotfixes-september-1/2336376).

`npm run enhancement:simc-check` valida o SHA-256 do executável antes de consultar o DBC. Para cada
talento, compara nome, entry, node, definition, árvore, rank máximo, spell, SubTree e índice de
seleção. Para actions e auras, compara spell ID e nome. Respostas vazias ocasionais do modo query do
SimC recebem no máximo três tentativas; conteúdo válido divergente continua sendo erro.

As notas da Blizzard dão contexto de versão, mas não substituem a verificação técnica do DBC.

## Atualização segura

1. atualize os pins do repositório em task própria quando mudar build ou engine;
2. atualize `sources` e os registros afetados em `catalog.json`;
3. execute `npm run enhancement:generate`;
4. execute `npm run enhancement:check` e `npm run enhancement:simc-check`;
5. execute `npm run enhancement:test`, `npm run core:test` e `npm test`;
6. registre separadamente qualquer validação realizada no cliente Retail.

`enhancement:check` é offline e prova schema, referências e paridade do Lua. `simc-check` consulta o
DBC local pinado. Nenhum dos dois constitui validação dentro do World of Warcraft.

A APL versionada que consome este catálogo e suas fronteiras de runtime estão documentadas em
[`ENHANCEMENT_BASELINE.md`](ENHANCEMENT_BASELINE.md).
