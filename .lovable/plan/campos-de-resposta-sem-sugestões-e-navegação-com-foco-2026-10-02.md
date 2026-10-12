# Campos de resposta sem sugestões e navegação com foco

## Alterações
- Aplicar nos campos de respostas das categorias os atributos que desativam preenchimento automático, gerenciadores de senha, correção, capitalização e verificação ortográfica.
- Ao começar cada rodada, colocar o cursor no primeiro campo de resposta e trazê-lo para a área visível.
- Ao abrir os resultados e ao avançar por cada categoria, levar a tela ao início da avaliação atual.

## Validação
- Conferir os atributos no navegador em uma sala de jogo.
- Conferir o foco inicial e a rolagem entre categorias em tela móvel.
- Confirmar que o projeto continua compilando sem erros.

## Detalhes técnicos
- As propriedades serão aplicadas diretamente ao campo de resposta compartilhado em `RoundBoard`.
- O foco usará uma referência ao primeiro input, após a montagem da rodada.
- A avaliação usará uma referência de seção e rolagem suave ao mudar o índice da categoria.