# Animator — UI-002

`UI/Animator.lua` interpola geometria local pública e recebe callbacks de pintura/liberação. Não lê estado
de classe, talentos, APIs de combate ou frames protegidos. `Queue.lua` reserva identidades, calcula o diff,
mantém um pool fixo de oito frames (quatro ativos e até quatro saindo) e conecta um único `OnUpdate` no root.
Não há alocação de frames/texturas por atualização, loops ociosos ou um timer por ícone.

## Transações

- MOVE: 160 ms, translação entre posições da fila; mesmo tamanho e alpha no mesmo nível.
- ENTER: 180 ms, nasce 25% da largura à direita, alpha 0 → 1, escala 0,96 → 1.
- EXIT: 120 ms, apaga e contrai localmente para 0,94; não significa ação utilizada.
- PROMOTE: 220 ms, mesma identidade da fila até a posição/dimensão principal.
- CONSUME: acento de 100 ms, compressão até 0,96, queda de alpha e flash prateado interno de baixa intensidade.

Geometria usa ease-out cúbico. Uma confirmação de consumo começa imediatamente; um diff subsequente
na mesma janela inicia promoção após 40 ms e os outros deslocamentos após 70 ms. Transações estabilizam
em até 290 ms, abaixo do limite de 360 ms; confirmações tardias não atrasam o movimento já iniciado.
Novos destinos partem da geometria efetivamente pintada. Atualizações sem mudança de prioridade não
reiniciam o movimento. A descida do principal usa MOVE com mudança de dimensão (demotion).

As duas molduras neutras aprovadas ficam pré-carregadas por identidade e fazem crossfade quando o nível
de hierarquia muda. O retângulo/crop do ícone mantém a proporção da arte nativa durante a interpolação.
Nenhum bitmap aprovado é recriado, recolorido ou trocado por tick. O flash é um retângulo procedural
limitado à abertura do ícone; nunca cobre textos, borda ou a tela. No máximo um acento de consumo fica ativo.

Retirantes obsoletos são liberados no próximo diff para limitar custo. Uma identidade que retorna antes
disso recupera seu frame e alpha atuais. Fila vazia ou inválida cancela tudo imediatamente: segurança
prevalece sobre a animação de saída. Ocultar a view/root também limpa timers e identidades.

## Confirmação e segurança

`QueueController` escuta `UNIT_SPELLCAST_SUCCEEDED`; ignora GUID e demais campos não necessários.
`Compat.Media:ConfirmedPlayerSpell` verifica `issecretvalue` antes de comparar unidade e spellID.
Guard ausente, valor protegido, outra unidade ou ID inválido omitem o efeito. O evento documentado pode
ser secreto; não se deriva informação de payload protegido nem se procura combat log alternativo.
A view só aceita uma spell confirmada que corresponda ao principal atual ou ao principal ainda saindo.
Itens, potions e trinkets não são confundidos com spells de mesmo ID. Não se deduz consumo por cooldown,
ausência de recomendação, alteração de prioridade ou mera tentativa de cast.

O efeito é feedback visual de sucesso do cast, não prova de dano, acerto no alvo ou resultado ótimo.
Se o principal já tiver sido removido por restrição/ausência de dados, nenhuma animação é ressuscitada.

## Acessibilidade e limites

- `/spynon motion normal`: default com movimento curto.
- `/spynon motion reduced`: MOVE instantâneo, entradas/saídas com fade até 100 ms, promoção com fade
  entre âncoras (sem viagem longa), consumo somente por alpha, sem flash/compressão.
- `/spynon motion off`: atualizações imediatas, sem timer ou acento.

A preferência é de sessão e preservada ao fechar/reabrir o preview, mas não após `/reload`. Persistência
e painel contextual pertencem às tasks de Profiles/UX. `QueueFactory.Create(..., "OFF")` mantém o harness
estático de TEST-002. UI-006 ainda fornecerá timelines demonstráveis sem combate.

Canaletas permanecem neutras: fluxos de pronto/cooldown/proc/aura dependem dos estados visuais das tasks
seguintes e não são simulados como disponibilidade real aqui. Esta task entrega as cinco transações da fila.

## Fontes e validação

Tempos: [HUD_MOTION_STATES](../product/HUD_MOTION_STATES.md). Assets: handoff aprovado já distribuído.
Fontes extraídas da Blizzard para o commit fixado da build 69814:
[UnitDocumentation](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua),
[SimpleRegionAPI](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleRegionAPIDocumentation.lua).

O pipeline de API continua com 22 arquivos idênticos entre builds; snapshots foram regenerados com
ownership adicional do evento em Media/QueueController, sem mudar commits, cobertura ou allowlist.

Fixtures em `tests/unit/animator_spec.lua` cobrem tempos, interrupções, consumo, guards, modos, cleanup,
identidades e pressão de 100 diffs. São frames simulados em Lua, **não rendering no Retail/Wowless**.
Grupos nativos foram preteridos por um controlador compartilhado curto para permitir retarget contínuo
sem ler offsets/alpha potencialmente protegidos dos frames. Quando estável, `OnUpdate` é removido.
A captura inicial do Product Owner antecede este Animator e não valida suas animações. Revisão em jogo pendente.
