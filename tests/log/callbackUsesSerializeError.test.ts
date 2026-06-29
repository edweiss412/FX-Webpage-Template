// tests/log/callbackUsesSerializeError.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("auth/callback error serialization", () => {
  test("uses the shared serializeError, not a local errorLogValue", () => {
    const src = readFileSync("app/auth/callback/route.ts", "utf8");
    expect(src).not.toMatch(/function errorLogValue/);
    expect(src).toMatch(/from "@\/lib\/log\/serializeError"|from "@\/lib\/log"/);
  });
});
