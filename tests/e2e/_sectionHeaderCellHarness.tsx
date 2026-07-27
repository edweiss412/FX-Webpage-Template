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
 * Emits:
 *   - `cells`: the 15 reachable (geometry-class × status) cells of spec §4.1a. Each
 *     carries a DISTINCT heading text, so the spec can assert a cell's rendered
 *     identity before measuring its geometry — otherwise 15 copies of one fixture
 *     could be labelled as 15 cells and the metadata would become the oracle.
 *   - `hairline`: the real <EventDetailsBreakdown> with ONLY the longest of the five
 *     closed-set group titles populated ("Wardrobe & key moments"), the worst case
 *     for the decorative rule sharing its row. T4 measures it at a 240px row.
 *
 * Env: `HASH_FOR_LOG_PEPPER` and `JWT_SIGNING_SECRET` must be set or the import
 * graph throws at load (lib/email/hashForLog.ts). The spec supplies deterministic
 * test values in the subprocess env; this file does not read them itself.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { CircleAlert } from "lucide-react";
import {
  BreakdownSection,
  EventDetailsBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { ROW_WIDTHS } from "./_sectionHeaderWidths";

export const HARNESS_DFID = "drive-harness-section-header";

/** The 240px row T4 measures: a 320px viewport's 280px pane, minus 20px tile-pad
 *  on each side. Duplicated as a literal rather than imported so a token change
 *  shows up as a failing measurement instead of silently moving the fixture. */
export const NARROWEST_ROW_PX = 240;

type Status = "clean" | "flagged" | "judgment";

/**
 * The 15 cells of spec §4.1a. Status reachability is PER ROW, verified against the
 * live providers — G3 (`report`), G4 (Diagrams) and G5 (partial provider) are
 * clean-only, so this is 3+3+1+1+1+3+3 and not 6x3.
 *
 * DEFENSIVE-CELL LABELS ARE SHORT ON PURPOSE. They must be distinct (so a cell's
 * identity can be asserted before its geometry) but also REALISTIC in length: an
 * earlier draft used names like "Defensive uncounted judgment" (28 chars), which
 * wrapped to two lines at a 280px row and failed the one-line contract. No real
 * section name approaches that — the longest are "Report an issue" (15) and
 * "Sheet warnings" (14), and "Sheet warnings (128)" is exercised at 320px by
 * G1-flagged. Long synthetic labels test the fixture, not the product.
 *
 * `dfid: ""` is the DEFENSIVE state, reachable only through
 * ShowReviewSurface's `data.driveFileId ?? ""` fallback — not the normal published
 * path, since `drive_file_id` is `not null` in the schema.
 */
export const CELLS: ReadonlyArray<{
  cell: string;
  heading: string;
  dfid: string | undefined;
  sectionId: SectionId | undefined;
  headingLevel: 3 | 4;
  count: number | null;
  status: Status;
  expectLink: boolean;
  expectPill: "none" | "amber" | "info";
}> = [
  // G1 — top-level, counted, link present.
  {
    cell: "G1-clean",
    heading: "Rooms & scope",
    dfid: HARNESS_DFID,
    sectionId: "rooms",
    headingLevel: 3,
    count: 4,
    status: "clean",
    expectLink: true,
    expectPill: "none",
  },
  {
    cell: "G1-flagged",
    heading: "Sheet warnings",
    dfid: HARNESS_DFID,
    sectionId: "warnings",
    headingLevel: 3,
    count: 128,
    status: "flagged",
    expectLink: true,
    expectPill: "amber",
  },
  {
    cell: "G1-judgment",
    heading: "Contacts",
    dfid: HARNESS_DFID,
    sectionId: "contacts",
    headingLevel: 3,
    count: 4,
    status: "judgment",
    expectLink: true,
    expectPill: "info",
  },
  // G2 — top-level, uncounted, link present.
  {
    cell: "G2-clean",
    heading: "Venue",
    dfid: HARNESS_DFID,
    sectionId: "venue",
    headingLevel: 3,
    count: null,
    status: "clean",
    expectLink: true,
    expectPill: "none",
  },
  {
    cell: "G2-flagged",
    heading: "Crew schedule",
    dfid: HARNESS_DFID,
    sectionId: "schedule",
    headingLevel: 3,
    count: null,
    status: "flagged",
    expectLink: true,
    expectPill: "amber",
  },
  {
    cell: "G2-judgment",
    heading: "Billing & docs",
    dfid: HARNESS_DFID,
    sectionId: "billing",
    headingLevel: 3,
    count: null,
    status: "judgment",
    expectLink: true,
    expectPill: "info",
  },
  // G3 — `report`, linkless, clean only (warning routing never targets it).
  {
    cell: "G3-clean",
    heading: "Report an issue",
    dfid: HARNESS_DFID,
    sectionId: "report",
    headingLevel: 3,
    count: null,
    status: "clean",
    expectLink: false,
    expectPill: "none",
  },
  // G4 — Diagrams sub-block: h4, no dfid/sectionId, clean only (providers hardcode it).
  {
    cell: "G4-clean",
    heading: "Diagrams",
    dfid: undefined,
    sectionId: undefined,
    headingLevel: 4,
    count: null,
    status: "clean",
    expectLink: false,
    expectPill: "none",
  },
  // G5 — partial/standalone provider: default h3, neither prop, clean across all callers.
  {
    cell: "G5-clean",
    heading: "Standalone partial",
    dfid: undefined,
    sectionId: undefined,
    headingLevel: 3,
    count: null,
    status: "clean",
    expectLink: false,
    expectPill: "none",
  },
  // G6a — defensive, counted.
  {
    cell: "G6a-clean",
    heading: "Rooms (A)",
    dfid: "",
    sectionId: "rooms",
    headingLevel: 3,
    count: 4,
    status: "clean",
    expectLink: false,
    expectPill: "none",
  },
  {
    cell: "G6a-flagged",
    heading: "Rooms (B)",
    dfid: "",
    sectionId: "rooms",
    headingLevel: 3,
    count: 4,
    status: "flagged",
    expectLink: false,
    expectPill: "amber",
  },
  {
    cell: "G6a-judgment",
    heading: "Rooms (C)",
    dfid: "",
    sectionId: "rooms",
    headingLevel: 3,
    count: 4,
    status: "judgment",
    expectLink: false,
    expectPill: "info",
  },
  // G6b — defensive, uncounted.
  {
    cell: "G6b-clean",
    heading: "Venue (A)",
    dfid: "",
    sectionId: "venue",
    headingLevel: 3,
    count: null,
    status: "clean",
    expectLink: false,
    expectPill: "none",
  },
  {
    cell: "G6b-flagged",
    heading: "Venue (B)",
    dfid: "",
    sectionId: "venue",
    headingLevel: 3,
    count: null,
    status: "flagged",
    expectLink: false,
    expectPill: "amber",
  },
  {
    cell: "G6b-judgment",
    heading: "Venue (C)",
    dfid: "",
    sectionId: "venue",
    headingLevel: 3,
    count: null,
    status: "judgment",
    expectLink: false,
    expectPill: "info",
  },
];

function chromeFor(c: (typeof CELLS)[number]): Step3SectionChrome {
  return {
    Icon: CircleAlert,
    label: c.heading,
    flagged: c.status === "flagged",
    ...(c.status === "judgment" ? { judgment: true } : {}),
    headingLevel: c.headingLevel,
    ...(c.dfid !== undefined ? { dfid: c.dfid } : {}),
    ...(c.sectionId !== undefined ? { sectionId: c.sectionId } : {}),
  } as Step3SectionChrome;
}

/** One cell, rendered in a container pinned to the width the spec measures at. */
function cellMarkup(c: (typeof CELLS)[number], widthPx: number): string {
  return renderToStaticMarkup(
    <div data-cell={c.cell} style={{ width: `${widthPx}px`, paddingTop: "1px" }}>
      <Step3SectionChromeContext.Provider value={chromeFor(c)}>
        <BreakdownSection testId={`cell-${c.cell}`} label={c.heading} count={c.count}>
          <div />
        </BreakdownSection>
      </Step3SectionChromeContext.Provider>
    </div>,
  );
}

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

/** Re-exported so this file stays the single import for the layout spec, while the
 *  values themselves live in a JSX-free module the real-route spec can also read
 *  (see `_sectionHeaderWidths.ts` for why that separation exists). */
export { ROW_WIDTHS };

export function buildCells(): {
  dfid: string;
  narrowestRowPx: number;
  hairline: string;
  rowWidths: typeof ROW_WIDTHS;
  cells: Record<string, Record<string, string>>;
} {
  const cells: Record<string, Record<string, string>> = {};
  for (const c of CELLS) {
    const perWidth: Record<string, string> = {};
    for (const [viewport, rowPx] of Object.entries(ROW_WIDTHS)) {
      perWidth[viewport] = cellMarkup(c, rowPx);
    }
    cells[c.cell] = perWidth;
  }
  return {
    dfid: HARNESS_DFID,
    narrowestRowPx: NARROWEST_ROW_PX,
    hairline: hairlineMarkup(),
    rowWidths: ROW_WIDTHS,
    cells,
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
