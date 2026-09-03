# Enhancement talent-aware

Esta pasta versiona a especialização da baseline Enhancement para duas builds oficiais do
SimulationCraft: Stormbringer e Totemic.

```powershell
npm run enhancement:talent-generate
npm run enhancement:talent-check
```

O primeiro comando extrai os talentos selecionados com o binário pinado e gera `snapshots.json` e
`matrix.json`. O segundo repete a extração, valida a integridade dos perfis e compara os artefatos
byte a byte.

A matriz não escolhe talentos para o jogador. Ela recebe o equivalente versionado de
`activeSpellRanks` e `heroTree`, remove ações incompatíveis, reduz somente condições de talento e
preserva todo estado de combate para avaliação futura no runtime.

Os controles `probe` são deliberadamente derivados das builds oficiais e servem apenas para provar
as fronteiras de disponibilidade. Eles não representam loadouts jogáveis.

Fontes oficiais pinadas:

- [Stormbringer](https://github.com/simulationcraft/simc/blob/f86979165c9b952e41d8cb6119065d3f6272abee/profiles/MID2/MID2_Shaman_Enhancement.simc)
- [Totemic](https://github.com/simulationcraft/simc/blob/f86979165c9b952e41d8cb6119065d3f6272abee/profiles/MID2/MID2_Shaman_Enhancement_Totemic.simc)
