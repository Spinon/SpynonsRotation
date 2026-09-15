# Wowless — TEST-001

Integração auxiliar de carregamento em Docker. Não é o cliente do jogador, não executa
uma luta real e não homologa taint, valores secretos, animação, qualidade visual ou DPS.
O upstream se declara pre-alpha; um erro precisa ser atribuído antes de alterar o addon.

## Reprodução

`npm run wowless:check` verifica os pins e a receita. `npm run wowless:test` executa
os testes offline do runner. Ambos fazem parte de npm test e não iniciam Docker.

Com Docker Linux disponível, `npm run wowless:build` compila a imagem local e
`npm run wowless:run` executa o smoke. A primeira compilação baixa dependências e
dados e pode levar vários minutos. Nada é publicado em registry ou release.

Pins em `tests/headless/pins.json`: Wowless e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4,
fonte já escolhida no bootstrap; Debian bookworm-slim por digest linux/amd64;
arquivo de pacotes Debian de 20260902T000000Z. Submódulos, incluindo vcpkg e elune,
são os commits do Wowless. Dependências vcpkg usam seus hashes upstream. Não se usa
o devcontainer interativo completo, arquivos .env, login de registry ou credenciais.

O banco do Wowless corresponde a 12.1.0.69497 / interface 120100. O addon permanece
pinado em 69587 e aceita 69814 somente para smoke de desenvolvimento. A diferença
é registrada, não corrigida por fingir outro build nem por ampliar a allowlist.
Reprodução aqui significa entradas e procedimentos fixados, não promessa de imagem
bit a bit idêntica; cada execução registra o ID imutável da imagem efetivamente usada.

## Isolamento

Build usa somente `tests/headless` como contexto e clona fontes públicas dentro da
imagem. Run monta `addon` e `SpynonHeadlessProbe` em somente leitura; saída é uma pasta
nova em `.tools/wowless-runs/run-*`. Não monta WTF, o cliente instalado, home, socket
Docker, GitHub tokens ou outros projetos. A árvore readonly do addon inclui também
seus metadados locais; o TOC seleciona os arquivos realmente carregados.

Execução sem rede, filesystem da imagem readonly, capacidades removidas e sem
privilégios novos. Limites: duas CPUs, 4 GiB, 512 processos e cinco minutos. Tmpfs e
pasta de saída são os únicos destinos graváveis. Timeout remove somente o container
cujo ID foi criado nessa invocação; não há prune de imagens, volumes ou containers.
O runner verifica se a árvore de entrada mudou durante a execução e rejeita drift.
No host Linux, o container usa o UID/GID do chamador para escrever na pasta privada
criada por mkdtemp; não amplia permissões da pasta nem restaura capabilities.

## Critério de resultado

O probe é um addon exclusivo do teste, dependente de SpynonRotation. Após login/world
e primeiro update, confere API de skin, rota de slash, relatório interno, estado/fila
válidos e UI criada. Exercita comandos de preview/config/demo e confirma que as
inspeções Retail continuam PENDING. A rota pode degradar de forma segura se o ambiente
emulado não disponibilizar uma capacidade; isso não comprova rendering de cada tela.

O runner exige simultaneamente: processo sem falha, log de carregamento dos dois
addons, nenhuma linha de erro do Wowless, nenhum encerramento por maxerrors e marcador
final explícito nos SavedVariables do probe. Isso é necessário porque o error handler
upstream pode executar os.exit(0) ao atingir maxerrors. Dados Lua de saída são lidos
como texto, nunca executados. Falha do probe ou log ausente não vira sucesso.
O loader pinado serializa strings escalares com tostring, sem aspas Lua; o parser
aceita essa linha exata, além da forma entre aspas, sem interpretar código.

Cada run preserva report.json e run.log locais, hashes da árvore de addon e do probe,
commit Wowless, build emulado, imagem e escopo HEADLESS_ONLY. O probe nunca entra no
instalador Retail ou em um pacote do addon. Não modifica SavedVariables reais.

## Evidência

Execução real em Docker em 2026-09-15T00:25:12.783Z: PASS, zero erros, marcador do
probe confirmado e entradas preservadas. Registro em [WOWLESS_SMOKE.md](../project/WOWLESS_SMOKE.md).
Há avisos upstream; não se afirma execução sem warnings. Testes Node/Lua do runner
não equivalem à execução do Wowless nem esta equivale à execução Retail.

## Fontes primárias

- [README do Wowless pinado](https://github.com/wowless/wowless/blob/e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4/README.md): finalidade, condição pre-alpha e workflow Docker.
- [CLI](https://github.com/wowless/wowless/blob/e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4/wowless.lua) e [error handler](https://github.com/wowless/wowless/blob/e6fbf29e6496d57a9dd52e4e8adabc362fe6d1f4/wowless/modules/errors.lua): parâmetros e encerramento por limite de erros.
- [Debian Snapshot](https://snapshot.debian.org/): arquivo histórico assinado; Check-Valid-Until desativado somente para as datas antigas, não a verificação de assinatura.
- [Docker: pin de imagem](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions): digest fixa o conteúdo usado na base.
