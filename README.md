# Stopia

Crie um jogo online de Stop (Adedonha) em português do Brasil, otimizado para celular e para jogar com amigos.

Não utilizar API externa, chave de API ou Gemini.

Utilizar somente a IA interna disponível na própria plataforma para avaliar as respostas e gerar os comentários.

O objetivo é utilizar a menor quantidade possível de requisições à IA.

1. MULTIPLAYER

Permitir criar uma sala sem cadastro.

Cada jogador informa apenas um apelido.

O criador da sala é o mestre.

Outros jogadores entram por código da sala.

Todos os jogadores devem aparecer em tempo real.

O placar deve ser sincronizado em tempo real.

As respostas de cada jogador devem ser salvas durante o preenchimento.

2. CATEGORIAS

O número de categorias cadastradas deve ser ilimitado.

O mestre pode:

adicionar quantas categorias quiser;

remover categorias;

editar categorias antes da partida.

Porém, durante a partida, devem ser utilizadas somente 8 categorias por vez.

Rotação das categorias

As categorias devem funcionar em sistema de rotação.

A cada rodada, selecionar 8 categorias da lista disponível.

Se houver mais de 8 categorias cadastradas, as categorias devem ser alternadas entre as rodadas para proporcionar variedade e evitar repetir sempre as mesmas.

Exemplo:

Lista com 20 categorias:

Rodada 1: categorias 1–8

Rodada 2: categorias 9–16

Rodada 3: categorias 17–20 + 4 categorias que ainda precisem ser reutilizadas

Rodada 4: próxima rotação

A lógica deve priorizar categorias que ainda não foram utilizadas recentemente.

Se houver menos de 8 categorias cadastradas, utilizar todas as disponíveis.

IMPORTANTE: a lista de categorias pode ser ilimitada, mas a tela de jogo nunca deve apresentar mais de 8 categorias simultaneamente.

As 8 categorias da rodada são mantidas durante toda aquela rodada e são iguais para todos os jogadores.

3. CONFIGURAÇÃO

O mestre escolhe:

4, 6, 8 ou 10 rodadas;

as categorias disponíveis;

se haverá cronômetro;

quem pode apertar STOP.

4. MODO DE JOGO

Cada rodada é um ciclo completo:

sortear letra → selecionar 8 categorias → jogadores respondem → STOP/tempo → congelar respostas → uma única avaliação da IA → revelar resultados → atualizar placar.

Se forem escolhidas 8 rodadas, executar exatamente 8 ciclos completos.

Exemplo:

Rodada 1 de 8

Letra + 8 categorias → respostas → encerramento → avaliação → resultados

Rodada 2 de 8

Nova letra + outras 8 categorias → respostas → encerramento → avaliação → resultados

Continuar até:

Rodada 8 de 8 → avaliação → resultados → fim da partida.

O ranking final só aparece depois da última rodada.

5. SORTEIO DA LETRA

Sortear uma letra para cada rodada.

Todos os jogadores recebem a mesma letra.

Evitar repetir letras enquanto existirem outras letras disponíveis.

Se todas as letras disponíveis já tiverem sido utilizadas, reiniciar o ciclo.

6. RESPOSTAS

Cada jogador responde às 8 categorias apresentadas.

Salvar as respostas durante o preenchimento.

Permitir deixar categorias em branco.

Permitir clicar em “Terminei” sem preencher tudo.

Mostrar em tempo real quem já terminou.

“Terminei” não encerra a rodada.

A rodada termina por STOP autorizado ou pelo cronômetro.

Depois do encerramento, congelar as respostas.

Nunca perder respostas por causa de atualização da página ou sincronização multiplayer.

7. AVALIAÇÃO COM IA — MÍNIMO DE REQUISIÇÕES

Esta é uma regra fundamental do projeto.

Não fazer uma requisição de IA para cada resposta.

Não fazer uma requisição de IA para cada categoria.

Fazer apenas UMA requisição à IA para avaliar toda a rodada.

Essa única requisição deve receber:

letra sorteada;

categorias da rodada;

todos os jogadores;

todas as respostas de todos os jogadores;

regras de pontuação.

A IA deve devolver a avaliação completa de todas as respostas da rodada de uma só vez.

Exemplo:

8 categorias × 5 jogadores = até 40 respostas

Mesmo assim, utilizar uma única requisição de IA para avaliar a rodada inteira.

Depois que a IA responder, salvar imediatamente todos os resultados no banco de dados.

Os resultados salvos devem ser utilizados pela interface sem novas chamadas à IA.

Se a página for atualizada depois da avaliação, carregar os resultados salvos em vez de chamar a IA novamente.

8. AVALIAÇÃO

Para cada resposta, a IA deve verificar:

se começa com a letra sorteada;

se pertence à categoria;

se é válida e defensável;

se possui o mesmo núcleo conceitual de outra resposta da mesma categoria.

Aceitar:

acentos;

sinônimos;

apelidos;

nomes populares;

variações conhecidas.

Não aceitar respostas claramente forçadas ou sem relação defensável com a categoria.

9. REPETIÇÕES SEMÂNTICAS

Comparar respostas pelo significado, não apenas pelo texto.

Exemplos:

“celular” × “smartphone” → repetidas;

“cerveja” × “cerveja Skol” → repetidas;

“peixe cozido” × “peixe frito” → repetidas;

“cachorro” × “gato” → diferentes;

“carro” × “moto” → diferentes;

“iPhone” × “Samsung Galaxy” → diferentes;

“arroz” × “arroz paraense” → diferentes quando representarem conceitos distintos.

Se duas respostas tiverem o mesmo núcleo conceitual, ambas recebem 5 pontos.

A criatividade não elimina a repetição.

10. PONTUAÇÃO

0: inválida ou em branco.

5: repetida ou semanticamente equivalente.

10: válida e comum.

15: claramente criativa, engraçada, irônica ou inesperada.

20: sacada clara, inteligente e defensável, com raciocínio lateral, inversão lógica, duplo sentido bem resolvido ou segunda camada de significado.

Os 20 pontos devem ser seletivos, mas possíveis.

Não dar 20 apenas porque uma resposta é longa, aleatória, específica ou engraçada.

11. COMENTÁRIOS DA IA

Para cada resposta, gerar um comentário muito curto.

O comentário deve ser:

natural;

sarcástico;

engraçado;

relacionado à resposta ou à categoria.

Pode utilizar deboche e zoeira leve.

Evitar comentários genéricos ou repetitivos.

Se não houver uma piada boa, utilizar um comentário seco e sarcástico.

Para resposta em branco, dar 0 pontos e fazer uma zoeira curta sobre o jogador não ter respondido.

12. RESULTADO DA RODADA

Depois que a única requisição de IA terminar:

salvar todas as avaliações;

mostrar uma categoria por vez;

mostrar todos os jogadores;

mostrar a resposta completa;

mostrar os pontos;

mostrar o comentário da IA;

atualizar o placar.

O botão “Próxima categoria” deve apenas navegar pelos resultados já salvos.

Não chamar a IA novamente ao passar para a próxima categoria.

Respostas longas nunca devem ser cortadas com ....

O texto deve quebrar em várias linhas e o card deve aumentar de altura automaticamente.

13. PRÓXIMA RODADA

Depois que todas as 8 categorias da rodada forem reveladas:

verificar se ainda existem rodadas;

se houver, iniciar a próxima rodada;

sortear nova letra;

selecionar uma nova rotação de até 8 categorias;

repetir o processo.

14. RESULTADO FINAL

Depois da última rodada:

calcular o placar final;

mostrar o ranking;

ordenar pela pontuação;

mostrar o vencedor.

Fazer uma única chamada adicional da IA para gerar uma análise final breve de todos os jogadores.

Essa análise deve ser:

curta;

individual para cada jogador;

baseada nas respostas e no desempenho durante a partida;

sarcástica;

divertida;

diferente para cada jogador.

Exemplo de estilo:

João: “Respondeu rápido, mas aparentemente metade das respostas foi escrita em estado de emergência.”

Maria: “Criatividade não faltou. Só faltou deixar alguma chance para os outros.”

Pedro: “Poucas respostas, mas quando acertou parecia que tinha estudado para o ENEM do Stop.”

A IA deve analisar todos os jogadores na mesma requisição final, e não fazer uma chamada separada para cada jogador.

Portanto, o uso de IA deve ser:

1 requisição por rodada + 1 requisição para a análise final da partida.

Exemplo com 8 rodadas:

8 requisições para avaliação + 1 requisição para análise final = 9 requisições no máximo.

Não realizar novas requisições de IA para visualizar resultados já avaliados.

15. INTERFACE

Criar uma interface simples, rápida e bonita para celular.

Priorizar:

multiplayer;

respostas;

placar;

facilidade de jogar;

avaliação da IA;

baixo consumo de requisições.

Não adicionar recursos complexos desnecessários.

Regra principal do projeto: a IA deve ser utilizada o mínimo possível, agrupando o máximo de avaliações em cada requisição.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://stopia.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6db876d5-9c17-4d5e-bcc1-61f18e99cc17).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
