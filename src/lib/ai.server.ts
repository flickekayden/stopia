type JsonSchema = Record<string, unknown>;

function gatewayError(status: number, detail: string): Error {
  if (status === 402) {
    return new Error("Os créditos de IA acabaram. Recarregue para liberar as avaliações e a zoeira final.");
  }
  if (status === 429) {
    return new Error("A IA está sobrecarregada agora. Espere alguns segundos e tente de novo.");
  }
  return new Error(`Falha na IA (${status}): ${detail.slice(0, 300)}`);
}

const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Avaliação usando a chave própria do Gemini (GEMINI_API_KEY).
 * Mesmo prompt/schema já usado no jogo. Se a chave não estiver configurada,
 * cai de volta no modelo Gemini servido pela plataforma.
 */
export async function generateJsonGemini<T>(params: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
  model?: string | undefined;
}): Promise<T> {
  // Key pool from the admin panel: free keys first, failover to the next on limit/credit/error.
  const pool = await import("./gemini-pool.server");
  const keys = await pool.usableKeys();
  const reasons: string[] = [];
  for (const k of keys) {
    try {
      const out = await generateJsonGoogle<T>(k.api_key, params, 3);
      void pool.markKeySuccess(k.id);
      return out;
    } catch (err) {
      if (err instanceof GeminiHttpError) {
        reasons.push(await pool.markKeyFailure(k.id, err.status, err.detail));
        continue;
      }
      throw err; // malformed response, not the key's fault
    }
  }
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (geminiKey) return generateJsonGoogle<T>(geminiKey, params);
  if (keys.length > 0) {
    const { exhaustedMessage } = await import("./gemini-keys");
    throw new Error(exhaustedMessage(reasons));
  }
  return generateJsonGatewayGemini<T>(params);
}

/** Raw Gemini HTTP failure, used by the pool to classify and rotate keys. */
export class GeminiHttpError extends Error {
  constructor(public status: number, public detail: string) {
    super(`Falha no Gemini (${status})`);
  }
}

/** Single test call for one key from the admin panel. */
export async function testGeminiKey(apiKey: string, model: string) {
  const started = Date.now();
  try {
    await generateJsonGoogle<{ ok: boolean }>(apiKey, {
      instructions: "Responda com {\"ok\": true}.",
      input: "teste",
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      model,
    }, 3);
    return { ok: true as const, ms: Date.now() - started };
  } catch (err) {
    if (err instanceof GeminiHttpError) return { ok: false as const, ms: Date.now() - started, status: err.status, detail: err.detail.slice(0, 300) };
    return { ok: false as const, ms: Date.now() - started, status: 0, detail: err instanceof Error ? err.message : "erro" };
  }
}

async function generateJsonGoogle<T>(
  apiKey: string,
  params: { instructions: string; input: string; schema: JsonSchema; model?: string | undefined },
  attempt = 0,
): Promise<T> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model ?? GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: params.instructions }] },
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${params.input}\n\nResponda SOMENTE com JSON válido seguindo exatamente este schema:\n${JSON.stringify(params.schema)}`,
              },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 1 },
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Pool calls (attempt 3) report raw failures so the next key can be tried.
    if (attempt >= 3 && (res.status === 429 || res.status >= 500 || res.status === 400 || res.status === 401 || res.status === 402 || res.status === 403)) {
      throw new GeminiHttpError(res.status, detail);
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("A chave do Gemini foi recusada. Confira se ela está correta e ativa.");
    }
    // 429/503/5xx são temporários: tenta de novo com espera crescente.
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
      return generateJsonGoogle<T>(apiKey, params, attempt + 1);
    }
    if (res.status === 429) {
      throw new Error("O Gemini atingiu o limite de uso agora. Espere alguns segundos e tente de novo.");
    }
    if (res.status >= 500) {
      throw new Error("O Gemini está sobrecarregado no momento. Tente avaliar a rodada de novo em instantes.");
    }
    throw new Error(`Falha no Gemini (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("O Gemini não retornou resposta.");
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  return JSON.parse(cleaned) as T;
}

async function generateJsonGatewayGemini<T>(params: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: params.instructions },
        { role: "user", content: `${params.input}\n\nResponda apenas com JSON válido.` },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: params.schemaName, strict: true, schema: params.schema },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw gatewayError(res.status, detail);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("A IA não retornou resposta.");
  return JSON.parse(text) as T;
}

/**
 * Single streaming call to the Lovable AI Gateway Responses API returning
 * strict JSON. Streaming is required (reasoning runs can take minutes), but we
 * consume the stream server-side and return the final parsed object.
 */
export async function generateJson<T>(params: {
  instructions: string;
  input: string;
  schemaName: string;
  schema: JsonSchema;
}): Promise<T> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "openai/gpt-6-astra",
      instructions: params.instructions,
      input: params.input,
      stream: true,
      reasoning: { effort: "low", summary: "auto" },
      text: {
        format: {
          type: "json_schema",
          name: params.schemaName,
          strict: true,
          schema: params.schema,
        },
      },
    }),
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    if (res.status === 402) {
      throw new Error("Os créditos de IA acabaram. Recarregue para liberar as avaliações e a zoeira final.");
    }
    if (res.status === 429) {
      throw new Error("A IA está sobrecarregada agora. Espere alguns segundos e tente de novo.");
    }
    throw new Error(`Falha na IA (${res.status}): ${detail.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const evt = JSON.parse(payload) as {
          type?: string;
          delta?: string;
          response?: { output_text?: string };
        };
        if (evt.type === "response.output_text.delta" && typeof evt.delta === "string") {
          text += evt.delta;
        } else if (evt.type === "response.completed" && evt.response?.output_text) {
          if (!text) text = evt.response.output_text;
        }
      } catch {
        // ignore keep-alive / non-JSON frames
      }
    }
  }

  if (!text.trim()) throw new Error("A IA não retornou resposta.");
  return JSON.parse(text) as T;
}
