# Global Cooldown

## Direção aprovada

O GCD é uma barra procedural fina, exclusiva da ação atual. Ele não possui bitmap próprio: trilho, preenchimento e recorte devem ser construídos com primitivas leves do cliente.

- o progresso começa vazio e cresce da esquerda para a direita;
- o padrão aprovado usa prata neutro sólido `#D8E1E8`, configurável pelo tema ou apenas para o componente;
- o trilho usa grafite azulado sólido `#07131D`;
- não há gradiente, bloom incorporado, brilho móvel, label ou contagem regressiva;
- ao concluir, o preenchimento desaparece e apenas o trilho discreto permanece;
- o componente nunca aparece nos itens da fila.

O verde da marca não participa do GCD. Ele continua reservado a confirmação e estados favoráveis, evitando confusão com proc ou disponibilidade. Azul, ciano, âmbar e vermelho também permanecem livres para estrutura, cast, atenção e debuff/urgência.

A geometria, direção, integração e prata padrão estão aprovadas. O GCD segue `LINEAR_PROGRESS` e não usa o segmento rolável dos contornos.

O contrato compartilhado de canaletas, defaults e overrides está em [`../procedural-channels.json`](../procedural-channels.json).

## Arquivos

- `gcd-state-reference-v2.svg`: fonte vetorial ativa da prancha conceitual com o prata aprovado.
- `gcd-state-reference-v2.png`: preview ativo da prancha; as legendas pertencem somente à documentação.
- `action-current-gcd-slot-preview-v2.png`: composição ativa com o GCD prata a `62%`; o fundo neutro e o preenchimento existem somente no preview.
- arquivos `v1`: histórico da direção azul anterior.
- `manifest.json`: contrato de geometria, cores, direção e handoff.

A prancha não é asset de runtime. O contrato está pronto para integração; a implementação permanece na task técnica correspondente.

O encaixe correspondente está na moldura aprovada [`action-current-frame-v5.png`](../frames/action-current-frame-v5.png). O PNG da moldura contém apenas o bezel; sua abertura é transparente e recebe `gcdTrack` e `gcdFill` em camadas separadas.
