# PATCH-008 — Debuffs independentes da fila e auras parciais

## Pedido e diagnóstico

PO autorizou corrigir debuffs ausentes, usando Flame Shock como exemplo.
O módulo só selecionava indicadores referenciados por recomendações aprovadas;
provider e HUD também ocultavam tudo quando a fila ficava vazia. A leitura completa
de aura descartava presença/autoria públicas se duração ou stacks falhassem.

## Escopo

- Acompanhar debuffs de alvo já curados no catálogo da spec mesmo sem recomendação.
  Buffs continuam selecionados pelas regras; não criar rastreador geral de auras.
- Preservar indicador de Flame Shock quando Voltaic Blaze substitui o botão.
- Separar leitura parcial de aura para snapshot da leitura completa legada usada
  para stacks. Manter sonda ShouldSpellAuraBeSecret, guards e autoria pública.
  Campo secreto/ausente/inválido não autoriza ausência, duração ou stacks fictícios.
- Presença pública sem tempo pode aparecer como Ativo, sem contagem regressiva.
  Restrição total continua Indisponível. Nunca recuperar segredos por widget ou timer.
- Permitir trilho de indicadores com fila vazia em combate; limpar em troca/perda de
  alvo, saída de combate, restrição, stop/demo/config. Preservar geometria existente.
- Não alterar APL, prioridades, cooldowns, detecção de talentos ou totens.
- Testes offline, auditoria, pacote development instalado e roteiro Retail pendente.

## Aceite

1. Debuff curado não depende da presença da ação na fila, inclusive substituições.
2. Presença, autoria, duração e stacks não são confundidos nem herdam dados antigos.
3. HUD vazio de ações ainda pode mostrar indicadores válidos; lifecycle e configuração
   limpam o estado e timers corretamente.
4. Suíte completa, auditoria e instalação verificadas sem declarar aceite Retail.
