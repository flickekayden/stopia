# Efeitos sonoros do STOP!

## Objetivo
Adicionar uma camada sonora leve e opcional ao jogo, sem bloquear a navegação e respeitando as regras de reprodução dos navegadores.

## O que será feito
- Criar efeitos próprios e livres de royalties em `/public/sounds` para clique, entrada de jogador, erro, todos prontos, vitória e derrota.
- Criar um gerenciador central de áudio que pré-carrega os sons, só libera reprodução após a primeira interação e ignora falhas sem afetar o jogo.
- Adicionar um controle visível de som ligado/desligado, disponível em todas as telas e salvo no aparelho.
- Tocar clique nos botões, efeito especial ao criar sala, alerta em erros, aviso quando um novo jogador entrar e quando todos terminarem de ver as avaliações.
- Tocar vitória ou derrota ao abrir o ranking final, conforme a pontuação do jogador atual.
- Evitar repetição de sons causada pelas atualizações em tempo real ou por remontagem da tela.

## Detalhes técnicos
- Os arquivos serão curtos e compactos, gerados localmente e servidos pelo próprio app; nenhuma API externa será usada.
- O estado de áudio ficará em um provider React global, com preferência persistida em `localStorage`.
- Eventos multiplayer serão detectados comparando o estado anterior e o atual, tocando uma única vez por mudança relevante.
- O controle usará ícones de volume e texto acessível, com indicação clara do estado.

## Validação
- Conferir som ligado/desligado e persistência após recarregar.
- Testar bloqueio antes da primeira interação e reprodução depois dela.
- Verificar no celular que o controle não cobre botões ou conteúdo.
- Testar entrada de jogador, erro, todos prontos e ranking sem sons duplicados.
