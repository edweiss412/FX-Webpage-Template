import { describe, expect, it } from "vitest";
import { deriveStep3DisplayState, type DisplayDerivationInput } from "@/lib/admin/step3DisplayState";

const base: DisplayDerivationInput = {
  status: "staged",
  lastFinalizeFailureCode: null,
  hasWellFormedParseResult: true,
  linkedShow: null,
  publishIntent: false,
  sessionLinked: false,
};

describe("deriveStep3DisplayState (spec §4.2 ordered algorithm)", () => {
  it("rule 1: hard-block statuses outrank any linked show", () => {
    for (const status of ["hard_failed", "live_row_conflict", "discard_retryable"] as const) {
      expect(
        deriveStep3DisplayState({
          ...base,
          status,
          linkedShow: { published: true, archived: false },
          sessionLinked: true,
        }),
      ).toBe("needs_review_other");
    }
  });

  it("rule 2: staged + failure code with well-formed parse → re-apply modal row", () => {
    expect(
      deriveStep3DisplayState({ ...base, status: "staged", lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED" }),
    ).toBe("needs_review_reapply");
  });

  it("rule 2: staged + failure code with null/corrupt parse → no-details recovery", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "staged",
        lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
        hasWellFormedParseResult: false,
      }),
    ).toBe("needs_review_no_details");
  });

  it("rule 3a: permanent_ignore / defer → set_aside; rule 3b: skipped_non_sheet → skipped (distinct copy)", () => {
    for (const status of ["permanent_ignore", "defer_until_modified"] as const) {
      expect(deriveStep3DisplayState({ ...base, status })).toBe("set_aside");
    }
    expect(deriveStep3DisplayState({ ...base, status: "skipped_non_sheet" })).toBe("skipped");
  });

  it("rule 4: crew-visible linked show (session OR existing-show) → Live", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: true, archived: false },
        sessionLinked: true,
      }),
    ).toBe("live");
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: true, archived: false },
        sessionLinked: false,
      }),
    ).toBe("live");
  });

  it("rule 4 R6: archived linked show is NOT Live", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: true, archived: true },
        sessionLinked: true,
      }),
    ).toBe("held");
  });

  it("rule 5 R8: pre-CAS session-linked published=false + publish_intent → Ready to publish", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: false, archived: false },
        sessionLinked: true,
        publishIntent: true,
      }),
    ).toBe("ready_to_publish");
  });

  it("rule 6: session-linked published=false + no intent → Held", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "applied",
        linkedShow: { published: false, archived: false },
        sessionLinked: true,
        publishIntent: false,
      }),
    ).toBe("held");
  });

  it("rule 7: no linked show, clean → Ready (pre-finalize)", () => {
    expect(deriveStep3DisplayState({ ...base, status: "staged" })).toBe("ready");
    expect(deriveStep3DisplayState({ ...base, status: "applied" })).toBe("ready");
  });

  it("existing-show (not session-linked) pre-CAS published=false is NOT ready_to_publish (rule 5 needs sessionLinked)", () => {
    expect(
      deriveStep3DisplayState({
        ...base,
        status: "staged",
        linkedShow: { published: false, archived: false },
        sessionLinked: false,
      }),
    ).toBe("ready");
  });
});
