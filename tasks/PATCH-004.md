# PATCH-004 — Diagnóstico da fila real vazia

## Origem

PO autoriza debug em 15/09/2026 após captura Retail: build 69814 aceita, estado
válido, 97 sinais públicos e zero recomendações durante ataque ao boneco.
Captura de talentos confirma visualmente Aperfeiçoamento/Totêmico; não prova
que a detecção interna tenha reconhecido a árvore nem a causa da fila vazia.

## Escopo autorizado

Ampliar `/spynon test` e fornecer `/spynon debug` para capturar uma amostra atual:
estado de combate observável, spec/hero tree detectados, lista escolhida, contexto,
distribuição dos motivos de descarte, causas de indisponibilidade de readiness e
falhas de leitura por códigos. Persistir junto ao relatório existente.

Diagnóstico genérico, somente metadados públicos/sanitizados: sem dumps de tabelas
Blizzard, valores secretos, nomes/GUIDs, chat, combat log, talentos completos ou
mensagens brutas de exceção. Amostras e saída no chat limitadas e determinísticas.
Ausência de um método diagnóstico em fixtures deve ser tratada como indisponível.

Não mudar prioridades, seleção de talentos, gates, disponibilidade ou decisões da
rotação; não relaxar guards para obter recomendações. Novas APIs voláteis não são
necessárias. Causa real só será afirmada após evidência do cliente, não por hipótese.

## Aceite técnico

- Snapshot diferencia lista não selecionada, condições falsas/desconhecidas e
  ação inutilizável, cooldown ativo ou readiness não observável.
- Relatório salvo e chat orientam o próximo teste; leitura não altera a fila.
- Testes cobrem árvores/listas via fixtures, dados indisponíveis, limites e ausência
  de vazamento de dados; suíte completa e smoke headless aprovados.
- Instalar checkpoint development e registrar que TEST-002 ainda requer nova
  captura Retail; não declarar bug corrigido ou rotação homologada.
