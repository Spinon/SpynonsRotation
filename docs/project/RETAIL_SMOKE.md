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

Em Config, alterar uma opção e usar Desfazer/Refazer. No editor do ícone principal, arrastar
o controle de tamanho repetidamente antes de soltar: uma única ação deve ser desfeita.
Navegar, fechar ou entrar em combate durante o arraste deve cancelar a prévia não confirmada.
Trocar alcance/spec ou confirmar cópia/reset deve limpar o histórico, preservando os outros
perfis. Depois de `/reload`, preferências persistem, mas o histórico começa vazio.
Validar captura/soltura do mouse e foco no cliente: fixtures não reproduzem eventos nativos.

### Inspeção humana

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
somente o alcance escolhido, preservando outros ajustes e perfis. Verificar que soltar o
slider durante Experimentar não confirma toda a sessão cedo. Não há nova evidência Retail.

- [ ] Addon carregou sem erro Lua; `/spynon test` foi reconhecido.
- [ ] Build/interface coincidiram; estado e Recommendations válidos.
- [ ] Texturas nativas, molduras, crop, escala e quatro posições legíveis no teste visual.
- [ ] Fila de teste claramente identificada e encerrada antes de combate.
- [ ] Troca de talentos/spec não mantém ações anteriores.
- [ ] Entrada/saída de combate não produz erro, ação bloqueada ou taint observado.
- [ ] Restrições retiram dados/recomendações sem inventar disponibilidade.
- [ ] Comportamento real no boneco é útil ou limitações foram registradas com exemplos.
- [ ] Screenshot/relato do Product Owner e relatório persistido anexados à evidência da task.

## Fora do escopo deste smoke

Não é uma prova de rotação ótima, equivalência com SimC ou liberação de release. O preview estático
e o Demo Mode animado são ferramentas de curadoria, não substitutos da inspeção de combate real.
