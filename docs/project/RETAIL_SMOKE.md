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

### Inspeção humana

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
