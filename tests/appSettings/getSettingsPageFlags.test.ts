import { describe, test, expect } from "vitest";
import { getSettingsPageFlags } from "@/lib/appSettings/getSettingsPageFlags";

function mockClient(
  result: { data: unknown; error: { message: string } | null },
  opts?: { throwFrom?: boolean },
) {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    async maybeSingle() {
      return result;
    },
  };
  return {
    from: () => {
      if (opts?.throwFrom) throw new Error("boom");
      return builder;
    },
  } as never;
}

describe("getSettingsPageFlags", () => {
  test("maps 4 columns → flags (literal true only)", async () => {
    const row = {
      auto_publish_clean_first_seen: true,
      alert_on_sync_problems: false,
      daily_review_digest: true,
      alert_on_auto_publish: null,
    };
    const r = await getSettingsPageFlags(mockClient({ data: row, error: null }));
    expect(r).toEqual({
      kind: "value",
      autoPublishCleanFirstSeen: true,
      alertOnSyncProblems: false,
      dailyReviewDigest: true,
      alertOnAutoPublish: false,
    });
  });
  test("FAIL-CLOSED: truthy non-boolean values map to false (matches existing single getters)", async () => {
    // Codex plan R7 MEDIUM: never enable a toggle on 'false'/'true'/1/etc — only literal true.
    const row = {
      auto_publish_clean_first_seen: "false",
      alert_on_sync_problems: 1,
      daily_review_digest: "true",
      alert_on_auto_publish: "yes",
    };
    const r = await getSettingsPageFlags(mockClient({ data: row, error: null }));
    expect(r).toEqual({
      kind: "value",
      autoPublishCleanFirstSeen: false,
      alertOnSyncProblems: false,
      dailyReviewDigest: false,
      alertOnAutoPublish: false,
    });
  });
  test("returned Supabase error → infra_error", async () => {
    const r = await getSettingsPageFlags(mockClient({ data: null, error: { message: "timeout" } }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("missing default row (data null, no error) → infra_error", async () => {
    const r = await getSettingsPageFlags(mockClient({ data: null, error: null }));
    expect(r).toEqual({ kind: "infra_error" });
  });
  test("thrown from .from() → infra_error (not a crash)", async () => {
    const r = await getSettingsPageFlags(
      mockClient({ data: null, error: null }, { throwFrom: true }),
    );
    expect(r).toEqual({ kind: "infra_error" });
  });
});
