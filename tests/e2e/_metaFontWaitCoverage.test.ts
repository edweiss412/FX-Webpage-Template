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
//
// DOCUMENTED LIMITS, measured 2026-08-25 (spec
// docs/superpowers/specs/2026-08-25-e2e-proof-retired-route-subpixel-design.md
// section 7.3). Two properties bound what this guard can see. Both are recorded
// rather than fixed, because fixing either is a redesign of this surface rather
// than a repair to it, and the arc that measured them was closing two unrelated
// rows.
//
//   1. `analyzeSource` is SINGLE-FILE. It builds a `noResolve` program over one
//      source (_fontWaitCoverage.ts:573-582), so a spec that navigates through a
//      HELPER has no `page.goto` of its own, no navigation site is found, and
//      the file reports zero problems however it measures. Probe over
//      tests/e2e/helpers/** with comments stripped: FOUR exported helpers
//      navigate directly (driveToState, openShowReviewFrameAt,
//      openShowReviewModalAt, openStep3Modal), plus openShowReviewModal
//      transitively; 11 specs call one AND read geometry. `signInAs` is NOT
//      one of them and an earlier draft of this note wrongly said it was: it
//      posts through page.request.post (helpers/signInAs.ts:60) and never
//      replaces the document, so counting it inflated the census and would
//      have made any rule built on it fire almost corpus-wide.
//      `tap-target-inline-controls.layout.spec.ts` is exactly that shape; it is
//      deliberately NOT added to CALLERS below, because a row for a file whose
//      navigation this analyzer cannot see would pass unconditionally forever,
//      which is the tautological-guard failure the AGENTS.md guard-premise rule
//      names. Its barrier is enforced by a real-browser premise test in the spec
//      itself instead.
//   2. CALLERS is HAND-ENUMERATED, so a spec absent from it is unchecked
//      whatever the analyzer would say. Probe: running `analyzeSource` over all
//      105 e2e specs reports live problems in 10 files, none of them in CALLERS
//      (admin-layout-dimensions, admin-lifecycle-layout,
//      admin-nav-layout-dimensions, deep-link-walker, help-mobile,
//      help-typography, notify-toggles, sign-in-page,
//      stage-restricted-crew-schedule, telemetry-layout).
//
// Repairing (2) means enrolling ten specs, each needing a real e2e run to
// confirm the added await did not move its timing. Repairing (1) means import
// resolution plus a per-helper judgement about whether its navigation is the one
// being measured — `signInAs` navigates to an auth endpoint that is never the
// measured document, so a naive rule fires on nearly every spec in the corpus.
//
// RE-FILE TRIGGER: a flake traced to a fallback-frame measurement in any of the
// ten files above, or a new navigate-then-measure helper. Reproduce both numbers
// by running `analyzeSource` over `tests/e2e/*.spec.ts` and differencing against
// CALLERS.
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
