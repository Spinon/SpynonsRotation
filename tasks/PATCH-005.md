# PATCH-005 — Correção de estado parcial sob restrição

## Pedido e evidência

PO pediu corrigir os problemas e entregar instalado para teste. Relatório Retail
revision 47: combate YES, spec 263, hero 54, lista single_totemic, 12 ações; seis
USABILITY_UNAVAILABLE, seis STATE_UNAVAILABLE, quatro ACTION_UNAVAILABLE.
As 32 falhas de leitura são sete auras, 24 cooldowns/charges e mana, não usability.
Reprodução offline confirma ReadUsable OK descartado por faltar o container do cooldown.

## Escopo

- Preservar usability/charges públicos de forma independente da leitura do cooldown,
  com capabilities de campo e sem manter tempos antigos quando a leitura falhar.
- Manter readiness estrito: cooldown desconhecido não é pronto; nenhum bypass de secrets.
- Investigar a ausência de Surging Totem sem presumir o talento pelo nome da hero tree.
  Só mudar detecção/catálogo quando a causa for comprovada; se faltar evidência, registrar
  precisamente o gate de disponibilidade para reteste, sem alterar a build do usuário.
- Melhorar o diagnóstico da fila vazia, distinguindo seleção de ação e cooldown restrito.
- Testes de regressão de transição, campos independentes e rotação segura; instalar
  checkpoint development e deixar TEST-002 pendente da execução real.

Fallback que substitua decisões pela sugestão oficial do WoW é escolha de produto
separada e depende da resposta do PO; não deve ser introduzido silenciosamente aqui.

## Aceite

1. Leitura pública de usability não se perde quando cooldown/charges falham.
2. Estados parciais não herdam autorização ampla, tempos obsoletos nem falsa prontidão.
3. Ausência de ação pode ser investigada com metadados de gates públicos e limitados.
4. Suíte passa e pacote é instalado, sem alegar corrigir restrições impostas pelo cliente.
