/**
 * tests/components/admin/showpage/_metaPopoverPlacementContract.test.ts
 *
 * Structural guard: every anchored, internally-scrolling overlay under
 * `components/**` carries an explicit decision about how it survives a
 * clipping ancestor (see `popoverOverlayRegistry.ts` for the why).
 *
 * Filesystem-walked, so a NEW overlay fails by default rather than inheriting
 * a silent pass. This is the invariant-9/10 registry idiom, not a new
 * mechanism.
 *
 * Detector breadth (plan Task 1, after plan-review R3 Q3): the first draft
 * keyed on `top-full` + `overflow-y-auto` + `max-h-[` and was simultaneously
 * too narrow and too loose. Live counter-examples in this repo defeat it:
 * `max-h-96` (AttentionMenu), `max-h-panel-max-mobile` (BellPanel),
 * `style={{maxHeight}}` (ReportModal), `top-[calc(100%+8px)]` (AttentionMenu).
 * The cap dimension is therefore NOT a predicate at all — any anchored
 * scroller is reviewed regardless of how (or whether) it is capped.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { walkSourceFiles } from "@/lib/messages/__internal__/walkSourceFiles";
import { POPOVER_OVERLAY_REGISTRY, type OverlayRow } from "./popoverOverlayRegistry";

/** Absolute/fixed positioning is what makes an overlay escape normal flow. */
const POSITIONED = /\b(?:absolute|fixed)\b/;
/** Anchored to an edge of its trigger — `top-full`/`bottom-full` or arbitrary. */
const EDGE_ANCHOR = /\b(?:top-full|bottom-full)\b|\b(?:top|bottom)-\[/;
/** Carries its own scroll range, which is what lets a clip edge strand content. */
const SCROLLER = /\boverflow-(?:y-auto|auto|y-scroll)\b/;

/**
 * Deliberately broad: co-occurrence anywhere in the file's source.
 *
 * A false positive costs one registry row with a reason. A false negative is
 * the failure that shipped the ShareHub defect, so breadth is the right bias.
 */
export function looksLikeAnchoredScroller(source: string): boolean {
  return POSITIONED.test(source) && EDGE_ANCHOR.test(source) && SCROLLER.test(source);
}

const IMPORT_FOR_DISPOSITION: Partial<Record<OverlayRow["disposition"], RegExp>> = {
  "placement-module": /from\s+"@\/lib\/popover\/position"/,
  // Requires the SHARED-MODULE import, not merely the identifier. The old
  // /useFitWithinClip/ also matched a file that declared its own local copy, so
  // a consumer could silently fork the hook and stay "registered as fit-within-
  // clip" (spec §4.1; the escaping mutant is quoted in this task's commit).
  "fit-within-clip": /from\s+"@\/components\/admin\/useFitWithinClip"/,
};

function detectedFiles(): string[] {
  return walkSourceFiles(["components"], { extensions: [".tsx"] }).filter((file) =>
    looksLikeAnchoredScroller(readFileSync(file, "utf8")),
  );
}

describe("anchored-scroller classifier", () => {
  // Guards the guard: an over-narrow regex that matched nothing would make the
  // whole meta-test vacuously green.
  it.each([
    [
      "top-full + overflow-y-auto + arbitrary cap",
      'className="absolute top-full overflow-y-auto max-h-[30rem]"',
    ],
    ["Tailwind scale cap", 'className="absolute top-[calc(100%+8px)] max-h-96 overflow-y-auto"'],
    ["semantic token cap", 'className="absolute top-[8px] max-h-panel-max-mobile overflow-y-auto"'],
    [
      "inline style cap",
      'className="absolute bottom-full overflow-auto" style={{ maxHeight: "40vh" }}',
    ],
    ["no cap at all", 'className="absolute bottom-[4px] overflow-y-scroll"'],
    ["fixed rather than absolute", 'className="fixed top-full overflow-y-auto"'],
  ])("matches %s", (_label, source) => {
    expect(looksLikeAnchoredScroller(source)).toBe(true);
  });

  it.each([
    ["no scroller", 'className="absolute top-full max-h-96"'],
    ["no edge anchor", 'className="absolute inset-0 overflow-y-auto"'],
    ["not positioned", 'className="top-full overflow-y-auto"'],
  ])("does not match %s", (_label, source) => {
    expect(looksLikeAnchoredScroller(source)).toBe(false);
  });

  it("fires on the live ShareHub popover", () => {
    const source = readFileSync("components/admin/showpage/ShareHub.tsx", "utf8");
    expect(looksLikeAnchoredScroller(source)).toBe(true);
  });
});

describe("popover overlay registry", () => {
  it("has a row for every detected anchored scroller", () => {
    const registered = new Set(POPOVER_OVERLAY_REGISTRY.map((row) => row.file));
    const unregistered = detectedFiles().filter((file) => !registered.has(file));
    expect(
      unregistered,
      "New anchored, internally-scrolling overlay under components/. Decide how it survives a clipping ancestor " +
        "(the review-modal panel is overflow-clip and is NOT a scroll container), then add a row to " +
        "tests/components/admin/showpage/popoverOverlayRegistry.ts.",
    ).toEqual([]);
  });

  it("has no unused rows", () => {
    const detected = new Set(detectedFiles());
    const stale = POPOVER_OVERLAY_REGISTRY.filter((row) => !detected.has(row.file)).map(
      (row) => row.file,
    );
    expect(stale, "Registry row no longer matches any file; delete the stale exemption.").toEqual(
      [],
    );
  });

  it("every row states a reason", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      expect(row.reason.trim().length, `${row.file} needs a reason`).toBeGreaterThan(0);
    }
  });

  it("rows claiming a mechanism actually import it", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      const required = IMPORT_FOR_DISPOSITION[row.disposition];
      if (!required) continue;
      const source = readFileSync(row.file, "utf8");
      expect(
        required.test(source),
        `${row.file} is registered as "${row.disposition}" but does not import it`,
      ).toBe(true);
    }
  });

  it("every unverified-gap row carries a backlog reference", () => {
    for (const row of POPOVER_OVERLAY_REGISTRY) {
      if (row.disposition !== "unverified-gap") continue;
      expect(row.reason, `${row.file} must name its backlog entry`).toMatch(/BL-[A-Z0-9-]+/);
    }
  });
});
