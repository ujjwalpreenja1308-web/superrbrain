import { task } from "@trigger.dev/sdk/v3";
import { runBrandOnboarding } from "../services/onboard-brand.service.js";

export const onboardBrand = task({
  id: "onboard-brand",
  run: async (payload: { brandId: string }) =>
    runBrandOnboarding(payload.brandId),
});
