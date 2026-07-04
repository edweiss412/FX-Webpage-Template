// tests/cron/annotateSyncStateChange.test.ts
import { describe, expect, test, vi, beforeEach } from "vitest";

const mockLimit = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServiceRoleClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: mockLimit }) }) }) }),
    }),
  }),
}));
import { annotateSyncStateChange } from "@/lib/cron/annotateSyncStateChange";

const partial = (fp: string) => ({
  outcome: "partial" as const,
  counts: { processed: 1 } as never,
  detail: { failuresFingerprint: fp },
});
// NOTE: block body (returns undefined) — an arrow-expression `() => mockLimit.mockReset()`
// returns the mock fn, which vitest treats as a post-test TEARDOWN callback and invokes;
// once a test has set mockRejectedValue that teardown call yields an unawaited rejected
// promise → spurious unhandled-rejection failure.
beforeEach(() => {
  mockLimit.mockReset();
});

describe("annotateSyncStateChange", () => {
  test("non-partial passes through with NO read", async () => {
    const ok = { outcome: "ok" as const, counts: { processed: 3 } as never };
    expect(await annotateSyncStateChange(ok)).toBe(ok);
    expect(mockLimit).not.toHaveBeenCalled();
  });
  test("same fingerprint as prior → stateChanged false + unchangedSinceRuns increment", async () => {
    mockLimit.mockResolvedValue({
      data: [{ context: { detail: { failuresFingerprint: "a|x", unchangedSinceRuns: 2 } } }],
      error: null,
    });
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({
      stateChanged: false,
      unchangedSinceRuns: 3,
      failuresFingerprint: "a|x",
    });
  });
  test("different fingerprint → stateChanged true, no unchangedSinceRuns", async () => {
    mockLimit.mockResolvedValue({
      data: [{ context: { detail: { failuresFingerprint: "a|x" } } }],
      error: null,
    });
    const out = await annotateSyncStateChange(partial("b|y"));
    expect(out.detail).toMatchObject({ stateChanged: true });
    expect((out.detail as Record<string, unknown>).unchangedSinceRuns).toBeUndefined();
  });
  test("returned {error} → canonical fail-open (fingerprint preserved, stateChanged true), no throw", async () => {
    mockLimit.mockResolvedValue({ data: null, error: { message: "down" } });
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({ stateChanged: true, failuresFingerprint: "a|x" });
    expect((out.detail as Record<string, unknown>).unchangedSinceRuns).toBeUndefined();
  });
  test("thrown read → identical canonical fail-open", async () => {
    mockLimit.mockRejectedValue(new Error("boom"));
    const out = await annotateSyncStateChange(partial("a|x"));
    expect(out.detail).toMatchObject({ stateChanged: true, failuresFingerprint: "a|x" });
  });
});
