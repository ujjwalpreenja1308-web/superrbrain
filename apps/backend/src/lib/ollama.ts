import { requireEnv } from "./env.js";

const OLLAMA_CLOUD_URL = "https://ollama.com/api/chat";
const DEFAULT_OLLAMA_MODEL = "gpt-oss:120b";

export interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaJsonCompletionOptions {
  messages: OllamaMessage[];
  maxTokens?: number;
  temperature?: number;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
  error?: string;
}

export function getOllamaModel(): string {
  return process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
}

export function parseOllamaJson(content: string): unknown {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Ollama returned an empty response");

  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
    if (fenced) {
      try {
        return JSON.parse(fenced);
      } catch {
        // Fall through to extracting the outermost JSON object.
      }
    }

    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
      } catch {
        // Use the consistent error below.
      }
    }
  }

  throw new Error("Ollama returned invalid JSON");
}

export async function ollamaJsonCompletion<T = unknown>(
  options: OllamaJsonCompletionOptions,
): Promise<T> {
  const response = await fetch(OLLAMA_CLOUD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OLLAMA_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: getOllamaModel(),
      messages: options.messages,
      stream: false,
      think: "low",
      options: {
        temperature: options.temperature ?? 0,
        num_predict: Math.max(256, Math.min(options.maxTokens ?? 4096, 8192)),
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });

  const payload = (await response.json().catch(() => ({}))) as OllamaChatResponse;
  if (!response.ok) {
    const detail = payload.error?.trim();
    throw new Error(
      `Ollama request failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }

  return parseOllamaJson(payload.message?.content ?? "") as T;
}
