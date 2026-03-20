import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: number;
  suffix?: string;
  icon: LucideIcon;
  color?: string;
  subtext?: string;
}

export function StatCard({ label, value, suffix = "", icon: Icon, color, subtext }: StatCardProps) {
  const animated = useAnimatedNumber(value);

  return (
    <Card className="hover:shadow-md hover:shadow-primary/5 transition-shadow duration-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <Icon className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={cn("text-xl font-bold tabular-nums", color)}>
              {animated}{suffix}
            </p>
            {subtext && (
              <p className="text-xs text-muted-foreground truncate">{subtext}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
