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

function verifyDodoSignature(body: string, signature: string, secret: string): boolean {
  try {
    const hmac = createHmac("sha256", secret);
    hmac.update(body);
    const expected = hmac.digest("hex");
    const sig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
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

  if (!verifyDodoSignature(rawBody, signature, webhookSecret)) {
    console.warn("[webhook] Invalid Dodo signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Replay protection: reject webhooks older than 5 minutes
  const webhookTimestamp =
    c.req.header("webhook-timestamp") ?? c.req.header("x-dodo-timestamp");
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
    const productId = (data.product_id ?? data.productId) as string | undefined;
    const customerEmail = (data.customer_email ?? data.email) as string | undefined;
    const customerId = (data.customer_id ?? data.customerId) as string | undefined;
    const subscriptionId = (data.subscription_id ?? data.subscriptionId) as string | undefined;

    if (!productId || !customerEmail) {
      console.warn("[webhook] Missing product_id or customer_email", data);
      return c.json({ received: true });
    }

    const plan = PRODUCT_PLAN_MAP[productId];
    if (!plan) {
      console.warn(`[webhook] Unknown product_id: ${productId}`);
      return c.json({ received: true });
    }

    // Prefer user_id from metadata (fast, O(1)) — fall back to email scan
    const metadataUserId = (data.metadata as Record<string, string> | undefined)?.user_id;

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
    const customerEmail = (data.customer_email ?? data.email) as string | undefined;
    const metadataUserId = (data.metadata as Record<string, string> | undefined)?.user_id;

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
