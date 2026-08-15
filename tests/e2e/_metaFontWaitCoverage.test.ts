// Structural guard — every navigation whose document is then measured settles
// `document.fonts.ready` first.
//
// WHY THE WAITS EXIST AT ALL. `font-display: block` makes measuring the fallback
// frame vanishingly unlikely; awaiting `document.fonts.ready` makes it
// impossible, and impossible is what the CSS Font Loading spec actually offers:
// sizes and positions are not final until that promise settles. Hand an
// unsynchronized caller a real face and it can measure a fallback frame and then
// have those metrics re-derived into a pinned figure -- WORSE than the ambient
// measurement it replaced, because the ambient one was at least stable.
//
// WHY A COUNT IS NOT ENOUGH, measured on the corpus rather than argued.
// `attention-pill-focus.spec.ts` navigates at line 104 and first reads geometry
// at 553. Hoisting the await to immediately after `goto` keeps the count at its
// expected value while settling the promise against a document with no measured
// content in it -- the exact mis-anchoring this row rejects.
//
// THE RULE AND ITS DELIBERATE WEAKENING both live in `analyzeSource`, next to
// the code that implements them. `_metaFontWaitCoverageMutants.test.ts` is what
// keeps this row falsifiable: this file's only input is a corpus that passes, so
// on its own it cannot tell a working guard from one that returns nothing.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

import { analyzeSource } from "./_fontWaitCoverage";

const E2E_DIR = resolve(__dirname);

/** Callers that navigate and measure; the three already-synchronized ones excepted. */
const CALLERS = [
  "agendaScheduleLayout",
  "appHealthIndicator.layout",
  "attention-pill-focus",
  "autoAppliedCardGrid.layout",
  "bulk-ignore-eyebrow.layout",
  "collapse-panel-morph",
  "compact-alert-card-layout",
  "dataQualityBadge.layout",
  "developer-toggle-layout",
  "hoverhelp-geometry",
  "pendingDiscardReal.layout",
  "pendingDiscardReflow.layout",
  "popover-clip-fit",
  "published-review-modal.layout",
  "pusher-alignment.layout",
  "section-header-layout.layout",
  "section-header-visual",
  "statusStripToggleLayout",
  "step3-review-modal.agenda",
  "step3-review-modal.interactions",
  "step3-review-modal.layout",
  "step3-review-page.layout",
  "step3-schedule-bookend-layout",
  "tap-target-floor.layout",
  "toggle-edge-layout",
  "wifi-password-row.layout",
  "wizard-blocker-modal.layout",
] as const;

describe("font-wait coverage", () => {
  test.each(CALLERS)("%s awaits fonts between navigation and measurement", (name) => {
    const file = join(E2E_DIR, `${name}.spec.ts`);
    const problems = analyzeSource(file, readFileSync(file, "utf8"));
    expect(problems, `${name}.spec.ts:\n  ${problems.join("\n  ")}`).toEqual([]);
  });
});
