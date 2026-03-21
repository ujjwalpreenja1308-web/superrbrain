import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpgradeGateProps {
  feature: string;
  requiredPlan: "growth" | "scale";
  description?: string;
  className?: string;
}

const PLAN_LABELS: Record<string, string> = {
  growth: "Growth ($149/mo)",
  scale: "Scale ($349/mo)",
};

export function UpgradeGate({ feature, requiredPlan, description, className }: UpgradeGateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[60vh] text-center px-6", className)}>
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-secondary border border-border">
        <Lock className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">{feature}</h2>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        {description ?? `Upgrade to ${PLAN_LABELS[requiredPlan]} to unlock ${feature.toLowerCase()}.`}
      </p>
      <a
        href="/settings#billing"
        className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Upgrade plan
      </a>
      <p className="mt-3 text-xs text-muted-foreground">Cancel anytime · no hidden fees</p>
    </div>
  );
}
