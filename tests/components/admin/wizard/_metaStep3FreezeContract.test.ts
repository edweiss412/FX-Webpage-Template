/**
 * tests/components/admin/wizard/_metaStep3FreezeContract.test.ts
 * (spec §4.4 R8 — structural full-freeze guard)
 *
 * Same-vector defense (Codex whole-diff review R1 + R2 both landed on an
 * un-frozen Re-scan mutator: R1 the non-resolution modal + demoted card, R2 the
 * finalize-demoted MODAL branch). Rather than wait for a round to find a 6th
 * site, this fails-by-default structural guard pins the invariant at CI time:
 * EVERY `<RescanSheetButton …>` rendered inside the consolidated Step-3 surfaces
 * MUST carry `disabled={isPublishRunActive}` (its POST is a mutation, frozen
 * while a publish/resume finalize run is active). A new render site added
 * without the freeze prop fails this test immediately — no behavioral coverage
 * gap can hide it.
 *
 * Scope: the two consolidated surfaces that render row/modal Re-scan mutators.
 * `import`/comment lines are excluded (only JSX render sites count).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..");
const SURFACES = [
  "components/admin/wizard/Step3ReviewModal.tsx",
  "components/admin/wizard/Step3SheetCard.tsx",
  "components/admin/wizard/step3ReviewSections.tsx",
];

/** Extract every `<RescanSheetButton … />` JSX element body (open tag → `/>`). */
function rescanElements(src: string): string[] {
  const out: string[] = [];
  const open = "<RescanSheetButton";
  let i = src.indexOf(open);
  while (i !== -1) {
    const end = src.indexOf("/>", i);
    if (end === -1) break;
    out.push(src.slice(i, end + 2));
    i = src.indexOf(open, end + 2);
  }
  return out;
}

describe("Step-3 full-freeze structural contract (spec §4.4 R8)", () => {
  for (const rel of SURFACES) {
    test(`every RescanSheetButton in ${rel} freezes on isPublishRunActive`, () => {
      const src = readFileSync(join(ROOT, rel), "utf8");
      const els = rescanElements(src);
      // Sanity: the surface actually renders at least one Re-scan mutator, else
      // a rename silently voids this guard.
      expect(els.length).toBeGreaterThan(0);
      for (const el of els) {
        expect(el, `un-frozen Re-scan mutator in ${rel}:\n${el}`).toContain(
          "disabled={isPublishRunActive}",
        );
      }
    });
  }
});
