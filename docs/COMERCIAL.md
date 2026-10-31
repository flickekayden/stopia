# Stopia — modelo comercial, contas e Android

Atualizado em 31/10/2026.

## 1. Regra de cobrança

- **Unidade:** 1 crédito = 1 solicitação de IA (uma chamada à chave Gemini do dono) feita numa Sala da Galera.
- **Quem paga:** só a carteira de quem **criou** a sala (`party_room_billing`). Quem entra pelo código nunca gasta nada. Se o mestre sair e outro virar mestre, a sala continua pagando com a carteira do criador.
- **Grátis:** cada carteira nova (convidado ou conta) recebe 20 uma única vez. Uma mesma rede pode abrir no máximo 5 carteiras de convidado com grátis por dia; depois disso a carteira nasce com 0.
- **Pacote:** 20 solicitações por R$ 5,00, pagamento único (configurável em `app_settings.billing`: `freeCredits`, `packCredits`, `priceCents`, `playProductId`, `androidPackage`). No Android o preço exibido vem da própria Google Play.
- **Sem saldo:** os jogos seguem com o conteúdo próprio (banco de temas, votação da galera). O **Stop** não começa com saldo 0, porque só a IA julga. Nenhuma partida em andamento é interrompida para vender.
- **Nunca cobra duas vezes:** cada chamada usa uma chave única derivada da versão da sala que disparou o passo. Recarregar, reconectar, tocar duas vezes ou eventos ao vivo repetidos caem na mesma chave. Se a IA falhar, o crédito volta (`ai_refund`).

### O que gasta solicitação, por jogo

| Jogo | Por rodada | No fim |
|---|---|---|
| Stop | 1 (juiz da rodada) | — |
| Tribunal dos Amigos | 1 caso criado pela IA (se "IA no jogo") + 1 juiz de IA **ou** 1 comentário após a votação | 1 prêmios finais (se IA ligada) |
| Debate Impossível | 1 tema (se IA ligada) + 1 juiz de IA **ou** 1 comentário | 1 prêmios finais (se IA ligada) |
| Quem Escreveu? | 1 pergunta + 1 comentário (se IA ligada) | — |
| Roleta do Caos | 1 desafio (se IA ligada; pular desafio gasta outro) + 1 juiz de IA, se escolhido | — |
| Infiltrado | 0 | — |
| Bots de treino (admin) | 1 por lote de respostas dos bots | — |

O mestre vê antes de começar: "IA do mestre: N solicitações · esta partida usa até X".

Salas antigas de Stop (`/sala/...`) não podem mais ser criadas; nelas e na "explicação da nota" a IA ficou restrita a administradores, porque não há saldo ligado.

## 2. Contas e convidados

- Login opcional: e-mail e senha (com confirmação por e-mail e recuperação de senha) ou Google.
- Convidado: o servidor gera um token aleatório; o aparelho guarda o token e o banco guarda só o hash. O saldo do convidado se perde se os dados do app forem apagados — isso é avisado antes da compra.
- Ao entrar numa conta, o saldo do convidado vai junto: se a conta ainda não tinha saldo, a carteira inteira passa para a conta; se já tinha, só as solicitações compradas e não usadas são transferidas (as grátis não somam duas vezes).
- Perfil (`/perfil`): nome, avatar, saldo, grátis recebidas, usadas, pacotes, total comprado, histórico de pagamentos e de movimentações, tema, termos, privacidade, suporte, sair e excluir conta. A exclusão apaga o login e o perfil; o registro financeiro fica sem ligação com o e-mail.

## 3. Pagamento (Google Play Billing)

Política: apps distribuídos pela Google Play que vendem itens digitais precisam usar o faturamento da Google Play ([política](https://support.google.com/googleplay/android-developer/answer/10281818)). O Brasil tem programa de faturamento alternativo, mas exige inscrição e integração própria; não foi usado. Num app web empacotado (Trusted Web Activity) a compra usa a Digital Goods API + Payment Request API ([guia](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)).

Fluxo implementado:
1. O jogador toca em "Liberar 20 solicitações" e confirma preço e condições.
2. O servidor cria uma transação `initiated` com id único.
3. A Google Play abre a cobrança no aparelho.
4. O app envia o comprovante (`purchaseToken`) ao servidor.
5. O servidor consulta a Google Play Developer API com a conta de serviço. Só `purchaseState = 0` com número de pedido libera crédito.
6. O crédito entra uma única vez por número de pedido; o mesmo comprovante não pode ser reutilizado.
7. O servidor "consome" a compra na loja para permitir comprar de novo.
8. Pendente fica `pending` e entra quando a loja confirmar ("Verificar de novo" ou reconciliação). Cancelado e recusado não liberam nada.
9. Estornos: a reconciliação do admin lê as compras anuladas dos últimos 30 dias, marca a transação como `refunded` e remove do saldo só o que ainda não foi usado daquele pacote.

No navegador comum não existe compra: a tela explica que é preciso o app Android. Uma compra feita no Android aparece em outro aparelho somente se o jogador estiver com a mesma conta.

## 4. Administração

- Sem senha fixa. Administrador = conta com papel `admin` em `user_roles`, conferido no servidor em cada ação.
- Primeiro administrador: o e-mail `carlosrpm2018@gmail.com` está na lista interna `admin_invites`. Ao criar a conta com esse e-mail e confirmar o e-mail, o papel é dado automaticamente.
- Modo desenvolvedor: cinco toques no título da tela inicial, já logado com a conta admin → "Ativar com minha conta". O token dura 12 horas e para de valer se o papel for removido.
- Painel → "Negócio e moderação": contas, saldos, usos de IA, pacotes vendidos, pendentes, erros, estornos, salas, denúncias; reconciliar pagamentos; ajuste de saldo por e-mail com motivo obrigatório (fica no histórico e na auditoria); fila de denúncias.

## 5. Segurança do banco

- Carteiras, movimentações, usos de IA, cobrança das salas, transações, auditoria, denúncias e convites: sem acesso para visitantes ou contas; só funções do servidor.
- `profiles`: cada conta lê e altera só o próprio perfil. `user_roles`: cada conta só lê os próprios papéis; ninguém se promove pelo app.
- Funções de saldo (`credit_apply`, `credit_consume`, `credit_refund`, `credit_merge`) travam a carteira e não deixam o saldo ficar negativo; só o servidor pode executá-las.
- Limitação conhecida (anterior a esta etapa): salas, apelidos, placar e chat das salas da galera continuam legíveis pelo canal ao vivo, porque jogadores não fazem login. Segredos de partida continuam protegidos.

## 6. Compartilhamento

- Cartões próprios por jogo (1200×630) com marca, nome do jogo e chamada; sem dados privados.
- O link `/festa/CÓDIGO` é gerado no servidor com título, descrição e imagem do jogo escolhido, então WhatsApp e afins mostram a prévia sem rodar JavaScript.
- Na sala: copiar link, copiar código e "Enviar" (compartilhamento nativo do Android com o cartão do jogo).

## 7. Moderação e privacidade

- Páginas: `/termos` (inclui regras de convivência), `/privacidade`, `/suporte`. Aceite dos termos obrigatório ao criar conta; aviso de aceite ao criar/entrar numa sala.
- Chat: tocar numa mensagem → "Denunciar" (vai para a fila do admin) ou "Silenciar jogador" (só neste aparelho).
- Contato de suporte usado nas páginas: carlosrpm2018@gmail.com (troque se quiser outro).

## 8. Android (Trusted Web Activity)

Arquivos prontos:
- `android/twa-manifest.json` (Bubblewrap) com `playBilling` ligado, pacote `app.stopia.twa`, cores e ícone.
- `/.well-known/assetlinks.json` gerado pelo servidor a partir do segredo `ANDROID_SHA256_FINGERPRINTS`.

Passos:
1. `npm i -g @bubblewrap/cli` e, na pasta `android/`, `bubblewrap init --manifest https://stopia.lovable.app/manifest.webmanifest` (ou use o `twa-manifest.json` daqui).
2. `bubblewrap build` gera o `.aab` assinado (guarde o keystore com segurança).
3. Envie o `.aab` para um teste interno na Play Console e ative a Assinatura de apps do Google Play.
4. Copie as impressões SHA-256 (chave de upload e chave de assinatura do app) para o segredo `ANDROID_SHA256_FINGERPRINTS`, separadas por vírgula.
5. Crie o produto de compra única `stopia_ia_20` a R$ 5,00 (consumível).
6. No Google Cloud, ative a "Google Play Android Developer API", crie uma conta de serviço, gere a chave JSON e dê a ela acesso financeiro na Play Console. Salve o JSON no segredo `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
7. Teste com testadores de licença (compras de teste aparecem marcadas como "teste").

Microfone: dentro do app o Chrome pede a permissão ao entrar na voz. Voltar do Android segue o histórico do navegador.

## 9. Testes executados

- 19 testes automáticos novos (`tests/billing.test.ts`): valores do pacote, grátis, aviso de saldo baixo, bloqueio do Stop sem saldo, estimativa por jogo, transferência convidado→conta, limite do estorno, classificação das compras da Google Play e regressão do juiz do Stop (texto, formato e normalização idênticos).
- No banco: concessão grátis única, uso, uso repetido recusado, devolução única, nova cobrança após devolução, compra aplicada uma vez, saldo 0 recusando novo uso, correção que deixaria saldo negativo recusada, histórico somando o saldo, e bloqueio de leitura/escrita por visitantes e contas.
- No app (dois celulares simulados): convidado cria sala e recebe 20; Debate com IA gastou 1; Stop julgado pela IA gastou exatamente 1; com saldo 0 o Stop não começa e o Debate começa com tema do banco; perfil e tela de compra no navegador; modo desenvolvedor pede conta admin; prévia do link da sala com título, descrição e imagem.

Não testado: compra real na Google Play (depende da Play Console e da conta de serviço), cadastro com confirmação de e-mail, login com Google, transferência convidado→conta com uma conta real, reconciliação de estornos.

## 10. Checklists

**Dono**
- [ ] Criar a conta com carlosrpm2018@gmail.com e confirmar o e-mail (vira administrador).
- [ ] Confirmar o e-mail de suporte e o nome do pacote Android (`app.stopia.twa`).
- [ ] Revisar termos e política de privacidade com um advogado.
- [ ] Opcional: remover o segredo antigo `DEVELOPER_PASSWORD` (não é mais usado).

**Serviços externos**
- [ ] Google Cloud: ativar a Android Developer API e criar a conta de serviço.
- [ ] Salvar `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` e `ANDROID_SHA256_FINGERPRINTS` nos segredos do projeto.
- [ ] Opcional: credenciais próprias do Google para o login.

**Google Play Console**
- [ ] Conta de desenvolvedor e perfil de pagamentos.
- [ ] App com o pacote escolhido, `.aab` no teste interno, assinatura de apps.
- [ ] Produto `stopia_ia_20` (consumível) a R$ 5,00.
- [ ] Data safety: e-mail (conta), identificadores, conteúdo gerado pelo usuário (chat/respostas), histórico de compras, áudio só transmitido ao vivo (não coletado).
- [ ] Classificação etária (conteúdo gerado por usuários e humor), política de privacidade com o link `/privacidade`.
- [ ] Testadores de licença e teste fechado antes da produção.
