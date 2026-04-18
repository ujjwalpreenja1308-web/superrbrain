export interface WordPressCredentials {
  site_url: string;
  username: string;
  app_password: string;
}

export interface PublishResult {
  platform_post_id: string;
  platform_url: string;
}

export async function publishToWordPress(
  credentials: WordPressCredentials,
  post: { title: string; content_html: string; tldr: string }
): Promise<PublishResult> {
  const { site_url, username, app_password } = credentials;
  const basicAuth = Buffer.from(`${username}:${app_password}`).toString("base64");

  const res = await fetch(`${site_url.replace(/\/$/, "")}/wp-json/wp/v2/posts`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: post.title,
      content: post.content_html,
      excerpt: post.tldr,
      status: "publish",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WordPress publish failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { id: number; link: string };
  return {
    platform_post_id: String(data.id),
    platform_url: data.link,
  };
}

export async function testWordPressConnection(
  credentials: WordPressCredentials
): Promise<void> {
  const { site_url, username, app_password } = credentials;
  const basicAuth = Buffer.from(`${username}:${app_password}`).toString("base64");

  const res = await fetch(`${site_url.replace(/\/$/, "")}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    throw new Error(`WordPress auth failed (${res.status}) — check site URL and Application Password`);
  }
}
