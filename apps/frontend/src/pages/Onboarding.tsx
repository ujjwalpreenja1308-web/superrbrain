import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { PromptEditor } from "@/components/PromptEditor";
import { useCreateBrand, useBrand, usePrompts, useUpdatePrompts, useRunMonitoring } from "@/hooks/useBrand";
import { Globe, Loader2, ArrowRight } from "lucide-react";

export function Onboarding() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [step, setStep] = useState<"url" | "analyzing" | "prompts" | "running">("url");

  const createBrand = useCreateBrand();
  const { data: brand } = useBrand(brandId ?? undefined);
  const { data: prompts } = usePrompts(
    brand?.status === "ready" ? brandId ?? undefined : undefined
  );
  const updatePrompts = useUpdatePrompts(brandId ?? "");
  const runMonitoring = useRunMonitoring(brandId ?? "");

  // Transition to prompts step when brand is ready
  if (step === "analyzing" && brand?.status === "ready" && prompts) {
    setStep("prompts");
  }

  // Transition to dashboard when monitoring finishes
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
      const result = await createBrand.mutateAsync({ url: normalizeUrl(url), country: country || undefined, city: city || undefined });
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

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4">
      <Card className="w-full max-w-2xl">
        {step === "url" && (
          <>
            <CardHeader className="text-center">
              <Globe className="mx-auto h-10 w-10 text-primary mb-2" />
              <CardTitle className="text-2xl">
                Enter your brand website
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                We'll analyze your brand and find out where you stand in AI
                search
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmitUrl} className="space-y-4">
                <Input
                  type="text"
                  placeholder="yourbrand.com"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Input
                      type="text"
                      placeholder="Country code (e.g. IN, US, GB)"
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase().slice(0, 2))}
                      maxLength={2}
                    />
                  </div>
                  <div>
                    <Input
                      type="text"
                      placeholder="City (optional)"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  Location helps AI search show region-specific results
                </p>
                {createBrand.error && (
                  <p className="text-sm text-destructive">
                    {createBrand.error.message}
                  </p>
                )}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createBrand.isPending}
                >
                  {createBrand.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Analyze My Brand"
                  )}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {step === "analyzing" && (
          <>
            <CardHeader className="text-center">
              <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-2" />
              <CardTitle>Analyzing your brand...</CardTitle>
              <p className="text-sm text-muted-foreground">
                Scraping your website, identifying competitors, and generating
                search prompts. This usually takes under 2 minutes.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Status:{" "}
                  <span className="text-foreground capitalize">
                    {brand?.status || "pending"}
                  </span>
                </p>
                {brand?.name && (
                  <p>
                    Brand:{" "}
                    <span className="text-foreground">{brand.name}</span>
                  </p>
                )}
                {brand?.category && (
                  <p>
                    Category:{" "}
                    <span className="text-foreground">{brand.category}</span>
                  </p>
                )}
              </div>
            </CardContent>
          </>
        )}

        {step === "prompts" && prompts && (
          <>
            <CardHeader>
              <CardTitle>Review Search Prompts</CardTitle>
              <p className="text-sm text-muted-foreground">
                These are the queries we'll fire at AI engines. Toggle, edit,
                or add your own.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <PromptEditor
                prompts={prompts}
                onSave={handleSavePrompts}
                saving={updatePrompts.isPending}
              />
              <Button
                onClick={handleStartMonitoring}
                className="w-full"
                size="lg"
                disabled={runMonitoring.isPending}
              >
                {runMonitoring.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    Start Monitoring
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </>
        )}

        {step === "running" && (
          <>
            <CardHeader className="text-center">
              <Loader2 className="mx-auto h-10 w-10 text-primary animate-spin mb-2" />
              <CardTitle>Running AI monitoring...</CardTitle>
              <p className="text-sm text-muted-foreground">
                Firing {prompts?.filter((p) => p.is_active).length || 0}{" "}
                prompts across 2 AI engines. Analyzing citations and computing
                your visibility score.
              </p>
            </CardHeader>
          </>
        )}
      </Card>
    </div>
  );
}
