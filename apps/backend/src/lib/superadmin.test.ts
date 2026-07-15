import { describe, expect, it } from "vitest";
import { isSuperAdminEmail } from "./superadmin.js";

describe("superadmin access", () => {
  it("recognizes the built-in superadmin email case-insensitively", () => {
    expect(isSuperAdminEmail("ujjwal.preenja1308@gmail.com")).toBe(true);
    expect(isSuperAdminEmail(" UJJWAL.PREENJA1308@GMAIL.COM ")).toBe(true);
    expect(isSuperAdminEmail("someone@example.com")).toBe(false);
  });
});
