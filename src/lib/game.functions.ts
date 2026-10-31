import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Evaluation } from "./game";

/**
 * Global app settings and the admin AI lab. The legacy Stop room actions (rooms/players/rounds/answers)
 * were retired: every game now runs in a group room, and those tables are server-only.
 */
async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const DEV_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"] as const;
const devOverridesSchema = z
  .object({
    prompt: z.string().max(8000).optional(),
    model: z.enum(DEV_MODELS).optional(),
    sarcasm: z.number().int().min(1).max(10).optional(),
    persona: z.string().max(600).optional(),
    scoringMode: z.enum(["fixed", "free"]).optional(),
    token: z.string().max(200).optional(),
  })
  .optional();
type DevOverrides = z.infer<typeof devOverridesSchema>;

async function resolveDevOverrides(dev: DevOverrides) {
  if (!dev) return undefined;
  const { isDeveloper } = await import("./dev-session.server");
  return (await isDeveloper(dev.token)) ? dev : undefined;
}

const shortStr = z.string().max(80);
const uiSchema = z.object({
  buttonLayout: z.enum(["default", "reversed", "stacked"]),
  colors: z.object({ primary: shortStr, secondary: shortStr, background: shortStr, foreground: shortStr }),
  texts: z.object({ appTitle: shortStr, startButton: shortStr, stopButton: shortStr, finishButton: shortStr }),
  scoringMode: z.enum(["fixed", "free"]),
  keyboard: z.object({ autocomplete: z.boolean(), autocorrect: z.boolean(), spellcheck: z.boolean(), mode: z.enum(["native", "app"]).optional() }),
  quickMessages: z.array(z.string().trim().min(1).max(30)).max(8).optional(),
});

/** Configurações globais (visual, teclado, modo de pontuação) para todos os aparelhos. */
export const getGlobalSettings = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = await db();
  const { data } = await supabase.from("app_settings").select("key, value").in("key", ["ui", "ai"]);
  const ui = uiSchema.partial().safeParse(data?.find((r) => r.key === "ui")?.value ?? {});
  const ai = devOverridesSchema.safeParse(data?.find((r) => r.key === "ai")?.value ?? undefined);
  const result = ui.success ? ui.data : {};
  const mode = ai.success ? ai.data?.scoringMode : undefined;
  return { ...result, scoringMode: mode ?? result.scoringMode ?? "fixed" };
});

export const saveAiSettings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ dev: devOverridesSchema, ui: uiSchema.optional() }).parse(input))
  .handler(async ({ data }) => {
    const dev = await resolveDevOverrides(data.dev);
    if (!dev) throw new Error("Só o desenvolvedor pode salvar as configurações");
    const { token: _t, ...value } = dev;
    const supabase = await db();
    const { error } = await supabase.from("app_settings").upsert({ key: "ai", value, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar as configurações");
    if (data.ui) {
      const { error: uiError } = await supabase
        .from("app_settings")
        .upsert({ key: "ui", value: { ...data.ui, scoringMode: value.scoringMode ?? data.ui.scoringMode }, updated_at: new Date().toISOString() });
      if (uiError) throw new Error("Não foi possível salvar o visual");
    }
    return { ok: true as const };
  });

export const testJudgment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        letter: z.string().min(1).max(2),
        category: z.string().min(1).max(160),
        response: z.string().max(80),
        dev: devOverridesSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const dev = await resolveDevOverrides(data.dev ?? {});
    if (!dev) throw new Error("Só o desenvolvedor pode usar o laboratório");
    const { buildEval, clampPoints } = await import("./stop-judge.server");
    const cfg = buildEval(dev);
    const { generateJsonGemini } = await import("./ai.server");
    const started = Date.now();
    const id = "00000000-0000-0000-0000-000000000001";
    const result = await generateJsonGemini<Evaluation>({
      instructions: cfg.instructions,
      schemaName: "avaliacao_rodada",
      schema: cfg.schema,
      model: cfg.model,
      input: JSON.stringify({
        letra: data.letter.toUpperCase(),
        categorias: [data.category],
        jogadores: [{ jogador_id: id, apelido: "Testador", respostas: { [data.category]: data.response.trim() } }],
      }),
    });
    const r = result.resultados?.[0];
    return {
      pontos: data.response.trim() ? clampPoints(r?.pontos, cfg.free) : 0,
      comentario: r?.comentario ?? "A IA ficou sem palavras.",
      latencyMs: Date.now() - started,
      model: cfg.model ?? "gemini-3.6-flash",
    };
  });
