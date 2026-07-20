// @vitest-environment node
// PR1 half of the persist -> read -> derive -> render contract (attention-alert-routing §3.1).
// Task 2.8 (PR2) closes derive -> composed DOM; this half proves the REAL seam's output
// flows through derivation to a resolvable errorCode.
import { describe, expect, it } from "vitest";
import { buildParseErrorContext } from "@/lib/sync/parseErrorContext";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";
import { parseFailureReasonTitle } from "@/lib/messages/parseFailureReason";

// Drive the ACTUAL producer seam, not a hand-built context.
const chain = (failureCode: string | null) => {
  const context = buildParseErrorContext({ driveFileId: "f", sheetName: "S", failureCode });
  const row: AttentionAlertInput = {
    id: "p1",
    code: "PARSE_ERROR_LAST_GOOD",
    context,
    raised_at: "2026-07-20T00:00:00Z",
    occurrence_count: 1,
    identityText: null,
    messageParams: {},
    crewName: null,
  };
  const alert = deriveAttentionItems({ alerts: [row], feed: null, slug: "s" })[0]?.alert;
  return parseFailureReasonTitle(alert?.errorCode ?? null);
};

describe("seam -> derive -> resolve (PR1 half)", () => {
  it("allowlisted failure flows through to its title", () =>
    expect(chain("MI-5b_DUPLICATE_CREW_EMAIL")).toBe("Two crew rows share an email"));
  it("PARSE_HARD_FAIL flows through to null (dropped at the seam)", () =>
    expect(chain("PARSE_HARD_FAIL")).toBeNull());
});
