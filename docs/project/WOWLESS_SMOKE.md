# Evidência TEST-001 — headless somente

Em 2026-09-15T00:25:12.783Z, `npm run wowless:run` concluiu PASS no Docker Engine
29.7.2 / linux/amd64, após compilação local da receita pinada. Nenhuma alteração
de runtime foi necessária nesta task. O cliente Retail não foi operado.

- Wowless: e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4; dados 12.1.0.69497.
- Imagem: sha256:dce93eda6fb9b88b0efa0a5057c5e9a3a4d5f823b9fef10b00d63ce758170a30.
- Árvore addon, 85 arquivos: 6DD1DDBD680FB77B10BD406D62F55E7DCF5EF52FF6DB48BF79EF1E3C06DBFDB1.
- Probe, dois arquivos: D1E4B3529F0BCFBD0024B28E77B5456E286E4D28822AF08205A7ACC72601FAC8.
- Log SHA-256: 6F70BC1698AFD81B433AFE8F656FBB566B33FCD84C65EE679771192B0F0742B9.
- Saída local preservada: `.tools/wowless-runs/run-30qwe2/`, com report.json,
  run.log e SavedVariables **do container**, nunca os do jogador.
- Zero erros, nenhum maxerrors, ambos os addons carregados, inputChanged=false.
- Marcador final: `SpynonHeadlessProbeResult = PASS:BOOTSTRAP_SMOKE:HEADLESS_ONLY`.
- 521 warnings do emulador: 520 linhas referenciam arquivos Blizzard e uma
  DropCursorMoney em `[C]:-1`; nenhuma linha de warning referencia Spynon.
  Isso não comprova que toda limitação do emulador foi identificada.

O relatório interno apresentou estado válido, três sinais públicos e zero
recomendações. O build continuou **NÃO HOMOLOGADO**, corretamente: não alteramos
o pin do addon ou a allowlist de smoke para acomodar o emulador.

A tentativa inicial executou o probe, mas foi rejeitada pelo parser local porque
o loader upstream serializa strings escalares sem aspas. A leitura foi corrigida
e coberta por regressão; duas execuções novas passaram. Nenhum Lua de saída é executado.
Os logs não são determinísticos em tempos, endereços ou contagem exata de warnings;
reprodução significa procedimento e entradas fixados, não log ou imagem bit a bit.

`npm test`: 195 testes Node e 427 Lua em 27 suítes Lua aprovados; 61 arquivos de
runtime sem warnings de lint, erros ou problemas de tipo. Os sete testes Node do
runner cobrem isolamento, pins e falsos positivos; três fixtures Lua cobrem o probe.

Não valida combate, taint, Secret Values reais, DPS, rotação de Enhancement,
fluidez ou encaixe visual. TEST-002 permanece bloqueada para inspeção Retail.
Procedimento de reprodução e fontes: [WOWLESS.md](../architecture/WOWLESS.md).
