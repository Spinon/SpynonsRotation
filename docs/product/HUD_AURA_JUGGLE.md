# Juggle de buffs e debuffs

## Objetivo

O trilho mostra somente buffs e debuffs que podem mudar a próxima decisão. Ele não substitui a barra de auras do WoW nem tenta apresentar todo efeito ativo.

A célula candidata está em [`assets/ui/auras/aura-juggle-cell-frame-v1.png`](../../assets/ui/auras/aura-juggle-cell-frame-v1.png). A composição padrão usa três instâncias; o limite absoluto é cinco.

## Conteúdo de uma célula

| Zona | Conteúdo |
| --- | --- |
| Esquerda | Ícone nativo da aura, preservando proporção quadrada. |
| Direita superior | Nome curto e estável. |
| Direita inferior | Duração ou estado substituto. |
| Encaixe inferior | Shape e label semânticos do estado. |

Nome, duração, estado e ícone são camadas dinâmicas. A moldura raster não contém dados de uma classe ou spec.

## Estados

| Estado | Valor principal | Reforço | Intenção |
| --- | --- | --- | --- |
| Estável | duração | círculo + `ESTÁVEL` | Baixa saliência; manutenção saudável. |
| Atenção | duração | triângulo + `ATENÇÃO` | Aproximação da janela de refresh. |
| Renovar | duração | losango + `RENOVAR` | Refresh recomendado agora. |
| Ausente | `AUSENTE` | X + ícone dessaturado | Efeito esperado não está ativo. |
| Indisponível | `?` | interrogação + `INDISP.` | O estado não pode ser observado com segurança. |

Ausente e indisponível nunca compartilham o mesmo significado. Um dado protegido ou incerto não pode ser convertido em ausência.

## Densidade e estabilidade

- três células são o padrão visual;
- cinco células são o teto configurável;
- não existe uma grade secundária nem badge permanente de overflow;
- somente sinais genéricos ranqueados como decisivos entram no trilho;
- a posição é determinada por uma chave estável, não pela duração restante;
- enquanto o combate continuar, uma aura expirada muda para `AUSENTE` no mesmo slot em vez de deslocar as demais;
- se nenhum sinal for relevante, o trilho inteiro fica oculto.

Essa estabilidade favorece leitura periférica e memória espacial. A seleção e o ranking exatos pertencem ao futuro contrato técnico; a UI não consulta módulos de classe/spec para tomar essa decisão.

## Origem dos ícones e placeholder

O conteúdo visual vem do cliente do WoW. O preview usa formas neutras somente para mostrar ocupação. Se a textura nativa ainda não estiver resolvida, o runtime usa um placeholder local com as mesmas dimensões e âncoras, sem bloquear a entrega técnica.

## Cor e movimento

A moldura mantém azul `#0788D8` e verde `#42C93E` sólidos. Estados usam cor apenas em shape, label e duração; o contorno inteiro não muda. Nenhum glow está incorporado ao master.

Pulsação discreta para `RENOVAR` ou `AUSENTE`, entrada/saída e reorganização visual serão avaliadas em `UI-DESIGN-007`. O estado estável não deve pulsar.

## Limites

Esta entrega define arte, hierarquia, densidade e semântica. Ela não implementa leitura de auras, ranking, animações, configurações ou validação no cliente Retail.
