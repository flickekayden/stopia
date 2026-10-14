import { Loader2, Mic, Volume2, VolumeX, AudioLines, Play } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { useVoiceWalkieTalkie } from "@/hooks/use-voice-walkie-talkie";

export function VoiceReactions(props: { roomId: string; roundId: string; playerId: string; sessionId: string }) {
  const voice = useVoiceWalkieTalkie(props);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const microphone = useRef<HTMLButtonElement | null>(null);
  const seconds = `0:0${Math.floor(voice.elapsed / 1000)}`;
  return (
    <>
      {voice.speaker && createPortal(
        <div role="status" className="pointer-events-none fixed inset-x-4 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-border bg-popover px-4 py-3 text-popover-foreground shadow-sm">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{voice.speaker.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 break-words text-sm"><span className="truncate">@{voice.speaker}</span> reagindo...</span>
          <AudioLines aria-hidden className="size-5 shrink-0 animate-pulse text-primary motion-reduce:animate-none" />
        </div>, document.body
      )}
      <div className="mb-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={voice.toggleMute} aria-pressed={voice.muted} aria-label={voice.muted ? "Ativar reações de voz" : "Silenciar reações"} title={voice.muted ? "Áudios silenciados" : "Áudios ativados"}>
          {voice.muted ? <VolumeX className="size-5" /> : <Volume2 className="size-5" />}
        </Button>
        <div className="min-w-0 flex-1 text-center" aria-live="polite">
          {voice.recording ? <><p className="text-sm font-bold tabular-nums text-destructive">{seconds} / 0:07</p><p className="text-xs text-muted-foreground">Solte para enviar, arraste para cancelar</p></> : voice.sending ? <p className="text-xs text-muted-foreground">Enviando reação...</p> : voice.requesting ? <p className="text-xs text-muted-foreground">Aguardando microfone...</p> : <p className="text-sm text-muted-foreground">Reações de voz</p>}
          {voice.recording && <progress aria-label="Tempo de gravação" className="voice-progress mt-1 h-1 w-full" value={voice.elapsed} max={7000} />}
          {voice.blocked && !voice.muted && <Button variant="ghost" size="sm" onClick={voice.unlockPlayback} className="h-8"><Play className="size-4" />Ouvir reações</Button>}
        </div>
        <Button ref={microphone} variant={voice.recording ? "destructive" : "secondary"} size="icon" disabled={voice.sending} aria-label="Gravar reação de voz" title="Segure para gravar uma reação" className={`size-12 shrink-0 touch-none select-none rounded-full ${voice.recording ? "animate-pulse motion-reduce:animate-none" : ""}`}
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); origin.current = { x: event.clientX, y: event.clientY }; void voice.begin(); }}
          onPointerMove={(event) => { if (!origin.current) return; const rect = microphone.current?.getBoundingClientRect(); if (rect && (event.clientY < rect.top - 20 || event.clientX < rect.left - 20 || event.clientX > rect.right + 20 || event.clientY > rect.bottom + 20)) { origin.current = null; voice.finish(true); } }}
          onPointerUp={() => { if (origin.current) { origin.current = null; voice.finish(); } }}
          onPointerCancel={() => { origin.current = null; voice.finish(true); }}
          onLostPointerCapture={() => { if (origin.current) { origin.current = null; voice.finish(true); } }}
          onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); void voice.begin(); } if (event.key === "Escape") voice.finish(true); }}
          onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") { event.preventDefault(); voice.finish(); } }}
        >{voice.sending || voice.requesting ? <Loader2 className="size-5 animate-spin" /> : <Mic className="size-5" />}</Button>
      </div>
    </>
  );
}