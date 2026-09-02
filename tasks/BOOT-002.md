# BOOT-002 — Governança da fila e protocolo de agentes

## Objetivo

Revisar e endurecer o sistema canônico de tasks após o bootstrap, garantindo que futuras execuções trabalhem exatamente um item por vez e produzam evidência auditável.

## Escopo planejado

- revisar o schema do board e documentar migrações;
- adicionar fixtures de boards válidos e inválidos;
- testar `project:check`, `project:status` e `project:sync`;
- validar transições de status e política de evidência;
- revisar o protocolo do `AGENTS.md` contra um ciclo completo de task;
- preparar integração desses checks em CI sem implementar `RELEASE-002` por antecipação.

## Critérios de aceite

- violações exigidas pela Task Mãe possuem teste automatizado;
- STATUS permanece estritamente derivado do board;
- uma task concluída deixa evidência verificável;
- a próxima task técnica fica inequívoca.
