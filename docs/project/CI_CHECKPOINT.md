# Checkpoint de pausa — RELEASE-002

## Retomada confirmada

O reteste [34915503607](https://github.com/Spinon/SpynonsRotation/actions/runs/34915503607)
do commit 6b49280 passou nos dois jobs, incluindo Wowless Linux, às 01:10 UTC
de 15/09/2026. RELEASE-002 concluída. O PO priorizou UX-007 antes do checklist Retail.
O registro abaixo preserva o checkpoint original.

Pausa solicitada pelo Product Owner em 2026-09-14 (America/Sao_Paulo).
Nenhuma próxima task foi iniciada. RELEASE-002 permanece in_progress até o reteste.

## Confirmado

[Run 34914566492](https://github.com/Spinon/SpynonsRotation/actions/runs/34914566492),
commit 6972c22: Windows aprovado com toda a suíte, preparação dos binários pinados,
checks de histórico, duas gerações idênticas e leitura ZIP independente.

- 209 testes Node + 427 Lua aprovados naquela execução; 61 arquivos sem problemas
  de lint/tipo. Cinco regressões específicas do contrato CI.
- ZIP com 78 entradas, sourceDirty=false.
- SHA-256 0227868BB241EEA1666A2FEF2696DFD6A2AF9E50AB68A571D3D97E5470DE346F,
  igual ao produzido na estação para o mesmo commit.
- Artifact 10376075207; retenção de sete dias. Sem release ou tag.
- A compilação Docker no Ubuntu também terminou; o runtime headless remoto não passou.

## Falha e correção no checkpoint

O container não conseguiu abrir `/opt/wowless/out/run.log` (Permission denied),
antes de carregar os addons. O diretório criado por mkdtemp pertence ao runner
Linux e tem modo 0700; root no container, sem DAC_OVERRIDE por cap-drop ALL,
não herda o direito de acesso. Docker Desktop Windows não expôs essa diferença.

O runner agora passa o UID/GID do chamador no Linux. Mantém read-only, ausência de
rede, capabilities removidas e diretório privado; não usa chmod 777 nem privilegia
o container. Uma regressão Node valida o argumento e a rejeição de identidade inválida.
O novo resultado remoto precisa ser conferido, não inferido desse teste unitário.

Verificação local do checkpoint: `npm test` aprovou 210 testes Node e 427 Lua
(637 no total); lint e tipos sem problemas em 61 arquivos. `wowless:run` repetido
em Docker Desktop passou às 2026-09-15T01:00:06.909Z, zero erros e 521 warnings
upstream, entradas preservadas. Isso não substitui o reteste no host Linux.

## Ao retomar

1. Sincronizar repositório e abrir a execução mais recente de Validate addon.
2. Confirmar ambos os jobs; se Linux falhar, inspecionar report.json/run.log e a
   mensagem do container. Não reduzir o critério do probe para obter PASS.
3. Só então concluir RELEASE-002 e avançar o foco para TEST-002.
4. Combate/taint e inspeção Retail permanecem pendentes; acabamento visual continua
   adiado pelo PO. Nenhuma segunda spec foi iniciada.
