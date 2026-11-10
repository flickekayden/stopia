import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminAdjustCredits, adminCreditAbuse, adminListReports, adminOverview, adminReconcile, adminSetReportStatus } from "@/lib/admin.functions";
import { REPEATED_ATTEMPTS } from "@/lib/credit-monitor";
import { getDevToken } from "@/lib/dev-settings";

type Overview = Awaited<ReturnType<typeof adminOverview>>;
type Report = Awaited<ReturnType<typeof adminListReports>>[number];
type Abuse = Awaited<ReturnType<typeof adminCreditAbuse>>;

const ABUSE_LABELS: Record<string, string> = { identity_used: "E-mail já usado", rate_limited: "Limite de rede", grant_error: "Falha na concessão" };

const REASONS: Record<string, string> = { ofensa: "Ofensa", assedio: "Assédio", spam: "Spam", conteudo_improprio: "Impróprio", outro: "Outro" };

/** Admin-only commercial overview, purchase reconciliation, audited balance corrections and reports. */
export function BusinessAdmin() {
  const overviewFn = useServerFn(adminOverview);
  const reconcileFn = useServerFn(adminReconcile);
  const adjustFn = useServerFn(adminAdjustCredits);
  const reportsFn = useServerFn(adminListReports);
  const statusFn = useServerFn(adminSetReportStatus);
  const abuseFn = useServerFn(adminCreditAbuse);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [abuse, setAbuse] = useState<Abuse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setBusy("load");
    try {
      const token = getDevToken();
      const [o, r, a] = await Promise.all([overviewFn({ data: { token } }), reportsFn({ data: { token } }), abuseFn({ data: { token } }).catch(() => null)]);
      setOverview(o);
      setReports(r);
      setAbuse(a);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível carregar.");
    } finally {
      setBusy(null);
    }
  }, [overviewFn, reportsFn, abuseFn]);

  useEffect(() => { void load(); }, [load]);

  async function reconcile() {
    setBusy("reconcile");
    try {
      const r = await reconcileFn({ data: { token: getDevToken() } });
      toast.success(`Reconciliado: ${r.confirmed} confirmadas, ${r.refunded} estornadas, ${r.consumed} liberadas na loja${r.errors.length ? `, ${r.errors.length} erros` : ""}.`);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha na reconciliação.");
    } finally {
      setBusy(null);
    }
  }

  async function adjust(event: React.FormEvent) {
    event.preventDefault();
    setBusy("adjust");
    try {
      const r = await adjustFn({ data: { token: getDevToken(), email, delta: Number(delta), reason } });
      toast.success(`Saldo ajustado. Novo saldo: ${r.balance}.`);
      setDelta(""); setReason("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível ajustar.");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(id: string, status: "resolvida" | "descartada") {
    try {
      await statusFn({ data: { token: getDevToken(), id, status } });
      setReports((list) => list.map((r) => (r.id === id ? { ...r, status } : r)));
    } catch {
      toast.error("Não foi possível atualizar a denúncia.");
    }
  }

  const stats: [string, number | string][] = overview
    ? [
        ["Saldos abertos", overview.wallets],
        ["Contas", overview.accounts],
        ["Usos de IA", overview.aiUses],
        ["Pacotes vendidos", overview.confirmed],
        ["Pendentes", overview.pending],
        ["Erros/recusados", overview.failed],
        ["Estornados", overview.refunded],
        ["Salas", overview.rooms],
        ["Denúncias abertas", overview.openReports],
      ]
    : [];

  return (
    <>
    <GeminiKeysAdmin />
    <section className="space-y-4 rounded-2xl border border-border p-3" aria-labelledby="biz-title">
      <div className="flex items-center justify-between gap-2">
        <h3 id="biz-title" className="font-bold">Negócio e moderação</h3>
        <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => void load()}>{busy === "load" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Atualizar</Button>
      </div>
      {overview && (
        <>
          <p className="text-xs text-muted-foreground">Loja Google Play: {overview.storeReady ? "configurada no servidor" : "credencial do servidor ainda não configurada"}</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {stats.map(([label, value]) => (
              <div key={label} className="rounded-xl bg-secondary p-2">
                <dt className="text-[0.625rem] font-semibold uppercase text-muted-foreground">{label}</dt>
                <dd className="font-display text-lg tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
      <Button variant="secondary" className="h-11 w-full" disabled={busy !== null || !overview?.storeReady} onClick={() => void reconcile()}>
        {busy === "reconcile" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Reconciliar pagamentos da Google Play
      </Button>

      <form onSubmit={adjust} className="space-y-2">
        <p className="section-label">Ajuste de saldo (fica registrado)</p>
        <Input type="email" required placeholder="E-mail da conta" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Input type="number" required placeholder="+/-" value={delta} onChange={(e) => setDelta(e.target.value)} />
          <Input required minLength={5} placeholder="Motivo (obrigatório)" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={busy !== null}>{busy === "adjust" && <Loader2 className="animate-spin" />} Aplicar ajuste</Button>
      </form>

      {abuse && (
        <div className="space-y-2">
          <p className="section-label">Antifraude dos créditos grátis · 14 dias</p>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {Object.entries(abuse.totals).map(([kind, t]) => (
              <div key={kind} className="rounded-xl bg-secondary p-2">
                <dt className="text-[0.625rem] font-semibold uppercase text-muted-foreground">{ABUSE_LABELS[kind] ?? kind}</dt>
                <dd className="font-display text-lg tabular-nums">{t.accounts}</dd>
                <dd className="text-[0.625rem] text-muted-foreground tabular-nums">{t.attempts} tentativas</dd>
              </div>
            ))}
          </dl>
          {abuse.latest.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum sinal de abuso.</p> : (
            <ul className="space-y-1 text-xs">
              {abuse.latest.map((e) => (
                <li key={`${e.kind}-${e.account}-${e.day}`} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2 py-1">
                  <span className="min-w-0 truncate">{ABUSE_LABELS[e.kind] ?? e.kind} · conta {e.account}…{e.detail ? ` · ${e.detail}` : ""}</span>
                  <span className={`shrink-0 tabular-nums ${e.attempts >= REPEATED_ATTEMPTS ? "font-bold text-destructive" : "text-muted-foreground"}`}>{e.day.slice(5)} · {e.attempts}×</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        <p className="section-label">Denúncias</p>
        {reports.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma denúncia.</p> : reports.map((r) => (
          <div key={r.id} className="rounded-xl border border-border p-2 text-sm">
            <p className="font-semibold">{REASONS[r.reason] ?? r.reason} · sala {r.room_code} · {r.target_nickname || "?"} <span className="text-xs text-muted-foreground">({r.status})</span></p>
            {r.excerpt && <p className="mt-1 break-words text-muted-foreground">“{r.excerpt}”</p>}
            {r.status === "aberta" && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void setStatus(r.id, "resolvida")}>Resolvida</Button>
                <Button size="sm" variant="ghost" onClick={() => void setStatus(r.id, "descartada")}>Descartar</Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
    </>
  );
}
