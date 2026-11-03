# Antifraude dos 20 créditos grátis

## Como é protegido hoje
- Concessão só pelo servidor (`credit_grant_signup`, papel de servidor). Visitantes e contas logadas recebem "permission denied" ao chamar qualquer função `credit_*` ou ler as tabelas de crédito (provado em teste local e na API publicada).
- Uma vez por conta: trava da carteira (`FOR UPDATE`) + referência `free:user:<id>` única no ledger + índice "um bônus positivo por carteira".
- Uma vez por e-mail normalizado: linha permanente em `promo_grants` (chave = hash), que sobrevive à exclusão da conta.
- Limite de 5 bônus por rede por dia (os excedentes recebem depois).

## Testes reais
`bun test tests/integration/antifraud.pg.test.ts` sobe um PostgreSQL local descartável, aplica as migrations reais e testa os cenários A–I, concorrência real (10 conexões) e ordens de bloqueio forçadas. `STOPIA_COMPARE_LIVE=1` compara (só leitura) as funções publicadas com as testadas.

## Monitoramento
`credit_abuse_events`: uma linha por tipo/conta/dia com contador (`identity_used`, `rate_limited`, `grant_error`). Só o id da conta, sem e-mail, hash, IP ou token; apagado após 90 dias; sem acesso de cliente. Aparece para admins no painel "Negócio e moderação". Falhas no registro nunca bloqueiam a concessão.
Tentativas diretas às funções são barradas pelo banco antes de chegar ao app; só aparecem nos logs da API da plataforma.

## Proposta (NÃO implementada): HMAC no hash de identidade
**Risco:** o hash atual é SHA-256 de `stopia-promo:` + e-mail normalizado. O prefixo está no código, então quem obtiver uma cópia do banco pode testar e-mails conhecidos e descobrir quais já usaram o bônus. Não revela e-mails desconhecidos, mas confirma os conhecidos.

**Proposta:** `HMAC-SHA256(segredo, e-mail normalizado)` com segredo guardado só no servidor (Vault do banco ou segredo do servidor).
1. Adicionar coluna `identity_hmac` (única, opcional) em `promo_grants`; manter `identity_hash` existente.
2. Concessão nova: bloqueia se existir `identity_hmac` **ou** `identity_hash` antigo; grava os dois durante a transição.
3. Migração dos registros existentes: só é possível para contas que ainda existem (e-mail disponível em `auth.users`). Para contas já excluídas o e-mail não existe mais — o hash antigo precisa ser mantido para continuar bloqueando a recriação.
4. Depois de N meses, apagar `identity_hash` apenas das linhas que já têm `identity_hmac`.
5. Rollback: a coluna antiga continua válida até o passo 4, então basta voltar a função anterior.
6. Exclusão/recriação: continua bloqueada nas duas fases; o segredo nunca pode ser trocado sem recalcular (troca de segredo = perda do bloqueio para contas excluídas).

Implementar somente com aprovação explícita.
