import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Gift, Loader2, LogIn, LogOut, Save, ShieldCheck, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { CreditBadge } from "@/components/credits/CreditBadge";
import { ThemePicker } from "@/components/ThemePicker";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { creditCredentials, emitAccountChange, getAccessToken, onAccountChange, onGuestClaimed, supabaseClient, wireAuthEvents } from "@/lib/account-client";
import { deleteMyAccount, getBillingInfo, getMyAccount, updateMyProfile } from "@/lib/account.functions";
import { LEDGER_LABELS, PAYMENT_LABELS, requestsLabel, type LedgerKind, type PaymentStatus } from "@/lib/billing";
import { bonusMessage } from "@/lib/signup-bonus";

export const Route = createFileRoute("/perfil")({
  head: () => ({
    meta: [
      { title: "Meu Stopia — perfil, saldo de IA e compras" },
      { name: "description", content: "Veja seu saldo de solicitações de IA, o histórico de uso e de compras e as opções da sua conta no Stopia." },
      { property: "og:title", content: "Meu Stopia" },
      { property: "og:description", content: "Saldo de IA, histórico de compras e opções da conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ProfilePage,
});

const AVATARS = ["🎲", "🦊", "🐸", "🦄", "🐙", "👑", "🔥", "🤡", "🧠", "🎯"] as const;

type Account = Awaited<ReturnType<typeof getMyAccount>>;

function when(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ProfilePage() {
  const navigate = useNavigate();
  const fetchAccount = useServerFn(getMyAccount);
  const fetchBilling = useServerFn(getBillingInfo);
  const saveProfile = useServerFn(updateMyProfile);
  const removeAccount = useServerFn(deleteMyAccount);
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "refreshing" | "error">("loading");
  const [billing, setBilling] = useState<{ freeCredits: number; packCredits: number; priceLabel: string } | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string>("🎲");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    setStatus((s) => (s === "loading" ? s : "refreshing"));
    try {
      const res = await fetchAccount({ data: await creditCredentials() });
      setAccount(res);
      setName(res.profile?.display_name ?? "");
      setAvatar(res.profile?.avatar ?? "🎲");
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, [fetchAccount]);

  useEffect(() => {
    void wireAuthEvents();
    void load();
    void fetchBilling().then(setBilling).catch(() => undefined);
    const off = onAccountChange(() => void load());
    const offClaim = onGuestClaimed((r) => {
      if (r.moved > 0) toast.success(`${requestsLabel(r.moved)} do convidado foram para a sua conta.`);
    });
    return () => { off(); offClaim(); };
  }, [load, fetchBilling]);

  async function save() {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    setSaving(true);
    try {
      await saveProfile({ data: { accessToken, displayName: name.trim(), avatar } });
      toast.success("Perfil salvo");
    } catch {
      toast.error("Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    const supabase = await supabaseClient();
    await supabase.auth.signOut();
    emitAccountChange();
    navigate({ to: "/", replace: true });
  }

  async function doDelete() {
    const accessToken = await getAccessToken();
    if (!accessToken) return;
    try {
      await removeAccount({ data: { accessToken, confirm: "EXCLUIR" } });
      const supabase = await supabaseClient();
      await supabase.auth.signOut();
      toast.success("Conta excluída.");
      navigate({ to: "/", replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível excluir a conta.");
    }
  }

  const summary = account?.summary ?? null;
  const signedIn = account?.signedIn ?? false;

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="top-actions-clear space-y-2 pt-2">
        <Button asChild variant="ghost" className="-ml-2 h-11 px-2"><Link to="/"><ArrowLeft /> Início</Link></Button>
        <div className="flex items-center gap-3">
          <span className="party-icon size-14 text-3xl" aria-hidden="true">{avatar}</span>
          <div className="min-w-0">
            <h1 className="font-display text-4xl leading-none text-primary">Meu Stopia</h1>
            <p className="text-sm text-muted-foreground">{status === "loading" ? "Carregando…" : signedIn ? `Conta${account?.isAdmin ? " · administrador" : ""}` : "Convidado neste aparelho"}</p>
          </div>
        </div>
      </header>

      <CreditBadge status={status} summary={summary} freeCredits={billing?.freeCredits} packCredits={billing?.packCredits} priceLabel={billing?.priceLabel} onRetry={() => void load()} />

      {summary && (
        <section className="party-panel grid grid-cols-2 gap-3" aria-label="Resumo do saldo">
          <Stat label="Saldo de IA" value={`${summary.balance} disponíveis`} />
          <Stat label="Grátis (promoção)" value={`${summary.freeGranted}`} />
          <Stat label="Comprados" value={`${summary.purchasedTotal}`} />
          <Stat label="Usados" value={`${summary.consumedTotal}`} />
          <Stat label="Pacotes comprados" value={`${summary.packsBought}`} />
          <p className="col-span-2 text-xs text-muted-foreground">1 crédito = 1 solicitação de IA numa sala que você criou. Créditos não são partidas.</p>
          {summary.kind === "account" && bonusMessage(summary.bonus, billing?.freeCredits) && (
            <p className="col-span-2 text-sm font-semibold text-primary" role="status">{bonusMessage(summary.bonus, billing?.freeCredits)}</p>
          )}
        </section>
      )}

      {signedIn ? (
        <Button asChild className="h-12 w-full font-bold"><Link to="/comprar"><ShoppingBag /> Comprar mais créditos de IA</Link></Button>
      ) : null}

      {signedIn ? (
        <section className="party-panel space-y-3" aria-labelledby="perfil-dados">
          <h2 id="perfil-dados" className="section-label">Seus dados</h2>
          <label htmlFor="perfil-nome" className="section-label block">Nome de exibição</label>
          <Input id="perfil-nome" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} className="h-12" />
          <p className="section-label">Avatar</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Avatar">
            {AVATARS.map((a) => (
              <button key={a} type="button" role="radio" aria-checked={avatar === a} onClick={() => setAvatar(a)} className={`size-11 rounded-xl border text-2xl ${avatar === a ? "border-primary bg-secondary" : "border-border"}`}>{a}</button>
            ))}
          </div>
          <Button className="h-12 w-full" disabled={saving} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar</Button>
        </section>
      ) : (
        <section className="party-panel space-y-3">
          <p className="text-sm">Você está sem conta. Os modos sem IA funcionam normalmente; para usar a IA, crie sua conta grátis e receba {billing?.freeCredits ?? 20} créditos de IA, uma única vez por conta.</p>
          {summary?.kind === "guest" && <p className="text-sm text-muted-foreground">O saldo de convidado deste aparelho continua guardado e vai para a sua conta quando você entrar neste aparelho.</p>}
          <Button asChild className="h-12 w-full font-bold"><Link to="/entrar" search={{ modo: "criar" }}><Gift /> Criar conta grátis</Link></Button>
          <Button asChild variant="secondary" className="h-12 w-full"><Link to="/entrar" search={{ modo: "entrar" }}><LogIn /> Já tenho conta</Link></Button>
        </section>
      )}

      <section className="space-y-2" aria-labelledby="perfil-pagamentos">
        <h2 id="perfil-pagamentos" className="section-label">Histórico de pagamentos</h2>
        {(account?.history.payments.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum pagamento por aqui.</p>
        ) : (
          <ul className="space-y-2">
            {account!.history.payments.map((p) => (
              <li key={p.id} className="party-panel flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold">{PAYMENT_LABELS[p.status as PaymentStatus] ?? p.status}{p.test_purchase ? " (teste)" : ""}</p>
                  <p className="text-xs text-muted-foreground">{when(p.created_at)} · {requestsLabel(p.credits)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{p.price_label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="perfil-uso">
        <h2 id="perfil-uso" className="section-label">Movimentações recentes</h2>
        {(account?.history.ledger.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há movimentações.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {account!.history.ledger.filter((m) => m.delta !== 0).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm">{LEDGER_LABELS[m.kind as LedgerKind] ?? m.kind}{m.note && m.kind === "ai_use" ? ` · ${m.note}` : ""}</p>
                  <p className="text-xs text-muted-foreground">{when(m.created_at)}</p>
                </div>
                <span className={`shrink-0 text-sm font-semibold tabular-nums ${m.delta > 0 ? "text-success" : "text-muted-foreground"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ThemePicker />

      <section className="space-y-2">
        <h2 className="section-label">Conta e informações</h2>
        <div className="grid gap-2">
          <Button asChild variant="secondary" className="h-12"><Link to="/termos">Termos e regras de convivência</Link></Button>
          <Button asChild variant="secondary" className="h-12"><Link to="/privacidade"><ShieldCheck /> Política de privacidade</Link></Button>
          <Button asChild variant="secondary" className="h-12"><Link to="/suporte">Suporte</Link></Button>
          {signedIn && <Button variant="secondary" className="h-12" onClick={() => void signOut()}><LogOut /> Sair da conta</Button>}
          {signedIn && <Button variant="ghost" className="h-12 text-destructive" onClick={() => setConfirmDelete(true)}><Trash2 /> Excluir conta</Button>}
        </div>
      </section>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta?</AlertDialogTitle>
            <AlertDialogDescription>Seu perfil e o acesso à conta são apagados e o saldo restante é perdido. O registro das compras fica guardado sem seus dados pessoais, como exige a lei. Uma nova conta com o mesmo e-mail não recebe os créditos grátis de novo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => void doDelete()}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="section-label">{label}</p>
      <p className="font-display text-xl tabular-nums">{value}</p>
    </div>
  );
}
