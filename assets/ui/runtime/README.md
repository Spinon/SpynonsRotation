# Assets de runtime do HUD

Esta pasta contém derivados técnicos candidatos para consumo futuro pela UI do addon. Os arquivos são TGA true-color de 32 bits, com alpha de 8 bits, origem superior esquerda, canvas em potência de dois e padding transparente.

Cada componente usa o mesmo conjunto lógico:

- `*-neutral-v1.tga`: estrutura metálica e canaletas escuras;
- `*-primary-mask-v1.tga`: máscara branca do caminho principal;
- `*-signature-mask-v1.tga`: máscara branca do acento verde da marca;
- `*-state-shelf-mask-v1.tga`: máscara de estado exclusiva da célula de aura.

As máscaras definem onde a cor pode aparecer, não uma borda permanentemente acesa. O runtime deve tingi-las com os tokens configuráveis e revelar apenas o segmento previsto no contrato de movimento. A máscara de estado é a exceção: ela recebe preenchimento sólido completo enquanto o estado estiver ativo.

O arquivo [`manifest.json`](manifest.json) contém checksums, dimensões, retângulos úteis, UVs e relacionamento com os masters aprovados. As instâncias da fila e das auras reutilizam a mesma textura; não existem cópias por slot.

O pacote pode ser reconstruído com `tools/ui/Build-TechnicalAssets.ps1` e verificado com `tools/ui/Test-TechnicalAssets.ps1`.

O GCD e o progresso de cast continuam procedurais e não possuem bitmap de preenchimento. Ícones continuam vindo do WoW. Na ausência de um asset ou ícone, a implementação usa o placeholder neutro contratual sem alterar âncoras.

Estes arquivos estão prontos para handoff, mas ainda não foram carregados ou validados dentro do cliente Retail. A implementação Lua pertence à trilha `delivery`.
