import { describe, expect, it } from "vitest";
import { buildStep3Row } from "@/components/admin/OnboardingWizard";

const manifest = {
  drive_file_id: "d1",
  status: "staged" as const,
  name: null,
  publish_intent: false,
  created_show_id: null as string | null,
  wizard_session_id: "s1",
};
const pending = {
  staged_id: "st1",
  parse_result: { show: { title: "X" } },
  last_finalize_failure_code: null as string | null,
  triggered_review_items: null as unknown,
};

describe("buildStep3Row review-items two-level guard (spec §4.3.1, R6)", () => {
  it("[null] element → reviewItemsCorrupt, triggeredReviewItems empty", () => {
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: [null] }, []);
    expect(row.reviewItemsCorrupt).toBe(true);
    expect(row.triggeredReviewItems ?? []).toEqual([]);
  });
  it("missing-field element → reviewItemsCorrupt", () => {
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: [{ id: "x" }] }, []);
    expect(row.reviewItemsCorrupt).toBe(true);
  });
  it("valid items → not corrupt, populated", () => {
    const items = [{ id: "a", invariant: "MI-6", section: "sched" }];
    const row = buildStep3Row({ ...manifest }, { ...pending, triggered_review_items: items }, []);
    expect(row.reviewItemsCorrupt).toBe(false);
    expect(row.triggeredReviewItems?.length).toBe(1);
  });
});

describe("buildStep3Row Live/Held candidate selection (spec §4.3, plan-R1)", () => {
  const sessionShow = {
    id: "show1",
    drive_file_id: "d1",
    published: true,
    archived: false,
    wizard_created_session_id: "s1",
  };
  it("session-provenance join wins → Live, sessionLinked", () => {
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "show1" }, pending, [sessionShow]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(true);
  });
  it("existing-show branch, NULL provenance → Live, not sessionLinked", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null }, pending, [
      { ...sessionShow, wizard_created_session_id: null },
    ]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(false);
  });
  it("existing-show branch, PRIOR-session non-null id → Live (IS DISTINCT FROM, not IS NULL)", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null, wizard_session_id: "s2" }, pending, [
      { ...sessionShow, wizard_created_session_id: "s1" },
    ]);
    expect(row.displayState).toBe("live");
    expect(row.sessionLinked).toBe(false);
  });
  it("existing-show ARCHIVED prior-session show → falls to Ready (not Live, not Held)", () => {
    const row = buildStep3Row({ ...manifest, created_show_id: null, wizard_session_id: "s2" }, pending, [
      { ...sessionShow, archived: true, wizard_created_session_id: "s1" },
    ]);
    expect(row.displayState).toBe("ready");
  });
  it("session-provenance precedence over a same-drive existing candidate", () => {
    const other = { id: "showX", drive_file_id: "d1", published: true, archived: false, wizard_created_session_id: null };
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "show1" }, pending, [other, sessionShow]);
    expect(row.sessionLinked).toBe(true);
  });
  it("forged/stale non-null created_show_id matching NO candidate → not Live (R2 safety)", () => {
    const row = buildStep3Row({ ...manifest, status: "applied", created_show_id: "ghost" }, pending, [sessionShow]);
    expect(row.displayState).not.toBe("live");
    expect(row.linkedShow ?? null).toBeNull();
  });
  it("pre-CAS finalize (all_batches_complete): session show published=false + publish_intent → Ready to publish (R8)", () => {
    const preCasShow = { ...sessionShow, published: false, wizard_created_session_id: "s1" };
    const row = buildStep3Row(
      { ...manifest, status: "applied", created_show_id: "show1", publish_intent: true },
      pending,
      [preCasShow],
    );
    expect(row.displayState).toBe("ready_to_publish");
    expect(row.publishIntent).toBe(true);
    expect(row.sessionLinked).toBe(true);
  });
  it("pre-CAS finalize, session show published=false, NO publish_intent → Held (deliberately unchecked)", () => {
    const preCasShow = { ...sessionShow, published: false, wizard_created_session_id: "s1" };
    const row = buildStep3Row(
      { ...manifest, status: "applied", created_show_id: "show1", publish_intent: false },
      pending,
      [preCasShow],
    );
    expect(row.displayState).toBe("held");
  });
});

describe("buildStep3Row handles rows with NO pending_syncs row (MEDIUM plan-R3)", () => {
  it("hard_failed row (pendingRow null) → Needs-review-other, no crash", () => {
    const row = buildStep3Row({ ...manifest, status: "hard_failed" }, null, []);
    expect(row.displayState).toBe("needs_review_other");
    expect(row.reviewItemsCorrupt).toBe(false);
    expect(row.triggeredReviewItems ?? []).toEqual([]);
  });
  it("skipped_non_sheet row (pendingRow null) → skipped, no crash on parse_result deref", () => {
    const row = buildStep3Row({ ...manifest, status: "skipped_non_sheet" }, null, []);
    expect(row.displayState).toBe("skipped");
  });
  it("permanent_ignore row (pendingRow null) → set_aside", () => {
    expect(buildStep3Row({ ...manifest, status: "permanent_ignore" }, null, []).displayState).toBe("set_aside");
  });
});
