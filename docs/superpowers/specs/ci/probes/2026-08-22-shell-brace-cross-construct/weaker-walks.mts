// Rebuilds every strictly-weaker walk FROM THE CANDIDATE, one named weakening
// each, and asserts that the fixture set of `shapes.mts` kills each one — by
// the fixtures that are supposed to kill it, not merely by some fixture.
//
// Why this is a probe and not a table in the plan. The kill attribution was
// prose for four review rounds, and plan review round 1 finding 4 measured what
// that costs: the numbers contradicted each other, because an earlier cut had
// built each walk from whatever the prototype was on the day, so the walks
// predating spec round 4 carried TWO weakenings rather than one. Every score
// was depressed and every attribution wrong — all seven appeared to die to
// `P4`/`P5`, which tests only the round-4 guard. A table nobody can re-run
// cannot be caught being wrong.
//
// Each walk is ONE weakening, applied to the candidate by anchored substitution
// rather than by a stored copy, so it tracks whatever Task 3 actually writes. A
// hunk that does not match ABORTS: the guard the walk exists to remove is not
// where this probe expects it, and a silently-unapplied transform would yield a
// CLONE of the candidate that passes every row and reads as "no impostor here".
//
//   pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/weaker-walks.mts
//
// `SCAN_MODULE` selects the candidate (default: the tracked scanner). Exit 0
// only when every walk dies to exactly its declared killers.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

// Six levels: .../docs/superpowers/specs/ci/probes/<arc>/ — matches `shapes.mts:186`.
const ROOT = resolve(import.meta.dirname, "../../../../../..");
const TRACKED = "tests/cross-cutting/psqlStartupFiles/scan.ts";
const SHAPES = join(
  ROOT,
  "docs/superpowers/specs/ci/probes/2026-08-22-shell-brace-cross-construct/shapes.mts",
);

type Hunk = { before: string; after: string };
type Walk = {
  id: string;
  /** The single weakening, in the words the plan's table uses. */
  weakening: string;
  /** The fixtures that MUST be the ones that kill it. A walk dying to some
   *  other row is not this walk's proof — it is an unexplained result, and the
   *  attribution rule this arc keeps re-learning says a count is not a kill. */
  killers: string[];
  hunks: Hunk[];
};

const WALKS: Walk[] = [
  {
    id: "w1",
    weakening: "quotes are not openers in the bare walk",
    killers: ["Q1-dq-inside-subst-inside-dq", "C4-quoted-paren-in-subst"],
    hunks: [
      { before: "  if (character === \"'\") return text.indexOf(\"'\", i + 1);\n  if (character === '\"') return doubleQuotedEnd(text, i + 1);", after: "  // W1: quotes are not openers." },
    ],
  },
  {
    id: "w2",
    weakening: "ONE recognizer shared by both lexical contexts",
    killers: ["W2k-squote-in-dq-in-subst", "W2k-squote-in-dq-in-dq-target"],
    hunks: [
      { before: "      k = span.index;\n      continue;", after: "      k = span.index;\n      continue;\n    }\n    // W2: one recognizer for both contexts.\n    if (character === \"'\") {\n      const end = text.indexOf(\"'\", k + 1);\n      if (end === -1) return -1;\n      k = end;\n      continue;" },
    ],
  },
  {
    id: "w3",
    weakening: "backticks are not openers",
    killers: ["Q2-backtick-inside-subst", "Q3-subst-inside-backtick-in-brace", "W4k-unclosed-backtick-in-subst"],
    hunks: [
      { before: "  if (character === \"`\") return closingBacktick(text, i);", after: "  // W3: backticks are not openers." },
    ],
  },
  {
    id: "w4",
    weakening: "an unclosed foreign construct keeps counting instead of failing its span",
    killers: ["W4k-unclosed-backtick-in-subst"],
    hunks: [
      { before: "    if (foreign !== null) {\n      if (foreign === -1) return { index: text.length - 1, closed: false };", after: "    if (foreign !== null && foreign !== -1) {" },
    ],
  },
  {
    id: "w6",
    weakening: "`$$` missing from `attachedTargetEnd` only",
    killers: ["P2-dollardollar-attached"],
    hunks: [
      { before: "    if (character === \"$\" && text[k + 1] === \"$\") return k + 1;", after: "" },
    ],
  },
  {
    id: "w7",
    weakening: "`$$` missing from BOTH delimiter recognizers",
    killers: ["P1-dollardollar-in-brace", "P2-dollardollar-attached"],
    hunks: [
      { before: "  if (character === \"$\" && text[i + 1] === \"$\") return i + 1;", after: "" },
      { before: "      continue;\n    }\n    if (character === \"$\" && text[k + 1] === \"$\") {\n      k++;", after: "" },
      { before: "    if (character === \"$\" && text[k + 1] === \"$\") return k + 1;", after: "" },
    ],
  },
  {
    id: "w8",
    weakening: "`$$` missing from `lexShellWords` (spec round 4's own defect, isolated)",
    killers: ["P4-dollardollar-relexed-operand", "P5-dollardollar-relexed-in-dq"],
    hunks: [
      { before: "    // `$$` is the PID parameter and consumes BOTH characters. Placed AHEAD of\n    // every other `$` branch in this context, so the second `$` can never be\n    // read as opening `${`, `$(`, `$((`, `$'` or `$\"`. One guard rather than a\n    // patch at each of those five branches: the rule is about the FIRST `$`,\n    // and a per-branch fix would have to be repeated at each new branch anyone\n    // adds. Spec review round 4.\n    if (character === \"$\" && text[i + 1] === \"$\") {\n      begin(i);\n      append(\"$\", i);\n      append(\"$\", i + 1);\n      i++;\n      continue;\n    }\n", after: "" },
      { before: "          continue;\n        }\n        // `$$` binds first inside double quotes too, for the same reason.\n        if (text[i] === \"$\" && text[i + 1] === \"$\") {\n          append(\"$\", i, true);\n          append(\"$\", i + 1, true);\n          i++;", after: "" },
    ],
  },
  {
    id: "wc",
    weakening: "the `#`-comment rule: parser growth toward bash fidelity (an OVER-repair)",
    killers: ["L2-comment-hides-paren"],
    hunks: [
      { before: "  if (character === \"`\") return closingBacktick(text, i);\n  if (character === \"$\" && (text[i + 1] === \"{\" || text[i + 1] === \"(\")) {", after: "  if (character === \"`\") return closingBacktick(text, i);\n  if (character === \"#\") { const nl = text.indexOf(\"\\n\", i); return nl === -1 ? text.length - 1 : nl - 1; }\n  if (character === \"$\" && (text[i + 1] === \"{\" || text[i + 1] === \"(\")) {" },
    ],
  },
];

const candidatePath = process.env.SCAN_MODULE
  ? resolve(ROOT, process.env.SCAN_MODULE)
  : join(ROOT, TRACKED);
const candidate = readFileSync(candidatePath, "utf8");

// The walks are weakenings OF THE REPAIR. Run against the merge-base scanner
// they would be weakenings of the defect, and every tally below would describe
// nothing. `shapes.mts` refuses the same comparison for the same reason.
const baseSha = execFileSync("git", ["-C", ROOT, "merge-base", "origin/main", "HEAD"], {
  encoding: "utf8",
}).trim();
const baseline = execFileSync("git", ["-C", ROOT, "show", `${baseSha}:${TRACKED}`], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
if (candidate === baseline) {
  console.error(
    `ABORT: the candidate is byte-identical to ${TRACKED} at merge-base ${baseSha.slice(0, 12)}. ` +
      `These walks weaken the REPAIR; against the unrepaired walk they measure nothing. Run this AFTER Task 3 lands.`,
  );
  process.exit(2);
}

const cacheDir = join(ROOT, "node_modules/.cache/bracecross-weaker");
mkdirSync(cacheDir, { recursive: true });

/** Apply one walk's hunks, refusing anything but an exact single match. */
const build = (walk: Walk): string => {
  let source = candidate;
  for (const [n, hunk] of walk.hunks.entries()) {
    const occurrences = source.split(hunk.before).length - 1;
    if (occurrences !== 1) {
      console.error(
        `ABORT: ${walk.id} hunk ${n + 1} of ${walk.hunks.length} matches ${occurrences} time(s) in ${candidatePath}, expected exactly 1.\n` +
          `  The guard this walk removes is not where the probe expects it. Re-derive the hunk from the candidate; do NOT relax the match.\n` +
          `  Anchor:\n${hunk.before.replace(/^/gm, "    | ")}`,
      );
      process.exit(2);
    }
    source = source.replace(hunk.before, hunk.after);
  }
  if (source === candidate) {
    console.error(`ABORT: ${walk.id} is byte-identical to the candidate — the weakening did not apply.`);
    process.exit(2);
  }
  return source;
};

type Tally = { met: number; accept: number; limitsOk: number; limits: number; rejOk: number; rej: number };

/** Run `shapes.mts --expect-repaired` against one built walk. */
const measure = (id: string, source: string): { exit: number; failing: string[]; tally: Tally } => {
  const path = join(cacheDir, `${id}.ts`);
  writeFileSync(path, source);
  let stdout = "";
  let exit = 0;
  try {
    stdout = execFileSync("pnpm", ["exec", "tsx", SHAPES, "--expect-repaired"], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, SCAN_MODULE: path },
      // Captured, never inherited: `shapes.mts` writes its own FAIL summary to
      // stderr, and a walk dying is the EXPECTED outcome here — letting it
      // through would interleave one alarming line per walk into this table.
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    exit = e.status ?? 1;
    stdout = (e.stdout ?? "") + (e.stderr ?? "");
  }
  const failing: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = line.match(/^(\S+)\s+\S+\s+\d+\s+\S+\s+\S+\s+\d+\s+(.*)$/);
    if (!m) continue;
    const status = m[2]!;
    if (status.startsWith("UNMET") || status.startsWith("MOVED") || status.startsWith("MOVEMENT CHANGED")) {
      failing.push(m[1]!);
    }
  }
  const num = (re: RegExp): [number, number] => {
    const m = stdout.match(re);
    if (!m) {
      console.error(`ABORT: ${id} produced no tally line matching ${re}. shapes.mts output:\n${stdout}`);
      process.exit(2);
    }
    return [Number(m[1]), Number(m[2])];
  };
  const [met, accept] = num(/(\d+)\/(\d+) accept-set rows meet/);
  const [limitsOk, limits] = num(/(\d+)\/(\d+) documented-limit rows/);
  const [rejOk, rej] = num(/(\d+)\/(\d+) bash-rejected rows/);
  return { exit, failing, tally: { met, accept, limitsOk, limits, rejOk, rej } };
};

const pad = (s: string, n: number): string => s.padEnd(n);
console.log(`candidate: ${candidatePath.replace(ROOT + "/", "")}   merge-base: ${baseSha.slice(0, 12)}\n`);
console.log(
  `${pad("walk", 5)} ${pad("accept", 8)} ${pad("limits", 8)} ${pad("rejected", 9)} ${pad("verdict", 9)} killers`,
);

let violations = 0;
for (const walk of WALKS) {
  const { exit, failing, tally } = measure(walk.id, build(walk));
  const expected = [...walk.killers].sort().join(",");
  const observed = [...failing].sort().join(",");
  // Two independent conditions, because either alone is satisfiable by an
  // impostor: a walk that survives is an unkilled wrong implementation, and a
  // walk that dies to the WRONG rows is a coincidence being read as proof.
  const survived = exit === 0;
  const misattributed = expected !== observed;
  if (survived || misattributed) violations++;
  console.log(
    `${pad(walk.id, 5)} ${pad(`${tally.met}/${tally.accept}`, 8)} ${pad(`${tally.limitsOk}/${tally.limits}`, 8)} ${pad(`${tally.rejOk}/${tally.rej}`, 9)} ` +
      `${pad(survived ? "SURVIVED" : misattributed ? "MISATTRIB" : "killed", 9)} ${failing.join(", ") || "(none)"}`,
  );
  if (survived) {
    console.log(`      ^ ${walk.id} (${walk.weakening}) passes every population. It is an impostor the fixture set cannot see.`);
  } else if (misattributed) {
    console.log(`      ^ expected to die to: ${walk.killers.join(", ")}`);
  }
}

console.log(`\nWALKS: ${WALKS.length} built from the candidate, one weakening each`);
if (violations > 0) {
  console.error(`\nFAIL: ${violations} walk(s) either survived the fixture set or died to rows other than their declared killers.`);
  process.exit(1);
}
console.log(`PASS: every walk dies to exactly its declared killers`);
