import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Loader2, MessageCircle, Sparkles } from "lucide-react";

import { explainAnswer } from "@/lib/explain.functions";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AnswerCardData = {
  roundId: string;
  category: string;
  playerId: string;
  playerName: string;
  response: string;
  points: number;
  comment: string;
};

function pointsStyle(points: number) {
  if (points >= 20) return "bg-gold text-primary-foreground";
  if (points >= 15) return "bg-accent text-accent-foreground";
  if (points >= 10) return "bg-success/20 text-success";
  if (points >= 5) return "bg-secondary text-muted-foreground";
  return "bg-destructive/20 text-destructive";
}

export function answerCardId(data: Pick<AnswerCardData, "roundId" | "category" | "playerId">) {
  return `answer-${data.roundId}-${data.playerId}-${encodeURIComponent(data.category)}`;
}

export function AnswerCard({
  data,
  compact = false,
  highlighted = false,
  onQuote,
  onClick,
}: {
  data: AnswerCardData;
  compact?: boolean;
  highlighted?: boolean;
  onQuote?: (data: AnswerCardData) => void;
  onClick?: () => void;
}) {
  const superCreative = data.points >= 20;
  const explain = useServerFn(explainAnswer);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const verify = async () => {
    if (loading || explanation) return;
    setLoading(true);
    try {
      const r = await explain({ data: { category: data.category, response: data.response.slice(0, 80), points: data.points, comment: data.comment.slice(0, 300) } });
      setExplanation(r.text);
    } catch {
      setExplanation("Não foi possível explicar agora. Tente de novo.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div
      id={compact ? undefined : answerCardId(data)}
      className={cn(
        "border border-border bg-card transition-shadow",
        compact ? "rounded-lg p-3" : "rounded-2xl p-4",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        superCreative && "super-creative-answer border-gold",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (event) => event.key === "Enter" && onClick() : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {data.playerName} · {data.category}
          </p>
          <p className={cn("text-balance-safe break-words font-bold", compact ? "text-sm" : "text-lg")}>
            {data.response.trim() ? data.response : "— em branco —"}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-lg px-2 py-1 font-display", compact ? "text-base" : "text-xl", pointsStyle(data.points))}>
          {data.points}
        </span>
      </div>
      {data.comment && (
        <p className="text-balance-safe mt-2 break-words text-xs text-muted-foreground italic">“{data.comment}”</p>
      )}
      {superCreative && (
        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-gold">
          <Sparkles className="size-4" /> SUPER CRIATIVA
        </div>
      )}
      {!compact && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 w-full justify-center"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              void verify();
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : <HelpCircle />} {explanation ? "Explicação da IA" : "Verificar pontuação"}
          </Button>
          {explanation && (
            <p className="text-balance-safe mt-1 break-words rounded-lg bg-secondary p-2 text-xs">{explanation}</p>
          )}
        </>
      )}
      {onQuote && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full justify-center text-primary"
          onClick={(event) => {
            event.stopPropagation();
            onQuote(data);
          }}
        >
          <MessageCircle /> Reagir / comentar
        </Button>
      )}
    </div>
  );
}