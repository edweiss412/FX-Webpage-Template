/**
 * tests/helpers/step3HeaderBaseline.ts
 * (modal-header-reconciliation spec §11.2 — Task 1)
 *
 * Shared between `scripts/captureStep3HeaderBaseline.ts` (the committed
 * generator) and `tests/components/admin/review/reviewModalShell.test.tsx`
 * (T-STEP3-INVARIANT). Normalization MUST be identical on both sides, so it
 * lives in exactly one module rather than being transcribed twice.
 *
 * What is normalized, and why: the Step 3 header renders `useId()` output
 * (`h2Id`, wired to the heading's `id` and the shell's `aria-labelledby`).
 * React's id counter is a function of the render tree, so adding a conditional
 * branch to `ReviewModalShell` can legitimately perturb those values while the
 * header is structurally and visually IDENTICAL — which is the property the
 * baseline exists to pin. The server (`«r0»`) and client (`:r0:`) delimiters
 * differ as well. Every generated id — and every attribute value that
 * references one — collapses to a stable placeholder, so the committed fixture
 * is id-free.
 */

import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "@/tests/components/admin/wizard/_step3ReviewFixture";

/** Fixture constants — mirrored from Step3ReviewModal.test.tsx so the captured
 *  header is the same one the wizard suite exercises. FIXED by design: a
 *  randomized fixture would make the baseline non-reproducible. */
export const STEP3_BASELINE_DFID = "drive-abc-123";
const STEP3_BASELINE_WSID = "00000000-1111-4222-8333-444444444444";

/** The ONE fixture both the generator and T-STEP3-INVARIANT render. Sharing it
 *  is what makes the comparison meaningful — two independently-assembled
 *  fixtures would differ for reasons that have nothing to do with the shell. */
export function buildStep3BaselineData(): StagedSectionData {
  const pr = buildParseResult();
  return buildStagedSectionData({
    pr,
    row: stagedRow(pr),
    dfid: STEP3_BASELINE_DFID,
    wizardSessionId: STEP3_BASELINE_WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

/** Path of the committed baseline, relative to the repo root. */
export const STEP3_BASELINE_FIXTURE_PATH =
  "tests/components/admin/review/__fixtures__/step3-header-baseline.html";

/** React `useId()` output. The delimiters are a React-internal detail that has
 *  changed across versions AND differs by renderer, so all known shapes are
 *  matched: `_R_<n>_` / `_r_<n>_` (react-dom 19.2, the shape this repo emits),
 *  `«r0»` and `:r0:` (earlier 19.x / 18.x). Matching all three keeps the fixture
 *  id-free through a React upgrade instead of silently baking ids back in. */
const REACT_ID = /(?:_[Rr]_[0-9a-z]+_|«r[0-9a-z]+»|:r[0-9a-z]+:)/g;

/**
 * Replace every React-generated id token — wherever it appears, including
 * inside `id` / `for` / `aria-labelledby` / `aria-describedby` values — with a
 * stable placeholder. Deliberately a value-level substitution rather than an
 * attribute allowlist: a new id-carrying attribute must NOT silently reintroduce
 * unstable bytes into the fixture.
 */
export function normalizeIds(html: string): string {
  return html.replace(REACT_ID, "«rid»");
}
