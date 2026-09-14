# Encaixe dos ícones — UI-007

## Diagnóstico e ajuste

O PO aprovou a fluidez da demo, mas apontou encaixe e pixelização. Os retângulos de UI-001
eram conservadores e deixavam folgas transparentes entre arte e moldura. O crop também
removia 8% de cada borda antes do recorte proporcional, ampliando desnecessariamente a arte.
Não foi medida a resolução original de cada ícone do cliente; não se atribui a eles uma
resolução específica nem se promete nitidez de uma textura de alta resolução.

O ajuste preserva os masters, UVs de conteúdo, hierarquia externa 200×120 / 80×80,
posição do HUD e todos os tempos/easings do Animator. Somente a abertura da arte muda:

| Componente | Antes: x/y/largura/altura em UI | Agora em UI | Retângulo no PNG técnico |
| --- | --- | --- | --- |
| Atual | 22 / 16 / 156 / 86 | 20 / 11 / 158 / 94 | 96 / 30 / 316 / 188 |
| Fila | 15 / 13 / 50 / 53 | 12 / 8 / 57 / 59 | 44 / 32 / 171 / 177 |

A transformação usa o padding do manifest: atual (56,8) com escala 2 texels por unidade;
fila (8,8) com escala 3. A arte passa ligeiramente sob a moldura, cobrindo a abertura sem
ultrapassar seu envelope externo lateral. A decoração diagonal da moldura permanece sobre
o ícone. O retângulo atual termina antes do slot separado de GCD.

O trim passa a 2% em cada borda. O maior eixo UV usa 96% da textura em vez de 84%:
14,3% mais amostras nesse eixo, antes de considerar a pequena mudança de dimensão da abertura.
O outro eixo é recortado proporcionalmente, inclusive durante promoção. Não se estica a
imagem quadrada nem se fabrica uma versão HD. A forma larga da ação atual ainda exige crop.
SetTexture recebe CLAMP/CLAMP/LINEAR explicitamente; isso não é prova de que o cliente usava
outro filtro antes, e não recupera detalhes ausentes da textura original.

## Ordem efetiva de camadas

Cooldown é um frame filho e fica acima das texturas do pai, mesmo se elas usam OVERLAY.
As duas molduras do crossfade agora ficam no foreground já existente, acima do Cooldown:

1. ícone no frame da célula;
2. Cooldown nativo (nível +1);
3. flash no BACKGROUND do foreground (nível +2);
4. molduras no ARTWORK desse foreground;
5. hotkey, contagem e placeholder em OVERLAY.

Isso permite cobrir a borda da arte sem o radial escurecer a moldura. Nenhum frame adicional,
timer ou bitmap é criado. Hotkeys, contagens e radial seguem a mesma referência de ícone;
placeholder passa a usar o centro da abertura. GCD e contratos de Recommendation não mudam.

## Evidência e limites

`tools/ui/Test-QueueIconFit.ps1` lê a geometria Lua e os PNGs de revisão sem editá-los.
Após SKIN-001, a geometria default reside em `addon/Skins/Default.lua`, consumida pela Queue.
Verifica quatro pontos transparentes de cada abertura e o envelope lateral de cada linha.
É uma verificação geométrica em posições finais, não uma renderização do WoW ou uma máscara
exata dos recortes internos. Os testes Lua cobrem proporção durante promoção, camadas,
filtro, âncoras e pooling. Os testes existentes preservam tempos e lifecycle do Animator.

API pinada: [SimpleTextureBaseAPIDocumentation](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/SimpleTextureBaseAPIDocumentation.lua),
já incluída no pipeline de 26 fontes. Nenhuma API de dados de combate foi acrescentada.

O relato do PO aprova a animação da versão anterior; não aprova automaticamente este encaixe.
Retestar com `/reload` e `/spynon demo`: folgas, recorte da figura, sobreposição do radial,
teclas e nitidez de diferentes ícones. Se o limite da arte nativa continuar excessivo, uma
decisão posterior de escala/área útil deve ser avaliada com o PO, sem redesign silencioso.
