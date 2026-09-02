# Spynon's Rotation

Plataforma de addons de World of Warcraft da marca Spynon. O primeiro módulo será um assistente visual de rotação para Shaman Enhancement, construído sobre um Core genérico e extensível para outras classes e especializações.

O produto recomenda ações; ele não automatiza o jogo. Toda regra de produção deve usar somente estado legitimamente observável pelas APIs do WoW.

## Estado atual

O repositório está na fase de bootstrap. O estado canônico do projeto vive em [`project-board.json`](project-board.json); [`docs/project/STATUS.md`](docs/project/STATUS.md) é sempre gerado a partir dele.

## Comandos

```powershell
npm run project:status
npm run project:check
npm run project:sync
npm run toolchain:doctor
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
