# Protocolo de trabalho — Spynon's Rotation

Este repositório usa um board canônico com trilhas de trabalho controladas. Todo agente deve respeitar este protocolo antes de editar código ou assets do projeto.

## Antes do trabalho

1. Execute `npm run project:sync` para buscar o remote, rejeitar divergências e validar o estado derivado.
2. Confirme que a branch esperada está ativa e que não há alterações de terceiros sobrepostas ao escopo.
3. Leia `project-board.json` e localize o foco da trilha aplicável: `currentFocus` para entrega técnica ou `parallelFocus.<trilha>` para trabalho paralelo autorizado.
4. Leia integralmente a fonte indicada no campo `source` da task.
5. Verifique o que já existe e trabalhe somente na task focal da trilha selecionada.
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
- No máximo uma task pode ficar `in_progress` por trilha.
- A trilha paralela `ui` pode produzir direção visual, mockups, especificações e assets. Ela não autoriza implementar runtime ou contornar dependências da fila de entrega.
- Alterações entre trilhas só podem se sobrepor quando a task e suas dependências autorizarem explicitamente o mesmo arquivo.
- Se a trilha `delivery` precisar de um asset ainda não entregue por `ui`, use um placeholder neutro, local e claramente identificado em vez de bloquear a implementação.
- O placeholder deve preservar dimensões, âncoras e contrato de substituição do componente final, sem copiar arte externa, simular aprovação visual ou introduzir dependência de classe/spec.
- Registre o ponto de substituição no código ou manifesto do asset para que a arte aprovada possa entrar sem refatorar a lógica.

## Encerramento

1. Execute testes proporcionais e `npm test` quando aplicável.
2. Na task concluída, registre evidência verificável, defina `nextAction: null`, avance `updatedAt` e mude o status para `done`.
3. Aponte o foco da trilha concluída (`currentFocus` ou `parallelFocus.<trilha>`) para a próxima task elegível e atualize `board.updatedAt`.
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
