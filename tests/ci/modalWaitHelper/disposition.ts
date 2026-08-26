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
 * **EVERY rule carries a count.** An earlier version exempted member rules on the
 * theory that they recognize the adopted shape itself and are therefore
 * self-evidencing at any count. Diff review refuted that with a probe: the
 * member rules for origins (b)-(e) match the raw click / reload / legacy-goto
 * line, which is UNCHANGED when someone deletes the post-open helper wait beside
 * it. The site kept its `member` label while its wait silently regained the
 * starve exposure, and no count, ambiguity or violation moved. Counting the
 * ADOPTED sites (origin (f)) is what closes it: deleting a wait drops that
 * count and fails this suite.
 *
 * RULE-AUTHORING CONTRACT (candidate contract v2, spec §4.3). A candidate is one
 * STATEMENT and one origin, so every rule has to say WHICH text it asks about,
 * and the answer is not a matter of taste:
 *
 *   1. REFUSAL GATES READ `candidate.text` — the whole statement, nested
 *      callback bodies included. Any rule whose disposition is "this is a
 *      reference, not an activation" refuses outright when `ACTIVATION_VERB`
 *      matches that text. This single clause is what closes
 *      BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION: a split-chained `.press(...)`
 *      and a `.click()` inside a `page.evaluate` body are both in the statement
 *      wherever formatting put them, so both land in front of a human as
 *      `undisposed` instead of inside a silent exclusion.
 *   2. RECOGNIZERS READ `candidate.matchLineText` — the one line the origin
 *      matched on. A member rule that recognizes a KNOWN shape, and every
 *      title / route-spelling / assertion discrimination, asks about that line.
 *      Reading a known shape off the whole statement is a false-positive
 *      machine in both directions: a `test(...)` container's text contains its
 *      whole body, so a body-reading member rule would claim the container too
 *      (ambiguous), and a poll statement whose body was edited to `.click()`
 *      would be claimed as an ordinary row activation (silently certified) —
 *      which is the very defect (1) exists to surface.
 *   3. NO PROSE RULES. Origin matching runs over comment-stripped bytes, so a
 *      comment produces no candidate of any origin. The five per-origin prose
 *      rules the line unit needed are retired, and commenting a site out drops
 *      its candidate and REDS the member count instead of moving it between
 *      rules.
 *
 * Counts here are as of the post-adoption tree, re-derived under the statement
 * unit rather than carried over.
 */
import type { Candidate, CandidateOrigin, ObservedNWaitSite } from "./scan";

export type Disposition =
  | { kind: "member"; shape: "G" | "U" | "N"; reason: string }
  | { kind: "exclusion"; reason: string };

export type DispositionRule = {
  id: string;
  origin: CandidateOrigin;
  disposition: Disposition;
  expectedCount?: number;
  match: (candidate: Candidate) => boolean;
};

/**
 * A DECLARED association between one `awaitReviewModalOrRecover` call and the
 * site it protects (spec §4.2).
 *
 * This is a claim an author wrote down, checked for consistency — exactly the
 * posture of the ledger's invariant-12 status markers, where "the ledger only
 * ever reports what an author wrote down". The census verifies that the labels
 * and scopes the corpus HOLDS are the ones declared here; it never infers which
 * open a wait "really" protects, because following a wait back to its open
 * through wrappers, loops and `release()` gates is the control-flow analysis
 * both ledger rows declined at filing.
 */
export type NWaitSite = {
  file: string;
  /** Enclosing test()/describe() title, or null at module scope. */
  scopeTitle: string | null;
  /**
   * SOURCE TEXT of the call's label property value, verbatim: identity, not
   * runtime value. `` `route-loop:${route}` `` is therefore ONE stable identity
   * across every iteration of the loop it sits in, with no corpus rename.
   */
  labelSource: string;
  /**
   * Prose: the open site(s) this wait discharges. HUMAN DOCUMENTATION, not
   * machine-checked — see the lying-declaration limit in scan.ts's header.
   */
  protects: string;
};

/**
 * Every Shape-N wait in the corpus, keyed (file, scope, label source).
 *
 * Identity is keyed on the SCOPE, not on the count and not on the label set,
 * because those two are invariant under exactly the defect
 * BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS filed: cut a wait out of the test whose
 * open it protects and paste it beside an already-protected click, and the
 * count still reads 12 and the label set is unchanged while one member site is
 * orphaned. The scope key is what sees the move.
 *
 * `"click:dashboard-row"` recurs in three FILES and never twice within one
 * scope, so this identity needed no corpus renames to adopt.
 */
export const N_WAIT_SITES: NWaitSite[] = [
  {
    file: "tests/e2e/admin-lifecycle-transitions.spec.ts",
    scopeTitle: null,
    labelSource: '"reload:expectFlipLanded"',
    protects:
      "expectFlipLanded's third recovery tier — the `page.reload()` on the line above it, which re-runs the very ?show= loader that can throw. Module scope: the helper is called from several tests",
  },
  {
    file: "tests/e2e/alert-action-links.spec.ts",
    scopeTitle:
      "every internal bell link's fragment resolves to a real element (dead-fragment guard)",
    labelSource: "`route-loop:${route}`",
    protects:
      "the route-table loop's `page.goto(route, …)` for whichever iteration carries an /admin?show= entry; the label interpolates the route so a failure annotation names it",
  },
  {
    file: "tests/e2e/needs-attention-holds.spec.ts",
    scopeTitle: "card link opens the show's review surface with the MI-11 gate controls",
    labelSource: '"click:inbox-identity-hold"',
    protects: "the needs-attention card link click two lines above it",
  },
  {
    file: "tests/e2e/published-review-modal.closeFreshness.spec.ts",
    scopeTitle: "published review modal — dashboard freshness after close",
    labelSource: '"click:dashboard-row"',
    protects:
      "the dashboard row click in the file-local open helper; describe scope, because the helper serves every test in the file",
  },
  {
    file: "tests/e2e/published-review-modal.deeplink.spec.ts",
    scopeTitle:
      "SIGNED-IN legacy /admin/show/<slug>?alert_id=x 307s into the modal with the highlight",
    labelSource: '"legacy-307:alert_id"',
    protects: "the legacy /admin/show/<slug>?alert_id= navigation that 307s into the modal",
  },
  {
    file: "tests/e2e/published-review-modal.deeplink.spec.ts",
    scopeTitle:
      "SIGNED-IN combined legacy ?alert_id=x#share-access keeps params; fragment per redirect delivery; alert scroll wins",
    labelSource: '"legacy-307:alert_id+fragment"',
    protects: "the combined legacy ?alert_id=…#share-access navigation and its 307",
  },
  {
    file: "tests/e2e/published-review-modal.interactions.spec.ts",
    scopeTitle:
      "focus continuity: Esc-close restores focus to the still-mounted dashboard trigger (real inert)",
    labelSource: '"keyboard-enter:row"',
    protects: "the Enter keypress on the focused `trigger` row link bound earlier in the test",
  },
  {
    file: "tests/e2e/published-review-modal.interactions.spec.ts",
    scopeTitle:
      "row-click open leaves NO stranded optimistic skeleton after the close commit (critique P0)",
    labelSource: '"click:row-trigger"',
    protects: "the `trigger.click()` on the row locator bound earlier in the test",
  },
  {
    file: "tests/e2e/published-review-modal.interactions.spec.ts",
    scopeTitle:
      "§6.5 closed→open entrance: the SKELETON plays sheet-rise + scrim fade at <sm; loaded swap is in-place",
    labelSource: '"gated-open:sheet"',
    protects: "the gated row open this test drives at <sm before asserting the entrance",
  },
  {
    file: "tests/e2e/published-review-modal.interactions.spec.ts",
    scopeTitle:
      "§6.5 closed→open entrance at ≥sm: the SKELETON plays pop-in; loaded swap is in-place",
    labelSource: '"gated-open:popup"',
    protects: "the gated row open this test drives at ≥sm before asserting the entrance",
  },
  {
    file: "tests/e2e/published-review-modal.realtime.spec.ts",
    scopeTitle: "an ABORTED close clears armed freshness cues (BL-FRESHNESS-ABORTED-CLOSE-E2E)",
    labelSource: '"click:dashboard-row"',
    protects: "the dashboard row click that re-opens the modal before the abort drive",
  },
  {
    file: "tests/e2e/published-review-modal.realtime.spec.ts",
    scopeTitle: "an ABORTED close clears armed freshness cues (BL-FRESHNESS-ABORTED-CLOSE-E2E)",
    labelSource: '"reopen:aborted-close"',
    protects:
      "the mid-close-transition re-click on the line above it: a noWaitAfter row click issued while the close navigation is still pending, whose post-open wait is the only thing between an aborted-close reopen and a bare downstream timeout. Same scope as the row above and legally so — identity is the (file, scope, LABEL) triple, and the two labels differ",
  },
  {
    file: "tests/e2e/published-review-modal.reopen.spec.ts",
    scopeTitle: "published review modal — reopen the same show",
    labelSource: '"click:dashboard-row"',
    protects:
      "the file-local open wrapper's row click, which four tests in this describe call. Wrapper-mediated: the association is DECLARED here and not verified against those four callers (documented limit 1)",
  },
];

/** One reconciliation of what the corpus HOLDS against what this file DECLARES. */
export type NWaitReconciliation = {
  /** Calls whose label the extractor could not resolve, by `file:line`. */
  unextractable: string[];
  /** Declared triples the corpus does not hold — the DELETE and the move's source. */
  missing: string[];
  /** Observed triples nobody declared — the move's destination. */
  unexpected: string[];
  /** A label repeated inside one (file, scope); across scopes repetition is legal. */
  duplicateInScope: string[];
};

const triple = (site: { file: string; scopeTitle: string | null; labelSource: string }): string =>
  `${site.file} :: ${site.scopeTitle ?? "(module scope)"} :: ${site.labelSource}`;

/**
 * Reconcile observed waits against `declared`, as a MULTISET of triples.
 *
 * Multiset, not set: two identical declared rows must be matched by two observed
 * calls, or a delete hides behind its own duplicate. The three lists say
 * different things and the caller reports all three — a cross-scope move is a
 * `missing` and an `unexpected` naming both ends, which is the whole point of
 * keying on the scope rather than on the count.
 */
export function reconcileNWaitSites(
  observed: readonly ObservedNWaitSite[],
  declared: readonly NWaitSite[],
): NWaitReconciliation {
  const unextractable = observed
    .filter((site) => site.labelSource === null)
    .map((site) => `${site.file}:${site.line}`);

  const remaining = declared.map(triple);
  const unexpected: string[] = [];
  for (const site of observed) {
    if (site.labelSource === null) continue;
    const key = triple({ ...site, labelSource: site.labelSource });
    const index = remaining.indexOf(key);
    if (index === -1) unexpected.push(key);
    else remaining.splice(index, 1);
  }

  const seen = new Set<string>();
  const duplicateInScope: string[] = [];
  for (const site of observed) {
    if (site.labelSource === null) continue;
    const key = triple({ ...site, labelSource: site.labelSource });
    if (seen.has(key)) duplicateInScope.push(key);
    seen.add(key);
  }

  return { unextractable, missing: remaining, unexpected, duplicateInScope };
}

/** A `test(...)` / `test.describe(...)` title string, asked of the MATCH line. */
const isTestTitle = (text: string): boolean => /^(?:test|describe)(?:\.\w+)*\(\s*[`"']/.test(text);

/** Any call into the modal-wait helper module. */
const callsHelper = (text: string): boolean =>
  /\b(?:openShowReviewModal|openShowReviewModalAt|awaitReviewModalOrRecover|openShowReviewFrameAt)\(/.test(
    text,
  );

/**
 * Playwright's activation verbs. A (d) candidate whose STATEMENT carries one of
 * these is doing something to the element, not merely referring to it, so every
 * reference-only exclusion refuses it outright and lets it fall through to
 * undispositioned. Asked of the whole statement per contract rule 1 — that is
 * the closure of BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION.
 */
const ACTIVATION_VERB =
  /\.(?:click|dblclick|press|fill|check|uncheck|selectOption|tap|focus|hover|setChecked|pressSequentially|dispatchEvent)\(/;

/**
 * The origin (d) split activation: a row-locator BINDING in interactions.spec.ts
 * whose activation lands in a LATER STATEMENT. Still a member, and still
 * declared per-site: the statement unit re-unites a split CHAIN, but a binding
 * and a later `trigger.click()` are two statements and no unit change makes the
 * second visible from the first (documented limit 6).
 */
const isSplitActivationBinding = (candidate: Candidate): boolean =>
  candidate.file === "tests/e2e/published-review-modal.interactions.spec.ts" &&
  /^const trigger = page\.locator\(/.test(candidate.text);

/**
 * An in-page `evaluate` READ: the browser-context body inspects the element and
 * returns data. Refuses on any activation verb ANYWHERE in the statement, which
 * is what makes editing such a body to `click()` loud rather than silent —
 * ledger row 2's second probed member.
 */
const isInPageEvaluateRead = (candidate: Candidate): boolean =>
  /\.evaluate\(/.test(candidate.text) && !ACTIVATION_VERB.test(candidate.text);

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
    expectedCount: 9,
    // The MATCH line, not the statement: a test() container's text contains its
    // whole body, so a statement-reading form would claim every describe block
    // holding an adopted call as a member too.
    match: (c) => !isTestTitle(c.matchLineText) && callsHelper(c.matchLineText),
  },
  {
    id: "a/exempt-declared",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason:
        "declares an inline modal-wait-exempt reason; the pinned inventory in the meta-test is what keeps that list from widening",
    },
    expectedCount: 1,
    // Resolved by the scan, not by any text here: the marker is valid on the
    // match line OR the line above, and the candidate's own text is stripped of
    // comments, so it could not carry the marker at all.
    match: (c) => c.exemptReason !== null && c.exemptReason !== "",
  },
  {
    id: "a/test-title",
    origin: "a-route-literal",
    disposition: {
      kind: "exclusion",
      reason: "a test or describe title naming the route it covers; navigates nothing",
    },
    expectedCount: 3,
    match: (c) => isTestTitle(c.matchLineText),
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
      /\.toBe\(|toHaveURL|rowHref|waitForURL/.test(c.matchLineText) ||
      // a continuation line carrying only the expected route literal
      /^`\/admin\?[^`]*`,$/.test(c.matchLineText),
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
    match: (c) => /\bopenModal\(|^url:/.test(c.matchLineText),
  },

  // ---------------------------------------------------------------- origin (f)
  //
  // The ADOPTED sites. These three counts ARE the §4.2 arithmetic, asserted
  // rather than retyped: 30 G (28 of this arc's plus the parent arc's 2 in
  // admin-changes-feed-layout.spec.ts), 9 U, 12 N edit locations. Deleting any
  // post-open helper wait drops the matching count and reds this suite, which is
  // the property the count-free version failed to hold. The N count is DERIVED
  // from N_WAIT_SITES rather than retyped, so the registry and the arithmetic
  // cannot disagree.
  {
    id: "f/member-shape-G",
    origin: "f-helper-call",
    disposition: {
      kind: "member",
      shape: "G",
      reason:
        "a plain goto adopted through openShowReviewModal(page, slug) — the helper owns the navigation, the loaded-modal wait and the single recovery",
    },
    expectedCount: 30,
    match: (c) => /\bopenShowReviewModal\s*\(/.test(c.matchLineText),
  },
  {
    id: "f/member-shape-U",
    origin: "f-helper-call",
    disposition: {
      kind: "member",
      shape: "U",
      reason:
        "the caller owns the URL or the goto options and adopts through openShowReviewModalAt, so waitUntil semantics and extra query params survive untouched",
    },
    expectedCount: 9,
    match: (c) => /\bopenShowReviewModalAt\s*\(/.test(c.matchLineText),
  },
  {
    id: "f/member-shape-U-frame",
    origin: "f-helper-call",
    disposition: {
      kind: "member",
      shape: "U",
      reason:
        "the caller accepts EITHER frame and adopts through the frame-reporting core, so the race covers the Suspense skeleton as well as the loaded modal and a boundary is annotated instead of hidden",
    },
    // ONE rule for BOTH frame entry points: the bare core has no corpus caller
    // yet, and a rule matching nothing reds the every-rule-matches-at-least-one
    // assertion. A future direct caller lands here and drifts this count loudly
    // — if it is shape N (the open is owned elsewhere), that drift is the
    // human's cue to extend the N registry vocabulary, not to widen this rule.
    expectedCount: 1,
    match: (c) =>
      /\b(?:openShowReviewFrameAt|awaitReviewFrameOrRecover)\s*\(/.test(c.matchLineText),
  },
  {
    id: "f/member-shape-N",
    origin: "f-helper-call",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "the open is a click, keyboard activation, legacy 307 or reload the helper cannot own, so only the post-open wait routes through awaitReviewModalOrRecover — and each one declares the site it protects in N_WAIT_SITES",
    },
    expectedCount: N_WAIT_SITES.length,
    match: (c) => /\bawaitReviewModalOrRecover\s*\(/.test(c.matchLineText),
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
    expectedCount: 1,
    match: (c) => inFile(c, "alert-action-links.spec.ts") && /goto\(route,/.test(c.matchLineText),
  },
  {
    id: "b/standalone-harness",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a standalone harness page (mkdtemp workdir or the dev gallery route), not the /admin loader",
    },
    // 73 -> 74: feat/review-modal-strip-dock added one standalone-harness
    // navigation — the §7 anchor-room measurement, which drives a refusal
    // through the real modal at `baseUrl` and is the case that finally gave
    // BL-TOGGLE-BANNER-ANCHOR-ROOM-UNMEASURED its number. A declared count is
    // a population claim, so growing the population is an edit here by design.
    expectedCount: 74,
    match: (c) => isHarnessNavigation(c.matchLineText),
  },
  {
    id: "b/crew-and-picker-routes",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a crew page, picker, sign-in, help or schedule route held in a variable; the /admin?show= snapshot loader is not on its path",
    },
    // 17 since batch 2 (2026-08-22): no-raw-codes' route walk now navigates
    // through crawlTargetFor(routePath), which moves that site to the
    // route-census-loops rule below, where it always belonged.
    // 18 since 2026-08-25 (feat/switch-person-google-signout): picker-flow's
    // switch-person case navigates to the seeded show URL held in `url`.
    // 19 since 2026-08-25 (fix/e2e-proof-retired-route-subpixel):
    // empty-state-reachability's gotoSection navigates the crew route through a
    // `url` variable. Same disposition as its neighbours — it is a crew page,
    // and the /admin?show= snapshot loader is not on its path. Both arcs landed
    // the same day and each bumped this to 18 independently; the merged count is
    // the union, not either side's number.
    expectedCount: 19,
    match: (c) =>
      !c.file.startsWith("tests/e2e/published-review-modal.") &&
      !/\bcrewPage\.goto\(/.test(c.matchLineText) &&
      (/goto\(\s*(?:crewUrl|pickerUrl|urlA|oldUrl|url|scheduleUrl|routePath|path|sourceRoute)\b/.test(
        c.matchLineText,
      ) ||
        (inFile(c, "sign-in-page.spec.ts") && /goto\($/.test(c.matchLineText))),
  },
  {
    id: "b/route-census-loops",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason:
        "a whole-route census or auth-gate sweep over many routes; the loop asserts a status code, a font, or the absence of raw §12.4 codes, never modal content",
    },
    expectedCount: 6,
    match: (c) =>
      ((inFile(c, "font-rendering-census.spec.ts") || inFile(c, "help-auth.spec.ts")) &&
        /goto\(route\)?/.test(c.matchLineText)) ||
      // no-raw-codes walks every discovered static route and scans the rendered
      // DOM for catalog codes; the telemetry route goes through a helper that
      // appends an empty-log filter (batch 2 R8), so the target is a call, not a
      // bare variable.
      (inFile(c, "no-raw-codes.spec.ts") && /goto\(crawlTargetFor\(/.test(c.matchLineText)),
  },
  {
    id: "b/crew-second-context",
    origin: "b-nonliteral-goto",
    disposition: {
      kind: "exclusion",
      reason: "a second browser context opening the CREW page, not the admin modal",
    },
    expectedCount: 2,
    match: (c) => /\bcrewPage\.goto\(/.test(c.matchLineText),
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
    expectedCount: 2,
    match: (c) =>
      inFile(c, "published-review-modal.deeplink.spec.ts") &&
      /goto\(`\/admin\/show\/\$\{show\.slug\}\?alert_id=/.test(c.matchLineText),
  },
  {
    id: "c/test-title",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason: "a test or describe title naming the legacy route; navigates nothing",
    },
    expectedCount: 6,
    match: (c) => isTestTitle(c.matchLineText),
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
      !isTestTitle(c.matchLineText) &&
      !/^\["\/admin\/show\//.test(c.matchLineText) &&
      /\/admin\/show\/staged\/|\/admin\/show\/[^"'`]*\/preview\//.test(c.matchLineText),
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
      /goto\(`\/admin\/show\/\$\{show\.slug\}`\)|^\[`\/admin\/show\//.test(c.matchLineText),
  },
  {
    id: "c/route-template-table",
    origin: "c-legacy-route",
    disposition: {
      kind: "exclusion",
      reason: "a route-template row in a census table; a bracketed template, never navigated",
    },
    expectedCount: 1,
    match: (c) => /^\["\/admin\/show\//.test(c.matchLineText),
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
    expectedCount: 9,
    // The MATCH line per contract rule 2. A statement-reading form would claim
    // an evaluate poll whose BODY was edited to `.click()` as an ordinary row
    // activation — silently certifying the exact edit ledger row 2 exists to
    // surface, which the rule below refuses instead.
    //
    // No `noWaitAfter` exclusion any more: the one such click in the corpus (the
    // aborted-close reopen) now routes its post-open wait through the helper
    // like every other row activation, so d/skeleton-tolerant-click retired and
    // this count absorbed it (8 -> 9).
    match: (c) =>
      /\.click\(/.test(c.matchLineText) && !inFile(c, "published-review-modal.prefetch.spec.ts"),
  },
  {
    id: "d/member-split-activation",
    origin: "d-link-activation",
    disposition: {
      kind: "member",
      shape: "N",
      reason:
        "a row-locator BINDING whose activation is a LATER STATEMENT — Enter on the focused row, or `trigger.click()` on the bound variable. Spec §2.1 makes origin (d) testid-keyed precisely because the call shape is NOT the invariant: grepping for the click misses these, which is why the testid reference stands in for the activation",
    },
    expectedCount: 2,
    // interactions.spec.ts only. The other bindings in origin (d) are
    // count/geometry reads that are never activated at all.
    match: isSplitActivationBinding,
  },
  {
    id: "d/in-page-evaluate-read",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason:
        "an in-page evaluate READ — a hydration poll, a focused-element probe, an href or geometry read. The browser-context body inspects the element and returns data, and this rule REFUSES on any activation verb anywhere in the statement, so editing such a body to click() drops the site to undisposed instead of leaving it certified (BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION, second probed member)",
    },
    expectedCount: 10,
    match: (c) => !inFile(c, "published-review-modal.prefetch.spec.ts") && isInPageEvaluateRead(c),
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
    id: "d/reference-not-activation",
    origin: "d-link-activation",
    disposition: {
      kind: "exclusion",
      reason:
        "a PROVEN reference-only use of the testid — an assertion, a count, a geometry read, an attribute read, or a bare locator binding. Each form is enumerated below rather than assumed, so an activation shape this list does not recognize falls through to NO rule and FAILS as undispositioned",
    },
    expectedCount: 13,
    // ALLOWLIST, not a catch-all. Diff review round 9 showed the catch-all
    // (`not a .click()`) silently excluded any OTHER activation: changing an
    // existing assertion to `page.getByTestId(...).press("Enter")` — an ordinary
    // corpus interaction — kept the suite green while the rule claimed the line
    // "causes no load". The reviewer's own prescription was to NARROW so
    // unfamiliar activation shapes become undisposed.
    //
    // v2 narrows it AGAIN, in the same direction: the one wide arm
    // (`dataOnly`: a line that calls nothing on the page at all) is GONE. It
    // existed to catch chain continuations, evaluate() arguments and tuple
    // elements — all of which are now interior lines of a statement that the
    // enumerated arms below, or `d/in-page-evaluate-read`, claim as a whole.
    // That arm was where this rule's line-granularity limit lived.
    match: (c) => {
      if (inFile(c, "published-review-modal.prefetch.spec.ts")) return false;
      // Contract rule 1: the refusal reads the WHOLE statement.
      if (ACTIVATION_VERB.test(c.text)) return false;
      // A split activation is a MEMBER of origin (d), not a reference; its
      // binding statement is claimed by `d/member-split-activation` above.
      if (isSplitActivationBinding(c)) return false;
      if (isInPageEvaluateRead(c)) return false;
      const t = c.text;
      const assertion = /\bexpect\(/.test(t) || /\.toBe(?:Visible|Attached)?\(/.test(t);
      const countRead = /\.count\(\)/.test(t);
      const geometryRead = /\brectOf\(/.test(t);
      const attributeRead = /\.getAttribute\(/.test(t);
      const binding = /^const \w+ = page\.(?:locator|getByTestId)\(/.test(t);
      return assertion || countRead || geometryRead || attributeRead || binding;
    },
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
    expectedCount: 1,
    match: (c) => inFile(c, "admin-lifecycle-transitions.spec.ts"),
  },
  {
    id: "e/non-show-routes",
    origin: "e-renavigation",
    disposition: {
      kind: "exclusion",
      reason:
        "a reload or history step on /admin, /admin/needs-attention, the picker, or a crew route — the loader under test is not the ?show= one; interactions.spec.ts:397 is the inverse case, stepping BACK off ?show= to close the modal and asserting its absence",
    },
    // 19 since 2026-08-25 (feat/switch-person-google-signout): picker-flow's
    // switch-person case reloads the crew route to prove the session ended.
    expectedCount: 19,
    match: (c) =>
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
