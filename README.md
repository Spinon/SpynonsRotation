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
O lifecycle e a política de evidências estão em [`docs/project/BOARD_GOVERNANCE.md`](docs/project/BOARD_GOVERNANCE.md).
