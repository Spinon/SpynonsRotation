# Contexto de combate — RUN-003

O detector genérico separa **escolha do modo** de **medição de inimigos**. `CombatContext` descreve a
primeira; diagnósticos separados indicam `OBSERVED`, `MANUAL_OVERRIDE` ou `SAFE_FALLBACK`. Capability
`ADDON_AVAILABLE` num contexto de fallback autoriza a escolha conservadora, não afirma que existe um alvo.

## Funcionamento atual no Retail

Não há fonte de contagem de inimigos homologada neste pin. `Compat.Context:ReadEnemyCount()` retorna
indisponibilidade explícita. Assim, AUTO usa SINGLE_TARGET e informa que é fallback. Não contamos
nameplates como inimigos em alcance de AoE e não inferimos contagem a partir de combat log restrito.

Isso é uma limitação deliberada, **não detecção automática funcional de packs**. O override manual
oferece ST, CLEAVE e AOE sem consultar dados restritos. Uma fonte futura precisa provar semântica,
observabilidade e comportamento no cliente antes de ser conectada ao adapter.

## Comandos

```text
/spynon context auto
/spynon context st
/spynon context cleave
/spynon context aoe
/spynon context status
```

A troca reavalia imediatamente a fila. Pode ser usada em combate: não executa ações protegidas.
O override é de sessão e volta a AUTO após reload; persistência de perfil e controles visuais continuam
nas tasks próprias. Os comandos de teste existentes permanecem disponíveis.

## Contrato para sinais públicos

`ContextDetectorFactory.Create(adapter, guard)` recebe um `Result` de contagem. Só aceita `ok=true`,
capability efetiva `ADDON_AVAILABLE` e inteiro público de 0 a 40. O guard precede operações sobre a
contagem. Falha, nil, NaN, valor secreto, SIM_ONLY e capability desconhecida resultam em fallback sem count.

Limiares padrão: 0–1 → ST, 2–3 → CLEAVE, 4–40 → AOE. Zero continua sendo contagem zero; não é convertido
em um inimigo real. `SetThresholds(cleaveAt, aoeAt)` permite ajuste técnico validado (2 ≤ cleave < aoe ≤ 40).
Não expomos controles de threshold enquanto a contagem real estiver indisponível.

`ContextController` acompanha os eventos do State Engine e só republica mudanças no contexto escolhido.
O módulo de spec decide como o contexto seleciona suas próprias listas; Core e UI não conhecem listas
ou Hero Trees. A composição do card visual permanece fora desta task.

## Evidência

`tests/unit/context_detector_spec.lua` cobre fronteiras, entradas protegidas/inválidas, override, configuração,
deduplicação de updates e coexistência dos comandos. As contagens positivas são **fixtures injetadas**, não
leituras comprovadas do cliente. `npm test` valida a regressão completa offline. O smoke real segue pendente
em TEST-002 e deve incluir os comandos acima.
