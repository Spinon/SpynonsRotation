# Smoke no cliente Retail — TEST-002

## Preparação verificada nesta estação

- Cliente detectado pelo registro de instalação em `D:\Blizzard\World of Warcraft\_retail_`.
- `Wow.exe`: FileVersion `12.1.0.69587`, correspondente ao alvo do projeto.
- Em 2026-09-14 o cliente atualizou para `12.1.0.69814`. PATCH-001 comparou 22 fontes de API pinadas sem
  diferenças e liberou essa build somente para smoke de desenvolvimento; a pesquisa SimC permanece em 69587.
- Addon de desenvolvimento: `Interface\AddOns\SpynonRotation` dentro desse cliente.
- Instalador local: `tools/wow/Install-DevelopmentAddon.ps1 -RetailRoot <pasta _retail_>`.
  Copia somente Lua, TOC e TGAs, confere hashes e grava recibo local. Não publica release, não altera
  outros addons e não toca em WTF/SavedVariables. Recusa build divergente ou sobrescrita de instalação
  não gerenciada/alterada pelo usuário.

A allowlist de builds para smoke vem de `tools/wow-api/sources.json`, verificada pelo pipeline descrito
em `docs/architecture/API_DIFF.md`. “Aceita para smoke” não significa “validada no Retail”.

Detectar executável e copiar arquivos **não** significa validar dentro do jogo. A primeira captura
Retail foi recebida em 2026-09-14 (evidência parcial abaixo). TEST-002 continua pendente para taint,
lockdown e leitura em combate.

## Primeira evidência do Product Owner — 2026-09-14

Captura recebida nesta conversa: `codex-clipboard-a7313aca-d1b7-4682-9f5f-9346f5541913.png`.
SHA-256: `A84F3C69D534FB549B8204335341F332FCE5ECCC111E480E33B28C6AD6D58B39`.
Inspeção direta confirma o aviso de dados simulados, moldura principal com ícone e três molduras menores
com ícones abaixo, sem placeholder visível. Isso comprova rendering do preview estático, não aprovação
estética, estabilidade de sessão, ausência de erros ou funcionamento da fila real.

O chat e o relatório persistido `SpynonRotationDB.lastSmokeReport` indicam `stateValid=true`,
`specId=263`, revisão 31, 126 sinais disponíveis e 3 indisponíveis, `uiCreated=true`,
`recommendationCount=0`, `recommendationsValid=true`, `buildMatches=false` e campo `build` ausente.
Todos os campos de inspeção humana continuam `PENDING`. Não se infere o estado de combate a partir
desse relatório antigo; zero recomendações fora de combate é esperado, mas o preview não testa a rotação.

A ausência de `build` indica falha na leitura/normalização, não prova versão divergente. PATCH-003
separa `READ_FAILED`, `UNREVIEWED` e `SUPPORTED_SMOKE`, registra `buildReadCode`/`buildInvalidField`,
mostra versão/interface observadas e não exige textos descritivos para validar a identidade.
O motivo exato da falha anterior não foi preservado. Após reinstalação: `/reload`, `/spynon test`,
captura do novo resultado e `/reload` para persistir. Não declarar a correção confirmada no Retail antes disso.

## Comandos no jogo

### Retorno posterior do Product Owner — 2026-09-14

Captura `codex-clipboard-73fa5f18-4a77-4aba-b527-e4786d14cb5e.png`, SHA-256
`40EBCE28DCE2E6E9778CC23D2F5D81EDB786BAFB6E9B4E05177D5A7753ECE2EE`:
o chat mostra build 12.1.0.69814 / interface 120100 aceita para smoke, estado válido,
126 sinais públicos e zero recomendações. Teclas Q e 4 aparecem na prévia estática.
O aviso anterior de build não ocorre nessa execução; a causa histórica continua indeterminada.

Em seguida, o PO relatou que o demo ficou liso e aprovou as animações. Também relatou
ícones desencaixados e alguns pixelados. Esse relato valida a fluidez percebida da demo,
não a rotação real, a ausência de taint ou cada cenário de combate. UI-007 trata encaixe
e amostragem; sua revisão visual permanece pendente de novo teste.

### Roteiro

PATCH-004 acrescenta `/spynon debug` e detalhe no `/spynon test`. Para investigar a
fila vazia, executar **durante ataque ao boneco**, capturar as linhas Debug/Regras/
Prontidão/Leituras e então sair do combate e dar `/reload` para salvar. Não repetir
debug fora de combate antes de persistir a amostra. Não é necessário mudar talentos.
Interpretação e limites em [QUEUE_DIAGNOSTICS.md](../architecture/QUEUE_DIAGNOSTICS.md).

1. Abrir o Retail, habilitar **Spynon's Rotation** na lista de addons e entrar no personagem.
2. Fora de combate, executar `/spynon test`. O chat mostra a compatibilidade de build, validade do
   snapshot e quantidade de sinais/recomendações. Fila vazia fora de combate é esperada.
3. Executar `/spynon test show`. Conferir quatro ícones: ação principal acima, três menores abaixo.
   O título **TESTE VISUAL - DADOS SIMULADOS** deve estar visível. Não seguir essa fila como rotação.
4. Executar `/spynon test hide` para restaurar a fila real. Entrada em combate, mudança de restrição
   ou carregamento de mundo também encerra automaticamente a fila simulada.
5. Em Enhancement, testar no boneco de treino com os talentos atuais. A fila real pode diminuir ou
   desaparecer quando o cliente restringe sinais; nunca deve reutilizar dados protegidos anteriores.
6. Executar `/spynon test` após o combate e `/reload` para persistir o relatório em SavedVariables.

Também verificar `/spynon context st`, `cleave`, `aoe` e `auto`. O modo AUTO atualmente usa ST como
fallback explícito: nenhuma fonte de contagem de inimigos está homologada no cliente. O override manual
é de sessão e não deve ser confundido com uma contagem medida.

`SpynonRotationDB.lastSmokeReport` guarda somente diagnóstico técnico, sem nome de personagem, conta,
chat ou combat log. `visualInspection`, `taintInspection` e `combatInspection` permanecem `PENDING`;
o comando não transforma execução automática em aprovação humana ou validação visual.

## Checklist a registrar na evidência

### Demonstração animada disponível em UI-006

Depois de `/reload`, executar `/spynon demo` fora de combate. A sequência identificada como
simulada repete em 16 segundos: promoção, consumo, entrada/saída, cooldowns, contagens e
ST/Cleave/AoE. `/spynon demo restart` reinicia; `reduced` reduz movimentos; `off` desliga
somente movimentos, e **`/spynon demo stop` encerra**. A fila real é restaurada ao sair.
O roteiro detalhado está em `docs/architecture/DEMO_MODE.md`. Não seguir a demo como rotação.

### Configuração básica (UX-001)

`/spynon config` abre os assuntos Fila e Informações junto à demo. Alterar quantidade,
tamanho, direção, movimento, teclas e informações deve atualizar a prévia imediatamente.
Fechar ou Escape restaura a fila real; entrar em combate também encerra painel e demo.
PROFILE-001 acrescenta o card Perfis e persistência: alterar uma preferência, executar
`/reload` e conferir o mesmo valor. Comparar global, personagem e spec; confirmar que cópia
e restauração exigem confirmação e preservam os outros perfis. Verificar legibilidade,
cliques e propagação das teclas no Retail; fixtures não são homologação visual ou de taint.

### Seleção direta (UX-002)

Executar `/spynon edit`. Clicar no ícone principal, em Tecla e numa próxima ação deve abrir
somente suas opções. Verificar se os alvos de clique acompanham os ícones ao mudar tamanho,
direção e espaçamento. Os alvos Tecla não são binds reais. Fechar, iniciar demo ou entrar em
combate deve remover os alvos sem interceptar cliques do jogo. Confirmar `/reload` das
preferências novas. Hit testing, foco e rendering nativos continuam pendentes de inspeção.

### Histórico transacional (UX-004)

Em Config, alterar uma opção e usar Desfazer/Refazer. Com UX-007, o slider foi removido:
arrastar a alça Mover conjunto antes de soltar deve produzir uma única ação para os dois eixos.
Navegar, fechar ou entrar em combate durante o arraste deve cancelar a prévia não confirmada.
Trocar alcance/spec ou confirmar cópia/reset deve limpar o histórico, preservando os outros
perfis. Depois de `/reload`, preferências persistem, mas o histórico começa vazio.
Validar captura/soltura do mouse e foco no cliente: fixtures não reproduzem eventos nativos.

### Inspeção humana

SKIN-002: o exemplo externo está no repositório, não instalado. Quando houver teste
autorizado desse addon separado, confirmar dependência/carregamento, presença na API
List/Get e ausência de troca automática do HUD. A execução atual do exemplo é somente offline.

SKIN-001: após reload, comparar a skin default à versão anterior (mesmos assets e medidas).
Conferir molduras, cores de aura, textos e cooldowns; não há seletor de skin nesta entrega.
Contratos e fixtures não substituem essa comparação no cliente.

UX-003: Fila → Personalizar animações → tipo → Avançado. Confirmar que duração/ritmo não
aparecem nos níveis anteriores; comparar tempos na demo, testar Desfazer e restaurar apenas
a seção. Reduzido e Sem movimento devem prevalecer. Defaults permanecem os anteriores;
estes novos controles ainda não receberam inspeção real no cliente.

Antes da inspeção geral, conferir UX-005: Experimentar permite múltiplas alterações sem
gravar; Manter mudanças cria uma ação; Cancelar/navegar/fechar desfaz a prévia. Restaurar
elemento, seção e perfil deve mostrar resultado antes de Confirmar restauração. Confirmar
somente o alcance escolhido, preservando outros ajustes e perfis. UX-007 mantém escolhas
discretas de tamanho, sem slider. Não há nova evidência Retail dessa entrega.

- [ ] Addon carregou sem erro Lua; `/spynon test` foi reconhecido.
- [ ] Build/interface coincidiram; estado e Recommendations válidos.
- [ ] Texturas nativas, molduras, crop, escala e uma a seis posições legíveis no teste visual.
- [ ] Fila de teste claramente identificada e encerrada antes de combate.
- [ ] Troca de talentos/spec não mantém ações anteriores.
- [ ] Entrada/saída de combate não produz erro, ação bloqueada ou taint observado.
- [ ] Restrições retiram dados/recomendações sem inventar disponibilidade.
- [ ] Comportamento real no boneco é útil ou limitações foram registradas com exemplos.
- [ ] Screenshot/relato do Product Owner e relatório persistido anexados à evidência da task.

### Tag de contexto clicável (UX-008)

Commit 8ce5a3b instalado no Retail 12.1.0.69814 em 15/09/2026 UTC, 80 arquivos
verificados. Pacote reproduzível SHA-256
5BEBF2955F39EFFDEF2B6D1AD8D7002C275F9EF5E40B6B0C2FBAAAEE7D39425B.
670 testes offline e smoke Wowless passaram; inspeção humana abaixo pendente.

Depois de `/reload`, fora da demo/config, procurar o tag acima da fila. Ele deve
continuar visível mesmo sem recomendações. Clique esquerdo alterna Auto → ST →
Cleave → AoE → Auto. AUTO atual continua fallback ST, não detecção de packs.

- [ ] Tag legível e clicável fora e durante combate, sem erro Lua ou ação bloqueada.
- [ ] Clique muda texto e contexto; `/spynon context status` confirma a mesma escolha.
- [ ] `/spynon context aoe` muda o tag para AoE manual; quatro cliques completam o ciclo.
- [ ] Tag acompanha posição/escala e não cobre os ícones nem captura mouse fora de seus limites.
- [ ] Abrir demo/config/editor oculta o tag real; fechar ou entrar em combate o restaura.
- [ ] `/reload` volta a Auto com fallback explícito, sem inventar contagem de inimigos.

Fixture de combate e carregamento Wowless não preenchem esses itens automaticamente.
A utilidade da fila real e a ausência de taint continuam sob TEST-002.

### Preview de marca (BRAND-003)

O cabeçalho do config passa a mostrar o símbolo oficial em 46×46, separado do título.
Somente essa superfície muda; fila e skin continuam com os assets anteriores.
Commit 965ce13 instalado no Retail 12.1.0.69814 em 15/09/2026 UTC: 79 arquivos
verificados, sem alterações em SavedVariables/outros addons. Pacote reproduzível
de mesmo commit, SHA-256 28EA226F85A9D546C76DBC69B5CAA2FD42061C57883D06A52546059D1DEF6BBB.
Após atualizar a instalação e usar `/reload`, abrir `/spynon config`:

- [ ] Símbolo íntegro, sem esticar, com fundo original discreto no cabeçalho.
- [ ] Título e subtítulo legíveis, sem sobreposição a Fechar ou Editar HUD.
- [ ] Marca desaparece ao fechar o config e não aparece na fila de combate.
- [ ] Product Owner aprova o preview ou registra o ajuste necessário.

Fonte aprovada e testes offline não preenchem esses itens. BRAND-003 mantém a
aprovação do preview pendente, separada da validação de combate de TEST-002.

## Fora do escopo deste smoke

### PATCH-005 — reteste de prontidão pública

**Retorno posterior do PO:** a fila apareceu, mas some após usar uma habilidade e
retorna depois. Confirmação parcial da fila real, não aprovação de rotação/taint.
O ciclo motivou PATCH-006; o checkpoint mais novo está descrito abaixo.

Commit d22f625 instalado em 15/09/2026 04:01:10 UTC: 81 arquivos conferidos no
Retail 12.1.0.69814. Pacote limpo reproduzido duas vezes e validado por leitor
independente; SHA-256 330859D10A167E67C0595C14E6989AF5D2754055F89313A0C4E146609C0AE379.
689 testes offline e smoke Wowless passaram. Nenhum destes passos valida Retail.

1. Fora do combate, `/reload`; fechar config/demo (`/spynon demo stop` e
   `/spynon test hide` se necessário).
2. Atacar o boneco em ST/Auto, observar a fila entre cooldowns e após usar habilidades.
   Esta versão usa nossa engine com status público, não AssistedCombat.
3. Durante combate executar `/spynon debug`. Guardar screenshot das linhas e depois
   sair do combate e usar `/reload` para persistir. Não repetir debug fora do combate.
4. Se o Totem continuar ausente, inspecionar actionExclusions do relatório salvo:
   o chat imprime somente os três primeiros gates, não necessariamente o do Totem.

- [ ] Há recomendações próprias quando existe ação pública pronta.
- [ ] Habilidade em cooldown não aparece como pronta; erros/taint ausentes.
- [ ] Retorno da fila após GCD e mudanças de cooldown funciona sem ficar travado.
- [ ] Gate do Surging Totem correlacionado com talentos reais, sem presumir correção.
- [ ] Limitações de buffs/recursos/tempos restritos documentadas com nova amostra.

A fila ainda pode ter menos de seis ações ou esvaziar durante GCD. Não há previsão
de seis casts, estimativa de resets ou promoção de informação restrita a pública.
Relato anterior revision 47 é anterior a esta correção e não preenche este checklist.

### PATCH-006 — continuidade durante GCD

Commit 32e2533 instalado em 15/09/2026 UTC, 81 arquivos conferidos no Retail
12.1.0.69814. Pacote limpo reproduzido e leitor ZIP independente aprovado:
B71D42E15971E76C9381A915F023C05F5DF30F7C902F1923BE6F9B55B6A4C331.
697 testes offline passaram; Wowless carregou sem erros (521 warnings upstream).

Após `/reload`, sair da demo/config e repetir combate no boneco:

- [ ] A fila permanece visível durante GCD público com candidatas e etiqueta GCD.
- [ ] Arte atenuada/coluna Aguardando GCD distinguem espera de prontidão; retornam
      ao normal quando o cooldown termina, sem reiniciar toda a fila.
- [ ] Habilidade usada com cooldown próprio sem flag de GCD sai da fila normalmente.
- [ ] Sem erro Lua, taint, freeze ou sobreposição ilegível da etiqueta às teclas.
- [ ] Se o sumiço persistir: registrar `/spynon debug` em combate; WAITING_GCD
      deve distinguir candidatas em espera das recusas COOLDOWN_ACTIVE.

Não se congelam recomendações antigas nem se calculam tempos protegidos. Refresh
fora do evento autorizado/perda de informação ainda pode retirar candidatas; flag
de GCD não garante que não exista outro bloqueio. Inspeção Retail continua pendente.

### PATCH-007 — barra de GCD nativa

Commit c875540 instalado em 15/09/2026 UTC: 81 arquivos conferidos no Retail
12.1.0.69814, sem alterar SavedVariables ou outros addons. Pacote limpo reproduzido
duas vezes e leitor ZIP independente aprovado; SHA-256
571B73B05FA1B09764EE4279851CA994E6153CEB6FDA0C89E6F029B3A755192C.
703 testes offline aprovados; Wowless sem erros (521 warnings upstream).

A barra existente agora encaminha DurationObject público ao temporizador nativo,
sem ler tempos restritos nem inferir prontidão. Dimensões, posição e cores preservadas.
Isso não altera WAITING_GCD nem resolve ausência de candidatas observáveis.

Após `/reload`, fora de demo/config, repetir combate no boneco:

- [ ] Barra acompanha o GCD na habilidade principal sem depender de tempos numéricos públicos.
- [ ] Nenhuma barra residual nas posições da fila após promoção/reordenação.
- [ ] Ao terminar GCD, limpar/esconder HUD ou perder dados, progresso antigo não reaparece.
- [ ] Sem erro Lua, taint ou regressão de encaixe; continuidade PATCH-006 conferida.

Os testes verificam encaminhamento opaco e lifecycle, não a animação real do widget.
O apontamento do PO sobre a barra ausente motivou a correção, não constitui aceite
desta versão. Rendering e combate Retail continuam pendentes em TEST-002.

### Entrega UX-007 instalada para inspeção

Commit 59a2dcb, instalado em 15/09/2026 UTC no cliente 12.1.0.69814: 78 arquivos
verificados pelo instalador, sem alterar WTF ou outros addons. `/reload` carrega a versão.
Checklist de posição persistente, modo acoplado, seis ações, coluna principal e config
em [HUD_USABILITY.md](../architecture/HUD_USABILITY.md#checklist-retail).
647 testes offline passaram; Wowless abriu inclusive o editor sem erros. Isso não
marca nenhum item de inspeção humana acima como aprovado.

UX-006 também exige inspeção: Informações → Textos e legibilidade; comparar WoW/Números
WoW, tamanhos, contorno e sombra, inclusive cooldown nativo. Verificar Global e overrides,
Experimentar/Cancelar, reset granular e reload. Números desligados devem continuar
ocultos. Validar teclas largas e rótulos nos idiomas do cliente. Testes offline não
confirmam rasterização, legibilidade nem taint dessas alterações.

Não é uma prova de rotação ótima, equivalência com SimC ou liberação de release. O preview estático
e o Demo Mode animado são ferramentas de curadoria, não substitutos da inspeção de combate real.
