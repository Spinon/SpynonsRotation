# Runner pinado do SimulationCraft

O Rotation Lab executa somente o binário do SimulationCraft registrado em
`tools/toolchain/pins.json`. Antes de cada execução, o runner confirma a presença do executável,
seu SHA-256 e os metadados pinados. Ele nunca procura outra instalação no `PATH` e inicia o
processo diretamente, sem intermediação de shell.

## Comandos

```powershell
npm run simc:doctor
npm run simc:run -- --profile rotation-lab/fixtures/simc-cli-smoke.simc --iterations 1000
npm run simc:run -- --profile rotation-lab/fixtures/simc-cli-smoke.simc --seed 310031 --max-time 60 --fixed-time --vary-combat-length 0 --desired-targets 1 --fight-style Patchwerk
npm run simc:smoke
```

`simc:doctor` valida a instalação sem iniciar uma simulação. `simc:run` aceita somente perfis
`.simc` que permaneçam dentro do repositório, inclusive depois da resolução de links. Valores
numéricos possuem limites explícitos. `simc:smoke` executa um caso mínimo e curto para provar a
integração local; sua fixture não é uma baseline, build recomendada ou APL curada.

Além do budget e do paralelismo, o runner tipa `seed`, duração, variação de duração, quantidade de
alvos e `fight_style=Patchwerk`. Esses parâmetros existem para que estudos comparativos usem planos
e seeds pareadas verificáveis, sem aceitar texto arbitrário como opção do processo.

## Artefatos

Cada execução escreve em `rotation-lab/reports/`:

- `<nome>.simc.json`: relatório JSON nativo produzido pela opção `json2` do SimulationCraft;
- `<nome>.run.json`: manifesto do Rotation Lab com versão do SimulationCraft, versão/build do
WoW, repositório e commit do engine, commit do workflow de publicação, SHA-256 do executável, parâmetros,
  duração, código de saída e trechos finais da saída do processo.

Os relatórios são artefatos locais ignorados pelo Git. Um nome repetido substitui apenas os dois
arquivos gerados para esse nome; o JSON nativo anterior é removido antes da execução para impedir
que uma falha seja confundida com sucesso antigo.

## Falhas

Falhas iniciadas pelo processo ainda produzem o manifesto `.run.json`. O runner traduz os códigos
de saída documentados pelo SimulationCraft em categorias estáveis e mensagens acionáveis, além de
preservar o código original. Ausência do executável, divergência de hash, perfil fora do projeto e
argumentos inválidos interrompem a operação antes que qualquer processo seja iniciado.

A matriz versionada e os planos de execução estão definidos em [`SCENARIOS.md`](SCENARIOS.md).
Validar a matriz isoladamente não dispara o runner. Orquestradores específicos, como a curadoria ST
de Enhancement, devem derivar seus parâmetros dela, registrar métricas golden e remover relatórios
transitórios depois da extração validada.

Referências oficiais:

- [Textual Configuration Interface](https://github.com/simulationcraft/simc/wiki/TextualConfigurationInterface)
- [Output e códigos de saída](https://github.com/simulationcraft/simc/wiki/Output)
