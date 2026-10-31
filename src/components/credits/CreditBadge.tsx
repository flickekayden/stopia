import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, RefreshCw, Sparkles, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { balanceTone, requestsLabel, type WalletSummary } from "@/lib/billing";
import { cn } from "@/lib/utils";

type Props = {
  status: "loading" | "ready" | "refreshing" | "error";
  summary: WalletSummary | null;
  freeCredits?: number;
  packCredits?: number;
  priceLabel?: string;
  onRetry?: () => void;
  /** Hides the buy link (e.g. on the purchase screen itself). */
  hideBuy?: boolean;
  className?: string;
};

/**
 * Reusable AI balance indicator. One credit is one AI request; only rooms you create spend it.
 * States: loading, refreshing, connection error, no wallet yet, available, low (≤3) and empty.
 */
export function CreditBadge({ status, summary, freeCredits = 20, packCredits = 20, priceLabel = "R$ 5,00", onRetry, hideBuy, className }: Props) {
  if (status === "loading") {
    return (
      <div className={cn("credit-badge", className)} role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-muted-foreground">Carregando seu saldo de IA…</span>
      </div>
    );
  }
  if (status === "error" && !summary) {
    return (
      <div className={cn("credit-badge", className)} role="status">
        <WifiOff className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm text-muted-foreground">Sem conexão para ver o saldo.</span>
        {onRetry && <Button size="sm" variant="ghost" className="h-9" onClick={onRetry}><RefreshCw /> Tentar</Button>}
      </div>
    );
  }
  if (!summary) {
    return (
      <div className={cn("credit-badge", className)} data-tone="ok" role="status">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm">
          <span className="section-label block text-primary">Solicitações de IA grátis</span>
          {requestsLabel(freeCredits)} para usar nas salas que você criar.
        </p>
      </div>
    );
  }
  const tone = balanceTone(summary.balance);
  const onlyFree = summary.purchasedTotal === 0;
  const title = onlyFree ? "Solicitações grátis" : "Seu saldo de IA";
  const value = onlyFree && summary.freeGranted > 0 ? `${summary.balance} de ${summary.freeGranted} disponíveis` : `${requestsLabel(summary.balance)} ${summary.balance === 1 ? "restante" : "restantes"}`;
  return (
    <div className={cn("credit-badge", className)} data-tone={tone} role="status" aria-live="polite">
      {tone === "ok" ? <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <AlertTriangle className="size-4 shrink-0 credit-warn" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="section-label flex items-center gap-1.5 text-primary">
          {title}
          {status === "refreshing" && <Loader2 className="size-3 animate-spin" aria-label="Atualizando saldo" />}
        </p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
        {tone === "low" && <p className="text-xs text-muted-foreground">Está acabando. As salas sem saldo jogam com o conteúdo do jogo, sem IA.</p>}
        {tone === "empty" && <p className="text-xs text-muted-foreground">Você pode liberar mais {packCredits} por {priceLabel}, pagamento único.</p>}
        {status === "error" && <p className="text-xs text-muted-foreground">Não consegui atualizar agora; este é o último saldo confirmado.</p>}
      </div>
      {!hideBuy && tone !== "ok" && (
        <Button asChild size="sm" className="h-9 shrink-0 font-bold"><Link to="/comprar">Comprar</Link></Button>
      )}
    </div>
  );
}

/** One-line host summary for the lobby: balance and how much this match may use. */
export function HostCreditLine({ balance, estimate, billed }: { balance: number | null; estimate: number; billed: boolean }) {
  if (balance === null) return null;
  if (!billed) return <p className="text-center text-xs text-muted-foreground">Esta sala não tem saldo de IA vinculado: os jogos usam o conteúdo próprio, sem IA.</p>;
  const tone = balanceTone(balance);
  return (
    <p className="credit-line flex flex-wrap items-center justify-center gap-x-2 text-center text-xs" data-tone={tone}>
      <span className="font-semibold tabular-nums">IA do mestre: {requestsLabel(balance)}</span>
      <span className="text-muted-foreground">· {estimate === 0 ? "este jogo não usa IA" : `esta partida usa até ${estimate}`}</span>
      {balance < estimate && estimate > 0 && <span className="w-full text-muted-foreground">Quando o saldo acabar, as rodadas seguem sem IA.</span>}
    </p>
  );
}
