import { Link } from "@tanstack/react-router";
import { AlertTriangle, Gift, Loader2, RefreshCw, Sparkles, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { balanceTone, type WalletSummary } from "@/lib/billing";
import { bonusMessage } from "@/lib/signup-bonus";
import { cn } from "@/lib/utils";

type Props = {
  status: "loading" | "ready" | "refreshing" | "error";
  summary: WalletSummary | null;
  freeCredits?: number | undefined;
  packCredits?: number | undefined;
  priceLabel?: string | undefined;
  onRetry?: (() => void) | undefined;
  /** Hides the buy link (e.g. on the purchase screen itself). */
  hideBuy?: boolean | undefined;
  className?: string | undefined;
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
        <Gift className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="section-label text-primary">Ganhe {freeCredits} créditos de IA grátis criando sua conta!</p>
          <p className="text-sm">Crie sua conta gratuitamente e receba {freeCredits} créditos de IA para experimentar os recursos inteligentes do Stopia.</p>
        </div>
        <Button asChild size="sm" className="h-9 shrink-0 font-bold"><Link to="/entrar" search={{ modo: "criar" }}>Criar conta</Link></Button>
      </div>
    );
  }
  if (summary.kind === "guest") {
    // Legacy guest balance: preserved, but only usable once it moves into an account.
    return (
      <div className={cn("credit-badge", className)} data-tone="low" role="status">
        <Gift className="size-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="section-label text-primary">Saldo de convidado guardado</p>
          <p className="text-sm font-semibold tabular-nums">{summary.balance} {summary.balance === 1 ? "crédito" : "créditos"} de IA neste aparelho</p>
          <p className="text-xs text-muted-foreground">A IA agora é só para contas. Entre ou crie sua conta neste aparelho para levar este saldo junto, sem perder nada.</p>
        </div>
        <Button asChild size="sm" className="h-9 shrink-0 font-bold"><Link to="/entrar">Entrar</Link></Button>
      </div>
    );
  }
  const tone = balanceTone(summary.balance);
  const onlyFree = summary.purchasedTotal === 0;
  const title = onlyFree ? "Créditos de IA grátis" : "Seu saldo de IA";
  const value = onlyFree && summary.freeGranted > 0 ? `${summary.balance} de ${summary.freeGranted} disponíveis` : `${summary.balance} ${summary.balance === 1 ? "crédito restante" : "créditos restantes"}`;
  const bonusNote = summary.freeGranted === 0 ? bonusMessage(summary.bonus, freeCredits) : null;
  return (
    <div className={cn("credit-badge", className)} data-tone={tone} role="status" aria-live="polite">
      {tone === "ok" ? <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" /> : <AlertTriangle className="size-4 shrink-0 credit-warn" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="section-label flex items-center gap-1.5 text-primary">
          {title}
          {status === "refreshing" && <Loader2 className="size-3 animate-spin" aria-label="Atualizando saldo" />}
        </p>
        <p className="text-sm font-semibold tabular-nums">{value}</p>
        {bonusNote && <p className="text-xs text-muted-foreground">{bonusNote}</p>}
        {tone === "low" && <p className="text-xs text-muted-foreground">Está acabando. As salas sem saldo jogam com o conteúdo do jogo, sem IA.</p>}
        {tone === "empty" && <p className="text-xs text-muted-foreground">Você pode liberar mais {packCredits} créditos de IA por {priceLabel}, pagamento único.</p>}
        {status === "error" && <p className="text-xs text-muted-foreground">Não consegui atualizar agora; este é o último saldo confirmado.</p>}
      </div>
      {!hideBuy && tone !== "ok" && (
        <Button asChild size="sm" className="h-9 shrink-0 font-bold"><Link to="/comprar">Comprar</Link></Button>
      )}
    </div>
  );
}

/** One-line host summary for the lobby: balance and how much this match may use. */
export function HostCreditLine({ balance, estimate, billed, stop, onUnlock }: { balance: number | null; estimate: number; billed: boolean; stop?: boolean; onUnlock?: () => void }) {
  if (balance === null) return null;
  if (!billed) {
    if (estimate === 0) return <p className="text-center text-xs text-muted-foreground">Este jogo não usa IA: dá para jogar sem conta.</p>;
    return (
      <div className="credit-line flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-xs" data-tone="low">
        <span className="text-muted-foreground">{stop ? "O Stop precisa da IA para julgar." : "Sem conta, este jogo segue com o conteúdo próprio, sem IA."}</span>
        {onUnlock && <Button type="button" variant="link" className="h-auto p-0 text-xs font-bold" onClick={onUnlock}><Gift className="size-3.5" /> Ganhe 20 créditos de IA grátis</Button>}
      </div>
    );
  }
  const tone = balanceTone(balance);
  return (
    <p className="credit-line flex flex-wrap items-center justify-center gap-x-2 text-center text-xs" data-tone={tone}>
      <span className="font-semibold tabular-nums">IA do mestre: {balance} {balance === 1 ? "crédito" : "créditos"}</span>
      <span className="text-muted-foreground">· {estimate === 0 ? "este jogo não usa IA" : `esta partida usa até ${estimate}`}</span>
      {balance < estimate && estimate > 0 && (
        <span className="w-full text-muted-foreground">
          {stop
            ? balance < 1 ? "O Stop precisa da IA para julgar: compre um pacote ou escolha outro jogo." : "O saldo pode acabar antes da última rodada do Stop."
            : "Quando o saldo acabar, as rodadas seguem sem IA."}
        </span>
      )}
    </p>
  );
}
