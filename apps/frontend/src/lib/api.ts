import { supabase } from "@/lib/supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const STATUS_MESSAGES: Record<number, string> = {
  401: "Session expired. Please sign in again.",
  403: "You don't have permission to do that.",
  404: "The requested resource was not found.",
  429: "Too many requests. Please wait a moment.",
};

function sanitizeError(raw: string | undefined, status: number): string {
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (!raw) return "Something went wrong. Please try again.";
  // Strip anything that looks like a stack trace, file path, or SQL
  if (/\bat\b.*\.(ts|js|sql)/i.test(raw) || /\/[a-z_]+\//i.test(raw) || /SELECT|INSERT|UPDATE|DELETE/i.test(raw)) {
    return "Something went wrong. Please try again.";
  }
  // Cap length to avoid leaking verbose internal errors
  return raw.length > 200 ? "Something went wrong. Please try again." : raw;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(sanitizeError(body.error, response.status));
  }
  return response.json();
}

async function getHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }
  return headers;
}

export const api = {
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, { headers: await getHeaders() });
    return handleResponse<T>(res);
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: await getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(res);
  },

  async put<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "PUT",
      headers: await getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(res);
  },

  async patch<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "PATCH",
      headers: await getHeaders(),
      body: JSON.stringify(body),
    });
    return handleResponse<T>(res);
  },

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      method: "DELETE",
      headers: await getHeaders(),
    });
    return handleResponse<T>(res);
  },
};
