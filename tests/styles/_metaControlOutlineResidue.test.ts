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
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "../_shared/premise";
import { normalizeToken } from "./_childlessGrowableScan";
import {
  CATEGORY_BARS,
  classify,
  classifyValue,
  isResidue,
  loadOracle,
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
    (root) => scanInteractiveElements(root),
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
    return scanInteractiveElements(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

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
): ResidueRow {
  const base = {
    file: el.file,
    tag: el.tag,
    paint: projectionsOf(el, LIVE.paint),
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
  const off = row.paint
    .map((p) => p.split(" ").filter(Boolean))
    .find((alternative) =>
      alternative.some((t) => [...(paint.get(t)?.sides.values() ?? [])].some(Boolean)),
    );
  if (!off) return [`${row.file}: no alternative carries the weak outline`];
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
  it("holds exactly 12 rows", () => {
    expect(RESIDUE_CENSUS.length).toBe(12);
  });

  // covers: AC-11
  it("holds 3 / 5 / 2 / 2 / 0 / 0 rows by category", () => {
    const count = (c: ResidueCategory) => RESIDUE_CENSUS.filter((r) => r.category === c).length;
    expect(count("switch-track")).toBe(3);
    expect(count("side-divider")).toBe(5);
    expect(count("focus-state-chrome")).toBe(2);
    expect(count("responsive-skin-filed")).toBe(2);
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
    (root) => scanInteractiveElements(root),
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

describe("category bars: refusals (spec §1.5, AC-4)", () => {
  const track = () => liveElement(PT);
  const shareHub = () => liveElement("components/admin/showpage/ShareHub.tsx", 781);
  const skipLink = () => liveElement("app/help/layout.tsx");
  const divider = () => liveElement("components/admin/showpage/AttentionMenu.tsx");

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
    const el = shareHub();
    const row = rowFor(el, "responsive-skin-filed", "the phone skin is filed", "BL-NO-SUCH-ENTRY");
    expect(validateRow(row, el, oracle, ledger)).toEqual([
      `${el.file}: backlogRef BL-NO-SUCH-ENTRY does not resolve to a ledger heading`,
    ]);
  });

  // covers: AC-4, W12
  it("refuses a responsive-skin-filed row whose entry does not name its file", () => {
    const el = shareHub();
    const row = rowFor(el, "responsive-skin-filed", "the phone skin is filed", "BL-TEST-ROW");
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
  it("accepts ShareHub citing its own ledger entry", () => {
    const el = liveElement("components/admin/showpage/ShareHub.tsx", 781);
    const row = rowFor(
      el,
      "responsive-skin-filed",
      "the phone skin's weight is filed and fenced",
      "BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT",
    );
    expect(validateRow(row, el, oracle, ledger)).toEqual([]);
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
  it("classifies all thirty-two forms as the spec's tables state, one scratch root each", () => {
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
  });

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
  it("an oracle blind to the weak colour drops the residue to the seven border-border elements", async () => {
    const broken = css.replace(/^\s*--color-border-strong:.*$/m, "");
    premise("the declaration was removed", css.length - broken.length, 1);
    const dir = mkdtempSync(join(tmpdir(), "control-outline-residue-theme-"));
    const brokenPath = join(dir, "globals.css");
    writeFileSync(brokenPath, broken);
    // `loadOracle` reads the stylesheet once and builds the design system in memory, so the copy on
    // disk is finished with the moment it resolves and the directory can go immediately.
    const blind = await loadOracle(brokenPath);
    rmSync(dir, { recursive: true, force: true });
    expect(classify(blind, ["border-border-strong"]).get("border-border-strong")).toBeNull();

    const under = residueOf(ROOT, blind);
    expect(under.elements.map((e) => `${e.file}:${e.line}`).sort()).toEqual([
      "components/admin/BellPanel.tsx:1213",
      "components/admin/RecentAutoAppliedStrip.tsx:447",
      "components/admin/showpage/AttentionMenu.tsx:189",
      "components/admin/showpage/ShareHub.tsx:781",
      "components/admin/showpage/ShareHub.tsx:817",
      "components/admin/telemetry/EventFilters.tsx:85",
      "components/crew/primitives/KeyTimesStrip.tsx:191",
    ]);

    const stale = validateCensus(RESIDUE_CENSUS, under, blind, ledger).filter((p) =>
      p.startsWith("stale: "),
    );
    expect(stale.map((p) => p.slice("stale: ".length).split(" ")[0]).sort()).toEqual([
      "app/help/errors/page.tsx",
      "app/help/layout.tsx",
      "components/admin/PublishedToggle.tsx",
      "components/admin/settings/AutoPublishToggle.tsx",
      "components/admin/settings/NotifyToggle.tsx",
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
  it("the residue overlaps the swap census at exactly ShareHub's line 781", () => {
    const overlap = LIVE.elements.filter((el) =>
      CENSUS.some((row) => row.file === el.file && row.line === el.line),
    );
    expect(overlap.map((el) => `${el.file}:${el.line}`)).toEqual([
      "components/admin/showpage/ShareHub.tsx:781",
    ]);
    // Reached THROUGH the overlapping element's key. Finding a row by `category === x` and then
    // asserting `category === x` is a tautology: it can only fail when no such row exists at all,
    // and it says nothing about the element the pin is named for.
    const byKey = new Map(RESIDUE_CENSUS.map((r) => [rowKey(r), r] as const));
    expect(byKey.get(residueKey(overlap[0]!, LIVE.paint))?.category).toBe("responsive-skin-filed");
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
