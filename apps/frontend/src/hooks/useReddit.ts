import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { RedditMonitor, RedditPost } from "@covable/shared";

// ── Connection ────────────────────────────────────────────────────────────────

export function useRedditConnection() {
  return useQuery({
    queryKey: ["reddit-connection"],
    queryFn: () => api.get<{ connected: boolean; username: string | null }>("/api/reddit/connect/status"),
  });
}

export function useConnectReddit() {
  return useMutation({
    mutationFn: async () => {
      // Open the window synchronously inside the user gesture, then navigate it
      // once we have the URL. This avoids popup blockers.
      const popup = window.open("", "_blank", "noopener,noreferrer");
      try {
        const { url } = await api.get<{ url: string }>("/api/reddit/connect");
        if (popup) {
          popup.location.href = url;
        } else {
          // Fallback: navigate current tab if popup was blocked
          window.location.href = url;
        }
      } catch (err) {
        popup?.close();
        throw err;
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useDisconnectReddit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ success: boolean }>("/api/reddit/connect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reddit-connection"] });
      toast.success("Reddit account disconnected");
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Monitors ──────────────────────────────────────────────────────────────────

export function useRedditMonitors() {
  return useQuery({
    queryKey: ["reddit-monitors"],
    queryFn: () => api.get<RedditMonitor[]>("/api/reddit/monitors"),
  });
}

export function useCreateRedditMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { brand_id: string; keywords: string[]; subreddits: string[]; automode?: boolean }) =>
      api.post<RedditMonitor>("/api/reddit/monitors", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reddit-monitors"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateRedditMonitor(monitorId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { keywords?: string[]; subreddits?: string[]; is_active?: boolean; automode?: boolean }) =>
      api.patch<RedditMonitor>(`/api/reddit/monitors/${monitorId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reddit-monitors"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useRunRedditMonitor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (monitorId: string) => api.post<{ status: string }>(`/api/reddit/monitors/${monitorId}/run`),
    onSuccess: (_, monitorId) => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["reddit-posts", monitorId] });
      }, 2000);
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

// ── Posts ─────────────────────────────────────────────────────────────────────

export function useRedditPosts(monitorId: string | undefined, isRunning: boolean) {
  return useQuery({
    queryKey: ["reddit-posts", monitorId],
    queryFn: () => api.get<RedditPost[]>(`/api/reddit/monitors/${monitorId}/posts`),
    enabled: !!monitorId,
    refetchInterval: isRunning ? 3000 : false,
  });
}

export function useUpdateRedditPost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, data }: { postId: string; data: { reply_status?: "approved" | "rejected"; ai_reply?: string } }) =>
      api.patch<RedditPost>(`/api/reddit/posts/${postId}`, data),
    onSuccess: (_, { postId }) => {
      // Invalidate all reddit-posts queries
      queryClient.invalidateQueries({ queryKey: ["reddit-posts"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });
}
