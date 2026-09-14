# Preferências persistentes — PROFILE-001

As opções de apresentação agora sobrevivem ao logout e `/reload` usando o mecanismo
SavedVariables do WoW. Não dependem de abrir Config. A implementação não grava arquivos
externos, não sincroniza preferências pela rede e não altera o relatório de smoke.

## Experiência e precedência

Em `/spynon config`, o card **Perfis** permite escolher onde salvar:

| Alcance selecionado | Valores efetivos, da menor à maior prioridade |
| --- | --- |
| Todos | Defaults → global |
| Personagem | Defaults → global → personagem |
| Especialização | Defaults → global → personagem → spec deste personagem |

O alcance default é global. Escolher um alcance mais geral não apaga os ajustes específicos:
eles ficam fora da resolução até serem selecionados novamente. Assim, a mudança visual é
imediata no perfil selecionado, sem um override oculto impedir a edição. O alcance escolhido
é lembrado por personagem. No alcance spec, a troca de especialização resolve automaticamente
o perfil da nova spec; não requer suporte da engine de rotação àquela classe.

Somente o campo editado vira override. Escrever o mesmo valor herdado também cria override
explícito; futuras mudanças no ancestral não alteram essa preferência. O rodapé identifica
o alcance de gravação, sem expor GUIDs ou caminhos de arquivos.

“Copiar” usa os valores **efetivos** da origem como snapshot independente no destino atual.
Não mantém vínculo com a origem. Não copia para o mesmo alcance. “Restaurar este perfil”
remove somente os campos conhecidos do alcance selecionado, revelando os valores herdados;
não apaga outros personagens/specs, preferências ancestrais ou extensões desconhecidas.
Ambas exigem segundo clique em Confirmar. Navegação, fechamento, edição ou mudança de
identidade/alcance desarmam a confirmação. Não há Undo/Redo nesta task.

## Dados e fronteiras

```text
SpynonRotationDB
  lastSmokeReport          preservado, ownership de Console/harness
  profiles
    schemaVersion: 1
    global: overrides
    characters[GUID]
      scope: global | character | spec
      values: overrides
      specs[specId textual]: overrides
```

Config.Settings continua sendo modelo puro e validado. Seu writer delega ao controller de
Profiles; Replace aplica o snapshot resolvido em uma única notificação, sem ciclo de gravação.
Profiles.Store faz resolução/cópia/reset puros; não conhece API, classe, spec concreta ou UI.
Profiles.Controller carrega a persistência antes da Queue no bootstrap, observa eventos e
revalida a identidade no limite de cada escrita. A troca de spec não pode gravar através de
um clique antigo. Writes exigem combate público falso e identidade válida. Eventos repetidos
não recriam frames nem duplicam subscriptions.

Compat.Profiles é a única fronteira para SavedVariables e identidade. Lê UnitGUID(player) e
o ID da spec por APIs pinadas, com pcall e guard de Secret Values **antes** de operações sobre
o retorno. Não consulta nomes, conta, talentos, targets ou combat log. GUID fica local ao banco,
sem mensagens de chat, repositório ou telemetria. O formato aceito é Player-servidor-hexadecimal;
formato desconhecido desabilita edição individual, sem inventar uma chave comum.

Identidade indisponível permite exibir defaults/global, mas não grava; spec indisponível no
alcance spec exibe herança de personagem e não redireciona writes para ela. A leitura pode
ser tentada novamente ao entrar no mundo, trocar spec, sair de combate ou mudar restrição.
As fontes pinadas cobrem [UnitGUID](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/UnitDocumentation.lua)
e a especialização; nenhuma permissão de leitura em combate foi presumida.

## Compatibilidade de dados

Banco ausente recebe somente o namespace novo. O namespace schema 1 é aditivo; valores
desconhecidos ou inválidos não entram na apresentação, mas são preservados. Banco de versão
futura, top-level inválido ou perfil estruturalmente malformado fica em modo sem escrita.
Não há migração destrutiva, reset automático ou substituição silenciosa de dados.
O instalador de desenvolvimento continua sem tocar em WTF/SavedVariables.

Persistência depende do salvamento normal do cliente; encerramento forçado pode perder
mudanças ainda não gravadas. “Global” significa personagens que compartilham este banco
do addon no cliente/conta WoW, não sincronização entre estações ou contas.

## Avaliação de AceDB

[AceDB-3.0](https://www.wowace.com/projects/ace3/pages/api/ace-db-3-0) oferece defaults,
namespaces, seleção, cópia e reset de perfis. A composição incremental global/personagem/spec
e a fronteira de identidade guardada ainda exigiriam código próprio neste produto.
Para os sete campos atuais, um store pequeno e coberto por fixtures evita adicionar uma
dependência sem vantagem clara. Não se usa AceConfig; o painel contextual permanece próprio.
Reavaliar AceDB se a complexidade de migração, namespaces ou interoperabilidade crescer.

## Validação

`tests/unit/profiles_spec.lua`: 20 fixtures de reconstrução SavedVariables, precedência,
isolamento, cópia/reset, override explícito, versões futuras, corrupção, secrets, APIs ausentes,
troca de spec, combate, atomicidade, eventos e confirmação. Isso não prova gravação real do
cliente, troca de personagem/spec, foco de teclado ou taint no Retail. Checklist: alterar,
`/reload`, conferir; repetir com dois alcances e duas specs; restaurar só o perfil escolhido.
Não usar dados simulados da demo como validação da rotação.
