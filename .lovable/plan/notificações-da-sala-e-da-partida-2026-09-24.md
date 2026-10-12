# Notificações da sala e da partida

## Objetivo
Adicionar avisos curtos e sincronizados aos eventos importantes, sem bloquear os campos de resposta no celular.

## Implementação
- Exibir toasts de 2–3 segundos quando alguém entrar ou terminar de responder.
- Mostrar um aviso central leve quando todos terminarem.
- Transformar o STOP em uma contagem sincronizada de 3 segundos: o nome de quem apertou aparece imediatamente, os campos permanecem disponíveis durante a contagem e só então são bloqueados para avaliação.
- Avisar uma única vez quando restarem 15 segundos.
- Notificar reações com emoji feitas à resposta do jogador no chat.
- Destacar respostas de 20 pontos com selo, brilho e animação discreta, respeitando a preferência por menos movimento.

## Detalhes técnicos
- Usar as atualizações em tempo real já existentes de jogadores, respostas, rodadas e chat.
- Guardar o início do STOP nos dados da rodada para que todos os celulares vejam a mesma contagem.
- Tornar a finalização após os 3 segundos idempotente para evitar duplicações.
- Posicionar os avisos no topo/área de status, fora dos campos de digitação.

## Validação
- Conferir o fluxo no celular, o contador do STOP, o aviso de 15 segundos, os eventos de entrada/conclusão e o destaque de 20 pontos.
- Confirmar que o projeto continua abrindo sem erros.
