# Arquitetura

- **Sala única por grupo** (`party_rooms`, jogo `lobby`); o anfitrião escolhe o jogo em `/festa/$code` e "Trocar de jogo" volta ao lobby.
- **Servidor autoritativo**: toda ação passa por server functions que verificam a sessão do jogador (hash). O navegador só lê `party_rooms`, `party_players`, `party_chat` e `category_presets`.
- **Segredos do jogo** (palavra do infiltrado, autores anônimos, votos) ficam em `party_private`/`party_submissions`, sem acesso do cliente.
- **Realtime**: linhas aplicadas direto com guarda de versão; ressincronização ao voltar à aba/reconectar.
- **Voz**: malha WebRTC sinalizada por canal realtime (somente STUN).
- **IA**: `ai.server.ts` usa o pool `ai_api_keys` (grátis antes de pagas, cooldown por tipo de erro), depois chave de ambiente, depois júri da galera. Cada pedido consome 1 crédito da carteira do criador da sala.
- **Limpeza**: salas inativas são removidas automaticamente (`room-cleanup.ts`).
