import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, ExternalLink, Loader2, Maximize2, X } from "lucide-react";
import { useStartExecution } from "@/hooks/useExecution";
import type { CitationGap } from "@covable/shared";

interface TopOpportunitiesProps {
  gaps: CitationGap[];
  brandId?: string;
}

export function TopOpportunities({ gaps, brandId }: TopOpportunitiesProps) {
  const navigate = useNavigate();
  const startExecution = useStartExecution(brandId ?? "");
  const [startingGapId, setStartingGapId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const top3 = gaps.slice(0, 3);

  useEffect(() => {
    if (!expanded) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expanded]);

  async function handleGenerateContent(gapId: string) {
    if (!brandId) return;
    setStartingGapId(gapId);
    try {
      const result = await startExecution.mutateAsync(gapId);
      navigate(`/content/${result.job_id}`);
    } finally {
      setStartingGapId(null);
    }
  }

  function renderGap(gap: CitationGap, index: number) {
    return (
      <div
        key={gap.id}
        className="rounded-lg border border-border/50 p-4 hover:border-primary/30 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary">
              {index + 1}
            </span>
            <span className="font-medium text-sm">
              {gap.competitor_name}
            </span>
          </div>
          <Badge variant="outline">{gap.source_type || "source"}</Badge>
        </div>
        <a
          href={gap.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
        >
          {gap.source_url}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
        {gap.opportunity_score && (
          <p className="mt-2 text-xs text-muted-foreground">
            Impact score:{" "}
            <span className="font-medium text-foreground">
              {gap.opportunity_score}
            </span>
          </p>
        )}
        {gap.source_type === "reddit" && (
          <div className="mt-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleGenerateContent(gap.id)}
              disabled={!brandId || startingGapId === gap.id || startExecution.isPending}
            >
              {startingGapId === gap.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Zap className="h-3 w-3" />
              )}
              Generate Content
            </Button>
          </div>
        )}
      </div>
    );
  }

  function renderCard() {
    const visibleGaps = expanded ? gaps : top3;

    return (
      <Card className={`relative ${expanded ? "flex h-full min-h-0 flex-col overflow-hidden" : ""}`}>
        {gaps.length > 3 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Show all opportunities"
            title="Show all opportunities"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        )}
        <CardHeader className={gaps.length > 3 && !expanded ? "pr-14" : undefined}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-accent" />
                Top Opportunities
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {gaps.length} gap{gaps.length !== 1 ? "s" : ""} found
              </p>
            </div>
            {expanded && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close opportunities"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </CardHeader>
      <CardContent className={`space-y-4 ${expanded ? "min-h-0 flex-1 overflow-y-auto pb-6" : ""}`}>
        {visibleGaps.map((gap, index) => renderGap(gap, index))}

        {top3.length === 0 && (
          <div className="py-4 text-center space-y-1">
            <p className="text-sm font-medium text-green-500">No gaps to close</p>
            <p className="text-xs text-muted-foreground">
              Your brand appears in AI responses alongside competitors. Run monitoring again after a week to track changes.
            </p>
          </div>
        )}

        {gaps.length > 3 && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-full rounded-lg border border-border/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            View all {gaps.length} gaps
          </button>
        )}
      </CardContent>
    </Card>
    );
  }

  return (
    <>
      {renderCard()}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setExpanded(false)}
          />
          <div
            className="relative h-[calc(100dvh-3rem)] w-full max-w-4xl animate-in fade-in slide-in-from-bottom-6 duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="All citation gaps"
          >
            {renderCard()}
          </div>
        </div>
      )}
    </>
  );
}
