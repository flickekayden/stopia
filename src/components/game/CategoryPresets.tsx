import { Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUILTIN_CATEGORY_PRESETS, mergeCategories } from "@/lib/category-presets";
import { DEFAULT_CATEGORIES } from "@/lib/game";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteCategoryPreset,
  getDeveloperStatus,
  updateCategoryPreset,
} from "@/lib/room-admin.functions";

type Preset = { id: string; name: string; categories: string[] };

export function CategoryPresets({
  categories,
  onApply,
}: {
  categories: string[];
  onApply: (list: string[]) => Promise<boolean>;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");
  const [merging, setMerging] = useState(false);
  const [applying, setApplying] = useState(false);
  const remove = useServerFn(deleteCategoryPreset);
  const devStatus = useServerFn(getDeveloperStatus);
  const updatePreset = useServerFn(updateCategoryPreset);

  async function apply(preset: Preset) {
    setApplying(true);
    try {
      const list = merging ? mergeCategories(categories, preset.categories) : [...preset.categories];
      if (await onApply(list)) toast.success(`Lista "${preset.name}" ${merging ? "mesclada" : "aplicada"}`);
    } catch {
      toast.error("Não consegui aplicar a lista");
    } finally {
      setApplying(false);
    }
  }

  async function load() {
    const { data } = await supabase
      .from("category_presets")
      .select("id, name, categories")
      .order("created_at", { ascending: false });
    setPresets(data ?? []);
  }

  useEffect(() => {
    void load();
    devStatus()
      .then((r) => setIsDev(r.unlocked))
      .catch(() => setIsDev(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const value = name.trim().slice(0, 40);
    if (!value) { toast.error("Dê um nome para a lista"); return; }
    setSaving(true);
    const { error } = await supabase.from("category_presets").insert({ name: value, categories });
    setSaving(false);
    if (error) { toast.error("Não consegui salvar a lista"); return; }
    setName("");
    toast.success("Lista salva para todos!");
    void load();
  }

  async function del(p: Preset) {
    if (!window.confirm(`Apagar a lista "${p.name}"?`)) return;
    try {
      let res = await remove({ data: { presetId: p.id } });
      if (res.needsPassword) {
        const password = window.prompt("Senha de desenvolvedor");
        if (!password) return;
        res = await remove({ data: { presetId: p.id, password } });
        if (res.needsPassword) { toast.error("Senha incorreta"); return; }
        setIsDev(true);
      }
      toast.success("Lista apagada");
      void load();
    } catch {
      toast.error("Não foi possível apagar a lista");
    }
  }

  function startEdit(p: Preset) {
    setEditingId(p.id);
    setDraft([...p.categories]);
    setNewItem("");
  }

  function addItem() {
    const v = newItem.trim();
    if (!v) return;
    if (draft.some((c) => c.toLowerCase() === v.toLowerCase())) {
      toast.error("Essa categoria já está na lista");
      return;
    }
    setDraft([...draft, v]);
    setNewItem("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const list = draft.map((c) => c.trim()).filter(Boolean);
    if (list.length === 0) { toast.error("Precisa de pelo menos uma categoria"); return; }
    try {
      await updatePreset({ data: { presetId: editingId, categories: list } });
      toast.success("Lista atualizada");
      setEditingId(null);
      void load();
    } catch {
      toast.error("Não foi possível salvar a lista");
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3" aria-labelledby="preset-title">
        <h2 id="preset-title" className="font-display text-xl">Presets de categorias</h2>
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Como carregar a lista">
          <Button variant={merging ? "secondary" : "default"} aria-pressed={!merging} onClick={() => setMerging(false)}>Substituir</Button>
          <Button variant={merging ? "default" : "secondary"} aria-pressed={merging} onClick={() => setMerging(true)}>Mesclar</Button>
        </div>
        <div className="space-y-2">
          {[{ id: "builtin-default", name: "Padrão base", categories: DEFAULT_CATEGORIES }, ...BUILTIN_CATEGORY_PRESETS].map((preset) => (
            <Button key={preset.id} variant="secondary" disabled={applying} onClick={() => void apply(preset)} className="h-auto min-h-14 w-full justify-between gap-3 whitespace-normal px-4 py-3 text-left">
              <span className="min-w-0 break-words">{preset.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{preset.categories.length}</span>
            </Button>
          ))}
        </div>
      </section>
    <section className="rounded-3xl border border-border bg-card p-5">
      <h2 className="font-display text-xl">Listas salvas</h2>
      <div className="mt-3 flex items-center gap-2">
        <Input
          value={name}
          maxLength={40}
          placeholder="Nome da lista atual"
          onChange={(e) => setName(e.target.value)}
          className="h-12 rounded-2xl"
        />
        <Button className="size-12 shrink-0 rounded-2xl" size="icon" disabled={saving} onClick={save}>
          <Save className="size-5" />
        </Button>
      </div>
      {presets.length > 0 && (
        <ul className="mt-3 space-y-2">
          {presets.map((p) => (
            <li key={p.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={applying}
                  onClick={() => void apply(p)}
                  className="h-auto min-w-0 flex-1 flex-col items-start whitespace-normal rounded-2xl px-4 py-3 text-left"
                >
                  <span className="font-semibold">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">{p.categories.length} categorias</span>
                </Button>
                {isDev && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-12 shrink-0 rounded-2xl"
                    aria-label="Editar lista"
                    onClick={() => (editingId === p.id ? setEditingId(null) : startEdit(p))}
                  >
                    <Pencil className="size-5" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-12 shrink-0 rounded-2xl text-destructive"
                  onClick={() => void del(p)}
                >
                  <Trash2 className="size-5" />
                </Button>
              </div>

              {isDev && editingId === p.id && (
                <div className="space-y-2 rounded-2xl border border-border p-3">
                  {draft.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={c}
                        maxLength={60}
                        onChange={(e) => {
                          const next = [...draft];
                          next[i] = e.target.value;
                          setDraft(next);
                        }}
                        className="h-11 rounded-2xl"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-11 shrink-0 rounded-2xl text-destructive"
                        onClick={() => setDraft(draft.filter((_, j) => j !== i))}
                      >
                        <X className="size-5" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newItem}
                      maxLength={60}
                      placeholder="Adicionar categoria"
                      onChange={(e) => setNewItem(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") addItem(); }}
                      className="h-11 rounded-2xl"
                    />
                    <Button className="size-11 shrink-0 rounded-2xl" size="icon" aria-label="Adicionar" onClick={addItem}>
                      <Plus className="size-5" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="h-11 flex-1 rounded-2xl" onClick={() => setEditingId(null)}>
                      Cancelar
                    </Button>
                    <Button className="h-11 flex-1 rounded-2xl" onClick={() => void saveEdit()}>
                      <Check className="mr-2 size-5" /> Salvar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
    </div>
  );
}
