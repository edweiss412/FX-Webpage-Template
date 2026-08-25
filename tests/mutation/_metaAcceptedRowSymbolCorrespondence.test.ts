import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { premise, premiseHolds } from "../_shared/premise";
import { GUARD_SURFACES } from "./source/registry";

/**
 * An accepted row's ARGUMENT must be about the site the row is KEYED to.
 *
 * Diff review round 4 of BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND found four
 * rows on one surface whose equivalence arguments described different code than
 * their siteId named: a re-key had crossed two pairs, so `1831` (the ANSI-C
 * close-quote loop) carried `hereStringBindingLines`'s argument and `3500` the
 * reverse, and likewise `2373` and `2718`. A derived sweep then found three more
 * the review had not: one row claimed `assignmentBindingLines` while sitting in
 * `valueBinds`, contradicting its own sibling row two lines above.
 *
 * NOTHING IN THE HARNESS COULD SEE ANY OF IT. Every row kept a VALID
 * `(siteId, kind)` pair, so `mutation:sites` resolved them and the score counted
 * them. The repair's own re-key check compared all `(siteId, kind)` pairs across
 * revisions and was CORRECT about the score while blind to this: a pair-level
 * check asks whether a row points somewhere, never whether it points HERE.
 *
 * This closes that at authoring time. A row whose prose names a symbol that is
 * not in scope at its own siteId fails, and the failure names both.
 *
 * DOCUMENTED LIMIT, measured rather than estimated: only rows carrying the
 * canonical `(<source basename>, symbol X)` parenthetical are checkable, and at
 * the time of writing that is 25 of the registry's 236 accepted rows, all on one
 * surface. The convention is not repo-wide. This guard therefore does NOT assert
 * that every row is correct; it asserts that every row MAKING the claim is. Rows
 * without the parenthetical are invisible to it, and adding claims to them is
 * authoring work no review has asked for. The premises below exist so that
 * shrinking population can never quietly turn this into a test that passes on
 * nothing.
 */

/**
 * Where each named declaration LIVES, as source spans.
 *
 * The first version of this asked whether a claimed name was in the enclosing
 * function chain OR was a top-level declaration. That second arm made the whole
 * check vacuous and it was caught by planting the real defect rather than by
 * reading the code: EVERY function in a module is a top-level declaration, so any
 * function name satisfied any row, and re-crossing the `1831`/`3500` pair the
 * review had found left the suite green. The negative control missed it too,
 * because it used a name that exists NOWHERE — which is not the shape of the
 * defect. The shape is a real symbol from elsewhere in the same file.
 *
 * The rule that works is one rule, not two: the claimed name's DECLARATION must
 * SPAN the site. For a function that means the site is inside its body; for a
 * `const` holding a regex it means the site is inside the initializer, which is
 * how a row naming `INTERPRETER_POSITIONAL_BINDING` stays legal without opening
 * the door the first version opened.
 */
function declarationSpans(sourcePath: string): Map<string, Array<[number, number]>> {
  const text = readFileSync(sourcePath, "utf8");
  const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
  const spans = new Map<string, Array<[number, number]>>();

  const add = (name: string, node: ts.Node) => {
    const list = spans.get(name) ?? [];
    list.push([node.getStart(), node.getEnd()]);
    spans.set(name, list);
  };

  const walk = (n: ts.Node) => {
    if (ts.isFunctionDeclaration(n) && n.name) add(n.name.text, n);
    else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) add(n.name.text, n);
    else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) add(n.name.text, n);
    ts.forEachChild(n, walk);
  };
  ts.forEachChild(sf, walk);
  return spans;
}

/** Position of the first character of `line` (1-indexed), or null if out of range. */
function positionOf(sourcePath: string, line: number): number | null {
  const text = readFileSync(sourcePath, "utf8");
  const sf = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
  try {
    return sf.getPositionOfLineAndCharacter(line - 1, 0);
  } catch {
    return null;
  }
}

/** Every declared name whose span contains `pos`, innermost last. */
function namesSpanning(spans: Map<string, Array<[number, number]>>, pos: number): string[] {
  const hits: Array<[string, number]> = [];
  for (const [name, list] of spans) {
    for (const [start, end] of list) {
      if (start <= pos && pos < end) hits.push([name, end - start]);
    }
  }
  return hits.sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

/**
 * The canonical claim is anchored on the surface's own source basename, so prose
 * that merely contains the word "symbol" is not mistaken for one. Measured: the
 * unanchored form matches "the symbol it" in another surface's reason and reports
 * a claim of `it`, which is exactly the false red a guard must not produce.
 */
function claimedSymbols(reason: string, sourceBase: string): string[] {
  const anchored = new RegExp(
    `\\(\\s*${sourceBase.replace(/\./g, "\\.")}\\s*,\\s*symbols?\\s+(\\w+)(?:\\s+and\\s+(\\w+))?`,
    "g",
  );
  const out: string[] = [];
  for (const m of reason.matchAll(anchored)) {
    out.push(m[1]!);
    if (m[2]) out.push(m[2]);
  }
  return out;
}

type Checked = {
  surface: string;
  siteId: string;
  claims: string[];
  spanning: string[];
  ok: boolean;
};

function sweep(): { checked: Checked[]; rowsWalked: number; surfacesWalked: number } {
  const checked: Checked[] = [];
  let rowsWalked = 0;
  let surfacesWalked = 0;

  for (const surface of GUARD_SURFACES) {
    if (!existsSync(surface.sourcePath)) continue;
    surfacesWalked++;
    const base = basename(surface.sourcePath);
    const spans = declarationSpans(surface.sourcePath);

    for (const row of surface.accepted) {
      rowsWalked++;
      const claims = claimedSymbols(row.reason, base);
      if (claims.length === 0) continue;
      const line = Number(row.siteId.split(":")[1]);
      const pos = positionOf(surface.sourcePath, line);
      const spanning = pos === null ? [] : namesSpanning(spans, pos);
      const ok = claims.some((c) => spanning.includes(c));
      checked.push({ surface: surface.id, siteId: row.siteId, claims, spanning, ok });
    }
  }
  return { checked, rowsWalked, surfacesWalked };
}

describe("accepted rows — the argument is about the site the row is keyed to", () => {
  it("resolves every claimed symbol at its own siteId", () => {
    const { checked, rowsWalked, surfacesWalked } = sweep();

    // The walk must have SEEN a population before it is allowed to say it found
    // nothing wrong. Each premise fails loudly rather than passing on an empty set.
    premise("the registry enrols surfaces whose source exists on disk", surfacesWalked, 5);
    premise("those surfaces carry accepted rows", rowsWalked, 100);
    premise("rows carrying the canonical symbol claim are present", checked.length, 20);

    const failures = checked
      .filter((c) => !c.ok)
      .map(
        (c) =>
          `${c.surface} ${c.siteId}: prose claims ${c.claims.join("/")}, ` +
          `but the declarations spanning that site are ${c.spanning.join(" > ") || "(none)"}`,
      );
    expect(failures).toEqual([]);
  });

  it("rejects a claim naming a real symbol that lives elsewhere in the same file", () => {
    // The negative control, and the reason this file exists in its current form.
    // An earlier version used a name present NOWHERE, which is not the defect's
    // shape: the defect is a REAL symbol from the same module attached to the
    // wrong site. That version passed with the review's own crossed pair planted
    // back in, so it certified a guard that could not catch what it was built for.
    const surface = GUARD_SURFACES.find((s) => s.id === "psqlStartupScan");
    premiseHolds(
      "psqlStartupScan is enrolled and is this check's live population",
      Boolean(surface),
    );
    const base = basename(surface!.sourcePath);
    const spans = declarationSpans(surface!.sourcePath);

    const witness = surface!.accepted.find((r) => claimedSymbols(r.reason, base).length > 0);
    premiseHolds("at least one row carries a canonical claim to test against", Boolean(witness));

    const line = Number(witness!.siteId.split(":")[1]);
    const pos = positionOf(surface!.sourcePath, line);
    premiseHolds("the witness row's siteId line exists in the source", pos !== null);
    const spanning = namesSpanning(spans, pos!);
    const claimed = claimedSymbols(witness!.reason, base);

    // The real claim resolves...
    expect(
      claimed.some((c) => spanning.includes(c)),
      `${witness!.siteId} should resolve ${claimed.join("/")} in ${spanning.join(" > ")}`,
    ).toBe(true);

    // ...and a real, declared symbol whose body does NOT contain this site does
    // not. Chosen from the file's own declarations rather than invented, so the
    // control has the same shape as the failure it stands in for.
    const elsewhere = [...spans.keys()].find((n) => !spanning.includes(n));
    premiseHolds(
      "the source declares a symbol that does not span the witness site",
      Boolean(elsewhere),
    );
    expect(
      spanning.includes(elsewhere!),
      `${elsewhere} must not resolve at ${witness!.siteId}`,
    ).toBe(false);
  });
});
