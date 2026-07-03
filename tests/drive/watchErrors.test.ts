import { describe, expect, test } from "vitest";
import {
  classifyWatchError,
  redactWatchError,
  ESCALATION_THRESHOLD,
  STALE_PENDING_MAX_AGE_MS,
} from "@/lib/drive/watchErrors";
import { DriveWatchInfraError } from "@/lib/drive/watch";

describe("classifyWatchError", () => {
  test("DriveWatchInfraError (kind marker) → db", () => {
    expect(classifyWatchError(new DriveWatchInfraError("op", new Error("x")))).toBe("db");
  });
  test("DRIVE_WEBHOOK_BASE_URL throw → config", () => {
    expect(
      classifyWatchError(new Error("DRIVE_WEBHOOK_BASE_URL is required for Drive watch subscriptions")),
    ).toBe("config");
  });
  test("invalid_grant / default-credentials / GOOGLE_SERVICE_ACCOUNT_JSON → config", () => {
    expect(classifyWatchError(new Error("invalid_grant: account not found"))).toBe("config");
    expect(classifyWatchError(new Error("Could not load the default credentials"))).toBe("config");
    expect(classifyWatchError(new Error("GOOGLE_SERVICE_ACCOUNT_JSON is unset"))).toBe("config");
  });
  test("Drive HTTP / malformed-watch errors → drive_api", () => {
    expect(classifyWatchError(new Error("Drive files.watch response missing id/resourceId/expiration"))).toBe("drive_api");
    expect(classifyWatchError(new Error("Request failed with status code 500"))).toBe("drive_api");
  });
  test("total over unknown: string, undefined, null → drive_api (never throws)", () => {
    expect(classifyWatchError("boom")).toBe("drive_api");
    expect(classifyWatchError(undefined)).toBe("drive_api");
    expect(classifyWatchError(null)).toBe("drive_api");
  });
});

describe("redactWatchError", () => {
  // Failure mode caught: webhook secret / Bearer token leaking into admin-visible
  // alert context and durable app_events (the GEAR PII-leak class; spec §3.1.3, R2-6/R5-1).
  const SECRET = "0a9d3d1c-5c1e-4a58-9f4a-secret-value";
  test("scrubs the literal webhook secret and Bearer tokens, keeps diagnostics", () => {
    const msg = `Invalid token=${SECRET} while POST with Authorization: Bearer ya29.abc.def failed: DRIVE_WEBHOOK_BASE_URL is required`;
    const out = redactWatchError(msg, { webhookSecret: SECRET });
    expect(out).not.toContain(SECRET);
    expect(out).not.toContain("ya29.abc.def");
    expect(out).toContain("DRIVE_WEBHOOK_BASE_URL is required");
  });
  test("scrubs key/secret/authorization pairs", () => {
    const out = redactWatchError("secret: shh123 key=abc authorization: xyz");
    expect(out).not.toContain("shh123");
    expect(out).not.toContain("abc");
    expect(out).not.toContain("xyz");
  });
  test("truncates to 300 chars AFTER redaction", () => {
    const long = `token=leak-me ${"x".repeat(400)}`;
    const out = redactWatchError(long);
    expect(out.length).toBeLessThanOrEqual(300);
    expect(out).not.toContain("leak-me");
  });
});

describe("constants", () => {
  test("single source of truth values (spec §2)", () => {
    expect(ESCALATION_THRESHOLD).toBe(3);
    expect(STALE_PENDING_MAX_AGE_MS).toBe(3_600_000);
  });
});
