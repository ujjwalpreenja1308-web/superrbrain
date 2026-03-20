import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { StatCard } from "@/components/StatCard";
import { CompetitorVisibilityChart } from "@/components/CompetitorVisibilityChart";
import { CitationMap } from "@/components/CitationMap";
import { TopOpportunities } from "@/components/TopOpportunities";
import { ErrorCard } from "@/components/ErrorCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useBrand, useRunMonitoring } from "@/hooks/useBrand";
import { useCitations, useGaps, useReport } from "@/hooks/useReport";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { RefreshCw, Loader2, Eye, AlertTriangle, Radio, Trophy } from "lucide-react";

function DashboardSkeleton() {
  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between shrink-0">
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3.5 w-32" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 shrink-0">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-md" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex-1 grid gap-4 lg:grid-cols-3 min-h-0">
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <Skeleton className="h-48 w-full rounded-lg shrink-0" />
          <Skeleton className="flex-1 w-full rounded-lg" />
        </div>
        <Skeleton className="h-full w-full rounded-lg" />
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { activeBrand: brand, activeBrandId: brandId, brands, isLoading: brandsLoading } = useActiveBrand();

  useEffect(() => {
    if (!brandsLoading && brands.length === 0) {
      navigate("/onboarding");
    }
  }, [brandsLoading, brands.length, navigate]);

  const { data: brandDetail } = useBrand(brandId);
  const { data: citations, isError: citError, refetch: refetchCitations } = useCitations(brandId);
  const { data: gaps, isError: gapError, refetch: refetchGaps } = useGaps(brandId);
  const { data: report, isError: reportError, refetch: refetchReport } = useReport(brandId);
  const runMonitoring = useRunMonitoring(brandId ?? "");

  const activeBrandDetail = brandDetail ?? brand;
  const isRunning = activeBrandDetail?.status === "running" || activeBrandDetail?.status === "onboarding";

  if (brandsLoading || !brandId || !activeBrandDetail) {
    return <DashboardSkeleton />;
  }

  const visibilityScore = activeBrandDetail.latest_visibility_score ?? 0;
  const gapCount = activeBrandDetail.latest_gap_score ?? 0;

  const brandCitationCount = citations?.filter((c) =>
    c.brands_mentioned.some((b) => b.name.toLowerCase() === (activeBrandDetail.name || "").toLowerCase())
  ).length ?? 0;

  const competitorCitationMap = new Map<string, number>();
  for (const cit of citations ?? []) {
    for (const b of cit.brands_mentioned) {
      if (b.name.toLowerCase() !== (activeBrandDetail.name || "").toLowerCase()) {
        competitorCitationMap.set(b.name, (competitorCitationMap.get(b.name) || 0) + 1);
      }
    }
  }
  const competitorRanking = Array.from(competitorCitationMap.entries())
    .map(([name, citationCount]) => ({ name, citationCount }))
    .sort((a, b) => b.citationCount - a.citationCount)
    .slice(0, 5);

  const totalPrompts = report?.engine_breakdown?.reduce((sum, e) => sum + e.total, 0) ?? 0;

  const topCompetitor = competitorRanking[0];
  const scoreColor = visibilityScore >= 60
    ? "text-success"
    : visibilityScore >= 30
      ? "text-warning"
      : "text-destructive";

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold leading-tight">{activeBrandDetail.name}</h1>
          <p className="text-xs text-muted-foreground">
            {activeBrandDetail.category}
            {activeBrandDetail.updated_at && (
              <> &middot; Updated {new Date(activeBrandDetail.updated_at).toLocaleDateString()}</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runMonitoring.mutate()}
          disabled={isRunning || runMonitoring.isPending}
          className="h-8 text-xs"
        >
          {isRunning ? (
            <><Loader2 className="size-3.5 animate-spin" /> Running...</>
          ) : (
            <><RefreshCw className="size-3.5" /> Re-run</>
          )}
        </Button>
      </div>

      {/* Stat cards row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 shrink-0">
        <StatCard
          label="Visibility Score"
          value={visibilityScore}
          suffix="%"
          icon={Eye}
          color={scoreColor}
        />
        <StatCard
          label="Gaps Found"
          value={gapCount}
          icon={AlertTriangle}
          color={gapCount > 0 ? "text-warning" : "text-success"}
        />
        <StatCard
          label="Prompts Monitored"
          value={totalPrompts}
          icon={Radio}
        />
        <StatCard
          label="Top Competitor"
          value={topCompetitor?.citationCount ?? 0}
          suffix="x"
          icon={Trophy}
          subtext={topCompetitor?.name ?? "None"}
        />
      </div>

      {/* Error state */}
      {(citError || gapError || reportError) && (
        <div className="shrink-0">
          <ErrorCard
            message="Some data failed to load."
            onRetry={() => { refetchCitations(); refetchGaps(); refetchReport(); }}
          />
        </div>
      )}

      {/* Main content — fills remaining height, no outer scroll */}
      <div className="flex-1 grid gap-4 lg:grid-cols-3 min-h-0">
        {/* Left column: chart + citation map stacked */}
        <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
          <div className="shrink-0">
            <CompetitorVisibilityChart
              brandName={activeBrandDetail.name || "You"}
              brandCitationCount={brandCitationCount}
              competitorRanking={competitorRanking}
              totalPrompts={totalPrompts}
            />
          </div>
          {/* Citation map scrolls internally */}
          <div className="flex-1 min-h-0">
            <CitationMap
              citations={citations ?? []}
              brandName={activeBrandDetail.name || ""}
              totalPrompts={totalPrompts}
            />
          </div>
        </div>

        {/* Right column: opportunities */}
        <div className="min-h-0 overflow-y-auto">
          <TopOpportunities gaps={gaps ?? []} />
        </div>
      </div>
    </div>
  );
}
