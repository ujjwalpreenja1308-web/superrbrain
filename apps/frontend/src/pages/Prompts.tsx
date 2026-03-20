import { useState, useRef } from "react";
import { usePrompts, useUpdatePrompts } from "@/hooks/useBrand";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { toast } from "sonner";
import { Plus, Trash2, Save, ToggleLeft, ToggleRight } from "lucide-react";
import type { Prompt } from "@superrbrain/shared";

type LocalPrompt = { id?: string; text: string; is_active: boolean; dirty?: boolean };

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

  return (
    <Card className={`transition-colors ${!prompt.is_active ? "opacity-50" : ""}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <button
          onClick={() => onToggle(idx)}
          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
          title={prompt.is_active ? "Disable prompt" : "Enable prompt"}
        >
          {prompt.is_active ? (
            <ToggleRight className="h-5 w-5 text-primary" />
          ) : (
            <ToggleLeft className="h-5 w-5" />
          )}
        </button>

        <div className="flex-1 min-w-0" onClick={!editing ? startEdit : undefined}>
          {editing ? (
            <Input
              ref={inputRef}
              value={prompt.text}
              onChange={(e) => onTextChange(idx, e.target.value)}
              onBlur={stopEdit}
              onKeyDown={(e) => e.key === "Enter" && stopEdit()}
              placeholder="e.g. What is the best tool for tracking AI citations?"
              className="border-transparent bg-transparent focus-visible:border-border px-0 h-auto py-0 text-sm shadow-none w-full"
            />
          ) : (
            <span className="text-sm cursor-text truncate block text-foreground">
              {prompt.text || <span className="text-muted-foreground italic">Click to add text...</span>}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={prompt.is_active ? "default" : "outline"} className="text-xs">
            {prompt.is_active ? "Active" : "Inactive"}
          </Badge>
          <button
            onClick={() => onRemove(idx)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Remove prompt"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

export function Prompts() {
  const { activeBrand: brand } = useActiveBrand();
  const { data: prompts, isLoading, isError, error, refetch } = usePrompts(brand?.id);
  const updatePrompts = useUpdatePrompts(brand?.id ?? "");

  const [local, setLocal] = useState<LocalPrompt[] | null>(null);

  // Initialise local state from server data once
  const working: LocalPrompt[] = local ?? (prompts?.map((p: Prompt) => ({ id: p.id, text: p.text, is_active: p.is_active })) ?? []);

  const isDirty = local !== null;

  function sync(next: LocalPrompt[]) {
    setLocal(next);
  }

  function handleAdd() {
    sync([...working, { text: "", is_active: true, dirty: true }]);
  }

  function handleTextChange(idx: number, value: string) {
    const next = working.map((p, i) => i === idx ? { ...p, text: value } : p);
    sync(next);
  }

  function handleToggle(idx: number) {
    const next = working.map((p, i) => i === idx ? { ...p, is_active: !p.is_active } : p);
    sync(next);
  }

  function handleRemove(idx: number) {
    const next = working.filter((_, i) => i !== idx);
    sync(next);
  }

  async function handleSave() {
    const valid = working.filter((p) => p.text.trim());
    if (!valid.length) {
      toast.error("Add at least one prompt before saving.");
      return;
    }
    try {
      await updatePrompts.mutateAsync(valid.map((p) => ({ id: p.id, text: p.text.trim(), is_active: p.is_active })));
      setLocal(null);
      toast.success("Prompts saved");
    } catch {
      // mutation error handled globally
    }
  }

  function handleDiscard() {
    setLocal(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Prompts</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Questions used to monitor AI citation results. Click any prompt to edit it directly. Toggle to enable or disable individual prompts.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {isDirty && (
            <Button variant="outline" size="sm" onClick={handleDiscard}>
              Discard
            </Button>
          )}
          <Button size="sm" onClick={handleAdd} variant="outline">
            <Plus className="h-4 w-4" />
            Add prompt
          </Button>
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={updatePrompts.isPending}>
              <Save className="h-4 w-4" />
              {updatePrompts.isPending ? "Saving..." : "Save changes"}
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <ErrorCard message={error?.message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : working.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No prompts yet. Add one to start monitoring.</p>
            <Button className="mt-4" size="sm" onClick={handleAdd}>
              <Plus className="h-4 w-4" />
              Add your first prompt
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {working.map((prompt, idx) => (
            <PromptRow
              key={idx}
              prompt={prompt}
              idx={idx}
              onTextChange={handleTextChange}
              onToggle={handleToggle}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {working.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {working.filter((p) => p.is_active).length} of {working.length} prompts active
        </p>
      )}
    </div>
  );
}
