import { AppError } from "../middleware/error.js";

export const PRODUCT_PLAN_MAP: Record<string, string> = {
  [process.env.DODO_PRODUCT_STARTER_MONTHLY ?? "starter_monthly"]: "starter",
  [process.env.DODO_PRODUCT_GROWTH_MONTHLY ?? "growth_monthly"]: "growth",
  [process.env.DODO_PRODUCT_PRO_MONTHLY ?? "pro_monthly"]: "pro",
};

const VALID_PLANS = new Set(["starter", "growth", "pro"]);

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

export function getCustomer(data: Record<string, unknown>): Record<string, unknown> | undefined {
  return asRecord(data.customer);
}

export function getMetadata(data: Record<string, unknown>): Record<string, string> | undefined {
  const rootMetadata = asRecord(data.metadata);
  const customerMetadata = asRecord(getCustomer(data)?.metadata);
  const metadata = { ...customerMetadata, ...rootMetadata };
  return Object.keys(metadata).length > 0 ? (metadata as Record<string, string>) : undefined;
}

export function getCustomerEmail(data: Record<string, unknown>): string | undefined {
  return (data.customer_email ?? data.email ?? getCustomer(data)?.email) as string | undefined;
}

export function getCustomerId(data: Record<string, unknown>): string | undefined {
  return (data.customer_id ?? data.customerId ?? getCustomer(data)?.customer_id ?? getCustomer(data)?.customerId) as string | undefined;
}

export function getPlanFromDodoData(data: Record<string, unknown>): string | undefined {
  const productId =
    (data.product_id ?? data.productId) as string | undefined ??
    ((data.product_cart as { product_id?: string; productId?: string }[] | undefined)?.[0]?.product_id) ??
    ((data.product_cart as { product_id?: string; productId?: string }[] | undefined)?.[0]?.productId);

  if (productId && PRODUCT_PLAN_MAP[productId]) return PRODUCT_PLAN_MAP[productId];

  const metadataPlan = getMetadata(data)?.plan;
  if (metadataPlan && VALID_PLANS.has(metadataPlan)) return metadataPlan;

  return undefined;
}

function getDodoApiBaseUrl(): string {
  const configured = process.env.DODO_PAYMENTS_API_URL ?? process.env.DODO_API_URL;
  if (configured) return configured.replace(/\/$/, "");
  return process.env.DODO_PAYMENTS_ENVIRONMENT === "test_mode"
    ? "https://test.dodopayments.com"
    : "https://live.dodopayments.com";
}

export async function retrieveDodoSubscription(subscriptionId: string): Promise<Record<string, unknown>> {
  const apiKey = process.env.DODO_PAYMENTS_API_KEY;
  if (!apiKey) {
    console.error("[dodo] DODO_PAYMENTS_API_KEY not set");
    throw new AppError(500, "Billing confirmation is not configured");
  }

  const response = await fetch(`${getDodoApiBaseUrl()}/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[dodo] Failed to retrieve subscription", {
      subscriptionId,
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new AppError(502, "Could not confirm billing status");
  }

  return asRecord(await response.json()) ?? {};
}
