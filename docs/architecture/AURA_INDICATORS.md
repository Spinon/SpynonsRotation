# Indicadores decisivos — UI-005

O trilho fica abaixo da fila, com três células por padrão e pool máximo de cinco. Não é uma
segunda barra de buffs do WoW. Estado de combate incerto ou spec incompatível retiram os
indicadores; fila vazia não retira debuffs curados independentes. Não se mantém informação antiga.

## Seleção e contratos

SpecModule ganha o hook opcional `getIndicators(selection, recommendations)`. Módulos sem
o hook continuam válidos. O módulo piloto seleciona somente auras/recursos de stacks que
aparecem em READ_STATE das regras compiladas correspondentes às recomendações atuais,
além dos debuffs de alvo já curados no catálogo, independentemente da fila.
Confere tanto reason.code quanto action.id, preserva filtros de talentos e converte recursos
de aura pelo próprio catálogo. Não há ID, nome de spell ou condição de Enhancement no Core/UI.

Isso explica entradas das regras selecionadas, não prova contrafactual de que cada entrada
foi isoladamente decisiva numa expressão ANY. Não há importação de toda aura ativa nem nova
regra de rotação manual. A seleção muda junto com as recomendações; não há alteração de APL.

Core.IndicatorEngine lê o snapshot por StateReader, preservando capabilities mais específicas,
guards de valores e ownership de debuffs do alvo. A UI recebe Indicator genérico junto de
Recommendation, nunca catálogo ou objeto de spec. Compat.Media resolve o ícone nativo.

Indicator contém identidade, nome, tipo buff/debuff, spellId, ícone opcional, estado, expiração
pública opcional, stacks positivos, aviso de expiração e flag explícita de refresh recomendado.
UNAVAILABLE/ABSENT não carregam expiração ou stacks. Não há DurationObject, objeto de aura
bruto ou dado secreto no contrato. Valores protegidos não são transformados em ausência.

## Estados e tempo

- ABSENT: a leitura pública confirmou ausência de um sinal consultado pela regra selecionada.
- REFRESH: o módulo explicitou que a recomendação atual reaplica o debuff relevante.
- ATTENTION: faltam até três segundos de uma duração pública; é aviso visual de expiração,
  não uma janela de pandemic ou uma nova instrução para alterar a prioridade.
- STABLE: sinal ativo observável fora do aviso; auras sem duração mostram Ativo/quantidade.
- UNAVAILABLE: campo necessário indisponível, propriedade do debuff incerta ou snapshot expirado.

Término calculado de uma duração nunca vira ABSENT: aguarda observação real. O texto troca
para — e o encaixe de urgência fica vazio. Perda de relógio público também não inventa tempo.
O renderer consulta Compat.State a cada 200 ms somente enquanto existem durações pendentes;
encerra seu timer em repouso, Clear, Hide ou restrição. Não há timer Lua por célula.

A ordem é ausente, renovar, atenção, estável, indisponível; desempate por ID estável.
O cronômetro não reordena dentro de uma faixa. As células preservam identidade, e mudanças
de faixa reposicionam sem acrescentar uma nova animação que altere o movimento da Queue.

## PATCH-008 — tracking independente

Flame Shock usa a aura de alvo 188389, não o ID do botão. Continua selecionado com
fila vazia, regra descartada ou substituição por Voltaic Blaze. Buffs do jogador
continuam contextuais. Uma célula do limite existente é reservada ao debuff curado
mais urgente quando buffs ocupariam todas as posições; não aumenta a densidade.

Compat.ReadAuraState mantém a mesma sonda de segredo e consulta exata da leitura
completa ReadAura. Somente um resultado público autorizado confirma presença;
autoria, duração, expiração e aplicações passam por guards independentes. Campos
opcionais indisponíveis são omitidos, nunca copiados do snapshot anterior. ReadAura
continua estrita para consumidores legados de stacks. Sem autoria pública, uma aura
de alvo não entra como aura própria. Duração ausente não invalida presença pública:
o indicador mostra Ativo sem segundos; expiração pública vencida continua indisponível.

Restrição total mostra —, não AUSENTE. Não há novo caminho para ler auras secretas,
DurationObject de debuff, previsão, alteração de APL ou promessa de recomendação.
Estado novo pode liberar condições baseadas somente na presença pública, mas não
condições que ainda dependem de tempo indisponível.

O root pode conter apenas indicadores; esvaziar ações limpa slots/cooldowns, não o
trilho. Desligar/religar indicadores conserva configuração, enquanto hide/stop e
restrição limpam dados e timers. Troca/perda de alvo substitui observações; saída
de combate retira o trilho. Inspeção visual Retail continua pendente.

## Apresentação e demo

Células iniciais de 120×37,65 unidades, gap 8, nome e estado à direita, ícone quadrado à
esquerda. Tipo também aparece em texto, e Renovar/Expira complementam a cor de urgência.
Usa masters neutros e máscara do encaixe inferior do handoff, com hashes preservados.
O tipo tem um segmento curto estático azul/vermelho, não uma borda luminosa inteira.
O fluxo contínuo dessa canaleta e refinamentos de escala/tipografia ficam para o ajuste
visual posterior solicitado pelo PO; nenhuma aprovação visual desta montagem foi inferida.

Ausente/indisponível dessaturam o ícone; a falta de arte usa bloco neutro com ?. Os cantos
das actions não recebem badges. Não se implementa leitura de cast ou a barra de cast nesta task.

`/spynon demo` agora inclui três sinais genéricos com estável, atenção, renovar, ausente,
indisponível e stacks. Tempos e auras são fictícios, e o aviso permanente continua visível.
Ícones de exemplo são reaproveitados das actions presentes; sem fonte, usa placeholder.
Não se consultam auras reais para produzir a demo e não se modifica SavedVariables.

## Validação

`tests/unit/indicators_spec.lua` cobre modelo, secrets, ownership, ausência, expiração,
talentos, regras selecionadas, hook opcional, densidade, identidade, cópias, timers e
integração de cancelamento. A suíte de Demo cobre também saída por combate/restrição.
São fixtures: não validam rendering, taint ou rotação em combate no Retail.

O pipeline mantém 26 fontes; ownership dos tipos de frame/textura/texto passa a incluir
AuraIndicators. As APIs visuais usadas estão nas fontes pinadas:
[SimpleRegion](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleRegionAPIDocumentation.lua),
[SimpleTextureBase](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleTextureBaseAPIDocumentation.lua).
Nenhuma nova API de combate ou exceção à política de Secret Values foi introduzida.
