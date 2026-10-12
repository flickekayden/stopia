# Chat móvel em tempo real para o STOP!

## Objetivo
Adicionar um chat exclusivo da sala, feito para celular, sem mensagens automáticas e indisponível enquanto os jogadores preenchem respostas.

## Experiência no celular
- Exibir um botão flutuante de conversa com contador de não lidas.
- Abrir uma gaveta inferior com cerca de 60% da tela, fundo semitransparente, botão de fechar e gesto de arrastar para baixo.
- Ajustar a altura da gaveta quando o teclado virtual aparecer, mantendo mensagens e campo de texto acessíveis.
- Pausar o chat e fechar a gaveta automaticamente durante a fase ativa da rodada; mostrar um aviso discreto caso seja aberto nesse período.

## Mensagens e respostas citadas
- Permitir mensagens de até 100 caracteres e atalhos instantâneos: “❌ Discordo”, “😂 KKKK”, “⏳ Corre!” e “👏 Boa”.
- Extrair o cartão visual de resposta para um componente reutilizável, preservando nome, categoria, resposta, pontos e comentário da IA.
- Adicionar “Reagir / comentar” em cada resposta dos resultados.
- Ao reagir, abrir o chat com o cartão anexado e oferecer 😂, ❌, 🤔 e 👏, além de comentário digitado.
- Renderizar a citação completa dentro da mensagem; ao tocá-la, fechar o chat, navegar para a categoria correta e destacar temporariamente a resposta original.

## Tempo real e segurança
- Criar uma tabela de mensagens vinculada à sala, ao jogador e opcionalmente à rodada, com texto, reação e uma cópia validada da resposta citada.
- Validar envios no servidor: jogador pertence à sala, chat não está bloqueado, conteúdo possui no máximo 100 caracteres, reação está na lista permitida e a citação corresponde à avaliação persistida da rodada.
- Escapar conteúdo naturalmente pela renderização React e nunca interpretar HTML enviado.
- Transmitir apenas eventos da sala atual e recarregar as mensagens autorizadas dessa sala; não criar mensagens sistêmicas.
- Manter somente as mensagens mais recentes necessárias ao chat e apagar mensagens automaticamente quando a sala for excluída.

## Integração com o jogo
- Disponibilizar o chat apenas depois que o visitante realmente entrou como jogador.
- Considerar a fase `answering` como bloqueada; lobby, correção/resultados e ranking permanecem liberados.
- Limpar a citação pendente se a rodada mudar ou se o chat for bloqueado.
- Preservar todos os controles, sons e fluxos atuais do jogo.

## Validação
- Atualizar os tipos do banco após a migração.
- Verificar compilação e lint do projeto.
- Testar em viewport móvel: abrir/fechar/arrastar, teclado, limite de texto, atalhos, não lidas, bloqueio automático e citação com retorno/destaque.
- Testar com dois jogadores na mesma sala para confirmar entrega em tempo real e isolamento entre salas.
