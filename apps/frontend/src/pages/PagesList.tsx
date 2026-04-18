import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { usePages } from "@/hooks/usePages";
import type { PageStatus } from "@covable/shared";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "winning", label: "Winning" },
  { value: "stale", label: "Stale" },
  { value: "failing", label: "Failing" },
  { value: "archived", label: "Archived" },
];

const STATUS_BADGE: Record<PageStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/15 text-blue-400",
  winning: "bg-green-500/15 text-green-400",
  stale: "bg-yellow-500/15 text-yellow-400",
  failing: "bg-red-500/15 text-red-400",
  archived: "bg-muted text-muted-foreground",
};

export function PagesList() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") ?? "";

  const { data: pages, isLoading, refetch, isFetching } = usePages(brandId, statusFilter || undefined);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Pages</h1>
          <p className="text-sm text-muted-foreground mt-1">Generated listicle pages</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
          <Link
            to="/content-moat/prompts"
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Generate
          </Link>
        </div>
      </div>

      {/* Status filter */}
      <div className="flex gap-1.5 flex-wrap">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => {
              if (opt.value) setSearchParams({ status: opt.value });
              else setSearchParams({});
            }}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              statusFilter === opt.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted/30"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading pages...</div>
      ) : !pages?.length ? (
        <div className="text-center py-12 space-y-3">
          <p className="text-sm text-muted-foreground">No pages yet.</p>
          <Link
            to="/content-moat/prompts"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Go to Prompt Lab to generate
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {pages.map((page) => (
            <Link
              key={page.id}
              to={`/content-moat/pages/${page.id}`}
              className="flex items-center gap-4 p-4 rounded-lg border border-border hover:bg-muted/20 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{page.title}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[page.status as PageStatus] ?? STATUS_BADGE.draft}`}
                  >
                    {page.status}
                  </span>
                  {page.cps != null && (
                    <span className="text-xs text-muted-foreground">
                      CPS {(page.cps * 100).toFixed(0)}%
                    </span>
                  )}
                  {page.citation_rate != null && (
                    <span className="text-xs text-muted-foreground">
                      Cited {(page.citation_rate * 100).toFixed(0)}%
                    </span>
                  )}
                  {page.published_url && (
                    <a
                      href={page.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-primary hover:underline"
                    >
                      View live
                    </a>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
