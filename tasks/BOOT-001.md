# BOOT-001 — Bootstrap do repositório e toolchain

## Objetivo

Transformar o repositório vazio em um monorepo reproduzível, conectado ao GitHub, com toolchain offline validada e um addon mínimo neutro.

## Escopo

- conectar `Spinon/SpynonsRotation` e padronizar `main`;
- detectar Git, Node, npm, Python, Lua, SimulationCraft e Docker;
- instalar ou materializar ferramentas ausentes de forma segura;
- criar `.venv` e binários portáteis ignorados pelo Git;
- fixar versões, artifacts, commits e hashes relevantes;
- criar as fronteiras iniciais de pastas;
- criar `.toc` e bootstrap Lua sem lógica de spec;
- documentar a arquitetura e limitações da validação.

## Fora do escopo

- contratos do Core;
- engine de recomendação;
- lógica de Shaman Enhancement;
- interface visual;
- integração funcional com Wowless;
- packaging de release.

## Evidência esperada

- `npm run toolchain:doctor` sem falhas obrigatórias;
- `npm test` sem falhas;
- `project-board.json` válido e STATUS derivado sincronizado;
- commit e push na branch `main` do repositório vazio.
