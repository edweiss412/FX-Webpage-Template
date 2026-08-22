#!/usr/bin/env node
// WHOLE-INSTRUMENT CLAIM AUDIT (bl-orch condition for round 5).
//
// Every number a document states about this arc's suites or artifacts is either
// DERIVED (a command in the repo produces it) or HAND-CARRIED (a person typed
// it). Round 4's finding 9 was instance five of the hand-carried class, filed one
// commit after the ledger row about that class — which is what "describing the
// list is not running it" means. This RUNS it.
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DOCS = [
  "docs/superpowers/specs/ci/probes/2026-08-21-intraleg-process-probe.md",
  "docs/superpowers/specs/ci/probes/2026-08-21-intraleg-killer-audit.md",
  "BACKLOG-archive.md",
];
// The artifact is DISCOVERED, not named. A hardcoded path made the auditor's own
// reference hand-carried — the very class it audits — and it silently compared
// the r4 documents against the r3 campaign. Newest campaign directory wins;
// override with `--artifact <path>` when auditing a specific run.
const flagIdx = process.argv.indexOf("--artifact");
const ART =
  flagIdx > -1
    ? process.argv[flagIdx + 1]
    : (() => {
        const root = ".mutation-records";
        const dirs = readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name.startsWith("campaign-"))
          .map((e) => e.name)
          .sort();
        if (dirs.length === 0) throw new Error("no campaign-* directory under .mutation-records");
        return `${root}/${dirs[dirs.length - 1]}/campaign.json`;
      })();
console.log(`auditing against ${ART}`);
const doc = JSON.parse(readFileSync(ART, "utf8"));
const agg = doc.aggregate;
const bound = (n) => (1 - Math.pow(0.05, 1 / n)).toFixed(4);

// The suite count comes from RUNNING the suite. Taking it from an env var makes
// the audit's own headline figure hand-carried, which is the class it audits.
let cases;
const inProcessCases = () => {
  if (cases === undefined) {
    const out = execFileSync("pnpm", ["exec", "vitest", "run", SUITE], { encoding: "utf8" });
    cases = (out.match(/Tests +(\d+) passed/) ?? [])[1] ?? "unknown";
  }
  return cases;
};
const SUITE = "tests/mutation/source/processProbe.test.ts";
const armOf = (id) => agg.arms.find((a) => a.arm === id);
const C = agg.conditions.filter((c) => c.half);
const dur = (h) => (C.find((c) => c.half === h)?.children ?? []).at(-1)?.durationMs;

// TRUTH, computed here and nowhere else.
const truth = new Map([
  ["arm-A bound", `p > ${bound(armOf("A").eligible)}`],
  ["anchor stamp", agg.anchorDigest],
  ["arm A eligible", String(armOf("A").eligible)],
  ["arm B eligible", String(armOf("B").eligible)],
  ["arm C eligible", String(armOf("C").eligible)],
  ["default dir entries", String(doc.defaultBefore.length)],
  ["arm-C quiet ms", String(dur("quiet"))],
  ["arm-C loaded ms", String(dur("loaded"))],
  ["flips", String(agg.flips.length)],
]);

// Every figure the docs state, extracted and checked against the truth above.
const checks = [
  {
    label: "arm-A bound",
    re: /p > (0\.\d{4})/g,
    want: truth.get("arm-A bound").replace("p > ", ""),
  },
  {
    label: "anchor stamp",
    re: /\b(46fd37cf0f07|[0-9a-f]{12})\b/g,
    want: truth.get("anchor stamp"),
    only: /anchor stamp/i,
  },
  { label: "arm-C quiet ms", re: /(\d{2}) ?(\d{3}) ms/g, want: null },
];

let bad = 0;
// SCOPING, and the first run needed both of these — an audit that reports the
// wrong figures is the thing it exists to prevent, one level up.
//
//  * BACKLOG-archive.md holds hundreds of unrelated entries. Only THIS arc's is
//    in scope, so the file is sliced to its own row.
//  * The probe record QUOTES spec §3 verbatim, and that pre-registration contains
//    a worked example ("11 eligible trials support p > 0.2384") which is not a
//    claim about this campaign. Blockquoted lines are stripped — the same
//    use-versus-mention error two other guards on this machine made today.
const scoped = (file, src) => {
  const noQuotes = src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith(">"))
    .join("\n");
  if (!file.endsWith("BACKLOG-archive.md")) return noQuotes;
  const start = noQuotes.indexOf("## BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG");
  if (start < 0) throw new Error("this arc's archive entry is missing — audit cannot scope");
  const end = noQuotes.indexOf("\n## ", start + 10);
  return noQuotes.slice(start, end < 0 ? undefined : end);
};

for (const f of DOCS) {
  const src = scoped(f, readFileSync(f, "utf8"));
  // the bound, wherever it appears
  for (const m of src.matchAll(/p > (0\.\d{4})/g)) {
    if (m[1] !== truth.get("arm-A bound").replace("p > ", "")) {
      console.log(`STALE  ${f}: bound ${m[1]} != ${truth.get("arm-A bound")}`);
      bad++;
    }
  }
  // durations, written with a thin space in prose (e.g. "29 214 ms")
  for (const m of src.matchAll(/(\d{1,3}(?: \d{3})+) ms/g)) {
    const n = m[1].replace(/ /g, "");
    if (n !== truth.get("arm-C quiet ms") && n !== truth.get("arm-C loaded ms")) {
      console.log(
        `STALE  ${f}: duration ${n} ms is in NEITHER half of the r3 artifact ` +
          `(quiet ${truth.get("arm-C quiet ms")}, loaded ${truth.get("arm-C loaded ms")})`,
      );
      bad++;
    }
  }
  // "N entries" for the default record channel
  for (const m of src.matchAll(/(\d+) entries, byte-identical/g)) {
    if (m[1] !== truth.get("default dir entries")) {
      console.log(`STALE  ${f}: ${m[1]} entries != ${truth.get("default dir entries")}`);
      bad++;
    }
  }
  // suite counts must match a live run
  for (const m of src.matchAll(/(\d+) in-process cases/g)) {
    if (m[1] !== inProcessCases()) {
      console.log(`STALE  ${f}: ${m[1]} in-process cases != ${inProcessCases()}`);
      bad++;
    }
  }
}
console.log(bad === 0 ? "CLAIM AUDIT CLEAN" : `CLAIM AUDIT: ${bad} stale figure(s)`);
process.exit(bad === 0 ? 0 : 1);
