/**
 * Acceptance checks for `docs/superpowers/plans/ci/2026-08-28-table-provenance.md`.
 *
 * Exists because plan review rounds 1 and 2 found the same defect twice, one level
 * apart: acceptance criteria whose named command could not fail. Round 1 found four
 * criteria with no command at all. Round 2 found that the commands added in response
 * were a PRODUCER (the census exits 0 for any population, so a stale spec figure
 * cannot red it) and a set of UNANCHORED greps (removing a table row while leaving
 * the filename in prose still passed, and so did duplicating it).
 *
 * So this file ASSERTS. Every check states what it decides and exits non-zero when
 * it is false. `pnpm exec tsx <this file>` is the single command the plan's
 * verification surface names for AC-1 through AC-5.
 *
 * Deliberately NOT under `lib/` or `scripts/`: the arc ships no source change, and
 * this is a probe-directory acceptance check for one document, not a corpus lint.
 * The distinction matters and the spec's §5 turns on it — a checker for one
 * document's own claims is not the general marker the row asked for.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const read = (rel: string): string => readFileSync(`${ROOT}/${rel}`, "utf8");

const SPEC = "docs/superpowers/specs/ci/2026-08-28-table-provenance.md";
const CENSUS = "docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts";
const PROBES_README = "docs/superpowers/specs/ci/probes/README.md";
const PLANS_README = "docs/superpowers/plans/ci/README.md";
const LIMITS = "docs/review-rounds/LIMITS.md";
const ANCHOR = "8b4d521cac00";

const failures: string[] = [];
const check = (label: string, ok: boolean, detail: string): void => {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

// ---- AC-1: the census output AGREES with the figures the spec states ----------
// The census is a producer; running it proves nothing on its own. This compares.
const censusOut = execFileSync(
  "pnpm",
  ["exec", "tsx", CENSUS, "--at", ANCHOR],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 },
);
const specText = read(SPEC);

const num = (re: RegExp, hay: string): string | null => re.exec(hay)?.[1] ?? null;
const censusTables = num(/every table remark parses under `docs\/\*\*` \| (\d+) \|/, censusOut);
const censusNumeric = num(/with at least one number in a body cell \| (\d+) \|/, censusOut);
const censusAdjacent = num(/adjacent to a shell fence \| (\d+) \|/, censusOut);
const censusPure = num(/pure, read-only, deterministic \| (\d+) \|/, censusOut);

check("AC-1 census printed its table population", censusTables !== null, "no population row in output");
check(
  `AC-1 spec's table count matches the census (${censusTables})`,
  censusTables !== null && specText.includes(censusTables),
  `census says ${censusTables}; the spec does not contain it`,
);
check(
  `AC-1 spec's numeric count matches the census (${censusNumeric})`,
  censusNumeric !== null && specText.includes(`${censusNumeric} of ${censusTables}`),
  `census says ${censusNumeric}; the spec has no "${censusNumeric} of ${censusTables}"`,
);
check(
  `AC-1 spec's adjacency figure matches the census (${censusAdjacent})`,
  censusAdjacent !== null && specText.includes(`| adjacent to a shell fence | ${censusAdjacent} |`),
  `census says ${censusAdjacent}; the spec's §6 row disagrees`,
);
check(
  `AC-1 spec's pure-population figure matches the census (${censusPure})`,
  censusPure !== null && specText.includes(`deterministic | ${censusPure} |`),
  `census says ${censusPure}; the spec's §6 row disagrees`,
);
check(
  "AC-1 the anchor the spec states is the anchor the census ran at",
  censusOut.startsWith(`base: ${ANCHOR}`) && specText.includes(ANCHOR),
  "the spec's stated sha and the census header disagree",
);

// ---- AC-2: --at with no value FAILS LOUD rather than defaulting ---------------
let bareAtExit = 0;
let bareAtErr = "";
try {
  execFileSync("pnpm", ["exec", "tsx", CENSUS, "--at"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
} catch (e) {
  const err = e as { status?: number; stderr?: string };
  bareAtExit = err.status ?? 0;
  bareAtErr = err.stderr ?? "";
}
check(
  "AC-2 bare `--at` exits 2 instead of silently defaulting to HEAD",
  bareAtExit === 2 && /--at requires a revision/.test(bareAtErr),
  `exit was ${bareAtExit}`,
);

// ---- AC-3: the index rows are TABLE ROWS, exactly one each --------------------
// Anchored on the row shape, not the bare filename: prose mentioning the file
// passed the unanchored grep, and so did a duplicate.
const rowCount = (text: string, target: string): number =>
  text.split("\n").filter((l) => /^\s*\|/.test(l) && l.includes(target)).length;

check(
  "AC-3 the census has exactly one index ROW in the probes README",
  rowCount(read(PROBES_README), "2026-08-28-table-provenance-census.mts") === 1,
  `found ${rowCount(read(PROBES_README), "2026-08-28-table-provenance-census.mts")}`,
);
check(
  "AC-3 the plan has exactly one index ROW in the plans/ci README",
  rowCount(read(PLANS_README), "2026-08-28-table-provenance.md") === 1,
  `found ${rowCount(read(PLANS_README), "2026-08-28-table-provenance.md")}`,
);

// ---- AC-4: LIMITS parity, owner, and a trigger that is FALSE today ------------
const limits = read(LIMITS);
const block = limits.slice(
  limits.indexOf("## LIM-NUMERIC-TABLE-PROVENANCE"),
  limits.indexOf("## LIM-", limits.indexOf("## LIM-NUMERIC-TABLE-PROVENANCE") + 10),
);
const namedBy = block.slice(block.indexOf("**Named by:**"), block.indexOf("**Trigger FIRED"));
const arcs = [...namedBy.matchAll(/([a-z0-9/-]+\.md) \((\d+)/g)];
const declaredArcs = Number(/\*\*Named by:\*\* (\d+) arcs/.exec(block)?.[1] ?? "0");
const declaredRounds = Number(/about \*\*(\d+) rounds\*\*/.exec(block)?.[1] ?? "0");

check("AC-4 declared arc count equals the enumeration", declaredArcs === arcs.length,
  `declared ${declaredArcs}, enumerated ${arcs.length}`);
check("AC-4 per-arc rounds sum to the declared total",
  arcs.reduce((a, m) => a + Number(m[2]), 0) === declaredRounds,
  `sum ${arcs.reduce((a, m) => a + Number(m[2]), 0)} vs declared ${declaredRounds}`);
check("AC-4 an owning record is named, and it is not `none`",
  /\*\*Owning record:\*\*\s*`?docs\/superpowers\/specs\/ci\/2026-08-28-table-provenance\.md/.test(block),
  "owning record missing or set to none");
check("AC-4 the re-file trigger is a FORWARD condition, false at this head",
  /four or more tables whose producing commands are pure/.test(block) && /AFTER 2026-08-28|superseding the original/.test(block),
  "trigger is absent, or phrased over history so it fires on arrival");

// ---- AC-5: the probes README cross-reference RESOLVES to the record -----------
const probes = read(PROBES_README);
check(
  "AC-5 the convention cross-references tables AND links the LIMITS record",
  /named by eleven arcs/.test(probes) && /review-rounds\/LIMITS\.md/.test(probes) &&
    /2026-08-28-table-provenance\.md/.test(probes),
  "the phrase survives but the cross-reference or the record link does not",
);

console.log(
  failures.length === 0
    ? `\nall checks passed (${ANCHOR})`
    : `\n${failures.length} FAILED: ${failures.join("; ")}`,
);
process.exit(failures.length === 0 ? 0 : 1);
