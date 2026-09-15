# Compat layer do World of Warcraft

`addon/Compat/` é a única fronteira para APIs Blizzard cobertas pelo projeto. Consumidores recebem resultados
normalizados; não acessam globais do cliente diretamente.

## Snapshot histórico de referência (CORE-004)

Este bloco registra a descoberta inicial. Para o cliente detectado depois e a auditoria
atual de 69587/69814, consultar [SECRET_VALUES_AUDIT.md](SECRET_VALUES_AUDIT.md) e
[RETAIL_SMOKE.md](../project/RETAIL_SMOKE.md). PATCH-002 acrescenta contenção de
indexação em ReadPublicField; metadados de erro da API não escapam para o Core.

- alvo do addon: WoW Retail `12.1.0`, build `69587`, Interface `120100`;
- cliente Retail detectado nesta estação: não;
- auditoria: `2026-09-02`;
- UI Source `live`: commit `8ea15b61e45c0ed4eba01439c90757f86eb78d34`.

Fontes inspecionadas:

- [BuildDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/BuildDocumentation.lua)
- [SpecializationInfoDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SpecializationInfoDocumentation.lua)
- [ClassTalentsDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/ClassTalentsDocumentation.lua)
- [SharedTraitsDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SharedTraitsDocumentation.lua)
- [SecretPredicateAPIDocumentation.lua](https://github.com/Gethe/wow-ui-source/blob/8ea15b61e45c0ed4eba01439c90757f86eb78d34/Interface/AddOns/Blizzard_APIDocumentationGenerated/SecretPredicateAPIDocumentation.lua)
- [Combat Philosophy and Addon Disarmament](https://news.blizzard.com/en-us/article/24246290/combat-philosophy-and-addon-disarmament-in-midnight)

O snapshot de UI Source é extraído do cliente `live`, mas não substitui teste dentro do WoW. O build/interface alvo
vem do pin do projeto e precisa ser confirmado no cliente real em `TEST-002`.

### Leitura de build — ajuste PATCH-003

`Build:GetInfo` exige versão, número textual de build e interface numérica positiva. Data, versão
localizada e descrição da build são auxiliares: strings são preservadas, ausência ou tipo diferente
é omitido, sem inventar valores. A allowlist continua verificando estritamente a identidade completa.
Falha de identidade mantém `INVALID_DATA` e acrescenta `invalidField` controlado; exceções não vazam texto.
O harness distingue falha de leitura e identidade não homologada, sem promover nenhuma a aprovação Retail.

A [fonte Blizzard extraída para 69814](https://github.com/Gethe/wow-ui-source/blob/4e3cbb8c5609e4bfc332c0aebbfa4d79731fab59/Interface/AddOns/Blizzard_APIDocumentationGenerated/BuildDocumentation.lua)
descreve seis retornos. O fallback para textos auxiliares não significa afirmar que a API mudou;
o primeiro relatório real não preservou a causa da normalização falhar. A repetição está pendente em
[`RETAIL_SMOKE.md`](../project/RETAIL_SMOKE.md).

## Resultado uniforme

Todo adapter retorna uma tabela com:

```text
ok           a chamada e sua forma de retorno são utilizáveis
value        dado normalizado ou estrutura opaca da Blizzard
capability   ADDON_AVAILABLE ou CONDITIONALLY_SECRET
code         OK, NO_DATA, API_UNAVAILABLE, CALL_FAILED, INVALID_DATA etc.
fallback     SKIP quando o consumidor não deve avaliar o sinal
```

Falhas não incluem a mensagem crua lançada pela API. Isso evita vazar detalhes instáveis para consumidores e mantém
erros determinísticos nos testes.

## Matriz inicial

| Sinal | Adapter | API Retail | Capability quando disponível | Fallback |
| --- | --- | --- | --- | --- |
| Build/interface | `Build:GetInfo` | `GetBuildInfo` | `ADDON_AVAILABLE` | `SKIP` |
| Inicialização da spec | `Specialization:IsInitialized` | `C_SpecializationInfo.IsInitialized` | `ADDON_AVAILABLE` | `SKIP` |
| Índice da spec ativa | `Specialization:GetActiveIndex` | `C_SpecializationInfo.GetSpecialization` | `ADDON_AVAILABLE` | `SKIP` |
| Metadados da spec | `Specialization:GetInfo` | `C_SpecializationInfo.GetSpecializationInfo` | `ADDON_AVAILABLE` | `SKIP` |
| Classe por spec | `Specialization:GetClassId` | `C_SpecializationInfo.GetClassIDFromSpecID` | `ADDON_AVAILABLE` | `SKIP` |
| Config ativa | `Talents:GetActiveConfigId` | `C_ClassTalents.GetActiveConfigID` | `ADDON_AVAILABLE` | `SKIP` |
| Hero tree ativa | `Talents:GetActiveHeroTreeId` | `C_ClassTalents.GetActiveHeroTalentSpec` | `ADDON_AVAILABLE` | ausência explícita |
| Árvore da spec | `Talents:GetTreeIdForSpec` | `C_ClassTalents.GetTraitTreeForSpec` | `ADDON_AVAILABLE` | `SKIP` |
| Config/nodes/entries | métodos `Talents:Get*` | `C_Traits.Get*` | `ADDON_AVAILABLE` | `SKIP` |
| Metadados da Hero tree | `Talents:GetSubTreeInfo` | `C_Traits.GetSubTreeInfo` | `ADDON_AVAILABLE` | `SKIP` |
| Restrições globais | `Secrets:GetRestrictionState` | `C_Secrets.HasSecretRestrictions` | resultado da sonda | `SKIP` |
| Cooldowns | `Secrets:ClassifyCooldown` | `C_Secrets.Should*Cooldown*BeSecret` | resultado da sonda | `SKIP` |
| Auras | `Secrets:ClassifyAura` | `C_Secrets.Should*Aura*BeSecret` | resultado da sonda | `SKIP` |
| Recurso do jogador | `Secrets:ClassifyUnitPower` | `C_Secrets.ShouldUnitPowerBeSecret` | resultado da sonda | `SKIP` |
| Relógio | `State:ReadClock` | `GetTime` | `ADDON_AVAILABLE` após guard | `SKIP` |
| Combate | `State:ReadCombat` | `UnitAffectingCombat` | `ADDON_AVAILABLE` após guard | `SKIP` |
| Power atual/máximo | `State:ReadPower` | sondas `ShouldUnitPowerBeSecret` e `ShouldUnitPowerMaxBeSecret`, `UnitPower`, `UnitPowerMax` | `ADDON_AVAILABLE` após sondas e guards | `SKIP` |
| Aura por unidade/spell | `State:ReadAura` | `ShouldSpellAuraBeSecret`, `UnitExists`, `UnitIsVisible`, `C_UnitAuras.GetUnitAuraBySpellID` | `ADDON_AVAILABLE` após sonda e guards | `SKIP` |
| Cooldown observado | `State:ReadCooldown` | `ShouldSpellCooldownBeSecret`, `C_Spell.GetSpellCooldown` | `ADDON_AVAILABLE` após sonda e guards | `SKIP` |
| Cargas observadas | `State:ReadCharges` | `ShouldSpellCooldownBeSecret`, `C_Spell.GetSpellCharges` | `ADDON_AVAILABLE` após sonda e guards | `SKIP` |

## Regras de segurança

1. O facade padrão usa `_G`; testes usam `CompatFactory.Create(fakeEnvironment)`.
2. APIs ausentes e exceções viram resultados controlados e nunca quebram o carregamento.
3. Identificadores são validados antes de chegar a APIs com `SecretArguments = AllowedWhenUntainted`.
4. Estruturas de traits são passadas sem transformação; interpretação pertence à `CORE-003`.
5. Um sinal potencialmente secreto deve ser classificado por `C_Secrets` antes da leitura da API de estado.
6. Sonda ausente, inválida, falha ou positiva resulta em `CONDITIONALLY_SECRET` e fallback `SKIP`.
7. O código não tenta testar, converter, comparar ou calcular um valor depois que ele foi marcado como secreto.

`CORE-003` combina os adapters de spec/talentos. `RUN-001` adiciona `Compat.State`: `issecretvalue` verifica
cada retorno e campo selecionado antes de normalização, inclusive quando a sonda é negativa. Guard ausente
fecha a leitura. Cooldown e cargas possuem resultados independentes; nil em cargas significa spell sem
cargas somente após uma chamada permitida e bem-sucedida, nunca depois de falha da API.
As referências fixadas, formatos e invalidação antecipada por `ADDON_RESTRICTION_STATE_CHANGED` estão em
[`STATE_ENGINE.md`](STATE_ENGINE.md). Essa extensão foi verificada offline em 2026-09-14, sem teste no cliente Retail.
