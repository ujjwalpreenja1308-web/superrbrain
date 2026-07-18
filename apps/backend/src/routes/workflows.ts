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
import {
  chunkBrightDataInputs,
  getBrightDataSnapshotStatus,
} from "../services/brightdata.service.js";

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
    const batches = chunkBrightDataInputs(run.prompts).map((prompts) => ({
      ...run,
      prompts,
    }));
    const snapshotIds = await Promise.all(
      batches.map((batch, index) =>
        context.run(`trigger-bright-data-batch-${index}`, () =>
          triggerMonitoringQueries(batch),
        ),
      ),
    );
    const resultsByBatch: Awaited<
      ReturnType<typeof downloadMonitoringQueries>
    >[] = [];
    for (let attempt = 0; attempt < 120; attempt++) {
      const pending = snapshotIds
        .map((_, index) => index)
        .filter((index) => !resultsByBatch[index]);
      const progress = await Promise.all(
        pending.map((index) =>
          context.run(`check-bright-data-${index}-${attempt}`, () =>
            getBrightDataSnapshotStatus(snapshotIds[index]),
          ),
        ),
      );

      for (let offset = 0; offset < pending.length; offset++) {
        const index = pending[offset];
        const batchProgress = progress[offset];
        if (batchProgress.status === "failed") {
          throw new Error(
            `Bright Data batch ${index + 1} failed${batchProgress.error ? `: ${batchProgress.error}` : ""}`,
          );
        }
        if (batchProgress.status !== "ready") continue;

        const results = await context.run(
          `download-bright-data-results-${index}`,
          () => downloadMonitoringQueries(batches[index], snapshotIds[index]),
        );
        await context.run(`save-ai-responses-${index}`, () =>
          saveMonitoringResponses(run, results),
        );
        resultsByBatch[index] = results;
      }

      if (resultsByBatch.filter(Boolean).length === batches.length) break;
      await context.sleep(`wait-bright-data-${attempt}`, "15s");
    }
    if (resultsByBatch.filter(Boolean).length !== batches.length)
      throw new Error("Bright Data batches timed out after 30 minutes");

    const results = resultsByBatch.flat();
    const responseCount = results.length;
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
