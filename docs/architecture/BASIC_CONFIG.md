# Configuração contextual — UX-001

`/spynon config` abre dois cards: **Fila** e **Informações**. Escolher um assunto mostra
somente seus controles; voltar restaura os cards. Não há painel técnico, controles sem
implementação ou botão Aplicar. Abrir também inicia a demo rotulada; fechar ou Escape
encerra a demonstração e restaura o controller real.

## Opções desta entrega

| Assunto | Controle | Opções |
| --- | --- | --- |
| Fila | Recomendações | 1–4, default 4 |
| Fila | Tamanho | Pequeno 75%, Padrão 100%, Grande 125% |
| Fila | Direção | Abaixo (default), Direita, Esquerda |
| Fila | Movimento | Suave, Reduzido, Sem |
| Informações | Teclas | Curtas, Completas, Ocultas |
| Informações | Tempo restante | Mostrar / Ocultar números do cooldown |
| Informações | Buffs/debuffs relevantes | Mostrar / Ocultar trilho |

A direção altera a posição das próximas ações em relação à principal. Abaixo preserva
o handoff de UI-007 quando há quatro ações. Quantidades menores centralizam a fileira;
layouts laterais espelham posições, não texturas. Escala pertence à raiz e afeta todos os
overlays; o crop proporcional dos ícones não é alterado. A quantidade é limite de exibição,
não modifica regras da engine nem inventa recomendações quando há menos dados.

Tempo restante controla o número nativo: swipe, charges/stacks e sinais de aura continuam
independentes. O trilho ligado continua condicionado a sinais relevantes observáveis.

## Ownership e lifecycle

Config.Settings é um modelo puro de sessão, com enums/limites fechados, cópias de snapshot
e assinatura cancelável. Não conhece classe/spec ou API Blizzard. Queue observa o modelo
para atualizar apresentação real e simulada; layout preserva os frames vivos e usa o
Animator existente. Nenhuma alteração de preferências recria o pool ou reinicia a timeline.

A view conserva somente a última fila/sidecars apresentados para reaplicar mudanças. Hide
descarta o cache; mudança de restrição descarta sidecars. Não se ressuscita advice retirado.
Alterar limite pode retirar/recuperar ações da última lista recebida, sempre respeitando
o limite máximo de quatro e a segurança do contrato. Não muda a revisão do estado.

Config.Controller abre/altera somente fora de combate público, verificado por Compat.State.
Combate, entrada no mundo e mudança de restrição fecham painel/demo; a saída é idempotente,
inclusive se o harness receber o evento antes da configuração. `/spynon demo stop` ou perda
do relógio da demo também fecham o painel. Teclas normais propagam para o jogo; Escape fecha.
O painel é frame próprio, não seguro, sem atributos de ação, automação de cast ou hooks
de frames protegidos Blizzard. Assinaturas de escala e teclado constam na fonte pinada
[SimpleFrameAPI](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleFrameAPIDocumentation.lua).

`keys`, `motion` e `numbers` no controller padrão usam o mesmo modelo e atualizam os controles.
As opções explícitas de `/spynon demo reduced/off` continuam sendo overrides do modo de teste.

## Limites e validação

Nesta task as preferências duram apenas a sessão. SavedVariables, perfis e precedência são
PROFILE-001; edição direta do HUD é UX-002; painéis avançados, histórico, reset e tipografia
têm suas próprias tasks. O rodapé explica a limitação de sessão. Nenhuma dependência foi
adicionada. Componentes neutros locais preservam a direção visual sem gerar nova arte.

`tests/unit/config_spec.lua` verifica disclosure, cliques, defaults, opções inválidas,
assinaturas, layouts, escala, identidade, caches, timers, teclado, combate, ordem de eventos
e reutilização por 100 mudanças. Fixtures não validam aparência final, keyboard focus,
taint ou combate no Retail. Testar no jogo: abrir, navegar, comparar com a demo, fechar com
Escape e entrar em combate. A curadoria visual foi explicitamente adiada pelo PO.
