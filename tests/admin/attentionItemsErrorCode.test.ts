// @vitest-environment node
import { describe, expect, it } from "vitest";
import { deriveAttentionItems, type AttentionAlertInput } from "@/lib/admin/attentionItems";

const base = (over: Partial<AttentionAlertInput>): AttentionAlertInput => ({
  id: "a1",
  code: "PARSE_ERROR_LAST_GOOD",
  context: null,
  raised_at: "2026-07-20T00:00:00Z",
  occurrence_count: 1,
  identityText: null,
  messageParams: {},
  crewName: null,
  ...over,
});
const alertOf = (r: AttentionAlertInput[]) =>
  deriveAttentionItems({ alerts: r, feed: null, slug: "s" })[0]?.alert;

describe("AttentionAlertPayload.errorCode", () => {
  it("carries an allowlisted context.error_code", () =>
    expect(alertOf([base({ context: { error_code: "MI-4_NO_CREW" } })])?.errorCode).toBe("MI-4_NO_CREW"));
  it("is null for a non-allowlisted context value (read-layer defense)", () =>
    expect(alertOf([base({ context: { error_code: "PARSE_HARD_FAIL" } })])?.errorCode).toBeNull());
  it("is null when absent", () =>
    expect(alertOf([base({ context: { drive_file_id: "f" } })])?.errorCode).toBeNull());
});
