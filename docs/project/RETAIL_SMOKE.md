# Smoke no cliente Retail — TEST-002

## Preparação verificada nesta estação

- Cliente detectado pelo registro de instalação em `D:\Blizzard\World of Warcraft\_retail_`.
- `Wow.exe`: FileVersion `12.1.0.69587`, correspondente ao alvo do projeto.
- Addon de desenvolvimento: `Interface\AddOns\SpynonRotation` dentro desse cliente.
- Instalador local: `tools/wow/Install-DevelopmentAddon.ps1 -RetailRoot <pasta _retail_>`.
  Copia somente Lua, TOC e TGAs, confere hashes e grava recibo local. Não publica release, não altera
  outros addons e não toca em WTF/SavedVariables. Recusa build divergente ou sobrescrita de instalação
  não gerenciada/alterada pelo usuário.

Detectar executável e copiar arquivos **não** significa validar dentro do jogo. Até o smoke real,
TEST-002 permanece pendente; não há evidência de taint, lockdown, leitura em combate ou rendering.

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

`SpynonRotationDB.lastSmokeReport` guarda somente diagnóstico técnico, sem nome de personagem, conta,
chat ou combat log. `visualInspection`, `taintInspection` e `combatInspection` permanecem `PENDING`;
o comando não transforma execução automática em aprovação humana ou validação visual.

## Checklist a registrar na evidência

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
não implementa o Demo Mode com timelines (UI-006), nem substitui a inspeção de animações futuras.
