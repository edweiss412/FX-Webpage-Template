/**
 * tests/ci/_metaModalWaitCandidateV2.test.ts — the candidate-contract v2 premise proofs.
 *
 * Spec: docs/superpowers/specs/ci/2026-08-17-modal-wait-candidate-contract-design.md
 * §4.1 (the statement unit), §4.2 (the site-associated N-wait registry), §4.4
 * (these proofs). Plan: docs/superpowers/plans/ci/2026-08-17-modal-wait-candidate-contract.md
 * Task 1.
 *
 * Why a SIBLING file rather than more cases in `_metaModalWaitHelper.test.ts`:
 * these cases are authored RED against an API that does not exist yet, and an
 * unresolved import fails COLLECTION of its whole file — which would mask the
 * 24 existing cases behind one loader error for the length of the red span
 * (plan review R1 finding 1). The file is permanent: after the span it is the
 * second deciding suite of the `modal-wait-helper-scan` mutation row.
 *
 * Each case pins ONE probed defect the v1 line unit could not see. Every fixture
 * derives its expectation from its own constructed corpus, never from the live
 * tree, so none of them can pass by accident of what the repo happens to hold.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { premise, premiseHolds } from "../_shared/premise";
import {
  type Candidate,
  type Classification,
  classifyCandidates,
  enumerateCandidates,
  observedNWaitSites,
  productOpenSurfaces,
} from "./modalWaitHelper/scan";
import {
  DISPOSITION_RULES,
  type DispositionRule,
  type NWaitSite,
  reconcileNWaitSites,
} from "./modalWaitHelper/disposition";

/**
 * A throwaway repo root holding BOTH trees.
 *
 * NOT the bare spec-only fixture: origin (d) derives its testid prefixes from a
 * product scan of `app/` + `components/`, which returns NOTHING for an absent
 * tree (`tests/ci/modalWaitHelper/scan.ts:176-182`). A spec-only fixture would
 * therefore yield zero (d) candidates and make every (d) case below vacuously
 * green — the exact guard-premise defect these cases exist to close. Every (d)
 * case states the premise executably before asserting.
 */
function twoTreeRoot(name: string, specBody: string): string {
  const root = mkdtempSync(join(tmpdir(), "modal-wait-v2-"));
  mkdirSync(join(root, "tests", "e2e"), { recursive: true });
  mkdirSync(join(root, "components"), { recursive: true });
  writeFileSync(
    join(root, "components", "Probe.tsx"),
    [
      "export function Probe({ rows }: { rows: Row[] }) {",
      "  return rows.map((row) => (",
      "    <a",
      "      href={`/admin?show=${row.slug}`}",
      "      data-testid={`shows-table-row-${row.slug}`}",
      "    />",
      "  ));",
      "}",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(root, "tests", "e2e", `${name}.spec.ts`), specBody, "utf8");
  return root;
}

/** The (d) premise, executable: the product scan really did yield the prefix the spec fixture uses. */
function rowPrefixIsLive(root: string): void {
  const prefixes = productOpenSurfaces(root)
    .map((s) => s.testIdPrefix)
    .filter((p): p is string => p !== null);
  premiseHolds(
    "the fixture's components/ tree yielded the shows-table-row- prefix origin (d) keys on",
    prefixes.includes("shows-table-row-"),
  );
}

/** The live suite's drift computation, over an explicit rule list. */
function driftOf(classification: Classification, rules: readonly DispositionRule[]): string[] {
  const drift: string[] = [];
  for (const rule of rules) {
    const actual = classification.countsByRule.get(rule.id) ?? 0;
    if (actual === 0) drift.push(`${rule.id}: matches nothing — its class is gone`);
    if (rule.expectedCount !== undefined && actual !== rule.expectedCount) {
      drift.push(`${rule.id}: ${actual} candidates, rule declares ${rule.expectedCount}`);
    }
  }
  return drift;
}

/** Every shipped rule id that claims `candidate`. */
function claimsOf(candidate: Candidate): string[] {
  return DISPOSITION_RULES.filter((r) => r.origin === candidate.origin && r.match(candidate)).map(
    (r) => r.id,
  );
}

const dCandidates = (root: string): Candidate[] =>
  enumerateCandidates(root).filter((c) => c.origin === "d-link-activation");

describe("candidate contract v2 — the statement unit (BL-MODAL-WAIT-LINE-GRANULARITY-ACTIVATION)", () => {
  test("a split-chained activation is UNDISPOSED, never certified as a reference", () => {
    // Ledger row 2, member 1, probed at filing: the v1 line unit carried the
    // MIDDLE line of `await page` / `.getByTestId(…)` / `.press("Enter")`, so
    // the activation verb sat one line away from the candidate and
    // `d/reference-not-activation` certified the site as a pure reference. The
    // statement unit re-unites them.
    const root = twoTreeRoot(
      "split-chain",
      [
        'test("row Enter opens the modal", async ({ page }) => {',
        "  await page",
        '    .getByTestId("shows-table-row-alpha")',
        '    .press("Enter");',
        '  await awaitReviewModalOrRecover(page, { label: "keyboard-enter:row" });',
        "});",
      ].join("\n"),
    );
    rowPrefixIsLive(root);

    const candidates = dCandidates(root);
    expect(candidates).toHaveLength(1);
    const candidate = candidates[0];
    // The property that closes the row: the verb is in the candidate's text
    // even though it is not on the candidate's match line.
    expect(candidate?.text).toContain('.press("Enter")');
    expect(candidate?.text).toContain('.getByTestId("shows-table-row-alpha")');
    expect(candidate?.line, "the statement starts at `await page`").toBe(2);
    expect(candidate?.matchLine, "the testid is on the chain's second line").toBe(3);
    expect(candidate?.endLine, "the statement ends at the `.press(...)` line").toBe(4);
    expect(candidate?.matchLineText).toBe('.getByTestId("shows-table-row-alpha")');

    expect(
      claimsOf(candidate as Candidate),
      "no rule may claim an unrecognized activation",
    ).toEqual([]);
    expect(
      classifyCandidates(candidates, DISPOSITION_RULES).undisposed.map((c) => c.matchLine),
    ).toEqual([3]);
  });

  test("an activation inside a page.evaluate BODY is UNDISPOSED, and the un-mutated poll is not", () => {
    // Ledger row 2, member 2: the corpus's four hydration polls put the testid
    // on the evaluate ARGUMENT line while the browser-context body sits above
    // it. Editing that body to activate left the v1 suite 24/24 green. The
    // PAIRED positive is what proves the refusal discriminates rather than
    // blanket-failing every poll.
    const poll = (bodyLines: string[]): string =>
      [
        'test("hydration", async ({ page }) => {',
        "  await expect",
        "    .poll(",
        "      () =>",
        "        page.evaluate((tid) => {",
        '          const el = document.querySelector(`[data-testid="${tid}"]`);',
        ...bodyLines,
        "        }, `shows-table-row-${slug}`),",
        '      { message: "row link hydrated", timeout: 30_000 },',
        "    )",
        "    .toBe(true);",
        "});",
      ].join("\n");

    const readOnly = twoTreeRoot("poll-read", poll(["          return el !== null;"]));
    rowPrefixIsLive(readOnly);
    const readCandidates = dCandidates(readOnly);
    expect(readCandidates).toHaveLength(1);
    premiseHolds(
      "the un-mutated poll statement carries no activation verb, so the pair discriminates",
      !/\.click\(/.test(readCandidates[0]?.text ?? ""),
    );
    expect(
      classifyCandidates(readCandidates, DISPOSITION_RULES).undisposed,
      "the ordinary read-only poll is a declared exclusion, not a question for a human",
    ).toEqual([]);
    expect(claimsOf(readCandidates[0] as Candidate)).toEqual(["d/in-page-evaluate-read"]);

    const activating = twoTreeRoot(
      "poll-click",
      poll(["          if (el) (el as HTMLElement).click();", "          return el !== null;"]),
    );
    rowPrefixIsLive(activating);
    const clickCandidates = dCandidates(activating);
    expect(clickCandidates).toHaveLength(1);
    expect(clickCandidates[0]?.text, "the nested body is part of the statement span").toContain(
      "(el as HTMLElement).click()",
    );
    expect(claimsOf(clickCandidates[0] as Candidate)).toEqual([]);
    expect(classifyCandidates(clickCandidates, DISPOSITION_RULES).undisposed).toHaveLength(1);
  });

  test("a COMMENTED-OUT member activation leaves the domain and REDS the member count", () => {
    // Spec-review R2's probe. The refuted premise was "trivia has no enclosing
    // statement": a comment position sits INSIDE the enclosing statement's span
    // and `getText()` includes interior comments, so a raw-text census silently
    // re-certified a disabled site. Strip-before-match is the mechanism that
    // survives it — a comment byte is a space when the regexes run.
    const spec = (activation: string): string =>
      [
        'test("row click opens the modal", async ({ page }) => {',
        activation,
        '  await awaitReviewModalOrRecover(page, { label: "click:dashboard-row" });',
        "});",
      ].join("\n");
    const memberRule: DispositionRule = {
      id: "fixture/member-row-activation",
      origin: "d-link-activation",
      disposition: { kind: "member", shape: "N", reason: "the fixture's one live row activation" },
      expectedCount: 1,
      match: (c) => /\.click\(/.test(c.text),
    };

    const live = twoTreeRoot(
      "comment-live",
      spec('  await page.getByTestId("shows-table-row-a").click();'),
    );
    rowPrefixIsLive(live);
    const liveCandidates = dCandidates(live);
    expect(liveCandidates).toHaveLength(1);
    expect(driftOf(classifyCandidates(liveCandidates, [memberRule]), [memberRule])).toEqual([]);

    const commented = twoTreeRoot(
      "comment-out",
      spec('  // await page.getByTestId("shows-table-row-a").click();'),
    );
    rowPrefixIsLive(commented);
    const all = enumerateCandidates(commented);
    expect(
      all.filter((c) => c.matchLine === 2),
      "a commented-out line yields no candidate of ANY origin",
    ).toEqual([]);
    expect(
      driftOf(
        classifyCandidates(
          all.filter((c) => c.origin === "d-link-activation"),
          [memberRule],
        ),
        [memberRule],
      ),
      "commenting the activation out must RED the member count, not pass quietly",
    ).toEqual([
      "fixture/member-row-activation: matches nothing — its class is gone",
      "fixture/member-row-activation: 0 candidates, rule declares 1",
    ]);
  });

  test("a container statement and the call inside it are discriminated, never ambiguous", () => {
    // The cost of the statement unit, paid explicitly: a route mention in a
    // test() TITLE attributes to the whole test-call statement, whose text
    // contains the body. Title/assertion rules therefore read `matchLineText`,
    // and the disjointness assertion is the executable check that they did.
    const root = twoTreeRoot(
      "container",
      [
        'test("covers /admin?show= deeplinks", async ({ page }) => {',
        "  await openShowReviewModalAt(page, `/admin?show=${slug}`);",
        "});",
      ].join("\n"),
    );
    const routeCandidates = enumerateCandidates(root).filter((c) => c.origin === "a-route-literal");
    expect(routeCandidates.map((c) => c.matchLine)).toEqual([1, 2]);

    const container = routeCandidates.find((c) => c.matchLine === 1) as Candidate;
    const call = routeCandidates.find((c) => c.matchLine === 2) as Candidate;
    premiseHolds(
      "the container's text really does contain the call, or discrimination is untested",
      container.text.includes("openShowReviewModalAt"),
    );
    expect(claimsOf(container)).toEqual(["a/test-title"]);
    expect(claimsOf(call)).toEqual(["a/member-helper-call"]);
    expect(classifyCandidates(routeCandidates, DISPOSITION_RULES).ambiguous).toEqual([]);
  });
});

describe("candidate contract v2 — attribution boundaries", () => {
  test("a match at column 0 that STARTS its statement attributes to that statement", () => {
    // Both boundaries of the producer's own arithmetic, in one fixture drawn one
    // reformat away from the corpus (which already holds the
    // `Promise.all([openShowReviewModal(…)])` shape). Column 0 is the low edge
    // of the match-column test, and a statement whose FIRST character is the
    // match is the low edge of the node-containment test: read one character too
    // conservatively and the site is attributed to the enclosing test() call
    // instead, silently widening every candidate in the file.
    const root = twoTreeRoot(
      "col-zero",
      ['test("x", async ({ page }) => {', 'openShowReviewModal(page, "a");', "});"].join("\n"),
    );
    const helperCandidates = enumerateCandidates(root).filter((c) => c.origin === "f-helper-call");
    expect(helperCandidates).toHaveLength(1);
    expect(helperCandidates[0]?.line, "its OWN statement, not the enclosing test()").toBe(2);
    expect(helperCandidates[0]?.matchLine).toBe(2);
    expect(helperCandidates[0]?.text).toBe('openShowReviewModal(page, "a");');
  });

  test("an IMPORT of the helper is not an adopted site", () => {
    // Origin (f) is "this site has ADOPTED", and an import declares the helper
    // while opening nothing. The property is the call paren the origin pattern
    // requires, asserted here rather than defended by a second guard that could
    // never fire.
    const root = twoTreeRoot(
      "import-only",
      [
        'import { openShowReviewModal } from "./helpers/openShowReviewModal";',
        "",
        'test("x", async ({ page }) => {',
        '  await openShowReviewModal(page, "a");',
        "});",
      ].join("\n"),
    );
    expect(
      enumerateCandidates(root)
        .filter((c) => c.origin === "f-helper-call")
        .map((c) => c.matchLine),
    ).toEqual([4]);
  });

  test("the sign-in exclusion is a CONTINUATION-LINE shape, not a whole-file pass", () => {
    // `b/crew-and-picker-routes` excludes sign-in-page.spec.ts's SPLIT
    // `await page.goto(` / `<url>,` spelling — a line that ENDS at the call
    // paren. Read instead as "any candidate in that file", the rule would
    // certify a `/admin?show=` navigation added to the same spec later. Nothing
    // in the live corpus distinguishes the two readings; this fixture does.
    const root = twoTreeRoot(
      "sign-in-page",
      ['test("x", async ({ page }) => {', "  await page.goto(someRoute);", "});"].join("\n"),
    );
    const gotos = enumerateCandidates(root).filter((c) => c.origin === "b-nonliteral-goto");
    expect(gotos).toHaveLength(1);
    expect(
      claimsOf(gotos[0] as Candidate),
      "a SAME-LINE goto in that file is not the excluded shape",
    ).toEqual([]);
  });

  test("scope resolution ignores an ordinary call that merely takes a string first", () => {
    // The scope key is `test`/`describe` and their chains, NOT "any call with a
    // string argument". A local wrapper taking a label plus a callback is
    // ordinary corpus shape, and treating its label as the scope would silently
    // re-key every wait nested inside one.
    const root = twoTreeRoot(
      "scope-callee",
      [
        'test("the real enclosing title", async ({ page }) => {',
        '  await withLabel("shows-table-row-a", async () => {',
        '    await page.getByTestId("shows-table-row-b").click();',
        "  });",
        "});",
      ].join("\n"),
    );
    rowPrefixIsLive(root);
    const inner = dCandidates(root).find((c) => c.matchLine === 3);
    expect(inner?.scopeTitle).toBe("the real enclosing title");
  });
});

describe("candidate contract v2 — the N-wait registry (BL-MODAL-WAIT-SITE-ASSOCIATED-COUNTS)", () => {
  /** Two scopes, two waits — the smallest corpus in which a MOVE is expressible. */
  const twoWaitSpec = (first: string[], second: string[]): string =>
    [
      'test.describe("published review modal", () => {',
      '  test("keyboard Enter opens the row", async ({ page }) => {',
      ...first,
      "  });",
      "",
      '  test("row click opens the row", async ({ page }) => {',
      ...second,
      "  });",
      "});",
    ].join("\n");

  const DECLARED: NWaitSite[] = [
    {
      file: "tests/e2e/two-waits.spec.ts",
      scopeTitle: "keyboard Enter opens the row",
      labelSource: '"keyboard-enter:row"',
      protects: "the Enter activation on the focused row link",
    },
    {
      file: "tests/e2e/two-waits.spec.ts",
      scopeTitle: "row click opens the row",
      labelSource: '"click:dashboard-row"',
      protects: "the dashboard row click",
    },
  ];

  const observedFor = (specBody: string): ReturnType<typeof observedNWaitSites> =>
    observedNWaitSites(enumerateCandidates(twoTreeRoot("two-waits", specBody)));

  const ENTER_WAIT = '    await awaitReviewModalOrRecover(page, { label: "keyboard-enter:row" });';
  const CLICK_WAIT = '    await awaitReviewModalOrRecover(page, { label: "click:dashboard-row" });';
  const ENTER_OPEN = '    await page.getByTestId("shows-table-row-a").press("Enter");';
  const CLICK_OPEN = '    await page.getByTestId("shows-table-row-b").click();';

  test("the intact corpus reconciles against its declared registry", () => {
    const observed = observedFor(twoWaitSpec([ENTER_OPEN, ENTER_WAIT], [CLICK_OPEN, CLICK_WAIT]));
    premise("the fixture produced N-wait sites to reconcile", observed.length, 1);
    expect(observed.map((o) => o.scopeTitle)).toEqual([
      "keyboard Enter opens the row",
      "row click opens the row",
    ]);
    expect(reconcileNWaitSites(observed, DECLARED)).toEqual({
      unextractable: [],
      missing: [],
      unexpected: [],
      duplicateInScope: [],
    });
  });

  test("a DELETED wait fails naming the row that vanished, not `12 ≠ 11`", () => {
    const observed = observedFor(twoWaitSpec([ENTER_OPEN, ENTER_WAIT], [CLICK_OPEN]));
    const result = reconcileNWaitSites(observed, DECLARED);
    expect(result.missing).toEqual([
      'tests/e2e/two-waits.spec.ts :: row click opens the row :: "click:dashboard-row"',
    ]);
    expect(result.unexpected).toEqual([]);
  });

  test("a CROSS-SCOPE move fails naming BOTH ends, with the count intact", () => {
    // The ledger's own probe: cut the wait from the Enter-open's test and paste
    // it beside the already-protected click. Count invariant (2 → 2), label set
    // invariant, and only the scope key sees the orphaning.
    const observed = observedFor(twoWaitSpec([ENTER_OPEN], [CLICK_OPEN, CLICK_WAIT, ENTER_WAIT]));
    premise(
      "the move preserved the wait COUNT, so only the scope key can see it",
      observed.length,
      1,
    );
    expect(observed).toHaveLength(DECLARED.length);
    const result = reconcileNWaitSites(observed, DECLARED);
    expect(result.missing).toEqual([
      'tests/e2e/two-waits.spec.ts :: keyboard Enter opens the row :: "keyboard-enter:row"',
    ]);
    expect(result.unexpected).toEqual([
      'tests/e2e/two-waits.spec.ts :: row click opens the row :: "keyboard-enter:row"',
    ]);
  });

  test("a QUOTED label key is reported unextractable, not silently resolved", () => {
    // Documented limit, asserted rather than assumed: the extractor resolves an
    // identifier key only. A `{ "label": … }` spelling is one ordinary edit from
    // the corpus, and the census REFUSES to certify what it cannot identify —
    // reporting it loudly beats resolving a key shape nobody declared.
    const observed = observedFor(
      twoWaitSpec(
        [
          ENTER_OPEN,
          '    await awaitReviewModalOrRecover(page, { "label": "keyboard-enter:row" });',
        ],
        [CLICK_OPEN, CLICK_WAIT],
      ),
    );
    expect(reconcileNWaitSites(observed, DECLARED).unextractable).toEqual([
      "tests/e2e/two-waits.spec.ts:4",
    ]);
  });

  test("an UNLABELED wait is reported by file:line, never silently certified", () => {
    const observed = observedFor(
      twoWaitSpec(
        [ENTER_OPEN, "    await awaitReviewModalOrRecover(page, { timeoutMs: 30_000 });"],
        [CLICK_OPEN, CLICK_WAIT],
      ),
    );
    const result = reconcileNWaitSites(observed, DECLARED);
    expect(result.unextractable).toEqual(["tests/e2e/two-waits.spec.ts:4"]);
  });

  test("a label repeated INSIDE one scope is reported; across scopes it is legal", () => {
    // `"click:dashboard-row"` recurs in three corpus FILES and never within one
    // scope, so cross-scope repetition must stay legal or the registry would
    // demand corpus renames it has no reason to demand.
    const duplicated = observedFor(
      twoWaitSpec([ENTER_OPEN, ENTER_WAIT, ENTER_WAIT], [CLICK_OPEN, CLICK_WAIT]),
    );
    expect(reconcileNWaitSites(duplicated, DECLARED).duplicateInScope).toEqual([
      'tests/e2e/two-waits.spec.ts :: keyboard Enter opens the row :: "keyboard-enter:row"',
    ]);

    const crossScope = observedFor(twoWaitSpec([ENTER_OPEN, CLICK_WAIT], [CLICK_OPEN, CLICK_WAIT]));
    expect(reconcileNWaitSites(crossScope, DECLARED).duplicateInScope).toEqual([]);
  });

  test("a wait's label is read wherever formatting put it, including off the call's line", () => {
    // 4 of the 12 live sites carry the label on a DIFFERENT physical line than
    // the call (spec §2.2) — the fact that makes the site-association row
    // structurally depend on the statement-unit row.
    const observed = observedFor(
      twoWaitSpec(
        [
          ENTER_OPEN,
          "    await awaitReviewModalOrRecover(page, {",
          '      label: "keyboard-enter:row",',
          "      timeoutMs: 30_000,",
          "    });",
        ],
        [CLICK_OPEN, CLICK_WAIT],
      ),
    );
    premiseHolds(
      "the fixture really does split the label onto a later line than its call",
      observed[0]?.line !== undefined,
    );
    expect(observed.map((o) => o.labelSource)).toEqual([
      '"keyboard-enter:row"',
      '"click:dashboard-row"',
    ]);
    expect(reconcileNWaitSites(observed, DECLARED).missing).toEqual([]);
  });
});
