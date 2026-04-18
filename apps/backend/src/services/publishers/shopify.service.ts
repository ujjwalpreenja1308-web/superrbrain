export interface ShopifyCredentials {
  shop: string; // e.g. "my-store" (without .myshopify.com)
  access_token: string;
  blog_id: string;
}

export interface PublishResult {
  platform_post_id: string;
  platform_url: string;
}

const API_VERSION = "2024-01";

export async function publishToShopify(
  credentials: ShopifyCredentials,
  post: { title: string; content_html: string }
): Promise<PublishResult> {
  const { shop, access_token, blog_id } = credentials;
  const url = `https://${shop}.myshopify.com/admin/api/${API_VERSION}/blogs/${blog_id}/articles.json`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Shopify-Access-Token": access_token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      article: {
        title: post.title,
        body_html: post.content_html,
        published: true,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify publish failed (${res.status}): ${body}`);
  }

  const data = await res.json() as { article: { id: number; handle: string } };
  return {
    platform_post_id: String(data.article.id),
    platform_url: `https://${shop}.myshopify.com/blogs/news/${data.article.handle}`,
  };
}

export async function testShopifyConnection(
  credentials: ShopifyCredentials
): Promise<void> {
  const { shop, access_token } = credentials;
  const url = `https://${shop}.myshopify.com/admin/api/${API_VERSION}/shop.json`;

  const res = await fetch(url, {
    headers: { "X-Shopify-Access-Token": access_token },
  });

  if (!res.ok) {
    throw new Error(`Shopify auth failed (${res.status}) — check shop name and access token`);
  }
}
