# Exploração segura e reset granular — UX-005

As mudanças comuns continuam imediatas. **Experimentar** inicia uma sessão temporária na
seção ou elemento aberto: clicar em opções atualiza a prévia, sem gravar preferências nem
criar histórico. **Manter mudanças** confirma o conjunto como uma ação; **Cancelar prévia**
descarta tudo. O arraste do tamanho principal respeita a sessão: soltar não a confirma cedo.
Fora de Experimentar, soltar o slider continua confirmando apenas aquele arraste.

Isso não introduz um botão Aplicar obrigatório para a configuração normal. O estado
temporário é indicado explicitamente. Navegar para outro assunto/elemento, fechar/Escape,
reapresentar a demo/editor, entrar em combate ou mudar contexto cancela o que não foi mantido.
Não existe persistência de rascunho nem restauração de rascunho após reload.

## Alcances de restauração

| Controle | Overrides removidos no perfil selecionado |
| --- | --- |
| Elemento: principal | mainScale |
| Elemento: teclas | keys, keyPosition |
| Elemento: organização | count, direction, spacing, alignment |
| Seção: Fila | count, scale, direction, motion, mainScale, spacing, alignment |
| Seção: Informações | keys, keyPosition, numbers, indicators |
| Perfil | Todas as preferências conhecidas, somente no alcance selecionado |

O primeiro clique em Restaurar **mostra** o resultado herdado; nada é apagado. Somente
**Confirmar restauração** remove os overrides. Cancelar preserva inclusive Undo/Redo.
Confirmar limpa o histórico, pois reset é uma operação distinta, não uma edição comum.
Outros personagens/specs, ancestrais e extensões desconhecidas são preservados. Campos
inválidos solicitados são removidos explicitamente; campos inválidos fora do alcance ficam.
Na camada global, remover override revela o default; nas demais revela o ancestral.

Se o usuário editar outra opção durante a prévia de reset, ela é cancelada antes dessa
edição normal. O slider não altera nem confirma uma prévia de reset. Copiar perfil mantém
sua confirmação própria. Uma instância de painel sem History preserva o fluxo anterior de
dois cliques; o bootstrap real sempre usa History.

## Contratos e proteção

History mantém modos drag/explore/reset com snapshots isolados. ResetPreview resolve uma
cópia sem os campos escolhidos, sem modificar o banco sequer temporariamente. ResetFields
valida o conjunto inteiro de campos, a identidade/alcance, o snapshot atual e os valores
que seriam exibidos após reset antes de qualquer escrita. Alterar um ancestral entre a
prévia e a confirmação rejeita a operação, assim como drift no próprio perfil. Profiles
mantém a guarda de combate observável. Nenhum novo acesso à API, timer ou asset foi adicionado.

`tests/unit/preview_reset_spec.lua` cobre 21 cenários: confirmação agrupada, cancelamento,
Redo preservado, interação com slider, alcances, herança, perfis vizinhos, corrupção, drift,
combate, spec, somente leitura, modo sem persistência e reconstrução com rascunho pendente.
Os testes são offline. Mouse, texto, teclado, taint e fluxo dentro do Retail ainda dependem
do checklist real; não se declara aprovação visual. A curadoria de acabamento segue adiada.
