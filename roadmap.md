# Roadmap

- [x] Competitive Premium: palette, shared controls and global surfaces
- [x] Competitive Premium: round screen (letter, timer, fields, STOP)
- [x] Competitive Premium: lobby, results, final podium, home and states
- [x] Verify real match, sizes and untouched AI/game logic


- [x] Refresh shared visual language and all game screens without changing functions
- [x] Verify the redesigned multiplayer flow and narrow/wide layouts

- [x] Audit current UI, multiplayer protections and AI boundaries
- [x] Refine entry validation, lobby settings, result clarity and honest tied rankings
- [x] Improve recovery, input preservation and duplicate-action feedback without changing AI
- [x] Run real multiplayer and regression checks; document tested limits

- [x] Add compact round chat, rotating evaluation feedback and synchronized pre-round countdown
- [x] Add saved keyboard switch, results clearance, consistent entry/exit icons and copyable room link
- [x] Add results keyboard shortcuts and verify the package in real multiplayer matches

- [x] Audit every route, shared control and game phase across narrow, short and wide viewports
- [x] Adapt fixed actions, forms, dialogs, game keyboard and long content without changing rules
- [x] Verify real multiplayer, chat and final rankings across device sizes

- [x] Review all screens before visual changes
- [x] Polish shared controls, typography, contrast and sheets
- [x] Refine home, lobby, round, results, ranking and chat without changing rules
- [x] Verify real game flows and mobile/desktop layouts

- [x] Adapt all screens to a smartphone frame and thumb-zone controls
- [x] Add safe-area bottom sheets, large touch targets and keyboard navigation
- [x] Add mobile installation, status-bar theme and supported haptics
- [x] Verify mobile/desktop framing, real game flows and developer room controls

- [x] Audit application performance before making changes
- [x] Reduce room refreshes and preserve multiplayer synchronization
- [x] Split optional screens and streamline chat loading
- [x] Optimize audio, subscriptions, timers and result rendering
- [x] Verify real multiplayer flows and record performance evidence

- [x] Add timed results readiness, host override and inactive-player bypass
- [x] Simplify results to one category at a time with a next-category button
- [x] Compact home entry, lobby tags/presence, and focused round header
- [x] Add podium and shareable champion summary
- [x] Verify multiplayer pacing and screen flows

- [x] Add secure voice uploads and realtime distribution during results
- [x] Add seven-second push-to-talk, cancellation, playback queue and saved mute
- [x] Verify voice reactions with two players and mobile-sized results

- [x] Add supplied built-in category presets and lobby replace/merge controls
- [x] Verify eight-category rotation and real lobby persistence

- [x] Mostrar salas criadas para todos na tela inicial
- [x] Proteger exclusão com senha de desenvolvedor no servidor
- [x] Apagar sala e todos os dados relacionados
- [x] Validar os fluxos no celular
- [x] Adicionar efeitos sonoros e controle persistente de áudio
- [x] Validar áudio e controle no celular
- [x] Criar armazenamento seguro das mensagens por sala
- [x] Implementar gaveta móvel e mensagens em tempo real
- [x] Reutilizar o cartão de resposta em citações do chat
- [x] Bloquear o chat durante o preenchimento da rodada
- [x] Validar chat, citações e isolamento com dois jogadores
- [x] Persistir sessão anônima e permitir reconexão pelo mesmo dispositivo
- [x] Detectar presença online/offline por heartbeat em tempo real
- [x] Exibir presença na lista de jogadores e no chat
- [x] Validar reconexão e apelido duplicado; manter o limite atual de presença e conferir expiração
- [x] Notificar novas mensagens no balão e ajustar sua posição
- [x] Liberar somente mensagens rápidas durante a rodada
- [x] Salvar e usar listas globais de categorias (exclusão só com senha)
- [x] Adicionar notificações de sala, conclusão, STOP, tempo, reações e respostas de 20 pontos
- [x] Desativar preenchimento automático e correção nos campos de respostas
- [x] Focar a primeira resposta ao iniciar e rolar ao topo em cada categoria avaliada

- [x] Product-designer pass: round HUD no longer jumps between fields, clears the sound button, compacts on scroll
- [x] Last answer's Enter brings Terminei/STOP into view; home tabs fit on one line; room header exit button aligned
- [x] Verify two-player round, results and narrow screens

## Central de Jogos (5 novos minijogos)
- [x] Audit Stop boundaries; isolate party tables, private data and AI prompts from Stop
- [x] Games hub with six cards and code entry; Stop card keeps the original flow
- [x] Shared party engine: rooms, sessions, phases, deadlines, version-guarded advances, scoring
- [x] Tribunal dos Amigos, Quem Escreveu Essa Desgraça?, Roleta do Caos
- [x] Infiltrado (server-only secret word/role) and Debate Impossível
- [x] Regression tests for party scoring + Stop tests; real multiplayer verification

## Sala da Galera unificada
- [x] Home with one nickname, "Criar Sala da Galera" and code entry; games showcase
- [x] Group lobby: host picks any of six games, minimum-player gate, waiting card for guests
- [x] Stop integrated by link: whole group enters the Stop room and returns together
- [x] End of match: "Jogar Novamente" / "Trocar de Jogo"; guests wait for the host
- [x] Developer panel scoped to the game on screen, per-game timings/AI tone/chaos events
- [x] Tests and real two-player verification (Debate match, switch, Stop round-trip)

## Correções de sala global e mobile
- [ ] Card de link/compartilhar na sala da galera
- [ ] Listar e excluir salas globais (admin)
- [ ] Sem sobreposição: sair, chat, admin e som no topo
- [ ] Chat fixo no cabeçalho em todas as telas
- [ ] Revisar telas no celular (largura, rodapé, placar)
