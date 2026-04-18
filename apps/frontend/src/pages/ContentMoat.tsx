import { Link } from "react-router-dom";
import { FileText, Search, TrendingUp, Globe, ArrowRight, Zap } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { usePromptsV2 } from "@/hooks/usePromptsV2";
import { usePages } from "@/hooks/usePages";

const PAGE_STATUS_COLORS: Record<string, string> = {
  draft: "text-muted-foreground",
  published: "text-blue-400",
  winning: "text-green-400",
  stale: "text-yellow-400",
  failing: "text-red-400",
  archived: "text-muted-foreground",
};

export function ContentMoat() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;

  const { data: prompts } = usePromptsV2(brandId);
  const { data: allPages } = usePages(brandId);

  const totalPrompts = prompts?.length ?? 0;
  const highGapPrompts = prompts?.filter((p) => p.gap_score >= 0.5).length ?? 0;
  const totalPages = allPages?.length ?? 0;
  const publishedPages = allPages?.filter((p) => p.status === "published" || p.status === "winning").length ?? 0;
  const winningPages = allPages?.filter((p) => p.status === "winning").length ?? 0;
  const avgCps = allPages?.length
    ? allPages.reduce((sum, p) => sum + (p.cps ?? 0), 0) / allPages.length
    : 0;

  const recentPages = [...(allPages ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Content Moat</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Build pages that get cited by AI engines
        </p>
      </div>

      {/* Pipeline stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Search} label="Prompts" value={totalPrompts} sub={`${highGapPrompts} high gap`} />
        <StatCard icon={FileText} label="Pages" value={totalPages} sub={`${publishedPages} published`} />
        <StatCard icon={TrendingUp} label="Winning" value={winningPages} sub="citation rate > 70%" />
        <StatCard icon={Zap} label="Avg CPS" value={`${(avgCps * 100).toFixed(0)}%`} sub="citation probability" />
      </div>

      {/* Pipeline flow */}
      <div className="border border-border rounded-lg p-5">
        <h2 className="text-sm font-medium mb-4">Pipeline</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <PipelineStep to="/content-moat/prompts" label="Prompts" count={totalPrompts} active={totalPrompts > 0} />
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <PipelineStep to="/content-moat/pages?status=draft" label="Draft" count={allPages?.filter(p => p.status === "draft").length ?? 0} active />
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <PipelineStep to="/content-moat/pages?status=published" label="Published" count={publishedPages} active={publishedPages > 0} />
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <PipelineStep to="/content-moat/pages?status=winning" label="Winning" count={winningPages} active={winningPages > 0} highlight />
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ActionCard
          to="/content-moat/prompts"
          icon={Search}
          title="Prompt Lab"
          description="Find high-gap prompts and generate pages from them"
        />
        <ActionCard
          to="/content-moat/pages"
          icon={FileText}
          title="Pages"
          description="Review generated pages, check CPS scores, publish"
        />
        <ActionCard
          to="/content-moat/publishers"
          icon={Globe}
          title="CMS Connections"
          description="Connect WordPress, Shopify, or Webflow to auto-publish"
        />
        <ActionCard
          to="/content-moat/reinforcement"
          icon={TrendingUp}
          title="Reinforcement"
          description="Approve Reddit and blog posts that reinforce your pages"
        />
      </div>

      {/* Recent pages */}
      {recentPages.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium">Recent Pages</h2>
            <Link to="/content-moat/pages" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-2">
            {recentPages.map((page) => (
              <Link
                key={page.id}
                to={`/content-moat/pages/${page.id}`}
                className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm truncate">{page.title}</p>
                  <p className={`text-xs mt-0.5 ${PAGE_STATUS_COLORS[page.status]}`}>
                    {page.status}
                    {page.cps != null && ` · CPS ${(page.cps * 100).toFixed(0)}%`}
                    {page.citation_rate != null && ` · Cited ${(page.citation_rate * 100).toFixed(0)}%`}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-3" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="border border-border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function PipelineStep({
  to,
  label,
  count,
  active,
  highlight,
}: {
  to: string;
  label: string;
  count: number;
  active?: boolean;
  highlight?: boolean;
}) {
  return (
    <Link
      to={to}
      className={`flex flex-col items-center px-4 py-2 rounded-lg border transition-colors ${
        highlight
          ? "border-green-500/30 bg-green-500/10 text-green-400"
          : active
          ? "border-primary/30 bg-primary/5 text-foreground hover:bg-primary/10"
          : "border-border text-muted-foreground hover:bg-muted/30"
      }`}
    >
      <span className="text-lg font-semibold">{count}</span>
      <span className="text-xs">{label}</span>
    </Link>
  );
}

function ActionCard({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors"
    >
      <div className="p-2 rounded-md bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </Link>
  );
}
