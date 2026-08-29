/**
 * tests/components/diagrams/perItemStateLifetime.probe.test.ts
 *
 * Probe P5 — settles spec §1.4 row U-5, and ships the meta-test the class
 * defense rests on (AC-17).
 *
 * THE CLAIM. A parser enumerating EVERY `useState`/`useRef` is a cover where the
 * rejected grep was not, so a per-item member added later fails by default.
 *
 * TWO SEPARATE ASSERTIONS PER PLANTED CASE, and the second is the one that
 * matters. That the scanner SEES the declaration, and that the registry check
 * REDS while it is unclassified. A scanner that enumerates perfectly behind a
 * gate that never fails is not a cover, and "the scanner found it" is exactly
 * the tautology this file has to avoid.
 *
 * The planted shapes are the ones the rejected grep missed, plus one it caught
 * as a positive control that the scanner has not simply stopped working.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { MAX_UNWRAP_DEPTH, scanStateDeclarations } from "./perItemStateScanner";
import { DELIBERATELY_NONE, PER_ITEM_STATE_REGISTRY } from "./perItemStateRegistry";
import { premise, premiseHolds } from "@/tests/_shared/premise";

const COMPONENTS = ["Gallery.tsx", "GalleryLightbox.tsx"] as const;
const ROOT = join(process.cwd(), "components/diagrams");

function sourceOf(basename: string): string {
  return readFileSync(join(ROOT, basename), "utf8");
}

/** The unclassified declarations across both components — the gate's verdict. */
function unclassified(sources: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [basename, text] of Object.entries(sources)) {
    for (const decl of scanStateDeclarations(text, basename)) {
      const key = `${basename}:${decl.name}`;
      if (!(key in PER_ITEM_STATE_REGISTRY)) out.push(`${key} (line ${decl.line})`);
    }
  }
  return out;
}

function liveSources(): Record<string, string> {
  return Object.fromEntries(COMPONENTS.map((b) => [b, sourceOf(b)]));
}

describe("per-item state lifetime — the live tree", () => {
  it("every `useState`/`useRef` in both components is classified", () => {
    const sources = liveSources();
    // PREMISE: the scanner must actually be finding declarations. An empty
    // enumeration classifies vacuously and would pass forever.
    const total = Object.entries(sources).reduce(
      (n, [b, t]) => n + scanStateDeclarations(t, b).length,
      0,
    );
    premise("the scanner enumerates declarations in the live components", total, 20);

    expect(unclassified(sources)).toEqual([]);
  });

  it("every per-item row states a clear path, or says so in exactly those words", () => {
    const perItem = Object.entries(PER_ITEM_STATE_REGISTRY).filter(
      ([, c]) => c.kind === "per-item",
    );
    premise("there are per-item rows to check", perItem.length, 5);

    const bad = perItem
      .filter(([, c]) => c.kind === "per-item" && c.clearedBy.trim() === "")
      .map(([k]) => k);
    // An empty clearedBy would satisfy "classified" while documenting nothing,
    // which is the hole round 3 found in the earlier AC-17.
    expect(bad, "per-item rows with an empty clear path").toEqual([]);

    // `demotedRef` is the row whose correct value is the literal phrase, so the
    // phrase has to be reachable rather than merely allowed.
    const literal = perItem.filter(
      ([, c]) => c.kind === "per-item" && c.clearedBy === DELIBERATELY_NONE,
    );
    expect(
      literal.length,
      "the deliberately-none form is in use, not just permitted",
    ).toBeGreaterThan(0);
  });

  it("every per-item row DECIDES the availability sweep, and a `false` gives a reason", () => {
    // THE CLASS CLOSURE. Plan review found four members of one shape across two
    // consecutive rounds — `wantsOriginal`, then `activeScale`,
    // `requestedScaleRef` and `controlsSlotRef` — each by a human reading the
    // code and noticing an absence. Prose could not be asked "does the sweep
    // touch this?", so each instance cost a round. A required field cannot be
    // silent: adding a member forces the decision, and declining forces a why.
    const perItemRows = Object.entries(PER_ITEM_STATE_REGISTRY).filter(
      ([, c]) => c.kind === "per-item",
    );
    premise("there are per-item rows to check", perItemRows.length, 5);

    const unreasoned = perItemRows
      .filter(([, c]) => c.kind === "per-item" && !c.sweep.swept && !c.sweep.why.trim())
      .map(([k]) => k);
    expect(unreasoned, "rows declining the sweep without saying why").toEqual([]);

    // Both answers must be IN USE, or the field is decorative: a registry where
    // every row says `true` proves nothing about the ones that should not be.
    const swept = perItemRows.filter(([, c]) => c.kind === "per-item" && c.sweep.swept);
    const declined = perItemRows.filter(([, c]) => c.kind === "per-item" && !c.sweep.swept);
    expect(swept.length, "rows the sweep clears").toBeGreaterThan(0);
    expect(declined.length, "rows that decline it, with reasons").toBeGreaterThan(0);
  });
});

describe("per-item state lifetime — what the scanner must REFUSE to enumerate", () => {
  // The positive plants above prove the recognizer is wide enough. These prove it
  // is not TOO wide, which is the direction the first score found unpinned: the
  // narrowing conjunctions in the callee and binding-pattern guards could all be
  // widened to `||` with no case objecting.
  function scanPlanted(decl: string): ReturnType<typeof scanStateDeclarations> {
    const base = sourceOf("Gallery.tsx");
    const anchorAt = base.indexOf("const [failedKeys, setFailedKeys]");
    premiseHolds("the anchor declaration exists to plant beside", anchorAt > 0);
    const cut = base.indexOf("\n", anchorAt) + 1;
    return scanStateDeclarations(base.slice(0, cut) + decl + "\n" + base.slice(cut), "Gallery.tsx");
  }

  it("a computed access keyed by a VARIABLE is not a hook call, even when the variable is named `useState`", () => {
    // The key is an Identifier whose `.text` is the string "useState", so a guard
    // that stops checking `isStringLiteralLike` reads the variable's NAME as the
    // hook's name and enumerates a declaration that calls no hook at all.
    const seen = scanPlanted("  const [plantedDynKey] = React[useState](0);").map((d) => d.name);
    expect(
      seen,
      "a variable key is not a string literal, so the callee names no hook",
    ).not.toContain("plantedDynKey");
  });

  it("never enumerates a declaration whose name it could not resolve", () => {
    // `const [{ inner }] = useState()` binds an object pattern in the first slot.
    // The name is unresolvable, and the guard that says so is a conjunction: widen
    // it and `first.name.text` is `undefined`, which then passes the `!== null`
    // check and pushes a nameless row.
    const decl =
      "  const [{ plantedNested }] = useState<{ plantedNested: number }>({ plantedNested: 0 });";
    for (const d of scanPlanted(decl)) {
      expect(d.name, "every enumerated declaration carries a resolved name").toBeTruthy();
      expect(typeof d.name, "a name is a string, never an undefined read off a pattern").toBe(
        "string",
      );
    }
  });

  it("an array-binding HOLE resolves no name and is not enumerated", () => {
    const seen = scanPlanted("  const [, plantedSetterOnly] = useState(0);").map((d) => d.name);
    expect(
      seen,
      "the first slot is omitted, so there is no value binding to enumerate",
    ).not.toContain("plantedSetterOnly");
  });
});

describe("per-item state lifetime — the unwrap bound sits exactly where it claims", () => {
  // The bound exists so a broken advance TERMINATES and can be rejected by an
  // assertion. That mechanism introduces its own sites -- the comparison, the
  // step, the literal -- and left unpinned every one of them is an equivalent
  // mutant: nothing a person writes nests deep enough to notice. Pinning the
  // boundary from BOTH sides makes all three observable instead, so they are
  // killable rather than accepted.
  function scanWrapped(depth: number, name: string) {
    const base = sourceOf("Gallery.tsx");
    const anchorAt = base.indexOf("const [failedKeys, setFailedKeys]");
    premiseHolds("the anchor declaration exists to plant beside", anchorAt > 0);
    const cut = base.indexOf("\n", anchorAt) + 1;
    // Derived from the exported ceiling, never hardcoded: a literal here would
    // stop tracking the constant the moment anyone retuned it.
    const decl = `  const ${name} = ${"(".repeat(depth)}useRef(null)${")".repeat(depth)};`;
    return scanStateDeclarations(
      base.slice(0, cut) + decl + "\n" + base.slice(cut),
      "Gallery.tsx",
    ).map((d) => d.name);
  }

  it(`unwraps a call nested exactly MAX_UNWRAP_DEPTH (${MAX_UNWRAP_DEPTH}) deep`, () => {
    expect(
      scanWrapped(MAX_UNWRAP_DEPTH, "plantedAtBound"),
      "the last depth inside the ceiling still resolves to the hook call",
    ).toContain("plantedAtBound");
  });

  it("declines one layer PAST the ceiling rather than looping", () => {
    // Refusing here is the documented limit, and it is what makes the ceiling
    // observable at all. No parseable source a person writes reaches it.
    expect(
      scanWrapped(MAX_UNWRAP_DEPTH + 1, "plantedPastBound"),
      "past the ceiling the scanner returns the still-wrapped node and enumerates nothing",
    ).not.toContain("plantedPastBound");
  });
});

describe("per-item state lifetime — the reported line locates the declaration", () => {
  it("reports the 1-based line the declaration actually sits on", () => {
    // Nothing asserted `line` before, so the off-by-one in its computation was
    // free to move. Derived from the planted source rather than hardcoded: a
    // literal expectation would pass at the wrong offset just as happily.
    const base = sourceOf("Gallery.tsx");
    const anchorAt = base.indexOf("const [failedKeys, setFailedKeys]");
    premiseHolds("the anchor declaration exists to plant beside", anchorAt > 0);
    const cut = base.indexOf("\n", anchorAt) + 1;
    const decl = "  const plantedLineProbe = useRef(null);";
    const planted = base.slice(0, cut) + decl + "\n" + base.slice(cut);

    const expectedLine = planted.slice(0, planted.indexOf(decl)).split("\n").length;
    const found = scanStateDeclarations(planted, "Gallery.tsx").find(
      (d) => d.name === "plantedLineProbe",
    );
    premiseHolds("the line probe was enumerated at all", found !== undefined);
    expect(found?.line, "the reported line is the declaration's own 1-based line").toBe(
      expectedLine,
    );
  });
});

describe("per-item state lifetime — the gate REDS on a planted member", () => {
  const PLANTS: Array<{ label: string; decl: string; name: string }> = [
    {
      label: "a Record, which the rejected grep could not see",
      decl: "  const [plantedRecord, setPlantedRecord] = useState<Record<string, number>>({});",
      name: "plantedRecord",
    },
    {
      label: "an object literal, likewise invisible to the grep",
      decl: "  const plantedObjRef = useRef({});",
      name: "plantedObjRef",
    },
    {
      label: "POSITIVE CONTROL: a ReadonlySet, which the grep DID catch",
      decl: "  const [plantedSet, setPlantedSet] = useState<ReadonlySet<string>>(() => new Set());",
      name: "plantedSet",
    },
    {
      label: "a multi-line generic, to prove parsing beats pattern matching",
      decl: "  const plantedMultiline = useRef<\n    Map<string, number> | null\n  >(null);",
      name: "plantedMultiline",
    },
    // ── The four mutants plan review R4 EXECUTED against this scanner. Every
    // one got past the original recognizer, which saw only a bare
    // CallExpression. They are committed as cases so the repair cannot regress.
    {
      label: "R4 mutant: a parenthesized hook call",
      decl: "  const plantedParen = (useRef(null));",
      name: "plantedParen",
    },
    {
      label: "R4 mutant: an `as` cast around the call",
      decl: "  const plantedCast = useRef(null) as { current: unknown };",
      name: "plantedCast",
    },
    {
      label: "R4 mutant: a non-null assertion around the call",
      decl: "  const plantedBang = useRef<{ current: null } | null>(null)!;",
      name: "plantedBang",
    },
    {
      label: "R4 mutant: a computed-property hook access",
      decl: '  const [plantedComputed] = React["useState"](0);',
      name: "plantedComputed",
    },
    // ── Survivors of the FIRST mutation score of this surface. Each names an
    // unwrap arm or a traversal step that no case exercised, so the mutation
    // that broke it changed nothing any assertion could see.
    {
      // Kills the `||` joining the satisfies arm to the one after it. I added
      // `satisfies` and the type-assertion arm myself after R4 and never wrote a
      // case for either, so the operator flipped them with no consequence.
      label: "survivor: a `satisfies` wrapper around the call",
      decl: "  const plantedSatisfies = useRef(null) satisfies { current: unknown };",
      name: "plantedSatisfies",
    },
    {
      // Kills the removal of `continue`. Without it the loop unwraps exactly ONE
      // layer and returns, so only a doubly-wrapped call can tell the difference.
      // Every earlier fixture was wrapped exactly once.
      label: "survivor: a DOUBLY wrapped call, which single-level unwrap misses",
      decl: "  const plantedDouble = ((useRef(null) as { current: unknown }));",
      name: "plantedDouble",
    },
    {
      // Kills the removal of the recursive descent in the non-call branch. An
      // arrow-function initializer is not a call, so a hook inside it is
      // reachable only by recursing through that branch.
      label: "survivor: a hook nested inside a non-call initializer",
      decl:
        "  const plantedFactory = () => {\n" +
        "    const [plantedInner, setPlantedInner] = useState(0);\n" +
        "    return [plantedInner, setPlantedInner];\n" +
        "  };",
      name: "plantedInner",
    },
    {
      // The bound's OWN case, required alongside the mechanism change: ordinary
      // nesting must still unwrap completely, so the ceiling is proven not to
      // fire on input a person would actually write.
      label: "the unwrap bound does not fire on ordinary nesting",
      decl: "  const plantedDeepNest = ((((useRef(null)))));",
      name: "plantedDeepNest",
    },
  ];

  for (const plant of PLANTS) {
    it(`sees AND rejects: ${plant.label}`, () => {
      const base = sourceOf("Gallery.tsx");
      // Insert immediately after the real `failedKeys` declaration, inside the
      // component body, so the plant is in a position the scanner must reach.
      const anchor = base.indexOf("const [failedKeys, setFailedKeys]");
      premiseHolds("the anchor declaration exists to plant beside", anchor > 0);
      const cut = base.indexOf("\n", anchor) + 1;
      const planted = base.slice(0, cut) + plant.decl + "\n" + base.slice(cut);

      const seen = scanStateDeclarations(planted, "Gallery.tsx").map((d) => d.name);
      expect(seen, "the scanner enumerates the planted declaration").toContain(plant.name);

      const verdict = unclassified({ "Gallery.tsx": planted });
      expect(
        verdict.some((row) => row.startsWith(`Gallery.tsx:${plant.name}`)),
        "the gate REDS while the planted member is unclassified — enumeration alone is not a cover",
      ).toBe(true);
    });
  }

  it("a DUPLICATE declaration name is reported, not silently aliased to one row", () => {
    // Plan review R4: the registry keys on `basename:name`, so a second
    // declaration sharing a name inherits the first one's row and its sweep
    // decision without anyone deciding. Two members with one lifetime record is
    // the same fail-open the typed field exists to prevent, reached by a
    // different door.
    const base = sourceOf("Gallery.tsx");
    const anchor = base.indexOf("const [failedKeys, setFailedKeys]");
    premiseHolds("the anchor exists", anchor > 0);
    const cut = base.indexOf("\n", anchor) + 1;
    const planted =
      base.slice(0, cut) +
      "  const [failedKeys, setFailedKeysAgain] = useState<ReadonlySet<string>>(() => new Set());\n" +
      base.slice(cut);

    const seen = scanStateDeclarations(planted, "Gallery.tsx");
    const names = seen.map((d) => d.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, "the scanner SEES both declarations").toContain("failedKeys");

    // And the gate must not pass just because one row happens to cover the name.
    const keys = seen.map((d) => `Gallery.tsx:${d.name}`);
    const distinct = new Set(keys);
    expect(
      distinct.size < keys.length,
      "a name collision is detectable from the scan alone, so the gate below can refuse it",
    ).toBe(true);
  });

  it("the live components declare no duplicate names, so no row is silently shared", () => {
    for (const basename of COMPONENTS) {
      const names = scanStateDeclarations(sourceOf(basename), basename).map((d) => d.name);
      const dupes = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
      expect(dupes, `${basename} has two declarations sharing one registry row`).toEqual([]);
    }
  });

  it("the three members the rejected grep missed are all enumerated", () => {
    // Named in spec §4.0.3 as the concrete evidence that a lexical scan fails.
    const seen = scanStateDeclarations(sourceOf("GalleryLightbox.tsx"), "GalleryLightbox.tsx").map(
      (d) => d.name,
    );
    for (const name of ["activeScale", "requestedScaleRef", "controlsSlotRef"]) {
      expect(seen, `${name} is enumerated`).toContain(name);
    }
  });
});
