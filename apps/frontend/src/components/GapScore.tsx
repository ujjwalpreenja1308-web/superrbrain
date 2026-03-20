import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AlertTriangle, ShieldCheck } from "lucide-react";

interface GapScoreProps {
  gapCount: number;
  visibilityScore: number;
  totalPrompts: number;
  competitorRanking: { name: string; citationCount: number }[];
  brandCitationCount: number;
}

export function GapScore({
  gapCount,
  visibilityScore,
  totalPrompts,
  competitorRanking,
  brandCitationCount,
}: GapScoreProps) {
  const dominant = gapCount === 0 && visibilityScore >= 80;

  const toPercent = (count: number) =>
    totalPrompts > 0 ? Math.round((count / totalPrompts) * 100) : 0;

  const allEntries = [
    { name: "You", count: brandCitationCount, isYou: true },
    ...competitorRanking.map((c) => ({ name: c.name, count: c.citationCount, isYou: false })),
  ].sort((a, b) => b.count - a.count);

  const maxCount = Math.max(...allEntries.map((e) => e.count), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {dominant
            ? <ShieldCheck className="h-5 w-5 text-green-500" />
            : <AlertTriangle className="h-5 w-5 text-yellow-500" />}
          AI Visibility Ranking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground mb-3">
          % of AI responses that cited each brand across {totalPrompts} prompts
        </p>
        {allEntries.map((entry, i) => {
          const pct = toPercent(entry.count);
          return (
            <div key={entry.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <span className={entry.isYou ? "font-semibold text-primary" : "text-muted-foreground"}>
                    {entry.name}
                  </span>
                  {entry.isYou && <span className="text-xs text-muted-foreground">(you)</span>}
                </div>
                <span className={`font-mono text-xs ${entry.isYou ? "text-primary" : "text-muted-foreground"}`}>
                  {pct}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${entry.isYou ? "bg-primary" : "bg-destructive/50"}`}
                  style={{ width: `${(entry.count / maxCount) * 100}%` }}
                />
              </div>
            </div>
          );
        })}
        {allEntries.length <= 1 && competitorRanking.length === 0 && (
          <p className="text-xs text-muted-foreground pt-2">
            No known competitors appeared in AI responses. AI cited general sources — your opportunity is to get into those sources.
          </p>
        )}
        {dominant && (
          <p className="text-xs text-green-500 pt-2">
            Strong coverage — no gaps detected
          </p>
        )}
      </CardContent>
    </Card>
  );
}
