import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Globe, RefreshCw, Send, Shield, Copy, Check } from "lucide-react";
import { usePage, useUpdatePage, usePublishPage, useScorePage, usePageCitationRuns } from "@/hooks/usePages";
import { usePublishers } from "@/hooks/usePublishers";
import { useTriggerReinforcement, useReinforcementJobs, useApproveReinforcement } from "@/hooks/useReinforcement";
import type { CPSBreakdown, PageStatus } from "@covable/shared";

const STATUS_BADGE: Record<PageStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-blue-500/15 text-blue-400",
  winning: "bg-green-500/15 text-green-400",
  stale: "bg-yellow-500/15 text-yellow-400",
  failing: "bg-red-500/15 text-red-400",
  archived: "bg-muted text-muted-foreground",
};

export function PageEditor() {
  const { id } = useParams<{ id: string }>();
  const { data: page, isLoading } = usePage(id);
  const { data: publishers } = usePublishers(page?.brand_id);
  const { data: citationRuns } = usePageCitationRuns(id);
  const { data: reinforcementJobs } = useReinforcementJobs(id);

  const updatePage = useUpdatePage();
  const publishPage = usePublishPage();
  const scorePage = useScorePage();
  const triggerReinforcement = useTriggerReinforcement();
  const approveReinforcement = useApproveReinforcement();

  const [editing, setEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedTldr, setEditedTldr] = useState("");
  const [selectedPublisher, setSelectedPublisher] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "score" | "citations" | "reinforcement">("preview");
  const [copied, setCopied] = useState(false);

  function copyHtml() {
    if (!page?.content_html) return;
    navigator.clipboard.writeText(page.content_html);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function startEdit() {
    if (!page) return;
    setEditedTitle(page.title);
    setEditedTldr(page.tldr);
    setEditing(true);
  }

  function saveEdit() {
    if (!id || !page) return;
    updatePage.mutate({ id, data: { title: editedTitle, tldr: editedTldr } }, {
      onSuccess: () => setEditing(false),
    });
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;
  }
  if (!page) {
    return <div className="p-6 text-sm text-muted-foreground">Page not found</div>;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link to="/content-moat/pages" className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              className="w-full text-lg font-semibold bg-transparent border-b border-primary focus:outline-none"
            />
          ) : (
            <h1 className="text-lg font-semibold">{page.title}</h1>
          )}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_BADGE[page.status as PageStatus]}`}>
              {page.status}
            </span>
            {page.cps != null && (
              <span className="text-xs text-muted-foreground">
                CPS {(page.cps * 100).toFixed(0)}%
              </span>
            )}
            {page.citation_rate != null && (
              <span className="text-xs text-muted-foreground">
                Cited {(page.citation_rate * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {editing ? (
            <>
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={updatePage.isPending}
                className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                Save
              </button>
            </>
          ) : (
            <button
              onClick={startEdit}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={() => id && scorePage.mutate(id)}
            disabled={scorePage.isPending}
            title="Re-score"
            className="p-1.5 rounded border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${scorePage.isPending ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Publish bar (only if draft/published) */}
      {(page.status === "draft" || page.status === "published") && publishers && publishers.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/20">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            value={selectedPublisher}
            onChange={(e) => setSelectedPublisher(e.target.value)}
            className="flex-1 bg-transparent text-sm focus:outline-none"
          >
            <option value="">Select CMS to publish to...</option>
            {publishers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.type} — {p.is_active ? "active" : "inactive"}
              </option>
            ))}
          </select>
          <button
            onClick={() => id && selectedPublisher && publishPage.mutate({ pageId: id, publisherId: selectedPublisher })}
            disabled={!selectedPublisher || publishPage.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            Publish
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(["preview", "score", "citations", "reinforcement"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm capitalize transition-colors ${
              activeTab === tab
                ? "text-foreground border-b-2 border-primary -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "preview" && (
        <div className="space-y-2">
          {!editing && page.content_html && (
            <div className="flex justify-end">
              <button
                onClick={copyHtml}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded border border-border hover:bg-muted transition-colors text-muted-foreground"
              >
                {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                {copied ? "Copied!" : "Copy HTML"}
              </button>
            </div>
          )}
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">TL;DR</label>
                <textarea
                  value={editedTldr}
                  onChange={(e) => setEditedTldr(e.target.value)}
                  rows={3}
                  className="w-full mt-1 bg-background border border-border rounded-md p-2.5 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          ) : page.content_html ? (
            <iframe
              srcDoc={`<base href="http://localhost:5173/">` + page.content_html}
              className="w-full rounded-lg border border-border"
              style={{ height: "70vh", minHeight: 600, background: "#080b11", display: "block" }}
              sandbox="allow-same-origin"
              title="Page preview"
            />
          ) : (
            <pre className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {page.content}
            </pre>
          )}
        </div>
      )}


      {activeTab === "score" && page.cps_breakdown && (
        <CPSBreakdownPanel breakdown={page.cps_breakdown as CPSBreakdown} total={page.cps ?? 0} />
      )}

      {activeTab === "citations" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Citation History</h3>
            <span className="text-xs text-muted-foreground">{citationRuns?.length ?? 0} runs</span>
          </div>
          {!citationRuns?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No citation runs yet.</p>
          ) : (
            <div className="space-y-1">
              {citationRuns.map((run) => (
                <div key={run.id} className="flex items-center gap-3 p-2.5 rounded-md border border-border text-xs">
                  <span className={`font-medium ${run.brand_cited ? "text-green-400" : "text-muted-foreground"}`}>
                    {run.brand_cited ? "Cited" : "Not cited"}
                  </span>
                  {run.brand_position && (
                    <span className="text-muted-foreground">Position #{run.brand_position}</span>
                  )}
                  {run.attributed_to_content && (
                    <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded">Attributed</span>
                  )}
                  <span className="text-muted-foreground ml-auto">
                    {new Date(run.ran_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "reinforcement" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Reinforcement Jobs</h3>
            <button
              onClick={() => id && triggerReinforcement.mutate(id)}
              disabled={triggerReinforcement.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors"
            >
              <Shield className="h-3 w-3" />
              Trigger reinforcement
            </button>
          </div>
          {!reinforcementJobs?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No reinforcement jobs yet — publish the page first, then trigger reinforcement.
            </p>
          ) : (
            <div className="space-y-2">
              {reinforcementJobs.map((job) => (
                <div key={job.id} className="flex items-center gap-3 p-3 rounded-lg border border-border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium capitalize">{job.channel}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        job.status === "posted" ? "bg-green-500/15 text-green-400" :
                        job.status === "pending" ? "bg-yellow-500/15 text-yellow-400" :
                        job.status === "manual" ? "bg-blue-500/15 text-blue-400" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {job.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{job.target_phrase}</p>
                  </div>
                  {job.status === "pending" && (
                    <button
                      onClick={() => approveReinforcement.mutate(job.id)}
                      disabled={approveReinforcement.isPending}
                      className="px-2.5 py-1 text-xs rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {job.external_url && (
                    <a
                      href={job.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CPSBreakdownPanel({ breakdown, total }: { breakdown: CPSBreakdown; total: number }) {
  const components = [
    { label: "Entity placement", key: "entity_score", weight: 0.25 },
    { label: "Structure", key: "structure_score", weight: 0.20 },
    { label: "Keyword redundancy", key: "redundancy_score", weight: 0.20 },
    { label: "Intent coverage", key: "intent_coverage_score", weight: 0.15 },
    { label: "Freshness", key: "freshness_score", weight: 0.10 },
    { label: "Anti-generic", key: "anti_generic_score", weight: 0.10 },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="text-3xl font-bold">{(total * 100).toFixed(0)}%</div>
        <div>
          <p className="text-sm font-medium">Citation Probability Score</p>
          <p className="text-xs text-muted-foreground">
            {total >= 0.85 ? "Excellent — auto-publish ready" :
             total >= 0.80 ? "Good — ready to publish" :
             total >= 0.65 ? "Needs improvement" :
             "Low — consider regenerating"}
          </p>
        </div>
      </div>
      <div className="space-y-2">
        {components.map(({ label, key, weight }) => {
          const value = breakdown[key] ?? 0;
          const contribution = value * weight;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span>
                  {(value * 100).toFixed(0)}% × {(weight * 100).toFixed(0)}% = {(contribution * 100).toFixed(1)}pts
                </span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    value >= 0.8 ? "bg-green-500" : value >= 0.5 ? "bg-yellow-500" : "bg-red-500"
                  }`}
                  style={{ width: `${value * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
