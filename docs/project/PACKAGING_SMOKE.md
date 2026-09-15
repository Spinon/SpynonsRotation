# Evidência RELEASE-001

Em 2026-09-15, `npm run package:build` gerou duas vezes o mesmo artefato local:

- Pasta: `dist/package-1e62c44bc61dc9a0`.
- ZIP: 8.315.385 bytes; 78 arquivos, incluindo 61 Lua, um TOC e 16 TGAs.
- SHA-256: 2D0E20E608204850E079E214C3BEB47DE33B56C7DF213CF4F143FE40D5A758DD.
- Commit-base: 26992ac, com sourceDirty=true explicitamente registrado durante implementação.
- `package:verify` aprovou conteúdo, CRCs, cabeçalhos, TOC e manifesto.
- `Test-Package.ps1` abriu os 78 streams com o leitor ZIP da biblioteca .NET e
  confirmou tamanhos, SHA-256 e data fixa; nenhum arquivo foi extraído ou instalado.

`npm test` aprovado: 204 testes Node e 427 Lua, 27 suítes Lua; 61 arquivos sem
problemas de lint ou tipo. Nove testes de packaging cobrem determinismo, isolamento
de conteúdo, proveniência, TOC, colisões/traversal, corrupção, manifesto divergente,
Lua não listado e textura alterada. Não se realizou inspeção Retail nesta task.

O artefato acima é uma evidência local de implementação, não uma release assinada.
Uma geração posterior em checkout limpo registra o commit final e sourceDirty=false;
isso altera o hash intencionalmente. Procedimento em [PACKAGING.md](../architecture/PACKAGING.md).
Nenhum zip foi publicado, nenhum status de release foi promovido e o TOC fonte
permaneceu intacto. CI é a próxima task, RELEASE-002.
