# CORE-002 — Registry de classes/specs

## Objetivo

Implementar um registry genérico que descubra módulos de especialização por identidade estável, sem exigir alterações no Core quando uma nova classe/spec for adicionada.

## Escopo

- definir a API pública de registro e consulta;
- aceitar somente descritores válidos pelo contrato `SpecModule`;
- indexar módulos por `id` e `specId`;
- rejeitar registros duplicados ou conflitantes com erros determinísticos;
- garantir ordem de listagem estável, independente da ordem de carregamento;
- adicionar uma fixture neutra que demonstre carregamento plugável;
- documentar ownership, lifecycle e ordem de carregamento do registry.

## Fora do escopo

- detectar a spec ou os talentos do personagem (`CORE-003`);
- chamar APIs da Blizzard (`CORE-004`);
- criar catálogo ou regras de Enhancement;
- avaliar regras ou produzir recomendações;
- descoberta dinâmica de arquivos fora da ordem declarada no TOC.

## Critérios de aceite

- uma fixture de spec é registrada e consultada sem alterar a implementação do Core;
- módulos inválidos, IDs duplicados e `specId` duplicados são rejeitados;
- consultas ausentes retornam resultado explícito e não causam erro de runtime;
- listagens possuem ordem determinística;
- contratos da `CORE-001` continuam sendo a única fronteira aceita pelo registry;
- `npm test` permanece verde.
