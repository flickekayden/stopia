import { useServerFn } from "@tanstack/react-start";
import { Loader2, LockOpen } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { setDevKey, setDevToken, useDevSettings } from "@/lib/dev-settings";
import { unlockDeveloper } from "@/lib/room-admin.functions";

/**
 * Hidden developer unlock: five quick taps on the wrapped title open a password prompt. The password is
 * checked on the server, which returns the signed developer token this device keeps.
 */
export function DevUnlock({ children }: { children: ReactNode }) {
  const unlock = useServerFn(unlockDeveloper);
  const { isDev } = useDevSettings();
  const taps = useRef<number[]>([]);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  function tap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2_500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setOpen(true);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!password) return;
    setBusy(true);
    try {
      const res = await unlock({ data: { password } });
      if (!res.ok) { toast.error("Senha incorreta"); return; }
      setDevToken(res.token);
      setDevKey(true);
      setOpen(false);
      setPassword("");
      toast.success("Modo desenvolvedor ligado neste aparelho");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span onClick={tap} className="select-none">{children}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%_-_2rem)] max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle>Modo desenvolvedor</DialogTitle>
            <DialogDescription>{isDev ? "Este aparelho já está liberado. Quer desligar?" : "Digite a senha de desenvolvedor."}</DialogDescription>
          </DialogHeader>
          {isDev ? (
            <Button variant="outline" className="h-12" onClick={() => { setDevKey(false); setOpen(false); toast.success("Modo desenvolvedor desligado"); }}>Desligar neste aparelho</Button>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <Input type="password" autoComplete="current-password" aria-label="Senha de desenvolvedor" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12" />
              <Button type="submit" className="h-12 w-full font-bold" disabled={busy || !password}>{busy ? <Loader2 className="animate-spin" /> : <LockOpen />} Entrar</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
