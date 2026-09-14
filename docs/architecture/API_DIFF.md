# API diff por build — PATCH-001

O pipeline registra snapshots imutáveis das fontes documentadas que sustentam os adapters e frames do
addon. Cada arquivo possui tamanho, SHA-256 e módulos consumidores. O diff é **conservador por arquivo**:
uma alteração, mesmo de documentação, exige revisão completa de assinatura, retornos, deprecações e
metadados de restrição. Não afirma automaticamente qual função quebrou ou que o binário é compatível.

## Fontes e pins

`tools/wow-api/sources.json` fixa commits de UI Source, versão declarada em `version.txt`, interface,
29 arquivos e ownership (22 originais + documentação de bindings e dois helpers legados em UI-003,
mais Cooldown em UI-004, Slider em UX-004 e SimpleFont/FontableFrameMixin em UX-006).
`snapshots/<build>.json` contém hashes de conteúdo e é, por sua vez, protegido
por hash no manifest. `reports/69587-to-69814.json` é um golden reproduzido pelo check.

- referência `69587`: [8ea15b6](https://github.com/Gethe/wow-ui-source/commit/8ea15b61e45c0ed4eba01439c90757f86eb78d34);
- candidata `69814`: [4e3cbb8](https://github.com/Gethe/wow-ui-source/commit/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59).

A cobertura inclui documentação de build, spec, talentos, secrets, unidades, auras, spells, itens,
restrições e os tipos de frames/texturas/textos usados pela fila atual. Não cobre todo o cliente nem
semântica interna ausente dos arquivos extraídos. A lista deve crescer explicitamente com novos adapters.

## Comandos e comportamento

```text
node tools/wow-api/cli.mjs capture <build pinada>
node tools/wow-api/cli.mjs report
node tools/wow-api/cli.mjs policy
npm run api:check
npm run api:test
```

Capture busca exclusivamente o commit fixado e confirma `version.txt`; não aceita `live` como pin.
Captura escreve somente o snapshot, nunca atualiza seu hash aprovado automaticamente. Falha de rede
interrompe a captura. HTTP 404 é ausência explícita; arquivo ausente nas duas builds também exige revisão.

Check é offline: valida hashes, identidade, ownership, cobertura, existência dos módulos locais, golden
do relatório e política Lua gerada. Mudança de interface exige revisão mesmo com arquivos idênticos.
Mudança na cobertura/ownership não pode ser confundida com uma comparação válida da mesma superfície.

O relatório distingue added, removed, modified e unavailable e aponta todos os módulos potencialmente
afetados. Links pinados permitem revisar o arquivo integral; a granularidade não é uma análise semântica
automática de cada função. Testes sintéticos provam detecção de alterações de assinatura e restrição.

## Ocorrência real de 2026-09-14

O cliente local foi inicialmente detectado como `12.1.0.69587` e recebeu a instalação de desenvolvimento.
Durante o trabalho, seu executável passou a `12.1.0.69814`. O instalador recusou a atualização seguinte
antes de sobrescrever qualquer arquivo; a verificação por build funcionou como guardrail.

Os snapshots confirmam **zero diferenças nos 22 arquivos cobertos** entre os dois commits. Isso permite
adicionar `69814` à allowlist explícita de **smoke de desenvolvimento**, não aprovar combate, taint,
rendering ou release. Cada build dessa lista é comparada à referência antes de gerar
`addon/Compat/ClientPolicy.lua`. O instalador revalida o pipeline antes de usar a allowlist.

`InGameHarness` mostra “aceita para smoke”, preserva as inspeções como PENDING e registra
`compatibilityScope=DEVELOPMENT_SMOKE_ONLY`. Build desconhecida ou interface divergente continua rejeitada.

Os pins do SimC, catálogos e medições continuam em `69587`: são evidência histórica daquele alvo, não
resultados recalculados para `69814`. Não se atualizam essas versões por mera igualdade de documentação
de API. TEST-002 continua bloqueada aguardando o smoke real do Product Owner.

## Validação

`tests/project/api-diff.test.mjs` cobre determinismo, identidade, rede, adição/remoção, metadados de secrets,
interface, ownership e drift de um byte. O golden real compara as duas builds. `npm test` executa esses
checks junto às suítes de runtime e pesquisa. Nenhum comando aqui publica release ou aprova Retail.
