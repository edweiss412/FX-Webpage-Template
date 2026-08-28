/**
 * Regression pin for the 2026-08-16 control-outline swap.
 *
 * Spec: docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md
 * Plan: docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md
 *
 * THREAT FENCE: this suite defends against ONE thing — the swaps of TWO arcs
 * being reverted or half-reverted (the two-arm ternary case): the 21 that moved
 * off `border-border-strong` on 2026-08-16, and the 36 additions that moved off
 * `border-border` on 2026-08-18, 57 census rows in total. It does NOT defend
 * against a contributor adding a NEW control at either token; spec §5.2 records the five review rounds that
 * established why that forward guard was CUT rather than shipped.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { CENSUS, DIVIDERS, resolveCensus } from "./controlOutlineScan";
import { allStrings, scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

/**
 * Scratch roots this file creates, removed together in `afterAll`.
 *
 * `afterAll` rather than per-case: vitest runs it even when a case fails, and a
 * cleanup that only runs on success leaks exactly when a suite is being
 * debugged, which is when it runs most. Guard:
 * `tests/mutation/_metaScratchRootCleanup.test.ts`. Row:
 * BL-MUTATION-SCRATCH-FS-EVENT-STORM.
 */
const scratchRoots: string[] = [];
function trackScratch(root: string): string {
  scratchRoots.push(root);
  return root;
}
afterAll(() => {
  for (const root of scratchRoots) rmSync(root, { recursive: true, force: true });
  scratchRoots.length = 0;
});

/**
 * ONE root, read by BOTH the premise and the resolver.
 *
 * Plan review R2 F1 caught the alternative: a premise taken from `cwd` while the
 * rows resolve from some other `rootDir` is a premise about an ADJACENT input,
 * and it passes at 362 while every row assertion fails for an environmental
 * reason. Pre-dispatch mutant (d) — point this at an empty temp dir — is the
 * check that premise and case share an input.
 */
const ROOT = process.cwd();

const UNIVERSE = scanInteractiveElements(ROOT);

/**
 * Executed at module scope, unconditionally and never inside a `.each` callback:
 * a scanner returning `[]` (bad root, changed extension filter, parse
 * regression) makes every "carries `border-text-faint`" assertion vacuously
 * unfindable, and the suite would pass forever. Measured universe: 362.
 */
premise("scanner reaches the component tree", UNIVERSE.length, 200);

const RESOLVED = resolveCensus(ROOT);

/** Whole-token match. `border-text-faint-x` is NOT `border-text-faint`. */
function carries(element: ScanElement, token: string): boolean {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return allStrings(element).some((s) => whole.test(s));
}

/**
 * The render alternatives that carry `token` — the unit every PER-PATH claim is
 * made in.
 *
 * Reasoning over `allStrings` (the UNION of every alternative) when the question
 * is about a single path is the error this arc hit THREE times: in the hover
 * classification, in a tinted-plate claim, and in the first draft of the hover
 * assertions below. The repair is a named helper that is easier to reach for
 * than the wrong one, rather than a fourth careful hand-check.
 */
function pathsCarrying(element: ScanElement, token: string): readonly (readonly string[])[] {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return element.paths.filter((path) => path.some((s) => whole.test(s)));
}

/** Every render alternative carries the token — not merely one of them. */
function everyPathCarries(element: ScanElement, token: string): boolean {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return element.paths.every((path) => path.some((s) => whole.test(s)));
}

/**
 * Local six-line fixture harness. `tests/styles/interactiveScanCore.test.ts:41`
 * has the same shape and does NOT export it; replicated here deliberately
 * rather than exporting it from a module the mutation registry already enrols.
 */
function scanFixture(source: string): ScanElement[] {
  const dir = trackScratch(mkdtempSync(join(tmpdir(), "control-outline-fixture-")));
  const path = join(dir, "components/Fx.tsx");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  return scanInteractiveElements(dir);
}

describe("control-outline census (spec §4.2)", () => {
  /**
   * Asserted against the LITERAL 57, never against anything derived from
   * `CENSUS`. Without this, deleting a row deletes its test case and the suite
   * still passes: the premise still sees 362, the unresolved pin still sees 13,
   * and every surviving row still resolves. This is the vacuous-iteration
   * failure and it is the single most important case in the file.
   */
  it("holds exactly 57 rows", () => {
    expect(CENSUS.length).toBe(57);
  });

  /** A duplicated row must not stand in for a deleted one and keep the count. */
  it("has 57 distinct row identities", () => {
    const identities = new Set(CENSUS.map((r) => `${r.file}:${r.line}`));
    expect(identities.size).toBe(57);
  });

  /**
   * Pinned as an EQUALITY, not a ceiling (spec §5.3). A fourteenth unresolvable
   * element reds here and gets triaged instead of joining a silent pool; a count
   * that DROPS is also worth knowing, because it usually means an indirection
   * was resolved and a control just entered the cover.
   */
  it("leaves the scanner's unresolved pool at 13", () => {
    expect(UNIVERSE.filter((e) => e.unresolved).length).toBe(13);
  });
});

describe.each(RESOLVED.map((r, i) => [i + 1, r] as const))(
  "census row %i",
  (_index, resolvedRow) => {
    const label = `${resolvedRow.row.file}:${resolvedRow.row.line}`;

    /**
     * A renamed file or a moved element must RED here rather than silently drop
     * out of the iteration.
     */
    it(`resolves through the scanner (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
    });

    /**
     * The token this row wears TODAY, which is `text-faint` for all but the
     * three that later moved to a tinted plate (`outline` on the census row,
     * 2026-08-25). Asserting the row's own token rather than a constant is what
     * keeps this a record of where each swept control ended up; asserting
     * `text-faint` unconditionally would force the three plate controls out of
     * the census and lose the fact that they were swept at all.
     *
     * The retired token is asserted absent in the same case, so a row cannot
     * satisfy this by carrying both.
     */
    it(`carries its recorded outline token (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
      const element = resolvedRow.element as ScanElement;
      const expected = `border-${resolvedRow.row.outline ?? "text-faint"}`;
      const retired =
        expected === "border-text-faint" ? "border-control-outline-tinted" : "border-text-faint";
      expect(carries(element, expected)).toBe(true);
      expect(carries(element, retired)).toBe(false);
    });

    /**
     * NOT redundant with the case above: a two-arm ternary element can carry
     * BOTH tokens if only one arm was edited (spec §4.2's ternary trap).
     */
    it(`no longer carries border-border-strong (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
      expect(carries(resolvedRow.element as ScanElement, "border-border-strong")).toBe(false);
    });

    /**
     * The 2026-08-18 arc's strengthening, and it is a NEGATION rather than a
     * universal on purpose.
     *
     * `carries` reads `allStrings`, which spans every render alternative, so
     * "no path carries it" IS the universal claim. The tempting edit —
     * `everyPathCarries(el, "border-text-faint")` — is WRONG for this
     * population and the counterexample is shipped: `Mi11GateActions.tsx:69`
     * has an `isApprove` branch that is `bg-accent … text-accent-text` with no
     * border at all, the accent-filled primary action DESIGN §1.2a rules OUT by
     * name. A control may legitimately have an outline-free path.
     */
    it(`no longer carries border-border (${label})`, () => {
      expect(resolvedRow.element).not.toBeNull();
      expect(carries(resolvedRow.element as ScanElement, "border-border")).toBe(false);
    });
  },
);

/**
 * The five dividers are OUT, and the exclusion is asserted rather than assumed.
 *
 * THREE assertions each. Absence from CENSUS alone stays green if a later arc
 * deletes the token from a divider — that would violate the exclusion while
 * looking clean (plan review R1 F2).
 */
describe.each(DIVIDERS.map((d) => [`${d.file}:${d.line}`, d] as const))(
  "divider %s is excluded, not swept",
  (label, row) => {
    const element = UNIVERSE.find((e) => e.file === row.file && e.line === row.line) ?? null;

    it(`resolves through the scanner (${label})`, () => {
      expect(element).not.toBeNull();
    });

    it(`still carries border-border (${label})`, () => {
      expect(element).not.toBeNull();
      expect(carries(element as ScanElement, "border-border")).toBe(true);
    });

    it(`is NOT a census row (${label})`, () => {
      expect(CENSUS.some((r) => r.file === row.file && r.line === row.line)).toBe(false);
    });
  },
);

describe("negative control — the assertion can fail", () => {
  const fixture = `export function Fx() {
  return <button className="border border-border-strong bg-surface">x</button>;
}
`;

  it("finds a constructed border-border-strong button and rejects it", () => {
    const found = scanFixture(fixture);
    /**
     * A fixture that fails to parse returns `[]` and makes the assertion below
     * vacuously true. The repo-scan premise at module scope is ADJACENT to that,
     * not a substitute for it.
     */
    premise("fixture parsed and produced an element", found.length, 0);
    const button = found[0] as ScanElement;
    expect(carries(button, "border-border-strong")).toBe(true);
    expect(carries(button, "border-text-faint")).toBe(false);
  });

  /**
   * Fixture (a): the border-border negation can fail at all.
   */
  it("finds a constructed border-border button and rejects it", () => {
    const found = scanFixture(`export function Fx() {
  return <button className="border border-border bg-surface">x</button>;
}
`);
    premise("fixture parsed and produced an element", found.length, 0);
    expect(carries(found[0] as ScanElement, "border-border")).toBe(true);
  });

  /**
   * Fixture (b): the strengthening is NOT cosmetic.
   *
   * One arm carries the new token, the other still carries the old one. It
   * PASSES the pre-existing `carries(…, "border-text-faint")` check and FAILS
   * the negation — which is exactly the `ResetPickerEpochButton.tsx:178` shape
   * the 2026-08-16 pin could not see.
   */
  it("passes the faint check and fails the negation on a half-swapped ternary", () => {
    const found = scanFixture(`export function Fx({ compact }: { compact: boolean }) {
  return (
    <button
      className={
        compact
          ? "border border-text-faint bg-surface"
          : "border border-border bg-surface"
      }
    >
      x
    </button>
  );
}
`);
    premise("fixture parsed and produced an element", found.length, 0);
    const el = found[0] as ScanElement;
    expect(carries(el, "border-text-faint")).toBe(true);
    expect(carries(el, "border-border")).toBe(true);
  });

  /**
   * Fixture (c): a legitimately outline-free branch is NOT collateral.
   *
   * The `Mi11GateActions.tsx:69` shape — one arm is an accent-filled primary
   * with no border at all. It must satisfy both shipped assertions, which is
   * why the negation form was chosen over `everyPathCarries` (spec §5.2).
   */
  it("leaves an outline-free branch alone", () => {
    const found = scanFixture(`export function Fx({ primary }: { primary: boolean }) {
  return (
    <button
      className={
        primary
          ? "bg-accent px-4 text-accent-text"
          : "border border-text-faint bg-surface"
      }
    >
      x
    </button>
  );
}
`);
    premise("fixture parsed and produced an element", found.length, 0);
    const el = found[0] as ScanElement;
    expect(carries(el, "border-text-faint")).toBe(true);
    expect(carries(el, "border-border")).toBe(false);
    expect(everyPathCarries(el, "border-text-faint")).toBe(false);
    expect(pathsCarrying(el, "border-text-faint").length).toBe(1);
  });
});

describe("adjacent tokens survive the swap", () => {
  /**
   * The census pin checks the token that MOVED. This checks the RESPONSIVE
   * treatment that must not silently vanish. Plan review R3 probed the original
   * failure mode: corrupting both `max-sm:` border tokens after an otherwise
   * correct swap leaves every census row reading `faint=true strong=false`, so
   * the whole suite stays green while ShareHub's responsive treatment is gone.
   *
   * INVERTED 2026-08-25, and the reason is recorded here rather than left to a
   * blame trail. This case shipped asserting `max-sm:border-border`, because a
   * ratified decision (spec 2026-07-24-strip-mobile-stacked-band §3 R3, the
   * in-file comment at ShareHub.tsx:798-801) fenced those two elements out of
   * the 2026-08-16 and 2026-08-18 sweeps. The cost of that fence was measured
   * and filed as BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT: ONE button
   * painting 3.35:1 above 640px and 1.27:1 below it, on the viewport where the
   * crew-facing half of this product actually lives.
   *
   * `feat/ui-polish-class-sweep` took that decision (design doc
   * 2026-08-25-ui-polish-class-sweep-design.md, D1): DESIGN.md §1.2a's
   * control-outline rule supersedes R3's border clause. R3 ratified a SPLIT ROW
   * LAYOUT, and the border colour was one line of skin riding inside it; the
   * layout is untouched and the border width is still 1px.
   *
   * So the assertion moves and the case does NOT weaken. A guard rewritten to
   * match the change it exists to detect is the failure shape the ledger row
   * itself names (BACKLOG.md:2091), and the difference is that this one still
   * fails if BOTH arms lose their responsive outline, still fails if only one
   * arm moves, and now also fails if either arm keeps the retired token.
   */
  const SHARE_HUB = "components/admin/showpage/ShareHub.tsx";

  it("keeps a max-sm outline on BOTH ShareHub ternary arms, at the control token", () => {
    const shareHub = RESOLVED.find((r) => r.row.file === SHARE_HUB)?.element;
    expect(shareHub).toBeTruthy();
    const element = shareHub as ScanElement;
    premise("ShareHub element carries more than one render alternative", element.paths.length, 1);
    expect(everyPathCarries(element, "max-sm:border-text-faint")).toBe(true);
    expect(carries(element, "max-sm:border-border")).toBe(false);
  });

  /**
   * The kebab, which the census never held.
   *
   * It is a sibling `<button>` in the same band wearing the same `max-sm:`
   * skin, and it was fenced by the same R3 clause — so D1 settles it by the
   * same rule, and leaving it out would ship a split treatment inside one row.
   * Resolved from the scanner directly rather than through `RESOLVED`, because
   * `CENSUS` holds one ShareHub row (line 781) and adding the kebab to the
   * census would claim it was part of a 2026-08-16 swap it was not part of.
   */
  it("settles the ShareHub kebab by the same rule as the arms", () => {
    const kebabs = UNIVERSE.filter(
      (e) => e.file === SHARE_HUB && carries(e, "max-sm:min-w-tap-min"),
    );
    premise("the scanner finds the ShareHub kebab", kebabs.length, 0);
    for (const kebab of kebabs) {
      expect(everyPathCarries(kebab, "max-sm:border-text-faint")).toBe(true);
      expect(carries(kebab, "max-sm:border-border")).toBe(false);
    }
  });
});

describe("switch tracks are untouched (spec §2, §3.1 — AC-2)", () => {
  /**
   * A SOURCE-PRESENCE check over a fixed list of five NAMED files. It classifies
   * nothing and must not grow into a classifier (spec §5.2).
   *
   * It exists because plan review R3 probed that none of these five files
   * appears in the census or in Task 2's fence, so AC-2 was otherwise unverified
   * by any command in the plan and an altered OFF recipe would have shipped
   * undetected. Two of the five are the nested-span paths the cover never saw
   * (spec §3.1).
   */
  const TRACK_PATHS = [
    "components/admin/PublishedToggle.tsx",
    "components/admin/settings/AutoPublishToggle.tsx",
    "components/admin/settings/NotifyToggle.tsx",
    "components/admin/telemetry/AutoRefreshControl.tsx",
    "components/admin/settings/DeveloperToggleButton.tsx",
  ] as const;

  it("names all five render paths", () => {
    expect(TRACK_PATHS.length).toBe(5);
  });

  it.each(TRACK_PATHS)("keeps both branches of the recipe in %s", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).toContain("border-accent-edge bg-accent");
    expect(source).toContain("border-border-strong bg-surface-sunken");
  });
});

/**
 * The hover repair (spec §3.6) — the inversion this arc's swap CAUSES.
 *
 * Before the swap these 21 rested at `border-border` (1.27:1) and hovered at
 * `border-border-strong` (1.59:1) or `border-accent` (2.33:1 light): a step UP.
 * After it they rest at `border-text-faint` (3.35:1) while neither hover token
 * moves — a step DOWN at all 21. Hovering would make the outline WEAKER than
 * resting, contradicting the ruling the swap implements.
 *
 * Not pre-existing: of the 2026-08-16 census's own 21, exactly one carries a
 * `hover:border-*`, and it is `hover:border-status-warn` — a semantic
 * escalation, not a weight cue. This arc creates the class, so it repairs it.
 *
 * THE DENYLIST BELOW IS NECESSARY AND NOT SUFFICIENT. It passes if a required
 * override is deleted outright, or swapped for a third weak token. The positive
 * per-path assertions are what actually prove AC-11.
 */
const ADDITIONS = CENSUS.slice(21);

/**
 * §3.6(a) — another hover cue already lives on the same render path AND that
 * cue actually DELIVERS something.
 *
 * ADEQUACY, not mere presence. Three sites were in this group until the
 * invariant-8 design review probed what each surviving cue is worth:
 * `ThemeToggle` and `UserMenu` both relied on `hover:bg-surface-raised`, and in
 * LIGHT mode `--color-surface` and `--color-surface-raised` are BOTH `#ffffff`
 * — ratio 1.000, a literal no-op — while their companion
 * `hover:text-text-strong` is 1.11:1 and imperceptible on a glyph or initials.
 * Deleting `hover:border-border-strong` there removed the ONLY light-mode hover
 * those controls had. `UnarchiveShowButton` was a fill wash alone at 1.11:1.
 * All three moved to (b).
 *
 * The lesson is in the test rather than only in a filing: "the path still has a
 * hover cue" is a presence check, and presence is not adequacy.
 */
const HOVER_DELETE = [
  "components/admin/HoverHelp.tsx:562",
  "components/admin/NeedsAttentionInbox.tsx:101",
  "components/admin/NeedsAttentionInbox.tsx:130",
  "components/admin/NeedsAttentionInbox.tsx:198",
  "components/admin/NeedsAttentionInbox.tsx:224",
  "components/crew/SectionChipLink.tsx:48",
  "components/crew/primitives/PersonRow.tsx:196",
  "components/crew/primitives/PersonRow.tsx:213",
] as const;

/**
 * §3.6(b) — the border IS the only hover cue on the path that carries it, so
 * deleting it would remove hover feedback outright. Raising is the only
 * non-regressive option.
 *
 * `PublishedReviewModal.tsx:1006` is here because the classification is PER
 * RENDER PATH: its path 0 is `border-border bg-surface-sunken …
 * hover:border-border-strong`, its path 1 is `bg-warning-bg …
 * hover:bg-warning-bg/80`. The other cue belongs only to path 1.
 */
const HOVER_SUBTLE = [
  "app/me/meShowSections.tsx:174",
  "app/me/meShowSections.tsx:213",
  "app/me/meShowSections.tsx:258",
  "components/admin/UnarchiveShowButton.tsx:67",
  "components/admin/nav/UserMenu.tsx:51",
  "components/admin/showpage/PublishedReviewModal.tsx:1007",
  "components/agenda/AgendaEmbed.tsx:83",
  "components/agenda/AgendaPdfViewer.tsx:198",
  "components/layout/ThemeToggle.tsx:92",
  "components/shared/ReportButton.tsx:142",
] as const;

/**
 * §3.6(c) — the cue is an accent HUE, kept, but `--color-accent` measures
 * 2.33:1 light against `surface`, BELOW the new 3.35:1 rest. `DESIGN.md:119`
 * already directs load-bearing accent to `--color-accent-on-bg` (5.57 light /
 * 8.84 dark), so these follow a rule the design system already states.
 */
const HOVER_ACCENT = [
  "components/admin/dev/SwitcherControls.tsx:83",
  "components/admin/dev/SwitcherControls.tsx:92",
  "components/admin/dev/SwitcherControls.tsx:142",
] as const;

describe("hover repair — no swapped control hovers quieter than it rests (spec §3.6)", () => {
  /**
   * The three groups are the plan's contract; this pins their SHAPE rather than
   * a live count that only holds before the repair.
   *
   * An earlier revision asserted that all 21 override sites still carry a
   * `hover:border-*`. That is true BEFORE the repair and necessarily false
   * after it — group (a) exists precisely to remove eight of them — so it
   * described the red state and could never be green. What survives the repair
   * and is worth pinning: the groups are disjoint, they total 21, every member
   * is a census ADDITION rather than one of the predecessor's 21, and exactly
   * the thirteen retarget sites still carry an override afterwards.
   */
  it("the three hover groups are disjoint, total 21, and are all census additions", () => {
    const all = [...HOVER_DELETE, ...HOVER_SUBTLE, ...HOVER_ACCENT];
    expect(all.length).toBe(21);
    expect(new Set(all).size).toBe(21);
    // 8 delete / 10 raise / 3 accent. FOUR sites moved from (a) to (b) on
    // adequacy grounds: ThemeToggle, UserMenu and UnarchiveShowButton at the
    // invariant-8 design review, and ReportButton's icon variant at whole-diff
    // review round 1. The 21 here is the HOVER population; the census is 57.
    expect(HOVER_DELETE.length).toBe(8);
    expect(HOVER_SUBTLE.length).toBe(10);
    expect(HOVER_ACCENT.length).toBe(3);
    const additionIds = new Set(ADDITIONS.map((r) => `${r.file}:${r.line}`));
    for (const id of all) expect(additionIds.has(id)).toBe(true);
  });

  /**
   * Post-repair, an override survives at exactly the thirteen RETARGET sites.
   *
   * This is the assertion that would catch a ninth deletion being skipped, or
   * a fourteenth site quietly acquiring an override. `ArchiveShowButton.tsx:365` is
   * deliberately not among them: it belongs to the 2026-08-16 census, not to
   * this arc's additions, and its `hover:border-status-warn` is a SEMANTIC
   * escalation rather than a weight cue — which is why the scoping below is
   * over ADDITIONS and not over all 57 rows (see the plan's scoping note).
   */
  it("exactly the thirteen retarget sites still carry a border override", () => {
    const stillOverridden = ADDITIONS.map((r) => `${r.file}:${r.line}`).filter((id) => {
      const el = UNIVERSE.find((e) => `${e.file}:${e.line}` === id);
      if (!el) return false;
      return allStrings(el)
        .flatMap((s) => s.split(/\s+/))
        .some((t) => /^(hover|aria-expanded):border-/.test(t));
    });
    expect(stillOverridden.sort()).toEqual([...HOVER_SUBTLE, ...HOVER_ACCENT].sort());
  });

  describe.each(ADDITIONS.map((r) => [`${r.file}:${r.line}`] as const))("denylist %s", (id) => {
    const el = UNIVERSE.find((e) => `${e.file}:${e.line}` === id) ?? null;
    it("carries no hover:border-border-strong and no bare border-accent under any prefix", () => {
      expect(el).not.toBeNull();
      const toks = allStrings(el as ScanElement).flatMap((s) => s.split(/\s+/));
      expect(toks.some((t) => t === "hover:border-border-strong")).toBe(false);
      expect(toks.some((t) => /^(hover|aria-expanded):border-accent$/.test(t))).toBe(false);
    });
  });

  describe.each(HOVER_DELETE.map((id) => [id] as const))("(a) %s", (id) => {
    it("carries NO hover:border-* token at all", () => {
      const el = UNIVERSE.find((e) => `${e.file}:${e.line}` === id) ?? null;
      expect(el).not.toBeNull();
      const toks = allStrings(el as ScanElement).flatMap((s) => s.split(/\s+/));
      expect(toks.filter((t) => /^hover:border-/.test(t))).toEqual([]);
    });
  });

  describe.each(HOVER_SUBTLE.map((id) => [id] as const))("(b) %s", (id) => {
    it("every path carrying the outline also carries hover:border-text-subtle", () => {
      const el = UNIVERSE.find((e) => `${e.file}:${e.line}` === id) ?? null;
      expect(el).not.toBeNull();
      const outlined = pathsCarrying(el as ScanElement, "border-text-faint");
      premise("the element has at least one outline-bearing path", outlined.length, 0);
      for (const path of outlined) {
        expect(path.some((s) => /(^|\s)hover:border-text-subtle(\s|$)/.test(s))).toBe(true);
      }
    });
  });

  describe.each(HOVER_ACCENT.map((id) => [id] as const))("(c) %s", (id) => {
    it("carries hover:border-accent-on-bg on every outline-bearing path", () => {
      const el = UNIVERSE.find((e) => `${e.file}:${e.line}` === id) ?? null;
      expect(el).not.toBeNull();
      const outlined = pathsCarrying(el as ScanElement, "border-text-faint");
      premise("the element has at least one outline-bearing path", outlined.length, 0);
      for (const path of outlined) {
        expect(path.some((s) => /(^|\s)hover:border-accent-on-bg(\s|$)/.test(s))).toBe(true);
      }
    });
  });

  it("SwitcherControls' aria-expanded twin moves with its hover twin", () => {
    const el = UNIVERSE.find(
      (e) => `${e.file}:${e.line}` === "components/admin/dev/SwitcherControls.tsx:142",
    ) as ScanElement;
    const toks = allStrings(el).flatMap((s) => s.split(/\s+/));
    expect(toks).toContain("aria-expanded:border-accent-on-bg");
  });
});
