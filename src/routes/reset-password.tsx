import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabaseClient } from "@/lib/account-client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Criar nova senha — Stopia" },
      { name: "description", content: "Defina uma nova senha para a sua conta do Stopia." },
      { property: "og:title", content: "Nova senha no Stopia" },
      { property: "og:description", content: "Defina uma nova senha para a sua conta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    void supabaseClient().then((supabase) => {
      const recovery = window.location.hash.includes("type=recovery");
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") setReady(true);
      });
      off = () => data.subscription.unsubscribe();
      void supabase.auth.getSession().then(({ data: s }) => { if (s.session && recovery) setReady(true); });
    });
    return () => off?.();
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) { toast.error("Use pelo menos 8 caracteres."); return; }
    setBusy(true);
    try {
      const supabase = await supabaseClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha alterada!");
      navigate({ to: "/perfil" });
    } catch {
      toast.error("Não foi possível trocar a senha. Peça um novo link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="game-screen mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center gap-5 px-5">
      <h1 className="font-display text-4xl text-primary">Nova senha</h1>
      {ready ? (
        <form onSubmit={submit} className="party-panel space-y-3">
          <label htmlFor="new-password" className="section-label block">Nova senha</label>
          <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
          <Button type="submit" className="h-12 w-full font-bold" disabled={busy}>{busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Salvar senha</Button>
        </form>
      ) : (
        <section className="party-panel space-y-3" role="status">
          <p>Abra esta página pelo link que enviamos para o seu e-mail.</p>
          <Button asChild variant="secondary" className="h-12 w-full"><Link to="/entrar">Pedir um novo link</Link></Button>
        </section>
      )}
    </main>
  );
}
