import { Headphones, Loader2, Mic, MicOff, PhoneOff, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import type { PartyPlayer } from "@/hooks/use-party-room";
import { useVoiceRoom } from "@/hooks/use-voice-room";
import { vibrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * Live voice for the group room: a fixed launcher next to the chat. While players must not talk
 * (`lockReason`), every microphone is silenced and the launcher steps aside to free the round header.
 */
export function VoiceControl({ roomId, playerId, players, lockReason }: { roomId: string; playerId: string; players: PartyPlayer[]; lockReason: string | null }) {
  const voice = useVoiceRoom(roomId, playerId, lockReason !== null);
  const [open, setOpen] = useState(false);
  const locked = lockReason !== null;
  const iAmSpeaking = voice.speaking.includes(playerId);
  const others = Object.entries(voice.participants).filter(([id, p]) => p.inVoice && id !== playerId).length;

  // Reserve the voice slot in the fixed top-right controls while the launcher is visible.
  useEffect(() => {
    if (locked) return;
    document.documentElement.dataset["roomVoice"] = "on";
    return () => { delete document.documentElement.dataset["roomVoice"]; };
  }, [locked]);

  // Tell people in the conversation when the game silences (and releases) the microphones.
  const wasLocked = useRef(locked);
  useEffect(() => {
    if (wasLocked.current === locked) return;
    wasLocked.current = locked;
    if (!voice.joined) return;
    if (locked && lockReason) toast(`🤫 ${lockReason}`, { duration: 3_500 });
    else toast("🎙️ Voz liberada: pode falar com a galera!", { duration: 2_500 });
    if (locked) setOpen(false);
  }, [locked, lockReason, voice.joined]);

  async function join() {
    vibrate(10);
    const result = await voice.join();
    if (result.listenOnly) toast.error("Microfone bloqueado neste aparelho. Você entrou só para ouvir; o chat de texto continua valendo.");
  }

  const nick = (id: string) => players.find((p) => p.id === id)?.nickname ?? "Alguém";
  const inVoice = Object.entries(voice.participants).filter(([, p]) => p.inVoice);

  if (locked) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={voice.joined ? `Voz da sala: ${voice.effectiveMuted ? "microfone mudo" : "microfone ligado"}` : `Entrar na voz da sala${others ? ` (${others} falando)` : ""}`}
        title="Voz da sala"
        onClick={() => setOpen(true)}
        data-speaking={iAmSpeaking ? "true" : "false"}
        className={cn("top-action-voice voice-launcher fixed z-40 size-12 rounded-lg bg-background/95", voice.joined && !voice.effectiveMuted ? "text-primary" : "text-muted-foreground")}
      >
        {!voice.joined ? <Headphones className="size-6" /> : voice.effectiveMuted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
        {!voice.joined && others > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-success px-1 text-xs font-bold text-background" aria-hidden="true">{others}</span>
        )}
      </Button>
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent className="mx-auto w-full max-w-md">
          <DrawerHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border py-3 text-left">
            <div className="min-w-0">
              <DrawerTitle>Voz da galera</DrawerTitle>
              <DrawerDescription className="text-xs">Conversa ao vivo. Nas horas de segredo (respostas do Stop, pistas do Infiltrado) os microfones desligam sozinhos.</DrawerDescription>
            </div>
            <DrawerClose asChild><Button variant="ghost" size="icon" aria-label="Fechar voz"><X /></Button></DrawerClose>
          </DrawerHeader>
          <div className="space-y-4 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {!voice.joined ? (
              <Button className="h-14 w-full text-base font-bold" disabled={voice.joining} aria-busy={voice.joining} onClick={() => void join()}>
                {voice.joining ? <Loader2 className="animate-spin" /> : <Mic />} Entrar na conversa
              </Button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <Button variant={voice.effectiveMuted ? "secondary" : "selected"} className="h-16 flex-col gap-1 text-xs font-bold" disabled={voice.listenOnly} aria-pressed={!voice.effectiveMuted} onClick={() => { vibrate(10); voice.toggleMute(); }}>
                  {voice.effectiveMuted ? <MicOff /> : <Mic />} {voice.listenOnly ? "Sem microfone" : voice.effectiveMuted ? "Mudo" : "Falando"}
                </Button>
                <Button variant="secondary" className="h-16 flex-col gap-1 text-xs font-bold" aria-pressed={voice.deafened} onClick={() => voice.toggleDeafen()}>
                  {voice.deafened ? <VolumeX /> : <Volume2 />} {voice.deafened ? "Som mudo" : "Ouvindo"}
                </Button>
                <Button variant="secondary" className="h-16 flex-col gap-1 text-xs font-bold text-destructive" onClick={() => { voice.leave(); setOpen(false); }}>
                  <PhoneOff /> Sair da voz
                </Button>
              </div>
            )}
            <section aria-label="Quem está na conversa">
              <p className="section-label mb-2">Na conversa · {inVoice.length}</p>
              {inVoice.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ninguém entrou ainda. Seja o primeiro!</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {inVoice.map(([id, p]) => (
                    <li key={id} data-speaking={voice.speaking.includes(id) ? "true" : "false"} className="voice-chip game-chip flex items-center gap-1.5">
                      {p.muted ? <MicOff className="size-3.5 text-muted-foreground" aria-label="mudo" /> : <Mic className="size-3.5 text-primary" aria-label="microfone ligado" />}
                      {nick(id)}{id === playerId ? " (você)" : ""}
                      {voice.joined && id !== playerId && !voice.connected.includes(id) && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="conectando" />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className="text-xs text-muted-foreground">O áudio vai direto de celular para celular e não é gravado. Use fone para evitar eco.</p>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
