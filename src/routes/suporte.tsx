import { createFileRoute } from "@tanstack/react-router";

import { LegalPage, SUPPORT_EMAIL } from "@/components/LegalPage";

export const Route = createFileRoute("/suporte")({
  head: () => ({
    meta: [
      { title: "Suporte — Stopia" },
      { name: "description", content: "Fale com o suporte do Stopia sobre compras, saldo de IA, contas ou denúncias." },
      { property: "og:title", content: "Suporte do Stopia" },
      { property: "og:description", content: "Ajuda com compras, saldo de IA, contas e denúncias." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Support,
});

function Support() {
  return (
    <LegalPage title="Suporte">
      <p>Escreva para <a className="font-semibold text-primary underline" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Responder leva até alguns dias úteis.</p>
      <h2>Compras</h2>
      <ul>
        <li>Pagou e o saldo não mudou? Abra Comprar e toque em "Verificar de novo". Pagamentos pendentes entram sozinhos quando a Google Play confirmar.</li>
        <li>No e-mail, informe o número do pedido da Google Play (começa com GPA.) e o e-mail da conta, se tiver.</li>
        <li>Reembolsos são pedidos pela Google Play.</li>
      </ul>
      <h2>Denúncias</h2>
      <p>Use a opção de denúncia no chat da sala. Em casos graves, escreva também para o e-mail acima com o código da sala.</p>
    </LegalPage>
  );
}
