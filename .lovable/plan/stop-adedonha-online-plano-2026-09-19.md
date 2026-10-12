# Stop / Adedonha online — plano

Jogo de Stop (Adedonha) em português do Brasil, feito para celular, para jogar com amigos em tempo real, com avaliação por IA usando o mínimo de requisições.

## Como vai funcionar

1. **Entrar sem cadastro** — a pessoa digita só um apelido. Quem cria a sala vira o mestre e tem a opção de compartilhar a sala por link.
2. **Sala de espera** — a lista de jogadores aparece e atualiza sozinha. O mestre define: 4, 6, 8 ou 10 rodadas; a lista de categorias (pode adicionar, editar e remover quantas quiser e salvar pra jogadas futuras); se terá cronômetro (e de quanto tempo); e quem pode apertar STOP (só o mestre ou qualquer jogador).
3. **Rodada** — escolhe letras que não entram na rodada, sorteia uma letra (sem repetir enquanto houver letras novas) e escolhe 8 categorias da lista. A tela nunca mostra mais de 8. Se a lista tiver mais de 8, as rodadas seguintes puxam as que ainda não foram usadas recentemente, em rodízio. Menos de 8 cadastradas: usa todas.
4. **Respondendo** — cada jogador preenche os campos; as respostas são salvas automaticamente enquanto digita, então atualizar a página não perde nada. Dá para deixar em branco e apertar "Terminei" (que só avisa os outros, não encerra). A rodada acaba com o STOP autorizado ou com o fim do tempo, e aí as respostas ficam congeladas.
5. **Avaliação** — uma única consulta à IA por rodada, com a letra, as 8 categorias e as respostas de todos os jogadores de uma vez. O resultado é gravado na hora.
6. **Resultados** — uma categoria por vez, mostrando todos os jogadores, a resposta inteira (o card cresce, nada é cortado), os pontos e um comentário curto e sarcástico da IA. "Próxima categoria" só navega no que já está salvo — nunca consulta a IA de novo, nem depois de atualizar a página.
7. **Placar** — atualizado ao fim de cada rodada e visível para todos em tempo real.
8. **Final** — depois da última rodada, ranking ordenado, vencedor em destaque e uma única consulta extra à IA que devolve um comentário sarcástico e diferente para cada jogador.

Total de IA: 1 consulta por rodada + 1 no final (ex.: 8 rodadas = 9 consultas).

## Pontuação

- 0 — inválida ou em branco
- 5 — repetida ou com o mesmo sentido de outra resposta da categoria
- 10 — válida e comum
- 15 — criativa, engraçada ou inesperada
- 20 — sacada realmente inteligente e defensável (seletivo)

A IA compara por significado: "celular" e "smartphone" contam como repetidas; "cachorro" e "gato" não. Aceita acentos, apelidos, sinônimos e nomes populares; recusa respostas forçadas.

## Detalhes técnicos

- **Backend:** Lovable Cloud (banco + tempo real). Sem API externa, sem chave de API, sem Gemini — só a IA interna da plataforma, chamada no servidor.
- **Tabelas:** `rooms` (código, mestre, configurações, estado, letras já sorteadas), `players` (apelido, sala, pontuação), `rounds` (número, letra, 8 categorias da rodada, estado, avaliação em JSON), `answers` (jogador, rodada, categoria, texto) com salvamento contínuo.
- **Tempo real:** assinaturas nas tabelas de jogadores, rodadas e respostas para sincronizar lista, "Terminei", STOP e placar.
- **Acesso:** sala e jogadores identificados por código + id local guardado no aparelho; políticas de acesso liberam apenas os dados da própria sala, e a gravação da avaliação acontece só no servidor.
- **Rodízio de categorias:** cada categoria guarda a última rodada em que foi usada; a seleção ordena pelas menos usadas recentemente e sorteia dentro do empate.
- **IA:** uma função de servidor monta um único prompt com toda a rodada e recebe um JSON estruturado (pontos + comentário por resposta). Idempotente: se a rodada já tiver avaliação salva, retorna a salva. Mesma abordagem para a análise final.
- **Telas:** entrada, sala de espera/configuração, jogo, resultados por categoria, ranking final — todas pensadas primeiro para celular.

## Design

Depois da aprovação, apresento 3 direções visuais para você escolher antes de construir.