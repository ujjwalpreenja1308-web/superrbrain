import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Check, X } from "lucide-react";
import type { Prompt } from "@covable/shared";

interface PromptEditorProps {
  prompts: Prompt[];
  onSave: (
    prompts: { id?: string; text: string; is_active: boolean }[]
  ) => void;
  saving?: boolean;
}

export function PromptEditor({ prompts, onSave, saving }: PromptEditorProps) {
  const [items, setItems] = useState<{ id?: string; text: string; is_active: boolean }[]>(
    prompts.map((p) => ({ id: p.id, text: p.text, is_active: p.is_active }))
  );
  const [newPrompt, setNewPrompt] = useState("");

  const toggle = (index: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, is_active: !item.is_active } : item
      )
    );
  };

  const remove = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const add = () => {
    if (!newPrompt.trim()) return;
    setItems((prev) => [
      ...prev,
      { text: newPrompt.trim(), is_active: true },
    ]);
    setNewPrompt("");
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {items.map((item, index) => (
          <div
            key={item.id || index}
            className="flex items-center gap-2 rounded-md border border-border p-2"
          >
            <button
              onClick={() => toggle(index)}
              className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded ${
                item.is_active
                  ? "bg-success/20 text-success"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {item.is_active ? (
                <Check className="h-3 w-3" />
              ) : (
                <X className="h-3 w-3" />
              )}
            </button>
            <span
              className={`flex-1 text-sm ${
                !item.is_active ? "text-muted-foreground line-through" : ""
              }`}
            >
              {item.text}
            </span>
            <button
              onClick={() => remove(index)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Input
          value={newPrompt}
          onChange={(e) => setNewPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a custom prompt..."
        />
        <Button variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Button
        onClick={() => onSave(items)}
        disabled={saving}
        className="w-full"
      >
        {saving ? "Saving..." : "Save Prompts"}
      </Button>
    </div>
  );
}
