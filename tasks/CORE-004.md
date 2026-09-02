# CORE-004 — Compat layer WoW

## Objetivo

Criar a fronteira única entre o Core e APIs voláteis do World of Warcraft Retail, com detecção explícita de capabilities e fallbacks verificáveis para dados ausentes, alterados ou protegidos.

## Escopo

- inventariar e verificar as APIs Retail necessárias às próximas tasks do Core;
- expor adapters por meio de um namespace `Compat` neutro;
- impedir chamadas diretas às APIs cobertas fora de `addon/Compat/`;
- classificar sinais com o contrato `Capability` da `CORE-001`;
- representar indisponibilidade e Secret Values sem coerção ou tentativa de contorno;
- permitir injeção de implementações falsas para testes offline;
- criar matriz inicial de API, capability, fallback e consumidor;
- testar respostas válidas, APIs ausentes, erros e valores protegidos.

## Fora do escopo

- montar o estado completo do jogador (`RUN-001`);
- decidir a spec/talentos ativos (`CORE-003`);
- implementar regras ou catálogo de Enhancement;
- detectar contexto de combate;
- implementar UI ou validação no cliente Retail.

## Critérios de aceite

- APIs voláteis cobertas não aparecem diretamente fora de `addon/Compat/`;
- cada adapter declara a capability e um resultado/fallback seguro;
- ausência ou mudança de API não interrompe o carregamento do addon;
- valores secretos não são convertidos, comparados ou usados indevidamente;
- testes offline cobrem sucesso, indisponibilidade e falha controlada;
- a matriz de compatibilidade registra o build/interface usado como referência;
- `npm test` permanece verde.
