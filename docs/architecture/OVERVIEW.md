# Arquitetura do Spynon's Rotation

## Objetivo

O repositório separa o runtime restrito do World of Warcraft do ambiente de pesquisa e validação. Shaman Enhancement é a primeira implementação de `SpecModule`, não uma exceção arquitetural.

```text
Rotation Lab ──compila──> Rotation DSL/runtime data
     │                           │
     └──── regression suite <────┘
                                 │
Compat ──> PlayerState ──> Recommendation Engine ──> Recommendation[] ──> UI
                           ▲
                           └── Spec Registry ──> SpecModule
```

## Regras de dependência

1. `addon/Core/` define contratos e ciclo de vida genéricos. Não conhece classe ou spec.
2. `addon/Rotation/` avalia regras genéricas e produz `Recommendation[]`.
3. `addon/Classes/<Class>/<Spec>/` fornece catálogo, regras e metadados do módulo.
4. `addon/Compat/` é a única fronteira para APIs Blizzard voláteis e capability detection.
5. `addon/UI/` consome recomendações e estado visual; nunca importa módulos de classe/spec.
6. `addon/Config/`, `Profiles/` e `Skins/` trabalham com contratos genéricos.
7. `rotation-lab/` pode depender de SimulationCraft e Python; nada dali é carregado pelo WoW.

Dependências apontam para contratos estáveis. Uma pasta genérica não pode depender de `Classes/Shaman/Enhancement`.

O registry plugável de classes/specs e sua ordem de carregamento estão definidos em [`SPEC_REGISTRY.md`](SPEC_REGISTRY.md).
A composição segura da spec ativa, módulo e talentos está definida em [`SPEC_DETECTION.md`](SPEC_DETECTION.md).
Os snapshots observáveis e a atualização incremental por eventos estão definidos em [`STATE_ENGINE.md`](STATE_ENGINE.md).
O interpretador seguro e a fila de prioridades estão definidos em [`RECOMMENDATION_ENGINE.md`](RECOMMENDATION_ENGINE.md).
A primeira view estática e a resolução de ícones estão definidas em [`QUEUE_UI.md`](QUEUE_UI.md).
Os sinais de buff/debuff relevantes à fila estão em [`AURA_INDICATORS.md`](AURA_INDICATORS.md).
A configuração por assunto e seu modelo de sessão estão em [`BASIC_CONFIG.md`](BASIC_CONFIG.md).
Persistência, alcance de preferências e precedência estão em [`PROFILES.md`](PROFILES.md).
A seleção direta de componentes da prévia está em [`HUD_EDITOR.md`](HUD_EDITOR.md).
O histórico transacional e o arraste temporário estão em [`HISTORY.md`](HISTORY.md).
A exploração confirmada e os alcances de restauração estão em [`PREVIEW_RESET.md`](PREVIEW_RESET.md).
Os controles de animação sob demanda estão em [`ADVANCED_CONFIG.md`](ADVANCED_CONFIG.md).
A skin declarativa e a precedência de seus defaults estão em [`SKINS.md`](SKINS.md).
Registro externo versionado e addon de exemplo estão em [`EXTERNAL_SKINS.md`](EXTERNAL_SKINS.md).
A seleção de contexto e seus fallbacks estão em [`CONTEXT_DETECTOR.md`](CONTEXT_DETECTOR.md).
A representação intermediária declarativa e suas capabilities estão definidas em [`ROTATION_DSL.md`](ROTATION_DSL.md).
O pipeline determinístico entre SimC, DSL e bundles de runtime está definido em [`COMPILER.md`](COMPILER.md).
A matriz neutra de simulação, seus planos e guardrails de fitness estão definidos em [`SCENARIOS.md`](SCENARIOS.md).
O beam search reproduzível e seus contratos de mutação e avaliação estão definidos em [`OPTIMIZER.md`](OPTIMIZER.md).
A suíte determinística de comparação entre baseline, candidata e release anterior está definida em [`REGRESSION.md`](REGRESSION.md).
O primeiro catálogo concreto e sua disponibilidade por loadout estão definidos em
[`ENHANCEMENT_CATALOG.md`](ENHANCEMENT_CATALOG.md).
A proveniência, auditoria e normalização da primeira APL real estão definidas em
[`ENHANCEMENT_BASELINE.md`](ENHANCEMENT_BASELINE.md).
A especialização determinística da baseline pelos talentos realmente ativos está definida em
[`ENHANCEMENT_TALENT_AWARE.md`](ENHANCEMENT_TALENT_AWARE.md).

## Contratos do Core

- `Action`: spell, item, racial, trinket, potion, interrupt, defensive ou utility.
- `Recommendation`: ação candidata, prioridade, razão observável e metadados visuais.
- `Indicator`: sinal visual relevante, resolvido somente a partir de estado público.
- `PlayerState`: snapshot somente de estado permitido.
- `CombatContext`: AUTO, SINGLE_TARGET, CLEAVE ou AOE com fallback manual.
- `SpecModule`: catálogo e regras plugáveis de uma spec.
- `Capability`: `ADDON_AVAILABLE`, `SIM_ONLY` ou `CONDITIONALLY_SECRET`.

As invariantes e o ownership desses contratos estão documentados em [`CONTRACTS.md`](CONTRACTS.md).

## Secret Values

A matriz revisada, a correção de contenção de acesso a campos e os gates de regressão
estão em [SECRET_VALUES_AUDIT.md](SECRET_VALUES_AUDIT.md).

Nenhum módulo converte ou deriva valores secretos quando a API não permite. Condições incompatíveis com o runtime ficam no Rotation Lab como `SIM_ONLY`. Toda degradação deve ser explícita e segura.

A API uniforme, matriz inicial e política de fallback da fronteira Blizzard estão em [`COMPAT.md`](COMPAT.md).
O diff pinado por build e a política de smoke de desenvolvimento estão em [`API_DIFF.md`](API_DIFF.md).

## Runtime mínimo

O bootstrap conecta o State Engine genérico aos eventos após o carregamento do addon. Ele não contém UI,
avaliação de regras ou lógica de Enhancement. A autoridade final para taint, combat lockdown, Secret Values
e rendering continua sendo o cliente Retail real.
