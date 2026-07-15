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

const app = new Hono();
const payloadSchema = z.object({ brandId: z.string().uuid() });
type Payload = z.infer<typeof payloadSchema>;

const onboardBrandWorkflow = serve<Payload>(
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
    schema: payloadSchema,
    env: process.env,
    url: process.env.BACKEND_URL
      ? `${process.env.BACKEND_URL.replace(/\/$/, "")}/workflows/onboard-brand`
      : undefined,
    failureFunction: async ({ context, failResponse, failStack }) => {
      const parsed = payloadSchema.safeParse(context.requestPayload);
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

app.post("/onboard-brand", onboardBrandWorkflow);

export { app as workflowRoutes };
