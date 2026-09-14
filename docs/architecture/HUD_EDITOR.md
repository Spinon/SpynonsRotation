# Seleção direta do HUD — UX-002

`/spynon edit`, ou **Editar HUD** em Config, inicia uma prévia estática rotulada e abre
os controles da fila. Não é uma rotação. A timeline da demo para, permitindo selecionar
componentes sem perseguir ícones. Alterações de layout ainda podem usar a transição
curta escolhida pelo usuário. Fechar/Escape ou `/spynon edit close` restaura a fila real.

## Seleção contextual

| Clique esquerdo | Controles |
| --- | --- |
| Ícone principal | Tamanho somente do principal: 85%, 100%, 115% |
| Alvo “Tecla” em qualquer ícone | Exibição compacta/completa/oculta; quatro cantos |
| Próxima ação ou área vazia da fila | Quantidade, direção, espaçamento e alinhamento |

O texto **Tecla** identifica um alvo de edição, não inventa uma bind. Permanece selecionável
mesmo sem habilidade vinculada ou quando a exibição de teclas está oculta. Bordas azuis
delimitam o componente selecionado. Os alvos não existem na fila real e não aparecem na demo
normal. Não se automatiza spell ou se modifica a action bar.

Espaçamento: Próximo=4, Padrão=8, Amplo=16 unidades locais. Alinhamento: Início/Centro/Fim;
na disposição Abaixo alinha cada fileira na largura total; nas laterais alinha as próximas
ações na altura da principal. A direção Esquerda espelha posições, não a arte. O tamanho
da principal escala a moldura e a abertura útil juntas, preservando crop proporcional.
Tamanho global da fila permanece no card Fila. Os defaults preservam UI-007/UX-001.

## Implementação e lifecycle

UI.QueueEditor é um overlay local e genérico, criado sob demanda apenas na view de teste.
Reutiliza um alvo para a fila e oito pares de alvos ícone/tecla. Fica acima de cooldowns e
textos, mas não altera esses widgets. As âncoras acompanham os frames persistentes; slots
retirados escondem seu alvo. A seleção representa o papel visual, não um ID de spell.

Queue recalcula os limites a partir de quantidade, direção, espaçamento, alinhamento e
tamanho principal. Reposiciona a mesma identidade pelo Animator. Não há timer do editor,
nova arte, recriação por clique ou consulta de estado de jogo para produzir a geometria.

Config.Controller mantém a guarda de combate público falso para abrir, selecionar e
alterar. Hide, restrição, entrada no mundo e encerramento do harness limpam callbacks e
desativam todos os alvos de mouse. Trocar para demo/prévia pelo slash também retira os
alvos e atualiza o rótulo do painel. Clique direito não muda seleção. Teclas ordinárias
continuam propagando; Escape encerra. Isso ainda exige inspeção de interação real no Retail.

Os quatro campos novos (`mainScale`, `spacing`, `alignment`, `keyPosition`) são enums
aditivos em Config.Settings. Profiles schema 1 herda seus defaults quando ausentes e
persiste overrides como as opções anteriores; não exige migração destrutiva. Copiar/resetar
perfis inclui os novos campos. Nenhuma camada recebe lógica de classe ou spec.

## Limites e evidência

Não inclui arrastar posição livre, redimensionar por alças, Undo/Redo, tipografia individual,
edição de cast ou novos assets. UX-004 trata histórico transacional; UX-006 trata tipografia.
O foco desta task é selecionar diretamente o componente e editar opções pertinentes.

`tests/unit/hud_editor_spec.lua` cobre 12 cenários: seleção, disclosure, teclas ausentes,
fechamento, troca de modos, combate, reutilização, slots retirados, persistência aditiva e
324 combinações de layout sem extrapolar os bounds. As fixtures não simulam o hit testing
nativo, a rasterização, taint ou foco do cliente. Validar esses pontos pelo checklist Retail;
a curadoria de acabamento permanece adiada pelo PO.
