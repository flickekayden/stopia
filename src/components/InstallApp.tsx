import { useEffect, useState } from "react";
import { Download, Share, PlusSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallApp() {
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const update = () => setInstalled(standalone.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    update();
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallPrompt); };
    const complete = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    standalone.addEventListener("change", update);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
      standalone.removeEventListener("change", update);
    };
  }, []);
  async function install() {
    if (!prompt) { setHelpOpen(true); return; }
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPrompt(null);
  }
  if (installed) return null;
  return <>
    <Button variant="outline" className="w-full" onClick={() => void install()}><Download /> Instalar app</Button>
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Instalar STOP!</DialogTitle><DialogDescription>{ios ? "Abra no Safari para adicionar o STOP à Tela de Início." : "Abra o menu do navegador e escolha Instalar app ou Adicionar à tela inicial."}</DialogDescription></DialogHeader>
        {ios && <div className="space-y-3 text-sm"><p className="flex items-center gap-3"><Share className="size-5 shrink-0" /> Toque em Compartilhar.</p><p className="flex items-center gap-3"><PlusSquare className="size-5 shrink-0" /> Escolha Adicionar à Tela de Início.</p></div>}
        <DialogFooter><Button onClick={() => setHelpOpen(false)}>Entendi</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}