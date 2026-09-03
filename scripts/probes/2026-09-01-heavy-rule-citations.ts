// scripts/probes/2026-09-01-heavy-rule-citations.ts
//
// Do the heavy-phase rule's line-form citations resolve to the constructs their prose claims?
//
// AGENTS.md's heavy-phase rule cites two lines of
// scripts/share-link-flash-adversary-matrix.mjs: the non-interactive playwright invocation that
// makes the script a transitive heavy-phase member, and the `--quick` guard that suppresses it,
// which the rule calls "load-bearing". Both numbers were stale, and the paragraph has now been
// repaired by hand twice. A citation repair verified by READING is a repair that is correct until
// the next merge, so this is the check instead.
//
// Usage:  node --import tsx scripts/probes/2026-09-01-heavy-rule-citations.ts
// Exit 0 iff every cited line holds the construct its citation is for.
// DOCUMENTED LIMIT, and it is covered by something else rather than left open. A citation that
// names NEITHER the path nor any file on its own line is invisible here: the scan skips lines that
// do not mention the target at all. There is exactly one such site,
// tests/docs/agentsHeavyPhaseRule.test.ts:984, an `editRule` mutant string carrying "stays
// unwrapped, line 1243" on its own. It is covered by that suite's own byte-pin: `editRule`
// replaces an exact substring of the live AGENTS.md paragraph, so a stale number there makes the
// mutant a no-op and `premiseHolds("the operator actually changed the document")` throws. That is
// how the site was found on 2026-09-01, after this probe reported clean.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..");
const TARGET = "scripts/share-link-flash-adversary-matrix.mjs";
const TARGET_BASENAME = "share-link-flash-adversary-matrix.mjs";

/**
 * The documents that carry a line-form citation of the target, from the sweep
 *   grep -rn "share-link-flash-adversary-matrix" AGENTS.md tests/ docs/
 * with the path-only mentions dropped. Listed rather than walked because the walk would have to
 * decide which of fourteen hits are line-form, which is the same reading this exists to replace.
 */
const SITES = [
  "AGENTS.md",
  "tests/docs/fixtures/agents-heavy-phase-rule.md",
  "tests/docs/agentsHeavyPhaseRule.test.ts",
  "docs/superpowers/specs/2026-08-10-heavy-phase-semaphore-design.md",
  "docs/superpowers/plans/2026-08-10-heavy-phase-semaphore.md",
] as const;

/**
 * What each cited line must hold.
 *
 * Matched on the line's TEXT, not on a line number, so this file cannot itself go stale the way
 * the citations did: when the script moves, the expected line moves with it and only the citing
 * documents are wrong.
 */
const CONSTRUCTS = [
  {
    id: "the non-interactive playwright invocation",
    matches: (line: string) =>
      line.includes("execFileSync") && line.includes("test:e2e:share-link-flash"),
  },
  {
    id: "the --quick guard that suppresses it",
    // Narrowed to the guard that suppresses the BROWSER run, because `QUICK ?` alone also
    // matches the report-target selection at :801 -- and a citation that could mean either
    // line means neither. The probe found that itself on its first run.
    matches: (line: string) => /QUICK\s*\?\s*\[\]\s*:\s*runBrowser\(\)/.test(line),
  },
] as const;

const targetLines = readFileSync(join(ROOT, TARGET), "utf8").split("\n");

/** Every line number the target holds each construct at. One each, or the citation is ambiguous. */
const actual = CONSTRUCTS.map((c) => ({
  id: c.id,
  lines: targetLines.flatMap((l, i) => (c.matches(l) ? [i + 1] : [])),
}));

const problems: string[] = [];
for (const c of actual) {
  if (c.lines.length !== 1) {
    problems.push(
      `${TARGET}: ${c.id} occurs at ${c.lines.length} lines (${c.lines.join(", ")}); ` +
        `a citation cannot name one line of many`,
    );
  }
}

/**
 * The cited numbers, read out of the documents themselves, in BOTH forms the rule uses.
 *
 * `matrix.mjs:1042` is the ordinary one. The `--quick` half is written as prose -- "the mode
 * is load-bearing, `--quick` spawns none and stays unwrapped, line 1243" -- and a sweep that
 * only knew the `path:N` form found one stale number where there were two. Scanned PER LINE
 * and only on lines that name the target, so a bare "line 1243" elsewhere is not swept up.
 */
type Citation = { line: number; form: "path" | "prose" };
const cited = new Map<string, Citation[]>();
/**
 * Bare `line N` tokens on a target-naming line that no path citation precedes.
 *
 * REPORTED rather than guessed at, and that is the whole design decision. A fourth stale citation
 * lived at agentsHeavyPhaseRule.test.ts:984 -- an `editRule` mutant string carrying "stays
 * unwrapped, line 1215" with no path beside it -- and a scanner that silently skipped it would
 * have called this repair complete while the suite still red. Guessing the target instead would be
 * worse: these documents name other scripts and their line numbers on the very same line.
 */
const unattributed: string[] = [];
for (const site of SITES) {
  const found: Citation[] = [];
  for (const line of readFileSync(join(ROOT, site), "utf8").split("\n")) {
    if (!line.includes("share-link-flash-adversary-matrix")) continue;
    // Backslashes stripped first: agentsHeavyPhaseRule.test.ts:221 pins the citation as a REGEX,
    // `matrix\.mjs:1014`, and a scanner that did not strip them would report that site clean while
    // it still named the old line. Found by this probe on its third run.
    const flat = line.replace(/\\/g, "");
    // A bare "line 1243" is attributed to the MOST RECENT path citation before it, because the
    // rule is one physical line naming two different scripts and their line numbers. Scoping only
    // per line attributed `build-artifact-gate.test.ts`'s "line 103" to this script -- the probe
    // found that itself on its second run, which is the whole argument for having it.
    let current: string | null = null;
    const token = /([\w./-]+\.(?:mjs|ts|tsx)):(\d+)|\bline (\d+)\b|([\w./-]+\.(?:mjs|ts|tsx))\b/g;
    for (const m of flat.matchAll(token)) {
      if (m[1] !== undefined && m[2] !== undefined) {
        current = m[1];
        if (m[1].endsWith(TARGET_BASENAME)) found.push({ line: Number(m[2]), form: "path" });
      } else if (m[3] !== undefined) {
        if (current === null) {
          // Nothing to attribute it to. NOT skipped: a fourth stale citation lived exactly here.
          unattributed.push(`${site}: "line ${m[3]}" follows no file citation on its own line`);
        } else if (current.endsWith(TARGET_BASENAME)) {
          found.push({ line: Number(m[3]), form: "prose" });
        }
        // Otherwise it belongs to another file named earlier on the line, which is correct
        // attribution and not this probe's business.
      } else if (m[4] !== undefined) {
        current = m[4];
      }
    }
  }
  if (found.length > 0) cited.set(site, found);
}

// PREMISE: a regex that matched nothing would report every citation resolving.
if (cited.size === 0) {
  problems.push(
    `no line-form citation of ${TARGET} was found in any of the ${String(SITES.length)} sites; ` +
      `either the sweep is stale or this probe's pattern is`,
  );
}

problems.push(...unattributed);

/**
 * Each citation FORM names its own construct, and a union would not.
 *
 * Whole-diff review round 1 measured this: the check was membership in one set holding both
 * lines, so changing an invocation citation to the `--quick` guard's line passed and the probe
 * printed "every line-form citation resolves". Two wrong citations that happen to swap are
 * exactly the failure a citation check exists to catch.
 *
 * The mapping is the convention these documents already use, verified across all eight sites: a
 * `path:N` citation names the playwright invocation, and a prose "line N" attributed to this
 * script names the `--quick` guard that suppresses it.
 */
const EXPECTED_BY_FORM = { path: CONSTRUCTS[0].id, prose: CONSTRUCTS[1].id } as const;
const lineOf = new Map(actual.map((c) => [c.id, c.lines]));
for (const [site, citations] of cited) {
  for (const c of citations) {
    const want = EXPECTED_BY_FORM[c.form];
    const lines = lineOf.get(want) ?? [];
    if (!lines.includes(c.line)) {
      const at = (targetLines[c.line - 1] ?? "").trim();
      problems.push(
        `${site}: its ${c.form}-form citation names ${TARGET}:${String(c.line)}, which holds ` +
          `${JSON.stringify(at)} — a ${c.form}-form citation names ${want}, at ` +
          `${lines.join(", ")}`,
      );
    }
  }
}

for (const [site, citations] of cited) {
  console.log(`${site}: cites ${citations.map((c) => `${String(c.line)} (${c.form})`).join(", ")}`);
}
for (const c of actual) console.log(`${TARGET}: ${c.id} at ${c.lines.join(", ")}`);
if (problems.length > 0) {
  console.error("");
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log("every line-form citation resolves to the construct its prose claims");
