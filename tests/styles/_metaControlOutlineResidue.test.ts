/**
 * The DECIDING SUITE for the control-outline residue census.
 *
 * Spec: docs/superpowers/specs/2026-08-21-control-outline-forward-guard-design.md
 * Plan: docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md
 *
 * The relation it asserts is one line long: the multiset of residue elements, keyed by content,
 * equals the registered census. Everything else here exists to make that assertion impossible to
 * satisfy vacuously — the acceptance floor of §1.4.3 (ten source mutations red, two control edits
 * green), the twelve refusals and six acceptances of the category bars, and the self-proofs of §5.
 *
 * Every `it` carries a `// covers:` comment naming the weaker implementation (`W<n>`) or the
 * acceptance criterion (`AC-<n>`) it exists for, and one case asserts that mapping is total, so
 * the corpus cannot grow a case without a reason.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { premise, premiseHolds } from "../_shared/premise";
import { stripCommentsForFile } from "../_shared/stripComments";

/**
 * FILE-LEVEL budget, because the cost driver is file-wide and enumerating which cases carry it
 * proved unreliable three times.
 *
 * WHAT GOES WRONG WITHOUT IT. Cases here build scratch corpora at ~11 MB each -- the module's own
 * §5.6 hazard means they cannot be shared, since the scanner caches parsed files by absolute path
 * and never invalidates. On a quiet box the heaviest run in a few seconds. Under contention they do
 * not: measured on one machine on 2026-08-24, `key membership is by compiled declaration` ran 11.4s
 * at load 13 and BLEW the 30s default at load 27, while `the key and the oracle read ONE selector
 * rule` measured 56.3s outright. Both reds were on UNMUTATED source.
 *
 * That costs twice. `unit-suite` is a REQUIRED context, so it is a latent red on a required check --
 * the same hazard commit 6aa429064 raised the thirty-two-form case to 120s to remove, which fixed
 * the instance and left the class. And under the mutation harness a suite that reds for ANY reason
 * records the mutant as KILLED, so a contended run manufactures FALSE KILLS: the 2026-08-24 scored
 * run recorded `logical-connector:291:30:&&>||` and `integer-literal:294:41:0>1` as killed, and both
 * were re-probed against a green baseline and SURVIVE.
 *
 * WHY FILE-LEVEL RATHER THAN PER-CASE. Three attempts to enumerate the at-risk cases mechanically
 * disagreed with each other: counting call sites returned zero (the helper is written once inside a
 * `.map` over an N-element literal), a map-aware count missed two cases that measurement caught, and
 * measurement missed one the structural count caught. A budget that must be attached to the right
 * subset is one refactor away from missing a case. This attaches to all of them, and it is inert on
 * a passing test -- it can only ever prevent a spurious failure, never mask a real one, because a
 * failing assertion still fails immediately. The thirty-two-form case keeps its own explicit 120s
 * below: it is now subsumed by this, but its comment documents a reason worth keeping at the call.
 *
 * `vi.setConfig` beats the config file, which is what makes this work under BOTH the root config and
 * `mutantOverlay.config.ts`. Precedent for a file raising its own budget: the 90s doc-scan noted in
 * `tests/cross-cutting/db-test-timeout-floor.test.ts`.
 */
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });
import { normalizeToken } from "./_childlessGrowableScan";
import {
  CATEGORY_BARS,
  classify,
  classifyValue,
  isResidue,
  loadOracle,
  ownDeclarations,
  paintProjection,
  printPasteReadyRow,
  projectionsOf,
  recordedRatio,
  RESIDUE_CENSUS,
  residueKey,
  residueOf,
  rowKey,
  tokensOf,
  utilityOf,
  validateCensus,
  validateRow,
  variantsOf,
  weakSides,
  type ResidueCategory,
  type ResidueRow,
  type TokenPaint,
} from "./controlOutlineResidue";
import { CENSUS, DIVIDERS } from "./controlOutlineScan";
import { allStrings, scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

/* ------------------------------------------------- module scope (AC-7, AC-15, AC-17) */

const ROOT = process.cwd();
const css = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const oracle = await loadOracle(join(ROOT, "app/globals.css"));

// AC-17: the Tailwind version is part of the classification. `premise` is strictly `actual >
// mustExceed` (tests/_shared/premise.ts), so the major is written as exceeding its predecessor;
// `, 4` would red on 4.2.4. The exact-major equality is the `it` below.
const major = Number(
  (
    JSON.parse(readFileSync(join(ROOT, "node_modules/tailwindcss/package.json"), "utf8")) as {
      version: string;
    }
  ).version.split(".")[0],
);
premise("tailwindcss major exceeds 3", major, 3);

// AC-15: the oracle is alive BEFORE any census case reads it. A theme missing the weak colour
// fails here by NAME rather than as a `TypeError` on `.sides` twenty cases later.
const canonical = classify(oracle, ["border-border-strong", "border-accent-edge", "group"]);
premiseHolds(
  "oracle compiles the canonical weak token",
  canonical.get("border-border-strong") != null,
);
premise(
  "oracle classifies the canonical weak token on more than three sides",
  [...canonical.get("border-border-strong")!.sides.values()].filter(Boolean).length,
  3,
);

const LIVE = residueOf(ROOT, oracle);
premise("scanner reaches the component tree", LIVE.universe, 200);

const ledger =
  readFileSync(join(ROOT, "BACKLOG.md"), "utf8") +
  "\n" +
  readFileSync(join(ROOT, "DEFERRED.md"), "utf8");

/* ------------------------------------------------------------------------- helpers */

const PT = "components/admin/PublishedToggle.tsx";
const UNIGNORE = "components/admin/UnignoreButton.tsx";
const ON_OFF = 'on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken",';
const FAINT = "border border-text-faint";

/** Exactly-once, or throw naming the anchor: a replace that matched nothing is not a mutant. */
function replaceOnce(path: string, anchor: string, replacement: string): void {
  const source = readFileSync(path, "utf8");
  const occurrences = source.split(anchor).length - 1;
  if (occurrences !== 1)
    throw new Error(`anchor matched ${occurrences} times, expected exactly 1: ${anchor}`);
  writeFileSync(
    path,
    source.replace(anchor, () => replacement),
  );
}

/**
 * A fresh corpus root PER CASE.
 *
 * The scanner caches parsed files by ABSOLUTE PATH and never invalidates
 * (`interactiveScanCore.ts`, `sourceCache`), so one reused root returns the first mutant's result
 * for every later one — which is exactly what corrupted the first probe run (spec §5.6). `lib` is
 * copied because the resolver reaches into it: dropping it moves the unresolved pool from 13 to 21.
 */
function withScratchCorpus<T>(mutate: (root: string) => void, read: (root: string) => T): T {
  const root = mkdtempSync(join(tmpdir(), "control-outline-residue-"));
  try {
    for (const dir of ["app", "components", "lib"])
      cpSync(join(ROOT, dir), join(root, dir), { recursive: true });
    cpSync(join(ROOT, "tsconfig.json"), join(root, "tsconfig.json"));
    mutate(root);
    return read(root);
  } finally {
    // Every scratch root is ~11 MB and this suite builds EIGHTY-ONE of them per run. Under the
    // mutation harness that is one full set per mutant, so leaking them costs ~900 MB a mutant and
    // fills the disk long before the run ends: measured 5113 leaked roots, about 51 GB, before this
    // cleanup existed. `finally` rather than `afterAll` because a throwing case must clean up too.
    // Deleting is safe for the parse-cache hazard of spec §5.6: `mkdtemp` never reissues a name, so
    // a later root cannot inherit a deleted one's cached SourceFiles.
    rmSync(root, { recursive: true, force: true });
  }
}

/** The residue keys of a mutated corpus, through the same code path the live tree uses. */
function keysAfter(mutate: (root: string) => void): Map<string, number> {
  return withScratchCorpus(mutate, (root) => residueOf(root, oracle).keys);
}

const sameKeys = (a: Map<string, number>, b: Map<string, number>): boolean =>
  a.size === b.size && [...a].every(([k, n]) => b.get(k) === n);

/** The files a mutation introduced, read off the novel keys rather than off the edit. */
function novelFiles(keys: Map<string, number>): string[] {
  return [
    ...new Set(
      [...keys.keys()]
        .filter((k) => !LIVE.keys.has(k))
        .map((k) => String((JSON.parse(k) as [string, string, string[]])[0])),
    ),
  ];
}

/**
 * True inside a per-mutant child run (`mutantOverlay.config.ts` requires this variable).
 *
 * ONE case is excluded under mutation: the thirty-two-form case below. It builds thirty-two
 * scratch roots at ~11 MB and cannot share them, so it costs ~15s of this file's ~45s, and EVERY
 * mutant pays it. Three mutants on the tie-break at `controlOutlineResidue.ts:343` ground for 25,
 * 57 and 125 minutes -- 207 of one run's 335 -- because this late case kept running under mutants
 * the suite had already rejected. `bail: 1` reclaims that for the 236 KILLED mutants, which stop at
 * their first failure; it cannot help the SURVIVORS, which fail nothing and so pay every case. This
 * exclusion is the other half, and the two together are what bring the surface under the
 * `source-shards` job cap of 125 minutes.
 *
 * The case is NOT lost to CI: it runs on every normal `unit-suite` run, which is where its
 * assertions are checked. What it stops doing is contributing KILLS to the mutation score, so the
 * score under-counts by exactly the mutants this case alone would have killed. That set is measured
 * rather than assumed -- see the documented limit in the design's §, with its re-file trigger.
 */
const UNDER_MUTATION = process.env["MUTATION_MUTANT"] !== undefined;

/** Append an `Extra` control at one class string, the §1.4.3 new-control shape. */
const extraControl = (cls: string) =>
  `\nexport function Extra() { return <button className="rounded-md border ${cls} bg-surface px-3">x</button>; }\n`;

function appendTo(path: string, text: string): void {
  writeFileSync(path, readFileSync(path, "utf8") + text);
}

/**
 * One element out of one mutated corpus, with its OWN premise that the edit landed.
 *
 * The scanner reads class strings whether or not they compile, so a non-compiling form satisfies
 * the premise too — which is what makes every NEGATIVE case prove its own input arrived rather
 * than pass because an edit silently did nothing (spec §5, self-proof 4).
 */
function scratchElement(
  file: string,
  anchor: string,
  replacement: string,
  form: string,
  pick: (elements: ScanElement[]) => ScanElement | undefined,
): { el: ScanElement; paint: Map<string, TokenPaint | null> } {
  const elements = withScratchCorpus(
    (r) => replaceOnce(join(r, file), anchor, replacement),
    (root) => scanInteractiveElements(root, WIDENED),
  );
  const el = pick(elements);
  premiseHolds(`the mutated element was found for ${form}`, el !== undefined);
  premiseHolds(
    `the form reached the element's readable strings: ${form}`,
    allStrings(el!).some((s) => s.split(/\s+/).includes(form)),
  );
  return { el: el!, paint: classify(oracle, tokensOf([el!])) };
}

/** `form` substituted for `border-text-faint` on `UnignoreButton`'s single control. */
function formOnUnignore(form: string) {
  return scratchElement(UNIGNORE, FAINT, `border ${form}`, form, (elements) =>
    elements.find((e) => e.file === UNIGNORE),
  );
}

/** `extra` appended to `PublishedToggle`'s ON (`alt0`) or OFF (`alt1`) alternative. */
function extraOnToggle(alternative: "on" | "off", extra: string) {
  const replacement =
    alternative === "on"
      ? `on ? "border-accent-edge bg-accent ${extra}" : "border-border-strong bg-surface-sunken",`
      : `on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken ${extra}",`;
  return scratchElement(PT, ON_OFF, replacement, extra, (elements) =>
    elements.find((e) => e.file === PT && e.tag === "button"),
  );
}

/** The same six-line shape as `_metaControlOutlineFill.test.ts`, replicated on purpose. */
function scanFixture(source: string): ScanElement[] {
  const dir = mkdtempSync(join(tmpdir(), "control-outline-residue-fixture-"));
  try {
    const path = join(dir, "components/Fx.tsx");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
    return scanInteractiveElements(dir, WIDENED);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The two axes `residueOf` reads (spec §7.1); every helper here reads the same. */
const WIDENED = { textEntry: true, paintedChildren: true } as const;

const liveElement = (file: string, line?: number): ScanElement => {
  const el = LIVE.elements.find((e) => e.file === file && (line === undefined || e.line === line));
  if (!el)
    throw new Error(`no live residue element at ${file}${line === undefined ? "" : `:${line}`}`);
  return el;
};

/** A row built from a LIVE element's own projections, so a bar case never depends on the seeding. */
function rowFor(
  el: ScanElement,
  category: ResidueCategory,
  reason: string,
  backlogRef?: string,
  /**
   * The paint map to project through. Defaults to the LIVE one, which is the
   * point of this helper for every live subject.
   *
   * Overridable for exactly one case: `responsive-skin-filed` has no live
   * member since 2026-08-25, so `LIVE.paint` no longer holds a
   * `max-sm:border-border` entry and a constructed subject would project to
   * nothing and be refused as "not residue" — the wrong reason, which would
   * make the bar case pass for a reason unrelated to the bar. `classify`
   * compiles any token through the design system, live or not.
   */
  paint: ReadonlyMap<string, TokenPaint | null> = LIVE.paint,
): ResidueRow {
  const base = {
    file: el.file,
    tag: el.tag,
    paint: projectionsOf(el, paint),
    category,
    reason,
  };
  return backlogRef === undefined ? base : { ...base, backlogRef };
}

/**
 * AC-5: the ONE derived number in a reason, recomputed from the COMPILED VALUES of the OFF
 * alternative's two tokens — never from their spelling, which is what the r7 finding killed.
 */
function ratioProblems(row: ResidueRow, paint: Map<string, TokenPaint | null>): string[] {
  const stated = /(\d\.\d\d):1 light \/ (\d\.\d\d):1 dark/.exec(row.reason);
  if (!stated) return [`${row.file}: switch-track reason states no ratio`];
  // Identify the OFF alternative, or decline to. `find` used to take the FIRST weak alternative,
  // and `projectionsOf` SORTS them, so "first" is a lexical accident that coincides with OFF only
  // while exactly one alternative is weak. Half-swap a ternary and both go weak, and the row was
  // then validated against the ON state — a reason stating the ON ratio passed silently while
  // claiming to record the OFF ring.
  //
  // Nothing in the projection positively marks OFF: the switch-track bar itself says both
  // alternatives carry one fill and one outline. So this does not guess harder. It reports that the
  // OFF state is not identifiable, which is a conservative demote plus a surfaced signal rather than
  // a silent wrong accept, and leaves the ratio unrecomputed rather than recomputed against the
  // wrong pair.
  const weakAlternatives = row.paint
    .map((p) => p.split(" ").filter(Boolean))
    .filter((alternative) =>
      alternative.some((t) => [...(paint.get(t)?.sides.values() ?? [])].some(Boolean)),
    );
  if (weakAlternatives.length === 0)
    return [`${row.file}: no alternative carries the weak outline`];
  if (weakAlternatives.length > 1)
    return [
      `${row.file}: ${weakAlternatives.length} alternatives carry a weak outline, so the OFF state is not identifiable`,
    ];
  const off = weakAlternatives[0];
  if (off === undefined) return [`${row.file}: no alternative carries the weak outline`];
  const outline = off.map((t) => paint.get(t)?.outlineColourVar).find((v) => v != null);
  const fill = off.map((t) => paint.get(t)?.fillColourVar).find((v) => v != null);
  if (outline == null || fill == null)
    return [`${row.file}: the OFF alternative has no theme outline/fill pair to recompute`];
  const actual = recordedRatio(outline, fill, css);
  const problems: string[] = [];
  if (Math.abs(actual.light - Number(stated[1])) > 0.01)
    problems.push(
      `${row.file}: light ratio recomputes to ${actual.light.toFixed(2)}, row says ${stated[1]}`,
    );
  if (Math.abs(actual.dark - Number(stated[2])) > 0.01)
    problems.push(
      `${row.file}: dark ratio recomputes to ${actual.dark.toFixed(2)}, row says ${stated[2]}`,
    );
  return problems;
}

/* ------------------------------------------------------------------- the premises */

describe("the oracle and the version it classifies under", () => {
  // covers: AC-17
  it("pins the Tailwind major the census was classified under", () => {
    expect(major).toBe(4);
  });

  // covers: AC-15
  it("classifies the canonical weak, strong and non-compiling tokens", () => {
    const weak = canonical.get("border-border-strong");
    const strong = canonical.get("border-accent-edge");
    expect([...(weak?.sides.values() ?? [])]).toEqual([true, true, true, true]);
    expect([...(strong?.sides.values() ?? [])]).toEqual([false, false, false, false]);
    expect(canonical.get("group")).toBeNull();
  });

  // covers: AC-7
  it("scans a corpus large enough for the census equality to mean something", () => {
    expect(LIVE.universe).toBeGreaterThan(200);
  });
});

/* --------------------------------------------------------------------- the census */

describe("the residue census (spec §1.4, §5.1)", () => {
  // covers: AC-1
  it("holds exactly 22 rows", () => {
    expect(RESIDUE_CENSUS.length).toBe(22);
  });

  // covers: AC-11
  it("holds 5 / 10 / 5 / 2 / 0 / 0 / 0 rows by category", () => {
    const count = (c: ResidueCategory) => RESIDUE_CENSUS.filter((r) => r.category === c).length;
    expect(count("switch-track")).toBe(5);
    // Ten since 2026-08-26 (spec §8): non-interactive chrome painted INSIDE a
    // control, which only the widened cover can see and which DESIGN.md §1.2a's
    // scope paragraph already exempts by name.
    expect(count("inner-chrome")).toBe(10);
    expect(count("side-divider")).toBe(5);
    expect(count("focus-state-chrome")).toBe(2);
    // Zero since 2026-08-25. ShareHub was this category's only member and its
    // ledger row closed, so both elements left the residue entirely. Pinned at
    // zero rather than deleted: the category's BAR is what the next filed
    // responsive skin is measured against, and the bar cases below exercise it
    // against a constructed subject for exactly that reason.
    expect(count("responsive-skin-filed")).toBe(0);
    expect(count("filed-defect")).toBe(0);
    expect(count("literal-outline")).toBe(0);
  });

  // covers: AC-1, W11
  it("registers every live residue element and nothing that is not one, as multisets", () => {
    const registered = new Map<string, number>();
    for (const row of RESIDUE_CENSUS)
      registered.set(rowKey(row), (registered.get(rowKey(row)) ?? 0) + 1);
    const unregistered = [...LIVE.keys]
      .filter(([key, live]) => live > (registered.get(key) ?? 0))
      .map(([key]) => {
        const el = LIVE.elements.find((e) => residueKey(e, LIVE.paint) === key)!;
        return printPasteReadyRow(el, LIVE.paint);
      });
    const stale = [...registered]
      .filter(([key, held]) => held > (LIVE.keys.get(key) ?? 0))
      .map(([key]) => key);
    expect(unregistered).toEqual([]);
    expect(stale).toEqual([]);
  });

  // covers: AC-1, W15
  it("passes every row's bar against every live element sharing its key", () => {
    expect(validateCensus(RESIDUE_CENSUS, LIVE, oracle, ledger)).toEqual([]);
  });

  // covers: AC-5, W9
  it("recomputes every switch-track row's recorded ratio", () => {
    const problems = RESIDUE_CENSUS.filter((r) => r.category === "switch-track").flatMap((row) =>
      ratioProblems(row, LIVE.paint),
    );
    expect(problems).toEqual([]);
  });
});

/* ------------------------------------------------ the acceptance floor (§1.4.3) */

describe("acceptance floor: ten source mutations red, two control edits green", () => {
  // covers: AC-3
  it("no-defect baseline: an unmutated scratch copy equals the live residue", () => {
    expect(
      sameKeys(
        keysAfter(() => {}),
        LIVE.keys,
      ),
    ).toBe(true);
  });

  // covers: AC-2, W6
  it("draft escape: a track's OFF fill moved to bg-surface", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        ON_OFF,
        'on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface",',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([PT]);
  });

  // covers: AC-2, W1
  it("R1 escape: a third branch appended", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        ON_OFF,
        'disabled ? "border-border-strong bg-surface" : on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken",',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([PT]);
  });

  // covers: AC-2, W6
  it("R2 escape: the OFF branch gains a second fill", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        ON_OFF,
        'on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken bg-warning-bg",',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([PT]);
  });

  // covers: AC-2, W1
  it("R5 escape: the track moves to a nested span and the control goes plain", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        `${ON_OFF}\n      )}\n    >\n      <span\n        aria-hidden="true"\n        className={cn(`,
        '"border-border-strong bg-surface",\n      )}\n    >\n      <span aria-hidden="true" className={on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"} />\n      <span\n        aria-hidden="true"\n        className={cn(',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([PT]);
  });

  // covers: AC-2, W1
  it("a NEW control at border-border-strong, in a file the R5 registry never listed", () => {
    const keys = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("border-border-strong")),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([UNIGNORE]);
  });

  // covers: AC-2, W16
  it("a NEW control at !border-border-strong", () => {
    const keys = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("!border-border-strong")),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([UNIGNORE]);
  });

  // covers: AC-2, W16
  it("a NEW control at border-border-strong/50", () => {
    const keys = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("border-border-strong/50")),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([UNIGNORE]);
  });

  // covers: AC-2, W16
  it("a NEW control at border-t-border-strong", () => {
    const keys = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("border-t-border-strong")),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([UNIGNORE]);
  });

  // covers: AC-2, W19, W22
  it("a NEW control at the arbitrary value border-[#cfcdc7]", () => {
    const keys = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("border-[#cfcdc7]")),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([UNIGNORE]);
  });

  // covers: AC-2, W25
  it("an arbitrary property on a track's ON alternative", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        ON_OFF,
        'on ? "border-accent-edge bg-accent ![border-color:var(--color-border-strong)]" : "border-border-strong bg-surface-sunken",',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(false);
    expect(novelFiles(keys)).toEqual([PT]);
  });

  // covers: AC-2, W5
  it("CONTROL: a padding-only edit to a track stays green", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-fast",
        "relative inline-flex h-7 w-12 shrink-0 items-center gap-1 rounded-full border transition-colors duration-fast",
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(true);
  });

  // covers: AC-2, W7
  it("CONTROL: a token reorder of a track's recipe stays green", () => {
    const keys = keysAfter((root) =>
      replaceOnce(
        join(root, PT),
        ON_OFF,
        'on ? "bg-accent border-accent-edge" : "bg-surface-sunken border-border-strong",',
      ),
    );
    expect(sameKeys(keys, LIVE.keys)).toBe(true);
  });

  // covers: spec §5.6
  it("two roots with different bytes at the same relative path give different residues", () => {
    const clean = keysAfter(() => {});
    const mutated = keysAfter((root) =>
      appendTo(join(root, UNIGNORE), extraControl("border-border-strong")),
    );
    expect(sameKeys(clean, mutated)).toBe(false);
  });
});

/* ------------------------------------------------------- the cascade (§3.2) */

/** The appended `Extra` control, picked by its own recipe rather than by a line number. */
function cascadeElement(cls: string) {
  const elements = withScratchCorpus(
    (r) => appendTo(join(r, UNIGNORE), extraControl(cls)),
    (root) => scanInteractiveElements(root, WIDENED),
  );
  const el = elements.find(
    (e) => e.file === UNIGNORE && allStrings(e).some((s) => s.includes("rounded-md")),
  );
  premiseHolds(`the appended control was found for ${cls}`, el !== undefined);
  return { el: el!, paint: classify(oracle, tokensOf([el!])) };
}

describe("cascade winners, pinned by mechanism (spec §3.2)", () => {
  // covers: W18
  it("strong written first, weak second: the weak token wins by stylesheet order", () => {
    const { el, paint } = cascadeElement("border-accent-edge border-border-strong");
    expect(weakSides(el, paint)).toEqual([
      "alt0:rest:top=border-border-strong",
      "alt0:rest:right=border-border-strong",
      "alt0:rest:bottom=border-border-strong",
      "alt0:rest:left=border-border-strong",
    ]);
  });

  // covers: W18
  it("weak written first, strong second: the same winner, so class order plays no part", () => {
    const { el, paint } = cascadeElement("border-border-strong border-accent-edge");
    expect(weakSides(el, paint)).toEqual([
      "alt0:rest:top=border-border-strong",
      "alt0:rest:right=border-border-strong",
      "alt0:rest:bottom=border-border-strong",
      "alt0:rest:left=border-border-strong",
    ]);
  });

  // covers: W18
  it("an important weak token beats a strong one", () => {
    const { el, paint } = cascadeElement("border-accent-edge !border-border-strong");
    expect(weakSides(el, paint)).toEqual([
      "alt0:rest:top=!border-border-strong",
      "alt0:rest:right=!border-border-strong",
      "alt0:rest:bottom=!border-border-strong",
      "alt0:rest:left=!border-border-strong",
    ]);
  });

  // covers: W18
  it("strong at rest and weak on focus: two groups, and the focus group is residue", () => {
    const { el, paint } = cascadeElement("border-accent-edge focus:border-border-strong");
    expect(weakSides(el, paint)).toEqual([
      "alt0:focus:top=focus:border-border-strong",
      "alt0:focus:right=focus:border-border-strong",
      "alt0:focus:bottom=focus:border-border-strong",
      "alt0:focus:left=focus:border-border-strong",
    ]);
  });

  // covers: W18
  it("CONTROL: groups do not compete — the rest winner stays strong while hover goes weak", () => {
    const { el, paint } = cascadeElement("hover:border-border-strong border-accent-edge");
    expect(weakSides(el, paint)).toEqual([
      "alt0:hover:top=hover:border-border-strong",
      "alt0:hover:right=hover:border-border-strong",
      "alt0:hover:bottom=hover:border-border-strong",
      "alt0:hover:left=hover:border-border-strong",
    ]);
  });
});

/* ------------------------------------------------ the stale direction (AC-6) */

describe("the second direction: a registered element that moved", () => {
  // covers: AC-6
  it("the draft escape reds as an unregistered key AND a stale row naming PublishedToggle", () => {
    const draft = withScratchCorpus(
      (root) =>
        replaceOnce(
          join(root, PT),
          ON_OFF,
          'on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface",',
        ),
      (root) => residueOf(root, oracle),
    );
    const problems = validateCensus(RESIDUE_CENSUS, draft, oracle, ledger);
    const unregistered = problems.filter((p) => p.startsWith("unregistered: "));
    const stale = problems.filter((p) => p.startsWith("stale: "));
    expect(unregistered.filter((p) => p.includes(PT))).toHaveLength(1);
    expect(stale.filter((p) => p.includes(PT))).toHaveLength(1);
    // §3.6: the stale message prints the NEAREST live key so a token edit reads as "this row moved"
    // rather than "this row vanished". Pinned in the row's own readable shape, because the two
    // halves exist to be COMPARED and a reader cannot diff `A || B` against a JSON array. Asserted
    // by equality on the rendered tail, so a regression to `residueKey`'s JSON reds here.
    expect(stale[0]?.split("nearest live key in this file by tag: ")[1]).toBe(
      "bg-accent border border-accent-edge || bg-surface border border-border-strong",
    );
  });
});

/* --------------------------------------------------- the category bars (§1.5) */

const TRACK_REASON =
  "the OFF ring is the ruled exemption (DESIGN.md §1.2a); 1.43:1 light / 1.75:1 dark";
const constructedLedger = (body: string) =>
  `## BL-OTHER — an unrelated entry\nprose mentioning BL-TEST-ROW and ${UNIGNORE} and rgb(207 205 199)\n## BL-TEST-ROW — a constructed entry\n${body}\n## BL-NEXT — another\nx\n`;

let literalCase: { el: ScanElement; paint: Map<string, TokenPaint | null> } | null = null;
/** ONE scratch control at a literal outline, shared by the four refusals and the acceptance. */
function literalElement(): { el: ScanElement; paint: Map<string, TokenPaint | null> } {
  literalCase = literalCase ?? formOnUnignore("border-[rgb(207_205_199)]");
  return literalCase;
}
const literalRow = (category: ResidueCategory, backlogRef?: string): ResidueRow => {
  const { el, paint } = literalElement();
  const base = {
    file: UNIGNORE,
    tag: el.tag,
    paint: projectionsOf(el, paint),
    category,
    reason: "rgb(207 205 199) is the vendor widget chrome",
  };
  return backlogRef === undefined ? base : { ...base, backlogRef };
};

const SKIN_TOKENS = [
  "bg-surface",
  "border",
  "border-text-faint",
  "max-sm:border",
  "max-sm:border-border",
];
const skinPaint = () => classify(oracle, SKIN_TOKENS);

const responsiveSkin = (): ScanElement => ({
  file: "components/admin/showpage/ShareHub.tsx",
  line: 781,
  tag: "button",
  paths: [SKIN_TOKENS],
  unresolved: false,
  hasClassName: true,
  allowlisted: false,
  admittedAs: "element",
});

describe("category bars: refusals (spec §1.5, AC-4)", () => {
  const track = () => liveElement(PT);
  /**
   * A CONSTRUCTED subject, because `responsive-skin-filed` has had no live
   * member since 2026-08-25: ShareHub was the only one and its ledger row
   * closed (`BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT`), so both of its
   * elements now carry `max-sm:border-text-faint` and are not residue at all.
   *
   * The bar still has to work — it is what the next filed responsive skin will
   * be measured against — and a bar with no subject is a bar that quietly stops
   * being exercised. `rowFor` builds the row from this element's projections,
   * so the shape below is the whole fixture: a weak token that DOES carry a
   * responsive variant, which is the precondition the category's bar checks
   * before it looks at the backlogRef.
   */
  const skipLink = () => liveElement("app/help/layout.tsx");
  const divider = () => liveElement("components/admin/showpage/AttentionMenu.tsx");

  /**
   * `inner-chrome` (spec §8): non-interactive chrome painted INSIDE a control.
   *
   * Its bar is two halves. The FORM half is the same pair `switch-track`
   * already demands, a §1.2a citation and a recorded ratio, and it is form
   * because whether a painted child is chrome or the control's own visual is a
   * RULING, exactly like trackness, which this module may not grow a predicate
   * for. The STRUCTURAL half is the one with teeth: the live element must have
   * been admitted as a painted child, so a real control cannot be parked here.
   *
   * The subject is CONSTRUCTED for the same reason the responsive-skin one is:
   * these cases must exercise the bar itself, not whichever live row happens to
   * exist today.
   */
  const CHROME_REASON =
    "a status chip inside the control, not its boundary (DESIGN.md §1.2a); 1.27:1 light / 1.27:1 dark";
  const chromeElement = (over: Partial<ScanElement> = {}): ScanElement => ({
    file: "components/admin/Constructed.tsx",
    line: 1,
    tag: "span",
    paths: [["rounded-pill border border-border bg-surface px-2"]],
    unresolved: false,
    hasClassName: true,
    allowlisted: false,
    admittedAs: "painted-child",
    ...over,
  });
  const chromeRow = (over: Partial<ResidueRow> = {}): ResidueRow => ({
    file: "components/admin/Constructed.tsx",
    tag: "span",
    paint: ["bg-surface border border-border"],
    category: "inner-chrome",
    reason: CHROME_REASON,
    ...over,
  });

  // covers: AC-8
  it("accepts a well-formed inner-chrome row on a painted child", () => {
    expect(validateRow(chromeRow(), chromeElement(), oracle, ledger)).toEqual([]);
  });

  // covers: AC-8
  it("REFUSES an inner-chrome row whose live element is in scope on its own", () => {
    // The teeth: a real control parked as chrome. Nothing about the ROW
    // differs, which is the point - only the element does.
    expect(
      validateRow(chromeRow(), chromeElement({ admittedAs: "element" }), oracle, ledger),
    ).toEqual([
      "components/admin/Constructed.tsx: inner-chrome element is in scope on its own; it is a control, not chrome inside one",
    ]);
  });

  // covers: AC-8
  it("refuses an inner-chrome reason that does not cite the ruling", () => {
    expect(
      validateRow(
        chromeRow({ reason: "a status chip inside the control; 1.27:1 light / 1.27:1 dark" }),
        chromeElement(),
        oracle,
        ledger,
      ),
    ).toEqual(["components/admin/Constructed.tsx: inner-chrome reason must cite DESIGN.md §1.2a"]);
  });

  // covers: AC-8
  it("refuses an inner-chrome reason that records no ratio", () => {
    expect(
      validateRow(
        chromeRow({ reason: "a status chip inside the control (DESIGN.md §1.2a)" }),
        chromeElement(),
        oracle,
        ledger,
      ),
    ).toEqual([
      "components/admin/Constructed.tsx: inner-chrome reason must record the ratio as n.nn:1 light / n.nn:1 dark",
    ]);
  });

  // covers: AC-4, W8
  it("refuses a switch-track row with three render alternatives", () => {
    const row: ResidueRow = {
      file: PT,
      tag: "button",
      paint: [
        "bg-accent border border-accent-edge",
        "bg-surface-sunken border border-border-strong",
        "bg-surface border border-border-strong",
      ],
      category: "switch-track",
      reason: TRACK_REASON,
    };
    expect(validateRow(row, track(), oracle, ledger)).toEqual([
      `${PT}: switch-track needs exactly two render alternatives, has 3`,
    ]);
  });

  // covers: AC-5, W9
  it("refuses a half-swapped track where BOTH alternatives are weak, rather than picking one", () => {
    // `ratioProblems` used to take the FIRST alternative carrying any weak declaration. The
    // alternatives are SORTED, so "first" is a lexical accident that happens to be the OFF state
    // only while exactly one alternative is weak. The ordinary fence edit
    // `border-accent-edge` -> `border-border-strong` makes BOTH weak, and the check then validated
    // the row against the ON state: a reason stating the ON ratio passed, silently, while claiming
    // to record the OFF ring (diff round 1, CORE F2).
    //
    // The repair does NOT guess harder. Nothing in the projection positively marks which
    // alternative is OFF - the bar itself says both carry one fill and one outline - so inventing a
    // discriminator ("the one whose fill is not the accent") would hardcode a colour the rulings do
    // not name. It declines to identify an OFF state it cannot identify, and says so.
    //
    // The stated ratio is DERIVED from the ON pair rather than typed, so the case cannot rot into
    // asserting a number the theme no longer produces.
    const on = recordedRatio("border-strong", "accent", css);
    const halfSwapped: ResidueRow = {
      file: PT,
      tag: "button",
      paint: [
        "bg-accent border border-border-strong",
        "bg-surface-sunken border border-border-strong",
      ],
      category: "switch-track",
      reason: `the OFF ring is the ruled exemption (DESIGN.md §1.2a); ${on.light.toFixed(2)}:1 light / ${on.dark.toFixed(2)}:1 dark`,
    };
    expect(ratioProblems(halfSwapped, LIVE.paint)).toEqual([
      `${PT}: 2 alternatives carry a weak outline, so the OFF state is not identifiable`,
    ]);

    // Paired per §5.4: the UNEDITED track still recomputes clean, so the repair cannot pass by
    // reporting ambiguity unconditionally.
    const unedited: ResidueRow = {
      ...halfSwapped,
      paint: [
        "bg-accent border border-accent-edge",
        "bg-surface-sunken border border-border-strong",
      ],
      reason: TRACK_REASON,
    };
    expect(ratioProblems(unedited, LIVE.paint)).toEqual([]);
  });

  // covers: AC-4, W8
  it("refuses a switch-track alternative carrying two fills (the R2 shape)", () => {
    const row: ResidueRow = {
      file: PT,
      tag: "button",
      paint: [
        "bg-accent border border-accent-edge",
        "bg-surface-sunken bg-warning-bg border border-border-strong",
      ],
      category: "switch-track",
      reason: TRACK_REASON,
    };
    expect(validateRow(row, track(), oracle, ledger)).toEqual([
      `${PT}: switch-track alternative must carry exactly one fill and one outline colour declaration, has fills=2 outlines=1 (bg-surface-sunken bg-warning-bg border border-border-strong)`,
    ]);
  });

  // covers: AC-4, W8
  it("refuses a side-divider alternative carrying a bare border beside border-b", () => {
    const file = "components/admin/showpage/AttentionMenu.tsx";
    const row: ResidueRow = {
      file,
      tag: "button",
      paint: ["border border-b border-border"],
      category: "side-divider",
      reason: "border-b separates menu rows",
    };
    expect(validateRow(row, divider(), oracle, ledger)).toEqual([
      `${file}: side-divider alternative carries a border token outside the divider accept-set: border`,
    ]);
  });

  // covers: AC-4, W8
  it("refuses a focus-state-chrome row whose weak token carries no focus variant", () => {
    const file = "app/help/layout.tsx";
    const row: ResidueRow = {
      file,
      tag: "a",
      paint: ["border border-border-strong"],
      category: "focus-state-chrome",
      reason: "the focus-visible ring carries the indication",
    };
    expect(validateRow(row, skipLink(), oracle, ledger)).toEqual([
      `${file}: focus-state-chrome weak token lacks a focus variant: border-border-strong`,
    ]);
  });

  // covers: AC-4, W12
  it("refuses a responsive-skin-filed row whose backlogRef resolves to nothing", () => {
    const el = responsiveSkin();
    const row = rowFor(
      el,
      "responsive-skin-filed",
      "the phone skin is filed",
      "BL-NO-SUCH-ENTRY",
      skinPaint(),
    );
    expect(validateRow(row, el, oracle, ledger)).toEqual([
      `${el.file}: backlogRef BL-NO-SUCH-ENTRY does not resolve to a ledger heading`,
    ]);
  });

  // covers: AC-4, W12
  it("refuses a responsive-skin-filed row whose entry does not name its file", () => {
    const el = responsiveSkin();
    const row = rowFor(
      el,
      "responsive-skin-filed",
      "the phone skin is filed",
      "BL-TEST-ROW",
      skinPaint(),
    );
    expect(validateRow(row, el, oracle, constructedLedger("a body about something else"))).toEqual([
      `${el.file}: backlogRef BL-TEST-ROW resolves but its entry does not name this file`,
    ]);
  });

  // covers: AC-4, W8
  it("refuses a filed-defect row with a blank reason", () => {
    const el = liveElement("components/admin/BellPanel.tsx");
    const row = rowFor(el, "filed-defect", "   ", "BL-TEST-ROW");
    expect(
      validateRow(row, el, oracle, constructedLedger(`the defect lives in ${el.file}`)),
    ).toEqual([`${el.file}: reason is blank`]);
  });

  // covers: AC-4, W23
  it("refuses a literal-outline row with an echo-only reason and no backlogRef", () => {
    expect(validateRow(literalRow("literal-outline"), literalElement().el, oracle, ledger)).toEqual(
      [
        `${UNIGNORE}: replace rgb(207 205 199) with a theme token, or file the literal as a BL-/DEF- entry and cite it (literal-outline requires backlogRef)`,
      ],
    );
  });

  // covers: AC-4, W23
  it("refuses a literal-outline row whose entry names the file but not the value", () => {
    expect(
      validateRow(
        literalRow("literal-outline", "BL-TEST-ROW"),
        literalElement().el,
        oracle,
        constructedLedger(`the vendor chrome in ${UNIGNORE}`),
      ),
    ).toEqual([
      `${UNIGNORE}: backlogRef BL-TEST-ROW resolves but its entry does not name the compiled value rgb(207 205 199)`,
    ]);
  });

  // covers: AC-4, W23
  it("refuses a literal-outline row whose entry names the value but not the file", () => {
    expect(
      validateRow(
        literalRow("literal-outline", "BL-TEST-ROW"),
        literalElement().el,
        oracle,
        constructedLedger("rgb(207 205 199) is the vendor chrome"),
      ),
    ).toEqual([
      `${UNIGNORE}: backlogRef BL-TEST-ROW resolves but its entry does not name this file`,
    ]);
  });

  // covers: AC-4, W22, W23
  it("refuses a literal registered under any other category, repair first", () => {
    expect(
      validateRow(
        literalRow("filed-defect", "BL-TEST-ROW"),
        literalElement().el,
        oracle,
        constructedLedger(`the vendor chrome in ${UNIGNORE} is rgb(207 205 199)`),
      ),
    ).toEqual([
      `${UNIGNORE}: replace rgb(207 205 199) with a theme token; a literal outline is registered only as literal-outline`,
    ]);
  });

  // covers: AC-4, W12
  it("a backlogRef must match the WHOLE id, not a prefix of a longer entry", () => {
    // Six strict-prefix pairs are live in the ledger today (BL-OPS-LOG before three BL-OPS-LOG-*
    // rows, and four more), so a resolver anchored on \b resolves the SHORT ref against the LONG
    // entry and then reads that entry's body for the names-this-file check. That is a false PASS
    // whenever the wrong entry happens to name the file, which is a silent wrong clear rather than
    // a conservative one. Paired: the same ref against a ledger that really declares it resolves.
    const el = liveElement("components/admin/BellPanel.tsx");
    const row = rowFor(el, "filed-defect", "a genuine weak resting outline, filed", "BL-PREFIX");
    const onlyTheChild = `## BL-PREFIX-CHILD — a longer id sharing the prefix\nthe defect lives in ${el.file}\n## BL-NEXT — another\nx\n`;
    const theRefItself = `## BL-PREFIX — the id actually cited\nthe defect lives in ${el.file}\n## BL-NEXT — another\nx\n`;
    expect(validateRow(row, el, oracle, onlyTheChild)).toEqual([
      `${el.file}: backlogRef BL-PREFIX does not resolve to a ledger heading`,
    ]);
    expect(validateRow(row, el, oracle, theRefItself)).toEqual([]);
  });

  // covers: AC-4
  it("refuses a row whose category is not one of the six", () => {
    const el = track();
    const row = {
      ...rowFor(el, "switch-track", TRACK_REASON),
      category: "denylisted" as ResidueCategory,
    };
    expect(validateRow(row, el, oracle, ledger)).toEqual([`${PT}: unknown category denylisted`]);
  });
});

describe("category bars: acceptances, each one variable from a refusal (AC-4)", () => {
  // covers: AC-4
  it("accepts the three live switch tracks", () => {
    const tracks = [
      PT,
      "components/admin/settings/AutoPublishToggle.tsx",
      "components/admin/settings/NotifyToggle.tsx",
    ];
    const problems = tracks.flatMap((file) => {
      const el = liveElement(file);
      return validateRow(rowFor(el, "switch-track", TRACK_REASON), el, oracle, ledger);
    });
    expect(problems).toEqual([]);
  });

  // covers: AC-4
  it("accepts AttentionMenu's divider, last:border-b-0 included", () => {
    const el = liveElement("components/admin/showpage/AttentionMenu.tsx");
    const row = rowFor(
      el,
      "side-divider",
      "border-b separates the menu rows; the last row drops it",
    );
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
  });

  // covers: AC-4, W13
  it("accepts a skip link whose ring sits outside the paint projection", () => {
    const el = liveElement("app/help/layout.tsx");
    const row = rowFor(
      el,
      "focus-state-chrome",
      "focus-visible:ring-2 carries the focus indication",
    );
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
  });

  // covers: AC-4, W12
  /**
   * The acceptance twin of the two refusals above, on the same constructed
   * subject and for the same reason: this category has no live member since
   * 2026-08-25. It cites a ledger entry that still exists and still names the
   * file, so it differs from each refusal in exactly one variable.
   */
  // covers: AC-4, W12
  it("accepts a responsive-skin row whose constructed entry names its file", () => {
    const el = responsiveSkin();
    const row = rowFor(
      el,
      "responsive-skin-filed",
      "the phone skin's weight is filed and fenced",
      "BL-TEST-ROW",
      skinPaint(),
    );
    expect(
      validateRow(row, el, oracle, constructedLedger(`the phone skin lives in ${el.file}`)),
    ).toEqual([]);
  });

  // covers: AC-4, W12
  it("accepts a filed-defect row whose constructed entry names its file", () => {
    const el = liveElement("components/admin/BellPanel.tsx");
    const row = rowFor(el, "filed-defect", "a genuine weak resting outline, filed", "BL-TEST-ROW");
    expect(
      validateRow(row, el, oracle, constructedLedger(`the defect lives in ${el.file}`)),
    ).toEqual([]);
  });

  // covers: AC-4, W23
  it("accepts a literal-outline row whose entry names both the file and the value", () => {
    expect(
      validateRow(
        literalRow("literal-outline", "BL-TEST-ROW"),
        literalElement().el,
        oracle,
        constructedLedger(`${UNIGNORE} carries rgb(207 205 199), the vendor widget chrome`),
      ),
    ).toEqual([]);
  });
});

describe("the one derived number (AC-5)", () => {
  // covers: AC-5, W9
  it("recomputes the switch tracks' OFF ring at 1.43:1 light and 1.75:1 dark", () => {
    const actual = recordedRatio("border-strong", "surface-sunken", css);
    expect(actual.light).toBeCloseTo(1.43, 2);
    expect(actual.dark).toBeCloseTo(1.75, 2);
  });

  // covers: AC-5, W9
  it("refuses a row stating 1.59:1 / 1.60:1 for those same tokens", () => {
    const el = liveElement(PT);
    const row = rowFor(el, "switch-track", "DESIGN.md §1.2a; 1.59:1 light / 1.60:1 dark");
    expect(ratioProblems(row, LIVE.paint)).toEqual([
      `${PT}: light ratio recomputes to 1.43, row says 1.59`,
      `${PT}: dark ratio recomputes to 1.75, row says 1.60`,
    ]);
  });
});

/* ------------------------------------------- paired fixtures (§5.4, §5.5) */

function fixtureResidue(source: string) {
  const found = scanFixture(source);
  const paint = classify(oracle, tokensOf(found));
  return { found, paint, residue: found.filter((e) => isResidue(e, paint)) };
}

const twoButtons = (first: string, second: string, firstAttrs = "") =>
  `export function Fx() {\n  return (\n    <>\n      <button ${firstAttrs}className="${first}">one</button>\n      <button className="${second}">two</button>\n    </>\n  );\n}\n`;

describe("paired fixtures: every expect-clean case sits beside a report (§5.4)", () => {
  // covers: W4, W21
  it("a typo is not residue while a token one character longer is", () => {
    const { found, residue } = fixtureResidue(
      twoButtons("border border-borde bg-surface", "border border-border-strong/50 bg-surface"),
    );
    premise("fixture produced both elements", found.length, 1);
    expect(residue.map((e) => allStrings(e).join(" "))).toEqual([
      "border border-border-strong/50 bg-surface",
    ]);
  });

  // covers: W4, W22
  it("every CSS border shorthand is classified, not just the -color longhands", () => {
    // The recognizer reads a COMPILED property name. `border: 1px solid var(--color-border-strong)`
    // paints the named weak colour on all four sides under a property that does not end in
    // `-color`, so a recognizer keyed to the longhand sees a token that is IN the key (its `props`
    // are non-empty, so it shapes the residue key) yet contributes no weak side. That is a SILENT
    // WRONG CLEAR, the one outcome the consequence bound forbids, and it is reachable by an
    // ordinary contributor writing an arbitrary-value class.
    //
    // Paired per §5.4: each property is asserted BOTH ways in one fixture, so the case cannot pass
    // on a recognizer that simply calls everything residue.
    const FAMILY = [
      "border",
      "border-top",
      "border-right",
      "border-bottom",
      "border-left",
      "border-inline",
      "border-inline-start",
      "border-inline-end",
      "border-block",
      "border-block-start",
      "border-block-end",
    ];
    const rows = FAMILY.map((prop) => {
      const weak = `[${prop}:1px_solid_var(--color-border-strong)]`;
      const strong = `[${prop}:1px_solid_var(--color-surface-raised)]`;
      const { found, residue } = fixtureResidue(
        twoButtons(`${weak} bg-surface`, `${strong} bg-surface`),
      );
      premise(`${prop}: fixture produced both elements`, found.length, 1);
      return [
        prop,
        residue.map((e) => (allStrings(e).join(" ").includes(weak) ? "weak" : "strong")),
      ] as const;
    });
    expect(rows).toEqual(FAMILY.map((prop) => [prop, ["weak"]]));
  });

  // covers: W10
  it("a token in a comment is not residue while its twin in a className is", () => {
    const source = `export function Fx() {\n  return (\n    <>\n      {/* border-border-strong lives only in this comment */}\n      <button className="border border-text-faint bg-surface">one</button>\n      <button className="border border-border bg-surface">two</button>\n    </>\n  );\n}\n`;
    const { found, residue } = fixtureResidue(source);
    premise("fixture produced both elements", found.length, 1);
    expect(residue.map((e) => allStrings(e).join(" "))).toEqual([
      "border border-border bg-surface",
    ]);
  });

  // covers: W10
  it("a token in a data attribute is not residue while its twin in a className is", () => {
    const { found, residue } = fixtureResidue(
      twoButtons(
        "border border-text-faint bg-surface",
        "border border-border bg-surface",
        'data-x="border-border-strong" ',
      ),
    );
    premise("fixture produced both elements", found.length, 1);
    expect(residue.map((e) => allStrings(e).join(" "))).toEqual([
      "border border-border bg-surface",
    ]);
  });

  // covers: W10
  it("a div carrying the recipe is outside the cover while the button beside it is inside", () => {
    // This fixture states its OWN premise: the scanner admits the button and omits the div by
    // design (`isInScope`), so the two-element premise the other fixtures use cannot apply here.
    const source = `export function Fx() {\n  return (\n    <>\n      <div className="border border-border-strong bg-surface">one</div>\n      <button className="border border-border-strong bg-surface">two</button>\n    </>\n  );\n}\n`;
    premise("fixture source carries both tags", (source.match(/<(div|button) /g) ?? []).length, 1);
    const { found, residue } = fixtureResidue(source);
    expect(found).toHaveLength(1);
    expect(found[0]?.tag).toBe("button");
    expect(residue).toHaveLength(1);
  });

  // covers: W10
  it("a token behind a literal false && branch is residue, the conservative direction", () => {
    const source = `export function Fx() {\n  return <button className={false && "border border-border-strong bg-surface"}>one</button>;\n}\n`;
    const { residue } = fixtureResidue(source);
    expect(residue).toHaveLength(1);
  });

  // covers: W3
  it("a responsive variant and a bare token are both residue, under different keys", () => {
    const { found, paint, residue } = fixtureResidue(
      twoButtons(
        "border sm:border-border-strong bg-surface",
        "border border-border-strong bg-surface",
      ),
    );
    premise("fixture produced both elements", found.length, 1);
    expect(residue).toHaveLength(2);
    expect(residueKey(residue[0]!, paint)).not.toBe(residueKey(residue[1]!, paint));
  });

  // covers: W10
  it("an unresolvable className whose readable string carries the token is residue", () => {
    const source = `export function Fx({ extra }: { extra: string }) {\n  const cls = \`\${extra} border border-border-strong bg-surface\`;\n  return (\n    <>\n      <button className={cls}>one</button>\n      <button className="border border-text-faint bg-surface">two</button>\n    </>\n  );\n}\n`;
    const { found, residue } = fixtureResidue(source);
    premise("fixture produced both elements", found.length, 1);
    expect(residue).toHaveLength(1);
    expect(residue[0]?.unresolved).toBe(true);
  });

  // covers: W11
  it("two identical weak controls in one file are one key with multiplicity two", () => {
    const { found, paint, residue } = fixtureResidue(
      twoButtons("border border-border bg-surface", "border border-border bg-surface"),
    );
    premise("fixture produced both elements", found.length, 1);
    expect(residue).toHaveLength(2);
    expect(new Set(residue.map((e) => residueKey(e, paint))).size).toBe(1);
  });
});

/* ----------------------------------------------- the grammar (AC-13, §3.2, §3.3) */

/** Spec §3.2's two tables, verbatim: twenty-eight residue forms and four controls. */
const FORMS: ReadonlyArray<readonly [string, boolean]> = [
  ["!border-border", true],
  ["border-border!", true],
  ["!border-border-strong", true],
  ["border-border-strong!", true],
  ["focus:!border-border", true],
  ["focus:border-border!", true],
  ["sm:border-border-strong", true],
  ["[&:hover]:border-border", true],
  ["border-border/50", true],
  ["border-border-strong/50", true],
  ["focus:border-border-strong/50", true],
  ["max-sm:border-border/50", true],
  ["!border-border-strong/50", true],
  ["border-border-strong/50!", true],
  ["border-border-strong/[.5]", true],
  ["sm:!border-border/25", true],
  ["border-t-border-strong", true],
  ["border-x-border/50", true],
  ["border-[#cfcdc7]", true],
  ["border-(--color-border-strong)", true],
  ["border-borde", false],
  ["border-text-faint/50", false],
  ["border-[rgb(207_205_199)]", true],
  ["border-[rgb(207,205,199)]", true],
  ["border-[hsl(40_8%_80%)]", true],
  ["border-[oklch(0.5_0_0)]", true],
  ["border-[#000]", true],
  ["border-current", true],
  ["border-(--custom-thing)", true],
  ["border-[var(--color-border-strong)]", true],
  ["border-transparent", false],
  ["border-warning-text/60", false],
];

/** §3.2's second table: the compiled value, and the class the oracle gives it. */
const VALUE_CLASSES: ReadonlyArray<readonly [string, ReturnType<typeof classifyValue>]> = [
  ["rgb(207 205 199)", "unclassified"],
  ["rgb(207,205,199)", "unclassified"],
  ["hsl(40 8% 80%)", "unclassified"],
  ["oklch(0.5 0 0)", "unclassified"],
  ["#000", "unclassified"],
  ["currentcolor", "unclassified"],
  ["var(--custom-thing)", "unclassified"],
  ["var(--color-border-strong)", "weak"],
  ["transparent", "none"],
  ["color-mix(in oklab, var(--color-warning-text) 60%, transparent)", "strong"],
];

describe("the grammar the module does not model (AC-13)", () => {
  // covers: AC-13, W14
  it("the projection's normaliser agrees with the shipped one on every live residue token", () => {
    const tokens = LIVE.elements.flatMap((el) =>
      allStrings(el).flatMap((s) => s.split(/\s+/).filter(Boolean)),
    );
    premise("live residue elements carry tokens to compare", tokens.length, 0);
    const disagreements = tokens.filter((t) => utilityOf(t) !== normalizeToken(t));
    expect(disagreements).toEqual([]);
  });

  // covers: AC-13, W16, W22
  it("classifies all thirty-two forms as the spec's tables state, one scratch root each", (ctx) => {
    // Skipped from INSIDE the body, not with `it.skipIf`, and the difference is load-bearing: the
    // coverage-map totality case below matches lines starting with `it(`, so `it.skipIf(...)(` would
    // drop this case out of the map entirely and the suite would stop requiring it to carry a
    // `// covers:` line. Reported as skipped either way.
    if (UNDER_MUTATION) ctx.skip();
    // Reading `MUTATION_MUTANT` above makes this case environment-touching to the premise
    // classifier, and the contract for such a case is that it proves its input arrived. The honest
    // premise is non-vacuity of the table it is named for: a FORMS that shrank to nothing would
    // otherwise let this case pass by asserting two empty lists against each other.
    premise("the thirty-two forms are present to classify", FORMS.length, 31);
    // 120s rather than the default 30s, declared at the end of this call. The case builds
    // THIRTY-TWO scratch roots at ~11 MB each and they cannot be shared: the scanner caches parsed
    // files by absolute path and never invalidates (spec §5.6), so a second form read under a
    // reused root would be answered from the first form's cache and this case would assert
    // thirty-two times against one parse. Scoped, the whole file runs in ~33s and this case sits
    // well inside the default; under a full-suite run competing for I/O it crossed 30s, and CI
    // runs the full suite, so the default was a latent red on a REQUIRED context rather than a
    // slow test. The limit is patience, not a weaker assertion — every expectation is unchanged.
    //
    // The explanation lives INSIDE the body deliberately: `// covers:` must be the line directly
    // above the `it(`, and putting these lines between them made the coverage-map totality case
    // report this one as unmapped.
    const verdicts = FORMS.map(([form, expected]) => {
      const { el, paint } = formOnUnignore(form);
      const residue = isResidue(el, paint);
      const projected =
        !expected || el.paths.some((p) => paintProjection(p, paint).split(" ").includes(form));
      return [form, residue, projected] as const;
    });
    expect(verdicts.map(([form, residue]) => [form, residue])).toEqual(
      FORMS.map(([form, expected]) => [form, expected]),
    );
    expect(verdicts.filter(([, , projected]) => !projected).map(([form]) => form)).toEqual([]);
  }, 120_000);

  // covers: AC-13, W22
  it("gives each compiled value of the second table the class the table states", () => {
    expect(VALUE_CLASSES.map(([value]) => [value, classifyValue(value)])).toEqual(
      VALUE_CLASSES.map(([value, klass]) => [value, klass]),
    );
  });

  // covers: AC-13, W24
  it("a non-compiling paint-prefixed token keeps the key; a compiling one changes it", () => {
    const liveKey = residueKey(liveElement(PT), LIVE.paint);
    const co = ["border-borde", "bg-bogus", "border-border-strong!!", "bg-surface", "border-2"].map(
      (extra) => {
        const { el, paint } = extraOnToggle("off", extra);
        return [extra, residueKey(el, paint) !== liveKey] as const;
      },
    );
    expect(co).toEqual([
      ["border-borde", false],
      ["bg-bogus", false],
      ["border-border-strong!!", false],
      ["bg-surface", true],
      ["border-2", true],
    ]);
  });

  // covers: AC-13, W25
  it("key membership is by compiled declaration, not by token prefix", () => {
    const liveKey = residueKey(liveElement(PT), LIVE.paint);
    const membership = [
      "![border-color:var(--color-border-strong)]",
      "[border-color:var(--color-border-strong)]",
      "[background:red]",
      "[border-top-color:#cfcdc7]",
      "[border:1px_solid_var(--color-border)]",
      "sr-only",
      "rounded-full",
      "divide-border",
      "ring-border",
      "outline-border",
      "shadow-sm",
    ].map((extra) => {
      const { el, paint } = extraOnToggle("on", extra);
      return [extra, residueKey(el, paint) !== liveKey] as const;
    });
    expect(membership).toEqual([
      ["![border-color:var(--color-border-strong)]", true],
      ["[border-color:var(--color-border-strong)]", true],
      ["[background:red]", true],
      ["[border-top-color:#cfcdc7]", true],
      ["[border:1px_solid_var(--color-border)]", true],
      ["sr-only", true],
      ["rounded-full", false],
      ["divide-border", false],
      ["ring-border", false],
      ["outline-border", false],
      ["shadow-sm", false],
    ]);
  });

  // covers: AC-13, W26
  it("the key and the oracle read ONE selector rule and agree on all ten variant roots", () => {
    const liveKey = residueKey(liveElement(PT), LIVE.paint);
    const rows = [
      "in-hover:border-border-strong",
      "group-hover:border-border-strong",
      "peer-checked:border-border-strong",
      "hover:border-border-strong",
      "*:border-border-strong",
      "**:border-border-strong",
      "divide-border",
      "has-[:checked]:border-border-strong",
      "[&>span]:border-border-strong",
      "[&:hover]:border-border-strong",
    ].map((extra) => {
      const { el, paint } = extraOnToggle("on", extra);
      return [
        extra,
        residueKey(el, paint) !== liveKey,
        weakSides(el, paint).some((h) => h.startsWith("alt0:")),
      ] as const;
    });
    expect(rows).toEqual([
      ["in-hover:border-border-strong", true, true],
      ["group-hover:border-border-strong", true, true],
      ["peer-checked:border-border-strong", true, true],
      ["hover:border-border-strong", true, true],
      ["*:border-border-strong", false, false],
      ["**:border-border-strong", false, false],
      ["divide-border", false, false],
      ["has-[:checked]:border-border-strong", true, true],
      ["[&>span]:border-border-strong", false, false],
      ["[&:hover]:border-border-strong", true, true],
    ]);
  });
});

/* -------------------------------------- planted defect, different producer (AC-16) */

describe("a defect planted in the theme, not in the module (AC-16)", () => {
  // covers: AC-16, W20
  it("an oracle blind to the weak colour drops the residue to the ten border-border elements", async () => {
    const broken = css.replace(/^\s*--color-border-strong:.*$/m, "");
    premise("the declaration was removed", css.length - broken.length, 1);
    const dir = mkdtempSync(join(tmpdir(), "control-outline-residue-theme-"));
    // `loadOracle` reads the stylesheet once and builds the design system in memory, so the copy on
    // disk is finished with the moment it resolves and the directory can go immediately.
    // `finally` rather than a bare statement, matching this file's own helper above: a throw between
    // the mkdtemp and the removal leaks the root, and a cleanup that only runs on the success path
    // leaks exactly when a case is failing. Guard: tests/mutation/_metaScratchRootCleanup.test.ts.
    let blind;
    try {
      const brokenPath = join(dir, "globals.css");
      writeFileSync(brokenPath, broken);
      blind = await loadOracle(brokenPath);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(classify(blind, ["border-border-strong"]).get("border-border-strong")).toBeNull();

    const under = residueOf(ROOT, blind);
    // Ten since 2026-08-26, not five: the widened cover admits five more
    // elements whose only weak token is `border-border`, all of them registered
    // `inner-chrome`. The four the SWEEP moved are absent here for the right
    // reason - they now carry `border-text-faint`, which this blinded oracle
    // still classifies perfectly well.
    expect(under.elements.map((e) => `${e.file}:${e.line}`).sort()).toEqual([
      "components/admin/BellPanel.tsx:1221",
      "components/admin/IgnoredSheetsDisclosure.tsx:97",
      "components/admin/RecentAutoAppliedStrip.tsx:447",
      "components/admin/RecentAutoAppliedStrip.tsx:474",
      "components/admin/ShowsTable.tsx:288",
      "components/admin/nav/AdminNav.tsx:154",
      "components/admin/showpage/AttentionMenu.tsx:189",
      "components/admin/telemetry/EventFilters.tsx:97",
      "components/admin/wizard/step3ReviewSections.tsx:2435",
      "components/crew/primitives/KeyTimesStrip.tsx:191",
    ]);

    const stale = validateCensus(RESIDUE_CENSUS, under, blind, ledger).filter((p) =>
      p.startsWith("stale: "),
    );
    // Every row whose paint is `border-strong` goes stale, which is the whole
    // point of blinding the oracle to that colour. Eleven since 2026-08-26:
    // the original five, plus the two nested switch tracks the widened cover
    // admitted and the four `warning-bg` alert banners.
    expect(stale.map((p) => p.slice("stale: ".length).split(" ")[0]).sort()).toEqual([
      "app/help/errors/page.tsx",
      "app/help/layout.tsx",
      "components/admin/ArchiveShowButton.tsx",
      "components/admin/ArchiveShowButton.tsx",
      "components/admin/IgnoredSheetsDisclosure.tsx",
      "components/admin/PublishedToggle.tsx",
      "components/admin/UnarchiveShowButton.tsx",
      "components/admin/settings/AutoPublishToggle.tsx",
      "components/admin/settings/DeveloperToggleButton.tsx",
      "components/admin/settings/NotifyToggle.tsx",
      "components/admin/telemetry/AutoRefreshControl.tsx",
    ]);
  });
});

/* ------------------------------------------- per-occurrence evaluation (AC-14) */

describe("a key shared by two elements is evaluated per occurrence (§3.4)", () => {
  // covers: AC-14, W15
  it("reds on the ringless jump-list anchor while the skip link above it passes", () => {
    const JUMP_ANCHOR = "<a href={`#${family.id}`}>{family.title}</a>";
    const errors = "app/help/errors/page.tsx";
    const under = withScratchCorpus(
      (r) =>
        replaceOnce(
          join(r, errors),
          JUMP_ANCHOR,
          '<a href={`#${family.id}`} className="sr-only focus:border focus:border-border-strong focus:bg-surface-raised focus-visible:outline-none">{family.title}</a>',
        ),
      (root) => residueOf(root, oracle),
    );
    const shared = under.elements.filter((e) => e.file === errors);
    premise("the mutation produced a second element in that file", shared.length, 1);
    expect(new Set(shared.map((e) => residueKey(e, under.paint))).size).toBe(1);

    const row: ResidueRow = {
      file: errors,
      tag: "a",
      paint: projectionsOf(shared[0]!, under.paint),
      category: "focus-state-chrome",
      reason: "focus-visible:ring-2 carries the focus indication",
    };
    const byLine = shared
      .slice()
      .sort((a, b) => a.line - b.line)
      .map((el) => [el.line, validateRow(row, el, oracle, ledger)] as const);
    expect(byLine).toEqual([
      [70, []],
      [82, [`${errors}:82: focus-state-chrome element lacks a focus ring token`]],
    ]);
  });
});

/* --------------------------------------- the shipped pins, cross-asserted (§3.7) */

describe("the census cannot disagree with the pins beside it", () => {
  // covers: AC-8, W1
  it("every DIVIDERS row resolves to a side-divider residue row", () => {
    // By ELEMENT and by KEY, never by file: keying this on the file alone is W1, the weakness this
    // suite's own table names. A refactor that moved the divider's token onto a different element
    // in the same file would satisfy a file-level check while the row it names no longer resolves.
    const byKey = new Map(RESIDUE_CENSUS.map((r) => [rowKey(r), r] as const));
    const problems = DIVIDERS.map((d) => {
      const el = LIVE.elements.find((e) => e.file === d.file && e.line === d.line);
      if (el === undefined) return `${d.file}:${d.line} is not a live residue element`;
      const row = byKey.get(residueKey(el, LIVE.paint));
      if (row === undefined) return `${d.file}:${d.line} resolves to no registered row`;
      return row.category === "side-divider"
        ? null
        : `${d.file}:${d.line} is registered ${row.category}, not side-divider`;
    }).filter((problem) => problem !== null);
    expect(problems).toEqual([]);
  });

  // covers: AC-12
  /**
   * The two censuses no longer overlap at all, and that is the 2026-08-25
   * repair rather than a lost pin.
   *
   * ShareHub's line 781 was the single overlap: an element the swap census held
   * (its desktop rest state moved with the 21) that was ALSO residue (its phone
   * skin stayed weak). Closing `BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT`
   * removed the second half, so the element is now only a swap row.
   *
   * Asserted as an empty overlap rather than deleted, because "these two
   * censuses are disjoint" is a real claim about the pair and the next element
   * that lands in both should have to say so out loud.
   */
  // covers: AC-12
  it("the residue and the swap census are now disjoint", () => {
    const overlap = LIVE.elements.filter((el) =>
      CENSUS.some((row) => row.file === el.file && row.line === el.line),
    );
    expect(overlap.map((el) => `${el.file}:${el.line}`)).toEqual([]);
  });
});

/* ------------------------------------------------------ the suite about itself */

describe("this suite", () => {
  // covers: spec §5
  it("maps every case to the weaker implementation or criterion it exists for", () => {
    const lines = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
    const cases = lines
      .map((line, i) => [line.trim(), i] as const)
      .filter(([line]) => line.startsWith("it("));
    premise("the suite holds cases to map", cases.length, 20);
    const unmapped = cases
      .filter(([, i]) => !/\/\/ covers: (W\d+|AC-\d+|spec §)/.test(lines[i - 1] ?? ""))
      .map(([line]) => line.slice(0, 60));
    expect(unmapped).toEqual([]);
  });
});

/* ------------------------------------------- gaps the mutation score exposed */

/**
 * The first scored run came back 186/231 with 45 unaccepted survivors, and the survivor map was
 * diagnostic rather than scattered: it named exactly the code no case reached. These cases close
 * that, and each one states the mutant it kills so a later reader can tell an assertion that earns
 * its place from one that merely passes.
 */
describe("what the mutation score found unpinned", () => {
  // covers: W14
  it("normalises the token itself, not only its residue verdict", () => {
    // AC-13's normaliser pin compares `utilityOf` against `normalizeToken` on LIVE residue tokens,
    // and no live token carries an important marker, so the whole bang-stripping path was unpinned
    // while thirty-two forms exercised `isResidue` around it. Kills the `slice(1)` and `slice(0,-1)`
    // mutants; the bracket and paren depth cases kill the `||`-to-`&&` mutants in both walkers.
    const cases: ReadonlyArray<readonly [string, string, readonly string[]]> = [
      ["border-border", "border-border", []],
      ["!border-border", "border-border", []],
      ["border-border!", "border-border", []],
      ["focus:border-border-strong", "border-border-strong", ["focus"]],
      ["focus:!border-border", "border-border", ["focus"]],
      ["sm:!border-border/25", "border-border/25", ["sm"]],
      ["max-sm:border-border/50", "border-border/50", ["max-sm"]],
      ["[&:hover]:border-border", "border-border", ["[&:hover]"]],
      ["has-[:checked]:border-border-strong", "border-border-strong", ["has-[:checked]"]],
      ["group-hover:focus:border-border", "border-border", ["group-hover", "focus"]],
      ["border-[rgb(207,205,199)]", "border-[rgb(207,205,199)]", []],
      ["border-(--color-border-strong)", "border-(--color-border-strong)", []],
    ];
    expect(cases.map(([t]) => [t, utilityOf(t)])).toEqual(cases.map(([t, u]) => [t, u]));
    expect(cases.map(([t]) => [t, variantsOf(t)])).toEqual(cases.map(([t, , v]) => [t, v]));
  });

  // covers: spec §3.6
  it("prints the whole paste-ready row for a plain weak outline", () => {
    // Seven survivors lived in `printPasteReadyRow` because every case asserted DERIVED FIELDS and
    // none asserted the printed lines. §3.6 calls this message the guard's whole user interface.
    const printed = printPasteReadyRow(liveElement(PT), LIVE.paint);
    expect(printed.split("\n")[0]).toBe(
      `{ file: "${PT}", tag: "button", paint: ["bg-accent border border-accent-edge","bg-surface-sunken border border-border-strong"], category: "TODO", reason: "TODO" },`,
    );
    expect(printed.split("\n").slice(1)).toEqual([...CATEGORY_BARS]);
  });

  // covers: spec §3.6, W23
  it("leads with the repair when the residue is a literal, and marks the row literal-outline", () => {
    const { el, paint } = literalElement();
    const lines = printPasteReadyRow(el, paint).split("\n");
    expect(lines[0]).toBe("replace rgb(207 205 199) with a theme token");
    expect(lines[1]).toBe(
      "or file it as a BL-/DEF- entry naming this file and rgb(207 205 199), and cite it",
    );
    expect(lines[2]).toContain(`category: "literal-outline"`);
    expect(lines[2]).toContain(`backlogRef: "TODO"`);
    expect(lines.slice(3)).toEqual([...CATEGORY_BARS]);
  });

  // covers: AC-4, W12
  it("refuses a filed-defect row that cites no ledger entry at all", () => {
    // Every ref-shaped refusal supplied a ref, so the "requires backlogRef" branch never ran.
    const el = liveElement("components/admin/BellPanel.tsx");
    const row = rowFor(el, "filed-defect", "a genuine weak resting outline, filed");
    expect(validateRow(row, el, oracle, ledger)).toEqual([
      `${el.file}: filed-defect requires backlogRef`,
    ]);
  });

  // covers: AC-4, W8
  it("refuses a switch-track reason that records the ratio but cites no ruling", () => {
    // Every switch-track case carried a well-formed reason, so the citation branch never ran.
    const el = liveElement(PT);
    const row = rowFor(el, "switch-track", "the OFF ring measures 1.43:1 light / 1.75:1 dark");
    expect(validateRow(row, el, oracle, ledger)).toEqual([
      `${PT}: switch-track reason must cite DESIGN.md §1.2a`,
    ]);
  });

  // covers: AC-4, W8
  it("refuses a switch-track alternative whose outline paints only one side", () => {
    // `sides.size > 0` counts an outline; a single-side token is still an outline, and the mutant
    // that raises the threshold to 1 makes it invisible. Directional tokens are the live case.
    const el = liveElement(PT);
    const row: ResidueRow = {
      file: PT,
      tag: "button",
      paint: [
        "bg-accent border border-t-accent-edge",
        "bg-surface-sunken border border-border-strong",
      ],
      category: "switch-track",
      reason: TRACK_REASON,
    };
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
  });

  // covers: AC-4, W13
  it("accepts focus-visible as a focus variant, not only focus", () => {
    // The equality flip on the second arm is invisible while every case uses `focus:`.
    const el = liveElement("app/help/layout.tsx");
    const row: ResidueRow = {
      file: el.file,
      tag: el.tag,
      paint: ["focus-visible:border-border-strong"],
      category: "focus-state-chrome",
      reason: "focus-visible:ring-2 carries the focus indication",
    };
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
  });

  // covers: spec §3.4
  it("reds when two rows sharing a key disagree about their category", () => {
    // §3.4 requires rows sharing a key to share a category. Nothing exercised it.
    const el = liveElement("components/admin/BellPanel.tsx");
    const a = rowFor(el, "side-divider", "border-t separates the panel footer link");
    const b = { ...a, category: "filed-defect" as ResidueCategory, backlogRef: "BL-TEST-ROW" };
    const problems = validateCensus([a, b], LIVE, oracle, ledger);
    expect(problems.filter((p) => p.includes("disagree about category"))).toEqual([
      `${el.file}: rows sharing a key disagree about category: side-divider vs filed-defect`,
    ]);
  });

  // covers: spec §3.6
  it("finds the nearest live key in the row's OWN file, not merely one with the same tag", () => {
    // The nearest-key filter is `file === row.file && tag === row.tag`. Widening it to `||` is
    // invisible when the row's own element is the first of its tag in scan order, which is what the
    // AC-6 fixture happens to be. RecentAutoAppliedStrip is NOT: PublishedToggle sorts before it and
    // shares the tag, so a widened filter reports PublishedToggle's key for it.
    const strip = "components/admin/RecentAutoAppliedStrip.tsx";
    const stale: ResidueRow = {
      file: strip,
      tag: "button",
      paint: ["bg-surface-sunken border-b border-border hover:bg-surface", "moved"],
      category: "side-divider",
      reason: "border-b separates the rows of the open strip",
    };
    const line = validateCensus([stale], LIVE, oracle, ledger).find((p) => p.startsWith("stale: "));
    expect(line?.split("nearest live key in this file by tag: ")[1]).toBe(
      projectionsOf(liveElement(strip), LIVE.paint).join(" || "),
    );
  });
});

/* ------------------------------ what the SECOND score found unpinned (round 2) */

/**
 * The first score reported 45 unaccepted survivors and nine cases took it to 22 at 0.912. These
 * eight close the eight that remain KILLABLE; the other fourteen are equivalences argued on the
 * registry rows, and every one of those arguments is a claim about a closed domain rather than
 * about what the suite happens to cover.
 */
describe("what the second score found unpinned", () => {
  // covers: W3
  it("drops only the leading bang before reading the variant chain", () => {
    // The token table exercises `!border-border` (no chain, so both slice widths return []) and
    // `focus:!border-border` (the bang is not leading, so the branch never runs). Neither reaches
    // the slice WIDTH. A leading bang IN FRONT OF a chain does.
    expect(variantsOf("!focus:border-border")).toEqual(["focus"]);
    expect(variantsOf("!group-hover:focus:border-border")).toEqual(["group-hover", "focus"]);
    expect(utilityOf("!focus:border-border")).toBe("border-border");
  });

  // covers: W3
  it("closes a bracket variant before looking for the next chain separator", () => {
    // The depth-aware chain split landed in this arc and left its own repair untested: it differs
    // from the depth-BLIND walker only when a depth-0 colon FOLLOWS a closing bracket. Without
    // this, the mutant that makes the decrement unreachable keeps the depth pinned above zero and
    // returns the whole chain as one segment.
    expect(variantsOf("[&:hover]:focus:border-border")).toEqual(["[&:hover]", "focus"]);
    expect(variantsOf("has-[:checked]:sm:border-border")).toEqual(["has-[:checked]", "sm"]);
  });

  // covers: W20
  it("resolves a relative import against the importing sheet, not the module require path", () => {
    // Production `app/globals.css` imports one bare specifier, so the relative arm never runs when
    // the real oracle loads and nothing else here reaches it. A sheet importing a sibling does.
    const dir = mkdtempSync(join(tmpdir(), "control-outline-oracle-"));
    try {
      writeFileSync(join(dir, "child.css"), "@theme { --color-probe-edge: #cfcdc7; }\n");
      writeFileSync(join(dir, "root.css"), '@import "tailwindcss";\n@import "./child.css";\n');
      return expect(loadOracle(join(dir, "root.css"))).resolves.toBeDefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // covers: W26
  it("emits a nested rule's declarations with neither brace attached", () => {
    // Both `continue`s exist to keep the brace character itself out of the buffer. Drop either and
    // the brace is appended to the emitted text, where `PAINT_PROP` reads `{` as a legal prefix
    // and a stray `}` truncates a `BORDER_COLOUR_DECL` value.
    //
    // The expected string also pins the DOCUMENTED LIMIT below it: declarations standing before a
    // nested rule are discarded with the selector, so `color: red` is absent here by design. The
    // premise case that follows is what keeps that limit from becoming a silent miss.
    expect(ownDeclarations(".x { color: red; &:hover { color: blue; } }")).toBe(" color: blue; ; ");
    expect(ownDeclarations(".x { color: red; &:hover { color: blue; } }")).not.toMatch(/[{}]/);
  });

  // covers: W26
  it("has no live token whose own declarations stand before a nested rule", () => {
    // The limit pinned above is a FALSE-CLEAR direction, not a conservative one: a weak outline
    // painted in that leading run would be dropped and the element would read clean. It is
    // tolerable only while unreachable, so reachability is asserted rather than asserted-once and
    // commented. If a token ever compiles to that shape this reds, and the limit becomes a defect.
    const reaching = [...new Set(tokensOf(scanInteractiveElements(ROOT, WIDENED)))].filter((t) => {
      const compiled = oracle.ds.candidatesToCss([t])[0];
      if (compiled == null) return false;
      const body = compiled.replace(/^[^{]*\{/, "").replace(/\}\s*$/, "");
      let buf = "";
      for (const ch of body) {
        if (ch === "{") {
          const cut = buf.lastIndexOf(";");
          if (cut !== -1 && buf.slice(0, cut + 1).trim().length > 0) return true;
          buf = "";
          continue;
        }
        if (ch === "}") {
          buf = "";
          continue;
        }
        buf += ch;
      }
      return false;
    });
    expect(reaching).toEqual([]);
  });

  // covers: W22
  it("names the missing theme token when a ratio cannot be read", () => {
    // `!m || !m[1]` guards a MANDATORY capture group, so the second disjunct is dead and the
    // conjunction mutant never throws the named error — it throws a TypeError off the null match
    // instead. Only asserting the MESSAGE separates the two; `toThrow()` alone accepts both.
    const css = [
      ":root {\n  --color-border-strong-runtime: #cfcdc7;\n}",
      "@media (prefers-color-scheme: dark) {\n}",
      '[data-theme="dark"] {\n  --color-border-strong-runtime: #3a3a3a;\n}',
    ].join("\n");
    expect(() => recordedRatio("border-strong", "surface-sunken", css)).toThrow(
      /token --color-surface-sunken not found/,
    );
  });

  // covers: W22
  it("names the missing anchor when the stylesheet has no theme block", () => {
    // Same shape one function up: `m.index === undefined` is unreachable for a successful match,
    // so the mutant reads `.index` off null and reports a TypeError instead of the anchor.
    expect(() => recordedRatio("border-strong", "surface-sunken", "")).toThrow(
      /anchor .* not found/,
    );
  });

  // covers: AC-11
  it("requires a painted side before demanding a focus ring", () => {
    // `p != null && …some(Boolean)` decides whether an alternative carries a weak token at all.
    // Flipped to `||`, every non-null paint reports weak, so an element that paints only NON-weak
    // colours is told to add a ring it does not need.
    //
    // This is the one case here whose element cannot be live, and the premise below is why: the
    // branch needs an alternative that PAINTS but paints nothing WEAK, and a residue element
    // carries a weak token on the alternative that put it in the census by definition. All twelve
    // live elements were checked and none discriminates. So the element is constructed, and the
    // assertion above it pins the fact that forced the construction — if the census ever admits a
    // discriminating element, that premise reds and this fixture should become a live one.
    const ringed = (t: string) => /^focus(-visible)?:ring-/.test(t);
    const discriminating = LIVE.elements.filter((el) => {
      const lp = classify(oracle, tokensOf([el]));
      const per = el.paths.map((path) => {
        const toks = path.flatMap((str) => str.split(/\s+/)).filter(Boolean);
        return {
          paints: toks.some((t) => lp.get(t) != null),
          weak: toks.some((t) => {
            const p = lp.get(t);
            return p != null && [...p.sides.values()].some(Boolean);
          }),
          ring: toks.some(ringed),
        };
      });
      // `unringed` is a `.some` over alternatives, so the comparison is at ELEMENT level: an
      // element whose other alternative is already weak-and-unringed reports the same verdict
      // under both spellings even when one alternative paints without painting weak.
      return per.some((x) => x.weak && !x.ring) !== per.some((x) => x.paints && !x.ring);
    });
    expect(discriminating).toEqual([]);

    const el: ScanElement = {
      file: "components/admin/PublishedToggle.tsx",
      line: 1,
      tag: "button",
      // paints (`border`, `bg-surface-sunken`), nothing weak, and no ring token.
      paths: [["border bg-surface-sunken px-3 py-1"]],
      unresolved: false,
      hasClassName: true,
      allowlisted: false,
      admittedAs: "element",
    };
    const row: ResidueRow = {
      file: el.file,
      tag: el.tag,
      paint: ["focus:border-border-strong"],
      category: "focus-state-chrome",
      reason: "focus chrome; the ring requirement must not fire without a painted weak side",
    };
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
  });
});

/**
 * AC-9b, asserted against the LIVE tree.
 *
 * §6.4's repair is the one place in this sweep where doing what the red said
 * would have been worse than doing nothing: `FilterTextInput` painted its
 * outline through `className ?? "<weak default>"` while both call sites passed
 * their own, so the weak string the transcript named was dead code. Swapping it
 * would have deleted the only READABLE weak token, cleared `isResidue`, and left
 * both rendered controls at 1.27:1 behind a green guard.
 *
 * `isResidue` is `weakSides(...).length > 0` and reads only readable tokens
 * (tests/styles/controlOutlineResidue.ts), so `unresolved` does NOT keep an
 * element in the census — a claim an earlier revision of this arc's spec got
 * backwards, and the reason this assertion is about resolution rather than about
 * membership. Whole-diff review round 1 found it promised and absent.
 */
describe("AC-9b: the EventFilters text input resolves, and no caller can repaint it", () => {
  const FILE = "components/admin/telemetry/EventFilters.tsx";
  const scanned = scanInteractiveElements(ROOT, {
    textEntry: true,
    paintedChildren: true,
  }).filter((el) => el.file === FILE && el.tag === "input");

  // covers: AC-9b
  it("the scan reaches the field at all", () => {
    // By FILE and TAG, never by line: three merges from main moved every line
    // number in this arc at least once.
    premise(`${FILE} contributes a scanned <input>`, scanned.length, 0);
  });

  // covers: AC-9b
  it("its className is FULLY resolved, so the guard reads a real token", () => {
    for (const el of scanned) {
      expect(
        el.unresolved,
        `${FILE}:${el.line}: an unresolved className would let the guard pass on unreadability rather than on the token`,
      ).toBe(false);
      expect(
        allStrings(el).some((str) => /(^|\s)border-text-faint(\s|$)/.test(str)),
        `${FILE}:${el.line}: the field wears the swept outline token`,
      ).toBe(true);
    }
  });

  // covers: AC-9b
  it("`FilterTextInput` owns its recipe: it takes no className prop", () => {
    // The structural half, read from the source with COMMENTS STRIPPED: the
    // component's own comment says "Deliberately not a className", and a naive
    // scan matches that and reports the prop it is promising is absent.
    // `cn` merges nothing (it is filter(Boolean).join(" ")),
    // so a caller-supplied className would sit BESIDE the recipe and a
    // `!border-border` could repaint the field while every assertion above still
    // passed. The prop is gone rather than merged, which is what makes that
    // unreachable instead of merely unlikely.
    const src = stripCommentsForFile(readFileSync(join(ROOT, FILE), "utf8"), FILE);
    const at = src.indexOf("function FilterTextInput");
    premise("FilterTextInput is still the component under test", at + 1, 0);
    const body = src.slice(at, at + 900);
    expect(body, "FilterTextInput must not accept a className").not.toMatch(/\bclassName\s*[?:]/);
    expect(body, "it takes the layout boolean instead").toMatch(/\bgrow\s*\??\s*:/);
  });
});

/**
 * The consequence bound applied to the FOLLOW branch, closed by signal rather
 * than by a wider resolver.
 *
 * Whole-diff review round 2 found the silent half: a capitalised tag inside a
 * control that `importedComponentDeclaration` cannot name is skipped, and it is
 * skipped in SILENCE — no `unresolved`, no row, the rendered child simply gone
 * from the cover. The named shapes were import ALIASES, defaults whose local
 * name differs from the exported declaration, anonymous defaults, one-hop barrel
 * re-exports, and same-file lexical shadowing.
 *
 * The repair is NOT to teach the resolver those five shapes. That is parser
 * growth, and a wider recognizer is a bigger target for the next round; this
 * repo's same-axis rule says so in as many words. The scanner now REPORTS what
 * it cannot name, and this guard turns the report into a closed class:
 *
 *   an unnamed component tag is admissible only if its local binding comes from
 *   OUTSIDE the corpus — a bare package specifier, which the resolver is not
 *   expected to follow into and which cannot carry a corpus control's outline.
 *
 * A tag bound from `./`, `../` or `@/` is the reviewer's class exactly: a corpus
 * component the resolver failed to name. There are none today, and an alias
 * refactor of `EventRow.tsx`'s `CronRunSummaryCard` — the reviewer's own worked
 * example — fails this loudly instead of vanishing.
 */
describe("no corpus component escapes the follow branch unnamed", () => {
  const reported: { file: string; line: number; tag: string }[] = [];
  scanInteractiveElements(ROOT, {
    textEntry: true,
    paintedChildren: true,
    onUnresolvedComponent: (info) => reported.push(info),
  });

  /**
   * The in-corpus tags the resolver correctly declines to name. THREE, and each
   * is a non-follow for a reason no resolver can fix rather than one this arc
   * chose not to fix:
   *
   * - the two `<Icon />` sites render a component read out of a TABLE at
   *   runtime (`const Icon = SECTION_ICON[id]`, and an `Icon: LucideIcon` field
   *   on a section record). Which component that is depends on a value, so no
   *   static resolver can name it — limit L1, stated as a registry row rather
   *   than left to the prose.
   * - `ZoomController` is a local function that renders NO JSX; it drives a zoom
   *   surface through effects. `localJsxDeclaration` requires a declaration that
   *   holds JSX, so declining it is correct: there is nothing to follow and
   *   nothing it can paint.
   *
   * Sorted, file-relative, and compared as a SET: a fourth member fails here,
   * which is the whole point. An alias refactor of a real corpus component lands
   * in this list and reds instead of vanishing.
   */
  const UNNAMABLE_IN_CORPUS = [
    "components/admin/wizard/step3ReviewSections.tsx <Icon>",
    "components/crew/CrewSubNav.tsx <Icon>",
    "components/diagrams/GalleryLightbox.tsx <ZoomController>",
  ];

  /** Every module specifier that binds `local` in `src`, alias forms included. */
  function specifiersBinding(src: string, local: string): string[] {
    const out: string[] = [];
    const importRe = /import\s+([^;]*?)\s+from\s+["']([^"']+)["']/g;
    for (const m of src.matchAll(importRe)) {
      const clause = m[1] ?? "";
      const spec = m[2] ?? "";
      // default, namespace, named, and named-with-alias all reduce to "does the
      // LOCAL name appear as a binding", which is what the resolver needed.
      const bindings = [
        ...clause
          .replace(/\{[^}]*\}/g, "")
          .matchAll(/(?:^|,)\s*(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)/g),
      ].map((b) => b[1]);
      const named = [...(clause.match(/\{([^}]*)\}/)?.[1] ?? "").split(",")]
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (part.includes(" as ") ? part.split(" as ")[1]!.trim() : part));
      if ([...bindings, ...named].includes(local)) out.push(spec);
    }
    return out;
  }

  // covers: spec §5.1
  it("the sink actually fires, so the assertion below is about something", () => {
    // Icons alone put this in three figures; a zero here would mean the sink was
    // never wired, and every claim under it would be vacuous.
    premise("the follow branch reports tags it cannot name", reported.length, 50);
  });

  // covers: spec §5.1
  it("every unnamed tag is bound from OUTSIDE the corpus", () => {
    const inCorpus = reported.filter((r) => {
      const rel = r.file.startsWith(ROOT) ? r.file.slice(ROOT.length + 1) : r.file;
      const specs = specifiersBinding(
        stripCommentsForFile(readFileSync(join(ROOT, rel), "utf8"), rel),
        r.tag,
      );
      // No binding at all is ALSO in-corpus for this purpose: that is the
      // lexical-shadowing shape, where the tag names something declared nearby.
      return specs.length === 0 || specs.some((sp) => /^(\.\.?\/|@\/)/.test(sp));
    });
    expect(
      [...new Set(inCorpus.map((r) => `${r.file.replace(`${ROOT}/`, "")} <${r.tag}>`))].sort(),
      "a corpus component the resolver could not name is the silent-miss class round 2 found",
    ).toEqual(UNNAMABLE_IN_CORPUS);
  });
});
