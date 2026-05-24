import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Zap, ExternalLink, Loader2 } from "lucide-react";
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
  const top3 = gaps.slice(0, 3);

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-accent" />
          Top Opportunities
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {top3.map((gap, index) => (
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
        ))}

        {top3.length === 0 && (
          <div className="py-4 text-center space-y-1">
            <p className="text-sm font-medium text-green-500">No gaps to close</p>
            <p className="text-xs text-muted-foreground">
              Your brand appears in AI responses alongside competitors. Run monitoring again after a week to track changes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
