# Empacotamento — RELEASE-001

O gerador produz um artefato **development-only**, não publica uma release e não
instala nem sobrescreve o addon no cliente. O status de produto permanece unreleased.

## Comandos

`npm run package:check` valida entradas e um pacote em memória; `package:test` testa
regressões. Ambos fazem parte de `npm test`, sem criar arquivos em dist.

`npm run package:build` cria `dist/package-<hash>/SpynonRotation.zip` e `manifest.json`.
Repetir com as mesmas entradas/proveniência reutiliza o mesmo conteúdo; se arquivos
existentes diferirem, o gerador recusa sobrescrevê-los. `npm run package:verify --
dist/package-<hash>` verifica o artefato. Um leitor independente está disponível em
`tools/packaging/Test-Package.ps1 -Directory dist/package-<hash>` (PowerShell 7).

## Conteúdo e proveniência

Uma única pasta raiz SpynonRotation contém o TOC, todos os Lua referidos nele e os
TGAs aprovados listados no manifesto de assets. Atualmente são 78 arquivos. Lua
órfão, TOC extra, TGA não listado, hash de textura divergente, caminho inseguro,
symlink ou colisão de nome interrompe a geração. Não copia PNGs de revisão, docs,
ferramentas, Rotation Lab, exemplos, probe Wowless, credenciais ou SavedVariables.
O harness e a demo embutidos no addon permanecem disponíveis: são recursos do runtime,
não suítes externas de teste.

Valida versão e build entre TOC, board, package.json e pins; TOC mantém ordem Lua.
Apenas a cópia no ZIP recebe versão `0.0.0-dev.<hash>`, commit Git, SimC, revisão
compilada e PENDING para data de validação. O TOC fonte não é editado. O manifesto
ao lado do ZIP registra SHA-256 de cada entrada e do arquivo completo, interface,
build WoW, versão/commit SimC, commit fonte e indicador de working tree sujo.

rotationRevision é o SHA-256 do índice dos bundles RotationData.lua empacotados,
não uma nova revisão de APL aprovada nem atualização do campo release do board.
inputSha256 identifica todos os bytes de runtime antes do carimbo do TOC. Metadados
do manifesto são evidência de integridade, não assinatura/autenticidade de terceiro.
Pacotes com sourceDirty=true servem para inspeção local; para transferência rastreável,
gerar depois de commit e confirmar sourceDirty=false.

## Determinismo e limites

ZIP usa um perfil restrito STORE, UTF-8, ordem ordinal de caminhos, data fixa
1980-01-01 e nenhum extra/comment/descriptor. Lua e TOC normalizados em LF; TGAs
preservados byte a byte. Sem compressão para evitar variações entre versões de zlib;
sem ZIP64, até 4.096 entradas e 128 MiB de registros locais. Não é um leitor ZIP
genérico: rejeita qualquer formato fora do perfil gerado, inclusive bytes extras.
Cabeçalhos, CRCs e diretório central são verificados por reconstrução canônica.

Mesmas entradas e mesma proveniência produzem os mesmos bytes. Timestamp do sistema,
mtime, timezone, ordem de enumeração e caminhos absolutos não entram no artefato.
Mudança de commit altera metadados intencionalmente. Evidência em
[PACKAGING_SMOKE.md](../project/PACKAGING_SMOKE.md).

O gerador permite somente status unreleased/validatedAt=null; uma futura publicação
exige autorização do PO e critérios próprios, não uma flag para fingir aprovação.
Empacotar não homologa combate, taint, visual ou desempenho Retail.

Referência do formato: [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT).
