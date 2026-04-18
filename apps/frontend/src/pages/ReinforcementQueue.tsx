import { useState } from "react";
import { Shield, ExternalLink, CheckCircle } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { useReinforcementJobs, useApproveReinforcement, useUpdateReinforcement, useTriggerReinforcement } from "@/hooks/useReinforcement";
import { usePages } from "@/hooks/usePages";

const CHANNEL_COLORS: Record<string, string> = {
  reddit: "bg-orange-500/15 text-orange-400",
  medium: "bg-blue-500/15 text-blue-400",
  quora: "bg-red-500/15 text-red-400",
};

const STATUS_COLORS: Record<string, string> = {
  posted: "bg-green-500/15 text-green-400",
  pending: "bg-yellow-500/15 text-yellow-400",
  manual: "bg-blue-500/15 text-blue-400",
  failed: "bg-red-500/15 text-red-400",
};

export function ReinforcementQueue() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;

  const { data: pages } = usePages(brandId);
  const [selectedPageId, setSelectedPageId] = useState<string>("");

  const { data: jobs, isLoading } = useReinforcementJobs(selectedPageId || undefined);
  const approveReinforcement = useApproveReinforcement();
  const updateReinforcement = useUpdateReinforcement();
  const triggerReinforcement = useTriggerReinforcement();

  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [editVariant, setEditVariant] = useState("");

  const publishedPages = pages?.filter((p) => p.status === "published" || p.status === "winning") ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Reinforcement Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Approve and manage distribution jobs across channels
          </p>
        </div>
        {selectedPageId && (
          <button
            onClick={() => triggerReinforcement.mutate(selectedPageId)}
            disabled={triggerReinforcement.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            <Shield className="h-3.5 w-3.5" />
            Trigger reinforcement
          </button>
        )}
      </div>

      {/* Page selector */}
      <div>
        <label className="text-xs text-muted-foreground">Filter by page</label>
        <select
          value={selectedPageId}
          onChange={(e) => setSelectedPageId(e.target.value)}
          className="mt-1 w-full max-w-md bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="">All pages</option>
          {publishedPages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !jobs?.length ? (
        <div className="text-center py-12">
          <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No reinforcement jobs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Publish a page and trigger reinforcement to generate distribution jobs.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="border border-border rounded-lg p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CHANNEL_COLORS[job.channel] ?? "bg-muted text-muted-foreground"}`}>
                      {job.channel}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[job.status] ?? "bg-muted text-muted-foreground"}`}>
                      {job.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium mt-2 truncate">{job.target_phrase}</p>
                  {editingJob === job.id ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={editVariant}
                        onChange={(e) => setEditVariant(e.target.value)}
                        rows={3}
                        className="w-full bg-background border border-border rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            updateReinforcement.mutate({ id: job.id, data: { variant_used: editVariant } });
                            setEditingJob(null);
                          }}
                          className="px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingJob(null)}
                          className="px-2.5 py-1 text-xs rounded hover:bg-muted transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    job.variant_used && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{job.variant_used}</p>
                    )
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  {job.status === "pending" && (
                    <>
                      <button
                        onClick={() => {
                          setEditingJob(job.id);
                          setEditVariant(job.variant_used ?? "");
                        }}
                        className="px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => approveReinforcement.mutate(job.id)}
                        disabled={approveReinforcement.isPending}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      >
                        <CheckCircle className="h-3 w-3" />
                        Approve
                      </button>
                    </>
                  )}
                  {job.status === "manual" && (
                    <span className="text-xs text-muted-foreground px-2 py-1">Copy &amp; post manually</span>
                  )}
                  {job.external_url && (
                    <a
                      href={job.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2.5 py-1 text-xs rounded text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
