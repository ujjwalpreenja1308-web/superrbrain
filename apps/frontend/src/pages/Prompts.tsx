import { useState, useRef } from "react";
import { usePrompts, useUpdatePrompts, useRegeneratePrompts } from "@/hooks/useBrand";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { toast } from "sonner";
import {
  Plus,
  Save,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  RefreshCw,
  Search,
  Globe,
  X,
  Clock,
} from "lucide-react";
import type { Prompt } from "@covable/shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type LocalPrompt = {
  id?: string;
  text: string;
  is_active: boolean;
  category: string | null;
  dirty?: boolean;
};

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  best_for: { label: "Best For", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  comparison: { label: "Comparison", color: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
  reviews: { label: "Reviews", color: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  reddit_community: { label: "Reddit / Community", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  price_value: { label: "Price & Value", color: "bg-green-500/10 text-green-600 border-green-500/20" },
};

const CATEGORY_ORDER = ["best_for", "comparison", "reviews", "reddit_community", "price_value"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasSearchSignal(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    /\b(202[4-9]|203\d)\b/.test(lower) ||
    /\b(currently|right now|latest|recent|up-to-date|as of)\b/.test(lower) ||
    /\b(reddit|community says|what are people saying)\b/.test(lower) ||
    /\bcurrent pricing\b/.test(lower)
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SearchForceBadge() {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      title="Optimized to trigger live web search in AI engines"
    >
      <Globe className="h-2.5 w-2.5" />
      Web search
    </span>
  );
}

function CategoryBadge({ category }: { category: string | null }) {
  if (!category || !CATEGORY_LABELS[category]) return null;
  const { label, color } = CATEGORY_LABELS[category];
  return (
    <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  );
}

function PromptRow({
  prompt,
  idx,
  onTextChange,
  onToggle,
  onRemove,
}: {
  prompt: LocalPrompt;
  idx: number;
  onTextChange: (idx: number, value: string) => void;
  onToggle: (idx: number) => void;
  onRemove: (idx: number) => void;
}) {
  const [editing, setEditing] = useState(prompt.dirty ?? false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function stopEdit() {
    setEditing(false);
  }

  const webSearch = hasSearchSignal(prompt.text);

  return (
    <Card
      className={`transition-all duration-150 ${!prompt.is_active ? "opacity-40" : ""} ${
        editing ? "ring-1 ring-primary/30" : "hover:border-border/80"
      }`}
    >
      <CardContent className="p-3 flex items-start gap-3">
        {/* Toggle */}
        <button
          onClick={() => onToggle(idx)}
          className="shrink-0 mt-0.5 text-muted-foreground hover:text-primary transition-colors"
          title={prompt.is_active ? "Disable prompt" : "Enable prompt"}
        >
          {prompt.is_active ? (
            <ToggleRight className="h-4 w-4 text-primary" />
          ) : (
            <ToggleLeft className="h-4 w-4" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex-1 min-w-0" onClick={!editing ? startEdit : undefined}>
            {editing ? (
              <Input
                ref={inputRef}
                value={prompt.text}
                onChange={(e) => onTextChange(idx, e.target.value)}
                onBlur={stopEdit}
                onKeyDown={(e) => e.key === "Enter" && stopEdit()}
                placeholder="e.g. What is the best tool for tracking AI citations in 2026?"
                className="border-transparent bg-transparent focus-visible:border-border px-0 h-auto py-0 text-sm shadow-none w-full"
                autoComplete="off"
              />
            ) : (
              <span className="text-sm cursor-text block text-foreground leading-snug">
                {prompt.text || (
                  <span className="text-muted-foreground italic">Click to add text…</span>
                )}
              </span>
            )}
          </div>
          {/* Badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryBadge category={prompt.category} />
            {webSearch && <SearchForceBadge />}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0 mt-0.5">
          <Badge
            variant={prompt.is_active ? "default" : "outline"}
            className="text-[10px] h-5 px-1.5"
          >
            {prompt.is_active ? "Active" : "Off"}
          </Badge>
          <button
            onClick={() => onRemove(idx)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Remove prompt"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryGroup({
  category,
  prompts,
  onTextChange,
  onToggle,
  onRemove,
}: {
  category: string | null;
  prompts: { prompt: LocalPrompt; idx: number }[];
  onTextChange: (idx: number, value: string) => void;
  onToggle: (idx: number) => void;
  onRemove: (idx: number) => void;
}) {
  const label =
    category && CATEGORY_LABELS[category] ? CATEGORY_LABELS[category].label : "Uncategorized";

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
        {label}
      </p>
      {prompts.map(({ prompt, idx }) => (
        <PromptRow
          key={idx}
          prompt={prompt}
          idx={idx}
          onTextChange={onTextChange}
          onToggle={onToggle}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function Prompts() {
  const { activeBrand: brand } = useActiveBrand() as { activeBrand: (import("@covable/shared").Brand & { pending_prompts?: unknown; pending_prompts_effective_at?: string | null }) | undefined };
  const { data: prompts, isLoading, isError, error, refetch } = usePrompts(brand?.id);
  const updatePrompts = useUpdatePrompts(brand?.id ?? "");
  const regeneratePrompts = useRegeneratePrompts(brand?.id ?? "");

  const [local, setLocal] = useState<LocalPrompt[] | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const working: LocalPrompt[] =
    local ??
    (prompts?.map((p: Prompt) => ({
      id: p.id,
      text: p.text,
      is_active: p.is_active,
      category: p.category,
    })) ?? []);

  const isDirty = local !== null;
  const isRegenerating = regeneratePrompts.isPending;

  function sync(next: LocalPrompt[]) {
    setLocal(next);
  }

  function handleAdd() {
    sync([...working, { text: "", is_active: true, category: null, dirty: true }]);
  }

  function handleTextChange(idx: number, value: string) {
    sync(working.map((p, i) => (i === idx ? { ...p, text: value } : p)));
  }

  function handleToggle(idx: number) {
    sync(working.map((p, i) => (i === idx ? { ...p, is_active: !p.is_active } : p)));
  }

  function handleRemove(idx: number) {
    sync(working.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    const valid = working.filter((p) => p.text.trim());
    if (!valid.length) {
      toast.error("Add at least one prompt before saving.");
      return;
    }
    try {
      await updatePrompts.mutateAsync(
        valid.map((p) => ({
          id: p.id,
          text: p.text.trim(),
          is_active: p.is_active,
          category: p.category,
        }))
      );
      setLocal(null);
      toast.success("Changes saved — will take effect from next Monday's scan");
    } catch {
      // handled by mutation onError
    }
  }

  function handleDiscard() {
    setLocal(null);
  }

  async function handleRegenerate() {
    if (!brand?.id) return;
    if (isDirty || working.length > 0) {
      const ok = window.confirm(
        "Regenerating will replace all current prompts with AI-generated, web-search-optimized prompts. Continue?"
      );
      if (!ok) return;
    }
    try {
      await regeneratePrompts.mutateAsync();
      setLocal(null);
    } catch {
      // handled by mutation onError
    }
  }

  // ── Group by category ─────────────────────────────────────────────────────
  const grouped: Record<string, { prompt: LocalPrompt; idx: number }[]> = {};
  const uncategorized: { prompt: LocalPrompt; idx: number }[] = [];

  working.forEach((prompt, idx) => {
    const cat = prompt.category;
    if (!cat || !CATEGORY_LABELS[cat]) {
      uncategorized.push({ prompt, idx });
    } else {
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push({ prompt, idx });
    }
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const activeCount = working.filter((p) => p.is_active).length;
  const webSearchCount = working.filter((p) => hasSearchSignal(p.text)).length;

  // ── Filter ────────────────────────────────────────────────────────────────
  const filteredWorking =
    filter !== null
      ? working
          .map((p, idx) => ({ prompt: p, idx }))
          .filter(({ prompt }) =>
            filter === "web_search"
              ? hasSearchSignal(prompt.text)
              : filter === "__uncategorized"
              ? !prompt.category || !CATEGORY_LABELS[prompt.category]
              : prompt.category === filter
          )
      : null;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Prompts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            AI search queries engineered to trigger live web search in ChatGPT, Perplexity, and
            Claude — so every run captures real citations.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {isDirty && (
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRegenerate}
            disabled={isRegenerating || !brand?.id}
            title={!brand?.name ? "Complete brand onboarding first" : "Replace all prompts with AI-generated ones"}
          >
            {isRegenerating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isRegenerating ? "Generating…" : "Regenerate with AI"}
          </Button>
          <Button size="sm" variant="outline" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
            Add prompt
          </Button>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={updatePrompts.isPending}>
              <Save className="h-4 w-4" />
              {updatePrompts.isPending ? "Saving…" : "Save changes"}
            </Button>
          )}
        </div>
      </div>

      {/* Stats strip */}
      {!isLoading && !isError && working.length > 0 && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
          <span>
            <span className="font-medium text-foreground">{activeCount}</span> of {working.length}{" "}
            active
          </span>
          <span className="text-border">·</span>
          <button
            onClick={() => setFilter(filter === "web_search" ? null : "web_search")}
            className={`inline-flex items-center gap-1.5 transition-colors ${
              filter === "web_search" ? "text-emerald-600 font-medium" : "hover:text-foreground"
            }`}
          >
            <Globe className="h-3.5 w-3.5" />
            {webSearchCount} web-search optimized
          </button>
        </div>
      )}

      {/* Pending changes notice */}
      {brand?.pending_prompts && !isDirty && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400/80">
          <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>
            You have saved prompt changes pending — they will take effect from next Monday's scan.
            {brand.pending_prompts_effective_at && (
              <> Effective: {new Date(brand.pending_prompts_effective_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}.</>
            )}
          </span>
        </div>
      )}

      {/* Category filter pills */}
      {!isLoading && !isError && working.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              filter === null
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {CATEGORY_ORDER.map((cat) => {
            const count = grouped[cat]?.length ?? 0;
            if (count === 0) return null;
            const { label } = CATEGORY_LABELS[cat];
            return (
              <button
                key={cat}
                onClick={() => setFilter(filter === cat ? null : cat)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === cat
                    ? "bg-foreground text-background border-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} <span className="opacity-60">{count}</span>
              </button>
            );
          })}
          {uncategorized.length > 0 && (
            <button
              onClick={() =>
                setFilter(filter === "__uncategorized" ? null : "__uncategorized")
              }
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filter === "__uncategorized"
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Uncategorized <span className="opacity-60">{uncategorized.length}</span>
            </button>
          )}
        </div>
      )}

      {/* Main content */}
      {isError ? (
        <ErrorCard message={error?.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 mt-0.5 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : isRegenerating ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            <span>Generating search-optimized prompts with AI…</span>
          </div>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-4 w-4 mt-0.5 rounded" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton
                      className={`h-4 ${i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-4/5" : "w-3/4"}`}
                    />
                    <div className="flex gap-1.5">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : working.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-20 text-center space-y-4">
            <div className="mx-auto w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium">No prompts yet</p>
              <p className="text-muted-foreground text-sm mt-1">
                Generate AI-optimized prompts automatically, or add them manually.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Button
                size="sm"
                onClick={handleRegenerate}
                disabled={isRegenerating || !brand?.name}
              >
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </Button>
              <Button size="sm" variant="outline" onClick={handleAdd}>
                <Plus className="h-4 w-4" />
                Add manually
              </Button>
            </div>
            {!brand?.name && (
              <p className="text-xs text-muted-foreground">
                Complete brand onboarding to use AI generation.
              </p>
            )}
          </CardContent>
        </Card>
      ) : filteredWorking !== null ? (
        /* Flat filtered list */
        <div className="space-y-1.5">
          {filteredWorking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No prompts match this filter.
            </p>
          ) : (
            filteredWorking.map(({ prompt, idx }) => (
              <PromptRow
                key={idx}
                prompt={prompt}
                idx={idx}
                onTextChange={handleTextChange}
                onToggle={handleToggle}
                onRemove={handleRemove}
              />
            ))
          )}
        </div>
      ) : (
        /* Grouped by category */
        <div className="space-y-5">
          {CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((cat) => (
            <CategoryGroup
              key={cat}
              category={cat}
              prompts={grouped[cat]}
              onTextChange={handleTextChange}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))}
          {uncategorized.length > 0 && (
            <CategoryGroup
              category={null}
              prompts={uncategorized}
              onTextChange={handleTextChange}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          )}
        </div>
      )}

      {/* Sticky save bar */}
      {isDirty && working.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <div className="flex items-center gap-2 bg-background border rounded-lg shadow-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
            <Button variant="ghost" size="sm" onClick={handleDiscard} className="h-7 text-xs">
              Discard
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={updatePrompts.isPending}
              className="h-7 text-xs"
            >
              <Save className="h-3 w-3" />
              {updatePrompts.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
