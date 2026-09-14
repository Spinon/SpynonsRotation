# Registro externo versionado — SKIN-002

O global **SpynonRotationSkins** publica a API v1 para addons de skin. Registro é declarativo:
não escolhe uma skin, não altera preferências, não executa callbacks de apresentação e não
troca o HUD automaticamente. Esta entrega cobre registro, descoberta e resolução interna;
não inclui seletor de skins nem hot swap. A instalação atual continua usando Spynon default.

## Superfície pública

| Campo/chamada (notação com ponto) | Resultado |
| --- | --- |
| apiVersion | 1 |
| Register(addonName, definition) | true, REGISTERED; ou false, código estável |
| Get(id) | cópia da definição completa, nome do addon; ou nil, UNKNOWN_SKIN |
| List() | cópias de id/label/owner/schemaVersion, ordenadas por ID |

A definição segue [`SKINS.md`](SKINS.md), schemaVersion=1. O ID precisa começar com o nome
da pasta do addon em minúsculas seguido de ponto, como `spynonskin_example.demo`. O nome
de addon declarado aceita letras/dígitos, '_' e '-'. Esse ownership é uma regra cooperativa
de integração, não autenticação nem sandbox de addons. Dados devem ser públicos e locais,
nunca valores secretos ou objetos retornados por APIs de combate.

## Conflitos, capacidade e fallback

- ID já registrado retorna DUPLICATE_ID, inclusive repetição do mesmo addon. O primeiro
  registro válido permanece intacto; não há substituição silenciosa ou upgrade na sessão.
- Versão diferente de 1 retorna UNSUPPORTED_VERSION. O chamador deve conferir apiVersion
  antes de registrar; versão futura não é interpretada como compatível.
- Namespace incorreto retorna NAMESPACE_MISMATCH. Campos/ranges inválidos usam os erros
  do contrato: INVALID_DEFINITION, INVALID_IDENTITY, INVALID_TOKENS, INVALID_DEFAULTS ou UNKNOWN_FIELD.
- Texturas só referenciam a pasta declarada ou SpynonRotation (fallbacks embutidos).
  Outra pasta retorna FOREIGN_ASSET_PACKAGE; formato inválido retorna INVALID_TOKENS.
- Limite de 32 skins por sessão, incluindo default; excesso retorna REGISTRY_FULL.
- Um global preexistente nunca é sobrescrito: export retorna GLOBAL_CONFLICT e registra
  esse resultado no namespace interno. O addon base continua com a skin default.
- Resolver interno desconhecido usa default com FALLBACK_UNKNOWN_SKIN, cobrindo um addon
  de skin que não esteja registrado/carregado. Get público mantém a ausência explícita.

Get/List não expõem a instância compilada, frames, controllers ou referências internas.
Alterar uma cópia recebida não altera o registro. O formato do caminho não prova que um
arquivo exista nem que seu alpha/UV seja adequado: o pacote externo exige validação Retail.
Não há download, carregamento forçado de dependências ou execução de Lua fornecida como token.

## Exemplo real de addon

`examples/SpynonSkin_Example/` contém TOC e Skin.lua mínimos. O TOC declara RequiredDeps:
SpynonRotation e o arquivo registra `spynonskin_example.demo` uma vez, durante carregamento.
O uso de dependência no TOC segue a sintaxe documentada pelo
[tooling WoW Lua adotado](https://tradeskillmaster.github.io/wowlua-ls/guide/toc-files.html).
O exemplo altera apenas dados de cor/spacing herdando os assets existentes; não cria arte
nova, não se auto-seleciona e não muda a skin aprovada. Se a API estiver ausente/incompatível,
o arquivo retorna sem registrar. Duplicatas retornam o código, sem apagar a primeira versão.

O exemplo não entra no TOC principal e não é copiado pelo instalador de desenvolvimento.
É fonte de integração para desenvolvedores, não um novo addon instalado no cliente do PO.
Instalação separada e escolha de aparência não foram inferidas como autorização nesta task.

## Evidência

`tests/unit/external_skins_spec.lua` executa o **mesmo Skin.lua** com ambiente e namespace
separados, consulta o registro e injeta a skin resolvida na Queue real para validar o layout.
São 16 cenários: API, versão, conflitos, cópias, capacidade, pacote, fallback, TOC e ausência
de efeitos colaterais. Testes offline não comprovam o loader Retail, taint ou rendering.
O checklist real deve distinguir registro no cliente de mera execução em fixture Lua.
