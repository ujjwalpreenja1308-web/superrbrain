export interface WebflowCredentials {
  access_token: string;
  collection_id: string;
}

export interface PublishResult {
  platform_post_id: string;
  platform_url: string;
}

const API_BASE = "https://api.webflow.com/v2";

export async function publishToWebflow(
  credentials: WebflowCredentials,
  post: { title: string; content_html: string; tldr: string }
): Promise<PublishResult> {
  const { access_token, collection_id } = credentials;

  // Create slug from title
  const slug = post.title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 80);

  const res = await fetch(`${API_BASE}/collections/${collection_id}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fieldData: {
        name: post.title,
        slug,
        "post-body": post.content_html,
        "post-summary": post.tldr,
        _archived: false,
        _draft: false,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Webflow publish failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { id: string; fieldData: { slug: string } };
  return {
    platform_post_id: data.id,
    // Webflow doesn't return a direct URL — construct from slug
    platform_url: `https://webflow.com/collections/${collection_id}/items/${data.id}`,
  };
}

export async function testWebflowConnection(
  credentials: WebflowCredentials
): Promise<void> {
  const { access_token, collection_id } = credentials;
  const res = await fetch(`${API_BASE}/collections/${collection_id}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!res.ok) {
    throw new Error(`Webflow auth failed (${res.status}) — check access token and collection ID`);
  }
}
