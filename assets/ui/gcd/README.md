# Global Cooldown

## Direção aprovada

O GCD é uma barra procedural fina, exclusiva da ação atual. Ele não possui bitmap próprio: trilho, preenchimento e recorte devem ser construídos com primitivas leves do cliente.

- o progresso começa vazio e cresce da esquerda para a direita;
- o preenchimento usa azul elétrico sólido `#0788D8`;
- o trilho usa grafite azulado sólido `#07131D`;
- não há gradiente, bloom incorporado, brilho móvel, label ou contagem regressiva;
- ao concluir, o preenchimento desaparece e apenas o trilho discreto permanece;
- o componente nunca aparece nos itens da fila.

O verde da marca não participa do GCD. Ele continua reservado a confirmação e estados favoráveis, evitando confusão com proc ou disponibilidade.

## Arquivos

- `gcd-state-reference-v1.svg`: fonte vetorial da prancha conceitual dos estados.
- `gcd-state-reference-v1.png`: preview renderizado da prancha; as legendas pertencem somente à documentação.
- `action-current-gcd-slot-preview-v1.png`: composição de revisão com o GCD a `62%`; o fundo neutro e o preenchimento existem somente no preview.
- `manifest.json`: contrato de geometria, cores, direção e handoff.

A prancha não é asset de runtime. A implementação final permanece sob `UI-DESIGN-008` e a task técnica correspondente.

O encaixe correspondente está na candidata [`action-current-frame-v5.png`](../frames/action-current-frame-v5.png). O PNG da moldura contém apenas o bezel; sua abertura é transparente e recebe `gcdTrack` e `gcdFill` em camadas separadas.
