import { describe, it, expect } from "vitest";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";

// Task 4 (spec §10): USE_RAW_DECISION_STALE is the single doug-facing code written
// to the changes feed whenever a "use raw" decision invalidates (its pinned cell
// changed). It routes through the catalog like every other code (invariant 5 — no
// raw code in UI). Full 3-way lockstep is enforced by the AC-X.1 parity gate
// (tests/cross-cutting/codes.test.ts); this pins the copy + lookup resolution.
describe("USE_RAW_DECISION_STALE catalog code", () => {
  it("is a known message code resolvable through the catalog", () => {
    expect(isMessageCode("USE_RAW_DECISION_STALE")).toBe(true);
    const entry = messageFor("USE_RAW_DECISION_STALE");
    expect(entry.dougFacing).toBe(
      "You'd chosen to use the sheet's raw text for _<target>_; that cell changed, so we're reading it fresh again.",
    );
    expect(entry.crewFacing).toBeNull();
    expect(entry.audience).toBe("doug");
  });

  it("is renderable on /help/errors (title + longExplanation + helpHref set)", () => {
    const e = MESSAGE_CATALOG.USE_RAW_DECISION_STALE;
    expect(e.title).not.toBeNull();
    expect(e.longExplanation).not.toBeNull();
    expect(e.helpHref).toBe("/help/errors#USE_RAW_DECISION_STALE");
    expect(e.helpfulContext).not.toBeNull();
  });
});
