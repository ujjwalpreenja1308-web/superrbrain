import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EngineBreakdown {
  engine: string;
  total: number;
  mentioned: number;
  score: number;
}

interface VisibilityScoreProps {
  score: number;
  engineBreakdown: EngineBreakdown[];
}

export function VisibilityScore({
  score,
  engineBreakdown,
}: VisibilityScoreProps) {
  const scoreColor =
    score >= 60
      ? "text-success"
      : score >= 30
        ? "text-warning"
        : "text-destructive";

  const circumference = 2 * Math.PI * 60;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visibility Score</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-6">
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-muted"
            />
            <circle
              cx="80"
              cy="80"
              r="60"
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className={cn(scoreColor, "transition-all duration-1000")}
              transform="rotate(-90 80 80)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-4xl font-bold", scoreColor)}>
              {score}%
            </span>
          </div>
        </div>

        <div className="w-full space-y-2">
          {engineBreakdown.map((eb) => (
            <div
              key={eb.engine}
              className="flex items-center justify-between text-sm"
            >
              <span className="capitalize text-muted-foreground">
                {eb.engine}
              </span>
              <span className="font-medium">
                {eb.mentioned}/{eb.total} ({eb.score}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
