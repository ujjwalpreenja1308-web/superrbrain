const BRIGHTDATA_API_KEY = process.env.BRIGHTDATA_API_KEY;
const DATASET_ID = "gd_m7aof0k82r803d5bjm";
const SCRAPE_URL = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&format=json&notify=false&include_errors=true`;
const TRIGGER_URL = `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&format=json&include_errors=true`;
const SNAPSHOT_BASE_URL = "https://api.brightdata.com/datasets/v3";
const SNAPSHOT_POLL_INTERVAL_MS = 5_000;
const SNAPSHOT_TIMEOUT_MS = 10 * 60_000;
const BATCH_SIZE = 3;

export interface BrightDataResult {
  text: string;
  citations: string[];
}

export interface BrightDataSnapshotStatus {
  status: "pending" | "ready" | "failed";
  error?: string;
}

interface BrightDataRecord {
  index?: number;
  answer_text_markdown?: string;
  answer_text?: string;
  citations?: { url?: string; title?: string; position?: number }[];
  links_attached?: { url?: string; text?: string; position?: number }[];
  search_sources?: { url: string; title?: string }[];
  error?: string;
}

interface BrightDataProgress {
  status?: string;
  error?: string;
}

export function chunkBrightDataInputs<T>(inputs: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < inputs.length; index += BATCH_SIZE) {
    chunks.push(inputs.slice(index, index + BATCH_SIZE));
  }
  return chunks;
}

/**
 * Scrape a single prompt. If Bright Data cannot finish synchronously, it returns a
 * snapshot id and continues in the background, so wait for and download that result.
 */
export async function scrapeWithBrightData(
  prompt: string,
  country?: string,
  webSearch = true
): Promise<BrightDataResult> {
  if (!BRIGHTDATA_API_KEY) {
    throw new Error("BRIGHTDATA_API_KEY is not set");
  }

  const res = await fetch(SCRAPE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BRIGHTDATA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: [
        {
          url: "https://chatgpt.com/",
          prompt,
          country: country ?? "",
          web_search: webSearch,
          additional_prompt: "",
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bright Data request failed (${res.status}): ${body}`);
  }

  let payload: unknown = await res.json();
  const snapshotId = getBrightDataSnapshotId(payload);
  if (snapshotId) payload = await waitForBrightDataSnapshot(snapshotId);

  return parseBrightDataPayload(payload);
}

/**
 * Scrape multiple prompts concurrently, waiting for any requests Bright Data
 * defers to background snapshots before returning the batch.
 */
export async function scrapeWithBrightDataBatch(
  inputs: { prompt: string; country?: string; webSearch?: boolean }[]
): Promise<BrightDataResult[]> {
  if (!inputs.length) return [];
  const snapshotId = await triggerBrightDataBatch(inputs);
  const payload = await waitForBrightDataSnapshot(snapshotId);
  return parseBrightDataBatchPayload(payload, inputs.length);
}

export async function triggerBrightDataBatch(
  inputs: { prompt: string; country?: string; webSearch?: boolean }[],
): Promise<string> {
  if (!BRIGHTDATA_API_KEY) {
    throw new Error("BRIGHTDATA_API_KEY is not set");
  }

  const res = await fetch(TRIGGER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BRIGHTDATA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      inputs.map(({ prompt, country, webSearch = true }, index) => ({
        url: "https://chatgpt.com/",
        prompt,
        country: country ?? "",
        web_search: webSearch,
        additional_prompt: "",
        index,
      })),
    ),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bright Data batch request failed (${res.status}): ${body}`);
  }

  const snapshotId = getBrightDataSnapshotId(await res.json());
  if (!snapshotId) {
    throw new Error("Bright Data batch request returned no snapshot id");
  }

  return snapshotId;
}

export async function downloadBrightDataSnapshot(
  snapshotId: string,
  expectedCount: number,
): Promise<BrightDataResult[]> {
  const payload = await fetchBrightDataJson(
    `${SNAPSHOT_BASE_URL}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
  );
  return parseBrightDataBatchPayload(payload, expectedCount);
}

export async function getBrightDataSnapshotStatus(
  snapshotId: string,
): Promise<BrightDataSnapshotStatus> {
  const progress = (await fetchBrightDataJson(
    `${SNAPSHOT_BASE_URL}/progress/${encodeURIComponent(snapshotId)}`,
  )) as BrightDataProgress;
  const status = progress.status?.toLowerCase();
  if (status === "ready") return { status: "ready" };
  if (status === "failed") return { status: "failed", error: progress.error };
  return { status: "pending" };
}

export function getBrightDataSnapshotId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const snapshotId = (payload as { snapshot_id?: unknown }).snapshot_id;
  return typeof snapshotId === "string" && snapshotId.trim()
    ? snapshotId
    : null;
}

async function fetchBrightDataJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${BRIGHTDATA_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bright Data snapshot request failed (${res.status}): ${body}`);
  }

  return res.json();
}

async function waitForBrightDataSnapshot(snapshotId: string): Promise<unknown> {
  const deadline = Date.now() + SNAPSHOT_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const progress = await getBrightDataSnapshotStatus(snapshotId);

    if (progress.status === "ready") {
      return fetchBrightDataJson(
        `${SNAPSHOT_BASE_URL}/snapshot/${encodeURIComponent(snapshotId)}?format=json`,
      );
    }

    if (progress.status === "failed") {
      throw new Error(
        `Bright Data snapshot ${snapshotId} failed${progress.error ? `: ${progress.error}` : ""}`,
      );
    }

    await new Promise((resolve) =>
      setTimeout(resolve, SNAPSHOT_POLL_INTERVAL_MS),
    );
  }

  throw new Error(
    `Bright Data snapshot ${snapshotId} did not finish within 10 minutes`,
  );
}

export function parseBrightDataPayload(payload: unknown): BrightDataResult {
  const candidate = Array.isArray(payload) ? payload[0] : payload;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Bright Data returned no result record");
  }

  if ("snapshot_id" in candidate) {
    throw new Error(
      "Bright Data deferred the request to a snapshot instead of returning a synchronous result",
    );
  }

  return parseBrightDataRecord(candidate as BrightDataRecord);
}

export function parseBrightDataBatchPayload(
  payload: unknown,
  expectedCount: number,
): BrightDataResult[] {
  if (!Array.isArray(payload)) {
    throw new Error("Bright Data batch returned a non-array result");
  }
  if (payload.length !== expectedCount) {
    throw new Error(
      `Bright Data batch returned ${payload.length} of ${expectedCount} results`,
    );
  }

  const records = payload as BrightDataRecord[];
  const hasUsableIndexes = records.every(
    (record) =>
      Number.isInteger(record.index) &&
      (record.index as number) >= 0 &&
      (record.index as number) < expectedCount,
  );
  const ordered = hasUsableIndexes
    ? [...records].sort((a, b) => (a.index as number) - (b.index as number))
    : records;

  return ordered.map(parseBrightDataRecord);
}

function parseBrightDataRecord(record: BrightDataRecord): BrightDataResult {
  if (record.error) throw new Error(`Bright Data error: ${record.error}`);

  const text = record.answer_text_markdown ?? record.answer_text ?? "";
  if (!text.trim()) {
    throw new Error("Bright Data returned an empty answer");
  }

  const citations: string[] = [];
  for (const citation of record.citations ?? []) {
    if (citation.url && !citations.includes(citation.url)) {
      citations.push(citation.url);
    }
  }
  for (const link of record.links_attached ?? []) {
    if (link.url && !citations.includes(link.url)) citations.push(link.url);
  }
  for (const source of record.search_sources ?? []) {
    if (source.url && !citations.includes(source.url)) citations.push(source.url);
  }

  return { text, citations };
}
