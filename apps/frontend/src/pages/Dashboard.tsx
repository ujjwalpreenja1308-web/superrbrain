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
import {
  ONBOARDING_BRAND_STORAGE_KEY,
  useActiveBrand,
} from "@/hooks/useActiveBrand";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RefreshCw, Loader2, Eye, AlertTriangle, Radio, Trophy, CheckCircle2 } from "lucide-react";

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

function FirstRunPanel({
  status,
  onRun,
  isStarting,
}: {
  status: string;
  onRun: () => void;
  isStarting: boolean;
}) {
  const isWorking = status === "pending" || status === "onboarding" || status === "running";

  return (
    <div className="flex min-h-[48vh] items-center justify-center rounded-xl border border-border bg-card/50 px-6 py-10">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          {isWorking ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : (
            <CheckCircle2 className="h-6 w-6 text-primary" />
          )}
        </div>
        <h2 className="mb-2 text-xl font-semibold">
          {isWorking ? "Your first scan is getting ready" : "Ready for your first scan"}
        </h2>
        <p className="mx-auto mb-6 max-w-sm text-sm leading-6 text-muted-foreground">
          {isWorking
            ? "We are preparing prompts, firing them at AI search, and collecting the citations that shape your visibility."
            : "Run your first AI visibility scan to populate scores, competitors, citations, and opportunities."}
        </p>
        <div className="mb-6 grid grid-cols-3 gap-2 text-[11px]">
          {["Prompts", "AI responses", "Citation map"].map((label, index) => (
            <div
              key={label}
              className={`rounded-lg border px-2 py-2 ${
                isWorking && index === 1
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-background/60 text-muted-foreground"
              }`}
            >
              {label}
            </div>
          ))}
        </div>
        {!isWorking && (
          <Button onClick={onRun} disabled={isStarting} className="gap-2">
            {isStarting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Start first scan
          </Button>
        )}
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const { activeBrand: brand, activeBrandId: brandId, brands, isLoading: brandsLoading } = useActiveBrand();
  const { user } = useAuth();
  const { data: me, isLoading: meLoading } = useQuery({
    queryKey: ["me", user?.id],
    queryFn: () => api.get<{ plan: string }>("/api/me"),
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    // Don't redirect trial users with no brands — PlanGuard shows PlanChooser first.
    // Only redirect to onboarding once we know the user has a paid plan.
    if (!brandsLoading && !meLoading && brands.length === 0 && me?.plan !== "trial") {
      navigate("/onboarding", { replace: true });
    }
  }, [brandsLoading, meLoading, brands.length, me?.plan, navigate]);

  const { data: brandDetail } = useBrand(brandId);
  const { data: citations, isLoading: citationsLoading, isError: citError, refetch: refetchCitations } = useCitations(brandId);
  const { data: gaps, isLoading: gapsLoading, isError: gapError, refetch: refetchGaps } = useGaps(brandId);
  const { data: report, isLoading: reportLoading, isError: reportError, refetch: refetchReport } = useReport(brandId);
  const runMonitoring = useRunMonitoring(brandId ?? "");

  const activeBrandDetail = brandDetail ?? brand;
  const isRunning = activeBrandDetail?.status === "running" || activeBrandDetail?.status === "onboarding";

  useEffect(() => {
    if (!brandId || !activeBrandDetail) return;

    const onboardingBrandId = localStorage.getItem(
      ONBOARDING_BRAND_STORAGE_KEY,
    );

    if (
      activeBrandDetail.status === "ready" &&
      onboardingBrandId === brandId
    ) {
      localStorage.removeItem(ONBOARDING_BRAND_STORAGE_KEY);
      return;
    }

    const isUnfinishedOnboarding =
      activeBrandDetail.status === "pending" ||
      activeBrandDetail.status === "onboarding" ||
      (activeBrandDetail.status === "error" &&
        (onboardingBrandId === brandId || !activeBrandDetail.name));

    if (isUnfinishedOnboarding) {
      localStorage.setItem(ONBOARDING_BRAND_STORAGE_KEY, brandId);
      navigate("/onboarding", { replace: true });
    }
  }, [activeBrandDetail, brandId, navigate]);

  if (brandsLoading || !brandId || !activeBrandDetail) {
    return <DashboardSkeleton />;
  }

  if (citationsLoading || gapsLoading || reportLoading) {
    return <DashboardSkeleton />;
  }

  const visibilityScore = activeBrandDetail.latest_visibility_score ?? 0;
  const gapCount = activeBrandDetail.latest_gap_score ?? 0;

  const competitorCitationMap = new Map<string, number>();
  for (const cit of citations ?? []) {
    for (const b of cit.brands_mentioned) {
      if (b.name.toLowerCase() !== (activeBrandDetail.name || "").toLowerCase()) {
        competitorCitationMap.set(b.name, (competitorCitationMap.get(b.name) || 0) + 1);
      }
    }
  }
  const competitorRanking = (report?.competitor_breakdown?.length
    ? report.competitor_breakdown.map((c) => ({ name: c.name, mentionedCount: c.mentioned }))
    : Array.from(competitorCitationMap.entries()).map(([name, mentionedCount]) => ({ name, mentionedCount }))
  )
    .sort((a, b) => b.mentionedCount - a.mentionedCount)
    .slice(0, 5);

  const totalPrompts = report?.engine_breakdown?.reduce((sum, e) => sum + e.total, 0) ?? 0;
  const brandMentionedCount = report?.engine_breakdown?.reduce((sum, e) => sum + e.mentioned, 0) ?? 0;
  const hasReportData = totalPrompts > 0 || (citations?.length ?? 0) > 0 || (gaps?.length ?? 0) > 0;

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
          disabled
          title="Manual re-runs are disabled to keep scan volume controlled."
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
          value={topCompetitor?.mentionedCount ?? 0}
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
      {hasReportData ? (
        <div className="flex-1 grid gap-4 lg:grid-cols-3 min-h-0">
          {/* Left column: chart + citation map stacked */}
          <div className="lg:col-span-2 flex flex-col gap-4 min-h-0">
            <div className="shrink-0">
              <CompetitorVisibilityChart
                brandName={activeBrandDetail.name || "You"}
                brandMentionedCount={brandMentionedCount}
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
            <TopOpportunities gaps={gaps ?? []} brandId={brandId} />
          </div>
        </div>
      ) : (
        <FirstRunPanel
          status={activeBrandDetail.status}
          onRun={() => runMonitoring.mutate()}
          isStarting={runMonitoring.isPending}
        />
      )}
    </div>
  );
}
