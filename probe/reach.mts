/**
 * Reach oracle for BL-SPECLINT-RED-REASON-VERIFICATION (design §1.2, AC-4).
 *
 * `probe/population.mts` derives WHICH markers reach the `none` drop. This one
 * ASSERTS what the shipped CLI emits at those lines, at the CLI boundary, with
 * `--exec-red` active.
 *
 * It asserts rather than prints, and the distinction is the whole point. An
 * earlier version printed a per-line table and reconciled `silent + carried ===
 * 15`, which can never fail because every inspected line increments exactly one
 * side. Spec review round 4 caught that: a script whose only output is a table
 * for a human to read is not an acceptance criterion, it is a report. Every
 * difference below exits non-zero.
 *
 * Black-box on purpose. `ownedContractLines` and `wellFormedMarkers` are not
 * exported, so an in-process reconstruction of the guard sequence would be a
 * MODEL of `collectionProbePlan` rather than the function itself.
 *
 * Both named sets are listed rather than re-derived: this probe's job is to
 * check the design's NAMED sets, so a drift between the design and the corpus
 * must surface here as a failure instead of being absorbed by a fresh
 * derivation. `MARKER_DRIFT` below is what stops a moved line from reading as a
 * quiet `SILENT`.
 *
 * Modes:
 *   (default)             assert the PRE-change state
 *   EXPECT_ADVISORY=1     assert the POST-change state: every v2 line gains
 *                         RED_PROBE_UNVERIFIED/advisory, every v1 line unchanged
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { MARKER_ANY } from "../lib/specLint/taskContract";

type Row = { file: string; line: number; group: "v2" | "v1"; expect: string[] };

/** The fifteen v2 markers reaching the `none` drop (design §1.1). */
const V2: Row[] = [
  // nine `pnpm heavy`-wrapped
  {
    file: "docs/superpowers/plans/2026-08-16-mutation-gate-sharding.md",
    line: 1237,
    group: "v2",
    expect: ["RED_TARGET_INVALID/fail"],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-premisescan-import-edge-fidelity.md",
    line: 2289,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md",
    line: 235,
    group: "v2",
    expect: ["RED_TARGET_INVALID/fail"],
  },
  {
    file: "docs/superpowers/plans/2026-08-17-red-verdict-capability.md",
    line: 124,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-17-rowactions-submenu-reveal-scroll-clamp.md",
    line: 197,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md",
    line: 926,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/ci/2026-08-17-modal-wait-candidate-contract.md",
    line: 111,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/ci/2026-08-17-modal-wait-skeleton-tolerant-sites.md",
    line: 118,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/ci/2026-08-19-send-auth-single-read-lint.md",
    line: 639,
    group: "v2",
    expect: [],
  },
  // six other unprobeable commands
  {
    file: "docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md",
    line: 128,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md",
    line: 169,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md",
    line: 188,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-psql-scan-mutation-enrolment.md",
    line: 206,
    group: "v2",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-17-red-verdict-capability.md",
    line: 135,
    group: "v2",
    expect: ["RED_ALREADY_GREEN/fail"],
  },
  {
    file: "docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md",
    line: 713,
    group: "v2",
    expect: [],
  },
];

/**
 * The sixteen `pnpm heavy`-wrapped v1 markers. They pin that these lines stay
 * SILENT.
 *
 * They do NOT pin the v1 exit, and an earlier version of this comment said they
 * did. Measured by instrumenting `collectionProbePlan`: all sixteen are UNOWNED
 * and are dropped by `if (!owned.has(line)) continue;` before the exit is ever
 * reached. Perturbing the v1 exit leaves every one of these rows unmoved, so a
 * reader must not take a green run here as evidence that the exit holds.
 *
 * What pins the exit is the FIXTURE `exec-unprobeable-v1.md`, which is owned and
 * carries `redState=null`, so that exit is the only thing dropping it. The
 * corpus contains no owned v1 heavy-wrapped marker, so this file structurally
 * cannot do that job.
 *
 * The exit was at 717 and the drop it preceded was at 721. The drop is now GONE
 * rather than moved, because the derivation it discarded carries a reason and
 * rides the decline path.
 */
const V1: Row[] = [
  {
    file: "docs/superpowers/plans/2026-08-14-guard-completeness-wave.md",
    line: 344,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-14-guard-completeness-wave.md",
    line: 532,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-14-guard-completeness-wave.md",
    line: 716,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-14-ui-interactive-token-policy.md",
    line: 651,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-local-harness-false-failures/plan.md",
    line: 71,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-mutation-browser-mode.md",
    line: 174,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-mutation-browser-mode.md",
    line: 196,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-mutation-browser-mode.md",
    line: 231,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-mutation-browser-mode.md",
    line: 271,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-scanner-scope-totality/plan.md",
    line: 64,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md",
    line: 42,
    group: "v1",
    expect: ["TEMPLATE_QUANTITY_DRIFT/advisory"],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md",
    line: 59,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md",
    line: 82,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-control-outline-surface-fills.md",
    line: 208,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/2026-08-16-execution-methods-driver-derived.md",
    line: 626,
    group: "v1",
    expect: [],
  },
  {
    file: "docs/superpowers/plans/ci/2026-08-15-changes-feed-modal-batch-flake.md",
    line: 291,
    group: "v1",
    expect: [],
  },
];

const ADVISORY = "RED_PROBE_UNVERIFIED/advisory";
const AFTER = process.env.EXPECT_ADVISORY === "1";
const ROWS = [...V2, ...V1];
const key = (r: { file: string; line: number }) => `${r.file}:${r.line}`;

// Reconciliation against the design's declared shape, not against a count this
// script itself produced. The old form compared two tallies it incremented in
// the same loop, so it could not fail.
const failures: string[] = [];
const keys = new Set(ROWS.map(key));
if (V2.length !== 15) failures.push(`V2 holds ${V2.length} rows, design §1.1 names 15`);
if (V1.length !== 16) failures.push(`V1 holds ${V1.length} rows, design §1.1 names 16`);
if (keys.size !== ROWS.length)
  failures.push(`duplicate file:line key among the ${ROWS.length} rows`);

// MARKER_DRIFT: a named line that no longer holds a task marker would otherwise
// report SILENT, which is indistinguishable from the thing this probe asserts.
for (const r of ROWS) {
  const lines = readFileSync(r.file, "utf8").split("\n");
  const raw = lines[r.line - 1];
  if (raw === undefined || !MARKER_ANY.test(raw))
    failures.push(`MARKER_DRIFT ${key(r)}: line no longer holds a task marker`);
}

// Structural faults are reported BEFORE the CLI loop, which costs a full corpus
// run. A drift check that only speaks after the expensive part is a drift check
// nobody runs.
if (failures.length > 0) {
  console.error("reach oracle FAILED (structural):");
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}

type Finding = { docLine: number; code: string; severity: string };
const byDoc = new Map<string, Row[]>();
for (const r of ROWS) byDoc.set(r.file, [...(byDoc.get(r.file) ?? []), r]);

const seen = new Set<string>();
for (const doc of [...byDoc.keys()].sort()) {
  // `spec:lint` exits non-zero whenever the doc carries a hard finding, which
  // several of these documents do for unrelated reasons, so a throw here is an
  // ORDINARY result and not an error. The stdout is still the report.
  //
  // `node --import tsx` rather than `pnpm exec tsx`: the latter needs an IPC
  // socket a review sandbox may deny, which made AC-5's sandbox-safe claim false
  // for this probe even though the outer invocation honoured it.
  let raw: string;
  try {
    raw = execFileSync(
      "node",
      ["--import", "tsx", "scripts/spec-lint.ts", "--json", "--exec-red", doc],
      {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch (e) {
    const out = (e as { stdout?: string }).stdout;
    if (typeof out !== "string" || out.trim() === "")
      throw new Error(`no report for ${doc}: ${String(e)}`);
    raw = out;
  }
  const findings: Finding[] = JSON.parse(raw).findings ?? [];
  for (const r of byDoc.get(doc)!) {
    seen.add(key(r));
    const actual = findings
      .filter((f) => f.docLine === r.line)
      .map((f) => `${f.code}/${f.severity}`)
      .sort();
    const want = [...r.expect, ...(AFTER && r.group === "v2" ? [ADVISORY] : [])].sort();
    if (actual.join("|") !== want.join("|"))
      failures.push(
        `${r.group} ${key(r)}: expected [${want.join(", ")}], got [${actual.join(", ")}]`,
      );
  }
}

for (const k of keys) if (!seen.has(k)) failures.push(`NOT INSPECTED ${k}`);

if (failures.length > 0) {
  console.error(`reach oracle FAILED (${AFTER ? "post-change" : "pre-change"} expectations):`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(
  `reach oracle OK: ${V2.length} v2 + ${V1.length} v1 lines match ${AFTER ? "post-change" : "pre-change"} expectations`,
);
