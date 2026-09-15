# PATCH-007 — Barra de GCD com temporizador nativo

## Pedido e causa

PO apontou que a correção de continuidade esqueceu a barra de GCD existente.
ReadGCD ainda exige startTime/duration/modRate públicos e a barra é uma textura
redimensionada por aritmética. No caso restrito ela não recebe progresso, embora
PATCH-006 mantenha a fila em espera. O rótulo GCD não substitui a barra.

## Escopo

- Reutilizar dimensões, âncora e cores da barra atual, sem redesenhar HUD/config.
- Encaminhar DurationObject do GCD 61304 para StatusBar:SetTimerDuration, mediante
  API disponível, status público habilitado/ativo e handle público. Nunca inspecionar
  o objeto, ler valor da barra ou reutilizá-lo como entrada da engine.
- Conter erros, esconder progresso anterior em ausência/restrição, demote, hide e
  parada; manter fallback numérico existente somente quando os tempos forem públicos.
- A barra nativa avança sem timer Lua de progresso. Não alterar prontidão, prioridades,
  WAITING_GCD, cooldowns próprios, estimativas ou assistente oficial.
- Pinar SimpleStatusBarAPIDocumentation nas duas builds revisadas, regenerar diff,
  rever auditoria e testar encaminhamento opaco, layout, lifecycle e integração.
- Empacotar e instalar checkpoint development para reteste Retail.

## Aceite

1. Com tempos restritos e status/handle públicos, o widget recebe DurationObject
   sem acessar seus campos e ocupa a mesma barra do slot principal.
2. Demote, limpeza, falha/ausência de API/handle e GCD inativo ocultam progresso velho.
3. Caminho nativo não depende de OnUpdate Lua; fallback público anterior preservado.
4. Suíte, auditoria, pins e pacote aprovados; instalação verificada, Retail pendente.

Fonte: https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleStatusBarAPIDocumentation.lua
