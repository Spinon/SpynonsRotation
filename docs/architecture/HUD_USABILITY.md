# HUD ajustável e config legível — UX-007

Pedido do PO após uso no Retail em 14/09/2026. Complementa HUD_EDITOR, HISTORY,
PREVIEW_RESET e QUEUE_UI; os documentos anteriores registram as entregas originais.

## Experiência

- Fila → Organização e encaixe: uma a seis recomendações no total; default quatro.
  Separado preserva espaçamento; Acoplado zera gaps e o inset vertical. A direção
  Abaixo/Direita/Esquerda e o alinhamento continuam independentes. O controle de
  espaçamento fica inativo no modo Acoplado; voltar a Separado recupera seu valor.
- Fila → Mover conjunto ou Editar HUD: alça acima do conjunto, separada do aviso
  de dados simulados. Arrastar move todas as ações e indicadores filhos.
- Soltar salva os dois eixos como uma única ação. Desfazer/refazer preservam a
  herança do perfil. Fechar, navegar, trocar perfil, reapresentar demo e entrar
  em combate cancelam o movimento não confirmado. Nenhum alvo de mouse na fila real.
- Posição do conjunto → Restaurar seção restaura somente os eixos, com prévia e
  confirmação existentes. Reset da seção Fila também inclui posição e encaixe.
- Sem slider na interface. Mantidas escolhas discretas de tamanho principal/global.
  O helper legado permanece inativo no runtime, com regressões isoladas, para não
  remover arquivos gerenciados da instalação nesta entrega de apresentação.
- Controles segmentados de 28 unidades, legendas centralizadas, tamanho máximo de
  140 por opção; título, descrição, navegação e restauração têm pesos distintos.
  Cards, progressive disclosure, perfis e exploração confirmada continuam iguais.

## Geometria e conteúdo

Na abertura principal de 158×94, o ícone ocupa 94×94 à esquerda, seguido por gap 8
e coluna 56×86. Moldura externa 200×120 preservada. A fila mantém os ícones 57×59
com crop proporcional e filtro LINEAR. Nenhuma textura foi redesenhada ou ampliada.

A coluna exibe nome de Action e contexto resolvido quando presente. Não interpreta
códigos de regra, não lê cooldown textual, não promete dano e não inventa metadados.
Texto só aparece na ação atual estabilizada; acompanha identidade e some na demissão.
Tipografia continua no papel genérico labels. Em skins externas estreitas, a coluna
é omitida se faltar área; o quadrado usa o menor lado da abertura declarada. Sem
mudança de schema/token da Skin API ou condições de classe na UI.

Pool fixo de 12 slots (seis ativos e seis em saída), inclusive alvos de editor.
O serviço de recomendações solicita até seis; a avaliação pura mantém seu default
anterior e aceita limite explícito. Não preenche a fila real quando faltam regras
elegíveis. Prévia estática possui seis fixtures; demo mantém seus quatro primeiros
papéis por fase e duas identidades simuladas na cauda. Animações continuam por ID.

## Posição e segurança

Settings acrescenta coupled booleano e positionX/positionY inteiros em [-8192,8192].
São overrides aditivos do schema 1; ausência herda zero/Separado. O offset Y da skin
continua sendo origem, somado ao deslocamento salvo. Frame próprio usa StartMoving,
StopMovingOrSizing e clamping nativo. SetUserPlaced(false) evita persistência paralela.

Compat.Media lê centros e escalas sob pcall. Cada escalar deve passar issecretvalue
e validação finita antes de aritmética; API ausente, escala nula ou dado inválido
cancela a gravação. Centro do pai é convertido para unidades do frame antes de
calcular o offset. O padrão de conversão também pode ser inspecionado no código
primário de [HandyNotes](https://github.com/Nevcairiel/HandyNotes/blob/master/HandyNotes_HandyNotes.lua).
Config mantém guarda de combate público falso antes de iniciar e confirmar; Profiles
revalida identidade e snapshot no commit. Nenhuma capacidade de combate foi ampliada.

## Evidências e limites

hud_editor_spec cobre layouts separados/acoplados de uma a seis ações, escalas,
arraste transacional, interrupções, herança, dados secretos/inválidos, pool e bounds
dos botões. queue_spec cobre o quadrado, coluna e demissão/promoção. O teste geométrico
encontrou e corrigiu sobreposição de 2 unidades entre Fechar e Editar HUD.
Wowless agora abre/fecha também Editar HUD. Sem leitura/escrita de WTF nos testes.

Isso não valida rasterização, captura nativa de mouse, perda de foco do cliente,
taint ou combate Retail. O checklist abaixo é o próximo gate, não uma aprovação.

## Checklist Retail

1. `/reload`; `/spynon config`. Conferir título, botões e ausência de slider.
2. Fila → Mover conjunto. Arrastar, desfazer e refazer; `/reload` e conferir posição.
3. Organização e encaixe: seis ações; alternar Separado/Acoplado e três direções.
4. Conferir quadrado principal, coluna legível e encaixe da fila, inclusive teclas.
5. `/spynon demo`: conferir promoção/consumo/entrada/saída; a demo é simulada.
6. Fechar config durante arraste, trocar perfil e entrar em combate: sem gravação
   parcial, alça residual ou erro. Restaurar somente posição e confirmar a prévia.
7. `/spynon demo stop`; executar checklist TEST-002 de rotação/taint real separadamente.
