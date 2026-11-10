# Stopia

Central de jogos de festa para celular, em português do Brasil. Uma sala por grupo, o anfitrião escolhe entre 6 jogos: **Stop (Adedonha)**, **Tribunal dos Amigos**, **Quem Escreveu?**, **Infiltrado**, **Debate** e **Roleta**. Juiz de IA opcional (créditos), chat, voz ao vivo e temas de cor.

- Produção: https://stopia.lovable.app
- Android: TWA publicado na Google Play (`app.stopia.twa`)

## Stack
TanStack Start (React 19 + Vite) · Tailwind v4 · Lovable Cloud (Postgres, auth, realtime) · Gemini com rotação de chaves · Bun para testes.

## Comandos
```bash
bun install
bun dev      # servidor local
bun test     # testes unitários
```

## Rotas principais
| Rota | Função |
|---|---|
| `/` | Criar sala ou entrar com código |
| `/festa/$code` | Sala do grupo (lobby + jogos) |
| `/perfil` | Conta, saldo de créditos |
| `/admin` | Painel administrativo (somente admin) |
| `/privacidade` | Política de privacidade |

## Documentação
Veja [`docs/`](docs/README.md). Regras de arquitetura para agentes em `AGENTS.md`.

## Segredos
Nunca faça commit de chaves. Modelo em `.env.example`; valores reais ficam no Lovable Cloud.
