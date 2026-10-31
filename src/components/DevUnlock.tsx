import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LockOpen } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getAccessToken } from "@/lib/account-client";
import { setDevKey, setDevToken, useDevSettings } from "@/lib/dev-settings";
import { unlockDeveloper } from "@/lib/room-admin.functions";

/**
 * Hidden developer unlock: five quick taps on the wrapped title. There is no password: the server
 * checks that the signed-in account has the administrator role and returns a short-lived token.
 */
export function DevUnlock({ children }: { children: ReactNode }) {
  const unlock = useServerFn(unlockDeveloper);
  const { isDev } = useDevSettings();
  const taps = useRef<number[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  function tap() {
    const now = Date.now();
    taps.current = [...taps.current.filter((t) => now - t < 2_500), now];
    if (taps.current.length >= 5) {
      taps.current = [];
      setSignedOut(false);
      setOpen(true);
    }
  }

  async function activate() {
    setBusy(true);
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) { setSignedOut(true); return; }
      const res = await unlock({ data: { accessToken } });
      if (!res.ok) {
        if (res.reason === "signed_out") setSignedOut(true);
        else toast.error("Esta conta não é administradora.");
        return;
      }
      setDevToken(res.token);
      setDevKey(true);
      setOpen(false);
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
            <DialogDescription>
              {isDev ? "Este aparelho já está liberado. Quer desligar?" : signedOut ? "Entre com a conta de administrador para continuar." : "Disponível só para contas de administrador."}
            </DialogDescription>
          </DialogHeader>
          {isDev ? (
            <Button variant="outline" className="h-12" onClick={() => { setDevKey(false); setDevToken(""); setOpen(false); toast.success("Modo desenvolvedor desligado"); }}>Desligar neste aparelho</Button>
          ) : signedOut ? (
            <Button asChild className="h-12 w-full font-bold"><Link to="/entrar" onClick={() => setOpen(false)}>Entrar</Link></Button>
          ) : (
            <Button className="h-12 w-full font-bold" disabled={busy} onClick={() => void activate()}>{busy ? <Loader2 className="animate-spin" /> : <LockOpen />} Ativar com minha conta</Button>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
