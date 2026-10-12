import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { AnswerCard, type AnswerCardData } from "@/components/game/AnswerCard";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { useSound } from "@/components/SoundProvider";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import type { Player } from "@/hooks/use-room";
import type { Tables } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { listChatMessages, sendChatMessage, type ChatQuote } from "@/lib/chat.functions";

type ChatMessage = Tables<"chat_messages">;
import { DEFAULT_QUICK_MESSAGES, useEffectiveDevSettings } from "@/lib/dev-settings";

function parseQuote(value: ChatMessage["quote"]): ChatQuote | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const quote = value as Record<string, unknown>;
  if (
    typeof quote["roundId"] !== "string" ||
    typeof quote["category"] !== "string" ||
    typeof quote["playerId"] !== "string" ||
    typeof quote["playerName"] !== "string" ||
    typeof quote["response"] !== "string" ||
    typeof quote["points"] !== "number" ||
    typeof quote["comment"] !== "string"
  ) return null;
  return quote as ChatQuote;
}

export function ChatDrawer({
  roomId,
  playerId,
  players,
  locked,
  open,
  quote,
  onOpenChange,
  onQuoteChange,
  onNavigateQuote,
}: {
  roomId: string;
  playerId: string;
  players: Player[];
  locked: boolean;
  open: boolean;
  quote: AnswerCardData | null;
  onOpenChange: (open: boolean) => void;
  onQuoteChange: (quote: AnswerCardData | null) => void;
  onNavigateQuote: (quote: AnswerCardData) => void;
}) {
  const devCfg = useEffectiveDevSettings();
  const QUICK_MESSAGES = devCfg.quickMessages?.length ? devCfg.quickMessages : DEFAULT_QUICK_MESSAGES;
  const listMessages = useServerFn(listChatMessages);
  const sendMessage = useServerFn(sendChatMessage);
  const { play } = useSound();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [bubblePos, setBubblePos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ dx: number; dy: number; sx: number; sy: number; moved: boolean } | null>(null);
  useEffect(() => {
    try {
      const p = JSON.parse(window.localStorage.getItem("stop-chat-bubble-pos") ?? "null");
      if (p && typeof p.x === "number" && typeof p.y === "number") {
        setBubblePos({ x: Math.min(p.x, window.innerWidth - 60), y: Math.min(p.y, window.innerHeight - 60) });
      }
    } catch { /* ignore */ }
  }, []);
  const [sending, setSending] = useState(false);
  const [unread, setUnread] = useState(0);
  const [lastIncoming, setLastIncoming] = useState<{ playerId: string; content: string } | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const openRef = useRef(open);
  const playersRef = useRef(players);

  useEffect(() => { openRef.current = open; }, [open]);
  useEffect(() => { playersRef.current = players; }, [players]);

  const refresh = useCallback(async (countUnread = false) => {
    try {
      const next = await listMessages({ data: { roomId, playerId } });
      setMessages((previous) => {
        if (countUnread && !openRef.current && next.length > previous.length) {
          setUnread((value) => value + next.length - previous.length);
        }
        return next;
      });
    } catch {
      // A transient refresh failure should not interrupt the game.
    }
  }, [listMessages, playerId, roomId]);

  useEffect(() => { void refresh(false); }, [refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`chat-${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `room_id=eq.${roomId}` }, (payload) => {
        const incoming = payload.new as { player_id?: string; content?: string; quote?: ChatMessage["quote"] };
        if (incoming.player_id !== playerId) {
          play("message");
          setLastIncoming({ playerId: incoming.player_id ?? "", content: incoming.content?.trim() ?? "" });
        }
        const incomingQuote = parseQuote(incoming.quote ?? null);
        if (incoming.player_id !== playerId && incomingQuote?.playerId === playerId && incoming.content?.match(/^[^\p{L}\p{N}]/u)) {
          const author = playersRef.current.find((item) => item.id === incoming.player_id);
          const emoji = Array.from(incoming.content)[0] ?? "💬";
          toast(`${emoji} @${author?.nickname ?? "Jogador"} reagiu à sua resposta!`, { duration: 2_500 });
        }
        void refresh(incoming.player_id !== playerId);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [playerId, play, refresh, roomId]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setLastIncoming(null);
    }
  }, [open]);

  useEffect(() => {
    if (!lastIncoming) return;
    const timer = setTimeout(() => setLastIncoming(null), 4_000);
    return () => clearTimeout(timer);
  }, [lastIncoming]);

  useEffect(() => {
    if (locked && quote) onQuoteChange(null);
  }, [locked, onQuoteChange, quote]);

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

  const playersById = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);

  const submit = useCallback(async (content: string) => {
    if (sending) return;
    const clean = content.trim().slice(0, 100);
    if (locked && !QUICK_MESSAGES.includes(clean)) return;
    if (!clean && !quote) return;
    setSending(true);
    try {
      const message = await sendMessage({ data: { roomId, playerId, content: clean, quote } });
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setText("");
      onQuoteChange(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar");
    } finally {
      setSending(false);
    }
  }, [locked, onQuoteChange, playerId, quote, roomId, sendMessage, sending]);

  return (
    <>
      <Button
        type="button"
        size="icon"
        aria-label="Abrir chat (arraste para mover)"
        onPointerDown={(e) => {
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = dragRef.current;
          if (!d) return;
          if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
          d.moved = true;
          const size = 56;
          setBubblePos({
            x: Math.min(Math.max(4, e.clientX - d.dx), window.innerWidth - size - 4),
            y: Math.min(Math.max(4, e.clientY - d.dy), window.innerHeight - size - 4),
          });
        }}
        onPointerUp={() => {
          const d = dragRef.current;
          dragRef.current = null;
          if (d?.moved) {
            setBubblePos((p) => {
              if (p) window.localStorage.setItem("stop-chat-bubble-pos", JSON.stringify(p));
              return p;
            });
          } else onOpenChange(true);
        }}
        style={bubblePos ? { left: bubblePos.x, top: bubblePos.y, right: "auto", bottom: "auto", touchAction: "none" } : { touchAction: "none" }}
        className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-40 size-14 rounded-full shadow-lg md:hidden"
      >
        <MessageCircle className="size-6" />
        {unread > 0 && !open && (
          <>
            <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 animate-pulse place-items-center rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground">
              {unread > 99 ? "99+" : unread}
            </span>
            {lastIncoming && (
              <span className="absolute right-[4.5rem] top-1/2 w-52 max-w-[calc(100vw-6.5rem)] -translate-y-1/2 animate-in fade-in slide-in-from-right-2 rounded-2xl border border-border bg-popover px-3 py-2 text-left text-popover-foreground shadow-lg">
                <span className="block truncate text-xs font-bold text-muted-foreground">
                  @{playersById.get(lastIncoming.playerId)?.nickname ?? "Jogador"}
                </span>
                <span className="block break-words text-sm leading-snug">
                  {lastIncoming.content || "📩 Citou uma resposta"}
                </span>
              </span>
            )}
          </>
        )}
      </Button>

      <Drawer open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
        <DrawerContent
          className="h-[60dvh] max-h-[calc(100dvh-1rem)] md:hidden"
          style={{ bottom: keyboardInset }}
        >
          <DrawerHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b border-border py-3 text-left">
            <DrawerTitle>Chat da sala</DrawerTitle>
            <DrawerClose asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar chat"><X /></Button>
            </DrawerClose>
          </DrawerHeader>

          <Conversation className="min-h-0">
            <ConversationContent className="gap-3 p-3">
              {messages.length === 0 ? (
                <ConversationEmptyState title="Ninguém falou ainda" description="A zoeira começa nos resultados." icon={<MessageCircle />} />
              ) : messages.map((message) => {
                const messageQuote = parseQuote(message.quote);
                const mine = message.player_id === playerId;
                const author = playersById.get(message.player_id);
                return (
                  <Message key={message.id} from={mine ? "user" : "assistant"}>
                    <MessageContent>
                      <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        {author?.nickname ?? "Jogador"}
                        {author && <PlayerPresence player={author} />}
                      </span>
                      {messageQuote && (
                        <AnswerCard
                          compact
                          data={messageQuote}
                          onClick={() => {
                            onOpenChange(false);
                            onNavigateQuote(messageQuote);
                          }}
                        />
                      )}
                      {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
                    </MessageContent>
                  </Message>
                );
              })}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t border-border bg-background p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))]">
            <div className="space-y-2">
              {locked && (
                <p className="rounded-lg bg-muted px-3 py-2 text-center text-sm text-muted-foreground">
                  Durante a rodada, use apenas as mensagens rápidas.
                </p>
              )}
              {!locked && quote && (
                  <div className="relative">
                    <AnswerCard compact data={quote} />
                    <Button className="absolute right-1 top-1" variant="ghost" size="icon-sm" onClick={() => onQuoteChange(null)} aria-label="Remover citação"><X /></Button>
                  </div>
              )}
              <div className="flex gap-2 overflow-x-auto pb-1">
                {QUICK_MESSAGES.map((quick) => (
                  <Button key={quick} type="button" variant="secondary" size="sm" className="shrink-0" disabled={sending} onClick={() => void submit(quick)}>
                    {quick}
                  </Button>
                ))}
              </div>
              {!locked && (
                <PromptInput onSubmit={(message) => submit(message.text)}>
                  <PromptInputTextarea
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, 100))}
                    maxLength={100}
                    placeholder="Mensagem (até 100 caracteres)"
                    disabled={sending}
                    className="min-h-12"
                  />
                  <PromptInputFooter className="justify-end">
                    <span className="mr-auto text-xs text-muted-foreground">{text.length}/100</span>
                    <PromptInputSubmit disabled={sending || (!text.trim() && !quote)} status={sending ? "submitted" : "ready"} />
                  </PromptInputFooter>
                </PromptInput>
              )}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}