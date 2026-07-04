// tests/log/logAdminOutcomeIntegration.test.ts
//
// Real-logger integration (NOT the @/lib/log mock used by logAdminOutcome.test.ts):
// exercises logAdminOutcome against the actual logger + sink pipeline so the
// invariant-9 "telemetry never throws over a committed mutation" guarantee and the
// sanitizeContext PII net are proven end-to-end.
import { afterEach, describe, expect, test } from "vitest";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";
import { setLogSink, resetLogSink } from "@/lib/log";
import type { LogRecord } from "@/lib/log/types";

afterEach(() => resetLogSink());

describe("logAdminOutcome (real logger integration)", () => {
  // Failure mode caught: a sink (or buildRecord/sanitizeContext) throwing SYNCHRONOUSLY
  // makes log.info reject; an un-wrapped await inside logAdminOutcome would let that
  // throw escape over an ALREADY-COMMITTED mutation (e.g. archive.ts post-commit).
  test("resolves (never rejects) even when the sink throws synchronously", async () => {
    setLogSink(() => {
      throw new Error("sink boom");
    });
    await expect(
      logAdminOutcome({ code: "SHOW_ARCHIVED", source: "api.admin.show.archive" }),
    ).resolves.toBeUndefined();
  });

  // Failure mode caught (finding #5): an email accidentally placed in extra{} leaking
  // to app_events unredacted. extra{} passes through the logger's sanitizeContext
  // email-redaction net — this pins that the net actually fires on extra{} values.
  test("email placed in extra{} is redacted by sanitizeContext", async () => {
    let captured: LogRecord | undefined;
    setLogSink((record) => {
      captured = record;
    });
    await logAdminOutcome({
      code: "SHOW_ARCHIVED",
      source: "api.admin.show.archive",
      extra: { note: "reach doug@example.com asap" },
    });
    expect(captured).toBeDefined();
    expect(JSON.stringify(captured!.context)).not.toContain("doug@example.com");
    expect(captured!.context.note).toBe("reach [email-redacted] asap");
  });
});
