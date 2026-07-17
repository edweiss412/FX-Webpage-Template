import { describe, it, expect } from "vitest";
import { buildFieldChangesRow, VALUE_CAP } from "@/lib/sync/changeLog/fieldChanges";
import type { TriggeredReviewItem } from "@/lib/parser/types";

// Fixture-derived expectations (anti-tautology): expected labels/values come from
// the INPUT item values below, never a hardcoded output blob.
const mi8 = (field: "po" | "proposal" | "invoice" | "invoiceNotes"): TriggeredReviewItem =>
  ({ id: `i-${field}`, invariant: "MI-8", field }) as TriggeredReviewItem;
const mi8b = (prior: string | null, next: string | null): TriggeredReviewItem =>
  ({ id: "i-coi", invariant: "MI-8b", prior, next }) as TriggeredReviewItem;
const mi8c = (mode: "collapse" | "ambiguous_format" | "halved" | "case_dropped"): TriggeredReviewItem =>
  ({ id: `i-${mode}-${Math.random()}`, invariant: "MI-8c", mode }) as TriggeredReviewItem;
const mi9 = (crew_name: string, prior_flags: string[], new_flags: string[]): TriggeredReviewItem =>
  ({ id: `i-${crew_name}`, invariant: "MI-9", crew_name, prior_flags, new_flags }) as TriggeredReviewItem;

describe("buildFieldChangesRow", () => {
  it("returns null when no field-family item is present", () => {
    expect(buildFieldChangesRow([{ id: "x", invariant: "MI-7" } as TriggeredReviewItem])).toBeNull();
  });

  it("MI-8 → note-only, no old value stored", () => {
    const row = buildFieldChangesRow([mi8("po")])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "PO number", from: null, to: null, note: "cleared on this sync" },
    ]);
    // no financial number anywhere in the stored payload
    expect(JSON.stringify(row.afterImage)).not.toMatch(/\d{3,}/);
  });

  it("MI-8b → From→To with trim-aware normalized COI; skips no-op", () => {
    const row = buildFieldChangesRow([mi8b("", "received")])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "COI status", from: "(none)", to: "received", note: null },
    ]);
    // prior == next after normalize → skipped → no field-family entry → all-malformed marker
    const noop = buildFieldChangesRow([mi8b("received", "received")])!;
    expect(noop.afterImage.fieldChanges[0]!.label).toBe("Unavailable");
  });

  it("MI-8c → mode-aggregated: many case_dropped → ONE count-bearing entry", () => {
    const items = Array.from({ length: 200 }, () => mi8c("case_dropped"));
    const row = buildFieldChangesRow(items)!;
    const entries = row.afterImage.fieldChanges;
    expect(entries).toHaveLength(1);
    // Spec §3.4 copy is the literal "{N} case(s) removed" (compact, no plural logic).
    expect(entries[0]).toEqual({ label: "Pull sheet", from: null, to: null, note: "200 case(s) removed" });
  });

  it("MI-8c with an invalid mode (incl. a prototype key like 'toString') is skipped + counted", () => {
    const badMode = { id: "m", invariant: "MI-8c", mode: "toString" } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([mi8b("pending", "received"), badMode])!;
    const entries = row.afterImage.fieldChanges;
    // "toString" must NOT be silently dropped (no Pull sheet entry) — it counts as omitted.
    expect(entries.map((e) => e.label)).toEqual(["COI status", "Other changes"]);
    expect(entries[1]!.note).toBe("1 other field change(s) on this sync — details unavailable");
  });

  it("MI-9 → From→To role entry; empty prior → (none); existing-crew LEAD loss", () => {
    const grant = buildFieldChangesRow([mi9("Priya Natarajan", [], ["A1", "LEAD"])])!;
    expect(grant.afterImage.fieldChanges).toEqual([
      { label: "Role — Priya Natarajan", from: "(none)", to: "A1, LEAD", note: null },
    ]);
    const loss = buildFieldChangesRow([mi9("Jordan Lee", ["LEAD", "A1"], ["A1"])])!;
    // flag-join is sorted → "A1, LEAD"
    expect(loss.afterImage.fieldChanges[0]).toEqual({
      label: "Role — Jordan Lee", from: "A1, LEAD", to: "A1", note: null,
    });
  });

  it("ordering: MI-8 (financialFields order) → MI-8b → MI-8c → MI-9", () => {
    const row = buildFieldChangesRow([
      mi9("Alex", ["A1"], ["A1", "LEAD"]),
      mi8c("collapse"),
      mi8b("pending", "received"),
      mi8("invoice"),
      mi8("po"),
    ])!;
    expect(row.afterImage.fieldChanges.map((e) => e.label)).toEqual([
      "PO number", "Invoice", "COI status", "Pull sheet", "Role — Alex",
    ]);
  });

  it("malformed item → skipped + incompleteness marker + summary encodes the omission", () => {
    const bad = { id: "b", invariant: "MI-8", field: "bogus" } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([mi8b("pending", "received"), bad])!;
    const entries = row.afterImage.fieldChanges;
    expect(entries[0]!.label).toBe("COI status");
    expect(entries[1]).toEqual({
      label: "Other changes", from: null, to: null,
      note: "1 other field change(s) on this sync — details unavailable",
    });
    // summary-only digest MUST also see the omission (spec §5, Codex plan-review F3)
    expect(row.summary).toBe("COI status and 1 more field change(s) changed on this sync");
  });

  it("type-malformed MI-8b/MI-9 (non-string prior, non-string flags) are SKIPPED, never coerced", () => {
    // MI-8b with a numeric prior → not `string | null` → skipped (not "(none)→x")
    const badCoi = { id: "c", invariant: "MI-8b", prior: 42, next: "received" } as unknown as TriggeredReviewItem;
    // MI-9 with non-string flag elements → not an array of strings → skipped (no fake role entry)
    const badRole = { id: "d", invariant: "MI-9", crew_name: "X", prior_flags: [1, 2], new_flags: ["LEAD"] } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([mi8b("pending", "received"), badCoi, badRole])!;
    const entries = row.afterImage.fieldChanges;
    expect(entries.map((e) => e.label)).toEqual(["COI status", "Other changes"]);
    expect(entries[1]!.note).toBe("2 other field change(s) on this sync — details unavailable");
  });

  it("all-malformed → structured Unavailable marker row (NOT null after_image)", () => {
    const bad = { id: "b", invariant: "MI-8", field: "bogus" } as unknown as TriggeredReviewItem;
    const row = buildFieldChangesRow([bad])!;
    expect(row.afterImage.fieldChanges).toEqual([
      { label: "Unavailable", from: null, to: null, note: "1 field change(s) on this sync — details unavailable" },
    ]);
    expect(row.summary).toBe("1 field change(s) on this sync — details unavailable");
  });

  it("summary names distinct field TYPES incl. single 'Role' for multi-crew; no crew name", () => {
    const row = buildFieldChangesRow([
      mi8b("pending", "received"),
      mi9("Alex", ["A1"], ["A1", "LEAD"]),
      mi9("Sam", ["LEAD"], []),
    ])!;
    expect(row.summary).toBe("COI status, Role changed on this sync");
    expect(row.summary).not.toMatch(/Alex|Sam/);
  });

  it("value cap: a >120-char COI value is truncated with an ellipsis", () => {
    const long = "x".repeat(200);
    const row = buildFieldChangesRow([mi8b("", long)])!;
    const to = row.afterImage.fieldChanges[0]!.to!;
    expect(to.length).toBeLessThanOrEqual(VALUE_CAP);
    expect(to.endsWith("…")).toBe(true);
  });

  it("value cap: MI-9 user-sourced crew_name (label) AND the flag-join (from/to) are capped", () => {
    const longName = "N".repeat(200);
    const longFlag = "F".repeat(200);
    const row = buildFieldChangesRow([mi9(longName, [], [longFlag])])!;
    const e = row.afterImage.fieldChanges[0]!;
    expect(e.label.length).toBeLessThanOrEqual(VALUE_CAP); // "Role — <name>" capped
    expect(e.label.endsWith("…")).toBe(true);
    expect(e.to!.length).toBeLessThanOrEqual(VALUE_CAP); // flag-join capped
    expect(e.to!.endsWith("…")).toBe(true);
  });
});
