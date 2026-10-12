# Controles de conclusão, nova partida e jogadores

## O que será alterado

- Na última categoria da avaliação, remover a marcação automática de “visto” e exibir um botão **Terminei** para cada jogador confirmar manualmente.
- Manter a lista **Ainda vendo** atualizada em tempo real; o mestre só poderá avançar quando todos os jogadores restantes confirmarem.
- No resultado final, deixar **Jogar de novo** disponível ao mestre. A ação manterá a mesma sala e os jogadores, zerará pontuações e progresso e voltará ao lobby para uma nova configuração.
- Adicionar **Sair** durante toda a permanência na sala. A ação removerá o próprio jogador da sala, limpará sua sessão local e tentará fechar a aba; quando o navegador impedir, voltará à tela inicial.
- Permitir ao mestre remover qualquer outro jogador em qualquer etapa da partida, com confirmação para evitar toque acidental.
- Se o mestre sair, transferir automaticamente a função de mestre ao jogador mais antigo que permanecer na sala.

## Regras e estados

- Jogadores removidos deixam imediatamente de bloquear o avanço das avaliações.
- Respostas do jogador removido também serão apagadas.
- Ao reiniciar, serão apagadas as rodadas e respostas da partida encerrada, além da análise final, letras usadas e contadores; categorias e configurações escolhidas pelo mestre serão preservadas.
- Apenas o mestre pode remover terceiros e reiniciar a sala; qualquer jogador pode remover a si próprio ao sair.

## Detalhes técnicos

- Criar ações seguras no servidor para remover jogador e reiniciar sala, validando o mestre pelo identificador da sessão da sala.
- Atualizar a tela de avaliação, o ranking final e o cabeçalho da sala com estados de carregamento e mensagens de erro.
- Validar o fluxo em celular: confirmação individual, bloqueio do avanço, remoção, transferência de mestre, saída e retorno ao lobby na mesma sala.
