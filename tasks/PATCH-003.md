# PATCH-003 — Diagnóstico da build no primeiro smoke Retail

## Origem e prioridade

Em 2026-09-14 o Product Owner enviou a captura `codex-clipboard-a7313aca-d1b7-4682-9f5f-9346f5541913.png`.
O preview rotulado, molduras e quatro ícones renderizaram no cliente. O chat informa estado válido,
126 sinais públicos e zero recomendações, mas agrupa build divergente e indisponível no mesmo aviso.
O SavedVariables confirma `buildMatches=false` e ausência do campo `build`: não prova divergência real.
O executável local é 12.1.0.69814, já permitido para smoke por PATCH-001.

Esta correção sucede CORE-004/PATCH-001 sem reabrir tasks concluídas. Tem precedência sobre UI-002.

## Escopo

- Separar falha de leitura de versão não homologada no relatório e no chat.
- Validar estritamente versão, número de build e interface. Não inventar metadados a partir do pin.
- Metadados descritivos auxiliares ausentes/vazios não devem invalidar a identidade da build.
- Registrar a causa controlada de uma falha e versão/interface efetivamente observadas quando válidas.
- Testes de regressão para retornos reduzidos, incompletos, divergentes e falhas de API.
- Registrar a evidência visual parcial em TEST-002, sem concluir taint, combate ou aprovação estética.

## Limites

O relatório antigo não preservou o motivo da falha: a causa exata no cliente continua não confirmada.
Fontes documentadas descrevem seis retornos, mas os textos auxiliares não participam da allowlist.
Não relaxar a allowlist, alterar rotação, recriar assets nem implementar animações nesta task.
Após validação offline, instalar a correção de desenvolvimento e solicitar repetição do smoke com /reload.
