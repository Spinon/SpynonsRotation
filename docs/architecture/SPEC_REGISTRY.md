# Registry de classes/specs

O registry conecta módulos de especialização ao Core sem conhecer classe, spec ou regras concretas. Ele depende somente do contrato `SpecModule` e não chama APIs do WoW.

## API pública

`Spynon.SpecRegistry.Create()` cria um registry isolado. `Spynon.Specs` é a instância padrão carregada pelo addon.

```lua
local module, moduleError = Spynon.Contracts.SpecModule.Create({
  id = "class.spec",
  classId = 1,
  specId = 101,
  displayName = "Example",
  version = "1",
  getActions = function() return {} end,
  getRules = function() return {} end,
})

if module then
  local registered, registrationError = Spynon.Specs:Register(module)
end
```

Operações disponíveis:

- `Register(module)`: valida pelo contrato `SpecModule` e registra de forma atômica;
- `GetById(id)`: consulta pela identidade estável `class.spec`;
- `GetBySpecId(specId)`: consulta pelo ID numérico da especialização;
- `List()`: retorna uma cópia ordenada lexicograficamente por `id`;
- `Count()`: retorna a quantidade registrada.

Consultas ausentes retornam `nil, erro`. Registro inválido ou conflitante também retorna `nil, erro`; o estado anterior permanece intacto.

## Invariantes

- `id` e `specId` são únicos dentro de cada registry;
- a validação de `SpecModule` é a única fronteira aceita;
- a ordem de `List()` independe da ordem de carregamento;
- arrays retornados por `List()` pertencem ao consumidor e podem ser alterados sem corromper o registry;
- módulos registrados permanecem sob ownership de quem os criou e devem ser tratados como imutáveis;
- registries criados pela fábrica não compartilham índices.

## Ordem de carregamento

```text
Namespace
  ↓
Contratos, incluindo SpecModule
  ↓
SpecRegistry + instância Spynon.Specs
  ↓
Módulos de spec declarados posteriormente no TOC
  ↓
Bootstrap
```

Lua não descobre arquivos dinamicamente no cliente. Cada pacote de spec declara seu arquivo no TOC após o registry e chama `Spynon.Specs:Register`; adicionar o módulo não exige alterar a implementação do Core.

Detecção da spec ativa pertence à `CORE-003`. APIs da Blizzard e fallbacks pertencem à `CORE-004`. O registry não avalia `getActions`, `getRules` nem capabilities.
