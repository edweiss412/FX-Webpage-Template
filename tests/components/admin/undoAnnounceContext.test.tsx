// @vitest-environment jsdom
//
// Task 3 — the undo announce context and its copy
// (spec 2026-08-03-undo-success-announcement-design §3.2, §4.1).
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { NOOP_UNDO_ANNOUNCE, undoneAnnouncement } from "@/components/admin/undoAnnounceContext";

describe("undoneAnnouncement", () => {
  it("prefixes a real summary and supplies the terminal period", () => {
    // The fixture is a REAL generator shape (writeAutoApplyChanges.ts:112 emits
    // `Crew member <name> removed`, unterminated). An earlier spec draft pinned
    // "Alice Chen removed from crew.", which no generator produces — a fixture
    // that misrepresents production proves nothing about production.
    expect(undoneAnnouncement("Crew member Alice Chen removed")).toBe(
      'Undone. "Crew member Alice Chen removed" no longer applies.',
    );
  });

  it("falls back to the bare sentence with no dangling colon", () => {
    // Catches: `Change undone: ` with nothing after it, which is what a naive
    // template produces when the label is missing.
    expect(undoneAnnouncement(undefined)).toBe("Change undone.");
    expect(undoneAnnouncement("")).toBe("Change undone.");
    expect(undoneAnnouncement("   ")).toBe("Change undone.");
    expect(undoneAnnouncement("\n\t")).toBe("Change undone.");
  });

  it("trims a padded label rather than announcing the padding", () => {
    expect(undoneAnnouncement("  Crew member Bo Ray added  ")).toBe(
      'Undone. "Crew member Bo Ray added" no longer applies.',
    );
  });

  it("contains no em dash", () => {
    // DESIGN.md:381 bans em dashes in user-visible copy; an announcement is copy.
    for (const s of [undoneAnnouncement(), undoneAnnouncement("Crew member X removed")]) {
      expect(s).not.toContain("—");
      expect(s).not.toContain("--");
    }
  });
});

describe("NOOP_UNDO_ANNOUNCE", () => {
  it("swallows a call without throwing", () => {
    // This default is what keeps a button mounted outside any provider from
    // crashing. It is also why the structural guard exists: the failure mode it
    // creates is silence, not a stack trace.
    expect(() => NOOP_UNDO_ANNOUNCE.announce("anything")).not.toThrow();
    expect(NOOP_UNDO_ANNOUNCE.announce("anything")).toBeUndefined();
  });
});
