# Fila estática — UI-001

A fila consome somente `Recommendation[]` seguro e já enriquecido com ícone. `Compat.Media` resolve
`kind + gameId` via `C_Spell.GetSpellTexture` ou `C_Item.GetItemIconByID` antes de chamar a view.
Não há import de classe/spec na UI, nem ícones baixados ou ilustrações distribuídas pelo addon.

## Composição

`QueueFactory.Create(createFrame, parent, motionMode)` cria um root passivo e oito frames reutilizáveis
(quatro ativos e até quatro saindo, a partir de UI-002). O modo padrão é NORMAL; OFF preserva o preview estático.
`QueueController` conecta o serviço de recomendações à resolução de mídia e à view no bootstrap.

- Ação atual: 200 × 120 unidades de UI, centralizada acima da fila.
- Próximas três: 80 × 80, com gap 8, na linha abaixo; conjunto 256 × 214.
- Âncora inicial: centro da UI, deslocada 130 unidades para baixo. Não bloqueia mouse ou teclado.
- Masters neutros aprovados do handoff v1, com UVs de conteúdo que excluem o padding.
- Ícone nativo com recorte central proporcional; sem esticar arte quadrada para preencher a ação atual.
- Placeholder local procedural, grafite com `?`, quando o ícone está ausente, protegido ou não carrega.
  Usa exatamente o mesmo retângulo, âncora e proporção do ícone real.
- Fila vazia fica oculta. Menos de quatro recomendações mostra somente as disponíveis.
- Entrada inválida/restrita oculta o root em vez de continuar exibindo uma decisão anterior.

As medidas são o primeiro default técnico das proporções aprovadas em `HUD_MAIN_LAYOUT.md`, não uma
nova aprovação visual do Product Owner. Escala efetiva e recortes precisam ser inspecionados no Retail.
Os masters, hashes e máscaras aprovados não foram sobrescritos ou reinterpretados.

## Identidade e lifecycle

Frames sobreviventes são reservados por `Recommendation.id` antes de reutilizar os removidos. Promoção
altera dimensão e âncora do mesmo frame. Não há destruição/recriação de ícones a cada update.
Interpolação, retomada, saídas simultâneas e consumo estão descritos em [ANIMATOR.md](ANIMATOR.md).

`SetRecommendations`, `Hide`, `GetRoot` e `GetFrameForId` expõem somente a superfície da view.
`QueueController:Start/Stop` administra uma única assinatura e reaproveita a instância após restart.
UI-003 adiciona um mapa lateral de teclas sem mudar Recommendations; resolução e overlays estão em
[HOTKEYS.md](HOTKEYS.md).

As canaletas permanecem neutras. GCD, radial, texto de cooldown, hotkeys, charges/stacks, cast, indicadores,
contexto e assinatura continuam fora desta task. Não se simula um estado luminoso ou uma aprovação desses
componentes antes de implementá-los.

## Validação e próximo teste

`tests/unit/queue_spec.lua` verifica layout, pool, promoção, descarte, quatro recomendações, crop proporcional,
UVs aprovadas, placeholder, resolução spell/item, Secret Values e lifecycle. O ambiente de frames é uma
fixture Lua: **não é rendering no WoW nem Wowless**.

`npm test` verifica o conjunto offline. O próximo passo é TEST-002: harness e smoke no Retail para confirmar
texturas, legibilidade, geometria, eventos, restrições e ausência de taint. Nenhuma validação em jogo é alegada.
