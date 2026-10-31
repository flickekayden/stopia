import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Activity, FlaskConical, Loader2, RefreshCw, RotateCcw, Save, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AnswerCard, type AnswerCardData } from "@/components/game/AnswerCard";
import { PartyAdminPanel } from "@/components/party/PartyAdminPanel";
import { DevRoomControls } from "@/components/party/DevRoomControls";
import { PartyRoomsAdmin } from "@/components/party/PartyRoomsAdmin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  AI_PRESETS,
  GEMINI_MODELS,
  devAiOverrides,
  resetDevSettings,
  setGlobalSettings,
  updateDevSettings,
  useDevGameContext,
  useDevRound,
  useDevSettings,
  type DevGameContext,
  type DevSettings,
  type GeminiModel,
} from "@/lib/dev-settings";
import { evaluateRound, saveAiSettings, testJudgment } from "@/lib/game.functions";


const SAMPLE_BUBBLES: Array<{ label: string; data: AnswerCardData }> = [
  { label: "20 pts (criativa)", data: sample(20, "Ornitorrinco", "Até que enfim usou o cérebro.") },
  { label: "15 pts", data: sample(15, "Onça-pintada", "Boa, mas nem tanto.") },
  { label: "10 pts", data: sample(10, "Ovelha", "O básico bem feito, parabéns pelo mínimo.") },
  { label: "5 pts (repetida)", data: sample(5, "Ovelha", "Copiou o vizinho, né?") },
  { label: "0 pts (erro)", data: sample(0, "Abacate", "Abacate é animal agora? Sério?") },
  { label: "Em branco", data: sample(0, "", "Em branco. Estratégia ousada.") },
];

function sample(points: number, response: string, comment: string): AnswerCardData {
  return { roundId: "dev", category: "Animal", playerId: `dev-${points}-${response}`, playerName: "Testador", response, points, comment };
}

const CONTEXT_LABELS: Record<DevGameContext, string> = {
  global: "Geral",
  stop: "Stop",
  tribunal: "Tribunal dos Amigos",
  autor: "Quem Escreveu?",
  infiltrado: "Infiltrado",
  debate: "Debate Impossível",
  roleta: "Roleta do Caos",
};

/** Settings shown depend on where the developer is: global on the hub/lobby, per game inside a game. */
function useActiveContext(): DevGameContext {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const groupGame = useDevGameContext();
  if (pathname.startsWith("/stop") || pathname.startsWith("/sala")) return "stop";
  if (pathname.startsWith("/festa")) return groupGame;
  return "global";
}

export function DevPanel() {
  const { isDev, settings: s } = useDevSettings();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = useServerFn(saveAiSettings);
  const context = useActiveContext();
  // Headers reserve room for this button next to the sound toggle while it is on screen.
  useEffect(() => {
    if (!isDev) return;
    document.documentElement.dataset["devTools"] = "on";
    return () => { delete document.documentElement.dataset["devTools"]; };
  }, [isDev]);
  if (!isDev) return null;

  const patch = (fn: (p: DevSettings) => DevSettings) => updateDevSettings(fn);

  return (
    <>
      <Button
        variant="secondary"
        size="icon"
        aria-label={`Configurações Dev: ${CONTEXT_LABELS[context]}`}
        onClick={() => setOpen(true)}
        className="top-action-dev fixed z-40 size-12 rounded-full border border-border shadow-lg"
      >
        <Settings className="size-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mobile-sheet h-[85dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>⚙️ Configurações Dev · {CONTEXT_LABELS[context]}</SheetTitle>
            <SheetDescription>
              {context === "global" ? "Ajustes gerais do app. As regras de cada jogo aparecem dentro do próprio jogo." : `Só ajustes de ${CONTEXT_LABELS[context]}.`}
            </SheetDescription>
          </SheetHeader>
          {context !== "global" && (
            <div className="px-4 pt-3">
              <DevRoomControls />
            </div>
          )}
          {context !== "global" && context !== "stop" ? (
            <PartyAdminPanel key={context} game={context} />
          ) : context === "global" ? (
            <div className="space-y-5 px-4 pb-6 pt-3">
              <DevRoomControls />
              <AiHealth />
              <PartyRoomsAdmin />
            </div>
          ) : (
          <Tabs defaultValue="visual" className="px-4 pb-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="visual">Visual</TabsTrigger>
              <TabsTrigger value="teclado">Teclado</TabsTrigger>
              <TabsTrigger value="ia">IA</TabsTrigger>
            </TabsList>

            <TabsContent value="visual" className="space-y-5 pt-3">
              <section className="space-y-2">
                <Label>Posição dos botões da rodada</Label>
                <Select
                  value={s.buttonLayout}
                  onValueChange={(v) => patch((p) => ({ ...p, buttonLayout: v as DevSettings["buttonLayout"] }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Padrão (Terminei | STOP)</SelectItem>
                    <SelectItem value="reversed">Invertido (STOP | Terminei)</SelectItem>
                    <SelectItem value="stacked">Empilhado</SelectItem>
                  </SelectContent>
                </Select>
              </section>

              <section className="space-y-2">
                <Label>Textos da interface</Label>
                {(
                  [
                    ["appTitle", "Título do jogo", "STOP!"],
                    ["startButton", "Botão iniciar", "Começar partida"],
                    ["stopButton", "Botão STOP", "STOP!"],
                    ["finishButton", "Botão terminei", "Terminei"],
                  ] as const
                ).map(([key, label, ph]) => (
                  <div key={key}>
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Input
                      value={s.texts[key]}
                      placeholder={ph}
                      maxLength={40}
                      onChange={(e) => patch((p) => ({ ...p, texts: { ...p.texts, [key]: e.target.value } }))}
                    />
                  </div>
                ))}
              </section>

              <section className="space-y-2">
                <Label>Inspecionar balões</Label>
                <div className="space-y-3">
                  {SAMPLE_BUBBLES.map((b) => (
                    <div key={b.label}>
                      <p className="mb-1 text-xs text-muted-foreground">{b.label}</p>
                      <AnswerCard data={b.data} compact />
                    </div>
                  ))}
                </div>
              </section>
            </TabsContent>

            <TabsContent value="teclado" className="space-y-4 pt-3">
              <p className="text-sm text-muted-foreground">Vale para os campos de resposta da rodada, na hora.</p>
              {(
                [
                  ["autocomplete", "Preenchimento automático"],
                  ["autocorrect", "Correção automática"],
                  ["spellcheck", "Verificador ortográfico"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <span>{label}</span>
                  <Switch
                    checked={s.keyboard[key]}
                    onCheckedChange={(v) => patch((p) => ({ ...p, keyboard: { ...p.keyboard, [key]: v } }))}
                  />
                </label>
              ))}
              <label className="flex items-center justify-between rounded-xl border border-border p-3">
                <span>Usar teclado do próprio app</span>
                <Switch
                  checked={s.keyboard.mode === "app"}
                  onCheckedChange={(v) => patch((p) => ({ ...p, keyboard: { ...p.keyboard, mode: v ? "app" : "native" } }))}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Mensagens rápidas do chat (separe por vírgula)</span>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-border bg-background p-2 text-sm"
                  defaultValue={(s.quickMessages ?? []).join(", ")}
                  onBlur={(e) =>
                    patch((p) => ({
                      ...p,
                      quickMessages: e.target.value.split(",").map((x) => x.trim().slice(0, 30)).filter(Boolean).slice(0, 8),
                    }))
                  }
                />
              </label>
            </TabsContent>

            <TabsContent value="ia" className="pt-3">
              <AiTab s={s} patch={patch} />
            </TabsContent>
          </Tabs>
          )}
          <div className="sticky bottom-0 space-y-2 border-t border-border bg-background px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <Button
              className="w-full"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  await save({
                    data: {
                      dev: devAiOverrides(),
                      ui: { buttonLayout: s.buttonLayout, colors: s.colors, texts: s.texts, scoringMode: s.scoringMode, keyboard: s.keyboard, quickMessages: s.quickMessages },
                    },
                  });
                  setGlobalSettings(s);
                  toast.success("Alterações salvas: a IA vai usar essas regras em todas as partidas");
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao salvar. Entre de novo com a senha.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />} Salvar alterações
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                resetDevSettings();
                toast.success("Padrões restaurados");
              }}
            >
              <RotateCcw /> Restaurar padrões
            </Button>
          </div>
          </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function AiTab({ s, patch }: { s: DevSettings; patch: (fn: (p: DevSettings) => DevSettings) => void }) {
  const roundId = useDevRound();
  const evaluate = useServerFn(evaluateRound);
  const test = useServerFn(testJudgment);
  const [redoing, setRedoing] = useState(false);
  const [lastLatency, setLastLatency] = useState<string | null>(null);
  const [lab, setLab] = useState({ letter: "P", category: "Animal", response: "Pato Donald" });
  const [labBusy, setLabBusy] = useState(false);
  const [labResult, setLabResult] = useState<{ pontos: number; comentario: string; latencyMs: number; model: string } | null>(null);
  const ai = s.ai;
  const setAi = (v: Partial<DevSettings["ai"]>) => patch((p) => ({ ...p, ai: { ...p.ai, ...v } }));

  const redo = async () => {
    if (!roundId) return;
    setRedoing(true);
    try {
      const r = await evaluate({ data: { roundId, dev: devAiOverrides(), force: true } });
      setLastLatency(`Reavaliação: ${(r.latencyMs / 1000).toFixed(1)}s (${ai.model})`);
      toast.success("Rodada reavaliada");
    } catch (e) {
      setLastLatency("Reavaliação falhou");
      toast.error(e instanceof Error ? e.message : "Falha ao reavaliar");
    } finally {
      setRedoing(false);
    }
  };

  const runLab = async () => {
    setLabBusy(true);
    try {
      const r = await test({ data: { ...lab, dev: devAiOverrides() } });
      setLabResult(r);
      setLastLatency(`Laboratório: ${(r.latencyMs / 1000).toFixed(1)}s (${r.model})`);
    } catch (e) {
      setLastLatency("Laboratório falhou");
      toast.error(e instanceof Error ? e.message : "Falha no teste");
    } finally {
      setLabBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <Label>Personagem do juiz</Label>
        <p className="text-xs text-muted-foreground">Pontuação e intensidade da IA agora são regras da partida, escolhidas pelo mestre de cada sala.</p>
        <div className="grid gap-2">
          {AI_PRESETS.map((p) => {
            const active = ai.persona === p.persona;
            return (
              <Button
                key={p.id}
                variant={active ? "default" : "outline"}
                className="justify-start"
                onClick={() => setAi({ persona: p.persona })}
              >
                {p.id === "max" ? "😈 Juiz padrão (sem personagem)" : p.label}
              </Button>
            );
          })}
        </div>
      </section>

      <section className="space-y-2">
        <Label>Modelo do Gemini</Label>
        <Select value={ai.model} onValueChange={(v) => setAi({ model: v as GeminiModel })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {GEMINI_MODELS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </section>

      <section className="space-y-2">
        <Label>Instruções da IA (vazio = padrão do jogo)</Label>
        <Textarea
          rows={6}
          maxLength={8000}
          value={ai.prompt}
          placeholder="Escreva aqui para substituir as regras padrão de julgamento..."
          onChange={(e) => setAi({ prompt: e.target.value })}
        />
      </section>

      <section className="space-y-2 rounded-2xl border border-border p-3">
        <Label className="flex items-center gap-2"><FlaskConical className="size-4" /> Laboratório</Label>
        <div className="grid grid-cols-[4rem_1fr] gap-2">
          <Input value={lab.letter} maxLength={1} onChange={(e) => setLab({ ...lab, letter: e.target.value })} placeholder="Letra" />
          <Input value={lab.category} maxLength={160} onChange={(e) => setLab({ ...lab, category: e.target.value })} placeholder="Categoria" />
        </div>
        <Input value={lab.response} maxLength={80} onChange={(e) => setLab({ ...lab, response: e.target.value })} placeholder="Resposta" />
        <Button className="w-full" disabled={labBusy || !lab.letter || !lab.category} onClick={() => void runLab()}>
          {labBusy ? <Loader2 className="animate-spin" /> : null} Testar julgamento
        </Button>
        {labResult && (
          <div className="rounded-xl bg-secondary p-3 text-sm">
            <p className="font-bold">{labResult.pontos} pts</p>
            <p>{labResult.comentario}</p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <Button variant="secondary" className="w-full" disabled={!roundId || redoing} onClick={() => void redo()}>
          {redoing ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refazer validação da rodada
        </Button>
        {!roundId && <p className="text-xs text-muted-foreground">Entre numa sala com rodada avaliada para usar.</p>}
        {lastLatency && <p className="text-xs text-muted-foreground">⏱ {lastLatency}</p>}
      </section>
    </div>
  );
}
