import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { toast } from "sonner";

import { CreditBadge } from "@/components/credits/CreditBadge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useMyCredits } from "@/hooks/use-credits";
import { creditCredentials, setGuestToken } from "@/lib/account-client";
import { cancelPackPurchase, getBillingInfo, startPackPurchase, verifyPackPurchase } from "@/lib/account.functions";
import { playBillingAvailable, playPrice, purchaseWithPlay } from "@/lib/play-billing";

export const Route = createFileRoute("/comprar")({
  head: () => ({
    meta: [
      { title: "Comprar solicitações de IA — Stopia" },
      { name: "description", content: "Libere mais solicitações de IA para as salas que você cria no Stopia. Pagamento único, sem assinatura e sem cobrança automática." },
      { property: "og:title", content: "Continue jogando Stopia com IA" },
      { property: "og:description", content: "Pacotes de solicitações de IA com pagamento único, sem assinatura." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BuyPage,
});

type Phase =
  | { kind: "idle" }
  | { kind: "processing"; text: string }
  | { kind: "confirmed"; text: string }
  | { kind: "pending"; text: string; transactionId: string; purchaseToken: string }
  | { kind: "canceled"; text: string }
  | { kind: "error"; text: string; transactionId?: string; purchaseToken?: string };

function BuyPage() {
  const credits = useMyCredits();
  const info = useServerFn(getBillingInfo);
  const start = useServerFn(startPackPurchase);
  const verify = useServerFn(verifyPackPurchase);
  const cancel = useServerFn(cancelPackPurchase);
  const [billing, setBilling] = useState<Awaited<ReturnType<typeof getBillingInfo>> | null>(null);
  const [inApp, setInApp] = useState<boolean | null>(null);
  const [storePrice, setStorePrice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });

  useEffect(() => {
    void info().then(async (b) => {
      setBilling(b);
      const available = await playBillingAvailable();
      setInApp(available);
      if (available) setStorePrice(await playPrice(b.productId));
    }).catch(() => setInApp(false));
  }, [info]);

  const price = storePrice ?? billing?.priceLabel ?? "R$ 5,00";
  const pack = billing?.packCredits ?? 20;
  const busy = phase.kind === "processing";
  const guest = credits.status !== "loading" && credits.summary?.kind !== "account" && !credits.signedIn;

  async function check(transactionId: string, purchaseToken: string) {
    setPhase({ kind: "processing", text: "Confirmando o pagamento com a Google Play…" });
    try {
      const res = await verify({ data: { ...(await creditCredentials()), transactionId, purchaseToken } });
      if (res.status === "confirmed") setPhase({ kind: "confirmed", text: res.message });
      else if (res.status === "pending") setPhase({ kind: "pending", text: res.message, transactionId, purchaseToken });
      else if (res.status === "canceled") setPhase({ kind: "canceled", text: res.message });
      else setPhase({ kind: "error", text: res.message, transactionId, purchaseToken });
    } catch {
      setPhase({ kind: "error", text: "Sem conexão para confirmar. Seu pagamento não se perde: toque em verificar de novo.", transactionId, purchaseToken });
    } finally {
      void credits.refresh();
    }
  }

  async function buy() {
    setConfirmOpen(false);
    if (!billing) return;
    setPhase({ kind: "processing", text: "Abrindo a Google Play…" });
    let transactionId: string | null = null;
    try {
      const started = await start({ data: await creditCredentials() });
      transactionId = started.transactionId;
      if (started.newGuestToken) setGuestToken(started.newGuestToken);
      const outcome = await purchaseWithPlay(started.productId);
      if (outcome.kind === "canceled") {
        await cancel({ data: { ...(await creditCredentials()), transactionId } }).catch(() => undefined);
        setPhase({ kind: "canceled", text: "Compra cancelada. Nada foi cobrado." });
        return;
      }
      if (outcome.kind === "failed") {
        await cancel({ data: { ...(await creditCredentials()), transactionId } }).catch(() => undefined);
        setPhase({ kind: "error", text: `${outcome.message} Nada foi cobrado.` });
        return;
      }
      await check(transactionId, outcome.purchaseToken);
    } catch (err) {
      setPhase({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível iniciar a compra. Nada foi cobrado." });
      toast.error("A compra não começou.");
    }
  }

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="top-actions-clear space-y-2 pt-2">
        <Button asChild variant="ghost" className="-ml-2 h-11 px-2"><Link to="/perfil"><ArrowLeft /> Voltar sem comprar</Link></Button>
        <h1 className="font-display text-4xl leading-none text-primary">Continue jogando Stopia</h1>
        <p className="text-sm text-muted-foreground">
          {credits.summary && credits.summary.balance === 0 ? "Seus créditos de IA acabaram." : "Mais IA nas salas que você cria."} Só o mestre da sala gasta créditos; quem entra na sala joga de graça.
        </p>
      </header>

      <CreditBadge status={credits.status} summary={credits.summary} freeCredits={billing?.freeCredits} packCredits={pack} priceLabel={price} onRetry={() => void credits.refresh()} hideBuy />

      <section className="party-panel space-y-4 text-center" aria-labelledby="pacote">
        <p className="section-label">Pacote</p>
        <h2 id="pacote" className="font-display text-3xl">{pack} créditos de IA — {price}</h2>
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>Pagamento único. Sem assinatura. Sem cobrança automática.</li>
          <li>1 crédito = 1 solicitação de IA numa sala sua: julgar uma rodada do Stop, criar um tema, comentar ou dar os prêmios finais. Créditos não são partidas.</li>
          <li>Pagamento pela Google Play, no app Stopia para Android.</li>
        </ul>
        {guest ? (
          <div className="space-y-2">
            <p className="text-sm">Para comprar e usar créditos de IA, entre na sua conta. Criando a conta você também ganha {billing?.freeCredits ?? 20} créditos grátis, uma única vez.</p>
            <Button asChild className="h-14 w-full text-lg font-bold"><Link to="/entrar" search={{ modo: "criar", voltar: "/comprar" }}>Criar conta grátis</Link></Button>
            <Button asChild variant="secondary" className="h-12 w-full"><Link to="/entrar" search={{ modo: "entrar", voltar: "/comprar" }}>Já tenho conta</Link></Button>
          </div>
        ) : inApp === null ? (
          <Button className="h-14 w-full text-lg font-bold" disabled><Loader2 className="animate-spin" /> Verificando a loja…</Button>
        ) : inApp ? (
          <Button className="h-14 w-full text-lg font-bold" disabled={busy || !billing?.storeReady} onClick={() => setConfirmOpen(true)}>
            {busy ? <Loader2 className="animate-spin" /> : null} Liberar {pack} créditos de IA
          </Button>
        ) : (
          <div className="space-y-2 rounded-xl border border-border p-3 text-left text-sm">
            <p className="flex items-center gap-2 font-semibold"><Smartphone className="size-4" aria-hidden="true" /> Compras só no app para Android</p>
            <p className="text-muted-foreground">Pelo navegador não é possível comprar. Instale o Stopia pela Google Play e compre por lá; entrando com a mesma conta, o saldo aparece aqui também.</p>
          </div>
        )}
        {!guest && inApp && billing && !billing.storeReady && <p className="text-xs text-muted-foreground">As compras ainda estão sendo ativadas. Tente mais tarde.</p>}
      </section>


      {phase.kind !== "idle" && (
        <section className="party-panel space-y-3" role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold">
            {phase.kind === "processing" && <Loader2 className="size-5 animate-spin text-primary" />}
            {phase.kind === "confirmed" && <CheckCircle2 className="size-5 text-success" />}
            {(phase.kind === "canceled" || phase.kind === "error") && <XCircle className="size-5 text-destructive" />}
            {phase.kind === "pending" && <RefreshCw className="size-5 text-primary" />}
            {phase.text}
          </p>
          {(phase.kind === "pending" || (phase.kind === "error" && phase.transactionId && phase.purchaseToken)) && (
            <Button variant="secondary" className="h-12 w-full" onClick={() => void check(phase.transactionId!, phase.purchaseToken!)}><RefreshCw /> Verificar de novo</Button>
          )}
          {phase.kind === "confirmed" && <Button asChild className="h-12 w-full"><Link to="/">Voltar a jogar</Link></Button>}
        </section>
      )}

      <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> O Stopia não vê nem guarda dados do seu cartão. As solicitações só entram no saldo depois que a Google Play confirma o pagamento ao nosso servidor. Dúvidas? <Link to="/suporte" className="underline">Suporte</Link>.</p>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar compra</AlertDialogTitle>
            <AlertDialogDescription>{pack} solicitações de IA por {price}, pagamento único pela Google Play. Sem assinatura e sem cobrança automática.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Agora não</AlertDialogCancel>
            <AlertDialogAction onClick={() => void buy()}>Continuar para a Google Play</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
