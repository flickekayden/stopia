import { Check, Copy, Crown, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PlayerPresence } from "@/components/game/PlayerPresence";
import { ScoringRules } from "@/components/game/ScoringRules";
import { CategoryPresets } from "@/components/game/CategoryPresets";
import { useSound } from "@/components/SoundProvider";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Player, Room } from "@/hooks/use-room";
import { supabase } from "@/integrations/supabase/client";
import { LETTERS } from "@/lib/game";
import { devText, useEffectiveDevSettings } from "@/lib/dev-settings";

const STORAGE_KEY = "stop-categorias";

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

  useEffect(() => {
    if (!isHost) return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const list = JSON.parse(saved) as string[];
        if (Array.isArray(list) && list.length > 0 && room.current_round === 0) {
          void update({ categories: list });
        }
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function update(patch: Partial<Room>) {
    const { error } = await supabase.from("rooms").update(patch).eq("id", room.id);
    if (error) {
      play("error");
      toast.error("Não consegui salvar a configuração");
    }
    if (patch.categories) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(patch.categories));
  }

  function addCategory() {
    const value = newCategory.trim();
    if (!value) return;
    if (room.categories.some((c) => c.toLowerCase() === value.toLowerCase())) {
      play("error");
      toast.error("Essa categoria já está na lista");
      return;
    }
    void update({ categories: [...room.categories, value] });
    setNewCategory("");
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
    const url = `${window.location.origin}/sala/${room.code}`;
    const text = `Bora jogar Stop! Sala ${room.code}: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "STOP!", text, url });
        return;
      } catch {
        /* usuário cancelou */
      }
    }
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-3xl border border-border bg-card p-5 text-center">
        <p className="text-sm text-muted-foreground">Código da sala</p>
        <p className="font-display text-5xl tracking-[0.3em] text-primary">{room.code}</p>
        <Button onClick={share} variant="secondary" className="mt-4 h-12 w-full rounded-2xl font-bold">
          {copied ? <Check className="mr-2 size-5" /> : <Copy className="mr-2 size-5" />}
          Compartilhar sala
        </Button>
      </section>

      <section className="rounded-3xl border border-border bg-card p-5">
        <h2 className="font-display text-xl">Jogadores ({players.length})</h2>
        <ul className="mt-3 space-y-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2 rounded-2xl bg-secondary px-4 py-3">
              {p.is_host && <Crown className="size-4 text-primary" />}
              <span className="font-semibold">{p.nickname}</span>
              <PlayerPresence player={p} />
            </li>
          ))}
        </ul>
      </section>

      <ScoringRules />

      {isHost ? (
        <>
          <section className="space-y-5 rounded-3xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Configuração</h2>

            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Rodadas</p>
              <div className="grid grid-cols-4 gap-2">
                {[4, 6, 8, 10].map((n) => (
                  <button
                    key={n}
                    onClick={() => void update({ total_rounds: n })}
                    className={`h-12 rounded-2xl font-display text-xl transition ${
                      room.total_rounds === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold">Cronômetro</p>
                <p className="text-sm text-muted-foreground">Encerra a rodada no tempo</p>
              </div>
              <Switch
                checked={room.timer_enabled}
                onCheckedChange={(v) => void update({ timer_enabled: v })}
              />
            </div>

            {room.timer_enabled && (
              <div className="grid grid-cols-4 gap-2">
                {[60, 90, 120, 180].map((s) => (
                  <button
                    key={s}
                    onClick={() => void update({ timer_seconds: s })}
                    className={`h-11 rounded-2xl text-sm font-bold transition ${
                      room.timer_seconds === s
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {s}s
                  </button>
                ))}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">Quem pode apertar STOP</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "anyone", label: "Todos" },
                  { value: "host", label: "Só o mestre" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => void update({ stop_policy: opt.value })}
                    className={`h-12 rounded-2xl font-bold transition ${
                      room.stop_policy === opt.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-muted-foreground">
                Letras fora do sorteio (opcional)
              </p>
              <div className="flex flex-wrap gap-2">
                {LETTERS.map((l) => {
                  const off = (room.excluded_letters ?? []).includes(l);
                  return (
                    <button
                      key={l}
                      onClick={() => toggleLetter(l)}
                      className={`size-10 rounded-xl font-display text-lg transition ${
                        off ? "bg-muted text-muted-foreground line-through" : "bg-secondary text-foreground"
                      }`}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-5">
            <h2 className="font-display text-xl">Categorias ({room.categories.length})</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre quantas quiser. Cada rodada usa 8, em rodízio.
            </p>
            <ul className="mt-3 space-y-2">
              {room.categories.map((c, i) => (
                <li key={`${c}-${i}`} className="flex items-center gap-2">
                  <Input
                    defaultValue={c}
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
                  >
                    <Trash2 className="size-5" />
                  </Button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={newCategory}
                placeholder="Nova categoria"
                onChange={(e) => setNewCategory(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCategory();
                }}
                className="h-12 rounded-2xl"
              />
              <Button className="size-12 shrink-0 rounded-2xl" size="icon" onClick={addCategory}>
                <Plus className="size-5" />
              </Button>
            </div>
          </section>

          <CategoryPresets
            categories={room.categories}
            onApply={(list) => void update({ categories: list })}
          />

          <Button
            onClick={onStart}
            disabled={starting || players.length === 0}
            className="h-16 w-full rounded-3xl font-display text-2xl"
          >
            {starting ? "Começando..." : devText(devSettings.texts.startButton, "Começar partida")}
          </Button>
        </>
      ) : (
        <p className="rounded-3xl border border-border bg-card p-5 text-center text-muted-foreground">
          Esperando o mestre começar a partida...
        </p>
      )}
    </div>
  );
}
