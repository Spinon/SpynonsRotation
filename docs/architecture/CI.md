# CI — RELEASE-002

`.github/workflows/validate.yml` executa automaticamente em pushes main/codex/** e
pull requests, além de permitir disparo manual. Não usa pull_request_target,
secrets de usuário ou runners da estação. Permissão do token: contents:read;
checkout não preserva credenciais. Nenhum comando cria release, tag, push ou deploy.

## Jobs

- Windows 2025, limite 15 minutos: Node 24.15.0, ferramentas portáteis verificadas,
  histórico do board, `npm test`, duas gerações de pacote em checkout limpo,
  verificação canônica e leitor ZIP .NET independente.
- Ubuntu 24.04, limite 40 minutos: compilação da imagem Wowless pinada e smoke
  isolado, sem rede durante execução. Build requer acesso às fontes públicas.

Actions fixadas por SHA em `tools/ci/pins.json`, Node alinhado à toolchain local.
LuaJIT ZIP 2.1.19907 produz o mesmo runtime 2.1.1720049189 já usado localmente;
arquivo e conteúdo extraído são verificados antes de executar. Luacheck 1.2.0 e
wowlua-ls 0.30.4 mantêm os hashes existentes. Não há instalador nem alteração global.
Setup-WindowsTools pode preparar os mesmos binários localmente em .tools; a variável
SPYNON_LUAJIT seleciona o executável portátil sem mudar o default local.

O histórico verifica cada commit, permitindo planned→in_progress→done em commits
separados dentro de um push. Em PR usa os commits reais do head desde merge-base,
não atribui um salto artificial ao merge de teste gerado pelo GitHub. Limite de
500 commits; branch nova/disparo manual usa HEAD^ como base local de verificação.
STATUS também precisa estar atualizado; CI não o corrige ou faz commit automático.

## Evidências e limites

Artifacts duram sete dias. O job offline preserva somente ZIP development-only e
manifesto; o headless preserva somente report.json e run.log do container de teste,
mesmo em falha. Nunca faz upload de .tools inteiro, cliente, WTF ou SavedVariables.
Um artefato offline pode existir enquanto headless falha: aprovação exige ambos
os jobs verdes, e ainda assim NÃO é aprovação Retail ou autorização de publicação.

CI roda fixtures e verifica resultados SimC pinados já versionados; os checks de
talentos e starter build também reinicializam os perfis no executável SimC pinado.
Setup-Simc usa somente o token efêmero automático do GitHub, limitado ao passo de
download do artifact público já registrado; nenhuma credencial pessoal é necessária.
Confere ID, run, commit, expiração, SHA do ZIP externo, 7z interno e executável.
Artifact expirado bloqueia, nunca troca de versão silenciosamente. Não executa novas
matrizes de DPS. Wowless é execução real headless, distinta das fixtures; nenhum dos
jobs verifica comportamento em combate Retail.

`ci:check`/`ci:test` são guardrails textuais do contrato, não um parser completo ou
auditoria geral de workflows. A sintaxe e execução final são verificadas pelo GitHub.
Imagens dos runners hospedados podem receber updates; hashes dos artefatos de runtime
são reproduzíveis por entradas, não promessa de sistema operacional imutável.

Fontes: [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[setup-node](https://github.com/actions/setup-node),
[LuaJIT portátil](https://github.com/DevelopersCommunity/cmake-luajit/releases/tag/v2.1.19907).
Resultado remoto será registrado no board após a execução, não inferido do teste local.
