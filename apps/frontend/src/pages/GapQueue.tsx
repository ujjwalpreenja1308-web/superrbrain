import { useNavigate } from "react-router-dom";
import { useGapQueue, useStartExecution } from "@/hooks/useExecution";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { ExternalLink, Loader2, Zap, MessageSquare } from "lucide-react";
import type { GapQueueItem } from "@covable/shared";

function statusBadgeVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (!status) return "outline";
  if (status === "complete") return "default";
  if (status === "running" || status === "pending") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
}

function contentStatusBadgeVariant(status: string | null): "default" | "secondary" | "outline" | "destructive" {
  if (!status) return "outline";
  if (status === "deployed") return "default";
  if (status === "approved") return "secondary";
  if (status === "draft") return "outline";
  if (status === "rejected") return "destructive";
  return "outline";
}

function GapCard({
  gap,
  brandId,
}: {
  gap: GapQueueItem;
  brandId: string;
}) {
  const navigate = useNavigate();
  const startExecution = useStartExecution(brandId);

  const handleGenerate = async () => {
    const result = await startExecution.mutateAsync(gap.id);
    navigate(`/content/${result.job_id}`);
  };

  const handleView = () => {
    if (gap.execution_job_id) navigate(`/content/${gap.execution_job_id}`);
  };

  const hasJob = !!gap.execution_job_id;
  const isGenerating = gap.execution_status === "pending" || gap.execution_status === "running";

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-sm">{gap.competitor_name}</span>
              <Badge variant="outline" className="text-xs">
                {gap.source_type || "reddit"}
              </Badge>
              {gap.execution_status && (
                <Badge variant={statusBadgeVariant(gap.execution_status)} className="text-xs">
                  Job: {gap.execution_status}
                </Badge>
              )}
              {gap.latest_content_status && (
                <Badge variant={contentStatusBadgeVariant(gap.latest_content_status)} className="text-xs">
                  Content: {gap.latest_content_status}
                </Badge>
              )}
            </div>
            <a
              href={gap.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
            >
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
              {gap.source_url}
            </a>
            {gap.opportunity_score != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Impact score: <span className="font-medium text-foreground">{gap.opportunity_score}</span>
              </p>
            )}
          </div>
          <div className="flex-shrink-0">
            {!hasJob ? (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={startExecution.isPending}
              >
                {startExecution.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Generate
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={handleView} disabled={isGenerating}>
                {isGenerating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
                {isGenerating ? "Generating..." : "View Content"}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function GapQueue() {
  const { activeBrand: brand } = useActiveBrand();
  const { data: gaps, isLoading, isError, error, refetch } = useGapQueue(brand?.id);

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Gap Queue</h1>
          <p className="text-muted-foreground mt-1">
            Reddit sources where competitors appear but your brand doesn't. Generate content to close the gap.
          </p>
        </div>

        {isError ? (
          <ErrorCard message={error?.message} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-5"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64" /></div></CardContent></Card>
            ))}
          </div>
        ) : !gaps?.length ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No Reddit gaps found. Run a monitoring scan to discover opportunities.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{gaps.length} gap{gaps.length !== 1 ? "s" : ""} found</p>
            {gaps.map((gap) => (
              <GapCard key={gap.id} gap={gap} brandId={brand!.id} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
