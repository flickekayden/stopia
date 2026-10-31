import { memo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { HelpCircle, Loader2, MessageCircle, Sparkles } from "lucide-react";

import { explainAnswer } from "@/lib/explain.functions";
import { getDevToken, useDevSettings } from "@/lib/dev-settings";

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
  if (points >= 20) return "bg-gold text-primary-foreground shadow-glow";
  if (points >= 15) return "bg-primary/15 text-primary ring-1 ring-primary/40";
  if (points >= 10) return "bg-success/15 text-success ring-1 ring-success/35";
  if (points >= 5) return "bg-secondary text-foreground ring-1 ring-border";
  return "bg-destructive/15 text-destructive ring-1 ring-destructive/35";
}

export function answerCardId(data: Pick<AnswerCardData, "roundId" | "category" | "playerId">) {
  return `answer-${data.roundId}-${data.playerId}-${encodeURIComponent(data.category)}`;
}

export const AnswerCard = memo(function AnswerCard({
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
  // Free-form AI explanations are not tied to any room balance, so only administrators can request them.
  const { isDev } = useDevSettings();
  const [explanation, setExplanation] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explanationError, setExplanationError] = useState(false);
  const requestInFlight = useRef(false);
  const verify = async () => {
    if (requestInFlight.current || explanation) return;
    requestInFlight.current = true;
    setExplanationError(false);
    setLoading(true);
    try {
      const r = await explain({
        data: {
          category: data.category,
          response: data.response.slice(0, 80),
          points: data.points,
          comment: data.comment.slice(0, 300),
          token: getDevToken(),
        },
      });
      setExplanation(r.text);
    } catch {
      setExplanationError(true);
    } finally {
      setLoading(false);
      requestInFlight.current = false;
    }
  };
  return (
    <div
      id={compact ? undefined : answerCardId(data)}
      className={cn(
        "answer-card border border-border/70 bg-card transition-shadow",
        compact ? "rounded-lg p-3" : "rounded-lg p-4",
        highlighted && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        superCreative && "super-creative-answer border-gold",
        onClick && "cursor-pointer",
      )}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-balance-safe text-xs font-semibold text-muted-foreground">
            <span className="text-foreground/85">{data.playerName}</span> · {data.category}
          </p>
          <p className={cn("mt-0.5 break-words text-balance-safe font-bold", compact ? "text-sm" : "text-xl leading-snug", !data.response.trim() && "font-medium text-muted-foreground")}>
            {data.response.trim() ? data.response : "— em branco —"}
          </p>
        </div>
        <span
          aria-label={`${data.points} pontos`}
          className={cn(
            "flex shrink-0 flex-col items-center justify-center rounded-lg font-display leading-none tabular-nums",
            compact ? "min-w-10 px-2 py-1 text-lg" : "points-badge min-w-14 px-2.5 py-2 text-2xl",
            pointsStyle(data.points)
          )}
        >
          {data.points}
          {!compact && <span className="mt-0.5 font-sans text-[0.625rem] font-bold uppercase tracking-wider opacity-80" aria-hidden="true">pts</span>}
        </span>
      </div>
      {!compact && <p className={cn("mt-2 inline-flex items-center gap-1.5 text-xs font-semibold", !data.response.trim() ? "text-muted-foreground" : data.points === 0 ? "text-destructive" : "text-success")}><span className="size-1.5 rounded-full bg-current" aria-hidden="true" />{!data.response.trim() ? "Em branco" : data.points === 0 ? "Inválida" : "Resposta pontuada"}</p>}
      {data.comment && (
        <p className="mt-3 break-words text-sm italic leading-relaxed text-muted-foreground text-balance-safe">
          “{data.comment}”
        </p>
      )}
      {superCreative && (
        <div className="mt-2 flex items-center gap-1 text-xs font-bold text-gold">
          <Sparkles className="size-4" /> SUPER CRIATIVA
        </div>
      )}
      {!compact && (
        <div className="answer-actions">
          {isDev && <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start whitespace-nowrap px-0 text-muted-foreground"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              void verify();
            }}
          >
            {loading ? <Loader2 className="animate-spin" /> : <HelpCircle />} {loading ? "Consultando..." : explanation ? "Explicação da IA" : explanationError ? "Tentar explicação novamente" : "Entender pontuação"}
          </Button>}
          {explanationError && <p role="alert" className="mt-1 text-sm text-destructive">Não foi possível explicar agora. Você pode tentar novamente.</p>}
          {explanation && (
            <p
              className="mt-1 break-words rounded-lg bg-secondary p-2 text-xs text-balance-safe"
              role="status"
              aria-live="polite"
            >
              {explanation}
            </p>
          )}
          {onQuote && <Button type="button" variant="ghost" size="sm" className="justify-start whitespace-nowrap px-0 text-muted-foreground" onClick={(event) => { event.stopPropagation(); onQuote(data); }}><MessageCircle /> Reagir / comentar</Button>}
        </div>
      )}
      {onQuote && compact && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start px-0 text-primary"
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
}, (previous, next) =>
  previous.compact === next.compact &&
  previous.highlighted === next.highlighted &&
  previous.onQuote === next.onQuote &&
  previous.onClick === next.onClick &&
  previous.data.roundId === next.data.roundId &&
  previous.data.category === next.data.category &&
  previous.data.playerId === next.data.playerId &&
  previous.data.playerName === next.data.playerName &&
  previous.data.response === next.data.response &&
  previous.data.points === next.data.points &&
  previous.data.comment === next.data.comment
);
