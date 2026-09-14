# Demonstração reproduzível — UI-006

O modo de demonstração usa a mesma Queue, Animator e CooldownOverlay da apresentação real,
em uma view separada, com aviso permanente **DEMO - DADOS SIMULADOS**. Ele não executa
habilidades, não recomenda uma rotação válida e não altera a engine, talentos, contexto real
ou SavedVariables. Funciona inclusive sem spec suportada, com placeholders locais.

## Comandos

Fora de combate, depois de recarregar o addon atualizado:

```text
/spynon demo
/spynon demo restart
/spynon demo reduced
/spynon demo off
/spynon demo stop
```

O comando inicial ou `normal` inicia movimento normal. `reduced` reinicia com movimento
reduzido; `off` reinicia sem animação espacial, mas preserva mudanças de dados e cooldowns.
Para encerrar, usar **stop**, não off. `restart` volta ao início com movimento normal.
O loop dura 16 segundos. Não há pausa ou velocidade variável nesta entrega.

`/spynon test show` continua sendo a prévia estática; iniciar uma prévia substitui a outra.
`/spynon test hide` também encerra a demonstração. Combate, mudança de restrição e entrada
no mundo encerram automaticamente a simulação e restauram o controller real.

## Timeline fixa

| Tempo | Cena | Evidência visual esperada |
| --- | --- | --- |
| 0 s | ST | A/B/C/D; A em cooldown, 2 cargas, GCD de 1,5 s |
| 2 s | Proc simulado | B promove; 5 stacks, A demove |
| 4 s | Cleave | E entra, D sai, 3 stacks em B |
| 6 s | Consumo | B recebe CONSUME; não foi lançado um spell real |
| 6,07 s | Próxima prioridade | C promove; GCD simulado |
| 8 s | AoE | E promove com 10 stacks |
| 10 s | AoE | Remoção da contagem e novo GCD |
| 12 s | ST | A promove com cooldown de 3 s |
| 14 s | Retorno | Ordem A/B/C/D |
| 16 s | Reinício | Mesmo roteiro, mesma identidade das ações |

A/B/C/D/E representam cinco identidades locais. O catálogo da spec fornece somente arte,
nome e tipo de ação; não fornece a lógica da cena. Sem catálogo, aparecem placeholders.
Hotkeys são uma captura das barras nativas ao iniciar: mudanças de binding durante a
demo exigem reinício. Tempos, cargas, stacks, procs e contextos são sempre fictícios.

Proc é demonstrado pela promoção e pelo rótulo da cena. UI-005 acrescenta três indicadores
genéricos simulados, com stacks, duração, ausência, renovação e indisponibilidade; estados e
limites estão em [`AURA_INDICATORS.md`](AURA_INDICATORS.md). ST/Cleave/AoE aparecem no rótulo de
demonstração e no CombatContext das fixtures, não alteram o ContextController real.

## Fronteiras e desempenho

`UI.DemoTimeline` é pura, determinística e devolve cópias de Recommendation e sidecars
visuais. Os IDs e reason codes são explicitamente `demo.*` / `DEMO_ONLY_*`. A capability
ADDON_AVAILABLE representa constantes locais públicas, não prova de disponibilidade real.
Esses objetos nunca são enviados ao serviço de recomendações.

`UI.DemoMode` mantém um único timer do roteiro, além do timer compartilhado da Queue para
movimento/GCD. Não há timer Lua por ícone. Recomendações e sidecars são reconstruídos
somente nas fronteiras de cena, não a cada frame. O trilho de auras tem um timer compartilhado
de 200 ms enquanto há durações públicas pendentes. O pool e todos os frames são reutilizados.
Após uma pausa longa do cliente, avança diretamente para a cena correspondente, sem
reproduzir uma cascata de eventos atrasados.

O cooldown simulado usa `Compat.Cooldowns.ApplyDemo`, com entrada numérica local explícita,
guardas e `Cooldown:SetCooldown`. O relógio base vem de Compat.State e é revalidado em
cada volta; sua perda encerra o modo e restaura a apresentação real. O método não é
fallback de cooldown real e não converte DurationObjects/Secret Values em números.
Sua assinatura já está na documentação pinada de FrameAPICooldown em API_DIFF.

Consumo simulado usa `Queue.PreviewConsume(id)` somente nesta view. O controller real
continua exigindo evento público de cast confirmado; remoção de prioridade não é consumo.

## Validação e limites

`tests/unit/demo_spec.lua` cobre checkpoints, determinismo, cópias, placeholders, inputs
secretos, comandos, transições entre modos, 1000 ticks sem novos frames, retomada do
controller real e perda do relógio. Testes não demonstram rendering Retail ou taint.

Inspecionar no cliente a legibilidade dos dois rótulos, crop, promoção, consumo, swipe,
contagens e limpeza ao entrar em combate. O roteiro é ferramenta de curadoria, não
homologação da rotação. A captura estática recebida anteriormente não valida esta timeline.
