# TASK MÃE — Spynon WoW Rotation Platform

## 0. Papel do usuário

O usuário é **Product Owner / Product Engineer**.

Ele **não deve precisar**:

- escrever código;
- editar Lua;
- criar ou recortar assets;
- preparar sprites, texturas ou fontes;
- gerenciar dependências;
- executar manutenção técnica;
- traduzir APL manualmente;
- descobrir APIs quebradas em patch day.

O agente de engenharia deve assumir código, arquitetura, dependências, tooling, testes, automação, assets técnicos, packaging e manutenção.

O usuário participa principalmente por:

- decisões de produto;
- aprovação visual;
- avaliação de UX;
- percepção de legibilidade;
- comportamento esperado;
- curadoria da experiência;
- comparação entre alternativas quando houver decisão de produto real.

Não transferir decisões puramente técnicas ao usuário sem necessidade.

---

# 1. Visão do produto

Criar uma plataforma de addons de World of Warcraft sob a marca **Spynon**, começando por **Shaman Enhancement**, mas arquitetada desde o primeiro commit para suportar futuramente qualquer classe/spec sem alterar o Core.

O primeiro produto é um assistente visual de rotação.

Ele NÃO joga automaticamente.

Ele apresenta uma **fila dinâmica de prioridades**, permitindo ao jogador visualizar:

1. ação recomendada agora;
2. próximas prioridades prováveis;
3. mudanças de prioridade em tempo real;
4. procs, cooldowns, stacks, buffs/debuffs e contexto que alteram a decisão.

A fila deve ensinar a lógica da rotação sem parecer um simples “aperte este botão”.

---

# 2. Princípio estrutural fundamental

Shaman Enhancement é a **primeira implementação de spec**, não a arquitetura do addon.

É proibido introduzir lógica específica de Enhancement em:

- Core;
- Recommendation Queue;
- Animator;
- Profiles;
- Skins;
- Config;
- UI genérica.

Se alguma dessas camadas precisar de:

`if spec == Enhancement`

considerar isso um sinal de abstração incorreta.

Classes e specs devem ser plugáveis.

---

# 3. Arquitetura conceitual

Usar contratos genéricos equivalentes a:

- Action
- Recommendation
- PlayerState
- CombatContext
- Resource
- Aura
- Cooldown
- Talent
- SpecModule
- RotationRule
- RotationProfile
- Capability
- Skin
- Profile

Uma `Action` pode representar futuramente:

- spell;
- item;
- racial;
- trinket;
- potion;
- interrupt;
- defensive;
- utility.

A UI recebe `Recommendation`, nunca objetos específicos de Shaman.

---

# 4. Estrutura de projeto desejada

Preferir monorepo:

```text
spynon-wow/
  addon/
    Core/
    Rotation/
    Classes/
      Shaman/
        Shared/
        Enhancement/
    UI/
    Config/
    Profiles/
    Skins/
    Compat/

  rotation-lab/
    simc/
    optimizer/
    scenarios/
    reports/
    fixtures/

  specs/
    shaman/
      enhancement/

  tools/
    wow-api/
    packaging/
    patch-update/
    validation/

  tests/
    unit/
    integration/
    headless/
    fixtures/

  assets/
    brand/
    ui/

  docs/
    product/
    architecture/
    project/

  tasks/

  AGENTS.md
  project-board.json
```

A estrutura exata pode ser refinada pelo agente, preservando essas fronteiras.

---

# 5. Rotation Lab — fonte de verdade da rotação

Não manter a “melhor rotação” como uma coleção manual de `if`s escrita diretamente no addon.

Criar um **Rotation Lab** separado do runtime.

Objetivos:

- consumir SimulationCraft em modo CLI/headless;
- importar APL comunitária como baseline;
- representar a lógica numa DSL intermediária própria;
- validar a DSL por simulação;
- gerar/compilar a versão usada pelo addon;
- comparar variantes automaticamente;
- pesquisar melhorias de prioridade;
- executar matrizes ST/Cleave/AoE;
- detectar regressões após patches.

Fluxo:

```text
SimC APL / conhecimento curado
              ↓
        Rotation DSL
        ↙           ↘
Simulação            Runtime WoW
        ↘           ↙
      Regression Suite
```

Uma regra de produção só pode depender de estado observável pelo addon.

Criar capabilities como:

```text
ADDON_AVAILABLE
SIM_ONLY
CONDITIONALLY_SECRET
```

Nunca aceitar uma APL “melhor” que dependa de informações impossíveis de obter legitimamente dentro do WoW.

---

# 6. Otimização automática

O Rotation Lab deve permitir busca automatizada de variantes.

Permitir inicialmente:

- reorder de prioridades;
- thresholds de recursos/stacks;
- condições de proc;
- condições de buff/debuff;
- condições de talento;
- condições de cooldown;
- hold de cooldowns;
- divisão ST/Cleave/AoE;
- combinação de condições conhecidas.

Usar técnicas como:

- beam search;
- evolutionary search;
- tournament/elimination;
- simulações rápidas para triagem;
- simulações longas para finalistas.

Evitar espaço de busca ilimitado e APLs impossíveis de manter.

Sempre comparar candidata com baseline.

---

# 7. Cenários de simulação

Não otimizar apenas Patchwerk single-target.

Criar suíte inicial contendo pelo menos:

```text
Single Target
- curto
- médio
- longo

Cleave
- 2 alvos
- 3 alvos

AoE
- 4 alvos
- 5 alvos
- 8 alvos

Dungeon-like
- pull curto
- pull prolongado
- boss
- waves/adds
```

Permitir pesos diferentes no cálculo de fitness.

Uma melhoria global não pode esconder regressão grave num cenário relevante.

---

# 8. Enhancement — primeira curadoria

Implementar Shaman Enhancement como spec piloto.

Detectar automaticamente:

- specialization;
- árvore de classe;
- árvore de spec;
- hero talents;
- nodes escolhidos;
- ranks;
- abilities realmente disponíveis.

A engine deve trabalhar com **os talentos realmente alocados**, não com presets fixos como “build Wowhead #1”.

Regras incompatíveis com a build atual não devem participar da avaliação.

---

# 9. ST / Cleave / AoE

Criar `CombatContext` genérico.

Modos:

```text
AUTO
SINGLE TARGET
CLEAVE
AOE
```

AUTO deve usar apenas sinais permitidos pelas APIs atuais.

Como WoW 12.x possui Secret Values e restrições de combate, o sistema deve:

- detectar capacidades disponíveis;
- nunca tentar burlar restrições;
- degradar graciosamente;
- permitir override manual;
- não depender de combat log restrito para funcionar.

O usuário poderá configurar os thresholds de contexto quando isso fizer sentido.

---

# 10. Fila visual

Default inicial: 4 recomendações.

Conceito:

```text
[ AGORA ] [ 2 ] [ 3 ] [ 4 ]
```

O primeiro ícone possui maior hierarquia visual.

A fila NÃO pode simplesmente destruir e recriar ícones.

Cada recomendação visual deve possuir identidade persistente.

Quando o estado mudar:

```text
ANTES:
A B C D

DEPOIS:
B C E A
```

o Animator deve reconhecer:

```text
B = MOVE
C = MOVE
E = ENTER
A = MOVE/PROMOTE/DEMOTE
D = EXIT
```

---

# 11. Animações

Movimentação precisa parecer física e contínua.

Criar animações distintas para:

### Move
A habilidade já estava na fila e muda de posição.

### Enter
Uma nova habilidade entra na fila.

### Exit
Uma habilidade deixa de ser relevante.

### Promote
Uma proc/condição faz uma habilidade subir rapidamente na prioridade.

### Consume
O jogador utiliza a recomendação atual.

As animações devem possuir defaults polidos e discretos.

Parâmetros avançados podem incluir:

- duration;
- easing;
- offset;
- scale;
- opacity;
- overshoot.

Esses parâmetros NÃO devem aparecer na configuração básica.

---

# 12. Hotkeys

Cada recomendação deve conseguir mostrar a hotkey vinculada à habilidade.

Detectar a bind do jogador automaticamente.

Converter opcionalmente nomes técnicos para representação compacta:

```text
SHIFT-3 → S3
CTRL-Q  → CQ
ALT-E   → AE
BUTTON4 → M4
```

Usuário pode escolher:

- mostrar/esconder;
- posição;
- tamanho;
- tipografia;
- estilo de abreviação.

---

# 13. Cooldowns, charges e stacks

Suportar:

- cooldown swipe;
- duração restante;
- charges;
- stacks;
- recursos relevantes.

Usar APIs compatíveis com o modelo atual de Secret Values, incluindo DurationObjects quando necessário.

Nunca tentar transformar valores secretos em números para lógica quando a API não permitir.

---

# 14. Buffs e debuffs

Mostrar principalmente informações que **alteram a decisão atual**.

Evitar recriar um WeakAura pack gigantesco.

Exemplo:

- proc que promove habilidade;
- stacks necessários;
- buff importante expirando;
- debuff relevante ao refresh;
- janela de prioridade.

O jogador deve entender a informação sem perder legibilidade periférica.

---

# 15. Configuração — princípio central

**Tudo deve ser configurável, mas quase nada deve aparecer até ser relevante.**

Proibido criar uma janela com dezenas de opções técnicas numa lista enorme.

Aplicar progressive disclosure.

Tela inicial aproximada:

```text
Aparência
Fila
Informações
Rotação
Perfis
Editar HUD
```

Ao abrir `Fila`:

```text
Quantidade
Tamanho
Direção
Movimento

[Personalizar animações]
```

Só depois:

```text
Movimento
Entrada
Saída
Mudança de prioridade

[Avançado]
```

Somente dentro de `Avançado` aparecem valores técnicos.

---

# 16. Editor contextual do HUD

Criar modo **Editar HUD**.

O jogador clica diretamente no componente que deseja editar.

Selecionar o ícone principal deve abrir opções daquele componente.

Selecionar a hotkey deve abrir opções da hotkey.

Selecionar a fila deve abrir opções de:

- orientation;
- spacing;
- quantidade;
- alignment.

Não mostrar controles que não façam sentido para o elemento selecionado.

Preview sempre em tempo real.

Evitar botão “Apply”.

---

# 17. Undo / Redo

Implementar histórico real de edição.

Disponibilizar botões visuais:

```text
Desfazer
Refazer
```

Hotkeys podem ser adicionadas quando não conflitarem com WoW:

```text
Ctrl+Z
Ctrl+Shift+Z
```

O histórico deve trabalhar com **ações**, não com cada atualização intermediária.

Arrastar slider:

```text
40 → 90
```

é uma única ação.

Arrastar HUD por 2 segundos é uma única ação.

Separar:

- Undo;
- Redo;
- Resetar este elemento;
- Restaurar seção;
- Restaurar perfil.

Implementar preview temporário que não entra no histórico até confirmação.

---

# 18. Tipografia

Ter um default forte e legível.

Por padrão usar somente fontes disponíveis no ambiente WoW.

Permitir:

### Simples
- fonte global;
- tamanho base;
- outline;
- shadow.

### Avançado
overrides individuais para:

- hotkey;
- cooldown;
- stacks;
- labels.

Usar nomes compreensíveis para humanos.

Não mostrar caminhos técnicos de arquivos.

Fallback automático para fonte default.

---

# 19. Perfis

Suportar:

- perfil global;
- personagem;
- spec;
- cópia de perfil;
- import/export futuro;
- reset granular.

A experiência default deve funcionar perfeitamente sem o usuário sequer abrir Profiles.

Avaliar AceDB-3.0 apenas para persistência/profile management se trouxer vantagem clara.

Não utilizar AceConfig como interface principal: a configuração contextual própria é requisito do produto.

---

# 20. Skins e reskins

Core visual separado da skin.

Skin define, entre outros:

- borders;
- backgrounds;
- masks;
- spacing;
- scale;
- glow;
- typography defaults;
- animation defaults.

Preparar API para addons externos futuros como:

```text
SpynonSkin_Example
```

O usuário deve poder usar uma skin e ainda sobrescrever partes dela.

---

# 21. Identidade Spynon — LOGOTIPO APROVADO

Marca:

**Spynon**

O **logotipo atual foi aprovado pelo Product Owner e passa a ser a referência oficial da marca para este projeto.**

O usuário colocará o arquivo aprovado dentro dos arquivos do projeto.

O agente deve:

1. localizar o arquivo de logo fornecido pelo Product Owner no projeto;
2. tratá-lo como **fonte visual oficial e aprovada**;
3. NÃO redesenhar, reinterpretar ou substituir o símbolo sem nova solicitação explícita do Product Owner;
4. preservar:
   - geometria principal;
   - símbolo angular em “S”;
   - wordmark Spynon;
   - relação entre símbolo e tipografia;
   - identidade azul-galáxia + verde floresta/neon;
5. produzir apenas derivações técnicas necessárias para o produto.

Derivações permitidas sem nova aprovação conceitual:

- versão horizontal;
- símbolo isolado;
- versão monocromática;
- versão clara;
- versão escura;
- tamanhos otimizados;
- transparência;
- recortes;
- conversão para formatos apropriados;
- rasterização;
- vetorização técnica fiel quando necessária;
- assets adequados às exigências do WoW;
- ícones para distribuição/repositório/documentação.

Essas derivações devem **preservar a identidade aprovada**, sem inventar novo logo.

Se a geração original for raster e houver necessidade de master vetorial, criar uma reconstrução vetorial fiel e comparar visualmente com o original antes de adotá-la.

Não considerar pequenas diferenças inevitáveis de conversão técnica como redesign.

A direção visual aprovada é:

- premium;
- tech/gaming;
- moderna;
- limpa;
- angular;
- dinâmica;
- fundo/identidade azul muito escuro “galáxia”;
- navy/midnight blue;
- verde floresta;
- verde neon usado como highlight;
- wordmark claro/frio;
- símbolo geométrico angular sugerindo discretamente um “S”;
- pequeno elemento luminoso central.

Fluxo de brand daqui em diante:

```text
LOGO APROVADO DO PO
        ↓
master técnico fiel
        ↓
derivações necessárias
        ↓
integração no produto
```

O usuário não deve produzir assets manualmente.

---

# 22. Default visual

A instalação sem configuração precisa parecer produto final.

O usuário deve poder:

```text
instalar → jogar
```

sem configurar nada.

Polimento deve ser incremental:

```text
funciona
↓
fica bonito
↓
adiciona próxima camada
↓
fica bonito novamente
```

Não acumular dez features visuais antes da etapa de polish.

---

# 23. Demo / Preview Mode

Criar um modo interno capaz de simular visualmente:

- mudanças de prioridade;
- procs;
- entradas;
- saídas;
- cooldowns;
- stacks;
- ST/Cleave/AoE.

Objetivo: permitir refinamento visual sem precisar entrar repetidamente em combate real.

Esse modo é especialmente importante para o Product Owner avaliar animação, leitura e comportamento.

---

# 24. Patch-day architecture

Centralizar qualquer API WoW potencialmente volátil em uma camada `Compat`.

Nenhuma feature deve espalhar chamadas críticas da Blizzard por dezenas de arquivos.

Criar tooling capaz de:

1. identificar versão/interface atual;
2. comparar mudanças de API;
3. detectar funções removidas/deprecated/alteradas;
4. detectar mudanças relacionadas a Secret Values;
5. rodar regressões;
6. apontar exatamente módulos afetados.

Registrar em cada release:

- WoW build;
- Interface version;
- SimC commit/version;
- Rotation revision;
- data de validação.

---

# 25. Dependências e ambiente

No bootstrap, detectar o que já existe e instalar automaticamente o que estiver ausente quando seguro.

Não pedir ao usuário para fazer instalação manual, exceto quando permissões do SO/UAC exigirem intervenção.

## Base obrigatória

### Git
Controle de versão.

### Node.js
Usar **Node 24 LTS** ou versão LTS posterior explicitamente validada.

Usar npm para scripts e tooling, mantendo proximidade com outros projetos do usuário.

### Python
Usar **Python 3.14.x** se o ecossistema utilizado for compatível.

Caso alguma dependência relevante ainda não suporte 3.14, usar 3.13 e registrar a razão.

Criar ambiente virtual próprio para Rotation Lab.

### SimulationCraft
Instalar/configurar o CLI `simc`.

Preferir binário oficial apropriado no Windows.

Se for necessário compilar:

- CMake;
- Ninja;
- compilador C++17 / Visual Studio Build Tools.

Build headless:

```text
BUILD_GUI=OFF
```

Pin da versão/commit usada deve ficar registrado no projeto.

### Lua
Instalar ambiente Lua compatível para lint/teste offline.

Preferir Lua 5.1 para verificar compatibilidade sintática tradicional do addon.

### LuaRocks

Instalar ferramentas como:

- luacheck;
- framework de teste Lua apropriado, se adotado.

### WoW Lua language tooling

Avaliar/adotar `wowlua-ls` ou alternativa equivalente com definições atuais da API WoW.

### Wowless

Adicionar **Wowless** como infraestrutura headless de testes do addon.

Fixar versão/commit conhecido para evitar alteração silenciosa de comportamento.

### World of Warcraft Retail

Cliente real continua sendo a autoridade final para testes de:

- taint;
- combat lockdown;
- Secret Values;
- animação;
- rendering;
- integração real.

---

# 26. Dependências opcionais

Avaliar antes de introduzir:

### AceDB-3.0
Pode ser útil para perfis.

### LibSharedMedia-3.0
Pode ser útil futuramente para interoperabilidade com fontes/texturas compartilhadas.

Não são obrigatórias para o primeiro commit.

Minimizar runtime dependencies.

Não adicionar biblioteca apenas por conveniência.

---

# 27. Testes

Criar pirâmide:

### Static
- syntax;
- lint;
- API/type checks;
- `.toc`;
- packaging.

### Unit
- State;
- Rotation DSL;
- talent activation;
- context;
- queue diff;
- undo/redo;
- profile resolution.

### Golden fixtures
Dado um estado conhecido:

```text
State X
→ Recommendation A/B/C/D
```

deve produzir resultado determinístico.

### SimC regression
Comparar:

- baseline;
- candidata;
- release anterior.

### Wowless
Verificar carregamento e comportamento headless possível.

### In-game
Criar harness de teste, por exemplo comando interno:

```text
/spynon test
```

e Demo Mode.

Nunca declarar feature como validada em WoW real se apenas testes headless foram executados.

---

# 28. Sistema canônico de tasks

Inspirar-se no modelo já utilizado pelo usuário no ResiCheck e no LOTA Manager.

Criar UMA fonte canônica de estado:

```text
project-board.json
```

Campos mínimos:

```text
schemaVersion
project
updatedAt
currentFocus
release

items:
  id
  title
  lane
  owner
  status
  priority
  source
  updatedAt
  reviewBy
  nextAction
  dependencies
  acceptanceCriteria
  evidence
```

Status:

```text
planned
in_progress
blocked
done
```

`done` exige evidência verificável.

---

# 29. Documentação derivada

Criar:

```text
docs/project/STATUS.md
```

mas esse arquivo deve ser **gerado a partir do board**, não uma segunda fila concorrente.

Criar script equivalente a:

```text
npm run project:status
npm run project:check
```

`project:check` deve detectar:

- currentFocus inexistente;
- dependência não concluída;
- task done sem evidence;
- IDs duplicados;
- status inválido;
- fila incoerente.

---

# 30. AGENTS.md

Criar protocolo obrigatório.

Antes de qualquer trabalho:

1. sincronizar Git;
2. verificar branch;
3. ler `project-board.json`;
4. localizar `currentFocus`;
5. ler a task fonte;
6. verificar se parte dela já foi implementada.

Executar apenas a task atual.

Não aproveitar para refatorar áreas fora do escopo.

No encerramento:

1. testes proporcionais;
2. `project:check`;
3. atualizar board;
4. registrar evidência;
5. commit descritivo;
6. push da branch.

Não:

- force push;
- merge automático;
- publicar release sem autorização explícita do Product Owner.

Se a branch estiver inesperadamente divergente, parar edição e reportar.

---

# 31. Fila inicial

Criar no `project-board.json` aproximadamente esta ordem:

## BOOT

### BOOT-001 — Bootstrap do repositório e toolchain
Instalar/verificar dependências, estrutura inicial e scripts.

### BOOT-002 — Governança da fila e AGENTS
Criar board canônico, STATUS gerado, checks e protocolo Codex.

---

## CORE

### CORE-001 — Contratos genéricos
Action, Recommendation, State, SpecModule, Capability.

### CORE-002 — Registry de classes/specs
Arquitetura plugável.

### CORE-003 — Detecção de spec e talentos
Ler configuração real do personagem.

### CORE-004 — Compat layer WoW
Centralizar APIs e capability detection.

---

## ROTATION LAB

### LAB-001 — Integração SimC CLI
Executar simulações automaticamente.

### LAB-002 — DSL de rotação
Representação intermediária genérica.

### LAB-003 — Compiler SimC ↔ DSL ↔ runtime
Reduzir divergência entre sim e addon.

### LAB-004 — Matriz de cenários
ST/Cleave/AoE/dungeon-like.

### LAB-005 — Optimizer
Busca automática de variantes.

### LAB-006 — Regression suite
Comparação com baseline/release anterior.

---

## SHAMAN

### ENH-001 — Catálogo Enhancement
Spells, talents, hero talents, resources, auras.

### ENH-002 — Baseline APL
Importar/normalizar prioridade de referência.

### ENH-003 — Curadoria ST
Validar comportamento.

### ENH-004 — Curadoria Cleave/AoE
Validar comportamento.

### ENH-005 — Talent-aware rotation
Validar builds diferentes.

---

## RUNTIME

### RUN-001 — State engine
Estado observável.

### RUN-002 — Recommendation engine
Produzir fila genérica.

### RUN-003 — Context detector
AUTO/ST/Cleave/AoE com fallback seguro.

---

## UI

### UI-001 — Queue estática
Primeiro protótipo visual.

### UI-002 — Animator
MOVE/ENTER/EXIT/PROMOTE/CONSUME.

### UI-003 — Hotkeys
Mapeamento e rendering.

### UI-004 — Cooldowns/charges/stacks
Overlays.

### UI-005 — Buff/debuff indicators
Apenas sinais relevantes.

### UI-006 — Demo Mode
Simulação visual para curadoria.

---

## CONFIG / UX

### UX-001 — Config básico contextual
Cards e progressive disclosure.

### UX-002 — Edit HUD
Seleção direta de elementos.

### UX-003 — Advanced panels
Configuração profunda sob demanda.

### UX-004 — Undo/Redo
Histórico transacional.

### UX-005 — Preview + reset granular
Exploração segura.

### UX-006 — Typography
Default + fontes WoW + overrides.

---

## PROFILES / SKINS

### PROFILE-001 — Persistência e perfis
Global/personagem/spec.

### SKIN-001 — Skin API
Default desacoplado.

### SKIN-002 — External reskin contract
Permitir addons de skin.

---

## BRAND

### BRAND-001 — Integrar logotipo Spynon aprovado
Localizar o asset oficial fornecido pelo Product Owner, preservá-lo e preparar somente derivações técnicas necessárias.

### BRAND-002 — Criar master técnico e variantes
Gerar versões horizontal, ícone, monocromática, light/dark e formatos necessários, sem redesenhar a marca.

### BRAND-003 — Aplicar identidade ao default
Galáxia azul + verde floresta/neon de maneira discreta e coerente com o logo aprovado.

---

## PATCH / QUALITY

### PATCH-001 — API diff pipeline
Detectar mudanças de patch.

### PATCH-002 — Secret Values audit
Regression específica.

### TEST-001 — Wowless integration
Headless.

### TEST-002 — In-game harness
Smoke real.

### RELEASE-001 — Packaging
Zip/release estruturalmente válido.

### RELEASE-002 — CI
Checks automáticos.

---

## MULTI-CLASS VALIDATION

### ARCH-001 — Segunda spec
Depois de Enhancement estar maduro, implementar uma segunda spec deliberadamente diferente.

Objetivo:

validar que adicionar nova spec exige majoritariamente um módulo de spec, sem alterar Core/UI/Animator/Profile/Skin.

Só considerar a arquitetura realmente genérica depois desse teste.

---

# 32. Critério da primeira execução desta Task Mãe

NÃO tentar implementar o produto inteiro de uma vez.

Nesta primeira rodada:

1. detectar ambiente;
2. criar/obter repositório;
3. instalar/verificar dependências básicas;
4. criar estrutura inicial;
5. criar `AGENTS.md`;
6. criar `project-board.json`;
7. criar scripts de status/check/sync;
8. documentar arquitetura;
9. registrar toolchain/version pins;
10. definir `BOOT-001` como foco;
11. executar e concluir apenas o bootstrap se possível;
12. deixar a próxima task claramente preparada.

A partir daí, trabalhar task por task.

---

# 33. Comunicação com o Product Owner

Ao finalizar uma task, responder em linguagem de produto:

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

Não despejar detalhes técnicos sem necessidade.

Quando houver decisão visual, trazer preview ou alternativas visuais.

Quando houver decisão arquitetural puramente técnica, decidir de forma autônoma, documentar e prosseguir.

---

# 34. Regra de qualidade

A prioridade do projeto não é simplesmente:

“funcionar”.

É:

```text
correto
+
performático
+
manutenível
+
bonito
+
fácil de configurar
+
fácil de atualizar em patch day
```

O default precisa ter qualidade suficiente para ser usado sem configuração.

A customização precisa ser profunda sem parecer complexa.

O sistema de rotação precisa ser comprovável por simulação sem depender de informações que o addon não pode legitimamente observar.

Essa é a identidade técnica e de produto do projeto Spynon.
