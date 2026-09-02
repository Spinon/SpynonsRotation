# HUD principal — contrato de layout

## Status da direção

Este documento consolida a direção visual aprovada para a tela operacional principal do Spynon's Rotation. A referência anotada é [`assets/ui/concepts/spynon-main-hud-annotated-concept-v2.png`](../../assets/ui/concepts/spynon-main-hud-annotated-concept-v2.png), em canvas conceitual de 1672 × 941 px.

A aprovação cobre hierarquia, agrupamento e escala relativa. Ela não transforma os elementos desenhados no mockup em arte final nem declara implementação ou validação dentro do cliente Retail.

## Leitura do HUD

O HUD forma uma coluna central de decisão. A leitura esperada é de cima para baixo: ação atual, fila, manutenção de buffs/debuffs e barra de cast/indicadores. O contexto de combate fica lateral e a assinatura da marca permanece periférica.

```text
                   ┌──────── contexto de combate
                   │
             ┌─────▼─────────────────────┐
             │         AÇÃO ATUAL        │  hotkey ↗
             │       GCD no rodapé       │
             └───────────────────────────┘
               [ próxima ] [ 2 ] [ 3 ]    hotkeys ↗ / stacks ↘
                    área de animação
             [ buff ] [ debuff ] [ buff ]
             ┌──────── cast / indicadores ────────┬────────────┐
             │        informação decisiva         │ skill/nome │
             └─────────────────────────────────────┴────────────┘
                         assinatura
```

Todo o conjunto deve poder ser ancorado e escalado como uma unidade no futuro modo Editar HUD. A implementação por componente continua sendo responsabilidade das tasks técnicas da trilha `delivery`.

## Componentes aprovados

| Label | Componente | Decisão de layout |
| --- | --- | --- |
| 1 | Contexto de combate | Card compacto lateral, com modo em destaque e quantidade de alvos como dado secundário. |
| 2 | Ação atual | Ocupa uma linha própria acima da fila e mantém a maior hierarquia visual. |
| 3 | Fila de recomendações | Três próximas actions em uma linha mais compacta que a ação atual. |
| 4 | Hotkeys | Texto sem background no canto superior direito da action atual e de cada item da fila; fonte e posição configuráveis. |
| 5 | Global Cooldown | Barra horizontal integrada ao rodapé da action atual, com tempo legível sem competir com a action. |
| 6 | Barra de cast + indicadores | Barra única na base; progresso acima, informações decisivas no centro e emblema/nome da skill à direita. |
| 7 | Área de animação | Espaço compartilhado pela fila para MOVE, ENTER, EXIT, PROMOTE e CONSUME; não é um painel persistente. |
| 8 | Assinatura da marca | Elemento periférico e discreto; não concorre com dados de combate. |
| 9 | Juggle de buffs/debuffs | Trilho dedicado entre fila e cast, mostrando apenas sinais decisivos. |
| 10 | Cooldown individual | Overlay radial cinza em sentido horário, com tempo numérico central. |
| 11 | Stacks/charges | Número sem background no canto inferior direito de cada action, livre de indicadores de debuff; fonte e posição configuráveis. |

## Hierarquia e proporções

As proporções abaixo são relações de composição, não dimensões finais de exportação:

- a ação atual define peso visual `1.00`;
- cada item da fila usa aproximadamente `0.38–0.42` da largura e `0.55–0.65` da altura da action atual;
- os três itens, com gaps, podem formar uma fileira ligeiramente mais larga que a action atual;
- o trilho de buffs/debuffs acompanha aproximadamente a largura da fila;
- a barra de cast/indicadores pode ultrapassar a fila para acomodar a região exclusiva de skill/nome;
- contexto e assinatura permanecem fora do eixo principal e em contraste inferior.

Mudanças finais de pixel, safe area, escala mínima e densidade pertencem às tasks de arte final e ao handoff técnico. A composição não deve crescer a ponto de ocultar o centro útil do campo de jogo.

## Camadas de uma action

Da base para o topo, uma action é composta por:

1. ícone nativo do WoW;
2. máscara ou recorte geométrico;
3. overlay radial e número do cooldown, limitados à abertura do ícone;
4. moldura visual estática do addon;
5. glow animado sobre os trilhos da moldura;
6. demais estados transitórios;
7. hotkey no canto superior direito;
8. stacks ou charges no canto inferior direito.

Buffs e debuffs não ocupam os cantos das actions. Eles pertencem ao trilho de juggle e, quando decisivos para a ação corrente, ao centro informativo da barra de cast/indicadores.

## Origem dos ícones

O addon não distribui ilustrações de actions. A `Action` fornece identidade genérica por `kind` e `gameId`; a camada técnica resolve o campo `icon` usando o cliente do WoW, e a UI consome esse valor por meio da `Recommendation`.

O ícone é conteúdo dinâmico, não parte da moldura. Ele não pode ser esticado para compensar uma proporção diferente: a arte final deve definir um recorte ou uma área útil que preserve a proporção do ícone. A solução exata para a action atual será fechada em `UI-DESIGN-002` sem alterar sua hierarquia aprovada.

Se o ícone não estiver disponível, o runtime usa um placeholder neutro, local e identificado. O placeholder ocupa a mesma área útil e mantém as mesmas âncoras da textura final.

Para um hub fora do cliente:

- a fonte de verdade continua sendo `kind` + `gameId`;
- previews podem ser resolvidos ou armazenados em cache por uma integração de mídia própria do hub;
- URLs e arquivos de preview não entram no contrato autoritativo da rotação;
- o addon nunca depende do hub, de uma CDN ou de acesso à rede para renderizar actions.

## Juggle de buffs/debuffs

O trilho é genérico e orientado a decisão. Cada célula reserva espaço para emblema, nome curto, duração e estado. Os estados semânticos previstos são:

- estável: manutenção dentro da janela esperada;
- atenção: aproximação da janela de refresh;
- renovar: refresh recomendado agora;
- ausente: efeito esperado não encontrado;
- indisponível: sinal não observável com segurança.

Cor nunca é o único canal: texto, ícone de estado ou tratamento da moldura deve reforçar a leitura. A quantidade máxima visível e o comportamento de overflow serão definidos em `UI-DESIGN-006`.

## Contexto, hotkeys e quantidades

O contrato visual detalhado de `UI-DESIGN-003` está em [`HUD_CONTEXT_BADGES.md`](HUD_CONTEXT_BADGES.md). O card de contexto reutiliza a mesma base para `AUTO`, `ST`, `CLEAVE` e `AOE`; hotkeys e quantidades são camadas tipográficas sem background, badge ou glifo.

## Barra de cast e indicadores

A barra inferior combina dois papéis sem misturar a hierarquia:

- faixa superior: progresso de cast ou canalização;
- região central: proc, buff, debuff ou outra informação decisiva;
- região direita: emblema e nome da skill em cast;
- sem cast ativo: a estrutura pode manter somente os indicadores decisivos, sem inventar progresso.

A região direita não deve empurrar ou recentralizar os indicadores a cada troca de skill. As áreas possuem âncoras estáveis para evitar jitter.

## Vocabulário visual

A identidade usa a marca aprovada em [`assets/brand/Spynon Logo.png`](../../assets/brand/Spynon%20Logo.png) como referência, quando aplicável:

- azul/ciano para estrutura, energia e progresso;
- verde para pronto, válido ou positivo;
- âmbar para atenção e refresh;
- vermelho para urgência ou debuff crítico;
- grafite translúcido para superfícies e cooldown;
- metal claro apenas em bordas e tipografia de alta hierarquia.

A moldura usa canais azul elétrico e verde ácido vívidos, próximos da paleta da marca, em cor sólida e sem gradiente ou glow incorporado. A sensação de energia em movimento será produzida por um overlay animado independente e mais claro; somente a passagem desse overlay deve atingir luminosidade alta. Assim, desligar ou reduzir o movimento não exige trocar o bitmap-base e o glow não clareia permanentemente o HUD.

A galáxia e os raios do mockup são direção de atmosfera, não backgrounds obrigatórios das actions. A marca informa molduras, glows e assinatura; não substitui a arte nativa fornecida pelo WoW.

## Conceito, arte final e runtime

| Camada | O que está aprovado | O que ainda falta |
| --- | --- | --- |
| Conceito | Hierarquia, agrupamentos, escala relativa, posições de hotkey/stacks, GCD, barra de cast e trilho de juggle. | Ajustes de detalhe podem ocorrer ao produzir cada componente. |
| Arte final | Direção de cor e uso discreto da identidade Spynon. | Molduras, máscaras, glows, overlays, tipografia e estados serão produzidos em `UI-DESIGN-002` a `UI-DESIGN-007`; hotkeys e quantidades não recebem badges. |
| Runtime | Contrato conceitual: UI genérica consome `Recommendation`, ícone nativo e estado observável. | Lua, adapters, animação, resolução de ícone e validação Retail pertencem à trilha `delivery`. |

O mockup não deve ser recortado e enviado diretamente como atlas. Cada elemento final precisa ser produzido separadamente, com transparência, estados e ponto de substituição documentado.
