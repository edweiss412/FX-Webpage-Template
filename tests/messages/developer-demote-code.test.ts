import { test, expect } from "vitest";

import { getDougFacing } from "@/lib/messages/lookup";

// Phase 4 Task 8 (spec §8): the new §12.4 code SELF_DEVELOPER_DEMOTE_FORBIDDEN
// must resolve to cataloged Doug-facing copy through the invariant-5 lookup
// chokepoint. A non-null result proves the full 3-way lockstep landed (master
// spec §12.4 row + gen:spec-codes + catalog.ts), because getDougFacing reads
// MESSAGE_CATALOG and returns the all-null fallback for any uncataloged code.
test("SELF_DEVELOPER_DEMOTE_FORBIDDEN resolves to cataloged Doug-facing copy", () => {
  expect(getDougFacing("SELF_DEVELOPER_DEMOTE_FORBIDDEN")).toBeTruthy();
});
