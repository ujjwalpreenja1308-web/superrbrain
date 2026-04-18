import { Composio, ComposioToolSet } from "composio-core";

const REDDIT_APP_SLUG = "reddit";

function getApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY;
  if (!key) throw new Error("COMPOSIO_API_KEY is not set");
  return key;
}

function getClient() {
  return new Composio({ apiKey: getApiKey() });
}

function getToolSet() {
  return new ComposioToolSet({ apiKey: getApiKey() });
}

// Each Covable user maps 1:1 to a Composio entity ID
function entityId(userId: string) {
  return `covable_${userId}`;
}

/**
 * Kicks off the Reddit OAuth flow.
 * Returns the URL to redirect the user to.
 */
export async function initiateRedditConnection(userId: string): Promise<string> {
  let request: any;
  try {
    const client = getClient();
    request = await client.connectedAccounts.initiate({
      appName: REDDIT_APP_SLUG,
      entityId: entityId(userId),
      redirectUri: `${process.env.BACKEND_URL}/api/reddit/connect/callback`,
    });
  } catch (err: any) {
    const msg = err?.errCode || err?.message || String(err);
    console.error("Composio initiate connection error:", err);
    throw new Error(`Failed to initiate Reddit connection: ${msg}`);
  }
  // ConnectionRequest class stores redirectUri as this.redirectUrl
  const uri = request?.redirectUrl ?? request?.redirectUri;
  if (!uri) throw new Error("Composio did not return a redirect URL");
  return uri as string;
}

/**
 * Returns the active connected account for this user, or null if not found.
 */
export async function getRedditConnection(userId: string) {
  const client = getClient();
  try {
    const result = await client.connectedAccounts.list({
      entityId: entityId(userId),
      appUniqueKeys: [REDDIT_APP_SLUG],
      showActiveOnly: true,
    });
    // SDK v0.5 returns { items: [...] } or an array directly
    const items: any[] = (result as any)?.items ?? (Array.isArray(result) ? result : []);
    return items.find((a: any) => a.status === "ACTIVE") ?? null;
  } catch {
    return null;
  }
}

/**
 * Disconnects the Reddit account.
 */
export async function disconnectReddit(userId: string): Promise<void> {
  const client = getClient();
  const connection = await getRedditConnection(userId);
  if (connection?.id || connection?.connectedAccountId) {
    const id = connection.connectedAccountId ?? connection.id;
    await client.connectedAccounts.delete({ connectedAccountId: id });
  }
}

/**
 * Posts a comment on a Reddit post.
 * thingId must be the Reddit fullname, e.g. "t3_abc123"
 */
export async function postRedditComment(
  userId: string,
  thingId: string,
  text: string
): Promise<{ success: boolean; commentUrl?: string; error?: string }> {
  const toolset = getToolSet();
  // getEntity returns a Promise in composio-core v0.5.x
  const entity = await toolset.getEntity(entityId(userId));

  const result = await entity.execute({
    actionName: "REDDIT_POST_REDDIT_COMMENT",
    params: { thing_id: thingId, text },
  });

  const res = result as any;

  if (!res.successful) {
    return { success: false, error: res.error ?? "Unknown Composio error" };
  }

  // Extract comment permalink from response data if available
  let commentUrl: string | undefined;
  try {
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    commentUrl = data?.json?.data?.things?.[0]?.data?.permalink
      ? `https://reddit.com${data.json.data.things[0].data.permalink}`
      : undefined;
  } catch {
    // non-critical
  }

  return { success: true, commentUrl };
}

/**
 * Fetches the Reddit username for the connected account.
 */
export async function getRedditUsername(userId: string): Promise<string | null> {
  const toolset = getToolSet();
  // getEntity returns a Promise in composio-core v0.5.x
  const entity = await toolset.getEntity(entityId(userId));

  try {
    const result = await entity.execute({
      actionName: "REDDIT_GET_REDDIT_USER_ABOUT",
      params: { username: "me" },
    });
    const res = result as any;
    const data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
    return data?.data?.name ?? null;
  } catch {
    return null;
  }
}
