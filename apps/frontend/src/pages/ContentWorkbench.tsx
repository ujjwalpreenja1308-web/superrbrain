import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import {
  useExecutionJob,
  useUpdateContent,
  useDeployContent,
  useStartExecution,
} from "@/hooks/useExecution";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2,
  CheckCircle,
  XCircle,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RotateCw,
} from "lucide-react";

// Approximate stage durations in seconds (used to advance progress indicator)
const STAGES = [
  { label: "Analyzing platform culture", duration: 8 },
  { label: "Deriving brand voice", duration: 6 },
  { label: "Recovering prompt context", duration: 4 },
  { label: "Generating & quality-checking content", duration: 20 },
];

function useGenerationStage(isActive: boolean) {
  const [stageIndex, setStageIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!isActive) {
      setStageIndex(0);
      setElapsed(0);
      startedAt.current = null;
      return;
    }
    if (startedAt.current === null) startedAt.current = Date.now();

    const interval = setInterval(() => {
      const totalElapsed = (Date.now() - startedAt.current!) / 1000;
      setElapsed(totalElapsed);

      let cumulative = 0;
      for (let i = 0; i < STAGES.length; i++) {
        cumulative += STAGES[i].duration;
        if (totalElapsed < cumulative) {
          setStageIndex(i);
          break;
        }
        if (i === STAGES.length - 1) setStageIndex(i);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isActive]);

  const totalDuration = STAGES.reduce((s, st) => s + st.duration, 0);
  const progress = Math.min(95, (elapsed / totalDuration) * 100);

  return { stageIndex, progress };
}

function GenerationProgress() {
  const { stageIndex, progress } = useGenerationStage(true);

  return (
    <Card>
      <CardContent className="py-10 space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-base font-medium">Generating Reddit comment</p>
          <p className="text-xs text-muted-foreground">This takes ~40 seconds</p>
        </div>

        {/* Stage list */}
        <div className="space-y-2.5 max-w-xs mx-auto">
          {STAGES.map((stage, i) => {
            const done = i < stageIndex;
            const active = i === stageIndex;
            return (
              <div key={stage.label} className="flex items-center gap-2.5">
                <div className={`size-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  done ? "bg-primary/20 text-primary" : active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                }`}>
                  {done ? (
                    <CheckCircle className="size-3.5" />
                  ) : active ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <span className="text-[10px] font-medium">{i + 1}</span>
                  )}
                </div>
                <span className={`text-xs transition-colors ${
                  done ? "text-muted-foreground line-through" : active ? "text-foreground font-medium" : "text-muted-foreground"
                }`}>
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="max-w-xs mx-auto">
          <div className="h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground text-right mt-1">{Math.round(progress)}%</p>
        </div>
      </CardContent>
    </Card>
  );
}

function QualityScoreBadge({ label, score }: { label: string; score: number }) {
  const color = score >= 8 ? "text-green-600" : score >= 6 ? "text-yellow-600" : "text-red-600";
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{score}/10</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ContentWorkbench() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { activeBrand: brand } = useActiveBrand();

  const { data: jobData, isLoading: jobLoading } = useExecutionJob(brand?.id, jobId);
  const content = jobData?.content;

  const updateContent = useUpdateContent(brand?.id || "", content?.id || "");
  const deployContent = useDeployContent(brand?.id || "", content?.id || "");
  const startExecution = useStartExecution(brand?.id || "");

  const [editedBody, setEditedBody] = useState<string | null>(null);
  const [deployUrl, setDeployUrl] = useState("");
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const currentBody = editedBody ?? content?.content_body ?? "";
  const isDirty = editedBody !== null && editedBody !== content?.content_body;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentBody);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!isDirty || !content) return;
    await updateContent.mutateAsync({ content_body: editedBody! });
    setEditedBody(null);
  };

  const handleApprove = async () => {
    if (!content) return;
    if (isDirty) await updateContent.mutateAsync({ content_body: editedBody! });
    await updateContent.mutateAsync({ status: "approved" });
    setEditedBody(null);
  };

  const handleReject = async () => {
    if (!content) return;
    await updateContent.mutateAsync({ status: "rejected" });
  };

  const handleDeploy = async () => {
    if (!deployUrl || !content) return;
    await deployContent.mutateAsync(deployUrl);
  };

  const handleRegenerate = async () => {
    if (!jobData) return;
    const result = await startExecution.mutateAsync(jobData.citation_gap_id);
    navigate(`/content/${result.job_id}`);
  };

  if (jobLoading) {
    return (
      <>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </>
    );
  }

  // Pending / running state
  if (jobData?.status === "pending" || jobData?.status === "running") {
    return (
      <div className="max-w-md mx-auto pt-8">
        <GenerationProgress />
      </div>
    );
  }

  // Failed state
  if (jobData?.status === "failed") {
    return (
      <>
        <div className="max-w-2xl mx-auto space-y-6">
          <h1 className="text-2xl font-bold">Generation Failed</h1>
          <Card className="border-destructive/50">
            <CardContent className="py-8 space-y-4">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <p className="font-medium">Content generation failed</p>
              </div>
              {jobData.error_message && (
                <p className="text-sm text-muted-foreground font-mono bg-muted p-3 rounded">
                  {jobData.error_message}
                </p>
              )}
              <Button onClick={handleRegenerate} disabled={startExecution.isPending}>
                {startExecution.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  // No content yet
  if (!content) {
    return (
      <>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No content available yet.
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  const scores = content.quality_scores as Record<string, number>;
  const isDeployed = content.status === "deployed";
  const isApproved = content.status === "approved";

  return (
    <>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Content Workbench</h1>
          <div className="flex items-center gap-2">
            <Badge variant={isDeployed ? "default" : isApproved ? "secondary" : "outline"}>
              {content.status}
            </Badge>
            {content.generation_attempt > 1 && (
              <Badge variant="outline" className="text-xs">
                Attempt {content.generation_attempt}
              </Badge>
            )}
          </div>
        </div>

        {/* Quality Scores */}
        {Object.keys(scores).length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Quality Scores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 gap-4">
                <QualityScoreBadge label="Human" score={scores.human_sounding || 0} />
                <QualityScoreBadge label="Platform" score={scores.platform_match || 0} />
                <QualityScoreBadge label="Natural" score={scores.natural_brand_mention || 0} />
                <QualityScoreBadge label="On-topic" score={scores.addresses_query || 0} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Strategy Reasoning (collapsible) */}
        {content.strategy_reasoning && (
          <div>
            <button
              onClick={() => setStrategyOpen((o) => !o)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {strategyOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Strategy reasoning
            </button>
            {strategyOpen && (
              <Card className="mt-2">
                <CardContent className="py-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Angle: {content.angle_used}</p>
                  <p>{content.strategy_reasoning}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Content Editor */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Reddit Comment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={currentBody}
              onChange={(e) => setEditedBody(e.target.value)}
              className="min-h-[180px] font-mono text-sm"
              disabled={isDeployed}
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleCopy}>
                <Copy className="h-4 w-4" />
                {copied ? "Copied!" : "Copy"}
              </Button>
              {isDirty && !isDeployed && (
                <Button size="sm" variant="outline" onClick={handleSave} disabled={updateContent.isPending}>
                  Save edits
                </Button>
              )}
              {!isDeployed && !isApproved && (
                <>
                  <Button size="sm" onClick={handleApprove} disabled={updateContent.isPending}>
                    <CheckCircle className="h-4 w-4" />
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleReject} disabled={updateContent.isPending}>
                    <XCircle className="h-4 w-4" />
                    Reject
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={startExecution.isPending}>
                    <RotateCw className="h-4 w-4" />
                    Regenerate
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Deploy */}
        {(isApproved || isDeployed) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Deploy</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isDeployed ? (
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span>Deployed at</span>
                  <a
                    href={content.deployed_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    {content.deployed_url}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="https://reddit.com/r/.../comment/..."
                    value={deployUrl}
                    onChange={(e) => setDeployUrl(e.target.value)}
                  />
                  <Button
                    onClick={handleDeploy}
                    disabled={!deployUrl || deployContent.isPending}
                  >
                    {deployContent.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Mark as Deployed
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
