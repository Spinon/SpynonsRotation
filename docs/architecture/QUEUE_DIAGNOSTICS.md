# Diagnóstico da fila real — PATCH-004

`/spynon debug` executa o mesmo smoke de `/spynon test`, agora com diagnóstico.
Não inicia demo, não troca contexto/talentos e não modifica a fila. Usa a avaliação
mais recente, sem ler diretamente a API nem reexecutar a rotação para o relatório.

`lastSmokeReport.debug` é uma extensão aditiva com schemaVersion próprio 1:

- combate observável YES/NO/UNAVAILABLE; specId e heroTreeId selecionados;
- entrypoint e actionCount da avaliação; ausentes se o bundle não foi selecionado;
- contexto AUTO/manual e modo resolvido, revisões de snapshot e avaliação;
- contagens de códigos da engine e de readiness, com até seis exemplos de regras;
- falhas do StateEngine por código, com até 32 nomes de sinal e códigos, nunca valores;
- flags de disponibilidade dos getters e truncamento.

Limites de varredura: 10.000 diagnósticos de regra e 4.096 entradas de leitura.
As entradas são snapshots internos de módulos, não tabelas Blizzard. Saída no chat:
quatro linhas de resumo e até três exemplos de leitura, além das três linhas antigas.
As demais amostras ficam salvas para inspeção após logout/reload. Códigos desconhecidos
viram UNKNOWN; strings de exceção são descartadas. Dados do jogador não entram no debug.

## Como interpretar

- `INVALID_BUNDLE` com lista não selecionada: conferir combate/spec/hero tree; não
  implica corrupção do arquivo, porque o módulo pode devolver bundle vazio por gate.
- `STATE_UNAVAILABLE`: a condição da regra não pôde ser resolvida; não é condição falsa.
- `CONDITION_FALSE`: condição observável não atendida naquela avaliação.
- `ACTION_NOT_READY`: olhar a distribuição de readiness abaixo.
- `USABILITY_UNAVAILABLE` / `COOLDOWN_UNAVAILABLE`: informação não observável ou não
  normalizada para decisão; não significa cooldown ativo.
- `NOT_USABLE` / `COOLDOWN_ACTIVE`: avaliação pública recusou a prontidão.
- `SECRET_RESTRICTED`, `API_UNAVAILABLE`, `CALL_FAILED` e `INVALID_DATA` distinguem
  restrição, ausência de API, falha contida e formato não aceito, respectivamente.

Mais de um motivo pode ocorrer. Falhas de leitura podem pertencer a sinais não usados
pela regra escolhida: não atribuir causalidade apenas pela existência de uma falha.
Revisões diferentes indicam que o snapshot e a avaliação precisam ser correlacionados.

## Evidência Retail inicial

Captura do PO em 15/09: ataque ao boneco, contexto Auto/ST fallback, build 69814 aceita,
estado válido, 97 sinais públicos e zero recomendações. Captura seguinte mostra
Aperfeiçoamento/Totêmico. O relatório antigo não incluía combate, lista ou motivos;
não permite concluir se a ausência vem de seleção, condições, API ou prontidão.

Essas capturas não validam a nova instrumentação. Novo teste: `/reload`, sair de
demo/config, bater no boneco e executar `/spynon debug`; fotografar as linhas.
Depois sair do combate e usar `/reload` para persistir aquela amostra. Não executar
debug novamente fora de combate antes disso: a última amostra substitui a anterior.

Checkpoint instalado: 9e07a1b, Retail 12.1.0.69814, 81 arquivos conferidos, sem mudar
SavedVariables/outros addons. 677 testes passaram; Wowless executou debug sem erros.
Pacote limpo reproduzível SHA-256
956F4E439FD022638CE78BB0A872E15B9C82C57FBFF18A4FD51C6FDA1346D4F9.
Nenhuma conclusão de causa/correção em Retail foi obtida nesta entrega.
