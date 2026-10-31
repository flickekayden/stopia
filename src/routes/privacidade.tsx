import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, SUPPORT_EMAIL } from "@/components/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de privacidade — Stopia" },
      { name: "description", content: "Quais dados o Stopia coleta, para que usa, por quanto tempo guarda e como pedir a exclusão." },
      { property: "og:title", content: "Política de privacidade do Stopia" },
      { property: "og:description", content: "Dados coletados, uso, retenção e exclusão no Stopia." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <LegalPage title="Política de privacidade">
      <p>Esta política descreve o que o Stopia realmente coleta. Responsável pelo tratamento e contato: {SUPPORT_EMAIL}.</p>
      <h2>Dados que coletamos</h2>
      <ul>
        <li><strong>Jogo (todos):</strong> apelido, código da sala, respostas, votos, mensagens do chat, pontuação e horários de presença na sala. São visíveis aos jogadores da mesma sala, e alguns dados públicos da sala (apelidos, placar, chat) podem ser lidos pelo serviço em tempo real do app.</li>
        <li><strong>Identidade de convidado:</strong> um identificador aleatório guardado no seu aparelho e, no servidor, apenas uma versão cifrada dele, ligada ao seu saldo de IA.</li>
        <li><strong>Conta (opcional):</strong> e-mail, senha (guardada cifrada pelo serviço de login), nome de exibição, avatar e data de aceite dos termos. Com o login do Google, recebemos nome e e-mail da sua conta Google.</li>
        <li><strong>Saldo e compras:</strong> movimentações do saldo de IA (grátis, uso, devoluções, compras e estornos), número do pedido e comprovante da Google Play. Não recebemos nem guardamos dados de cartão: o pagamento é feito pela Google Play.</li>
        <li><strong>Segurança:</strong> uma versão cifrada do endereço de rede para limitar abusos (criação excessiva de salas, tentativas de código e saldos grátis), registros de ações administrativas e denúncias.</li>
        <li><strong>Voz ao vivo:</strong> o áudio do microfone vai direto entre os aparelhos da sala e não é gravado pelo Stopia. Só é usado se você tocar para entrar na voz.</li>
        <li><strong>Neste aparelho:</strong> preferências como tema, som e jogadores silenciados ficam guardadas localmente.</li>
      </ul>
      <h2>Inteligência artificial</h2>
      <p>Respostas, argumentos e apelidos dos jogadores de uma rodada são enviados ao provedor de IA (Google Gemini) para julgar e comentar a partida. Não enviamos e-mail nem dados de pagamento.</p>
      <h2>Para que usamos</h2>
      <p>Para fazer o jogo funcionar, manter o saldo e as compras, prevenir fraudes e abusos, moderar denúncias e dar suporte. Não vendemos dados e não usamos anúncios.</p>
      <h2>Por quanto tempo guardamos</h2>
      <ul>
        <li>Dados das salas: enquanto a sala existir; salas podem ser apagadas a qualquer momento pela moderação.</li>
        <li>Registros contra abuso por endereço de rede: em geral até 24 horas.</li>
        <li>Movimentações de saldo e compras: mantidas como registro financeiro, mesmo após a exclusão da conta, sem ligação com seu e-mail.</li>
      </ul>
      <h2>Seus direitos e exclusão</h2>
      <p>Você pode corrigir nome e avatar em Meu Stopia e excluir sua conta lá mesmo. Para acessar, corrigir ou apagar outros dados (LGPD), escreva para {SUPPORT_EMAIL}.</p>
    </LegalPage>
  );
}
