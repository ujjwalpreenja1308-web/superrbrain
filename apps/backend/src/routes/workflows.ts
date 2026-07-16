import { Hono } from "hono";
import { serve } from "@upstash/workflow/hono";
import { z } from "zod";
import {
  beginBrandOnboarding,
  extractBrandProfile,
  generateBrandPrompts,
  markBrandOnboardingError,
  markBrandOnboardingReady,
  saveBrandProfile,
  saveBrandPrompts,
  scrapeBrandWebsite,
} from "../services/onboard-brand.service.js";
import {
  analyzeMonitoringCitations,
  completeMonitoringRun,
  downloadMonitoringQueries,
  markMonitoringRunError,
  prepareMonitoringRun,
  saveMonitoringResponses,
  triggerMonitoringQueries,
} from "../services/run-monitoring.service.js";
import { getBrightDataSnapshotStatus } from "../services/brightdata.service.js";

const app = new Hono();
const onboardPayloadSchema = z.object({ brandId: z.string().uuid() });
type OnboardPayload = z.infer<typeof onboardPayloadSchema>;
const monitoringPayloadSchema = z.object({
  brandId: z.string().uuid(),
  runId: z.string().uuid(),
});
type MonitoringPayload = z.infer<typeof monitoringPayloadSchema>;

const onboardBrandWorkflow = serve<OnboardPayload>(
  async (context) => {
    const { brandId } = context.requestPayload;

    const start = await context.run("begin-brand-onboarding", () =>
      beginBrandOnboarding(brandId),
    );
    const markdown = await context.run("scrape-brand-website", () =>
      scrapeBrandWebsite(start.url),
    );
    const extracted = await context.run("extract-brand-profile", () =>
      extractBrandProfile(markdown, start.url),
    );
    await context.run("save-brand-profile", () =>
      saveBrandProfile(brandId, extracted),
    );
    const prompts = await context.run("generate-brand-prompts", () =>
      generateBrandPrompts(extracted, start.promptLimit),
    );
    const promptCount = await context.run("save-brand-prompts", () =>
      saveBrandPrompts(brandId, prompts),
    );
    await context.run("complete-brand-onboarding", () =>
      markBrandOnboardingReady(brandId),
    );

    return { success: true, brandName: extracted.name, promptCount };
  },
  {
    schema: onboardPayloadSchema,
    env: process.env,
    url: process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/workflows/onboard-brand`
      : undefined,
    failureFunction: async ({ context, failResponse, failStack }) => {
      const parsed = onboardPayloadSchema.safeParse(context.requestPayload);
      if (parsed.success) {
        await markBrandOnboardingError(parsed.data.brandId);
      }
      console.error("Brand onboarding workflow failed", {
        brandId: parsed.success ? parsed.data.brandId : "invalid-payload",
        error: failResponse,
        stack: failStack,
      });
      return "Brand onboarding failed and was marked for retry.";
    },
  },
);

const runMonitoringWorkflow = serve<MonitoringPayload>(
  async (context) => {
    const { brandId, runId } = context.requestPayload;

    const run = await context.run("prepare-monitoring-run", () =>
      prepareMonitoringRun(brandId, runId),
    );
    const snapshotId = await context.run("trigger-bright-data-batch", () =>
      triggerMonitoringQueries(run),
    );
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      const progress = await context.run(`check-bright-data-${attempt}`, () =>
        getBrightDataSnapshotStatus(snapshotId),
      );
      if (progress.status === "failed") {
        throw new Error(
          `Bright Data snapshot failed${progress.error ? `: ${progress.error}` : ""}`,
        );
      }
      if (progress.status === "ready") {
        ready = true;
        break;
      }
      await context.sleep(`wait-bright-data-${attempt}`, "15s");
    }
    if (!ready) throw new Error("Bright Data snapshot timed out after 30 minutes");

    const results = await context.run("download-bright-data-results", () =>
      downloadMonitoringQueries(run, snapshotId),
    );
    const responseCount = await context.run("save-ai-responses", () =>
      saveMonitoringResponses(run, results),
    );
    const citationAnalysis = await context.run(
      "analyze-monitoring-citations",
      () => analyzeMonitoringCitations(run, results),
    );
    const report = await context.run("complete-monitoring-run", () =>
      completeMonitoringRun(run),
    );

    return {
      success: true,
      runId,
      responseCount,
      ...citationAnalysis,
      visibilityScore: report.visibility_score,
      gapScore: report.gap_score,
    };
  },
  {
    schema: monitoringPayloadSchema,
    env: process.env,
    url: process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/workflows/run-monitoring`
      : undefined,
    failureFunction: async ({ context, failResponse, failStack }) => {
      const parsed = monitoringPayloadSchema.safeParse(context.requestPayload);
      if (parsed.success) {
        await markMonitoringRunError(parsed.data.brandId);
      }
      console.error("Monitoring workflow failed", {
        brandId: parsed.success ? parsed.data.brandId : "invalid-payload",
        runId: parsed.success ? parsed.data.runId : "invalid-payload",
        error: failResponse,
        stack: failStack,
      });
      return "Monitoring failed and the brand was marked for retry.";
    },
  },
);

app.post("/onboard-brand", onboardBrandWorkflow);
app.post("/run-monitoring", runMonitoringWorkflow);

export { app as workflowRoutes };
