# PATCH-006 — Continuidade da fila durante GCD

## Pedido e evidência

PO confirmou que a fila instalada em d22f625 aparece em combate, mas desaparece
após usar uma habilidade e retorna depois. Pediu corrigir imediatamente.
O código filtra todas as ações com cooldown ativo; Queue oculta a lista vazia.
O teste de produção Totêmico reproduz esse ciclo. Atribuição ao GCD no cliente é
compatível com o relato, não uma captura instrumentada de cada transição.

## Escopo autorizado

- Ler isOnGCD público somente em resposta a SPELL_UPDATE_COOLDOWN, conforme
  SpellSharedDocumentation dos pins 69587/69814; guards em container e campo.
- Separar candidatura em espera de prontidão: Recommendation pode ter estado
  WAITING_GCD, sempre com regra e usability públicas e status habilitado/ativo/GCD.
  IsReady continua falso durante GCD. Não inferir tempos ou cooldown próprio a partir
  de duração-base, nem afirmar que um flag de GCD garante exclusividade do bloqueio.
- Reavaliar as prioridades atuais para a fila em espera, sem congelar a lista antiga.
  Cooldown ativo sem flag público de GCD continua excluído; condições desconhecidas
  continuam omitidas. Nenhum fallback oficial ou exceção de spec nas camadas genéricas.
- Mostrar a espera de forma discreta e explícita nos ícones, preservar identidade e
  animações ao voltar a pronto. Sem redesenhar HUD/config nem acrescentar preferências.
- Limpar observações em mudanças de spec/restrição e refresh de cooldown fora do
  evento autorizado. Eventos sem refresh de cooldown preservam a última observação.
- Cobrir API, evento→estado→engine→UI, metadados, restrições, cooldown próprio, saída
  do GCD e perda de dados com regressões. Auditar, empacotar e instalar para reteste.

## Aceite

1. Sequência pronta → GCD público → pronta mantém candidatas observáveis na tela,
   com espera distinta de prontidão e sem recriar os frames sobreviventes.
2. A habilidade utilizada que entrou em cooldown próprio sem flag GCD sai da fila;
   nenhuma regra restrita é liberada e nenhuma lista antiga é mantida por temporizador.
3. isOnGCD não é consultado fora de SPELL_UPDATE_COOLDOWN nem operado se secreto.
4. Testes, auditoria e pacote aprovados; instalação local verificada. Retail pendente.

Fonte primária: https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpellSharedDocumentation.lua
