/**
 * tests/lib/admin/activeWarningEntries.test.ts
 * (wizard-warning-ignore-controls spec §2.4 choke point 2 — Task 11)
 *
 * Every modal-side consumer of a row's warnings starts from `warningsBySection`,
 * which mints entries with FULL-array indices. This wrapper is the only way staged
 * chrome obtains those entries, so the section dots, both rails, the attention pill
 * and the menu all move together or not at all.
 *
 * The index is the part that must survive. The attention menu mints entry ids as
 * `warning:${index}` and resolves them against `[data-attention-anchor]` in the DOM;
 * a wrapper that renumbered survivors would leave every jump pointing at the wrong
 * row, with nothing visibly broken.
 */
import { describe, expect, it } from "vitest";
import type { ParseWarning } from "@/lib/parser/types";
import { activeWarningEntries } from "@/lib/admin/activeWarningEntries";
import { warningsBySection } from "@/lib/admin/step3SectionStatus";
import type { SectionId } from "@/lib/admin/step3SectionStatus";

const warn = (code: string, snippet: string): ParseWarning => ({
  severity: "warn",
  code,
  message: code,
  rawSnippet: snippet,
});
const info = (code: string): ParseWarning => ({ severity: "info", code, message: code });

const SECTIONS = new Set<SectionId>(["warnings"]);

describe("activeWarningEntries", () => {
  const WARNINGS = [
    warn("FIELD_UNREADABLE", "one"),
    warn("FIELD_UNREADABLE", "two"),
    warn("FIELD_UNREADABLE", "three"),
  ];

  const flatten = (map: ReturnType<typeof activeWarningEntries>) =>
    [...map].flatMap(([, list]) => list.map((e) => e.index)).sort((a, b) => a - b);

  it("preserves each survivor's ORIGINAL index", () => {
    const out = activeWarningEntries(WARNINGS, SECTIONS, new Set([0]));
    // 1 and 2, NOT 0 and 1: a renumbered survivor is the jump-anchor bug.
    expect(flatten(out)).toEqual([1, 2]);
  });

  it("is identity when the ignored set is null", () => {
    const filtered = activeWarningEntries(WARNINGS, SECTIONS, null);
    const raw = warningsBySection(WARNINGS, SECTIONS);
    expect(flatten(filtered)).toEqual(
      [...raw].flatMap(([, list]) => list.map((e) => e.index)).sort((a, b) => a - b),
    );
  });

  it("is identity when the ignored set is empty", () => {
    expect(flatten(activeWarningEntries(WARNINGS, SECTIONS, new Set()))).toEqual([0, 1, 2]);
  });

  it("drops every ignored index, including all of them", () => {
    expect(flatten(activeWarningEntries(WARNINGS, SECTIONS, new Set([0, 1, 2])))).toEqual([]);
  });

  it("keeps the warn-only invariant: an info warning never appears", () => {
    // `deriveWarningAttention` THROWS on an info-severity entry
    // (lib/admin/warningAttention.ts:34-35). That throw is unreachable only for as
    // long as this stays true, so it is asserted rather than assumed.
    const mixed = [info("SCHEDULE_NOTE"), warn("FIELD_UNREADABLE", "one")];
    const out = activeWarningEntries(mixed, SECTIONS, new Set());
    const severities = [...out].flatMap(([, list]) => list.map((e) => e.warning.severity));
    expect(severities).toEqual(["warn"]);
    // And the surviving warn keeps its FULL-array index, which is 1 here — the info
    // row occupying slot 0 must not shift it.
    expect(flatten(out)).toEqual([1]);
  });

  it("an ignored index that names an info row changes nothing", () => {
    const mixed = [info("SCHEDULE_NOTE"), warn("FIELD_UNREADABLE", "one")];
    expect(flatten(activeWarningEntries(mixed, SECTIONS, new Set([0])))).toEqual([1]);
  });

  it("an out-of-range ignored index drops nothing", () => {
    expect(flatten(activeWarningEntries(WARNINGS, SECTIONS, new Set([99])))).toEqual([0, 1, 2]);
  });
});
