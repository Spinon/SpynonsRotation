# Protocolo de trabalho — Spynon's Rotation

Este repositório usa uma fila canônica. Todo agente deve respeitar este protocolo antes de editar código.

## Antes do trabalho

1. Execute `npm run project:sync` para buscar o remote, rejeitar divergências e validar o estado derivado.
2. Confirme que a branch esperada está ativa e que não há alterações de terceiros sobrepostas ao escopo.
3. Leia `project-board.json` e localize `currentFocus`.
4. Leia integralmente a fonte indicada no campo `source` da task.
5. Verifique o que já existe e trabalhe somente na task atual.
6. Se a task estiver `planned`, mude-a para `in_progress`, atualize os timestamps, gere o STATUS e faça commit/push desse início antes da implementação.

Se a branch estiver divergente ou houver alterações inesperadas que conflitem com a task, interrompa a edição e reporte a evidência. Nunca use force push.

## Durante o trabalho

- Preserve as fronteiras de [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).
- Enhancement é um módulo de spec, nunca uma condição especial no Core, UI genérica, Animator, Profiles, Skins ou Config.
- A UI recebe `Recommendation`; não recebe objetos específicos de Shaman.
- Chamadas voláteis da API do WoW pertencem a `addon/Compat/`.
- Regras do runtime só podem depender de capacidades `ADDON_AVAILABLE` ou de fallback explicitamente seguro.
- Não expanda o escopo com refactors ou features de tasks futuras.
- Nunca declare validação em jogo se apenas testes offline/headless foram executados.
- Nunca edite `docs/project/STATUS.md` manualmente; use `npm run project:status`.
- Respeite o lifecycle e as evidências definidos em [`docs/project/BOARD_GOVERNANCE.md`](docs/project/BOARD_GOVERNANCE.md).

## Encerramento

1. Execute testes proporcionais e `npm test` quando aplicável.
2. Na task concluída, registre evidência verificável, defina `nextAction: null`, avance `updatedAt` e mude o status para `done`.
3. Aponte `currentFocus` para a próxima task elegível e atualize `board.updatedAt`.
4. Execute `npm run project:status` e depois `npm run project:check`; o check valida a transição contra o board em `HEAD`.
5. Faça commit descritivo e push da branch.
6. Não faça merge nem publique release sem autorização explícita do Product Owner.

Se a task bloquear, use `blocked`, preserve uma `nextAction` concreta para desbloqueio e registre a causa. Não use `done` para contornar bloqueios.

## Comunicação

Relate o resultado em linguagem de produto, nesta ordem:

```text
Feito:
- ...

O que mudou para o usuário:
- ...

Validação:
- ...

Próxima task:
- ...
```
