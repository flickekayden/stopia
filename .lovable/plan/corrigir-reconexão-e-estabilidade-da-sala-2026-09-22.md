# Corrigir reconexão e estabilidade da sala

## Objetivo
Evitar jogadores duplicados, falsos “Sala não encontrada” e quedas da tela quando o celular perde conexão ou foco.

## Implementação
- Tornar o identificador persistente do dispositivo a identidade única do jogador na sala, restaurando silenciosamente o mesmo registro ao reconectar.
- Reestruturar o canal em tempo real com Presence, chave única por dispositivo, limpeza correta e reconexão explícita ao voltar à internet, à aba ou ao foco.
- Manter heartbeat a cada 5 segundos, atualizar imediatamente no retorno e só marcar ausência após 20 segundos sem resposta.
- Tornar o carregamento da sala resiliente: distinguir erro de rede de sala inexistente, repetir até 3 vezes com atraso e preservar o último estado válido durante falhas temporárias.
- Adicionar uma proteção de erro específica para a sala, em português, com botão de reconexão suave que mantém a sessão local.
- Validar o fluxo no navegador em tamanho de celular, incluindo carregamento, perda/retorno de foco e reconexão.

## Detalhes técnicos
- O hook da sala controlará estados separados de carregamento, indisponibilidade temporária e ausência confirmada.
- Eventos concorrentes serão consolidados para evitar várias buscas simultâneas e atualizações após desmontagem.
- A rota terá `errorComponent` próprio e uma chave de recuperação local, sem recarregar toda a página.
- Nenhum dado de partida ou jogador será apagado durante uma reconexão.
