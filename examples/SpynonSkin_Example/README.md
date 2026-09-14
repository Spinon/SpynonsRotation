# Exemplo opcional de registro de skin

Este addon de desenvolvimento registra dados na API v1 do Spynon's Rotation. Ele não
seleciona a skin, não modifica a instalação atual e não cria frames/eventos próprios.
Não faz parte do pacote runtime principal nem é instalado pelo script de desenvolvimento.

TOC requer SpynonRotation. Skin.lua verifica a versão e registra uma única definição com
ID sob o namespace da pasta. Os assets são herdados do addon base; nenhum arquivo externo
é baixado ou gerado. Contrato, erros e limites: [EXTERNAL_SKINS.md](../../docs/architecture/EXTERNAL_SKINS.md).

O teste `tests/unit/external_skins_spec.lua` executa este arquivo e renderiza propriedades
da skin na Queue com frames simulados. Carregamento e aparência no Retail ainda são pendentes.
