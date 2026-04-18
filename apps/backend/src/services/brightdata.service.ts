const BRIGHTDATA_API_KEY = process.env.BRIGHTDATA_API_KEY;
const DATASET_ID = "gd_m7aof0k82r803d5bjm";
const SCRAPE_URL = `https://api.brightdata.com/datasets/v3/scrape?dataset_id=${DATASET_ID}&notify=false&include_errors=true`;

export interface BrightDataResult {
  text: string;
  citations: string[];
}

interface BrightDataRecord {
  answer_text_markdown?: string;
  answer_text?: string;
  links_attached?: { url: string; text: string; position: number }[];
  search_sources?: { url: string; title?: string }[];
  error?: string;
}

/**
 * Scrape a single prompt. Bright Data returns results synchronously for single-input calls.
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

  const raw = await res.json() as BrightDataRecord;

  if (raw.error) {
    throw new Error(`Bright Data error: ${raw.error}`);
  }

  return extractResult(raw);
}

/**
 * Scrape multiple prompts concurrently — each as its own single-input request
 * (Bright Data is synchronous for single inputs, async for batches).
 * All requests fire in parallel so total time ≈ slowest single prompt (~30s).
 */
export async function scrapeWithBrightDataBatch(
  inputs: { prompt: string; country?: string; webSearch?: boolean }[]
): Promise<BrightDataResult[]> {
  return Promise.all(
    inputs.map(({ prompt, country, webSearch = true }) =>
      scrapeWithBrightData(prompt, country, webSearch)
    )
  );
}

function extractResult(record: BrightDataRecord): BrightDataResult {
  const text = record.answer_text_markdown ?? record.answer_text ?? "";

  const citations: string[] = [];
  for (const link of record.links_attached ?? []) {
    if (link.url && !citations.includes(link.url)) citations.push(link.url);
  }
  for (const source of record.search_sources ?? []) {
    if (source.url && !citations.includes(source.url)) citations.push(source.url);
  }

  return { text, citations };
}
