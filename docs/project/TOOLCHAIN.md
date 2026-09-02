# Toolchain e pins

O inventário executável está em [`tools/toolchain/pins.json`](../../tools/toolchain/pins.json). Binários portáteis e ambientes locais vivem em `.tools/` e `.venv/`, ambos ignorados pelo Git.

## Base validada no bootstrap

- Git 2.53.0.windows.3
- GitHub CLI 2.92.0
- Node.js 24.15.0 LTS e npm 11.12.1
- Python 3.14.6 em `.venv`
- LuaJIT 2.1 (semântica Lua 5.1), LuaRocks 3.11.1
- Luacheck 1.2.0 portátil
- wowlua-ls release 0.30.4 portátil
- SimulationCraft 1210-01, WoW 12.1.0 build 69587
- Docker Engine 29.7.2 disponível para a futura integração Wowless

## Decisões

LuaJIT foi escolhido para os testes sintáticos tradicionais por manter compatibilidade com Lua 5.1. O executável oficial portátil do Luacheck evita exigir uma toolchain C apenas para compilar LuaFileSystem no Windows.

SimulationCraft usa o nightly oficial do projeto e é fixado por run, artifact, commit de publicação e SHA-256. O update não é silencioso: um novo pin exige validação e evidência no board.

Wowless está pinado por commit, porém será integrado em `TEST-001`. O upstream exige Docker para desenvolvimento e se declara pre-alpha; por isso seus resultados serão auxiliares, nunca substitutos do teste no cliente Retail.

wowlua-ls fornece os stubs de API WoW e o check de CI. O campo de versão do binário Windows atualmente responde `0.0.0`; o pin confiável é a release e o SHA-256 registrados.

## Cliente WoW

O cliente Retail não foi localizado nesta estação durante o bootstrap. Isso não bloqueia a estrutura ou os checks offline, mas impede afirmar validação real em jogo. A instalação/detecção real será tratada antes do primeiro smoke test in-game.
