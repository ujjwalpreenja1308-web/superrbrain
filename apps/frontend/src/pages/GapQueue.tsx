import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { useCitations } from "@/hooks/useReport";
import {
  useRedditConnection,
  useConnectReddit,
  useDisconnectReddit,
  useRedditMonitors,
  useCreateRedditMonitor,
  useRunRedditMonitor,
  useRedditPosts,
  useUpdateRedditPost,
  useUpdateRedditMonitor,
} from "@/hooks/useReddit";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ExternalLink,
  Loader2,
  Plus,
  X,
  Zap,
  Check,
  Copy,
  Link2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ArrowRight,
  Search,
  Hash,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { RedditPost } from "@covable/shared";

// ── Automode Disclaimer Modal ─────────────────────────────────────────────────

function AutomodeModal({ onAccept, onCancel }: { onAccept: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md animate-in fade-in slide-in-from-bottom-6 duration-300 rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start gap-3 mb-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 border border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning" />
          </div>
          <div>
            <h3 className="font-semibold text-base">Enable Automode?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Read before you turn this on</p>
          </div>
        </div>

        <div className="space-y-3 text-sm text-muted-foreground mb-6">
          <p>
            Automode will post AI-generated replies to matching Reddit threads on your behalf, without manual approval for each one.
          </p>
          <p>
            Replies are spaced out and capped to stay within Reddit's limits. We do our best to keep things safe.
          </p>
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 px-4 py-3 text-xs text-destructive/80 leading-relaxed">
            <strong className="text-destructive">Note:</strong> Automated posting carries risk. We are not responsible for any Reddit account restrictions or bans that may occur. Use at your own discretion.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/40"
          >
            Cancel
          </button>
          <button
            onClick={onAccept}
            className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.98]"
          >
            Enable automode
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tag Input ─────────────────────────────────────────────────────────────────

function TagInput({
  placeholder,
  values,
  onChange,
  max,
  prefix,
  autoFocus,
}: {
  placeholder: string;
  values: string[];
  onChange: (v: string[]) => void;
  max: number;
  prefix?: string;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");

  function add() {
    const val = input.trim().replace(/^\/?(r\/)?/, "");
    if (!val) return;
    if (values.includes(val) || values.length >= max) return;
    onChange([...values, val]);
    setInput("");
  }

  function remove(i: number) {
    onChange(values.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground/60 pointer-events-none select-none">
              {prefix}
            </span>
          )}
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder={placeholder}
            autoFocus={autoFocus}
            className={`w-full rounded-xl border border-border bg-background py-3 text-sm placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-colors ${prefix ? "pl-8 pr-4" : "px-4"}`}
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!input.trim() || values.length >= max}
          className="rounded-xl border border-border px-4 py-3 text-sm hover:bg-muted/40 transition-colors disabled:opacity-30"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {values.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {values.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg bg-secondary border border-border/50 px-3 py-1.5 text-xs font-medium animate-in fade-in zoom-in-95 duration-150"
            >
              {prefix}{v}
              <button
                onClick={() => remove(i)}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/40">{values.length} / {max}</p>
    </div>
  );
}

// ── Post Card ─────────────────────────────────────────────────────────────────

function PostCard({ post }: { post: RedditPost }) {
  const [expanded, setExpanded] = useState(false);
  const [editingReply, setEditingReply] = useState(false);
  const [replyText, setReplyText] = useState(post.ai_reply ?? "");
  const updatePost = useUpdateRedditPost();

  function copyReply() {
    navigator.clipboard.writeText(replyText);
    toast.success("Copied");
  }

  function handleApprove() {
    updatePost.mutate({ postId: post.id, data: { reply_status: "approved", ai_reply: replyText } });
  }

  function handleReject() {
    updatePost.mutate({ postId: post.id, data: { reply_status: "rejected" } });
  }

  const statusStyle: Record<string, string> = {
    pending: "border-border text-muted-foreground",
    approved: "border-primary/40 text-primary",
    posted: "border-success/40 text-success",
    rejected: "border-destructive/20 text-destructive/60",
  };

  return (
    <div className="rounded-xl border border-border bg-card hover:border-primary/20 transition-colors p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[11px] text-muted-foreground/70 font-medium">r/{post.subreddit}</span>
            <span className={`inline-flex items-center rounded-md border px-1.5 py-0 text-[10px] ${statusStyle[post.reply_status] ?? ""}`}>
              {post.reply_status}
            </span>
            {post.matched_keyword && (
              <span className="text-[10px] text-muted-foreground/40">
                via "{post.matched_keyword}"
              </span>
            )}
          </div>
          <a
            href={post.post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:text-primary transition-colors line-clamp-2 leading-snug"
          >
            {post.post_title}
          </a>
          {post.upvotes != null && (
            <p className="text-[10px] text-muted-foreground/40 mt-1">
              {post.upvotes} upvotes &middot; {post.comment_count ?? 0} comments
            </p>
          )}
        </div>
        <a
          href={post.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors mt-0.5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {post.ai_reply && post.reply_status !== "rejected" && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? "Hide reply" : "View AI reply"}
          </button>

          {expanded && (
            <div className="mt-2 rounded-xl bg-secondary/40 border border-border/50 p-3 space-y-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
              {editingReply ? (
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 transition-colors resize-none"
                />
              ) : (
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{replyText}</p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  <button
                    onClick={copyReply}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Copy className="h-3 w-3" /> Copy
                  </button>
                  <button
                    onClick={() => setEditingReply(!editingReply)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    {editingReply ? "Done" : "Edit"}
                  </button>
                </div>

                {post.reply_status === "pending" && (
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleReject}
                      disabled={updatePost.isPending}
                      className="rounded-lg border border-destructive/20 px-2.5 py-1 text-xs text-destructive/60 hover:bg-destructive/5 transition-colors disabled:opacity-40"
                    >
                      Reject
                    </button>
                    <button
                      onClick={handleApprove}
                      disabled={updatePost.isPending}
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
                    >
                      {updatePost.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      Post
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Reddit Citation Card ──────────────────────────────────────────────────────

function RedditCitationCard({ url, prompt, brandName }: { url: string; prompt: string; brandName: string }) {
  const [copied, setCopied] = useState(false);
  const suggestedReply = `Great thread! For anyone looking into this, ${brandName} is worth checking out. Happy to answer questions.`;

  function copy() {
    navigator.clipboard.writeText(suggestedReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-xl border border-border bg-card hover:border-primary/20 transition-colors p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Link2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline break-all leading-snug"
          >
            {url}
          </a>
          {prompt && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5 truncate">cited for: "{prompt}"</p>
          )}
        </div>
        <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground/30 hover:text-primary transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="rounded-xl bg-secondary/40 border border-border/50 px-3 py-2.5 space-y-2">
        <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Suggested comment</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{suggestedReply}</p>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`rounded-full transition-all duration-300 ${
            i === current
              ? "w-5 h-1.5 bg-primary"
              : i < current
              ? "w-1.5 h-1.5 bg-primary/40"
              : "w-1.5 h-1.5 bg-border"
          }`}
        />
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type OnboardingStep = "keywords" | "subreddits" | "scanning" | "results";

export function GapQueue() {
  const [searchParams] = useSearchParams();
  const { activeBrand: brand } = useActiveBrand();

  const { data: connection, refetch: refetchConnection } = useRedditConnection();
  const connectReddit = useConnectReddit();
  const disconnectReddit = useDisconnectReddit();

  const { data: monitors, isLoading: monitorsLoading } = useRedditMonitors();
  const createMonitor = useCreateRedditMonitor();

  const activeMonitor = monitors?.find((m) => m.brand_id === brand?.id) ?? null;

  // Track monitor ID in state so it's immediately available after creation
  // even before the monitors query has refetched
  const [monitorIdOverride, setMonitorIdOverride] = useState<string | null>(null);
  const resolvedMonitorId = monitorIdOverride ?? activeMonitor?.id;

  const [isScanning, setIsScanning] = useState(false);
  const runMonitor = useRunRedditMonitor();
  const { data: posts, isLoading: postsLoading } = useRedditPosts(resolvedMonitorId, isScanning);

  const updateMonitor = useUpdateRedditMonitor(activeMonitor?.id ?? "");

  const { data: citations } = useCitations(brand?.id);
  const redditCitations = (citations ?? [])
    .filter((c) => c.url.includes("reddit.com"))
    .map((c) => ({ url: c.url, prompt: c.title ?? "" }));

  // Local form state
  const [keywords, setKeywords] = useState<string[]>([]);
  const [subreddits, setSubreddits] = useState<string[]>([]);
  const [automode, setAutomode] = useState(false);
  const [showAutomodeModal, setShowAutomodeModal] = useState(false);

  // Onboarding step
  const [step, setStep] = useState<OnboardingStep>("keywords");
  const [animKey, setAnimKey] = useState(0);

  // On initial load only: if there's an existing monitor with posts, jump to results
  const [hasAutoJumped, setHasAutoJumped] = useState(false);
  useEffect(() => {
    if (!hasAutoJumped && !monitorsLoading && activeMonitor && posts && posts.length > 0) {
      setHasAutoJumped(true);
      setStep("results");
    }
  }, [monitorsLoading, activeMonitor, posts, hasAutoJumped]);

  // Stop scanning when posts arrive
  useEffect(() => {
    if (posts && posts.length > 0 && isScanning) {
      setIsScanning(false);
      setStep("results");
    }
  }, [posts, isScanning]);

  // Handle OAuth callback
  useEffect(() => {
    if (searchParams.get("connected") === "1") {
      refetchConnection();
      toast.success("Reddit connected!");
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (searchParams.get("error") === "connection_failed") {
      toast.error("Reddit connection failed. Please try again.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [searchParams]);

  function goTo(s: OnboardingStep) {
    setAnimKey((k) => k + 1);
    setStep(s);
  }

  async function handleRun() {
    if (!brand) return;
    goTo("scanning");
    try {
      let monitorId = activeMonitor?.id ?? monitorIdOverride ?? undefined;
      if (!monitorId) {
        const created = await createMonitor.mutateAsync({ brand_id: brand.id, keywords, subreddits, automode });
        monitorId = created.id;
        setMonitorIdOverride(monitorId);
      } else {
        // Update the existing monitor with the new keywords/subreddits the user entered
        await updateMonitor.mutateAsync({ keywords, subreddits });
      }
      setIsScanning(true);
      await runMonitor.mutateAsync(monitorId);
    } catch {
      goTo("subreddits");
    }
  }

  function handleAutomodeToggle() {
    const current = activeMonitor ? activeMonitor.automode : automode;
    if (!current) {
      setShowAutomodeModal(true);
    } else {
      if (activeMonitor) updateMonitor.mutate({ automode: false });
      else setAutomode(false);
    }
  }

  function handleAcceptAutomode() {
    setShowAutomodeModal(false);
    if (activeMonitor) updateMonitor.mutate({ automode: true });
    else setAutomode(true);
  }

  const currentAutomode = activeMonitor ? activeMonitor.automode : automode;

  // Loading state while we figure out if they have a monitor
  if (monitorsLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stepIndex = { keywords: 0, subreddits: 1, scanning: 2, results: 2 }[step];
  const isOnboarding = step !== "results";

  return (
    <>
      {showAutomodeModal && (
        <AutomodeModal onAccept={handleAcceptAutomode} onCancel={() => setShowAutomodeModal(false)} />
      )}

      {/* Onboarding flow: centered single-focus layout */}
      {isOnboarding && (
        <div className="flex min-h-[70vh] items-center justify-center px-4">
          <div className="w-full max-w-md">
            {step !== "scanning" && <StepDots total={3} current={stepIndex} />}

            {/* Step: keywords */}
            {step === "keywords" && (
              <div
                key={`keywords-${animKey}`}
                className="animate-in fade-in slide-in-from-bottom-4 duration-400"
                style={{ animationFillMode: "both" }}
              >
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-150 animate-pulse" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                      <Search className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </div>

                <div className="text-center mb-8">
                  <h1 className="text-2xl font-semibold tracking-tight mb-2">
                    What are people searching for?
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Add keywords that describe your product or the problems it solves.
                  </p>
                </div>

                <TagInput
                  placeholder="e.g. project management software"
                  values={keywords}
                  onChange={setKeywords}
                  max={10}
                  autoFocus
                />

                <button
                  onClick={() => goTo("subreddits")}
                  disabled={keywords.length === 0}
                  className="group mt-6 w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Continue
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>

                <p className="text-center text-xs text-muted-foreground/40 mt-4">
                  Up to 10 keywords
                </p>
              </div>
            )}

            {/* Step: subreddits */}
            {step === "subreddits" && (
              <div
                key={`subreddits-${animKey}`}
                className="animate-in fade-in slide-in-from-bottom-4 duration-400"
                style={{ animationFillMode: "both" }}
              >
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl scale-150 animate-pulse" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 border border-primary/20">
                      <Hash className="h-6 w-6 text-primary" />
                    </div>
                  </div>
                </div>

                <div className="text-center mb-8">
                  <h1 className="text-2xl font-semibold tracking-tight mb-2">
                    Which subreddits matter?
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Pick the communities your audience hangs out in.
                  </p>
                </div>

                <TagInput
                  placeholder="entrepreneur"
                  values={subreddits}
                  onChange={setSubreddits}
                  max={5}
                  prefix="r/"
                  autoFocus
                />

                <div className="mt-6 space-y-3">
                  <button
                    onClick={handleRun}
                    disabled={subreddits.length === 0}
                    className="group w-full rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/20 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <Zap className="h-4 w-4" />
                    Find threads
                  </button>

                  <button
                    onClick={() => goTo("keywords")}
                    className="w-full rounded-xl px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                </div>

                <p className="text-center text-xs text-muted-foreground/40 mt-3">
                  Up to 5 subreddits
                </p>
              </div>
            )}

            {/* Step: scanning */}
            {step === "scanning" && (
              <div
                key={`scanning-${animKey}`}
                className="animate-in fade-in slide-in-from-bottom-4 duration-400 text-center"
                style={{ animationFillMode: "both" }}
              >
                <div className="flex justify-center mb-8">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/30 blur-2xl scale-[2] animate-pulse" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                      <Loader2 className="h-7 w-7 text-primary animate-spin" />
                    </div>
                  </div>
                </div>

                <h2 className="text-xl font-semibold mb-2">Scanning Reddit</h2>
                <p className="text-sm text-muted-foreground mb-8">
                  Finding threads that match your keywords across {subreddits.length} subreddit{subreddits.length !== 1 ? "s" : ""}...
                </p>

                <div className="space-y-2 text-left">
                  {[
                    "Fetching recent posts",
                    "Matching your keywords",
                    "Generating AI replies",
                  ].map((label, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-xl px-4 py-2.5 bg-secondary/30 border border-border/40"
                      style={{ animationDelay: `${i * 300}ms` }}
                    >
                      <span className="flex gap-0.5">
                        {[0, 1, 2].map((d) => (
                          <span
                            key={d}
                            className="inline-block h-1 w-1 rounded-full bg-primary animate-bounce"
                            style={{ animationDelay: `${i * 300 + d * 150}ms` }}
                          />
                        ))}
                      </span>
                      <span className="text-sm text-muted-foreground">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results view */}
      {step === "results" && (
        <div
          key="results"
          className="animate-in fade-in slide-in-from-bottom-4 duration-400 space-y-6 h-full"
          style={{ animationFillMode: "both" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Reddit Engine</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {posts?.length ?? 0} thread{(posts?.length ?? 0) !== 1 ? "s" : ""} found
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => { setKeywords(activeMonitor?.keywords ?? []); setSubreddits(activeMonitor?.subreddits ?? []); goTo("keywords"); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                New scan
              </button>

              {/* Reddit connect — small side button */}
              {connection?.connected ? (
                <button
                  onClick={() => disconnectReddit.mutate()}
                  disabled={disconnectReddit.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-destructive hover:border-destructive/20 transition-colors disabled:opacity-50"
                >
                  {disconnectReddit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  u/{connection.username ?? "reddit"}
                </button>
              ) : (
                <button
                  onClick={() => connectReddit.mutate()}
                  disabled={connectReddit.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
                >
                  {connectReddit.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  Connect Reddit
                </button>
              )}

              {/* Automode toggle */}
              <button
                onClick={handleAutomodeToggle}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-all ${
                  currentAutomode
                    ? "bg-primary/10 border-primary/30 text-primary"
                    : "bg-transparent border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                <Zap className={`h-3.5 w-3.5 ${currentAutomode ? "fill-primary" : ""}`} />
                Automode
              </button>
            </div>
          </div>

          {/* Pending config banner */}
          {activeMonitor?.pending_keywords && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400/80">
              <Clock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                Keyword/subreddit changes saved — will take effect from next Monday's scan.
                {activeMonitor.pending_keywords.length > 0 && (
                  <> New keywords: {activeMonitor.pending_keywords.join(", ")}.</>
                )}
              </span>
            </div>
          )}

          {/* AI-cited Reddit threads */}
          {redditCitations.length > 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold">Already cited by ChatGPT</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  These Reddit threads appeared in your AI visibility scan. Comment to reinforce your presence.
                </p>
              </div>
              {redditCitations.slice(0, 5).map((c, i) => (
                <RedditCitationCard key={i} url={c.url} prompt={c.prompt} brandName={brand?.name ?? "your brand"} />
              ))}
            </div>
          )}

          {/* Posts */}
          <div className="space-y-3">
            {posts && posts.length > 0 && (
              <p className="text-xs text-muted-foreground/60 uppercase tracking-wider font-medium">Matching threads</p>
            )}

            {postsLoading || isScanning ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-border p-4 space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                ))}
              </div>
            ) : posts && posts.length > 0 ? (
              posts.map((post) => <PostCard key={post.id} post={post} />)
            ) : (
              <div className="rounded-xl border border-border py-14 text-center text-sm text-muted-foreground">
                No threads found yet.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
