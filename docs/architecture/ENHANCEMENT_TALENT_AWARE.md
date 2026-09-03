# Matriz talent-aware de Enhancement

`enhancement.talent_matrix@12.1.0-1` prova que a baseline pode ser especializada para o snapshot
genérico produzido pela CORE-003 sem introduzir lógica de Enhancement no Core. O resultado ainda é
dado versionado do Rotation Lab; sua integração com a engine de recomendações pertence à RUN-002.

## Fontes e extração

A matriz usa os perfis oficiais MID2 Stormbringer e Totemic do SimulationCraft no commit pinado. O
perfil Totemic já era preservado pela ENH-003; a ENH-005 acrescenta o perfil Stormbringer e registra
para ambos tamanho, SHA-256, Git blob, talent string e URL imutável.

`enhancement:talent-generate` executa uma simulação mínima de um segundo com o binário cujo hash é
validado pela toolchain. O log de inicialização fornece entry, node e rank selecionados. A extração
mapeia esses IDs ao catálogo e produz o mesmo formato lógico de `activeSpellRanks` definido pela
CORE-003.

O SimC pode enumerar uma entry de Hero Talent que não pertence à SubTree ativa. Essas entries são
registradas como `INACTIVE_HERO_TREE`, mas nunca entram em `activeSpellRanks`. A SubTree ativada e a
entry de seleção também precisam corresponder ao perfil antes de qualquer artefato ser aceito.

## Especialização estática

Para cada build, a matriz seleciona:

| Hero Tree | Single target | Multi-target |
| --- | --- | --- |
| Stormbringer | `single_sb` | `aoe` |
| Totemic | `single_totemic` | `aoe` |

Antes de preservar uma regra, o compilador específico da spec aplica os filtros de disponibilidade
já declarados no catálogo:

- todos os `requiredTalentSpellIds` precisam estar ativos;
- ao menos um `anyTalentSpellIds` precisa estar ativo;
- nenhum `forbiddenTalentSpellIds` pode estar ativo;
- `heroTreeId` precisa coincidir com a SubTree do snapshot.

Depois, somente condições baseadas em `talents.<id>.enabled` são reduzidas. Condições de aura,
cooldown, recurso e combate permanecem dinâmicas e mantêm suas capabilities e fallbacks originais.
Uma regra é excluída quando sua ação não existe na build ou quando sua condição se torna
estaticamente falsa. A prioridade relativa das regras restantes não muda.

## Artefatos

- `study.json`: fontes, builds, listas e probes negativos autorizados;
- `snapshots.json`: talentos catalogados extraídos dos dois perfis;
- `matrix.json`: ações e regras especializadas por build e contexto, com cada exclusão explicada;
- `profiles/stormbringer.simc`: fonte oficial Stormbringer preservada byte a byte.

Os probes removem isoladamente Tempest, Surging Totem e Voltaic Blaze. Eles demonstram tanto a
remoção da ação incompatível quanto o retorno de Flame Shock quando Voltaic Blaze deixa de
substituí-la. Probes são controles de disponibilidade, não presets recomendados ou loadouts válidos.

`enhancement:talent-check` repete a extração com o SimC pinado e compara snapshots e matriz byte a
byte. É uma validação offline; não constitui teste dentro do cliente World of Warcraft.
