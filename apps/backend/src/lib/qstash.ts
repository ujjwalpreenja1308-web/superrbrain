import { Client } from "@upstash/workflow";
import { isLocalDevBypassEnabled, requireEnv } from "./env.js";
import { runBrandOnboarding } from "../services/onboard-brand.service.js";
import { runMonitoringPipeline } from "../services/run-monitoring.service.js";

export const ONBOARD_BRAND_WORKFLOW_PATH = "/workflows/onboard-brand";
export const RUN_MONITORING_WORKFLOW_PATH = "/workflows/run-monitoring";

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

export function getRunMonitoringWorkflowUrl(): string {
  const backendUrl = requireEnv("BACKEND_URL").replace(/\/$/, "");
  return `${backendUrl}${RUN_MONITORING_WORKFLOW_PATH}`;
}

export async function dispatchBrandOnboarding(brandId: string) {
  if (isLocalDevBypassEnabled()) {
    void runBrandOnboarding(brandId).catch((error) =>
      console.error("Local brand onboarding failed:", error),
    );
    return;
  }
  return getWorkflowClient().trigger({
    url: getOnboardBrandWorkflowUrl(),
    body: { brandId },
    retries: 3,
    retryDelay: "max(1000, pow(2, retried) * 1000)",
  });
}

export async function dispatchMonitoringRun(brandId: string, runId: string) {
  if (isLocalDevBypassEnabled()) {
    void runMonitoringPipeline(brandId, runId).catch((error) =>
      console.error("Local monitoring run failed:", error),
    );
    return;
  }
  return getWorkflowClient().trigger({
    url: getRunMonitoringWorkflowUrl(),
    body: { brandId, runId },
    retries: 3,
    retryDelay: "max(1000, pow(2, retried) * 1000)",
  });
}
