# Textos e legibilidade — UX-006

Em `/spynon config`, Informações → Textos e legibilidade mostra fonte, tamanho base,
contorno e sombra. Por elemento revela Teclas, Tempo restante, Cargas e acúmulos e
Rótulos; cada propriedade pode herdar Global ou ter um ajuste próprio. Nenhum caminho
técnico de fonte aparece no painel. Não é uma revisão da arte nem aprovação visual Retail.

## Contrato

Settings acrescenta 20 propriedades fechadas: prefixos `text`, `hotkey`, `cooldown`,
`stacks`, `labels`; sufixos `Font`, `Size`, `Outline`, `Shadow`. Global usa WOW,
1, OUTLINE e SOFT. Elementos começam em INHERIT. Famílias: WOW e NUMBERS; fatores:
0.85/1/1.15; contorno: NONE/OUTLINE/THICKOUTLINE; sombra: NONE/SOFT. Sem fonte externa,
download, LibSharedMedia ou arquivo de usuário. O perfil antigo herda os novos defaults.

Precedência: base → skin → perfil global/personagem/spec → resolução da propriedade
do elemento → global tipográfico → default. Valores inválidos no perfil não entram
no modelo. Resolver isolado também degrada valores inválidos. Nomes do WoW resolvem
`GameFontNormalSmall`/`NumberFontNormal`, com fallback para a fonte nativa capturada
no FontString criado com o template da skin. Falha de carregamento tenta esse fallback;
falha de ambos preserva o texto existente, sem introduzir arquivo externo.

Tamanhos de referência: teclas 12–14, cooldown 14, cargas 12, nomes 10 e detalhe de
indicadores 9; limite final 8–32. O detalhe de indicadores (acúmulos/tempo/estado) usa
o papel stacks. Placeholder usa labels. Teclas largas mantêm a tentativa menor e,
se ainda não couberem, são ocultadas, nunca truncadas para outra combinação.
O painel de configuração conserva sua própria tipografia para continuar operável.

## Fronteiras e ciclo de vida

Compat/Fonts resolve os objetos nativos e cria fonts privados para cooldown, com
nomes próprios, limite vitalício de 64 tentativas e sem sobrescrever nomes existentes.
Typography resolve e aplica somente apresentação; não conhece classe, spell nem tempo.
Binding guarda o estilo pelo snapshot imutável de Settings e evita SetFont/Shadow
repetidos quando o tamanho e o estilo não mudam. Nenhum font é criado por frame de animação.

Cada overlay reutiliza um font próprio: SetCountdownFont recebe seu nome; o widget
nativo continua desenhando o tempo. Não usamos GetText/GetRegions, conversão de
DurationObject, parser de texto ou alteração de font compartilhado da Blizzard.
Sem CreateFont, o cooldown conserva a apresentação nativa. Swipe, GCD, números
ocultos e duração opaca continuam independentes dos estilos.

As preferências usam o writer de Profiles e o History existente: Experimentar/Manter,
Cancelar, Desfazer/Refazer e restauração granular. Restaurar o global tipográfico não
apaga overrides individuais; restaurar Informações inclui todos os textos. Troca de
contexto/combate fecha a edição como antes. Nenhum controle joga pelo usuário.

## Fontes verificadas

- [FontString API, build 69814](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleFontStringAPIDocumentation.lua): SetFont retorna sucesso; sombra é configuração de apresentação.
- [SimpleFont API](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleFontAPIDocumentation.lua): SetFont não retorna bool; pcall e `success ~= false` atendem os dois tipos.
- [FontableFrameMixin da Blizzard](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_SharedXML/FontableFrameMixin.lua): criação de font privado por CreateFont.
- [Cooldown API](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/FrameAPICooldownDocumentation.lua): SetCountdownFont recebe nome, não leitura do contador.

## Validação

`tests/unit/typography_spec.lua` cobre defaults, limites, fallback de API/arquivo,
precedência, cache, pool/collision, duração opaca, perfil antigo, reset, skin e navegação.
Os testes são offline. Legibilidade real, comportamento de alfabetos/locales, estilos
nativos de cooldown e taint ainda precisam da inspeção Retail de TEST-002.
