import { ChevronDown, Scale } from "lucide-react";
import { useState } from "react";

import { useEffectiveDevSettings } from "@/lib/dev-settings";

const RULES = [
  { points: 0, label: "Inválida ou em branco", example: "Resposta vazia, repetida na mesma categoria ou que não vale." },
  { points: 5, label: "Fraca ou repetida", example: "Vale, mas outro jogador escreveu a mesma coisa." },
  { points: 10, label: "Válida comum", example: "Resposta correta e óbvia." },
  { points: 15, label: "Boa e rara", example: "Correta e pouco lembrada pelos outros." },
  { points: 20, label: "Super criativa", example: "A resposta que ninguém mais pensou." },
] as const;

const FREE_RULES = [
  { points: "0", label: "Inválida ou em branco", example: "Resposta vazia, com letra errada ou fora da categoria." },
  { points: "1–9", label: "Fraca ou repetida", example: "Vale, mas é óbvia demais ou outro jogador escreveu igual." },
  { points: "10–14", label: "Válida", example: "Resposta correta; quanto menos comum, mais pontos." },
  { points: "15–18", label: "Criativa", example: "Rara, engraçada ou inesperada." },
  { points: "19–20", label: "Genial", example: "A sacada que ninguém mais pensou." },
] as const;

export function ScoringRules() {
  const [open, setOpen] = useState(false);
  const free = useEffectiveDevSettings().scoringMode === "free";
  const rules = free ? FREE_RULES : RULES;

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-display text-xl">
          <Scale className="size-5 text-primary" />
          Como a IA pontua
        </span>
        <ChevronDown
          className={`size-5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <ul className="mt-4 space-y-2">
          {free && (
            <li className="rounded-2xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
              <p className="font-semibold">Pontuação livre ativada</p>
              <p className="text-muted-foreground">A IA pode dar qualquer nota de 0 a 20 (ex.: 7, 13, 18), conforme a qualidade da resposta.</p>
            </li>
          )}
          {rules.map((rule) => (
            <li key={rule.points} className="flex items-start gap-3 rounded-2xl bg-secondary px-4 py-3">
              <span className="mt-0.5 flex h-8 w-12 shrink-0 items-center justify-center rounded-xl bg-primary font-display text-sm text-primary-foreground">
                {rule.points}
              </span>
              <div>
                <p className="font-semibold">{rule.label}</p>
                <p className="text-sm text-muted-foreground">{rule.example}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
