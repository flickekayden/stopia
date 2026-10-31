import { useServerFn } from "@tanstack/react-start";
import { CornerDownLeft, Loader2, MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { useSound } from "@/components/SoundProvider";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import type { PartyPlayer } from "@/hooks/use-party-room";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { listPartyChat, sendPartyChat } from "@/lib/party.functions";
import { PARTY_CHAT_MAX, PARTY_CHAT_QUICK } from "@/lib/party-games";
import { nightKingId } from "@/lib/ranking";
import { cn } from "@/lib/utils";
import { friendlyError } from "@/lib/friendly-error";

type ChatRow = Tables<"party_chat">;
const HISTORY_CAP = 80;

function merge(current: ChatRow[], incoming: ChatRow[]) {
  const byId = new Map<string, ChatRow>();
  for (const row of [...current, ...incoming]) byId.set(row.id, row);
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(-HISTORY_CAP);
}

/**
 * The group room's chat: one fixed launcher in the top-right controls (next to sound) on every screen
 * of /festa/$code, so it never moves between lobby, rounds, results and podium. One subscription per room.
 */
export function PartyChat({ roomId, playerId, sessionId, players, quickOnly }: {
  roomId: string;
  playerId: string;
  sessionId: string;
  players: PartyPlayer[];
  /** Stop answers open: only the one-tap reactions can be sent. */
  quickOnly: boolean;
}) {
  const listFn = useServerFn(listPartyChat);
  const sendFn = useServerFn(sendPartyChat);
  const { play } = useSound();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatRow[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [preview, setPreview] = useState<ChatRow | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const openRef = useRef(open);
  openRef.current = open;
  const listRef = useRef<HTMLDivElement | null>(null);

  // Reserve the chat slot in the fixed top-right controls while a room is on screen.
  useEffect(() => {
    document.documentElement.dataset["roomChat"] = "on";
    return () => { delete document.documentElement.dataset["roomChat"]; };
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await listFn({ data: { roomId, playerId, sessionId } });
      setMessages((current) => merge(current, rows as ChatRow[]));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [listFn, roomId, playerId, sessionId]);

  useEffect(() => {
    const channel = supabase
      .channel(`party-chat-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "party_chat", filter: `room_id=eq.${roomId}` }, (payload) => {
        const row = payload.new as ChatRow;
        setMessages((current) => (current.some((m) => m.id === row.id) ? current : merge(current, [row])));
        if (row.player_id !== playerId) {
          play("message");
          if (!openRef.current) {
            setUnread((n) => n + 1);
            setPreview(row);
          }
        }
      })
      .subscribe((status) => { if (status === "SUBSCRIBED") void load(); });
    return () => { void supabase.removeChannel(channel); };
  }, [roomId, playerId, play, load]);

  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => setPreview(null), 3_500);
    return () => window.clearTimeout(timer);
  }, [preview]);

  useEffect(() => {
    if (!open) return;
    setUnread(0);
    setPreview(null);
    const id = window.setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 60);
    return () => window.clearTimeout(id);
  }, [open, messages.length]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setKeyboardInset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  const hostIds = useMemo(() => new Set(players.filter((p) => p.is_host).map((p) => p.id)), [players]);
  const kingId = useMemo(() => nightKingId(players), [players]);

  async function send(content: string) {
    const clean = content.replace(/\s+/g, " ").trim().slice(0, PARTY_CHAT_MAX);
    if (!clean || sending) return;
    if (quickOnly && !(PARTY_CHAT_QUICK as readonly string[]).includes(clean)) return;
    setSending(true);
    try {
      const row = await sendFn({ data: { roomId, playerId, sessionId, content: clean } });
      setMessages((current) => merge(current, [row as ChatRow]));
      if (clean === text.trim()) setText("");
    } catch (err) {
      toast.error(friendlyError(err, "Mensagem não enviada. Seu texto continua aqui, tente de novo."));
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Abrir chat da sala${unread ? ` (${unread} não lidas)` : ""}`}
        title="Chat da sala"
        onClick={() => setOpen(true)}
        className="top-action-chat fixed z-40 size-12 rounded-lg bg-background/95 text-muted-foreground"
      >
        <MessageCircle className="size-6" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-bold text-primary-foreground" aria-hidden="true">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {preview && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="top-action-chat fixed z-40 mt-14 w-60 max-w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-1 rounded-2xl border border-border bg-popover px-3 py-2 text-left text-popover-foreground shadow-lg"
        >
          <span className="block truncate text-xs font-bold text-muted-foreground">{preview.nickname}</span>
          <span className="line-clamp-2 break-words text-sm leading-snug">{preview.content}</span>
        </button>
      )}
      <Drawer open={open} onOpenChange={setOpen} shouldScaleBackground={false}>
        <DrawerContent className="mx-auto h-[72dvh] max-h-[calc(100dvh-1rem)] w-full max-w-md" style={{ bottom: keyboardInset }}>
          <DrawerHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border py-3 text-left">
            <div className="min-w-0">
              <DrawerTitle>Chat da galera</DrawerTitle>
              <DrawerDescription className="text-xs">{quickOnly ? "Valendo respostas: só reações rápidas." : "Vale em todas as telas da sala."}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar chat"><X /></Button>
            </DrawerClose>
          </DrawerHeader>
          <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3" aria-live="polite">
            {loadError && (
              <div role="alert" className="text-center text-sm text-muted-foreground">
                <p>Não foi possível carregar as mensagens.</p>
                <Button variant="ghost" onClick={() => void load()}>Tentar de novo</Button>
              </div>
            )}
            {messages.length === 0 && !loadError ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Ninguém falou ainda. Começa a zoeira!</p>
            ) : messages.map((m) => {
              const mine = m.player_id === playerId;
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[85%] rounded-2xl px-3 py-2", mine ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")}>
                    {!mine && <p className="text-xs font-bold opacity-80">{m.player_id && m.player_id === kingId ? "👑 " : ""}{m.nickname}{m.player_id && hostIds.has(m.player_id) ? " · mestre" : ""}</p>}
                    <p className="whitespace-pre-wrap break-words text-sm">{m.content}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="space-y-2 border-t border-border bg-background p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
            <div className="game-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Reações rápidas">
              {PARTY_CHAT_QUICK.map((quick) => (
                <Button key={quick} type="button" variant="secondary" size="sm" className="shrink-0 px-4" disabled={sending} onClick={() => void send(quick)}>{quick}</Button>
              ))}
            </div>
            {!quickOnly && (
              <form onSubmit={(event) => { event.preventDefault(); void send(text); }}>
                <InputGroup>
                  <InputGroupTextarea
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, PARTY_CHAT_MAX))}
                    maxLength={PARTY_CHAT_MAX}
                    placeholder="Mensagem para a galera"
                    aria-label="Mensagem para a sala"
                    autoCapitalize="sentences"
                    disabled={sending}
                    className="field-sizing-content max-h-32 min-h-12"
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault();
                        if (text.trim()) event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <InputGroupAddon align="block-end" className="justify-end gap-1">
                    <span className="mr-auto text-xs tabular-nums text-muted-foreground">{text.length}/{PARTY_CHAT_MAX}</span>
                    <InputGroupButton type="submit" variant="default" size="icon-sm" aria-label="Enviar mensagem" disabled={sending || !text.trim()}>
                      {sending ? <Loader2 className="size-4 animate-spin" /> : <CornerDownLeft className="size-4" />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
              </form>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
