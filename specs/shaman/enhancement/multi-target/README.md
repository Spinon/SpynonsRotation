# Curadoria Cleave/AoE de Enhancement

Este diretório contém a evidência reproduzível da ENH-004. Ele não implementa detecção de contexto
no runtime, não altera a rotação do addon e não representa validação dentro do cliente World of
Warcraft.

## Contextos e cenários

`context-policy.json` registra o contrato inicial usado pela curadoria:

- `SINGLE_TARGET`: 1 alvo;
- `CLEAVE`: 2–3 alvos;
- `AOE`: 4 ou mais alvos;
- modo automático somente com contagem observável e capability `ADDON_AVAILABLE`;
- quando o sinal não estiver disponível, override manual obrigatório e `SINGLE_TARGET` como
  default seguro.

A implementação desse contrato permanece reservada à RUN-003. O estudo mede os cenários canônicos
de 2, 3, 4, 5 e 8 alvos, usando o perfil oficial MID2 Totemic preservado pela ENH-003.

## Espaço de busca e decisão

`study.json` fixa sete mutações limitadas na lista DSL `aoe`: quatro ajustes de threshold de
Maelstrom Weapon e três trocas de prioridade. Cada uma registra a alteração equivalente na APL
completa, além dos hashes da DSL e do perfil derivado.

A triagem usa 1.000 iterações por perfil e cenário. Os dois melhores resultados elegíveis avançam
para 10.000 iterações com seeds independentes da triagem e pareadas contra a baseline. O relatório
aplica guardrail por densidade de alvo e 95% de confiança familiar com correção de Bonferroni.

A candidata `enhancement.mt.chain_floor_4` liderou a confirmação com fitness global de
`+0,001696%`. O agregado foi `+0,017701%` em AoE e `-0,0232%` em Cleave; o limite inferior global
ficou em `-0,037802%`. Como o ganho não superou o ruído exigido, `report.json` preserva
`enhancement.mt.baseline`.

## Comandos

```powershell
npm run enhancement:mt-generate
npm run enhancement:mt-check
```

O primeiro comando exige o SimulationCraft pinado e refaz as medições. O segundo valida fonte,
matriz, contexto, planos, seeds, linhagem, capabilities, goldens e decisão sem executar nova
simulação.
