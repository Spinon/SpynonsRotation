# Cooldowns, charges e stacks — UI-004

O HUD mantém Recommendation/Action como contratos de identidade. A apresentação consulta
`Compat.Cooldowns`; nenhum DurationObject, relógio visual ou objeto da API entra nas regras,
nos contratos do Core ou em SavedVariables.

## Cooldown individual

Cada célula do pool possui um CooldownFrameTemplate ancorado somente ao retângulo do ícone.
O swipe nativo é cinza, sem edge/bling, com `reverse=false`. O cliente controla o progresso
e a contagem central; não se lê nem serializa o conteúdo do DurationObject.
Hotkeys e contagens ficam em um frame acima do swipe, sem badge adicional.

O adapter limpa o widget antes de cada leitura. Para spells usa
`C_Spell.GetSpellCooldownDuration(gameId, true)`: o segundo argumento exclui o GCD.
Com cargas públicas positivas abaixo do máximo, usa `GetSpellChargeDuration` para mostrar
a recarga parcial. A aplicação usa `SetCooldownFromDurationObject(duration, true)`;
objeto ausente, handle secreto, API ausente ou rejeição pelo widget deixam o cooldown vazio.
Uma duração numérica restrita não impede encaminhar um handle público opaco ao sink nativo.
Não há tentativa de desbloquear dados, inferir tempo restante ou aplicar fallback numérico.

`/spynon numbers on|off` controla somente o número nativo, sem desligar o swipe.
É uma preferência da sessão, ainda sem persistência, fontes customizadas ou precisão decimal.
O cliente decide a formatação e o encerramento da contagem; sua aparência real exige inspeção Retail.

## Contagens

Charges públicas têm precedência sobre stacks. Sem mecanismo de charges, o adapter aceita
aplicações públicas de uma aura do próprio jogador com o mesmo spell ID da ação.
Somente inteiros de 1 a 9999 são exibidos, no canto inferior direito. Zero, ausência e valor
restrito ocultam o texto. Falha ao ler charges não é interpretada como ausência de charges.

Não há associação implícita entre recursos, buffs e spells diferentes: por exemplo,
Maelstrom Weapon não é colado a Lightning Bolt por uma condição de Shaman na UI.
Mapeamentos decisivos entre IDs pertencem ao módulo da spec e à task de indicadores.
Itens, trinkets e poções ficam sem estes overlays: seus IDs nunca são consultados como spells.

## GCD e lifecycle

O GCD é separado do radial: trilho grafite e preenchimento prata procedural somente no
rodapé da ação atual, com geometria normalizada do handoff. Cresce da esquerda à direita.
`Compat.State` lê o cooldown 61304 e o relógio com os guards já existentes. Somente duração
positiva, relógio público e modRate 1 produzem progresso. Dados restritos, relógio anterior
ao início ou término removem o preenchimento; não se inventa uma duração padrão.

Fila e animação compartilham um único OnUpdate, removido ao terminar ou ocultar. O Cooldown
nativo não exige um timer Lua por célula. Mudanças publicadas pelo StateEngine, incluindo
SPELL_UPDATE_COOLDOWN, SPELL_UPDATE_CHARGES e UNIT_AURA, renovam os overlays mesmo quando
as identidades não mudam. Restrição limpa todos os overlays; fila vazia retira o HUD inteiro.
Assim, se a engine retirar recomendações durante GCD, a barra também desaparece: este trabalho
não retém conselhos antigos nem muda a elegibilidade da engine para manter uma decoração.

O preview estático de TEST-002 continua identificado como simulado e não inventa cooldowns.
A timeline de demonstração é UI-006. Nenhum frame é criado durante atualizações do pool.

## Fontes e evidência

- [SpellDocumentation, build 69814](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellDocumentation.lua)
  documenta os getters de DurationObject, ignoreGCD e as restrições de chamada.
- [FrameAPICooldownDocumentation, build 69814](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/FrameAPICooldownDocumentation.lua)
  documenta Clear, o sink de duração, clearIfZero e os controles visuais.
- `tests/unit/cooldown_overlay_spec.lua` cobre opacidade, handles secretos, falhas, cargas,
  stacks, limites do ícone, camadas, GCD e limpeza. São fixtures, não renderização do cliente.
- O pipeline compara 26 fontes pinadas entre 69587 e 69814. Isso não amplia a allowlist
  além de smoke de desenvolvimento nem aprova combate/taint.

A captura fornecida pelo Product Owner mostra a prévia estática anterior. Ela não valida
este swipe, duração, contagens, GCD ou ordem efetiva de camadas no cliente. TEST-002 permanece pendente.
