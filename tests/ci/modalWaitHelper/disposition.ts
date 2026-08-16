/**
 * tests/ci/modalWaitHelper/disposition.ts — the AUTHORED half of AC-2b.
 *
 * `scan.ts` produces candidates from the five §2.1 origins with no hand-written
 * list on either side. This file says what a human decided about each of them:
 * every candidate is a MEMBER (carrying its §4.2 shape) or an EXCLUSION
 * (carrying a reason), and `members ∪ exclusions = candidates` exactly.
 *
 * The rules are disjoint and each must match at least one candidate, so the
 * disposition cannot drift in either direction: a new candidate nobody has
 * decided about matches no rule and FAILS, and a rule whose class has
 * disappeared matches nothing and FAILS.
 *
 * **Exclusion rules carry a count; member rules do not.** An exclusion is a
 * statement about a set someone read once ("every reload in this file is on a
 * non-`?show=` route"), and without a count a NEW line quietly inherits a
 * judgement nobody made about it — the leak this whole arc exists to close. A
 * member rule instead recognizes the adopted shape itself (the line calls a
 * modal-wait helper export), which is self-evidencing and correct at any count.
 *
 * Counts here are as of the post-adoption tree. Between Task 2 and Task 7 this
 * suite is RED by design — that is the plan's one declared deliberate-red span,
 * and the violation list is the adoption worklist.
 */
import type { Candidate, CandidateOrigin } from "./scan";

export type Disposition =
  | { kind: "member"; shape: "G" | "U" | "N"; reason: string }
  | { kind: "exclusion"; reason: string };

export type DispositionRule = {
  id: string;
  origin: CandidateOrigin;
  disposition: Disposition;
  /** Required on exclusions; omitted on members, where the shape is self-evidencing. */
  expectedCount?: number;
  match: (candidate: Candidate) => boolean;
};

/** A comment or JSDoc line: it mentions the route, it does not navigate to it. */
const isProse = (text: string): boolean =>
  text.startsWith("//") || text.startsWith("*") || text.startsWith("/*");

/** A `test(...)` / `test.describe(...)` title string. */
const isTestTitle = (text: string): boolean => /^(?:test|describe)(?:\.\w+)*\(\s*[`"']/.test(text);

/** Any call into the modal-wait helper module. */
const callsHelper = (text: string): boolean =>
  /\b(?:openShowReviewModal|openShowReviewModalAt|awaitReviewModalOrRecover)\(/.test(text);

const inFile = (candidate: Candidate, file: string): boolean =>
  candidate.file === `tests/e2e/${file}`;

/**
 * The standalone-harness navigation family: `baseUrl`, `baseUrl + "live.html"`,
 * `HARNESS_PATH`, `GALLERY_PATH`. These specs serve a static harness page from a
 * temp dir (or the dev gallery route) and never touch the `/admin` loader.
 */
const isHarnessNavigation = (text: string): boolean =>
  /goto\(\s*(?:\w+Page\.)?(?:baseUrl|HARNESS_PATH|GALLERY_PATH)\b/.test(text) ||
  /goto\(\s*baseUrl\s*\+/.test(text) ||
  /goto\(\s*mutant \?/.test(text);

export const DISPOSITION_RULES: DispositionRule[] = [
  // ---------------------------------------------------------------- origin (a)
  {
    id: "a/member-helper-call",
    origin: "a-route-literal",
    disposition: {
      kind: "member",
      shape: "U",
      reason:
        "the caller owns the URL (extra query params, fragments, encodeURIComponent) and routes it through openShowReviewModalAt, so the wait and the single recovery are the helper's",
    },
    match: (c) => callsHelper(c.text),
  },
  {
    id: "a/exempt-declared",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason:
        "declares an inline modal-wait-exempt reason; the pinned inventory in the meta-test is what keeps that list from widening",
    },
    expectedCount: 2,
    // Resolved by the scan, not by this line's text: the marker is valid on the
    // line OR the line above, so a text match here would depend on which
    // spelling the author happened to use.
    match: (c) => c.exemptReason !== null && c.exemptReason !== "",
  },
  {
    id: "a/prose",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason: "comment or JSDoc mention of the route; navigates nothing",
    },
    expectedCount: 16,
    match: (c) => isProse(c.text),
  },
  {
    id: "a/test-title",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason: "a test or describe title naming the route it covers; navigates nothing",
    },
    expectedCount: 3,
    match: (c) => isTestTitle(c.text),
  },
  {
    id: "a/url-assertion",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason:
        "an href/URL expectation, not a navigation — the route text is the value under assertion",
    },
    expectedCount: 2,
    match: (c) =>
      /\.toBe\(|toHaveURL|rowHref|waitForURL/.test(c.text) ||
      // a continuation line carrying only the expected route literal
      /^`\/admin\?[^`]*`,$/.test(c.text),
  },
  {
    id: "a/local-wrapper-argument",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason:
        "a URL handed to a local wrapper that itself delegates through the helper; the wrapper is the open site, this line is its caller",
    },
    expectedCount: 4,
    match: (c) => /\bopenModal\(|^url:/.test(c.text),
  },

  // ---------------------------------------------------------------- origin (b)
  {
    id: "b/member-route-loop",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "alert-action-links walks a route table whose `/admin?show=` entries land in the modal; the commit-mode navigation is unchanged and only the post-open wait routes through awaitReviewModalOrRecover",
    },
    match: (c) => inFile(c, "alert-action-links.spec.ts") && /goto\(route,/.test(c.text),
  },
  {
    id: "b/standalone-harness",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a standalone harness page (mkdtemp workdir or the dev gallery route), not the /admin loader",
    },
    expectedCount: 73,
    match: (c) => isHarnessNavigation(c.text),
  },
  {
    id: "b/prose",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason: "a comment mentioning page.goto(); navigates nothing",
    },
    expectedCount: 3,
    match: (c) => isProse(c.text),
  },
  {
    id: "b/crew-and-picker-routes",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a crew page, picker, sign-in, help or schedule route held in a variable; the /admin?show= snapshot loader is not on its path",
    },
    expectedCount: 18,
    match: (c) =>
      !c.file.startsWith("tests/e2e/published-review-modal.") &&
      !/\bcrewPage\.goto\(/.test(c.text) &&
      (/goto\(\s*(?:crewUrl|pickerUrl|urlA|oldUrl|url|scheduleUrl|routePath|path|sourceRoute)\b/.test(
        c.text,
      ) ||
        (inFile(c, "sign-in-page.spec.ts") && /goto\($/.test(c.text))),
  },
  {
    id: "b/route-census-loops",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a whole-route census or auth-gate sweep over many routes; the loop asserts a status code or a font, never modal content",
    },
    expectedCount: 5,
    match: (c) =>
      (inFile(c, "font-rendering-census.spec.ts") || inFile(c, "help-auth.spec.ts")) &&
      /goto\(route\)?/.test(c.text),
  },
  {
    id: "b/crew-second-context",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason: "a second browser context opening the CREW page, not the admin modal",
    },
    expectedCount: 2,
    match: (c) => /\bcrewPage\.goto\(/.test(c.text),
  },

  // ---------------------------------------------------------------- origin (c)
  {
    id: "c/member-legacy-redirect",
    origin: "c-legacy-route",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "a signed-in legacy /admin/show/<slug> deep link that 307s into the modal; the goto is unchanged and the post-redirect wait routes through the helper",
    },
    match: (c) =>
      inFile(c, "published-review-modal.deeplink.spec.ts") &&
      /goto\(`\/admin\/show\/\$\{show\.slug\}\?alert_id=/.test(c.text),
  },
  {
    id: "c/prose",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason: "comment or JSDoc mention of the legacy route; navigates nothing",
    },
    expectedCount: 16,
    match: (c) => isProse(c.text),
  },
  {
    id: "c/test-title",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason: "a test or describe title naming the legacy route; navigates nothing",
    },
    expectedCount: 6,
    match: (c) => isTestTitle(c.text),
  },
  {
    id: "c/staged-and-preview-routes",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason:
        "/admin/show/staged/* and /admin/show/*/preview/* are different routes with their own loaders; the ?show= snapshot RPC is not on their path",
    },
    expectedCount: 13,
    match: (c) =>
      !isProse(c.text) &&
      !isTestTitle(c.text) &&
      !/^\["\/admin\/show\//.test(c.text) &&
      /\/admin\/show\/staged\/|\/admin\/show\/[^"'`]*\/preview\//.test(c.text),
  },
  {
    id: "c/signed-out-redirect",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason:
        "a SIGNED-OUT legacy navigation that redirects to sign-in and never reaches the loader",
    },
    expectedCount: 2,
    match: (c) =>
      inFile(c, "published-review-modal.deeplink.spec.ts") &&
      /goto\(`\/admin\/show\/\$\{show\.slug\}`\)|^\[`\/admin\/show\//.test(c.text),
  },
  {
    id: "c/route-template-table",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason: "a route-template row in a census table; a bracketed template, never navigated",
    },
    expectedCount: 3,
    match: (c) => /^\["\/admin\/show\//.test(c.text),
  },

  // ---------------------------------------------------------------- origin (d)
  {
    id: "d/member-row-activation",
    origin: "d-link-activation",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "a row or inbox-link click that client-navigates to the same ?show= route; the click is unchanged and the loaded-modal wait after it routes through awaitReviewModalOrRecover",
    },
    match: (c) =>
      /\.click\(/.test(c.text) &&
      !inFile(c, "published-review-modal.prefetch.spec.ts") &&
      !/noWaitAfter/.test(c.text),
  },
  {
    id: "d/prefetch-request-counting",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason:
        "prefetch.spec.ts COUNTS ?show= network requests; a recovery re-runs the loader and adds exactly the traffic those assertions measure, so adoption would convert a rare visible starve into a rare wrong-count failure (documented limit 3)",
    },
    expectedCount: 6,
    match: (c) => inFile(c, "published-review-modal.prefetch.spec.ts"),
  },
  {
    id: "d/skeleton-tolerant-click",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason:
        "re-opens mid-close-transition and waits on a selector the Suspense skeleton also matches, so a modal-or-boundary race resolves on the skeleton and would HIDE the fault (documented limit 3b, BL-MODAL-WAIT-SKELETON-TOLERANT-SITES)",
    },
    expectedCount: 1,
    match: (c) => /noWaitAfter/.test(c.text),
  },
  {
    id: "d/prose",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason: "a comment naming a row testid; activates nothing",
    },
    expectedCount: 1,
    match: (c) => isProse(c.text),
  },
  {
    id: "d/reference-not-activation",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason:
        "a locator binding, count, geometry read, or focus assertion on the testid; it causes no load, so there is no wait for the helper to own",
    },
    expectedCount: 25,
    match: (c) =>
      !/\.click\(/.test(c.text) &&
      !isProse(c.text) &&
      !inFile(c, "published-review-modal.prefetch.spec.ts"),
  },

  // ---------------------------------------------------------------- origin (e)
  {
    id: "e/member-reload-tier",
    origin: "e-renavigation",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "expectFlipLanded's third recovery tier reloads the current ?show= route, re-running the very loader that can throw; already the path a wedged run takes",
    },
    match: (c) => inFile(c, "admin-lifecycle-transitions.spec.ts"),
  },
  {
    id: "e/prose",
    origin: "e-renavigation",
    disposition: {
      kind: "exclusion",
      reason: "a comment about reload behavior; re-navigates nothing",
    },
    expectedCount: 2,
    match: (c) => isProse(c.text),
  },
  {
    id: "e/non-show-routes",
    origin: "e-renavigation",
    disposition: {
      kind: "exclusion",
      reason:
        "a reload or history step on /admin, /admin/needs-attention, the picker, or a crew route — the loader under test is not the ?show= one; interactions.spec.ts:392 is the inverse case, stepping BACK off ?show= to close the modal and asserting its absence",
    },
    expectedCount: 18,
    match: (c) =>
      !isProse(c.text) &&
      [
        "admin-nav-layout-dimensions.spec.ts",
        "bell-panel-layout.spec.ts",
        "crew-page.spec.ts",
        "crew-section-toggle.spec.ts",
        "needs-attention-holds.spec.ts",
        "needs-attention-page.spec.ts",
        "picker-flow.spec.ts",
        "published-review-modal.interactions.spec.ts",
        "theme-toggle.spec.ts",
      ].some((file) => inFile(c, file)),
  },
];
