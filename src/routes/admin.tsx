import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ensureDevAccess, type DevAccessResult } from "@/lib/dev-access";

const BusinessAdmin = lazy(() => import("@/components/party/BusinessAdmin").then((m) => ({ default: m.BusinessAdmin })));

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Painel administrativo — Stopia" },
      { name: "description", content: "Área restrita da conta de administrador do Stopia." },
      { property: "og:title", content: "Painel administrativo — Stopia" },
      { property: "og:description", content: "Área restrita da conta de administrador." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

const MESSAGES: Record<Exclude<DevAccessResult, "ok">, string> = {
  signed_out: "Entre com a conta de administrador para abrir o painel.",
  not_admin: "Esta conta não é administradora.",
  offline: "Sem conexão. Tente de novo em instantes.",
};

function AdminPage() {
  const [access, setAccess] = useState<DevAccessResult | "checking">("checking");

  useEffect(() => {
    void ensureDevAccess({ matchAccount: true }).then(setAccess);
  }, []);

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="top-actions-clear space-y-2 pt-2">
        <Button asChild variant="ghost" className="-ml-2 h-11 px-2"><Link to="/perfil"><ArrowLeft /> Meu Stopia</Link></Button>
        <h1 className="font-display text-4xl leading-none text-primary">Painel administrativo</h1>
      </header>
      {access === "checking" && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="animate-spin" /> Verificando acesso…</p>}
      {access !== "checking" && access !== "ok" && (
        <section className="party-panel space-y-3">
          <p>{MESSAGES[access]}</p>
          {access === "signed_out" && <Button asChild><Link to="/entrar">Entrar</Link></Button>}
        </section>
      )}
      {access === "ok" && (
        <Suspense fallback={<Loader2 className="animate-spin" />}>
          <BusinessAdmin />
        </Suspense>
      )}
    </main>
  );
}
