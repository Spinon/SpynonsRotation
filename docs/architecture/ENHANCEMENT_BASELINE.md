# Baseline APL de Enhancement

`enhancement.simc_baseline@12.1.0-1` preserva a APL padrão de Enhancement Shaman do
SimulationCraft e separa claramente três coisas: a fonte upstream imutável, a decisão de auditoria
de cada linha e o subconjunto reversível que a Rotation DSL v1 consegue representar sem mudar o
sentido da regra.

Essa baseline é um ponto de partida de pesquisa. Ela não afirma que as prioridades estão aprovadas
para uso no addon e não substitui a curadoria por cenário das ENH-003 e ENH-004.

## Proveniência fixada

- SimulationCraft `1210.01` no commit
  [`f86979165c9b952e41d8cb6119065d3f6272abee`](https://github.com/simulationcraft/simc/tree/f86979165c9b952e41d8cb6119065d3f6272abee);
- arquivo upstream
  [`ActionPriorityLists/default/shaman_enhancement.simc`](https://github.com/simulationcraft/simc/blob/f86979165c9b952e41d8cb6119065d3f6272abee/ActionPriorityLists/default/shaman_enhancement.simc);
- Git blob `dfa27f6c44c4de98f76305af0be076f6a90da3df`;
- conteúdo bruto com `11153` bytes e SHA-256
  `783560B572B81F0373932AD91579C82130341D23A4FC60809576A4BE14D7D77E`;
- alvo WoW Retail `12.1.0.69587`, interface `120100`.

O arquivo `upstream.simc` é preservado byte a byte. O verificador recusa qualquer alteração de
conteúdo, tamanho, hash ou quantidade de linhas de ação.

## Contabilidade da importação

| Decisão | Linhas | Resultado |
|---|---:|---|
| Normalizadas | 64 | DSL, SimC canônico e bundles JSON/Lua |
| Somente na fonte | 49 | Mantidas na auditoria com motivo e capability |
| Total upstream | 113 | Toda linha aparece exatamente uma vez |

As 64 regras normalizadas cobrem `precombat`, `single_sb`, `single_totemic` e `aoe`. A lista
`single_sb` é o entrypoint técnico da baseline; seleção automática de contexto e Hero Tree não faz
parte desta task.

Uma linha permanece somente na fonte quando usa action fora do catálogo, controle de fluxo,
aritmética ainda ausente da DSL v1, estado não catalogado ou sem contrato, ou semântica SimC que
não possui equivalência comprovada. A auditoria não remove condições, não inventa aproximações e
não reordena prioridades.

## Capabilities

Na parte normalizada, talentos e tempo decorrido de combate são `ADDON_AVAILABLE`. Leituras de
aura, cooldown e Maelstrom Weapon são conservadoramente `CONDITIONALLY_SECRET`, sempre com
`onUnavailable: "skip_rule"` no bundle.

Treze linhas upstream exigem informação impossível no addon e são `SIM_ONLY`:

- 10 usam conhecimento futuro de duração do combate por `fight_remains`;
- 2 usam o modelo de dano interno do SimulationCraft;
- 1 agenda uma ação de pré-combate por tempo de simulação.

Essas linhas ficam na fonte e na auditoria, mas não entram na fonte normalizada. O compilador
também verifica de forma genérica que qualquer regra `SIM_ONLY` existente na DSL seja listada como
exclusão e não apareça entre as regras do runtime.

## Artefatos e ownership

```text
upstream.simc + provenance.json
              + audit.json ──> normalized.simc
                                  + enhancement.compiler-map.json
                                      ├─> baseline.rotation.json
                                      ├─> baseline.normalized.simc
                                      ├─> baseline.runtime.json
                                      └─> baseline.runtime.lua
```

Todos os arquivos pertencem a `specs/shaman/enhancement/baseline/`. Os quatro artefatos `baseline.*`
são gerados mecanicamente e comparados byte a byte. O Lua ainda é dado de pesquisa: ele não é
carregado pelo `.toc`, não lê APIs do WoW e não altera `SpecModule.getRules`. A integração com
estado e avaliação pertence às tasks de runtime.

## Comandos

```powershell
npm run enhancement:baseline-generate
npm run enhancement:baseline-check
npm run enhancement:test
```

`baseline-generate` recompila os quatro derivados. `baseline-check` valida proveniência, cobertura
da auditoria, vínculo com o catálogo, capabilities, linhagem até o bundle e paridade dos goldens.
São verificações offline; nenhuma delas constitui validação dentro do cliente World of Warcraft.
