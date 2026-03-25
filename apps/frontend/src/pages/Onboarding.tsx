import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PromptEditor } from "@/components/PromptEditor";
import { useCreateBrand, useBrand, usePrompts, useUpdatePrompts, useRunMonitoring } from "@/hooks/useBrand";
import { Globe, Loader2, ArrowRight, Sparkles, Search, BarChart3, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api";

export function Onboarding() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);

  const { data: regionsData } = useQuery({
    queryKey: ["regions"],
    queryFn: () => api.get<{ regions: { code: string; label: string }[] }>("/api/regions"),
  });

  const [step, setStep] = useState<"url" | "analyzing" | "prompts" | "running">("url");
  const [urlFocused, setUrlFocused] = useState(false);
  const [analyzePhase, setAnalyzePhase] = useState(0);

  const createBrand = useCreateBrand();
  const { data: brand } = useBrand(brandId ?? undefined);
  const { data: prompts } = usePrompts(
    brand?.status === "ready" ? brandId ?? undefined : undefined
  );
  const updatePrompts = useUpdatePrompts(brandId ?? "");
  const runMonitoring = useRunMonitoring(brandId ?? "");

  // Cycle through analysis phases for the loader
  useEffect(() => {
    if (step !== "analyzing") return;
    const interval = setInterval(() => {
      setAnalyzePhase((p) => (p + 1) % analyzeSteps.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [step]);

  if (step === "analyzing" && brand?.status === "ready" && prompts) {
    setStep("prompts");
  }

  if (step === "running" && brand?.status === "ready") {
    navigate(`/dashboard`);
  }

  function normalizeUrl(raw: string): string {
    let u = raw.trim();
    if (!u.startsWith("http://") && !u.startsWith("https://")) {
      u = "https://" + u;
    }
    return u;
  }

  const handleSubmitUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = await createBrand.mutateAsync({ url: normalizeUrl(url), country: country || undefined });
      localStorage.setItem("covable_brand_id", result.id);
      setBrandId(result.id);
      setStep("analyzing");
    } catch {
      // error shown via mutation state
    }
  };

  const handleSavePrompts = async (
    items: { id?: string; text: string; is_active: boolean }[]
  ) => {
    await updatePrompts.mutateAsync(items);
  };

  const handleStartMonitoring = async () => {
    setStep("running");
    await runMonitoring.mutateAsync();
  };

  const analyzeSteps = [
    { icon: Globe, text: "Scraping your website..." },
    { icon: Search, text: "Identifying competitors..." },
    { icon: Sparkles, text: "Generating AI prompts..." },
    { icon: BarChart3, text: "Building your profile..." },
  ];

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">

        {/* URL Step */}
        {step === "url" && (
          <div
            className="animate-in fade-in slide-in-from-bottom-4 duration-500"
            style={{ animationFillMode: "both" }}
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-150 animate-pulse" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
              </div>
            </div>

            {/* Heading */}
            <div className="text-center mb-8">
              <h1 className="text-2xl font-semibold tracking-tight mb-2">
                Enter your brand website
              </h1>
              <p className="text-sm text-muted-foreground">
                We'll analyze your brand and find out where you stand in AI search
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmitUrl} className="space-y-3">
              {/* URL input with glow on focus */}
              <div className="relative group">
                <div
                  className={`absolute -inset-0.5 rounded-lg bg-gradient-to-r from-primary/40 to-primary/20 blur transition-opacity duration-300 ${urlFocused ? "opacity-100" : "opacity-0"}`}
                />
                <input
                  type="text"
                  placeholder="yourbrand.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onFocus={() => setUrlFocused(true)}
                  onBlur={() => setUrlFocused(false)}
                  required
                  className="relative w-full rounded-lg border border-border bg-card px-4 py-3 text-sm placeholder:text-muted-foreground/50 outline-none transition-colors duration-200 focus:border-primary/50"
                />
              </div>

              {/* Region selector */}
              {regionsData?.regions && regionsData.regions.length > 0 && (
                <div className="space-y-1.5">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    required
                    className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition-colors duration-200 focus:border-primary/50"
                  >
                    <option value="" disabled>Select search region</option>
                    {regionsData.regions.map((r) => (
                      <option key={r.code} value={r.code}>{r.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground/60 px-0.5">
                    AI searches will use the static IP for this region
                  </p>
                </div>
              )}

              {createBrand.error && (
                <p className="text-sm text-destructive px-0.5">
                  {createBrand.error.message}
                </p>
              )}

              {/* CTA button */}
              <button
                type="submit"
                disabled={createBrand.isPending || !url.trim()}
                className="group relative w-full overflow-hidden rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 mt-1"
              >
                <span className="relative flex items-center justify-center gap-2">
                  {createBrand.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      Analyze My Brand
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Footer hint */}
            <p className="text-center text-xs text-muted-foreground/50 mt-6">
              Takes under 2 minutes · No credit card required
            </p>
          </div>
        )}

        {/* Analyzing Step */}
        {step === "analyzing" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
            {/* Animated orb */}
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl scale-[2] animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
              </div>
            </div>

            <h2 className="text-xl font-semibold mb-2">Analyzing your brand</h2>
            <p className="text-sm text-muted-foreground mb-8">
              This usually takes under 2 minutes
            </p>

            {/* Cycling steps */}
            <div className="space-y-2">
              {analyzeSteps.map((s, i) => {
                const Icon = s.icon;
                const isDone = i < analyzePhase;
                const isActive = i === analyzePhase;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-500 ${
                      isActive
                        ? "bg-primary/10 border border-primary/20 text-foreground"
                        : isDone
                        ? "text-muted-foreground/50"
                        : "text-muted-foreground/30"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-primary/70" />
                    ) : (
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                    )}
                    <span className="text-sm">{s.text}</span>
                    {isActive && (
                      <span className="ml-auto flex gap-0.5">
                        {[0, 1, 2].map((d) => (
                          <span
                            key={d}
                            className="inline-block h-1 w-1 rounded-full bg-primary animate-bounce"
                            style={{ animationDelay: `${d * 150}ms` }}
                          />
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Brand info as it comes in */}
            {(brand?.name || brand?.category) && (
              <div className="mt-6 rounded-lg border border-border bg-card/50 px-4 py-3 text-left space-y-1.5">
                {brand.name && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Brand</span>
                    <span className="font-medium">{brand.name}</span>
                  </div>
                )}
                {brand.category && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Category</span>
                    <span className="font-medium">{brand.category}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Prompts Step */}
        {step === "prompts" && prompts && (
          <div
            className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-2xl"
            style={{ animationFillMode: "both" }}
          >
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-1">Review search prompts</h2>
              <p className="text-sm text-muted-foreground">
                These are the queries we'll fire at AI engines. Toggle, edit, or add your own.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-4 mb-4">
              <PromptEditor
                prompts={prompts}
                onSave={handleSavePrompts}
                saving={updatePrompts.isPending}
              />
            </div>

            <button
              onClick={handleStartMonitoring}
              disabled={runMonitoring.isPending}
              className="group w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all duration-200 hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {runMonitoring.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Start Monitoring
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Running Step */}
        {step === "running" && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
            <div className="flex justify-center mb-8">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl scale-[2] animate-pulse" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                  <Loader2 className="h-7 w-7 text-primary animate-spin" />
                </div>
              </div>
            </div>
            <h2 className="text-xl font-semibold mb-2">Running AI monitoring</h2>
            <p className="text-sm text-muted-foreground">
              Firing {prompts?.filter((p) => p.is_active).length || 0} prompts across 2 AI engines.
              Analyzing citations and computing your visibility score.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
