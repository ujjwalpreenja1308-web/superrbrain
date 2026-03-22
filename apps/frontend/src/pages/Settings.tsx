import { useState } from "react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { useAuth } from "@/hooks/useAuth";
import { usePlan, getPlanLimits } from "@/hooks/usePlan";
import { useSearchParams } from "react-router-dom";
import type { PlanTier } from "@/hooks/usePlan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, CreditCard, Globe, Check, X, Zap, Building2, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

// Dodo product IDs from env — set VITE_DODO_PRODUCT_* in Vercel/local env
const DODO_PRODUCTS: Record<string, string> = {
  starter_monthly: import.meta.env.VITE_DODO_PRODUCT_STARTER_MONTHLY ?? "",
  starter_annual:  import.meta.env.VITE_DODO_PRODUCT_STARTER_ANNUAL  ?? "",
  growth_monthly:  import.meta.env.VITE_DODO_PRODUCT_GROWTH_MONTHLY  ?? "",
  growth_annual:   import.meta.env.VITE_DODO_PRODUCT_GROWTH_ANNUAL   ?? "",
  scale_monthly:   import.meta.env.VITE_DODO_PRODUCT_SCALE_MONTHLY   ?? "",
  scale_annual:    import.meta.env.VITE_DODO_PRODUCT_SCALE_ANNUAL    ?? "",
};

function buildCheckoutUrl(productKey: string, email: string, userId: string): string {
  const productId = DODO_PRODUCTS[productKey];
  if (!productId) return "#";
  const params = new URLSearchParams({
    email,
    "metadata[user_id]": userId,
  });
  return `https://checkout.dodopayments.com/buy/${productId}?${params.toString()}`;
}

interface PlanCardProps {
  tier: PlanTier;
  name: string;
  monthlyPrice: number;
  annualMonthlyPrice: number;
  features: { label: string; included: boolean }[];
  isPopular?: boolean;
  isCurrent: boolean;
  isAnnual: boolean;
  userEmail: string;
  userId: string;
}

function PlanCard({ tier, name, monthlyPrice, annualMonthlyPrice, features, isPopular, isCurrent, isAnnual, userEmail, userId }: PlanCardProps) {
  const price = isAnnual ? annualMonthlyPrice : monthlyPrice;
  const linkKey = `${tier}_${isAnnual ? "annual" : "monthly"}`;
  const checkoutUrl = buildCheckoutUrl(linkKey, userEmail, userId);

  const isStarter = tier === "starter";

  return (
    <Card className={cn(
      "relative flex flex-col transition-colors",
      isPopular ? "border-primary/40 bg-primary/[0.03]" : "border-border hover:border-primary/30",
      isCurrent && "ring-1 ring-primary/50"
    )}>
      {isPopular && (
        <div className="absolute -top-2.5 left-4">
          <span className="bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 rounded-full">
            Most popular
          </span>
        </div>
      )}

      <CardHeader className={cn("pb-3", isPopular && "pt-5")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex size-7 items-center justify-center rounded-md",
              isPopular ? "bg-primary/10" : "bg-secondary"
            )}>
              {tier === "starter" && <Zap className="size-3.5 text-primary" />}
              {tier === "growth" && <Building2 className="size-3.5 text-primary" />}
              {tier === "scale" && <Layers className="size-3.5 text-primary" />}
            </div>
            <CardTitle className="text-sm">{name}</CardTitle>
          </div>
          <div className="text-right">
            <span className="text-lg font-semibold">${price}</span>
            <span className="text-xs text-muted-foreground">/mo</span>
          </div>
        </div>
        {isAnnual && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Billed ${monthlyPrice * 10}/yr · save ${(monthlyPrice - annualMonthlyPrice) * 12}/yr
          </p>
        )}
      </CardHeader>

      <CardContent className="flex flex-col flex-1 gap-4">
        <ul className="space-y-1.5 flex-1">
          {features.map((f) => (
            <li key={f.label} className="flex items-start gap-2 text-xs text-muted-foreground">
              {f.included
                ? <Check className="size-3.5 mt-0.5 shrink-0 text-primary" />
                : <X className="size-3.5 mt-0.5 shrink-0 text-muted-foreground/40" />
              }
              <span className={!f.included ? "opacity-40" : ""}>{f.label}</span>
            </li>
          ))}
        </ul>

        {isCurrent ? (
          <div className="w-full rounded-md border border-primary/30 py-2 text-xs text-primary text-center font-medium">
            Current plan
          </div>
        ) : (
          <div className="space-y-1.5">
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "block w-full rounded-md py-2 text-xs text-center font-medium transition-colors",
                isPopular
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "border border-border hover:border-primary/40 text-foreground"
              )}
            >
              {isStarter && !isCurrent ? "Try 3 days free" : "Get started"}
            </a>
            {isStarter && (
              <p className="text-[10px] text-muted-foreground text-center">
                Card required · cancel before day 3
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function Settings() {
  const { user } = useAuth();
  const { activeBrand: brand, brands } = useActiveBrand();
  const plan = usePlan();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";
  const [searchParams] = useSearchParams();
  // ?plan= from landing page CTA — open billing tab automatically
  const incomingPlan = searchParams.get("plan");
  const defaultTab = incomingPlan ? "billing" : "profile";

  const plans: { tier: PlanTier; name: string; monthly: number; annual: number; features: { label: string; included: boolean }[] }[] = [
    {
      tier: "starter",
      name: "Starter",
      monthly: 59,
      annual: 49,
      features: [
        { label: "10 AI-optimized prompts", included: true },
        { label: "1 brand", included: true },
        { label: "Weekly citation scans", included: true },
        { label: "Gap detection", included: true },
        { label: "Email support", included: true },
        { label: "Reddit execution engine", included: false },
        { label: "AEO-optimized blog assist", included: false },
      ],
    },
    {
      tier: "growth",
      name: "Growth",
      monthly: 149,
      annual: 124,
      features: [
        { label: "20 AI-optimized prompts", included: true },
        { label: "3 brands", included: true },
        { label: "Daily citation scans", included: true },
        { label: "Gap detection + analysis", included: true },
        { label: "Priority support", included: true },
        { label: "Reddit execution engine", included: true },
        { label: "AEO-optimized blog assist", included: false },
      ],
    },
    {
      tier: "scale",
      name: "Scale",
      monthly: 349,
      annual: 290,
      features: [
        { label: "40 AI-optimized prompts", included: true },
        { label: "10 brands", included: true },
        { label: "Daily citation scans", included: true },
        { label: "Full execution engine", included: true },
        { label: "AEO-optimized blog assist", included: true },
        { label: "API access", included: true },
        { label: "Dedicated account manager", included: true },
      ],
    },
  ];

  const [isAnnual, setIsAnnual] = useState(false);

  function toggleBilling(annual: boolean) {
    setIsAnnual(annual);
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and billing</p>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="profile">
            <User className="size-4" />
            Profile
          </TabsTrigger>
          <TabsTrigger value="billing">
            <CreditCard className="size-4" />
            Billing
          </TabsTrigger>
        </TabsList>

        {/* ── PROFILE ── */}
        <TabsContent value="profile" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="size-12">
                  <AvatarFallback className="bg-primary/20 text-primary text-lg">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Account ID: {user?.id?.slice(0, 8)}...</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {brands.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Globe className="size-4" />
                  Brands
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {brands.map((b) => (
                  <div
                    key={b.id}
                    className={`space-y-2 rounded-md p-3 -mx-1 ${b.id === brand?.id ? "bg-secondary" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{b.name || b.url}</span>
                      <div className="flex items-center gap-2">
                        {b.id === brand?.id && (
                          <Badge variant="default" className="text-[10px]">Active</Badge>
                        )}
                        <Badge variant="outline">{b.status}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{b.url}</span>
                      <span>{b.category || "—"}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── BILLING ── */}
        <TabsContent value="billing" className="mt-4 space-y-5">

          {/* Current plan summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{getPlanLimits(plan.tier).label}</p>
                  <p className="text-xs text-muted-foreground">
                    {plan.tier === "trial"
                      ? "3-day trial · upgrade to keep access"
                      : `$${plan.price}/mo · cancel anytime`}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={plan.tier === "trial" ? "border-yellow-500/50 text-yellow-500" : "border-primary/50 text-primary"}
                >
                  {plan.tier === "trial" ? "Trial" : "Active"}
                </Badge>
              </div>

              {/* Usage bar */}
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Brands</span>
                  <span>{brands.length} / {plan.maxBrands}</span>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${Math.min((brands.length / plan.maxBrands) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly / Annual toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => toggleBilling(false)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors",
                !isAnnual ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
              )}
            >
              Monthly
            </button>
            <button
              onClick={() => toggleBilling(true)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5",
                isAnnual ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
              )}
            >
              Annual
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded",
                isAnnual ? "bg-white/20" : "bg-primary/10 text-primary"
              )}>
                Save 17%
              </span>
            </button>
          </div>

          {/* Plan cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {plans.map((p) => (
              <PlanCard
                key={p.tier}
                tier={p.tier}
                name={p.name}
                monthlyPrice={p.monthly}
                annualMonthlyPrice={p.annual}
                features={p.features}
                isPopular={p.tier === "growth"}
                isCurrent={plan.tier === p.tier}
                isAnnual={isAnnual}
                userEmail={user?.email ?? ""}
                userId={user?.id ?? ""}
              />
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            Payments are processed securely by Dodo Payments. Questions?{" "}
            <a href="mailto:support@covable.app" className="underline underline-offset-2 hover:text-foreground">
              support@covable.app
            </a>
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
