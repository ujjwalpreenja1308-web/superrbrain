import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface BlogPost {
  id: string;
  brand_id: string;
  title: string;
  slug: string;
  meta_description: string;
  content_markdown: string;
  word_count: number;
  status: "draft" | "published";
  target_queries: string[];
  aeo_patterns: string[];
  source_urls: string[];
  source_titles: string[];
  visual_directives: string[];
  created_at: string;
  updated_at?: string;
}

export function useBlogPosts(brandId?: string) {
  return useQuery({
    queryKey: ["blog-posts", brandId],
    queryFn: () => api.get<{ posts: BlogPost[] }>(`/api/blog/${brandId}`).then((r) => r.posts),
    enabled: !!brandId,
  });
}

export function useBlogPost(brandId?: string, postId?: string) {
  return useQuery({
    queryKey: ["blog-post", brandId, postId],
    queryFn: () => api.get<{ post: BlogPost }>(`/api/blog/${brandId}/${postId}`).then((r) => r.post),
    enabled: !!brandId && !!postId,
  });
}

export function useGenerateBlog(brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (targetQueries?: string[]) =>
      api.post<{ success: boolean; runId: string }>(`/api/blog/${brandId}/generate`, {
        targetQueries: targetQueries || [],
      }),
    onSuccess: () => {
      toast.success("Blog generation started — it will appear in the list when ready.");
      queryClient.invalidateQueries({ queryKey: ["blog-posts", brandId] });
    },
  });
}

export function useUpdateBlogPost(brandId: string, postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { status?: string; content_markdown?: string; title?: string; meta_description?: string }) =>
      api.patch<{ post: BlogPost }>(`/api/blog/${brandId}/${postId}`, data).then((r) => r.post),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blog-post", brandId, postId] });
      queryClient.invalidateQueries({ queryKey: ["blog-posts", brandId] });
      toast.success("Post updated");
    },
  });
}
