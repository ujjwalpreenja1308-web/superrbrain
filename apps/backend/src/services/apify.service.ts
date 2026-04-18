const APIFY_API_KEY = process.env.APIFY_API_KEY;
const ACTOR_ID = "trudax/reddit-scraper-lite";
const BASE_URL = "https://api.apify.com/v2";

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

export interface RedditPost {
  id: string;
  url: string;
  title: string;
  body?: string;
  subreddit: string;
  author?: string;
  upvotes?: number;
  numberOfComments?: number;
  createdAt?: string;
}

interface ApifyRunResponse {
  data: { id: string; defaultDatasetId: string };
}

interface ApifyRunStatus {
  data: { status: string };
}

export async function scrapeRedditKeywords(
  keywords: string[],
  subreddits: string[],
  country?: string
): Promise<RedditPost[]> {
  if (!APIFY_API_KEY) throw new Error("APIFY_API_KEY is not set");

  // Build the input per the trudax/reddit-scraper-lite schema
  const input = {
    searches: keywords,
    searchPosts: true,
    searchComments: true,
    searchCommunities: false,
    searchUsers: false,
    skipComments: false,
    skipCommunity: false,
    skipUserPosts: false,
    sort: "new",
    time: "week",
    maxItems: 50,
    maxPostCount: 50,
    maxComments: 10,
    maxCommunitiesCount: 2,
    maxUserCount: 2,
    includeNSFW: false,
    debugMode: false,
    ignoreStartUrls: false,
    scrollTimeout: 40,
    postDateLimit: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    commentDateLimit: new Date().toISOString().split("T")[0],
    proxy: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      ...(country && { apifyProxyCountry: country }),
    },
    // Restrict to chosen subreddits by prepending start URLs if provided
    ...(subreddits.length > 0 && {
      startUrls: subreddits.map((s) => ({
        url: `https://www.reddit.com/r/${s}/`,
      })),
      ignoreStartUrls: false,
    }),
  };

  // Start the actor run
  const runRes = await fetch(
    `${BASE_URL}/acts/${encodeURIComponent(ACTOR_ID)}/runs?token=${APIFY_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!runRes.ok) {
    const body = await runRes.text();
    throw new Error(`Apify run start failed (${runRes.status}): ${body}`);
  }

  const { data: run } = (await runRes.json()) as ApifyRunResponse;

  // Poll until finished
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch(
      `${BASE_URL}/actor-runs/${run.id}?token=${APIFY_API_KEY}`
    );
    const { data: runData } = (await statusRes.json()) as ApifyRunStatus;

    if (runData.status === "SUCCEEDED") break;
    if (runData.status === "FAILED" || runData.status === "ABORTED") {
      throw new Error(`Apify run ${run.id} ended with status: ${runData.status}`);
    }
  }

  // Fetch dataset items
  const dataRes = await fetch(
    `${BASE_URL}/datasets/${run.defaultDatasetId}/items?token=${APIFY_API_KEY}&format=json`
  );

  if (!dataRes.ok) {
    throw new Error(`Apify dataset fetch failed (${dataRes.status})`);
  }

  const items = (await dataRes.json()) as any[];

  return items
    .filter((item) => item.dataType === "post" || item.type === "post" || item.title)
    .map((item) => ({
      id: item.id ?? item.postId ?? item.url,
      url: item.url,
      title: item.title ?? "",
      body: item.body ?? item.text ?? undefined,
      subreddit: item.communityName ?? item.subreddit ?? "",
      author: item.author ?? item.username ?? undefined,
      upvotes: item.upVotes ?? item.score ?? undefined,
      numberOfComments: item.numberOfComments ?? item.numComments ?? undefined,
      createdAt: item.createdAt ?? item.created_utc ?? undefined,
    }));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
