import { useOutcomes } from "@/hooks/useExecution";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { Loader2, TrendingUp, ExternalLink, CheckCircle } from "lucide-react";

export function Outcomes() {
  const { activeBrand: brand } = useActiveBrand();
  const { data: outcomes, isLoading, isError, error, refetch } = useOutcomes(brand?.id);

  const deployedCount = outcomes?.filter((o) => o.gap_status_after === "addressed").length || 0;
  const totalDeployed = outcomes?.length || 0;
  const closureRate = totalDeployed > 0 ? Math.round((deployedCount / totalDeployed) * 100) : 0;

  return (
    <>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Outcomes</h1>
          <p className="text-muted-foreground mt-1">
            Track which citation gaps have been closed after deploying content.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{totalDeployed}</div>
              <div className="text-sm text-muted-foreground mt-1">Deployed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold text-green-600">{deployedCount}</div>
              <div className="text-sm text-muted-foreground mt-1">Gaps Closed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-3xl font-bold">{closureRate}%</div>
              <div className="text-sm text-muted-foreground mt-1">Closure Rate</div>
            </CardContent>
          </Card>
        </div>

        {/* Outcomes List */}
        {isError ? (
          <ErrorCard message={error?.message} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}><CardContent className="p-5"><div className="space-y-2"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-64" /></div></CardContent></Card>
            ))}
          </div>
        ) : !outcomes?.length ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              No outcomes yet. Deploy content from the Gap Queue to start tracking closures.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {outcomes.map((outcome) => {
              const gap = (outcome as Record<string, unknown>).citation_gaps as {
                source_url: string;
                competitor_name: string;
                source_type: string;
              } | null;
              const content = (outcome as Record<string, unknown>).generated_content as {
                deployed_url: string | null;
              } | null;
              const isClosed = outcome.gap_status_after === "addressed";

              return (
                <Card key={outcome.id} className={isClosed ? "border-green-500/30" : ""}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-medium text-sm">{gap?.competitor_name || "Unknown"}</span>
                          <Badge variant="outline" className="text-xs">
                            {gap?.source_type || "reddit"}
                          </Badge>
                          {isClosed ? (
                            <Badge className="text-xs bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Closed
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Pending</Badge>
                          )}
                        </div>
                        {gap?.source_url && (
                          <a
                            href={gap.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate"
                          >
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {gap.source_url}
                          </a>
                        )}
                        {content?.deployed_url && (
                          <a
                            href={content.deployed_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline truncate"
                          >
                            <TrendingUp className="h-3 w-3 flex-shrink-0" />
                            View deployed comment
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex-shrink-0">
                        {new Date(outcome.detected_at).toLocaleDateString()}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
