import { Hono } from "hono";
import { supabaseAdmin } from "../lib/supabase.js";
import { createHmac, timingSafeEqual } from "crypto";

const webhookRoutes = new Hono();

// Map Dodo product IDs to plan tiers
// Set these env vars to your actual Dodo product IDs
const PRODUCT_PLAN_MAP: Record<string, string> = {
  [process.env.DODO_PRODUCT_STARTER_MONTHLY ?? "starter_monthly"]: "starter",
  [process.env.DODO_PRODUCT_GROWTH_MONTHLY ?? "growth_monthly"]: "growth",
  [process.env.DODO_PRODUCT_PRO_MONTHLY ?? "pro_monthly"]: "pro",
};

const VALID_PLANS = new Set(["starter", "growth", "pro"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function getCustomer(data: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(data.customer);
}

function getMetadata(data: Record<string, unknown>): Record<string, string> | undefined {
  const rootMetadata = asRecord(data.metadata);
  const customerMetadata = asRecord(getCustomer(data)?.metadata);
  const metadata = { ...customerMetadata, ...rootMetadata };
  return Object.keys(metadata).length > 0 ? (metadata as Record<string, string>) : undefined;
}

function getCustomerEmail(data: Record<string, unknown>): string | undefined {
  return (data.customer_email ?? data.email ?? getCustomer(data)?.email) as string | undefined;
}

function getCustomerId(data: Record<string, unknown>): string | undefined {
  return (data.customer_id ?? data.customerId ?? getCustomer(data)?.customer_id ?? getCustomer(data)?.customerId) as string | undefined;
}

function getPlanFromWebhookData(data: Record<string, unknown>): string | undefined {
  const productId =
    (data.product_id ?? data.productId) as string | undefined ??
    ((data.product_cart as { product_id?: string; productId?: string }[] | undefined)?.[0]?.product_id) ??
    ((data.product_cart as { product_id?: string; productId?: string }[] | undefined)?.[0]?.productId);

  if (productId && PRODUCT_PLAN_MAP[productId]) return PRODUCT_PLAN_MAP[productId];

  const metadataPlan = getMetadata(data)?.plan;
  if (metadataPlan && VALID_PLANS.has(metadataPlan)) return metadataPlan;

  return undefined;
}

function getSignatureCandidates(signature: string): string[] {
  return signature
    .split(/\s+/)
    .flatMap((part) => part.split(","))
    .map((part) => part.trim())
    .filter((part) => part && !/^v\d+$/i.test(part))
    .map((part) => part.replace(/^v\d+=/i, "").replace(/^sha256=/i, ""));
}

function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim();
  if (trimmed.startsWith("whsec_")) {
    return Buffer.from(trimmed.slice("whsec_".length), "base64");
  }
  return Buffer.from(trimmed, "utf8");
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

function matchesSignature(digest: Buffer, candidates: string[]): boolean {
  for (const candidate of candidates) {
    if (/^[a-f0-9]{64}$/i.test(candidate) && safeEqual(digest, Buffer.from(candidate, "hex"))) {
      return true;
    }

    try {
      if (safeEqual(digest, Buffer.from(candidate, "base64"))) {
        return true;
      }
    } catch {
      // Ignore malformed signature candidates and keep checking.
    }
  }

  return false;
}

function verifyDodoSignature(
  body: string,
  signature: string,
  secret: string,
  webhookId?: string,
  webhookTimestamp?: string
): boolean {
  try {
    const candidates = getSignatureCandidates(signature);
    if (candidates.length === 0) return false;

    if (webhookId && webhookTimestamp) {
      const signedPayload = `${webhookId}.${webhookTimestamp}.${body}`;
      const digest = createHmac("sha256", decodeWebhookSecret(secret)).update(signedPayload).digest();
      if (matchesSignature(digest, candidates)) return true;
    }

    // Backward compatibility for any old manually configured Dodo signature
    // format that signed only the raw body as a hex digest.
    const legacyDigest = createHmac("sha256", secret).update(body).digest();
    return matchesSignature(legacyDigest, candidates);
  } catch {
    return false;
  }
}

webhookRoutes.post("/dodo", async (c) => {
  const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook] DODO_WEBHOOK_SECRET not set");
    return c.json({ error: "Webhook not configured" }, 500);
  }

  // Read raw body for signature verification
  const rawBody = await c.req.text();
  const signature = c.req.header("webhook-signature") ?? c.req.header("x-dodo-signature") ?? "";
  const webhookId = c.req.header("webhook-id") ?? c.req.header("x-dodo-id") ?? undefined;
  const webhookTimestamp =
    c.req.header("webhook-timestamp") ?? c.req.header("x-dodo-timestamp") ?? undefined;

  if (!verifyDodoSignature(rawBody, signature, webhookSecret, webhookId, webhookTimestamp)) {
    console.warn("[webhook] Invalid Dodo signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Replay protection: reject webhooks older than 5 minutes
  if (webhookTimestamp) {
    const ts = parseInt(webhookTimestamp, 10);
    if (!Number.isNaN(ts) && Math.abs(Date.now() / 1000 - ts) > 300) {
      console.warn("[webhook] Stale timestamp, possible replay attack");
      return c.json({ error: "Webhook timestamp too old" }, 400);
    }
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventType = event.type as string;
  console.log(`[webhook] Dodo event: ${eventType}`);

  // payment.succeeded — activate plan
  if (eventType === "payment.succeeded" || eventType === "subscription.active") {
    const data = (event.data ?? event) as Record<string, unknown>;
    const customerEmail = getCustomerEmail(data);
    const customerId = getCustomerId(data);
    const subscriptionId = (data.subscription_id ?? data.subscriptionId) as string | undefined;
    const plan = getPlanFromWebhookData(data);

    if (!plan || !customerEmail) {
      console.warn("[webhook] Missing plan or customer_email", data);
      return c.json({ received: true });
    }

    // Prefer user_id from metadata (fast, O(1)) — fall back to email scan
    const metadataUserId = getMetadata(data)?.user_id;

    let user: { id: string; email?: string; user_metadata: Record<string, unknown> } | undefined;

    if (metadataUserId) {
      const { data: found, error } = await supabaseAdmin.auth.admin.getUserById(metadataUserId);
      if (error || !found.user) {
        console.warn(`[webhook] No user found for id: ${metadataUserId}`);
        return c.json({ received: true });
      }
      user = found.user;
    } else {
      // Fallback: scan by email
      if (!customerEmail) return c.json({ received: true });
      const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
      if (listError) {
        console.error("[webhook] Failed to list users", listError);
        return c.json({ error: "Internal error" }, 500);
      }
      user = users.users.find((u) => u.email === customerEmail);
      if (!user) {
        console.warn(`[webhook] No user found for email: ${customerEmail}`);
        return c.json({ received: true });
      }
    }

    // Upsert subscription row
    const { error: updateError } = await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan,
          status: "active",
          plan_activated_at: new Date().toISOString(),
          dodo_customer_id: customerId ?? null,
          dodo_subscription_id: subscriptionId ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (updateError) {
      console.error("[webhook] Failed to update subscription", updateError);
      return c.json({ error: "Failed to update plan" }, 500);
    }

    console.log(`[webhook] Plan activated: ${plan} for ${customerEmail} (user: ${user.id})`);
  }

  // subscription.cancelled — downgrade to trial
  if (eventType === "subscription.cancelled" || eventType === "subscription.expired") {
    const data = (event.data ?? event) as Record<string, unknown>;
    const customerEmail = getCustomerEmail(data);
    const metadataUserId = getMetadata(data)?.user_id;

    let user: { id: string; user_metadata: Record<string, unknown> } | undefined;

    if (metadataUserId) {
      const { data: found } = await supabaseAdmin.auth.admin.getUserById(metadataUserId);
      user = found?.user ?? undefined;
    } else {
      if (!customerEmail) return c.json({ received: true });
      const { data: users } = await supabaseAdmin.auth.admin.listUsers();
      user = users?.users.find((u) => u.email === customerEmail);
    }

    if (!user) return c.json({ received: true });

    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          plan: "trial",
          status: "cancelled",
          dodo_subscription_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    console.log(`[webhook] Plan cancelled for ${customerEmail} — reverted to trial`);
  }

  return c.json({ received: true });
});

export default webhookRoutes;
