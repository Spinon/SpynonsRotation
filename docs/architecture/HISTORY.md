# Histórico transacional — UX-004

Config oferece **Desfazer** e **Refazer** para as preferências editadas pelo painel. Cada
clique constitui uma ação. No editor do ícone principal, o controle deslizante compara os
três tamanhos existentes (85%, 100%, 115%): mudanças enquanto o mouse está pressionado são
temporárias; soltar confirma uma única ação. Não é arraste livre da posição do HUD.

## Transações e segurança

Config.History mantém até 50 ações nesta sessão. Begin captura overrides do alcance atual;
Preview atualiza somente Config.Settings; Commit grava atomicamente os campos alterados.
Voltar ao tamanho inicial não grava nem cria ação. Cancelar restaura a resolução do perfil.
Navegar, fechar/Escape, perder o preview ou entrar em combate cancela o arraste pendente.

Undo/Redo restaura também a ausência de um override: desfazer uma preferência originalmente
herdada volta a herdar, em vez de congelar o valor observado. Escrever explicitamente um
valor herdado é uma alteração válida; repetir o mesmo override não cria outra ação.
Uma edição nova descarta Redo. Nenhum histórico é gravado em SavedVariables.

Profiles revalida identidade e combate no limite da escrita. Snapshots carregam identidade,
alcance e apenas preferências conhecidas válidas. Apply valida todos os campos antes de
alterar o banco. Restore exige que o estado atual corresponda ao esperado e altera somente
os campos diferentes, preservando extensões desconhecidas e valores inválidos não envolvidos.
Troca de alcance/spec, cópia/reset, eventos de atualização e edição pelo slash invalidam o
histórico. Divergência inesperada do banco também impede a restauração de um snapshot antigo.

Restaurar perfil continua sendo operação distinta e confirmada, não um sinônimo de Undo.
Reset granular e exploração confirmada foram acrescentados em UX-005:
[`PREVIEW_RESET.md`](PREVIEW_RESET.md). Não há atalhos globais
Ctrl+Z/Ctrl+Y: botões evitam disputar bindings do jogo. Fora da configuração, não há slider ativo.

## Implementação e validação

History é puro; HistoryBinding liga snapshots ao Profiles e ao modelo de apresentação.
Notificações internas não invalidam a própria transação; atualizações externas invalidam.
PreviewSlider usa widget nativo e texturas de cor locais, sem timer ou asset novo. Atualizar
seu valor por código não cria histórico. Assinaturas constam na fonte pinada
[SimpleSliderAPI](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleSliderAPIDocumentation.lua).

`tests/unit/history_spec.lua` cobre 23 cenários, incluindo 100 mudanças agrupadas, ordem de
eventos do slider, cancelamento, limites, herança, cópia/reset, identidade, escrita atômica,
dados desconhecidos, estado somente leitura e reconstrução sem histórico persistido.
As fixtures não comprovam captura de mouse, foco, rendering, combat lockdown ou taint no
Retail. O checklist real permanece em RETAIL_SMOKE; acabamento visual está adiado pelo PO.
