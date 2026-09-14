# Skin declarativa — SKIN-001

SKIN-002 acrescenta registro público e descoberta em [`EXTERNAL_SKINS.md`](EXTERNAL_SKINS.md);
os limites abaixo descrevem a entrega inicial. Registro não seleciona a skin automaticamente.

O HUD passa a consumir uma skin de dados, sem mudar a aparência default. A arte técnica
aprovada, aberturas de UI-007, cores, fontes WoW e tempos atuais permanecem iguais.
`addon/Skins/Default.lua` é o ponto explícito de substituição dos assets/tokens; a Queue
não contém mais caminhos de molduras ou dimensões fixas da skin. Nenhum bitmap foi editado.

## Contrato v1

Uma definição possui schemaVersion=1, id estável, label humana, defaults de preferências
e tokens opcionais. SkinFactory.Create valida e compila uma cópia; campos omitidos herdam
o default. GetTokens e Resolve devolvem novas cópias, sem referências ao estado interno.

- Queue: dimensões de principal/fila, abertura do ícone, textura TGA, UV, trim, posição Y
  e separação adicional entre fileiras. Quantidade/direção/alinhamento continuam na UI.
- Cores: texto, placeholder, flash local, swipe, GCD, tipo de aura e seus estados semânticos.
- Auras: moldura, canaleta e máscara de estado, com UV; o layout compacto permanece fixo.
- Tipografia: objeto nativo GameFontNormalSmall ou GameFontNormal. UX-006 trata controles
  de tamanho, outline, shadow e overrides por papel; não são antecipados aqui.
- Defaults: os vinte campos de apresentação já suportados, incluindo espaçamento, escala
  e durações/curvas. Só valores aceitos por Settings podem ser defaults da skin.

Não são aceitos callbacks, funções, metatables, campos desconhecidos ou versão futura.
Números precisam ser finitos e limitados; UVs ordenados dentro de 0–1; cores RGBA dentro
de 0–1; abertura integralmente contida no frame. Caminhos aceitos são TGAs locais sob
Interface/AddOns, sem navegação por '..', URL ou caminho do sistema. O contrato valida
formato, **não existência/resolução do asset no cliente**. Registro externo, conflito e
fallback de pacote ausente pertencem a SKIN-002; esta task não publica uma API global.

O contrato controla dados de apresentação, não é uma sandbox de segurança para addons:
código externo instalado no WoW possui o próprio ambiente de execução. A skin não recebe
Recommendation, estado do personagem, frames, callbacks ou autorização para alterar rotação.
Sem lógica de classe/spec, eventos, timers ou chamadas a APIs de combate dentro de Skins.

## Precedência e consumidores

Resolução: **defaults do produto → defaults da skin → global → personagem → spec**, até
o alcance escolhido. Somente overrides existentes nas camadas são aplicados. Restaurar
revela a skin/ancestral; não congela um default antigo. Copiar perfil continua copiando os
valores efetivos. Settings.Create e ProfileStore.Create aceitam a mesma skin injetável;
os controllers de produção usam a default compilada. No modo sem Profiles, HistoryBinding
usa os defaults do modelo para restaurar corretamente uma skin injetada.

Queue.Create aceita skin como quinto argumento para fixtures/composição interna; Overlay
e AuraIndicators recebem a mesma instância. Capturam tokens uma vez, não a cada tick.
Modelos de preferências explicitamente injetados prevalecem; se uma Queue recebe só a skin,
cria seu modelo a partir dos defaults dela. Geometria recalcula limites usando dimensões
dos tokens, preservando identidade, pooling, animações, binds, cooldowns e overlays.

Esta entrega não inclui seletor, hot swap, importação, loja, download, logo novo, skins de
terceiros ou reskin do painel Config/editor. Não aplica uma nova direção visual ao usuário.

## Verificação

`tests/unit/skins_spec.lua` cobre 20 cenários de contrato, cópias, rejeição de lógica/estruturas
inválidas, limites, caminhos, fontes, precedência, reset/cópia, render properties e identidade.
As regressões de Queue, Animator, indicadores e configuração preservam o default.
Test-QueueIconFit lê agora Skins/Default.lua; os mesmos probes e hashes dos assets continuam
obrigatórios. Testes são offline; aparência no Retail, taint e interação nativa seguem pendentes.
