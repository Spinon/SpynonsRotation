# Fonte oficial da marca Spynon

[Spynon Logo.png](<Spynon Logo.png>) é a prancha aprovada fornecida pelo Product Owner,
já versionada desde o bootstrap de 02/09/2026. Não é um logo novo nem uma reconstrução.
A aprovação conceitual está em PRODUCT_CONTEXT, seção 21; ela não implica aprovação
automática de todo recorte, variante técnica ou uso no HUD.

`source.json` registra origem no Git, SHA-256 e propriedades verificáveis.
`npm run brand:check` confirma o original sem escrever no arquivo ou atualizar hashes.
Ausência ou mudança de bytes exige revisão, nunca uma nova aprovação automática.

## Conteúdo inspecionado

PNG RGB de 1448×1086, 8 bits por canal, 1.448.115 bytes, sem canal alpha.
A prancha contém composição horizontal colorida na parte superior, símbolo colorido
isolado à esquerda embaixo e composição clara/monocromática à direita embaixo.
Fundo galáxia e divisórias fazem parte dos pixels; não há transparência original.

Preservar símbolo angular, brilho central, wordmark, proporção e cores aprovadas.
Não substituir a tipografia por uma fonte parecida, redesenhar contornos ou usar
geração de imagem para reinterpretar o símbolo. Não alegar possuir vetor original.

## Integração por etapas

BRAND-001 registra e protege esta referência. Não envia a prancha inteira ao jogo:
PNG de apresentação não é uma textura pronta de runtime, e inclui três composições.
BRAND-002 prepara derivados técnicos separados com receita, hashes e comparação;
BRAND-003 trata aplicação discreta no produto e aprovação do preview. Nenhuma dessas
etapas substitui o original, homologa combate ou autoriza publicação de release.

O pacote development atual continua excluindo PNGs de referência, metadados e docs.
