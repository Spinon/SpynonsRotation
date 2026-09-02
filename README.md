# Spynon's Rotation

Plataforma de addons de World of Warcraft da marca Spynon. O primeiro módulo será um assistente visual de rotação para Shaman Enhancement, construído sobre um Core genérico e extensível para outras classes e especializações.

O produto recomenda ações; ele não automatiza o jogo. Toda regra de produção deve usar somente estado legitimamente observável pelas APIs do WoW.

## Estado atual

O bootstrap está concluído e o Core genérico está em construção. O estado canônico do projeto vive em [`project-board.json`](project-board.json); [`docs/project/STATUS.md`](docs/project/STATUS.md) é sempre gerado a partir dele.

## Comandos

```powershell
npm run project:status
npm run project:check
npm run project:test
npm run project:sync
npm run toolchain:doctor
npm run simc:doctor
npm run simc:run -- --profile rotation-lab/fixtures/simc-cli-smoke.simc
npm run simc:smoke
npm run dsl:check
npm run dsl:test
npm run compiler:check
npm run compiler:test
npm run scenario:check
npm run scenario:test
npm run core:test
npm test
```

## Fronteiras principais

- `addon/`: runtime Lua carregado pelo WoW.
- `rotation-lab/`: pesquisa, SimulationCraft, cenários e otimização fora do jogo.
- `specs/`: especificações curadas por classe/spec.
- `tools/`: governança, validação, packaging e manutenção de patch.
- `tests/`: testes unitários, integrados, headless e fixtures.
- `docs/`: produto, arquitetura e estado derivado do projeto.

Consulte [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md) para as regras de dependência entre camadas.
Os contratos públicos do Core estão em [`docs/architecture/CONTRACTS.md`](docs/architecture/CONTRACTS.md).
As APIs Blizzard cobertas e seus fallbacks estão em [`docs/architecture/COMPAT.md`](docs/architecture/COMPAT.md).
A detecção genérica de spec e talentos está em [`docs/architecture/SPEC_DETECTION.md`](docs/architecture/SPEC_DETECTION.md).
O runner pinado do SimulationCraft está em [`docs/architecture/SIMC_RUNNER.md`](docs/architecture/SIMC_RUNNER.md).
A representação intermediária de rotações está em [`docs/architecture/ROTATION_DSL.md`](docs/architecture/ROTATION_DSL.md).
O compilador SimC ↔ DSL ↔ runtime está em [`docs/architecture/COMPILER.md`](docs/architecture/COMPILER.md).
A matriz de cenários e o cálculo de fitness estão em [`docs/architecture/SCENARIOS.md`](docs/architecture/SCENARIOS.md).
O lifecycle e a política de evidências estão em [`docs/project/BOARD_GOVERNANCE.md`](docs/project/BOARD_GOVERNANCE.md).
