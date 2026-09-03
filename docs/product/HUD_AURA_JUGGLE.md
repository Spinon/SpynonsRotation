# Juggle de buffs e debuffs

## Objetivo

O trilho mostra somente buffs e debuffs que podem mudar a próxima decisão. Ele não substitui a barra de auras do WoW nem tenta apresentar todo efeito ativo.

A célula candidata está em [`assets/ui/auras/aura-juggle-cell-frame-v1.png`](../../assets/ui/auras/aura-juggle-cell-frame-v1.png). A revisão visual ativa é `v2`: a composição padrão usa três instâncias em fila de urgência e o limite absoluto é cinco.

## Conteúdo de uma célula

| Zona | Conteúdo |
| --- | --- |
| Esquerda | Ícone nativo da aura, preservando proporção quadrada. |
| Direita superior | Nome curto e estável. |
| Direita inferior | Duração ou estado substituto. |
| Encaixe inferior | Uma única amostra de cor sólida; sem texto ou símbolo. |

Nome, duração, estado e ícone são camadas dinâmicas. A moldura raster não contém dados de uma classe ou spec.

## Estados

| Estado | Valor principal | Encaixe inferior | Intenção |
| --- | --- | --- | --- |
| Estável | duração | verde sólido | Baixa saliência; manutenção saudável. |
| Atenção | duração | âmbar sólido | Aproximação da janela de refresh. |
| Renovar | duração | vermelho sólido | Refresh recomendado agora. |
| Ausente | `AUSENTE` | vazio + ícone dessaturado | Efeito esperado não está ativo. |
| Indisponível/desligado | `—` | vazio + ícone dessaturado | O sinal está desligado ou não pode ser observado com segurança. |

Ausente e indisponível nunca compartilham o mesmo significado. Um dado protegido ou incerto não pode ser convertido em ausência.

## Densidade e fila de urgência

- três células são o padrão visual;
- cinco células são o teto configurável;
- não existe uma grade secundária nem badge permanente de overflow;
- somente sinais genéricos ranqueados como decisivos entram no trilho;
- a ordem é `ausente → renovar → atenção → estável → desligado/indisponível`, sempre da esquerda para a direita;
- a célula troca de posição apenas quando muda de faixa de urgência;
- variações do cronômetro dentro da mesma faixa não reorganizam o trilho;
- se nenhum sinal for relevante, o trilho inteiro fica oculto.

O comportamento de fila prioriza o que exige intervenção sem produzir movimento a cada décimo de segundo. Dentro da mesma faixa, uma chave estável desempata a ordem. A seleção e o ranking exatos pertencem ao futuro contrato técnico; a UI não consulta módulos de classe/spec para tomar essa decisão.

## Origem dos ícones e placeholder

O conteúdo visual vem do cliente do WoW. O preview usa formas neutras somente para mostrar ocupação. Se a textura nativa ainda não estiver resolvida, o runtime usa um placeholder local com as mesmas dimensões e âncoras, sem bloquear a entrega técnica.

## Cor e movimento

A moldura mantém azul `#0788D8` e verde `#42C93E` sólidos. O encaixe inferior usa uma única cor uniforme por vez e percorre temporalmente verde → âmbar → vermelho conforme a urgência aumenta; não existe gradiente espacial dentro do encaixe. Ausente, desligado e indisponível deixam o encaixe vazio. Nenhum glow está incorporado ao master.

Pulsação discreta para `RENOVAR` ou `AUSENTE`, entrada/saída e reorganização visual serão avaliadas em `UI-DESIGN-007`. O estado estável não deve pulsar.

## Limites

Esta entrega define arte, hierarquia, densidade e semântica. Ela não implementa leitura de auras, ranking, animações, configurações ou validação no cliente Retail.
