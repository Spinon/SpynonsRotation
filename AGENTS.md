# Protocolo de trabalho — Spynon's Rotation

Este repositório usa uma fila canônica. Todo agente deve respeitar este protocolo antes de editar código.

## Antes do trabalho

1. Execute `npm run project:sync` para buscar o remote, rejeitar divergências e validar o estado derivado.
2. Confirme que a branch esperada está ativa e que não há alterações de terceiros sobrepostas ao escopo.
3. Leia `project-board.json` e localize `currentFocus`.
4. Leia integralmente a fonte indicada no campo `source` da task.
5. Verifique o que já existe e trabalhe somente na task atual.

Se a branch estiver divergente ou houver alterações inesperadas que conflitem com a task, interrompa a edição e reporte a evidência. Nunca use force push.

## Durante o trabalho

- Preserve as fronteiras de [`docs/architecture/OVERVIEW.md`](docs/architecture/OVERVIEW.md).
- Enhancement é um módulo de spec, nunca uma condição especial no Core, UI genérica, Animator, Profiles, Skins ou Config.
- A UI recebe `Recommendation`; não recebe objetos específicos de Shaman.
- Chamadas voláteis da API do WoW pertencem a `addon/Compat/`.
- Regras do runtime só podem depender de capacidades `ADDON_AVAILABLE` ou de fallback explicitamente seguro.
- Não expanda o escopo com refactors ou features de tasks futuras.
- Nunca declare validação em jogo se apenas testes offline/headless foram executados.

## Encerramento

1. Execute testes proporcionais e `npm test` quando aplicável.
2. Atualize somente `project-board.json`, incluindo evidência verificável para qualquer item `done`.
3. Execute `npm run project:status` e depois `npm run project:check`.
4. Faça commit descritivo e push da branch.
5. Não faça merge nem publique release sem autorização explícita do Product Owner.

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
