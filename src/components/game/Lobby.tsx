import { Check, Copy, Crown, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { ScoringRules } from "@/components/game/ScoringRules";
import { CategoryPresets } from "@/components/game/CategoryPresets";
import { useSound } from "@/components/SoundProvider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { Player, Room } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import { LETTERS, MAX_CATEGORIES_PER_ROUND } from "@/lib/game";
import { devText, useEffectiveDevSettings } from "@/lib/dev-settings";
import { vibrate } from "@/lib/haptics";

export function Lobby({
  room,
  players,
  isHost,
  starting,
  onStart,
}: {
  room: Room;
  players: Player[];
  isHost: boolean;
  starting: boolean;
  onStart: () => void;
}) {
  const devSettings = useEffectiveDevSettings();
  const { play } = useSound();
  const [newCategory, setNewCategory] = useState("");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editingCategories, setEditingCategories] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const updateInFlight = useRef(false);

  async function update(patch: Partial<Room>) {
    if (updateInFlight.current || starting) return false;
    updateInFlight.current = true;
    setUpdatingSettings(true);
    try {
      const { error } = await supabase.from("rooms").update(patch).eq("id", room.id);
      if (error) throw error;
      return true;
    } catch {
      play("error");
      toast.error("Não consegui salvar a configuração");
      return false;
    } finally {
      updateInFlight.current = false;
      setUpdatingSettings(false);
    }
  }

  async function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (room.categories.some((c) => c.toLowerCase() === value.toLowerCase())) {
      play("error");
      toast.error("Essa categoria já está na lista");
      return;
    }
    if (await update({ categories: [...room.categories, value] })) setNewCategory("");
  }

  function editCategory(index: number, value: string) {
    const next = [...room.categories];
    next[index] = value;
    void update({ categories: next });
  }

  function removeCategory(index: number) {
    if (room.categories.length <= 1) {
      play("error");
      toast.error("Precisa de pelo menos uma categoria");
      return;
    }
    void update({ categories: room.categories.filter((_, i) => i !== index) });
  }

  function toggleLetter(letter: string) {
    const excluded = room.excluded_letters ?? [];
    const next = excluded.includes(letter)
      ? excluded.filter((l) => l !== letter)
      : [...excluded, letter];
    if (next.length >= LETTERS.length) {
      play("error");
      toast.error("Deixa pelo menos uma letra no jogo");
      return;
    }
    void update({ excluded_letters: next });
  }

  async function share() {
    if (sharing) return;
    setSharing(true);
    const url = `${window.location.origin}/sala/${room.code}`;
    const text = `Bora jogar Stop! Sala ${room.code}: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "STOP!", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      vibrate(15);
      setCopied(true);
      toast.success("Link copiado!");
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Não foi possível compartilhar o convite.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="game-screen lobby-screen dock-clearance space-y-4">
      <section className="py-4 text-center">
        <p className="text-sm text-muted-foreground">Código da sala</p>
        <p className="lobby-code mt-2 text-primary">{room.code}</p>
        <Button onClick={share} variant="outline" disabled={sharing} className="mt-4 h-12 w-full rounded-lg font-semibold">
          {copied ? <Check className="mr-2 size-5" /> : <Copy className="mr-2 size-5" />}
          Compartilhar sala
        </Button>
      </section>

      <section className="game-section">
        <h2 className="text-lg font-bold">Jogadores <span className="text-muted-foreground">· {players.length}</span></h2>
        <ul className="mt-3 space-y-2">
          {players.map((p) => (
            <li key={p.id} className="animate-in fade-in slide-in-from-bottom-1 motion-reduce:animate-none flex items-center gap-3 border-b border-border/50 px-1 py-3 last:border-0">
              <span className={`size-2 shrink-0 rounded-full ${p.is_online ? "bg-success motion-safe:animate-pulse" : "bg-muted-foreground"}`} aria-hidden="true" />
              {p.is_host && <Crown aria-label="Anfitrião" className="size-4 text-primary" />}
              <span className="min-w-0 flex-1 font-semibold text-balance-safe">{p.nickname}</span>
              <PlayerPresence player={p} />
            </li>
          ))}
        </ul>
      </section>

      <section className="game-section space-y-3">
        <h2 className="text-lg font-bold">Categorias <span className="text-muted-foreground">· {room.categories.length}</span></h2>
        <div className="flex flex-wrap gap-2">
          {room.categories.map((c) => <span key={c} className="game-chip rounded-lg bg-secondary px-3 py-1.5 text-sm text-balance-safe">{c}</span>)}
        </div>
      </section>

      <ScoringRules />
      <p className="text-balance-safe text-center text-sm text-muted-foreground">{room.total_rounds} rodadas · {Math.min(MAX_CATEGORIES_PER_ROUND, room.categories.length)} categorias por rodada · {room.timer_enabled ? `${room.timer_seconds}s por rodada` : "sem cronômetro"} · avaliação automática</p>

      {isHost ? (
        <>
          <section className="game-section space-y-6">
            <h2 className="text-lg font-bold">Configuração</h2>

            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Rodadas</p>
              <div className="grid grid-cols-4 gap-2">
                {[4, 6, 8, 10].map((n) => (
                  <Button variant="secondary"
                    key={n}
                    disabled={updatingSettings}
                    onClick={() => void update({ total_rounds: n })}
                    aria-pressed={room.total_rounds === n}
                    className={`h-12 rounded-lg text-base transition ${
                      room.total_rounds === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
              <div className="min-w-0">
                <p className="font-semibold">Cronômetro</p>
                <p className="text-sm text-muted-foreground">Encerra a rodada no tempo</p>
              </div>
              <Switch
                aria-label="Cronômetro"
                disabled={updatingSettings}
                checked={room.timer_enabled}
                onCheckedChange={(v) => void update({ timer_enabled: v })}
              />
            </div>

            {room.timer_enabled && (
              <div className="grid grid-cols-4 gap-2">
                {[60, 90, 120, 180].map((s) => (
                  <Button variant="secondary"
                    key={s}
                    disabled={updatingSettings}
                    onClick={() => void update({ timer_seconds: s })}
                    aria-pressed={room.timer_seconds === s}
                    className={`h-11 rounded-2xl text-sm font-bold transition ${
                      room.timer_seconds === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {s}s
                  </Button>
                ))}
              </div>
            )}

            <Collapsible className="space-y-4">
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between px-0 text-sm font-bold text-muted-foreground">
                  <span>Configurações avançadas</span>
                  <Settings2 className="size-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-6">
                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">Quem pode apertar STOP</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: "anyone", label: "Todos" },
                      { value: "host", label: "Só o mestre" },
                    ].map((opt) => (
                      <Button variant="secondary"
                        key={opt.value}
                        disabled={updatingSettings}
                        onClick={() => void update({ stop_policy: opt.value })}
                        aria-pressed={room.stop_policy === opt.value}
                        className={`h-12 rounded-2xl font-bold transition ${
                          room.stop_policy === opt.value
                            ? "bg-primary text-primary-foreground"
                            : "bg-secondary text-foreground"
                        }`}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-muted-foreground">
                    Letras fora do sorteio
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {LETTERS.map((l) => {
                      const off = (room.excluded_letters ?? []).includes(l);
                      return (
                        <Button variant="secondary"
                          key={l}
                          disabled={updatingSettings}
                          onClick={() => toggleLetter(l)}
                          aria-label={`${off ? "Incluir" : "Excluir"} letra ${l}`}
                          aria-pressed={off}
                          className={`size-12 rounded-xl font-display text-lg transition ${
                            off ? "bg-muted text-muted-foreground line-through" : "bg-secondary text-foreground"
                          }`}
                        >
                          {l}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>

          <CategoryPresets
            categories={room.categories}
            onApply={(list) => update({ categories: list })}
          />

          <section className="game-section">
            <Button variant="ghost" className="w-full justify-between px-0" aria-expanded={editingCategories} onClick={() => setEditingCategories((v) => !v)}><span className="text-lg font-bold">Editar categorias</span><Pencil className="size-4" /></Button>
            <p className="mt-1 text-sm text-muted-foreground">
              {Math.min(MAX_CATEGORIES_PER_ROUND, room.categories.length)} categorias por rodada, em rodízio.
            </p>
            {editingCategories && <ul className="mt-3 space-y-2">
              {room.categories.map((c, i) => (
                <li key={`${c}-${i}`} className="flex items-center gap-2">
                  <Input
                    defaultValue={c}
                    maxLength={160}
                    aria-label={`Editar categoria ${c}`}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c) editCategory(i, v);
                    }}
                    className="h-12 rounded-2xl"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-12 shrink-0 rounded-2xl text-destructive"
                    onClick={() => removeCategory(i)}
                    aria-label={`Remover categoria ${c}`}
                    title={`Remover ${c}`}
                  >
                    <Trash2 className="size-5" />
                  </Button>
                </li>
              ))}
            </ul>}
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={newCategory}
                maxLength={160}
                placeholder="Nova categoria"
                aria-label="Nova categoria"
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCategory();
                }}
                className="h-12 rounded-2xl"
              />
              <Button disabled={updatingSettings || !newCategory.trim()} className="size-12 shrink-0 rounded-2xl" size="icon" aria-label="Adicionar categoria" title="Adicionar categoria" onClick={() => void addCategory()}>
                <Plus className="size-5" />
              </Button>
            </div>
          </section>

          <div className="mobile-bottom-bar fixed inset-x-0 bottom-0 mx-auto w-full max-w-md border-t border-border bg-background/95 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur"><Button
            onClick={onStart}
            disabled={starting || updatingSettings || players.length === 0}
            aria-busy={starting || updatingSettings}
            className="h-14 w-full rounded-lg text-base font-bold"
          >
            {starting ? "Começando..." : devText(devSettings.texts.startButton, "Começar partida")}
          </Button></div>
        </>
      ) : (
        <p className="border-t border-border py-6 text-center text-sm text-muted-foreground">
          Esperando o mestre começar a partida...
        </p>
      )}
    </div>
  );
}
