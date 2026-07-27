/**
 * tests/components/admin/sheetIconLinkContainment.test.ts
 *
 * Containment guard for the sheet-link phrase (sheet-icon-link spec §7.10) —
 * the adoption catcher that closes BL-HEADER-LINK-AFFORDANCE-CLASS's drift
 * class. The aria phrase "Open the source sheet" may exist in EXACTLY these
 * files at EXACTLY these occurrence counts:
 *
 *   - components/admin/SheetIconLink.tsx (2 — the subject and fallback label
 *     literals; every icon-only sheet link must delegate here)
 *   - components/admin/wizard/Step3SheetCard.tsx (1 — the ratified text-link
 *     variant, spec §1.5: visible words carry the affordance)
 *   - components/admin/wizard/step3ReviewSections.tsx (1 — the agenda
 *     error-state text link, spec §1.11: visible words carry the affordance)
 *
 * SET-EQUALITY with per-file counts, not an allowlist: a re-inlined anchor in
 * a NEW file adds a row; one inside an allowlisted file bumps its count. Both
 * fail. Comments count too (deliberate — a label-quoting comment re-seeds the
 * drift the next time someone copies it; reword instead, see spec §4.3).
 *
 * Filesystem-walked, never a named file list, so a new file cannot dodge the
 * walk. Walks components/ AND app/ (excluding app/api — no UI there), because
 * an inline anchor in a page/layout would otherwise slip the set-equality
 * (audit P3).
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PHRASE = "Open the source sheet";

const EXPECTED: Record<string, number> = {
  "components/admin/SheetIconLink.tsx": 2,
  "components/admin/wizard/Step3SheetCard.tsx": 1,
  "components/admin/wizard/step3ReviewSections.tsx": 1,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith(".tsx") || full.endsWith(".ts")) out.push(full);
  }
  return out;
}

describe("sheet-link phrase containment (spec §7.10)", () => {
  it("per-file occurrence counts equal the pinned set exactly", () => {
    const root = join(__dirname, "..", "..", "..");
    const found: Record<string, number> = {};
    const files = [
      ...walk(join(root, "components")),
      ...walk(join(root, "app")).filter((f) => !f.includes("/app/api/")),
    ];
    for (const file of files) {
      const rel = file.slice(root.length + 1);
      const count = readFileSync(file, "utf8").split(PHRASE).length - 1;
      if (count > 0) found[rel] = count;
    }
    expect(found).toEqual(EXPECTED);
  });
});
