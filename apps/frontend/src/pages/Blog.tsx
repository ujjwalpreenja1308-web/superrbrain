import { useState } from "react";
import { useActiveBrand } from "@/hooks/useActiveBrand";
import { usePlan } from "@/hooks/usePlan";
import { UpgradeGate } from "@/components/UpgradeGate";
import { useBlogPosts, useBlogPost, useGenerateBlog, useUpdateBlogPost, type BlogPost } from "@/hooks/useBlog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ErrorCard";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Loader2,
  Sparkles,
  ChevronLeft,
  ExternalLink,
  Copy,
  CheckCircle,
} from "lucide-react";

function PostListItem({
  post,
  onSelect,
}: {
  post: BlogPost;
  onSelect: (id: string) => void;
}) {
  return (
    <Card
      className="cursor-pointer hover:border-primary/30 transition-colors"
      onClick={() => onSelect(post.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-medium text-sm truncate">{post.title}</span>
              <Badge variant={post.status === "published" ? "default" : "secondary"} className="text-xs shrink-0">
                {post.status}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{post.meta_description}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
              <span>{post.word_count} words</span>
              <span>{post.target_queries.length} queries</span>
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
          <FileText className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>
      </CardContent>
    </Card>
  );
}

function PostDetail({
  brandId,
  postId,
  onBack,
}: {
  brandId: string;
  postId: string;
  onBack: () => void;
}) {
  const { data: post, isLoading, isError } = useBlogPost(brandId, postId);
  const updatePost = useUpdateBlogPost(brandId, postId);
  const [copied, setCopied] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !post) {
    return <ErrorCard message="Failed to load post." />;
  }

  const currentMarkdown = editedMarkdown ?? post.content_markdown;
  const isDirty = editedMarkdown !== null && editedMarkdown !== post.content_markdown;

  const handleCopy = () => {
    navigator.clipboard.writeText(currentMarkdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    await updatePost.mutateAsync({ content_markdown: editedMarkdown! });
    setEditedMarkdown(null);
  };

  const handlePublish = async () => {
    if (isDirty) await updatePost.mutateAsync({ content_markdown: editedMarkdown! });
    await updatePost.mutateAsync({ status: "published" });
    setEditedMarkdown(null);
  };

  return (
    <div className="space-y-4 h-full flex flex-col min-h-0">
      {/* Back + header */}
      <div className="shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft className="size-3.5" /> Back to posts
        </button>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold leading-tight">{post.title}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{post.meta_description}</p>
          </div>
          <Badge variant={post.status === "published" ? "default" : "secondary"}>
            {post.status}
          </Badge>
        </div>
      </div>

      {/* Meta chips */}
      <div className="shrink-0 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-xs">{post.word_count} words</Badge>
        {post.aeo_patterns.slice(0, 3).map((p) => (
          <Badge key={p} variant="outline" className="text-xs">{p}</Badge>
        ))}
        {post.visual_directives.length > 0 && (
          <Badge variant="outline" className="text-xs">{post.visual_directives.length} visuals</Badge>
        )}
      </div>

      {/* Sources */}
      {post.source_urls.length > 0 && (
        <div className="shrink-0">
          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Sources used</p>
          <div className="flex flex-col gap-1">
            {post.source_urls.map((url, i) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary truncate transition-colors"
              >
                <ExternalLink className="size-3 shrink-0" />
                {post.source_titles[i] || url}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Markdown editor */}
      <div className="flex-1 min-h-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Markdown</p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="ghost" onClick={handleCopy} className="h-7 text-xs">
              <Copy className="size-3" />
              {copied ? "Copied!" : "Copy"}
            </Button>
            {isDirty && (
              <Button size="sm" variant="outline" onClick={handleSave} disabled={updatePost.isPending} className="h-7 text-xs">
                Save
              </Button>
            )}
            {post.status !== "published" && (
              <Button size="sm" onClick={handlePublish} disabled={updatePost.isPending} className="h-7 text-xs">
                {updatePost.isPending ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle className="size-3" />}
                Publish
              </Button>
            )}
          </div>
        </div>
        <Textarea
          value={currentMarkdown}
          onChange={(e) => setEditedMarkdown(e.target.value)}
          className="flex-1 min-h-0 font-mono text-xs resize-none"
          disabled={post.status === "published"}
        />
      </div>
    </div>
  );
}

export function Blog() {
  const { activeBrand: brand } = useActiveBrand();
  const plan = usePlan();

  if (!plan.hasBlog) {
    return (
      <UpgradeGate
        feature="Blog Generation"
        requiredPlan="scale"
        description="Generate AEO-optimized blog content engineered to get your brand cited by AI — not just ranked on Google. Available on the Scale plan."
      />
    );
  }

  const { data: posts, isLoading, isError, error, refetch } = useBlogPosts(brand?.id);
  const generateBlog = useGenerateBlog(brand?.id || "");
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  const selectedPost = selectedPostId
    ? (posts ?? []).find((p) => p.id === selectedPostId)
    : null;

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold">Blog Generator</h1>
          <p className="text-xs text-muted-foreground">
            AEO-optimised posts built from real AI citation patterns
          </p>
        </div>
        {!selectedPostId && (
          <Button
            size="sm"
            onClick={() => generateBlog.mutate()}
            disabled={generateBlog.isPending || !brand}
            className="h-8 text-xs"
          >
            {generateBlog.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Generate Post
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {selectedPostId && brand ? (
          <PostDetail
            brandId={brand.id}
            postId={selectedPostId}
            onBack={() => setSelectedPostId(null)}
          />
        ) : isError ? (
          <ErrorCard message={error?.message} onRetry={() => refetch()} />
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !posts?.length ? (
          <Card>
            <CardContent className="py-16 text-center space-y-3">
              <FileText className="size-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium">No blog posts yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Generate your first AEO-optimised post. It analyses your citation data to write content AI engines will cite.
              </p>
              <Button
                size="sm"
                onClick={() => generateBlog.mutate()}
                disabled={generateBlog.isPending || !brand}
              >
                {generateBlog.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Generate First Post
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{posts.length} post{posts.length !== 1 ? "s" : ""}</p>
            {posts.map((post) => (
              <PostListItem key={post.id} post={post} onSelect={setSelectedPostId} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
