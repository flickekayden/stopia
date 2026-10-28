import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { getDevToken } from "@/lib/dev-settings";
import { getPartyAdmin, savePartyAdmin } from "@/lib/party.functions";
import {
  AI_TONE_GAMES,
  GAME_PHASES,
  PARTY_GAMES,
  PARTY_TONES,
  PARTY_TONE_LABELS,
  PHASE_LABELS,
  PHASE_SECONDS,
  PHASE_SECONDS_MAX,
  PHASE_SECONDS_MIN,
  readPartyAdmin,
  type PartyGameAdmin,
  type PartyGameId,
  type PartyTone,
} from "@/lib/party-games";

const HINTS: Partial<Record<PartyGameId, string>> = {
  tribunal: "Duração do debate (defesas e acusações) e da votação do júri, e o tom do juiz de IA.",
  infiltrado: "Tempo de discussão (pistas), da votação e da última chance. As palavras vêm só da lista do jogo.",
  roleta: "Tempo dos desafios e da votação, tom da IA e se os eventos do caos (pontos em dobro/triplo) aparecem.",
};

function formatSeconds(value: number) {
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/** Developer settings for one party game only; saved on the server for every room. */
export function PartyAdminPanel({ game }: { game: PartyGameId }) {
  const load = useServerFn(getPartyAdmin);
  const save = useServerFn(savePartyAdmin);
  const [config, setConfig] = useState<PartyGameAdmin | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    load()
      .then((all) => { if (active) setConfig(readPartyAdmin(all)[game] ?? {}); })
      .catch(() => { if (active) setConfig({}); });
    return () => { active = false; };
  }, [game, load]);

  async function persist(next: PartyGameAdmin, message: string) {
    setSaving(true);
    try {
      const result = await save({ data: { token: getDevToken(), game, config: next } });
      setConfig(readPartyAdmin(result.config)[game] ?? {});
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao salvar. Entre de novo com a senha.");
    } finally {
      setSaving(false);
    }
  }

  if (!config) {
    return <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Carregando configurações"><Loader2 className="size-6 animate-spin text-primary" /></div>;
  }

  const meta = PARTY_GAMES[game];
  return (
    <div data-game={game} className="space-y-5 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
      <p className="text-sm text-muted-foreground">{HINTS[game] ?? `Tempos das etapas e tom da IA de ${meta.name}.`} Valem a partir da próxima etapa de qualquer sala.</p>

      {GAME_PHASES[game].map((phase) => {
        const fallback = PHASE_SECONDS[phase] ?? 60;
        const value = config.seconds?.[phase] ?? fallback;
        return (
          <section key={phase} className="space-y-2">
            <Label className="flex items-center justify-between gap-2">
              <span>{PHASE_LABELS[phase]}</span>
              <span className="tabular-nums text-muted-foreground">{formatSeconds(value)}{value === fallback ? " (padrão)" : ""}</span>
            </Label>
            <Slider
              min={PHASE_SECONDS_MIN}
              max={PHASE_SECONDS_MAX}
              step={5}
              value={[value]}
              aria-label={`Tempo de ${PHASE_LABELS[phase]}`}
              onValueChange={([next]) => setConfig((current) => ({ ...current, seconds: { ...current?.seconds, [phase]: next ?? fallback } }))}
            />
          </section>
        );
      })}

      {AI_TONE_GAMES.includes(game) && (
        <section className="space-y-2">
          <Label>Tom da IA</Label>
          <Select value={config.tone ?? "padrao"} onValueChange={(tone) => setConfig((current) => ({ ...current, tone: tone as PartyTone }))}>
            <SelectTrigger aria-label="Tom da IA"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PARTY_TONES.map((tone) => <SelectItem key={tone} value={tone}>{PARTY_TONE_LABELS[tone]}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Muda só o estilo dos textos da IA; votos e pontos continuam iguais.</p>
        </section>
      )}

      {game === "roleta" && (
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <span>
            <span className="block font-semibold">Eventos do caos</span>
            <span className="block text-sm text-muted-foreground">Pontos em dobro ou triplo em rodadas sorteadas.</span>
          </span>
          <Switch checked={config.events !== false} onCheckedChange={(events) => setConfig((current) => ({ ...current, events }))} />
        </label>
      )}

      <div className="space-y-2 border-t border-border pt-3">
        <Button className="w-full" disabled={saving} aria-busy={saving} onClick={() => void persist(config, `Configurações de ${meta.name} salvas`)}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar {meta.name}
        </Button>
        <Button variant="outline" className="w-full" disabled={saving} onClick={() => void persist({}, "Padrões do jogo restaurados")}>
          <RotateCcw /> Restaurar padrões do jogo
        </Button>
      </div>
    </div>
  );
}
