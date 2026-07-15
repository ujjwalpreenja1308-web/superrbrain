import { Client } from "@upstash/workflow";
import { requireEnv } from "./env.js";

export const ONBOARD_BRAND_WORKFLOW_PATH = "/workflows/onboard-brand";

let workflowClient: Client | undefined;

function getWorkflowClient(): Client {
  workflowClient ??= new Client({
    baseUrl: requireEnv("QSTASH_URL"),
    token: requireEnv("QSTASH_TOKEN"),
  });
  return workflowClient;
}

export function getOnboardBrandWorkflowUrl(): string {
  const backendUrl = requireEnv("BACKEND_URL").replace(/\/$/, "");
  return `${backendUrl}${ONBOARD_BRAND_WORKFLOW_PATH}`;
}

export async function dispatchBrandOnboarding(brandId: string) {
  return getWorkflowClient().trigger({
    url: getOnboardBrandWorkflowUrl(),
    body: { brandId },
    retries: 3,
    retryDelay: "max(1000, pow(2, retried) * 1000)",
  });
}
