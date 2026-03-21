import { useActiveBrand } from "@/hooks/useActiveBrand";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { User, CreditCard, Globe, Check, Zap, Building2 } from "lucide-react";

export function Settings() {
  const { user } = useAuth();
  const { activeBrand: brand, brands } = useActiveBrand();
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? "U";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your account and billing</p>
      </div>

      <Tabs defaultValue="profile">
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

        <TabsContent value="billing" className="mt-4 space-y-4">
          {/* Current plan */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Current Plan</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Free Trial</p>
                  <p className="text-xs text-muted-foreground">14-day trial · upgrade anytime</p>
                </div>
                <Badge variant="outline" className="border-primary text-primary">Active</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Upgrade plans */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {/* Starter */}
            <Card className="relative flex flex-col border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-md bg-secondary">
                      <Zap className="size-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm">Starter</CardTitle>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold">$59</span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <ul className="space-y-2 flex-1">
                  {[
                    "10 AI-optimized prompts",
                    "1 brand",
                    "Weekly citation scans",
                    "Gap detection",
                    "Email support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full rounded-md border border-border py-2 text-xs text-muted-foreground cursor-not-allowed"
                >
                  Coming soon
                </button>
              </CardContent>
            </Card>

            {/* Growth — most popular */}
            <Card className="relative flex flex-col border-primary/30 hover:border-primary/60 transition-colors"
              style={{ background: "rgba(200,245,60,0.03)" }}
            >
              <div className="absolute -top-2.5 left-4">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                  Most popular
                </span>
              </div>
              <CardHeader className="pb-3 pt-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-md bg-primary/10">
                      <Building2 className="size-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm">Growth</CardTitle>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold">$149</span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <ul className="space-y-2 flex-1">
                  {[
                    "20 AI-optimized prompts",
                    "3 brands",
                    "Daily citation scans",
                    "Gap detection + analysis",
                    "Reddit execution engine",
                    "Priority support",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full rounded-md border border-primary/30 py-2 text-xs text-primary/60 cursor-not-allowed"
                >
                  Coming soon
                </button>
              </CardContent>
            </Card>

            {/* Scale */}
            <Card className="relative flex flex-col border-border hover:border-primary/40 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-8 items-center justify-center rounded-md bg-secondary">
                      <Zap className="size-4 text-primary" />
                    </div>
                    <CardTitle className="text-sm">Scale</CardTitle>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-semibold">$349</span>
                    <span className="text-xs text-muted-foreground">/mo</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 gap-4">
                <ul className="space-y-2 flex-1">
                  {[
                    "40 AI-optimized prompts",
                    "10 brands",
                    "Real-time citation scans",
                    "Full execution engine (Reddit + Blog)",
                    "Blog post generation",
                    "API access",
                    "Dedicated account manager",
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="size-3.5 mt-0.5 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  disabled
                  className="w-full rounded-md border border-border py-2 text-xs text-muted-foreground cursor-not-allowed"
                >
                  Coming soon
                </button>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Payments launching soon. You'll be notified at {user?.email}.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
