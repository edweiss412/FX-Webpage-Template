// BL-ANNOUNCE-REGION-UNMOUNT-CLASS — a live region may not be born populated.
//
// THE DEFECT, once, so every site does not have to restate it. Screen readers
// announce mutations WITHIN a live region that is already in the DOM. A region
// inserted together with its text is just new DOM, and is not announced. So
// `cond ? <p role="status">{msg}</p> : null` reads as an announcement in review
// and makes none at runtime — which is why this class survived a11y passes.
//
// WHY A GUARD RATHER THAN 17 FIXED SITES. The entry was filed FROM a sweep, and
// a sweep's output is a list that rots. This walks the tree instead, so a NEW
// conditionally-inserted region fails here rather than waiting for the next
// person to run the same grep. `role="alert"` is deliberately not covered:
// alerts ARE announced on insertion, so the conditional form is correct for
// them, and forbidding it would be a change for symmetry rather than for a
// defect.
//
// TWO LAWFUL SHAPES, and the exemption list records which each site uses:
//   1. Mount the region unconditionally and toggle its TEXT. Right when the
//      region's owner outlives the success it announces.
//   2. Announce through `UndoAnnounceContext`, whose provider region lives in
//      the layout. Required when the owner does NOT outlive it — a component
//      that early-returns a different tree per phase, or a block that unmounts
//      on revalidate. A region stable relative to the wrong branch is not
//      stable.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const ROOTS = ["components", "app"];

/**
 * Sites whose region is legitimately conditional because the ANNOUNCEMENT does
 * not ride it — they call `announce()` on the branch-stable channel instead.
 *
 * A row here is a claim that the file imports `UndoAnnounceContext` and calls
 * `announce`, which the test below verifies rather than trusts.
 */
const CHANNEL_ANNOUNCERS: readonly string[] = [
  "components/admin/RescanSheetButton.tsx",
  "components/admin/RoleRecognizeControl.tsx",
  "components/admin/RecentAutoAppliedStrip.tsx",
];

/**
 * Sites whose gate is NOT transient state, so the conditional form is correct.
 *
 * The defect is a region that appears at the same moment as the text it should
 * announce. A gate on something else — whether the viewer is a developer,
 * whether the show is published, which arm of an either/or content branch
 * renders — does not create that race: the element is absent for a reason that
 * has nothing to do with the announcement, and when it IS present its text
 * arrives with it because the whole surface is arriving.
 *
 * Each row names the gate, so a later reader can check the claim rather than
 * trust the exemption.
 */
const NON_TRANSIENT_GATES: ReadonlyMap<string, string> = new Map([
  [
    "components/admin/showpage/ShareHub.tsx:782",
    "gated on viewerIsDeveloper — a non-developer must not receive the element at all; the transient capture state toggles TEXT inside it",
  ],
  [
    "components/admin/showpage/ShareHub.tsx:915",
    "one arm of a published/unpublished content branch, not a post-action announcement",
  ],
  [
    "app/show/[slug]/[shareToken]/_PickerInterstitial.tsx:154",
    "server-rendered banner: present on first paint with its text, never inserted later",
  ],
  [
    "app/show/[slug]/unpublish/ConfirmUnpublishForm.tsx:69",
    "whole-surface swap — the form is replaced by the busy notice, so nothing is 'inserted into' a live page",
  ],
]);

/** Files still carrying the defect, each with the shape its repair will use. */
const PENDING: ReadonlyMap<string, string> = new Map([
  ["app/admin/show/[slug]/RotateShareTokenButton.tsx", "2 sites — toggle text"],
  ["components/shared/ReportModal.tsx", "4 sites — toggle text"],
  ["components/admin/ReSyncButton.tsx", "1 site — toggle text"],
  ["components/admin/wizard/Step2Verify.tsx", "2 sites — toggle text"],
  ["components/admin/MaintenanceResetButtons.tsx", "2 sites — toggle text"],
  ["components/admin/ReapStaleSessionsButton.tsx", "1 site — rich body, channel"],
  ["components/admin/BlockedRowResolver.tsx", "1 site — toggle text"],
  ["components/admin/wizard/archivedTabOffer.tsx", "2 sites — toggle text"],
  // Found by THIS walk, not by the entry's filed list — which is the argument
  // for walking rather than listing.
  ["components/admin/wizard/Step3ReviewModal.tsx", "2 sites — toggle text"],
  ["components/admin/wizard/step3ReviewSections.tsx", "2 sites — toggle text"],
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else if (entry.endsWith(".tsx")) out.push(abs);
  }
  return out;
}

/** `role="status"` occurrences whose element is opened by a conditional gate. */
function conditionalStatusRegions(text: string): number[] {
  const lines = text.split("\n");
  const hits: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]?.includes('role="status"')) continue;
    // The element's opening tag is at or just above this line; a gate shows up
    // as a `?` or `&&` immediately preceding it.
    const before = lines
      .slice(Math.max(0, i - 6), i)
      .join("\n")
      .trimEnd();
    if (/(\?\s*\(|&&\s*\(|&&\s*<)$/m.test(before)) hits.push(i + 1);
  }
  return hits;
}

describe("live regions are mounted before their text (BL-ANNOUNCE-REGION-UNMOUNT-CLASS)", () => {
  const files = ROOTS.flatMap((r) => walk(join(REPO_ROOT, r))).map((f) => relative(REPO_ROOT, f));

  it("the walk found a real tree (premise)", () => {
    // A walk that silently found nothing would make every row below vacuous —
    // the exact failure mode this guard exists to prevent, applied to itself.
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.includes("RescanSheetButton"))).toBe(true);
  });

  it("every CHANNEL_ANNOUNCERS row actually announces through the channel", () => {
    // Without this the exemption list is a way to silence the guard. A row must
    // earn itself: import the context AND call announce.
    const bad = CHANNEL_ANNOUNCERS.filter((f) => {
      const src = readFileSync(join(REPO_ROOT, f), "utf8");
      return !src.includes("UndoAnnounceContext") || !/\bannounce\(/.test(src);
    });
    expect(bad, "exempt as a channel announcer but does not announce").toEqual([]);
  });

  it("no UNREGISTERED file inserts a live region together with its text", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (CHANNEL_ANNOUNCERS.includes(f) || PENDING.has(f)) continue;
      const hits = conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8"));
      for (const line of hits) {
        const key = `${f}:${line}`;
        if (!NON_TRANSIENT_GATES.has(key)) offenders.push(key);
      }
    }
    expect(
      offenders,
      "a live region inserted together with its text is never announced — mount it " +
        "unconditionally and toggle the text, or announce through UndoAnnounceContext",
    ).toEqual([]);
  });

  it("the PENDING list is exact — no row that is already clean", () => {
    // Keeps the debt list honest in the shrinking direction: a repaired file
    // must leave this list, or the list stops describing the work.
    const stale = [...PENDING.keys()].filter(
      (f) => conditionalStatusRegions(readFileSync(join(REPO_ROOT, f), "utf8")).length === 0,
    );
    expect(stale, "listed as pending but already repaired — remove the row").toEqual([]);
  });
});
