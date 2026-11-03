import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Gift, Loader2, LogIn, Mail, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUser, markTermsAccepted, supabaseClient } from "@/lib/account-client";
import { safeReturnPath } from "@/lib/signup-bonus";

type Mode = "entrar" | "criar" | "esqueci";
type AuthSearch = { modo?: "entrar" | "criar" | undefined; voltar?: string | undefined };

const RETURN_KEY = "stopia-auth-return";

export const Route = createFileRoute("/entrar")({
  validateSearch: (search: Record<string, unknown>): AuthSearch => {
    const modo = search["modo"];
    const voltar = search["voltar"];
    return {
      modo: modo === "criar" ? "criar" : modo === "entrar" ? "entrar" : undefined,
      voltar: typeof voltar === "string" ? safeReturnPath(voltar, "") || undefined : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — Stopia" },
      { name: "description", content: "Crie sua conta grátis no Stopia e ganhe 20 créditos de IA, uma única vez por conta. Também dá para jogar sem conta nos modos sem IA." },
      { property: "og:title", content: "Entrar no Stopia — 20 créditos de IA grátis" },
      { property: "og:description", content: "Crie sua conta grátis e receba 20 créditos de IA para usar nas salas que você cria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.modo ?? "entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Where to go after signing in: the page that asked (e.g. the room), kept across the Google redirect.
  useEffect(() => {
    if (search.voltar) window.sessionStorage.setItem(RETURN_KEY, search.voltar);
  }, [search.voltar]);
  const returnPath = () => safeReturnPath(search.voltar ?? (typeof window === "undefined" ? null : window.sessionStorage.getItem(RETURN_KEY)));
  const goBack = () => {
    const to = returnPath();
    window.sessionStorage.removeItem(RETURN_KEY);
    navigate({ to, replace: true });
  };

  useEffect(() => {
    void currentUser().then((user) => { if (user) goBack(); }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const supabase = await supabaseClient();
    setBusy("email");
    try {
      if (mode === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(error.message.includes("confirm") ? "Confirme seu e-mail antes de entrar (veja sua caixa de entrada)." : "E-mail ou senha incorretos.");
        toast.success("Bem-vindo de volta!");
        goBack();
      } else if (mode === "criar") {
        if (!terms) throw new Error("Para criar a conta, aceite os Termos de uso e a Política de privacidade.");
        if (password.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
        markTermsAccepted();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin + returnPath(), data: { display_name: name.trim().slice(0, 20) } },
        });
        if (error) throw new Error(error.message.toLowerCase().includes("registered") ? "Já existe uma conta com esse e-mail. Tente entrar." : "Não foi possível criar a conta. Confira o e-mail e tente de novo.");
        if (data.session) goBack();
        else setSent("Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta e receber seus 20 créditos de IA grátis.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw new Error("Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
        setSent("Se existir uma conta com esse e-mail, você vai receber um link para criar uma nova senha.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function google() {
    if (mode === "criar" && !terms) {
      toast.error("Para criar a conta, aceite os Termos de uso e a Política de privacidade.");
      return;
    }
    setBusy("google");
    markTermsAccepted();
    try {
      const { lovable } = await import("@/integrations/lovable");
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/entrar" });
      if (result.error) throw result.error;
      if (!result.redirected) goBack();
    } catch {
      toast.error("Não foi possível entrar com o Google. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  const title = mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Recuperar senha";

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col gap-5 px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1.25rem+env(safe-area-inset-top))]">
      <header className="top-actions-clear space-y-2 pt-2">
        <Button asChild variant="ghost" className="-ml-2 h-11 px-2"><Link to="/"><ArrowLeft /> Início</Link></Button>
        <h1 className="font-display text-4xl text-primary">{title}</h1>
        <p className="text-sm text-muted-foreground">A conta guarda seus créditos de IA e suas compras, e você pode usá-la em outro aparelho. Os modos sem IA funcionam sem conta.</p>
      </header>

      {mode !== "esqueci" && (
        <section className="party-panel flex items-start gap-3" aria-labelledby="auth-bonus">
          <span className="party-icon size-11 shrink-0" aria-hidden="true"><Gift className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="auth-bonus" className="font-display text-xl text-primary"><span aria-hidden="true">🎁 </span>20 créditos de IA grátis</h2>
            <p className="text-sm text-muted-foreground">Uma única concessão por conta. Sem pagamento para criar sua conta.</p>
            <p className="mt-1 text-xs text-muted-foreground">Cada crédito é uma solicitação de IA numa sala sua, não uma partida.</p>
          </div>
        </section>
      )}

      {mode !== "esqueci" && (
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Entrar ou criar conta">
          <Button role="tab" aria-selected={mode === "entrar"} variant={mode === "entrar" ? "default" : "secondary"} className="h-12" onClick={() => { setMode("entrar"); setSent(null); }}><LogIn /> Entrar</Button>
          <Button role="tab" aria-selected={mode === "criar"} variant={mode === "criar" ? "default" : "secondary"} className="h-12" onClick={() => { setMode("criar"); setSent(null); }}><UserPlus /> Criar conta</Button>
        </div>
      )}

      {sent ? (
        <section className="party-panel space-y-3" role="status">
          <Mail className="size-8 text-primary" aria-hidden="true" />
          <p className="font-semibold">{sent}</p>
          <Button variant="secondary" className="h-12 w-full" onClick={() => { setSent(null); setMode("entrar"); }}>Voltar para entrar</Button>
        </section>
      ) : (
        <form onSubmit={submit} className="party-panel space-y-3">
          {mode === "criar" && (
            <div className="space-y-1">
              <label htmlFor="auth-name" className="section-label block">Nome de exibição</label>
              <Input id="auth-name" value={name} maxLength={20} autoComplete="nickname" onChange={(e) => setName(e.target.value)} className="h-12" placeholder="Como a galera te chama" />
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="auth-email" className="section-label block">E-mail</label>
            <Input id="auth-email" type="email" required value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} className="h-12" />
          </div>
          {mode !== "esqueci" && (
            <div className="space-y-1">
              <label htmlFor="auth-password" className="section-label block">Senha</label>
              <Input id="auth-password" type="password" required minLength={mode === "criar" ? 8 : 1} value={password} autoComplete={mode === "criar" ? "new-password" : "current-password"} onChange={(e) => setPassword(e.target.value)} className="h-12" />
            </div>
          )}
          {mode === "criar" && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" className="mt-1 size-5 accent-[var(--primary)]" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
              <span>Li e aceito os <Link to="/termos" className="font-semibold text-primary underline">Termos de uso</Link>, as regras de convivência e a <Link to="/privacidade" className="font-semibold text-primary underline">Política de privacidade</Link>.</span>
            </label>
          )}
          <Button type="submit" className="h-12 w-full font-bold" disabled={busy !== null} aria-busy={busy === "email"}>
            {busy === "email" && <Loader2 className="animate-spin" />}
            {mode === "entrar" ? "Entrar" : mode === "criar" ? "Criar conta" : "Enviar link"}
          </Button>
          {mode === "entrar" && <Button type="button" variant="link" className="h-auto w-full p-0" onClick={() => setMode("esqueci")}>Esqueci minha senha</Button>}
          {mode === "esqueci" && <Button type="button" variant="link" className="h-auto w-full p-0" onClick={() => setMode("entrar")}>Voltar para entrar</Button>}
        </form>
      )}

      {mode !== "esqueci" && !sent && (
        <Button variant="secondary" className="h-12 w-full font-semibold" disabled={busy !== null} onClick={() => void google()}>
          {busy === "google" ? <Loader2 className="animate-spin" /> : <span aria-hidden="true" className="font-display text-lg">G</span>} Continuar com Google
        </Button>
      )}

      <section className="space-y-2 text-center">
        <Button asChild variant="ghost" className="h-12 w-full"><Link to="/"><UserRound /> Continuar como convidado</Link></Button>
        <p className="text-xs text-muted-foreground">Sem conta você joga normalmente os modos sem IA. Os recursos de IA e os créditos grátis são só para contas.</p>
      </section>
    </main>
  );
}
