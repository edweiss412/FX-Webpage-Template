import { describe, expect, test } from "vitest";
import pkg from "../../package.json";

describe("resend dependency", () => {
  test("resend is a declared dependency", () => {
    expect(pkg.dependencies).toHaveProperty("resend");
  });
  test("the module resolves", async () => {
    await expect(import("resend")).resolves.toBeTruthy();
  });
});
