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
A representação intermediária declarativa e suas capabilities estão definidas em [`ROTATION_DSL.md`](ROTATION_DSL.md).
O pipeline determinístico entre SimC, DSL e bundles de runtime está definido em [`COMPILER.md`](COMPILER.md).
A matriz neutra de simulação, seus planos e guardrails de fitness estão definidos em [`SCENARIOS.md`](SCENARIOS.md).

## Contratos do Core

- `Action`: spell, item, racial, trinket, potion, interrupt, defensive ou utility.
- `Recommendation`: ação candidata, prioridade, razão observável e metadados visuais.
- `PlayerState`: snapshot somente de estado permitido.
- `CombatContext`: AUTO, SINGLE_TARGET, CLEAVE ou AOE com fallback manual.
- `SpecModule`: catálogo e regras plugáveis de uma spec.
- `Capability`: `ADDON_AVAILABLE`, `SIM_ONLY` ou `CONDITIONALLY_SECRET`.

As invariantes e o ownership desses contratos estão documentados em [`CONTRACTS.md`](CONTRACTS.md).

## Secret Values

Nenhum módulo converte ou deriva valores secretos quando a API não permite. Condições incompatíveis com o runtime ficam no Rotation Lab como `SIM_ONLY`. Toda degradação deve ser explícita e segura.

A API uniforme, matriz inicial e política de fallback da fronteira Blizzard estão em [`COMPAT.md`](COMPAT.md).

## Runtime mínimo

O bootstrap inclui somente um `.toc` e ciclo de inicialização neutro. Ele não contém engine, UI ou lógica de Enhancement. A autoridade final para taint, combat lockdown, Secret Values e rendering continua sendo o cliente Retail real.
