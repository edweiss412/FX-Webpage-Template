/**
 * The class guard for BL-MI11-REMOVAL-FALLBACK-STALE-OVERWRITE.
 *
 * THE CLASS. A hold-aware retain re-inserts a row the snapshot-replace engine
 * then upserts across every column (`lib/sync/runScheduledCronSync.ts:1701`).
 * When that row is `rowFromHeldValue(held)` -- a copy of a PRIOR live row, which
 * `writeMi11Holds` takes from `liveCrewByName`, the pre-apply snapshot -- every
 * field edited on the member since is silently reverted. Arc C found the first
 * instance on the `crew_email` reject branch; the sweep for the same SHAPE found
 * the rest, and all five retains now go through one helper.
 *
 * WHAT THIS PINS, AND WHAT IT DOES NOT.
 *
 * It pins two things: every `retainRows.set` in the tree is given exactly
 * `retainRowFor(hold.entity_key, held)`, and there are exactly five of them. The
 * file list is WALKED from disk, so a new module under `lib/sync/holds/` is
 * covered by default rather than silently exempt, and the site set is derived
 * rather than declared.
 *
 * It does NOT pin the lexical scope the call sits in. Two review rounds went
 * into trying: a multiset keyed on the enclosing function name lost to a
 * same-named function in another module, and the file-qualified version lost to
 * a same-named nested function wrapping the retain on its own line. Each repair
 * drew the next mutant, and the survivor is behaviour-preserving -- the same
 * call, the same arguments, the same point in the program. A guard that cannot
 * see it is not missing anything a reader would care about. Documented limit,
 * recorded so it is not re-derived as a gap.
 *
 * It also does not check `retainRowFor`'s BODY. An implementation returning the
 * snapshot unconditionally satisfies every rule here; the deciding suites are
 * the behavioural ones (holdRetainLiveRow, holdRetainRejectPath, the probe, and
 * the live-owner suite), where planted mutants B1 through B5 kill it.
 *
 * PARSED, NOT GREPPED. A text scan would accept `retainRowFor(` sitting in a
 * comment on a line whose call is still `rowFromHeldValue(`. The TypeScript AST
 * does not see comments as calls.
 *
 * Spec: docs/superpowers/specs/sync/2026-08-27-mi11-removal-fallback-live-row.md §5
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { premise } from "@/tests/_shared/premise";

const ROOT = join(__dirname, "..", "..");
const HOLDS_DIR = join(ROOT, "lib", "sync", "holds");

/**
 * Exactly what a retain may be given: the helper, with the right key.
 *
 * The callee is matched by SUFFIX because the helper reaches
 * `applyUndoOverrideToMaps` threaded through its `maps` argument, so the call
 * there reads `maps.retainRowFor(...)`. That is the same function, and it is
 * the same treatment the `retainRows.set` match already gives
 * `maps.retainRows.set`. Suffix, not substring: `notRetainRowFor` would fail
 * on the dot boundary below.
 */
const REQUIRED_CALLEE = "retainRowFor";
const REQUIRED_ARGS = "hold.entity_key, held";

/** `retainRowFor` or `<something>.retainRowFor`, and nothing else. */
const isHelperCallee = (value: string): boolean => {
  if (!value.startsWith("call:")) return false;
  const callee = value.slice("call:".length);
  return callee === REQUIRED_CALLEE || callee.endsWith(`.${REQUIRED_CALLEE}`);
};

/**
 * Every retain site, as of this commit. Pinned as a COUNT, which is the
 * tripwire: a sixth retain fails even in the admitted shape, so whoever adds
 * one has to come back to the spec and say which branch it is.
 */
const EXPECTED_SITE_COUNT = 5;

/** Every `.ts` under `lib/sync/holds/`, walked rather than listed. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return entry.isFile() && entry.name.endsWith(".ts") ? [full] : [];
  });
}

type RetainSite = {
  /** Repo-relative `path:line`, so a failure names a site a reader can open. */
  where: string;
  /** `call:<callee>` for a call, `identifier` for a bare variable, else `other`. */
  value: string;
  /** A call value's argument list as source text, so the KEY is pinned too. */
  args: string;
  /** Diagnostics only. Nothing asserts on this -- see the header. */
  enclosing: string;
};

function enclosingFunctionName(node: ts.Node): string {
  for (let cur: ts.Node | undefined = node.parent; cur; cur = cur.parent) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    if (
      (ts.isFunctionExpression(cur) || ts.isArrowFunction(cur)) &&
      ts.isVariableDeclaration(cur.parent) &&
      ts.isIdentifier(cur.parent.name)
    ) {
      return cur.parent.name.text;
    }
  }
  return "<top-level>";
}

function classifyValue(arg: ts.Expression | undefined): { value: string; args: string } {
  if (arg === undefined) return { value: "other", args: "" };
  if (ts.isCallExpression(arg)) {
    return {
      value: `call:${arg.expression.getText()}`,
      args: arg.arguments.map((a) => a.getText()).join(", "),
    };
  }
  if (ts.isIdentifier(arg)) return { value: "identifier", args: "" };
  return { value: "other", args: "" };
}

function retainSites(): RetainSite[] {
  const out: RetainSite[] = [];
  for (const file of sourceFiles(HOLDS_DIR)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
    );
    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.getText().endsWith("retainRows.set")
      ) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        out.push({
          where: `${relative(ROOT, file)}:${line + 1}`,
          enclosing: enclosingFunctionName(node),
          ...classifyValue(node.arguments[1]),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return out;
}

describe("every hold-aware retain is given the member's own live row", () => {
  const sites = retainSites();

  // The premise, stated unconditionally at describe scope and never inside a
  // `.each` callback: a walk that matched nothing would make every assertion
  // below vacuously true, and this file would pass forever.
  premise("the walk finds hold-aware retain sites at all", sites.length, 0);

  it("gives every retain exactly retainRowFor(hold.entity_key, held)", () => {
    const wrong = sites
      .filter((s) => !isHelperCallee(s.value) || s.args !== REQUIRED_ARGS)
      .map((s) => `${s.where} in ${s.enclosing} is given ${s.value}(${s.args})`);
    expect(
      wrong,
      "a retain given anything else re-inserts a row the upsert then writes across every column",
    ).toEqual([]);
  });

  it("pins the site count, so a NEW retain fails even in the admitted shape", () => {
    // The tripwire. Adding a retain is a decision about hold semantics, and it
    // should cost a look at the spec rather than passing because it happened to
    // call the right helper.
    expect(
      sites.map((s) => s.where),
      `expected ${EXPECTED_SITE_COUNT} retain sites; a change here needs a spec decision, not a number bump`,
    ).toHaveLength(EXPECTED_SITE_COUNT);
  });
});
