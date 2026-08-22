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
        // NOT a lexical sort: `campaign-…-r10` sorts BEFORE `…-r4`, so the
        // tenth campaign would never be "newest" and the audit would silently
        // compare against an older run — the same defect as the hardcoded path
        // it replaced, one release later. Ordered by the trailing run number
        // when there is one, then by name.
        const runNo = (n) => Number((n.match(/-r(\d+)$/) ?? [])[1] ?? -1);
        const dirs = readdirSync(root, { withFileTypes: true })
          .filter((e) => e.isDirectory() && e.name.startsWith("campaign-"))
          .map((e) => e.name)
          .sort((a, b) => runNo(a) - runNo(b) || a.localeCompare(b));
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
//
// ONE table, and the loop below iterates IT. The previous shape built a `checks`
// array and then bypassed it with hardcoded regexes in the loop, so the array was
// computed and never read — the same derive-and-discard defect this audit exists
// to catch, sitting inside the auditor. Diff review r5 found it, and the
// self-check under the loop is what stops it coming back: a truth nothing
// consumes is a FAILURE here, not a quiet no-op.
//
// `scan` takes the scoped document text and returns the values it states for this
// figure. `want` is the truth. A check that finds nothing is silent by design —
// not every document states every figure — which is exactly why the self-check
// below tests CONSUMPTION of the truth key rather than presence of a match.
const checks = [
  {
    key: "arm-A bound",
    scan: (src) => [...src.matchAll(/p > (0\.\d{4})/g)].map((m) => m[1]),
    want: () => truth.get("arm-A bound").replace("p > ", ""),
    noun: "bound",
  },
  {
    key: "anchor stamp",
    // Scoped to lines that NAME the stamp: a bare 12-hex pattern also matches
    // commit shas, receipt prefixes and nonces, none of which are this figure.
    scan: (src) =>
      src
        .split("\n")
        .filter((l) => /anchor stamp/i.test(l))
        .flatMap((l) => [...l.matchAll(/\b([0-9a-f]{12})\b/g)].map((m) => m[1])),
    want: () => truth.get("anchor stamp"),
    noun: "anchor stamp",
  },
  {
    key: "arm-C quiet ms",
    scan: (src) => [...src.matchAll(/(\d{1,3}(?: \d{3})+) ms/g)].map((m) => m[1].replace(/ /g, "")),
    // Durations are checked as a SET: prose quotes either half, and which one
    // appears is not a property of the figure.
    want: () => [truth.get("arm-C quiet ms"), truth.get("arm-C loaded ms")],
    noun: "duration (ms)",
  },
  {
    key: "default dir entries",
    scan: (src) => [...src.matchAll(/(\d+) entries, byte-identical/g)].map((m) => m[1]),
    want: () => truth.get("default dir entries"),
    noun: "default-channel entries",
  },
  {
    key: "in-process cases",
    scan: (src) => [...src.matchAll(/(\d+) in-process cases/g)].map((m) => m[1]),
    want: () => inProcessCases(),
    noun: "in-process cases",
  },
  // ── added at r5: derived since the first version, compared by none of it ──
  //
  // The arm table row `| A | 12 | 12 | 12 | 12 | 0 |` and the `12/6/2` prose
  // form are the two places these appear. Both are read, because a document
  // that updates one and not the other is precisely the drift being audited.
  ...["A", "B", "C"].map((arm) => ({
    key: `arm ${arm} eligible`,
    scan: (src) => {
      const rows = [
        ...src.matchAll(
          new RegExp(
            `^\\|\\s*${arm}\\s*\\|\\s*\\d+\\s*\\|\\s*\\d+\\s*\\|\\s*\\d+\\s*\\|\\s*(\\d+)\\s*\\|`,
            "gm",
          ),
        ),
      ].map((m) => m[1]);
      const idx = { A: 1, B: 2, C: 3 }[arm];
      const prose = [...src.matchAll(/\b(\d+)\/(\d+)\/(\d+)\b(?=[^\n]{0,40}eligible)/g)].map(
        (m) => m[idx],
      );
      return [...rows, ...prose];
    },
    want: () => truth.get(`arm ${arm} eligible`),
    noun: `arm ${arm} eligible count`,
  })),
  {
    key: "flips",
    // "zero flips" and "no eligible trial flipped" are the prose forms of 0.
    // A numeric form is read too, so a future POSITIVE campaign is covered
    // rather than silently unaudited.
    scan: (src) => {
      const worded = /zero flips|no eligible trial (?:in any arm )?flip(?:ped|s)/i.test(src)
        ? ["0"]
        : [];
      const numeric = [...src.matchAll(/(\d+) (?:eligible )?flips?\b/gi)].map((m) => m[1]);
      return [...worded, ...numeric];
    },
    want: () => truth.get("flips"),
    noun: "flip count",
  },
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

// SELF-CHECK, and the reason this file cannot regrow the defect r5 found in it.
// A figure computed into `truth` and consumed by no check is DEAD DERIVATION —
// it reads as covered and audits nothing. Four of the nine were exactly that
// before r5 (the three arm eligible counts and the flip count), and the audit
// still printed CLEAN. Aliases are declared, never inferred: the loaded-half
// duration is consumed inside the quiet-half check, which compares both as a
// set, so it is named here rather than given a check of its own.
const CONSUMED_BY_ALIAS = new Map([["arm-C loaded ms", "arm-C quiet ms"]]);
{
  const covered = new Set(checks.map((c) => c.key));
  const dead = [...truth.keys()].filter(
    (k) => !covered.has(k) && !covered.has(CONSUMED_BY_ALIAS.get(k)),
  );
  if (dead.length > 0) {
    console.log(
      `AUDIT DEFECT: ${dead.length} derived truth(s) that no check consumes: ${dead.join(", ")}`,
    );
    console.log("A figure this audit computes and never compares is not coverage.");
    process.exit(2);
  }
}

for (const f of DOCS) {
  const src = scoped(f, readFileSync(f, "utf8"));
  for (const check of checks) {
    const want = check.want();
    const accept = Array.isArray(want) ? want : [want];
    for (const found of check.scan(src)) {
      if (!accept.includes(found)) {
        console.log(
          `STALE  ${f}: ${check.noun} ${found} != ${accept.join(" or ")} ` + `(from ${ART})`,
        );
        bad++;
      }
    }
  }
}
console.log(bad === 0 ? "CLAIM AUDIT CLEAN" : `CLAIM AUDIT: ${bad} stale figure(s)`);
process.exit(bad === 0 ? 0 : 1);
