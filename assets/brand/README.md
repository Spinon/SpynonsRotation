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

## Derivados técnicos — BRAND-002

`technical/` contém master e três composições em SVG autocontido. Cada SVG incorpora
o PNG original integral, com viewport e proporção explícitos em `variants.json`.
O master é **raster-backed**, não uma vetorização: não há contornos reconstruídos,
remoção de fundo, recoloração ou tipografia substituta. O fundo galáxia permanece.
As superfícies claras/escuras da prancha de comparação são contextos de uso, não
promessa de que o logo tenha transparência ou uma nova versão invertida.

`npm run brand:build` reproduz os seis arquivos (quatro SVGs, HTML e manifesto).
`brand:check` e dez regressões na suíte validam fontes, recortes, bytes incorporados,
limites e igualdade das saídas. O build normal/CI não depende de um editor gráfico.

Inspeção técnica estática em 15/09/2026 UTC com Sharp 0.35.4 / librsvg 2.62.91:
símbolo, wordmark, estrela e extremidades completos nas três composições; nenhuma
divisória da prancha foi incluída nos viewports. Proporções preservadas nos dois
contextos. Prova local em `dist/brand-review/comparison.png`, SHA-256
868A1B18A5A7E6D899D4834FEC2CF32700E51AD06994825F58E4CA0EA2BFAF83.

O renderizador opcional `tools/brand/render-preview.mjs` recebe o diretório de um
Sharp já instalado. Só rasteriza os SVGs estáticos verificados, sem HTML, navegador
ou rede. A tentativa de abrir HTML local no navegador foi bloqueada pela política
da ferramenta; nenhuma proteção foi alterada e não se alega teste de navegador.
A aplicação no HUD ainda exige BRAND-003 e aprovação do PO.
