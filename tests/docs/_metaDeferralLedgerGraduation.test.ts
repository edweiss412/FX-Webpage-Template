// Structural guard over the deferral ledgers.
//
// Shipped as the class defense for a vector that recurred across two adversarial
// rounds of the 2026-07-24 dev-row copy close-out: a ledger/docs task with no
// genuine red state, only post-hoc checks that were already green. Rather than
// patch the prose a third time, the graduation itself became a test.
//
// Spec: docs/superpowers/specs/2026-07-24-settings-devrow-copy-close.md §9 T8.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** A deferral entry heading: `### SOME-ID — human text`. */
const DEFERRAL_ID = /^### ([A-Z0-9][A-Z0-9-]+)/gm;

/**
 * Deferrals graduated to the archive since this guard shipped. NOT a mirror of
 * the ~130 historical archive entries: those predate the guard and are covered
 * only by the no-overlap invariant below, not by per-id presence.
 */
const GRADUATED = ["SETTINGS-DEVROW-GALLERY-RESIDUE-1"] as const;

/** Plan directories whose plan.md declares an invariant-8 (impeccable) gate. */
const INVARIANT8_PLANS = ["docs/superpowers/plans/2026-07-24-settings-devrow-copy-close"] as const;

// process.cwd() is the project root under vitest — the convention
// tests/cross-cutting/vitest-projects-partition.test.ts already uses.
// import.meta.url is NOT a file: URL under vitest's transform, so
// readFileSync(new URL(..., import.meta.url)) throws "The URL must be of scheme
// file" and every assertion fails for the wrong reason.
const read = (rel: string): string => readFileSync(join(process.cwd(), rel), "utf8");

const idsIn = (rel: string): Set<string> =>
  new Set(Array.from(read(rel).matchAll(DEFERRAL_ID), (m) => m[1]!));

describe("deferral ledger graduation", () => {
  it("no id is both active and archived", () => {
    // The recurring shape: a graduation that copies the entry into the archive
    // without deleting it from the active queue, or a re-opened entry left
    // behind in the archive. Either way the ledgers disagree about what is open.
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    const both = [...active].filter((id) => archived.has(id));
    expect(both).toEqual([]);
  });

  it("every graduated id is archive-only", () => {
    const active = idsIn("DEFERRED.md");
    const archived = idsIn("DEFERRED-archive.md");
    for (const id of GRADUATED) {
      expect(archived.has(id), `${id} missing from DEFERRED-archive.md`).toBe(true);
      expect(active.has(id), `${id} still in DEFERRED.md`).toBe(false);
    }
  });

  it("every invariant-8 plan has a closeout whose section 12 records both gate halves", () => {
    for (const dir of INVARIANT8_PLANS) {
      const closeout = read(`${dir}/closeout.md`);
      // Slice the BODY of section 12, heading to next heading. Searching the
      // whole document would pass on an EMPTY section 12 whenever the words
      // appear in a title, a checklist, or boilerplate elsewhere.
      const start = /^##\s*12\b.*$/m.exec(closeout);
      expect(start, `${dir}/closeout.md has no "## 12" section`).not.toBeNull();
      const after = closeout.slice(start!.index + start![0].length);
      const next = /^##\s/m.exec(after);
      const body = (next ? after.slice(0, next.index) : after).toLowerCase();
      expect(body).toContain("critique");
      expect(body).toContain("audit");
    }
  });
});
