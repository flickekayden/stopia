import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, LogIn, Mail, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { currentUser, markTermsAccepted, supabaseClient } from "@/lib/account-client";

export const Route = createFileRoute("/entrar")({
  head: () => ({
    meta: [
      { title: "Entrar ou criar conta — Stopia" },
      { name: "description", content: "Entre ou crie uma conta no Stopia para guardar seu saldo de IA e suas compras. Também dá para jogar como convidado." },
      { property: "og:title", content: "Entrar no Stopia" },
      { property: "og:description", content: "Conta opcional: guarde seu saldo de IA e suas compras, ou continue como convidado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

type Mode = "entrar" | "criar" | "esqueci";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    void currentUser().then((user) => { if (user) navigate({ to: "/perfil", replace: true }); }).catch(() => undefined);
  }, [navigate]);

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
        navigate({ to: "/perfil" });
      } else if (mode === "criar") {
        if (!terms) throw new Error("Para criar a conta, aceite os Termos de uso e a Política de privacidade.");
        if (password.length < 8) throw new Error("Use uma senha com pelo menos 8 caracteres.");
        markTermsAccepted();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin + "/perfil", data: { display_name: name.trim().slice(0, 20) } },
        });
        if (error) throw new Error(error.message.toLowerCase().includes("registered") ? "Já existe uma conta com esse e-mail. Tente entrar." : "Não foi possível criar a conta. Confira o e-mail e tente de novo.");
        if (data.session) navigate({ to: "/perfil" });
        else setSent("Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta.");
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
      if (!result.redirected) navigate({ to: "/perfil" });
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
        <p className="text-sm text-muted-foreground">A conta é opcional. Ela guarda seu saldo de IA e suas compras, e você pode usá-la em outro aparelho.</p>
      </header>

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
        <p className="text-xs text-muted-foreground">Como convidado, seu saldo fica só neste aparelho. Se você limpar os dados do app ou trocar de celular, ele não pode ser recuperado. Ao criar uma conta depois, o saldo comprado vem junto.</p>
      </section>
    </main>
  );
}
