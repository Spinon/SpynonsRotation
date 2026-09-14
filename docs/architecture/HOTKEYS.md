# Hotkeys — UI-003

`Compat.Bindings` observa as barras nativas; `UI.Hotkeys` formata texto; a view recebe um mapa lateral
`Recommendation.id → tecla`. Não há campos novos em Action/Recommendation nem influência na rotação.
O addon não altera binds, clica botões ou instala atributos seguros.

## Resolução

O adapter percorre até 96 botões conhecidos das oito barras Blizzard. Somente botões visíveis e com
campo `action` público positivo: esse campo representa o slot atual, incluindo paginação da barra
principal. `GetActionInfo` deve retornar spell/item e ID público válido. Macros são ignoradas, sem
deduzir seu resultado pelo ícone ou nome.

`bindingAction` segue `ActionBarActionButtonMixin:UpdateHotkeys`. `GetBindingKey` fornece primeira/segunda
teclas e alternativa `CLICK <botão>:LeftButton`. Cada candidata é confirmada com `GetBindingAction(key, true)`
para rejeitar binds sobrescritos. Duplicatas: ordem estável das barras e botões, primeiro válido vence.
`C_Spell.GetBaseSpell` normaliza aliases públicos da spec atual; falha permite somente match exato.
Items/trinkets/potions ficam separados de spells com mesmo número. Nenhuma disponibilidade é inferida.

Retornos, campos e teclas passam por `issecretvalue` antes de comparação/formatação. Guard ausente,
API falhando, slot protegido ou identidade inválida omitem o binding afetado. Sem erros crus ou markup.
O índice é reconstruído por eventos de bindings, páginas, slots, spells, barras alternativas, macros,
mundo, CVars e saída de combate. Restrição limpa e bloqueia o índice sem ler APIs antes da transição;
outro evento de invalidação permite nova leitura guardada. Renders reutilizam o índice, sem polling por frame.

## Apresentação

- Canto superior direito, acima das texturas; sem background/badge.
- Fonte herdada do WoW com outline, tamanho 14 no principal e 12 na fila.
- Redução limitada a 10 para strings longas. Se ainda não couber, ocultar, nunca truncar uma instrução.
- Texto acompanha a identidade durante animação; ausência limpa o binding anterior.
- `/spynon keys compact`: default; SHIFT-3 → S3, CTRL-Q → CQ, ALT-E → AE, BUTTON4 → M4.
- `/spynon keys full`: tecla original, sujeita à largura legível disponível.
- `/spynon keys off`: ocultar texto sem mudar recomendações.

Preferências duram a sessão. Painel contextual, offsets/tamanhos configuráveis e persistência pertencem
às tasks UX/Profiles. `/spynon test show` consulta teclas das ações ilustrativas ao abrir, mas permanece
um preview simulado, não uma rotação.

## Limites

Barras ocultas, botões customizados de outros addons, macros, flyouts, binds diretos fora das barras
e barras especiais de pet/possessão não recebem associações presumidas. Texto ausente não prova que
o jogador não tem tecla configurada. Não se lê o label abreviado do botão para reconstruir um binding.
Visibilidade, aliases e overrides reais continuam sujeitos ao teste Retail.

## Fontes e validação

Blizzard UI Source extraído e fixado para 69814:
[ActionButton.lua](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_ActionBar/Shared/ActionButton.lua),
[ActionButtonUtil.lua](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_ActionBar/Shared/ActionButtonUtil.lua),
[SpellDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua).

Pipeline expandido de 22 para 25 arquivos: KeyBindingsDocumentation e os dois helpers legados acima.
Caminhos legados explicitamente permitidos, sem acesso arbitrário/traversal. Snapshots recapturados
dos mesmos commits, hashes atualizados e diff revisado (zero alterações entre builds).

`tests/unit/hotkeys_spec.lua`: resolução, cache, paginação, remapeamento, overrides, aliases, segredos,
falta de APIs, macro/item/spell, formatação e overlay. Fixtures Lua não comprovam rendering real.
Reteste: `/reload`, `/spynon test show`, comparar teclas com as barras; `test hide` antes de combate.
