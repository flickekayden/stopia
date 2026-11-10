import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminAddAiKey, adminListAiKeys, adminTestAiKey, adminUpdateAiKey } from "@/lib/admin.functions";
import { getDevToken } from "@/lib/dev-settings";
import { KEY_STATUS_LABELS, type KeyStatus } from "@/lib/gemini-keys";

type Row = Awaited<ReturnType<typeof adminListAiKeys>>[number];
const TEST_MODELS = ["gemini-2.5-flash", "gemini-3.6-flash", "gemini-3.8-flash"] as const;

/** Admin manager for the Gemini key pool: add, prioritise free/paid, test per model, reset limits. */
export function GeminiKeysAdmin() {
  const listFn = useServerFn(adminListAiKeys);
  const addFn = useServerFn(adminAddAiKey);
  const updFn = useServerFn(adminUpdateAiKey);
  const testFn = useServerFn(adminTestAiKey);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [tier, setTier] = useState<"free" | "paid">("free");
  const [model, setModel] = useState<(typeof TEST_MODELS)[number]>("gemini-2.5-flash");

  const load = useCallback(async () => {
    try { setRows(await listFn({ data: { token: getDevToken() } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falha ao carregar chaves."); }
  }, [listFn]);
  useEffect(() => { void load(); }, [load]);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Falhou."); }
    finally { setBusy(null); }
  }

  const add = () => run("add", async () => {
    await addFn({ data: { token: getDevToken(), label, apiKey: key, tier } });
    setLabel(""); setKey(""); toast.success("Chave adicionada.");
  });

  const test = (id: string) => run(id, async () => {
    const r = await testFn({ data: { token: getDevToken(), id, model } });
    if (r.ok) toast.success(`OK em ${(r.ms / 1000).toFixed(1)}s com ${model}`);
    else toast.error(`Falhou (${r.status}): ${r.detail.slice(0, 140)}`);
  });

  const upd = (id: string, action: "enable" | "disable" | "reset" | "delete" | "free" | "paid") =>
    run(id, () => updFn({ data: { token: getDevToken(), id, action } }));

  return (
    <section className="space-y-3 rounded-2xl border border-border p-3" aria-labelledby="keys-title">
      <h3 id="keys-title" className="font-bold">Chaves do Gemini</h3>
      <p className="text-xs text-muted-foreground">Ordem de uso: grátis primeiro, depois pagas. Ao atingir limite, ficar sem crédito ou dar erro, a próxima chave assume.</p>

      <div className="space-y-2">
        <Input placeholder="Nome (ex: Grátis 1)" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />
        <Input placeholder="AQ.Ab8… ou AIza…" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" type="password" />
        <div className="flex gap-2">
          <Button size="sm" variant={tier === "free" ? "default" : "outline"} onClick={() => setTier("free")}>Grátis</Button>
          <Button size="sm" variant={tier === "paid" ? "default" : "outline"} onClick={() => setTier("paid")}>Paga</Button>
          <Button size="sm" className="ml-auto" disabled={!label.trim() || key.trim().length < 20 || busy === "add"} onClick={add}>
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
          </Button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs">
        Modelo de teste
        <select className="rounded-md border border-border bg-background px-2 py-1" value={model} onChange={(e) => setModel(e.target.value as typeof model)}>
          {TEST_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
      </label>

      {rows.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma chave cadastrada — o jogo usa a chave padrão do servidor.</p>}
      <ul className="space-y-2">
        {rows.map((r) => {
          const resting = r.cooldown_until && Date.parse(r.cooldown_until) > Date.now();
          const st = (resting ? r.status : "ok") as KeyStatus;
          return (
            <li key={r.id} className="space-y-1 rounded-xl border border-border p-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.label} <span className="text-xs text-muted-foreground">({r.tier === "free" ? "grátis" : "paga"})</span></span>
                <span className={st === "ok" && r.enabled ? "text-xs text-primary" : "text-xs text-destructive"}>
                  {r.enabled ? KEY_STATUS_LABELS[st] ?? r.status : "Desativada"}
                </span>
              </div>
              <div className="font-mono text-xs text-muted-foreground">{r.masked} · {r.uses} usos</div>
              {resting && <div className="text-xs text-muted-foreground">Volta {new Date(r.cooldown_until!).toLocaleString("pt-BR")}</div>}
              {r.last_error && st !== "ok" && <div className="line-clamp-2 text-xs text-destructive">{r.last_error}</div>}
              <div className="flex flex-wrap gap-1 pt-1">
                <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => test(r.id)}>{busy === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Testar"}</Button>
                {resting && <Button size="sm" variant="outline" onClick={() => upd(r.id, "reset")}>Liberar</Button>}
                <Button size="sm" variant="outline" onClick={() => upd(r.id, r.tier === "free" ? "paid" : "free")}>{r.tier === "free" ? "Marcar paga" : "Marcar grátis"}</Button>
                <Button size="sm" variant="outline" onClick={() => upd(r.id, r.enabled ? "disable" : "enable")}>{r.enabled ? "Desativar" : "Ativar"}</Button>
                <Button size="sm" variant="destructive" onClick={() => { if (confirm("Excluir esta chave?")) void upd(r.id, "delete"); }}>Excluir</Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
