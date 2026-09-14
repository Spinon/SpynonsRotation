# Contratos genéricos do Core

Os contratos do Core são tabelas Lua 5.1 pequenas, validadas e independentes da API Blizzard. Eles definem a fronteira entre módulos de spec, estado observável, engine de recomendação e UI.

Os construtores retornam `objeto, nil` quando válidos ou `nil, erro` quando uma invariante falha. Objetos são snapshots por convenção: consumidores não devem modificá-los depois da criação.

## Capability

Classifica a proveniência de um dado ou condição:

- `ADDON_AVAILABLE`: observável legitimamente e seguro para decisão no runtime;
- `SIM_ONLY`: disponível somente na simulação e proibido como fundamento de uma recomendação no jogo;
- `CONDITIONALLY_SECRET`: pode ficar indisponível ou protegido; exige fallback seguro.

`AllowsRuntime` retorna verdadeiro somente para `ADDON_AVAILABLE`. A presença de `CONDITIONALLY_SECRET` nunca significa permissão para extrair ou converter Secret Values.

## Action

Representa algo que pode ser recomendado sem conhecer a classe/spec:

```text
id           identidade estável e namespaced
kind         spell | item | racial | trinket | potion | interrupt | defensive | utility
label        nome legível
capability   proveniência/possibilidade de uso
gameId       ID positivo opcional do WoW
icon         file ID ou path opcional
tags         categorias genéricas opcionais
```

Campos desconhecidos são rejeitados. Dados específicos de uma spec não podem vazar para o contrato por propriedades improvisadas.

## Recommendation

Referência uma `Action` validada e adiciona somente informações da decisão:

```text
id         identidade visual persistente
action     Action genérica
priority   posição positiva; 1 é a maior prioridade
reason     código, texto opcional e capability da condição
context    CombatContext opcional
```

A identidade é independente da posição, permitindo ao Animator reconhecer MOVE, ENTER, EXIT e PROMOTE futuramente. `IsRuntimeSafe` exige que ação, motivo e contexto sejam diretamente observáveis.

## PlayerState

Snapshot normalizado produzido pelo [State Engine](STATE_ENGINE.md):

- `revision`, `capturedAt`, `inCombat` e `specId` opcional;
- mapas de `resources`, `auras`, `cooldowns` e `talents`;
- mapa de capabilities por sinal observado.

O construtor faz cópias rasas dos mapas; o State Engine isola profundamente os snapshots publicados.
`Compat.State` não insere valores proibidos ou secretos nesses mapas. Ausência de valor exige `SKIP`,
nunca inferência de zero; o formato dos sinais e as capabilities por campo estão em `STATE_ENGINE.md`.

## CombatContext

Modos válidos:

- `AUTO`;
- `SINGLE_TARGET`;
- `CLEAVE`;
- `AOE`.

Modos explícitos resolvem para si mesmos. `AUTO` precisa de um `resolvedMode` concreto ou de um fallback concreto, normalmente `SINGLE_TARGET`. O contrato não detecta alvos; essa responsabilidade pertence a `RUN-003` e `Compat`.

## SpecModule

Descriptor consumido pelo registry:

```text
id            class.spec
classId       ID positivo da classe
specId        ID positivo da spec
displayName   nome legível
version       versão do módulo
getActions    provider do catálogo de Action
getRules      provider de regras/DSL
getStateQueries provider opcional de consultas públicas para o State Engine
```

`SpecModule` não se registra sozinho e não avalia regras. O serviço e a ordem de carregamento estão documentados em [`SPEC_REGISTRY.md`](SPEC_REGISTRY.md); detecção de spec/talentos está em [`SPEC_DETECTION.md`](SPEC_DETECTION.md).
`getStateQueries(detectedSpec)` é opcional e retrocompatível; seu schema e lifecycle estão em [`STATE_ENGINE.md`](STATE_ENGINE.md).

## Fluxo de ownership

```text
SpecModule ──fornece──> Action[] + regras
                            │
PlayerState + CombatContext ├──> Recommendation Engine
Capability ─────────────────┘              │
                                          ▼
                                  Recommendation[]
                                          │
                                          ▼
                                      UI genérica
```

Rotation Lab pode representar condições `SIM_ONLY`, mas a fronteira de runtime deve rejeitá-las antes de produzir uma recomendação utilizável no jogo.
