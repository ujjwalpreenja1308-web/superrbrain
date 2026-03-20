import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { Citation } from "@covable/shared";

interface CitationMapProps {
  citations: (Citation & { frequency_score: number })[];
  brandName: string;
  totalPrompts: number;
}

const SECTION_ORDER = ["reddit", "youtube", "review_site", "news", "listicle", "marketplace", "directory", "social", "blog", "other"];

const SECTION_LABELS: Record<string, string> = {
  reddit: "Reddit",
  youtube: "YouTube",
  review_site: "Reviews",
  news: "News",
  listicle: "Listicles",
  marketplace: "Marketplaces",
  directory: "Directories",
  social: "Social",
  blog: "Blogs",
  other: "Other",
};

const SECTION_DESC: Record<string, string> = {
  reddit: "Community discussions AI cited",
  youtube: "Videos AI referenced",
  review_site: "Review platforms",
  news: "News & editorial coverage",
  listicle: '"Best of" and ranked articles — high-impact for brand inclusion',
  marketplace: "Product listing pages",
  directory: "Business directories",
  social: "Social media posts",
  blog: "General blog posts",
  other: "Other sources",
};

const PAGE_SIZE = 8;

function CitationRow({
  cit,
  brandName,
  totalPrompts,
}: {
  cit: Citation & { frequency_score: number };
  brandName: string;
  totalPrompts: number;
}) {
  const hasBrand = cit.brands_mentioned.some(
    (b) => b.name.toLowerCase() === brandName.toLowerCase()
  );
  const competitors = cit.brands_mentioned.filter(
    (b) => b.name.toLowerCase() !== brandName.toLowerCase()
  );
  const pct = totalPrompts > 0 ? Math.round((cit.frequency_score / totalPrompts) * 100) : null;

  return (
    <tr className="border-b border-border/30 hover:bg-muted/20 transition-colors">
      <td className="py-2 pr-4">
        <a
          href={cit.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-foreground hover:text-primary transition-colors"
        >
          <span className="truncate max-w-[260px] text-sm">
            {cit.title || cit.domain || cit.url}
          </span>
          <ExternalLink className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        </a>
      </td>
      <td className="py-2 pr-4">
        <div className="flex flex-wrap gap-1">
          {hasBrand && <Badge variant="success" className="text-xs">{brandName}</Badge>}
          {competitors.slice(0, 3).map((b) => (
            <Badge key={b.name} variant="destructive" className="text-xs">{b.name}</Badge>
          ))}
          {competitors.length > 3 && (
            <Badge variant="secondary" className="text-xs">+{competitors.length - 3}</Badge>
          )}
          {!hasBrand && competitors.length === 0 && (
            <span className="text-xs text-muted-foreground italic">not cited</span>
          )}
        </div>
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        <span className="font-mono text-sm">{pct !== null ? `${pct}%` : `${cit.frequency_score}x`}</span>
      </td>
    </tr>
  );
}

export function CitationMap({ citations, brandName, totalPrompts }: CitationMapProps) {
  const grouped = new Map<string, (Citation & { frequency_score: number })[]>();
  for (const cit of citations) {
    const type = cit.source_type ?? "other";
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type)!.push(cit);
  }
  for (const [, items] of grouped) {
    items.sort((a, b) => b.frequency_score - a.frequency_score);
  }

  const sections = SECTION_ORDER.filter((t) => grouped.has(t));
  const [activeTab, setActiveTab] = useState(() => sections[0] ?? "reddit");
  const [page, setPage] = useState(0);

  const currentTab = sections.includes(activeTab) ? activeTab : sections[0];
  const items = grouped.get(currentTab) ?? [];
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const pageItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function switchTab(tab: string) {
    setActiveTab(tab);
    setPage(0);
  }

  if (sections.length === 0) {
    return (
      <Card className="flex-1 min-h-0">
        <CardContent className="flex items-center justify-center h-32">
          <p className="text-sm text-muted-foreground">No citations yet. Run monitoring to see results.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col min-h-0 h-full">
      <CardHeader className="pb-2 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm">Citation Map</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Where AI sends people · {totalPrompts > 0 ? `${totalPrompts} prompts` : "no data yet"}
            </p>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-2 py-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
              >
                ←
              </button>
              <span>{page + 1} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="px-2 py-1 rounded hover:bg-muted disabled:opacity-40 transition-colors"
              >
                →
              </button>
            </div>
          )}
        </div>

        {/* Tab strip */}
        <div className="flex gap-1 mt-2 overflow-x-auto scrollbar-none flex-wrap">
          {sections.map((type) => {
            const count = grouped.get(type)!.length;
            const isActive = currentTab === type;
            return (
              <button
                key={type}
                onClick={() => switchTab(type)}
                className={`shrink-0 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {SECTION_LABELS[type]}
                <span className={`ml-1 ${isActive ? "opacity-75" : "opacity-50"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto min-h-0 pt-0">
        <p className="text-xs text-muted-foreground mb-2">{SECTION_DESC[currentTab]}</p>
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-4 font-medium">Source</th>
              <th className="pb-2 pr-4 font-medium">Who's cited</th>
              <th className="pb-2 font-medium text-right">Appeared in</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((cit) => (
              <CitationRow
                key={cit.id}
                cit={cit}
                brandName={brandName}
                totalPrompts={totalPrompts}
              />
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={3} className="py-8 text-center text-xs text-muted-foreground">
                  No citations in this category.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
