import { useState } from "react";
import { Plus, Sparkles, RefreshCw, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import {
  usePromptsV2,
  useCreatePromptV2,
  useDeletePromptV2,
  useGenerateVariants,
  useSeedPromptsV2,
  usePrioritizePrompts,
} from "@/hooks/usePromptsV2";
import { useGeneratePage } from "@/hooks/usePages";
import type { PromptV2 } from "@covable/shared";

const INTENT_COLORS: Record<string, string> = {
  comparison: "bg-blue-500/15 text-blue-400",
  best_of: "bg-purple-500/15 text-purple-400",
  how_to: "bg-green-500/15 text-green-400",
  definition: "bg-yellow-500/15 text-yellow-400",
  recommendation: "bg-orange-500/15 text-orange-400",
};

export function PromptLab() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;

  const { data: prompts, isLoading } = usePromptsV2(brandId);
  const createPrompt = useCreatePromptV2();
  const deletePrompt = useDeletePromptV2();
  const generateVariants = useGenerateVariants();
  const seedPrompts = useSeedPromptsV2();
  const prioritize = usePrioritizePrompts();
  const generatePage = useGeneratePage();

  const [showCreate, setShowCreate] = useState(false);
  const [newText, setNewText] = useState("");
  const [newIntent, setNewIntent] = useState<PromptV2["intent"]>("recommendation");
  const [newVertical, setNewVertical] = useState("");
  const [sortBy, setSortBy] = useState<"priority_score" | "gap_score" | "created_at">("priority_score");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sorted = [...(prompts ?? [])].sort((a, b) => {
    const av = a[sortBy] ?? 0;
    const bv = b[sortBy] ?? 0;
    return sortDir === "desc"
      ? String(bv).localeCompare(String(av))
      : String(av).localeCompare(String(bv));
  });

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(col); setSortDir("desc"); }
  }

  function handleCreate() {
    if (!brandId || !newText.trim()) return;
    createPrompt.mutate({
      brand_id: brandId,
      text: newText.trim(),
      intent: newIntent,
      vertical: newVertical || undefined,
      modifiers: [],
      expected_entities: [],
    }, {
      onSuccess: () => {
        setNewText("");
        setNewIntent("recommendation");
        setNewVertical("");
        setShowCreate(false);
      },
    });
  }

  const SortIcon = ({ col }: { col: typeof sortBy }) =>
    sortBy === col
      ? sortDir === "desc" ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />
      : null;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Prompt Lab</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Prompts ranked by citation gap — highest gap = biggest opportunity
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => brandId && prioritize.mutate(brandId)}
            disabled={!brandId || prioritize.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${prioritize.isPending ? "animate-spin" : ""}`} />
            Recalculate
          </button>
          <button
            onClick={() => brandId && seedPrompts.mutate(brandId)}
            disabled={!brandId || seedPrompts.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Import from monitoring
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add prompt
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
          <h3 className="text-sm font-medium">New Prompt</h3>
          <textarea
            className="w-full bg-background border border-border rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            placeholder="What are the best project management tools for remote teams in 2025?"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              value={newIntent}
              onChange={(e) => setNewIntent(e.target.value as PromptV2["intent"])}
              className="flex-1 bg-background border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
            >
              <option value="recommendation">Recommendation</option>
              <option value="comparison">Comparison</option>
              <option value="best_of">Best of</option>
              <option value="how_to">How to</option>
              <option value="definition">Definition</option>
            </select>
            <input
              type="text"
              placeholder="Vertical (e.g. project management)"
              value={newVertical}
              onChange={(e) => setNewVertical(e.target.value)}
              className="flex-[2] bg-background border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!newText.trim() || createPrompt.isPending}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading prompts...</div>
      ) : !sorted.length ? (
        <div className="text-center py-12 space-y-2">
          <p className="text-sm text-muted-foreground">No prompts yet.</p>
          <p className="text-xs text-muted-foreground">
            Import from your monitoring prompts or add one manually.
          </p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Prompt</th>
                <th
                  className="px-4 py-2.5 font-medium text-muted-foreground text-right cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("gap_score")}
                >
                  <span className="flex items-center gap-1 justify-end">
                    Gap <SortIcon col="gap_score" />
                  </span>
                </th>
                <th
                  className="px-4 py-2.5 font-medium text-muted-foreground text-right cursor-pointer hover:text-foreground"
                  onClick={() => toggleSort("priority_score")}
                >
                  <span className="flex items-center gap-1 justify-end">
                    Priority <SortIcon col="priority_score" />
                  </span>
                </th>
                <th className="px-4 py-2.5 font-medium text-muted-foreground">Intent</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((p) => (
                <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 max-w-sm">
                    <p className="truncate">{p.text}</p>
                    {p.vertical && (
                      <p className="text-xs text-muted-foreground mt-0.5">{p.vertical}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <GapBar value={p.gap_score} />
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    {(p.priority_score * 100).toFixed(0)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${INTENT_COLORS[p.intent] ?? ""}`}
                    >
                      {p.intent}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => generateVariants.mutate(p.id)}
                        disabled={generateVariants.isPending}
                        title="Generate variants"
                        className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                      {brandId && (
                        <button
                          onClick={() => generatePage.mutate({ promptId: p.id, brandId })}
                          disabled={generatePage.isPending}
                          title="Generate page"
                          className="px-2 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          Generate
                        </button>
                      )}
                      <button
                        onClick={() => deletePrompt.mutate(p.id)}
                        disabled={deletePrompt.isPending}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GapBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-red-500" : pct >= 40 ? "bg-yellow-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}
