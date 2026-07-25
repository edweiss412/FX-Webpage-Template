/**
 * Static markup harness for the section-header layout probe
 * (tests/e2e/section-header-layout.layout.spec.ts).
 *
 * WHY A SUBPROCESS, not an import: Playwright's test transform rewrites JSX in
 * every `.tsx` it loads — this file AND the imported component tree — into its
 * component-testing payload, which `react-dom/server` cannot render. So the spec
 * shells out to `node_modules/.bin/tsx` to run THIS file directly and reads the
 * rendered markup back as JSON. Same contract as
 * tests/e2e/_step3ReviewModalHarness.tsx, whose header documents the trap.
 *
 * Emits, so far:
 *   - `hairline`: the real <EventDetailsBreakdown> with ONLY the longest of the
 *     five closed-set group titles populated ("Wardrobe & key moments"), which is
 *     the worst case for the decorative rule that shares its row. T4 measures it
 *     at a 240px row — the narrowest real width, being a 320px viewport's 280px
 *     pane minus `--spacing-tile-pad` on each side.
 *
 * The 15 matrix cells land here in T2.
 *
 * Env: `HASH_FOR_LOG_PEPPER` and `JWT_SIGNING_SECRET` must be set or the import
 * graph throws at load (lib/email/hashForLog.ts). The spec supplies deterministic
 * test values in the subprocess env; this file does not read them itself.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { EventDetailsBreakdown } from "@/components/admin/wizard/step3ReviewSections";

export const HARNESS_DFID = "drive-harness-section-header";

/** The 240px row T4 measures: a 320px viewport's 280px pane, minus 20px tile-pad
 *  on each side. Duplicated as a literal rather than imported so a token change
 *  shows up as a failing measurement instead of silently moving the fixture. */
export const NARROWEST_ROW_PX = 240;

/**
 * Only `notes` is populated, so exactly one group renders — "Wardrobe & key
 * moments", the longest title. Every other group filters out for having no
 * non-empty field, which is what isolates the worst-case rule width.
 */
function hairlineMarkup(): string {
  return renderToStaticMarkup(
    <div style={{ width: `${NARROWEST_ROW_PX}px` }} data-testid="hairline-row-container">
      <EventDetailsBreakdown
        dfid={HARNESS_DFID}
        eventDetails={{ notes: "Doors at 8; keynote walks at 8:20." }}
      />
    </div>,
  );
}

export function buildCells(): { dfid: string; narrowestRowPx: number; hairline: string } {
  return {
    dfid: HARNESS_DFID,
    narrowestRowPx: NARROWEST_ROW_PX,
    hairline: hairlineMarkup(),
  };
}

/* Direct-execution entry. The `typeof module` guard matches the sibling harness:
 * under an esbuild browser bundle `require` compiles to a shim but a bare `module`
 * would be a ReferenceError. */
if (typeof module !== "undefined" && require.main === module) {
  const out = process.argv[2];
  if (!out) throw new Error("usage: tsx _sectionHeaderCellHarness.tsx <out.json>");
  writeFileSync(out, JSON.stringify(buildCells()), "utf8");
}
