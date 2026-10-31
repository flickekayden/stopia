import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, SUPPORT_EMAIL } from "@/components/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso e regras de convivência — Stopia" },
      { name: "description", content: "Regras para jogar o Stopia: convivência nas salas, conteúdo enviado pelos jogadores, solicitações de IA e compras." },
      { property: "og:title", content: "Termos de uso do Stopia" },
      { property: "og:description", content: "Regras de convivência, conteúdo dos jogadores e compras de solicitações de IA." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
  return (
    <LegalPage title="Termos de uso">
      <p>Ao criar ou entrar numa sala do Stopia você concorda com estes termos. Se não concordar, não use o app.</p>
      <h2>O que é o Stopia</h2>
      <p>Uma central de jogos para jogar com amigos pelo celular: Stop, Tribunal dos Amigos, Quem Escreveu Essa Desgraça?, Infiltrado, Debate Impossível e Roleta do Caos. Os textos da IA são humor fictício e podem errar.</p>
      <h2>Regras de convivência</h2>
      <ul>
        <li>Jogue com quem você conhece e trate todo mundo com respeito. Zoeira entre amigos, sim; ataque, não.</li>
        <li>É proibido enviar: discurso de ódio, assédio, ameaças, conteúdo sexual, dados pessoais de outras pessoas, golpes, spam ou incentivo a atividades ilegais ou perigosas.</li>
        <li>Use apelidos que não se passem por outra pessoa.</li>
        <li>Você é responsável pelo que escreve no chat e nas respostas.</li>
      </ul>
      <h2>Denúncias e bloqueio</h2>
      <p>No chat da sala, toque numa mensagem para denunciá-la ou para ocultar as mensagens daquele jogador no seu aparelho. As denúncias vão para a moderação, que pode apagar salas e conteúdos e bloquear o acesso de quem descumprir as regras.</p>
      <h2>Solicitações de IA e compras</h2>
      <ul>
        <li>Uma solicitação de IA é um pedido feito à inteligência artificial numa sala criada por você (por exemplo, julgar uma rodada do Stop ou criar o tema de um debate). Só o mestre que criou a sala gasta solicitações.</li>
        <li>Cada aparelho ou conta recebe uma quantidade inicial grátis. Sem saldo, os jogos continuam com o conteúdo próprio, sem IA; o Stop precisa da IA para julgar.</li>
        <li>Pacotes extras são vendidos pela Google Play no app Android, com pagamento único. Não há assinatura nem cobrança automática. Preço e quantidade aparecem antes da compra.</li>
        <li>Solicitações só entram no saldo depois que a loja confirma o pagamento. Se a IA falhar numa solicitação, ela volta para o seu saldo.</li>
        <li>Reembolsos seguem as regras da Google Play. Uma compra estornada remove do saldo as solicitações ainda não usadas daquele pacote.</li>
        <li>Saldo de convidado fica só no aparelho e pode ser perdido se você limpar os dados do app. Com uma conta, o saldo fica guardado.</li>
      </ul>
      <h2>Contas</h2>
      <p>A conta é opcional. Você pode excluí-la a qualquer momento em Meu Stopia. Podemos encerrar contas usadas para fraude ou abuso.</p>
      <h2>Contato</h2>
      <p>Dúvidas ou problemas: {SUPPORT_EMAIL}.</p>
    </LegalPage>
  );
}
