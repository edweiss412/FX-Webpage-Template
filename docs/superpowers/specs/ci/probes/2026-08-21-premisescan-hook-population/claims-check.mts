/**
 * DERIVED cover over the spec's own claims.
 *
 * Two earlier sweeps on this arc reported clean over the wrong population: one
 * enumerated §5.2's table rows, and the re-analysis that replaced it still left
 * two of the five defect sites uncovered. A clean result over the wrong
 * population is indistinguishable from a clean result over the right one, so the
 * population here is READ OUT OF THE SPEC rather than typed in.
 *
 * Two checks, each closing a class that has already produced a finding:
 *
 *   A. Every limit row declared in §4 has a probe in limits-check.mts, and
 *      limits-check probes nothing that §4 does not declare. A new limit row
 *      with no probe REDS instead of being silently uncovered.
 *   B. Every fenced `$ …` command in the spec that names a probe script resolves
 *      to a file that exists. That is spec review r2 finding 3's class made
 *      mechanical; checking it by hand is the method that produced the clean
 *      sweeps above.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SPEC = join(ROOT, "docs/superpowers/specs/2026-08-21-premisescan-hook-attachment.md");
const LIMITS = join(ROOT, "docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population/limits-check.mts");

const spec = readFileSync(SPEC, "utf8");
const limits = readFileSync(LIMITS, "utf8");
if (spec.length === 0 || limits.length === 0) {
  console.error("claims-check: an empty read is a broken check, not a clean result");
  process.exit(2);
}

let failed = false;

// ---- A. §4's declared limit rows vs limits-check's probes --------------------
const declared = [...spec.matchAll(/^\| \*\*(L\d+)\*\*/gm)].map((m) => m[1]!);
const probed = [...limits.matchAll(/say\("(L\d+)"/g)].map((m) => m[1]!);
if (declared.length === 0) {
  console.error("claims-check: no limit rows found in §4 — the selector no longer matches the table");
  process.exit(2);
}
const missing = declared.filter((l) => !probed.includes(l));
const extra = probed.filter((l) => !declared.includes(l));
console.log(`A. §4 declares ${declared.length} limit rows: ${declared.join(" ")}`);
console.log(`   limits-check probes ${probed.length}: ${probed.join(" ")}`);
if (missing.length) {
  console.log(`   FAIL declared but not probed: ${missing.join(" ")}`);
  failed = true;
}
if (extra.length) {
  console.log(`   FAIL probed but not declared: ${extra.join(" ")}`);
  failed = true;
}
if (!missing.length && !extra.length) console.log("   PASS every declared limit has a probe, and no probe is orphaned");

// ---- B. every probe script named by ANY of the arc's documents resolves -------
//
// The document population is DERIVED, not listed: every tracked markdown file
// under docs/ that mentions this probe directory. That is the spec, its probe
// record and the plan today, and any later arc document by default. Scanning the
// spec alone missed `probe-decompose.mts`, which the probe record runs as a fenced
// command and the spec names only in AC-9's prose — so a misspelled or deleted
// script passed the check while the AC it serves went unproved (plan review r1
// finding 2).
//
// Both citation FORMS are extracted, because the earlier version keyed on the
// fenced-command form alone and a prose citation is equally a claim that the file
// exists.
const PROBE_DIR = "docs/superpowers/specs/ci/probes/2026-08-21-premisescan-hook-population";
const docs = execFileSync("git", ["ls-files", "docs"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f: string) => f.endsWith(".md"))
  .filter((f: string) => {
    try {
      return readFileSync(join(ROOT, f), "utf8").includes(PROBE_DIR);
    } catch {
      return false;
    }
  });
if (docs.length === 0) {
  console.error("claims-check: no document mentions the probe directory — the document selector is broken");
  process.exit(2);
}
const cmds: string[] = [];
for (const d of docs) {
  const text = readFileSync(join(ROOT, d), "utf8");
  for (const m of text.matchAll(/^\$ .*?(docs\/superpowers\/specs\/ci\/probes\/\S+\.mts)/gm)) cmds.push(m[1]!);
  for (const m of text.matchAll(/`([a-z0-9-]+\.mts)`/g)) cmds.push(`${PROBE_DIR}/${m[1]!}`);
}
const uniq = [...new Set(cmds)];
console.log(`\nB. ${docs.length} arc documents scanned (derived: tracked docs/**.md naming the probe directory)`);
for (const d of docs) console.log(`      ${d}`);
console.log(`   ${uniq.length} distinct probe scripts named across them`);
if (uniq.length === 0) {
  console.error("   claims-check: the citation selectors matched nothing — they no longer match these documents");
  process.exit(2);
}
for (const c of uniq) {
  const ok = existsSync(join(ROOT, c));
  console.log(`   ${ok ? "PASS" : "FAIL"} ${c}`);
  if (!ok) failed = true;
}

// ---- C. the spec's declared cell TOTAL equals the cells that actually run -----
//
// The risk is a UNITS one and it is invisible in prose: a distinct-count and a
// cell-count both render as a bare number, so a document can publish "5 inputs and
// 7 implementations" beside a total of 16 and read as arithmetic that does not
// add. Asserting the sum inside cell-check would be an identity; asserting the
// spec's stated total against the script's real cell count is a claim that can be
// wrong, and this is where it is checked.
{
  const declared = [...spec.matchAll(/(\d+) in total, pinned by `cell-check\.mts`/g)].map((m) => Number(m[1]));
  const script = readFileSync(join(ROOT, PROBE_DIR, "cell-check.mts"), "utf8");
  const pinned = [...script.matchAll(/results\.length !== (\d+)/g)].map((m) => Number(m[1]));
  console.log(`\nC. spec declares a cell total ${declared.length ? declared.join("/") : "(none found)"}; cell-check pins ${pinned.length ? pinned.join("/") : "(none found)"}`);
  if (declared.length !== 1 || pinned.length !== 1) {
    console.error("   claims-check: expected exactly one declared total and one pin — the selectors no longer match");
    process.exit(2);
  }
  if (declared[0] !== pinned[0]) {
    console.log(`   FAIL the spec says ${declared[0]} cells, cell-check pins ${pinned[0]}`);
    failed = true;
  } else {
    console.log(`   PASS both say ${declared[0]}`);
  }
}

// ---- D. every SPLIT the spec states about §5.2, against cell-check's own output --
//
// C covers the TOTAL at one declared site. It reported PASS while four other
// mentions of the same population were stale — "All sixteen §5.2 cells", "7 of
// 16", "the 9 reporting cells", "pins the total at 16" — and the script's own
// banner printed "nine" above ten rows while its derived total was right. A check
// that covers one site of a class is a clean result over the wrong population,
// which is the defect this file was opened to close.
//
// The legal values are not typed here: cell-check is RUN and its derived
// `R reporting + S silent = T cells` line is the authority. Every selector must
// match at least once — a selector that matches nothing has rotted, and silently
// covering zero sites is how this class survives.
{
  const out = execFileSync("pnpm", ["exec", "tsx", join(PROBE_DIR, "cell-check.mts")], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const derived = out.match(/(\d+) reporting \+ (\d+) silent = (\d+) cells/);
  if (derived === null) {
    console.error("   claims-check: cell-check no longer prints its derived split");
    process.exit(2);
  }
  const R = Number(derived[1]), S = Number(derived[2]), T = Number(derived[3]);
  console.log(`\nD. cell-check derives ${R} reporting + ${S} silent = ${T}; every spec split must agree`);

  const WORDS: Record<string, number> = {
    five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
    fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  };
  const selectors: { what: string; re: RegExp; want: number; word?: true }[] = [
    { what: "§5.2 heading count (word)", re: /All (\w+) §5\.2 cells/g, want: T, word: true },
    { what: "pre-change / post-change figures", re: /\*\*7 of (\d+)\*\*|\*\*(\d+) of \2\*\* where the change exists/g, want: T },
    { what: "AC-4 reporting split", re: /every one of the (\d+) reporting cells/g, want: R },
    { what: "AC-4 silent split", re: /every one of the (\d+) silent cells/g, want: S },
    { what: "AC-4 pin", re: /pins the total at (\d+)/g, want: T },
    { what: "§5.2 prose reporting (word)", re: /(\w+) reporting cells and \w+ silent cells/g, want: R, word: true },
    { what: "§5.2 prose silent (word)", re: /\w+ reporting cells and (\w+) silent cells/g, want: S, word: true },
    { what: "§5.2 prose total", re: /reporting cells and \w+ silent cells — (\d+) in total/g, want: T },
    { what: "§3.4 transcript reporting", re: /(\d+) reporting \+ \d+ silent/g, want: R },
    { what: "§3.4 transcript silent", re: /\d+ reporting \+ (\d+) silent/g, want: S },
    { what: "§3.4 transcript total", re: /reporting \+ \d+ silent = (\d+) cells/g, want: T },
    { what: "§3.4 pre-change reporting (word)", re: /the (\w+) reporting cells fail because/g, want: R, word: true },
  ];
  for (const sel of selectors) {
    const hits = [...spec.matchAll(sel.re)];
    if (hits.length === 0) {
      console.error(`   claims-check: selector "${sel.what}" matched nothing — it has rotted`);
      process.exit(2);
    }
    for (const h of hits) {
      const raw = h.slice(1).find((g) => g !== undefined)!;
      const got = sel.word === true ? WORDS[raw.toLowerCase()] : Number(raw);
      const ok = got === sel.want;
      console.log(`   ${ok ? "PASS" : "FAIL"} ${sel.what}: ${raw}`);
      if (!ok) failed = true;
    }
  }
}

console.log(`\n${failed ? "FAILED" : "PASSED"} — population derived from the spec, not enumerated here`);
process.exit(failed ? 1 : 0);
