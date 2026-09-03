# Curadoria single-target de Enhancement

Este diretório contém a evidência reproduzível da ENH-003. Ele não altera o runtime do addon e não
representa validação dentro do cliente World of Warcraft.

## Fontes e espaço de busca

`upstream-profile.simc` preserva byte a byte o perfil oficial
`MID2_Shaman_Enhancement_Totemic.simc` do SimulationCraft no commit pinado. `study.json` fixa seus
hashes, a baseline DSL da ENH-002, a matriz da LAB-004, sete mutações limitadas e a linhagem entre
cada mutação DSL e a linha equivalente no perfil completo.

O estudo cobre somente os cenários single-target curto, médio e longo. A triagem usa 1.000
iterações por perfil e cenário; os dois melhores resultados elegíveis avançam para 10.000
iterações. Cada fase usa seu próprio conjunto de seeds, sempre pareado entre baseline e candidata.

## Decisão

`measurements.json` contém os resultados reais extraídos do SimulationCraft. `report.json` deriva
deltas, fitness ponderado e guardrails. A incerteza usa o erro-padrão independente, de forma
conservadora, e o limite inferior aplica 95% de confiança familiar com correção de Bonferroni para
dois finalistas.

A candidata `enhancement.st.primordial_window_4_5` liderou a confirmação com fitness de
`+0,031734%`, mas seu limite inferior foi `-0,021387%`. Como o ganho não ficou acima de zero com a
confiança exigida, a decisão versionada preserva `enhancement.st.baseline`.

## Comandos

```powershell
npm run enhancement:st-generate
npm run enhancement:st-check
```

O primeiro comando exige o executável pinado e refaz as medições. O segundo não simula: ele valida
integridade, planos, seeds, linhagem, capabilities, goldens e a decisão derivada.

Fonte oficial preservada:

- [SimulationCraft — MID2 Enhancement Totemic](https://github.com/simulationcraft/simc/blob/f86979165c9b952e41d8cb6119065d3f6272abee/profiles/MID2/MID2_Shaman_Enhancement_Totemic.simc)
