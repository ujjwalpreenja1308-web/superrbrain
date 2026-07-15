import { describe, expect, it } from "vitest";
import { isPrivateOrReservedAddress } from "./url-safety.service.js";

describe("URL address safety", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.4",
    "169.254.169.254",
    "192.168.1.2",
    "::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks private or local address %s", (address) => {
    expect(isPrivateOrReservedAddress(address)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])(
    "allows public address %s",
    (address) => {
      expect(isPrivateOrReservedAddress(address)).toBe(false);
    },
  );
});
