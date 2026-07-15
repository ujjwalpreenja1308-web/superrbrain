import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelDodoSubscription } from "./dodo.js";

beforeEach(() => {
  process.env.DODO_PAYMENTS_API_KEY = "test_api_key";
  process.env.DODO_PAYMENTS_API_URL = "https://billing.example.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DODO_PAYMENTS_API_KEY;
  delete process.env.DODO_PAYMENTS_API_URL;
});

describe("Dodo cancellation", () => {
  it("cancels the provider subscription before local downgrade", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await cancelDodoSubscription("sub_abc123");

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://billing.example.test/subscriptions/sub_abc123",
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.method).toBe("PATCH");
    expect(JSON.parse(String(request.body))).toEqual({
      status: "cancelled",
      cancel_reason: "cancelled_by_customer",
    });
  });

  it("does not treat provider failures as a successful cancellation", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("provider error", { status: 500 })),
    );

    await expect(cancelDodoSubscription("sub_abc123")).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});
