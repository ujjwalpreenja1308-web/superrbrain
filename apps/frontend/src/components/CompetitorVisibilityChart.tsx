import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface ChartEntry {
  name: string;
  pct: number;
  count: number;
  isYou: boolean;
}

interface CompetitorVisibilityChartProps {
  brandName: string;
  brandCitationCount: number;
  competitorRanking: { name: string; citationCount: number }[];
  totalPrompts: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartEntry }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{d.name}{d.isYou ? " (you)" : ""}</p>
      <p className="text-muted-foreground">
        Cited in {d.count} of {d.pct > 0 ? Math.round(d.count / (d.pct / 100)) : 0} prompts ({d.pct}%)
      </p>
    </div>
  );
}

export function CompetitorVisibilityChart({
  brandName,
  brandCitationCount,
  competitorRanking,
  totalPrompts,
}: CompetitorVisibilityChartProps) {
  const toPercent = (count: number) =>
    totalPrompts > 0 ? Math.round((count / totalPrompts) * 100) : 0;

  const data: ChartEntry[] = [
    { name: brandName || "You", pct: toPercent(brandCitationCount), count: brandCitationCount, isYou: true },
    ...competitorRanking.map((c) => ({
      name: c.name,
      pct: toPercent(c.citationCount),
      count: c.citationCount,
      isYou: false,
    })),
  ].sort((a, b) => b.pct - a.pct);

  const primaryColor = "oklch(0.55 0.22 290)";
  const mutedColor = "oklch(0.45 0.12 25)";

  return (
    <Card className="hover:shadow-md hover:shadow-primary/5 transition-shadow duration-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">AI Visibility Ranking</CardTitle>
        <p className="text-xs text-muted-foreground">
          % of AI responses citing each brand across {totalPrompts} prompts
        </p>
      </CardHeader>
      <CardContent>
        {data.length <= 1 && competitorRanking.length === 0 ? (
          <p className="text-xs text-muted-foreground py-8 text-center">
            No competitors found in AI responses yet. Run monitoring to discover your competitive landscape.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={data.length * 44 + 32}>
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
              barCategoryGap="20%"
            >
              <XAxis
                type="number"
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 11, fill: "oklch(0.62 0.01 285)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={90}
                tick={{ fontSize: 11, fill: "oklch(0.62 0.01 285)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "oklch(0.16 0.008 285)", radius: 4 }} />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]} animationDuration={1000}>
                {data.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={entry.isYou ? primaryColor : mutedColor}
                    opacity={entry.isYou ? 1 : 0.6}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
