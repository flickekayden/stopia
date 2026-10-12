import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const explainAnswer = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        category: z.string().max(160),
        response: z.string().max(80),
        points: z.number().int().min(0).max(20),
        comment: z.string().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    try {
      const { generateJsonGemini } = await import("./ai.server");
      const out = await generateJsonGemini<{ explanation: string }>({
        instructions:
          "Você é o juiz ácido e debochado do jogo Stop (Adedonha). Explique em português do Brasil, em no máximo 3 frases curtas, se a resposta é válida para a categoria e por que recebeu essa pontuação (0 inválida/branco, 5 repetida ou fraca, 10 válida comum, 15 boa/rara, 20 super criativa). Mantenha o tom sarcástico, mas seja claro no motivo.",
        input: `Categoria: ${data.category}\nResposta: ${data.response || "(em branco)"}\nPontos: ${data.points}\nComentário do juiz: ${data.comment}`,
        schemaName: "explanation",
        schema: {
          type: "object",
          properties: { explanation: { type: "string" } },
          required: ["explanation"],
          additionalProperties: false,
        },
      });
      return { ok: true as const, text: out.explanation };
    } catch (e) {
      return { ok: false as const, text: e instanceof Error ? e.message : "Não foi possível explicar agora." };
    }
  });
