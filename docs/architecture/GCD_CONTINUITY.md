# Continuidade durante GCD — PATCH-006

Recommendation ganha campo opcional readiness: READY ou WAITING_GCD. Ausente
preserva o contrato das recomendações anteriores/demo. Media mantém o campo;
UI não consulta spec nem API de cooldown para tomar essa decisão.

O caminho passa por Compat.State.ReadCooldownStatus(spellId, event), que acessa
isOnGCD somente em SPELL_UPDATE_COOLDOWN. A origem do evento é guardada pelo
StateEngine. A leitura opcional exige container público, indexação contida e
booleano público. Falha/ausência omite o flag, sem inventar false ou autorização.
Os dois pins documentam o campo como NeverSecret com essa restrição de evento:
[SpellSharedDocumentation](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellSharedDocumentation.lua).

O snapshot de status é substituído no refresh de cooldown. Eventos de aura,
usability e alvo que não o atualizam preservam a observação anterior; refresh por
charges/talentos/equipamento não reaproveita isOnGCD. Invalidação apaga tudo.
Não há temporizador local nem leitura de duração para manter a fila visível.

IsReady permanece false durante GCD. Seu segundo retorno WAITING_GCD exige:
usability true, ready false, status habilitado e ativo, isOnGCD true, todos públicos.
A engine aceita essa candidata somente após avaliar a condição da regra atual.
Não mantém recomendações antigas. Cooldown ativo sem esse flag continua excluído.
Nenhuma propriedade ready/remains da DSL foi relaxada. A flag não é tratada como
prova de que o GCD é o único bloqueio, nem promessa de disponibilidade ao terminar.

A UI mostra GCD dentro do ícone, reduz somente a opacidade da arte para 55% e
mostra Aguardando GCD na coluna principal quando a skin oferece espaço. Molduras,
teclas e identidade dos frames são preservadas. Ao receber READY o mesmo frame
volta à aparência normal. Uma lista realmente vazia/restrita ainda é retirada.
O debug contabiliza WAITING_GCD nas recomendações selecionadas em espera.

Regressão integrada em gcd_continuity_spec.lua usa módulo Totêmico, StateEngine,
service, Media e Queue reais com API e frames simulados. Cobre pronta → espera →
pronta, saída de cooldown próprio, seis posições, identidade/objetos, flags
secretos/ausentes/negados, invalidação, gating de evento, contrato e diagnóstico.
Não homologa comportamento, rendering ou taint no Retail.
