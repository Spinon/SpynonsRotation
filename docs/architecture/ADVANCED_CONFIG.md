# Animações sob demanda — UX-003

O caminho é **Fila → Personalizar animações → tipo de animação → Avançado**. A configuração
básica mantém Quantidade, Tamanho, Direção e Movimento; números e curvas só aparecem no
último nível. Voltar percorre a hierarquia. Nenhum controle sem implementação é mostrado.

| Animação | Durações disponíveis | Default |
| --- | --- | --- |
| Movimento | 100, 160, 220 ms | 160 ms |
| Entrada | 120, 180, 260 ms | 180 ms |
| Saída | 80, 120, 180 ms | 120 ms |
| Mudança de prioridade | 160, 220, 280 ms | 220 ms |
| Ação utilizada | 60, 100, 140 ms | 100 ms |

As quatro transições espaciais também escolhem o ritmo: **Desacelera** (ease-out cúbico,
default), **Constante** (linear) ou **Suave nas pontas** (smoothstep). Consumo é um pulso
local senoidal e expõe somente duração; não apresenta uma curva que não teria efeito.
Escala, deslocamento, opacidade e overshoot continuam com os valores existentes nesta
entrega. Não há editor arbitrário de expressão, easing executável ou valores sem limite.

## Integração e limites

Nove campos aditivos em Settings são herdados por perfis antigos, sem migração destrutiva
nem cópia automática de defaults. Usam persistência, Undo/Redo e Experimentar existentes.
Restaurar a seção avançada remove somente os campos daquele tipo; restaurar Fila inclui
todos os campos de animação, mas preserva Informações. Perfil continua removendo todos os
campos conhecidos apenas do alcance selecionado. Rascunhos são cancelados ao navegar.

Animator recebe valores validados e copia tempo/curva para cada transição. Não consulta
API, classe ou spec. Alterar a configuração pela Queue estabiliza transições correntes e
usa os novos parâmetros nas seguintes, sem recriar frames. Uma track já criada no Animator
puro conserva sua duração/curva. Consumo guarda a duração do próprio pulso para a pintura.

**Reduzido** mantém MOVE instantâneo e limita fades/consumo a 100 ms; promoção permanece
crossfade sem viagem espacial. **Sem movimento** ignora todas as durações e elimina efeitos.
Os presets não alteram defaults aprovados nem removem o limite acessível. Com os atrasos
existentes, os maiores tempos normais desta entrega permanecem abaixo de 360 ms.

Nenhuma dependência, API, timer ou asset adicional. A prévia estática continua sendo estática;
use Config com demo animada para observar as transições ao longo da sequência simulada.

## Evidência

`tests/unit/advanced_config_spec.lua`: 14 cenários de disclosure, categorias, defaults,
persistência/Undo, experimentação, resets, valores inválidos, tempos, fórmulas, acessibilidade,
tracks imutáveis, reutilização e perfis legados. As 16 regressões anteriores de Animator
continuam verificando os defaults. São fixtures offline, não aprovação visual no Retail.
Os parâmetros avançados estão funcionais; curadoria fina de aparência permanece adiada.
