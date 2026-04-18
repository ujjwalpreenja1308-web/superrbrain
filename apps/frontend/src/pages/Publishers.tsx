import { useState } from "react";
import { Globe, Trash2, CheckCircle, XCircle, Plus } from "lucide-react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { usePublishers, useCreatePublisher, useDeletePublisher, useTestPublisher, useUpdatePublisher } from "@/hooks/usePublishers";
import type { PublisherType } from "@covable/shared";

const PLATFORM_INFO: Record<PublisherType, { label: string; fields: { key: string; label: string; type: string; placeholder: string }[] }> = {
  wordpress: {
    label: "WordPress",
    fields: [
      { key: "site_url", label: "Site URL", type: "url", placeholder: "https://yoursite.com" },
      { key: "username", label: "Username", type: "text", placeholder: "admin" },
      { key: "app_password", label: "Application Password", type: "password", placeholder: "xxxx xxxx xxxx xxxx xxxx xxxx" },
    ],
  },
  shopify: {
    label: "Shopify",
    fields: [
      { key: "shop", label: "Shop name", type: "text", placeholder: "my-store (without .myshopify.com)" },
      { key: "access_token", label: "Access Token", type: "password", placeholder: "shpat_..." },
      { key: "blog_id", label: "Blog ID", type: "text", placeholder: "123456789" },
    ],
  },
  webflow: {
    label: "Webflow",
    fields: [
      { key: "access_token", label: "Access Token", type: "password", placeholder: "Bearer token" },
      { key: "collection_id", label: "Collection ID", type: "text", placeholder: "abc123..." },
    ],
  },
};

export function Publishers() {
  const { activeBrand } = useActiveBrand();
  const brandId = activeBrand?.id;

  const { data: publishers, isLoading } = usePublishers(brandId);
  const createPublisher = useCreatePublisher();
  const deletePublisher = useDeletePublisher();
  const testPublisher = useTestPublisher();
  const updatePublisher = useUpdatePublisher();

  const [showAdd, setShowAdd] = useState(false);
  const [selectedType, setSelectedType] = useState<PublisherType>("wordpress");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [postsPerDay, setPostsPerDay] = useState(2);
  const [minIntervalHours, setMinIntervalHours] = useState(6);
  const [autoPublish, setAutoPublish] = useState(false);

  function handleCreate() {
    if (!brandId) return;
    createPublisher.mutate({
      brand_id: brandId,
      type: selectedType,
      credentials,
      config: { posts_per_day: postsPerDay, min_interval_hours: minIntervalHours, auto_publish: autoPublish },
    }, {
      onSuccess: () => {
        setShowAdd(false);
        setCredentials({});
      },
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CMS Connections</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your CMS to auto-publish generated pages
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Connect CMS
        </button>
      </div>

      {showAdd && (
        <div className="border border-border rounded-lg p-5 space-y-4 bg-muted/20">
          <h3 className="text-sm font-medium">Add CMS Connection</h3>

          {/* Platform selector */}
          <div className="flex gap-2">
            {(Object.keys(PLATFORM_INFO) as PublisherType[]).map((type) => (
              <button
                key={type}
                onClick={() => { setSelectedType(type); setCredentials({}); }}
                className={`px-4 py-2 text-sm rounded-md border transition-colors ${
                  selectedType === type
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/30"
                }`}
              >
                {PLATFORM_INFO[type].label}
              </button>
            ))}
          </div>

          {/* Credential fields */}
          <div className="space-y-3">
            {PLATFORM_INFO[selectedType].fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs text-muted-foreground">{field.label}</label>
                <input
                  type={field.type}
                  placeholder={field.placeholder}
                  value={credentials[field.key] ?? ""}
                  onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  className="mt-1 w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            ))}
          </div>

          {/* Rate limit config */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
            <div>
              <label className="text-xs text-muted-foreground">Posts per day</label>
              <input
                type="number"
                min={1}
                max={10}
                value={postsPerDay}
                onChange={(e) => setPostsPerDay(Number(e.target.value))}
                className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Min interval (hrs)</label>
              <input
                type="number"
                min={1}
                max={48}
                value={minIntervalHours}
                onChange={(e) => setMinIntervalHours(Number(e.target.value))}
                className="mt-1 w-full bg-background border border-border rounded-md px-2.5 py-1.5 text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoPublish}
                  onChange={(e) => setAutoPublish(e.target.checked)}
                  className="rounded"
                />
                Auto-publish (CPS ≥ 85%)
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowAdd(false); setCredentials({}); }}
              className="px-3 py-1.5 text-sm rounded-md hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createPublisher.isPending || !Object.values(credentials).every(Boolean)}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              Connect
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
      ) : !publishers?.length ? (
        <div className="text-center py-12">
          <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No CMS connected yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {publishers.map((pub) => (
            <div key={pub.id} className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{pub.type}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${pub.is_active ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {pub.is_active ? "active" : "inactive"}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => testPublisher.mutate(pub.id)}
                    disabled={testPublisher.isPending}
                    title="Test connection"
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => updatePublisher.mutate({ id: pub.id, data: { is_active: !pub.is_active } })}
                    title={pub.is_active ? "Disable" : "Enable"}
                    className="p-1.5 rounded hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => deletePublisher.mutate(pub.id)}
                    disabled={deletePublisher.isPending}
                    className="p-1.5 rounded hover:bg-destructive/10 hover:text-destructive transition-colors text-muted-foreground"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                <span>{(pub.config as { posts_per_day: number }).posts_per_day} posts/day max</span>
                <span>{(pub.config as { min_interval_hours: number }).min_interval_hours}h min gap</span>
                {(pub.config as { auto_publish: boolean }).auto_publish && (
                  <span className="text-primary">Auto-publish enabled</span>
                )}
                <span>{pub.posts_today} posted today</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
