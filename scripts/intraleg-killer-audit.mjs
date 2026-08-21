#!/usr/bin/env node
/**
 * The KILLER AUDIT for the intra-leg process-boundary probe.
 *
 * The mutation-score criterion is UNAVAILABLE to this arc (spec §8: a score for
 * this probe would be computed by the very runner machinery the probe audits,
 * so the criterion would be circular). This audit is the substitute convergence
 * evidence: every weaker implementation named in the spec's AC table and in the
 * plan's task bodies is classified ABSENT / PRESENT-BUT-UNPROVEN / PROVEN, where
 * PROVEN means the mutant was applied to the SHIPPED source, the named case was
 * observed RED for the asserted reason, and the file was restored byte-exact.
 *
 * Preconditions, executable rather than remembered (a restore-by-checkout
 * harness whose baseline was never green scores every mutant as killed and
 * prints a flawless result from a destroyed measurement):
 *   1. the working tree is CLEAN over every file this audit edits;
 *   2. the named suite is GREEN before iteration 1.
 *
 * Usage: node scripts/intraleg-killer-audit.mjs [--only <id>] [--json <path>]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const CORE = "tests/mutation/source/processProbe.ts";
const CLI = "scripts/mutation-process-probe.ts";
const STATE = "tests/mutation/source/fixtures/processProbe/state.ts";
const SUITE = "tests/mutation/source/processProbe.test.ts";
const LIVE_SUITE = "tests/mutation/source/processProbe.live.test.ts";

/**
 * Every named kill. `from`/`to` are applied to `file` and must match EXACTLY
 * ONCE — a control keyed by text is only as good as that text's uniqueness, and
 * an anchor that matches twice edits a site no case reaches.
 *
 * `absent` entries carry no mutant: the weaker implementation is not
 * expressible against this design, and the reason is the evidence.
 */
export const KILLS = [
  // ---------------------------------------------------------------- AC-1
  {
    id: "AC-1.k1",
    named: "one that coerces a fraction into a trial count",
    file: CORE,
    from: "  if (!/^[+-]?\\d+$/.test(text)) {\n    return { ok: false, detail: `${bound}, got ${JSON.stringify(value)}` };\n  }",
    to: "  if (false) {\n    return { ok: false, detail: `${bound}, got ${JSON.stringify(value)}` };\n  }",
    filter: "trials refuses",
    reason: "a fractional --trials is accepted instead of refused",
  },
  {
    id: "AC-1.k2",
    named: 'one whose refusal is a bare "not found"',
    file: CORE,
    from: '  if (!resolved.ok) return refuse("surface", resolved.detail);',
    to: '  if (!resolved.ok) return refuse("surface", "not found");',
    filter: "refuses an unknown surface id",
    reason: "the refusal no longer names the id it refused",
  },
  {
    id: "AC-1.k3",
    named: "one that prints a partial distribution before refusing",
    file: CORE,
    from: "    return `REFUSED (${outcome.input}): ${outcome.detail}\\n`;\n  }\n  const t = outcome.target;",
    to: "    return `REFUSED (${outcome.input}): ${outcome.detail}\\nTRIALS: 0 of 0\\n`;\n  }\n  const t = outcome.target;",
    filter: "emits NO distribution text",
    reason: "a distribution line is emitted on a refusal path",
  },
  // ---------------------------------------------------------------- AC-2
  {
    id: "AC-2.k1",
    named: "an implementation looping in one process and minting distinct nonces",
    file: CORE,
    from: "  if (report.childPid !== pid) {",
    to: "  if (false) {",
    filter: "LYING child pid",
    reason: "the parent no longer compares its own observation against the child's",
  },
  // ---------------------------------------------------------------- AC-3
  {
    id: "AC-3.k1",
    named: "a planner that prints shuffled plans while running a fixed order",
    file: CORE,
    from: "    if (result.executed !== step.context) {",
    to: "    if (false) {",
    filter: "EXECUTOR that runs a different order",
    reason: "a relabelled execution is accepted",
  },
  {
    id: "AC-3.k2",
    named: "a reporter that computes receipts from the PLAN and never writes",
    file: CORE,
    from: "    const readBack = deps.readBack(mutantFile);\n    const receiptSha = sha256(readBack);",
    to: '    deps.readBack(mutantFile);\n    const receiptSha = sha256(Buffer.from(step.text, "utf8"));',
    filter: "WRITER elided",
    reason: "the receipt attests the plan rather than the disk, so an elided write verifies",
  },
  // ---------------------------------------------------------------- AC-4
  {
    id: "AC-4.k1",
    named: "a harness that cannot see a known correlated mechanism",
    file: STATE,
    from: "export function boundaryCheckActive(index: number): boolean {\n  return index >= FLIP_AT_RUN;\n}",
    to: "export function boundaryCheckActive(_index: number): boolean {\n  return false;\n}",
    filter: "control",
    reason: "the manufactured mechanism never fires, so the control is vacuous",
  },
  {
    id: "AC-4.k2",
    named: "a first-suite-only reimplementation",
    file: CORE,
    from: "  const suites = target.surface.suitePaths;",
    to: "  const suites = target.surface.suitePaths.slice(0, 1);",
    // LIVE, and the reason is a fixture property rather than a preference: the
    // in-process fixture surface declares ONE suite, so slicing `suitePaths` to
    // its first element changes nothing there and the mutant survives a case
    // that cannot express it. The two-suite control is the cheapest surface on
    // which this defect is observable at all.
    filter: "SHARED state scope reports the flip",
    reason: "only the first declared suite runs, so a later-suite verdict is missed",
    live: true,
  },
  // ---------------------------------------------------------------- AC-6
  {
    id: "AC-6.k1",
    named: "a sink hard-coded to `.mutation-records`",
    file: CORE,
    from: "    const dir = options.recordDir ?? recordDir();",
    to: '    const dir = ".mutation-records";',
    filter: "records land ONLY in the redirected",
    reason: "campaign records are written into the gate's own channel",
  },
  // ---------------------------------------------------------------- AC-7
  {
    id: "AC-7.k1",
    named: "a renderer that upgrades a bound to an exclusion",
    file: CORE,
    from: "      `BRANCH NULL: no eligible trial flipped. The local reproduction is bounded at the figure ` +",
    to: "      `BRANCH NULL: no eligible trial flipped. The branch is ruled out at the figure ` +",
    filter: "REFUSES exclusion vocabulary",
    reason: "exclusion vocabulary reaches a claim line",
  },
  // ---------------------------------------------------------------- AC-8
  {
    id: "AC-8.k1",
    named: "one folding a fault into `KILLED`",
    file: CORE,
    from: "        infraFaults.push(step.site);\n        continue;",
    to: "        continue;",
    filter: "EXCLUDES an infra-faulted step",
    reason: "the fault is no longer reported by name",
  },
  {
    id: "AC-8.k2",
    named: "one printing `0 of 0` as a clean result",
    file: CORE,
    from: "  if (trials.length > 0 && completed.length === 0) {",
    to: "  if (false) {",
    filter: "ALL-faulting population",
    reason: "a distribution is produced over zero completed trials",
  },
  // ---------------------------------------------------------------- AC-9
  {
    id: "AC-9.k2",
    named: "an injectable seam certifying a production path wired to a stub",
    file: CLI,
    from: "export const CLI_DEFAULT_DEPS: CliDeps = {\n  resolveTarget,",
    to: 'export const CLI_DEFAULT_DEPS: CliDeps = {\n  resolveTarget: () => ({ kind: "refusal", input: "surface", detail: "stub" }),',
    filter: "DEFAULT_DEPS are bound to the REAL core",
    reason: "the default seam points at a stub the operator's command would run",
  },
  // ---------------------------------------------------------------- AC-10
  {
    id: "AC-10.k1",
    named: "a pair adjudicated on asserted-not-measured load (samples not filtered to the window)",
    file: CORE,
    from: "    return (t.loadSamples ?? []).filter((s) => s.at >= spawnedAt && s.at <= exitedAt);",
    to: "    return [...(t.loadSamples ?? [])];",
    filter: "samples all fall OUTSIDE its window",
    reason: "out-of-window samples enter the arithmetic",
  },
  {
    id: "AC-10.k2",
    named: "a parameterized margin",
    file: CORE,
    from: "export const LOAD_RATIO_MIN = 2;",
    to: "export const LOAD_RATIO_MIN = 1;",
    filter: "pre-registered literals",
    reason: "a margin fixed before the samples existed has moved",
  },
  {
    id: "AC-10.k4",
    named: "one adjudicating margins across halves that measured different programs",
    file: CORE,
    from: "  if (qDigest !== lDigest) {",
    to: "  if (false) {",
    filter: "cross-stamp load pair",
    reason: "a cross-stamp pair is adjudicated instead of refused",
  },
  // ---------------------------------------------------------------- AC-11
  {
    id: "AC-11.k1",
    named: "an unseeded `Math.random` planner",
    file: CORE,
    from: "    const prefix = shuffle(available, mulberry32(seed + i + 1)).slice(0, length);",
    to: "    const prefix = shuffle(available, () => Math.random()).slice(0, length);",
    filter: "byte-identical plans for the same seed",
    reason: "the same seed no longer reproduces the same plan",
  },
  // ---------------------------------------------------------------- AC-12
  {
    id: "AC-12.k1",
    named: "one averaging an unattributable trial into the bound",
    file: CORE,
    // RE-ANCHORED after the round-1 repair renamed this condition: eligibility now
    // re-derives attributability instead of reading the child's boolean, and the
    // indentation changed with it. The mutant's INTENT is unchanged — disable the
    // unattributable exclusion and see whether anything notices.
    from: "        if (!derivedAttributable) {",
    to: "        if (false) {",
    filter: "INTERNALLY mismatched stamp pair",
    reason: "a trial whose inputs moved mid-run counts toward the bound",
  },
  {
    id: "AC-12.k2",
    named: "one pooling internally-stable trials across a mid-campaign suite edit",
    file: CORE,
    from: "      if (anchorDigest !== null && r.stampBefore.digest !== anchorDigest) {",
    to: "      if (false) {",
    filter: "stamp differs from the anchor",
    reason: "trials that measured different programs are pooled",
  },
  // ---------------------------------------------------------------- AC-14
  {
    id: "AC-14.k1",
    named: "an aggregator reading whatever files exist",
    file: CORE,
    from: "  if (report.steps.length !== planned.length) {",
    to: "  if (false) {",
    filter: "MISSING a receipt step",
    reason: "a short report is accepted, shrinking the evidence but not the claim",
  },
  {
    id: "AC-14.k2",
    named: "a serializer that rotates child arrays among steps",
    file: CORE,
    from: "    if (stepDigest(step) !== step.digest) {",
    to: "    if (false) {",
    filter: "ROTATION of child arrays",
    reason: "right evidence attached to the wrong mutant is accepted",
  },
  {
    id: "AC-14.k3",
    named: "a serializer that rotates windows or half identities among trial REPORTS",
    file: CORE,
    from: "    if (reportDigest(t.observation.report) !== t.observation.report.digest) {",
    to: "    if (false) {",
    filter: "TRIAL-LEVEL rotation",
    reason: "right evidence attached to the wrong trial is accepted",
  },
  // ---------------------------------------------------------------- AC-16
  {
    id: "AC-16.k1",
    named: "the literal closeout — planned numbers over a permitted partial state",
    file: CORE,
    from: "      const bound = oneSidedBound(arm.eligible);",
    to: "      const bound = oneSidedBound(arm.planned);",
    filter: "POPULATION SIZE beside every aggregate",
    reason: "the planned bound is quoted over an eligible population that is smaller",
  },
  {
    id: "AC-16.k2",
    named: "the every-N formula evaluator",
    file: CORE,
    from: "  if (!Number.isSafeInteger(n) || n < 1) {",
    to: "  if (false) {",
    filter: "REFUSES a bound over ZERO eligible",
    reason: "the formula is evaluated at N=0 and renders the impossible p > 1.0",
  },
  {
    id: "AC-16.k4",
    named: "a renderer that refuses the arm's NUMBER while still emitting the graduation",
    file: CORE,
    from: "  const starved = outcome.arms.filter((a) => a.eligible === 0);\n  if (starved.length > 0) {",
    to: "  const starved = outcome.arms.filter((a) => a.eligible === 0);\n  if (false) {",
    filter: "NO graduation text while ANY arm is at zero eligible",
    reason: "a graduation reading is emitted over an arm that did not run",
  },
  // ------------------------------------------------------ plan-named kills
  {
    id: "PLAN.k1",
    named: "a planner returning a CONSTANT position",
    file: CORE,
    from: "      position: prefix.length + 1,\n    });\n  });",
    to: "      position: 1,\n    });\n  });",
    filter: "derives POSITION as prefix length",
    reason: "position no longer follows the prefix",
  },
  {
    id: "PLAN.k2",
    named: "a planner spelled shuffle(allMutants).slice(0, n)",
    file: CORE,
    from: "  const available = target.mutants.map((m) => siteId(m.site)).filter((id) => id !== targetId);",
    to: "  const available = target.mutants.map((m) => siteId(m.site));",
    filter: "never places the TARGET in its own prefix",
    reason: "the target can be drawn into its own prefix and run twice",
  },
  {
    id: "PLAN.k3",
    named: "a COPYING consumer that trusts the serialized position",
    file: CORE,
    from: "  const derived = plan.prefix.length + 1;\n  if (plan.position !== derived) {",
    to: "  const derived = plan.prefix.length + 1;\n  if (false) {",
    filter: "POSITION was tampered",
    reason: "a tampered position is adjudicated instead of refused",
  },
  {
    id: "PLAN.k4",
    named: "a consumer accepting a plan whose prefix contains the target",
    file: CORE,
    from: "  if (plan.prefix.includes(plan.targetSiteId)) {",
    to: "  if (false) {",
    filter: "prefix contains the target",
    reason: "the target is executed twice under one trial's verdict",
  },
  {
    id: "PLAN.k5",
    named: "an implementation taking BOTH stamps consecutively before execution",
    file: CORE,
    from: "  const exitedAt = deps.now();\n  const stampAfter = deps.stamp(target.root, target.surface);",
    to: "  const exitedAt = deps.now();\n  const stampAfter = stampBefore;",
    filter: "MID-TRIAL edit",
    reason: "a declared input moving mid-trial is invisible",
  },
  {
    id: "PLAN.k7",
    named: "a PARENT that mints the nonce and passes it in for the child to echo",
    file: CORE,
    // RE-ANCHORED after the round-1 repair added `reportPath` to the swept
    // channels, which also made prettier wrap the loop header across three lines.
    // The mutant's INTENT is unchanged: sweep NOTHING, and see whether a
    // parent-minted nonce still gets caught.
    from: '  for (const { channel, text } of [\n    ...spawnChannels(full),\n    { channel: "reportPath", text: reportPath },\n  ]) {',
    to: "  for (const { channel, text } of []) {",
    filter: "nonce the parent could have passed through",
    reason: "a pass-through nonce satisfies every remaining check",
  },
  {
    id: "PLAN.k10",
    named: "a serializer dropping a field of the whole condition",
    file: CORE,
    from: "  const missing = REQUIRED_CONDITION_FIELDS.filter((f) => !(f in tuple));",
    to: "  const missing = [];",
    filter: "condition serialization missing ANY field",
    reason: "a decision is taken against a condition the record cannot express",
  },
  {
    id: "PLAN.k11",
    named: "a CONSTANT default seed",
    file: CLI,
    from: "  generateSeed: () => randomInt(0, 2 ** 32),",
    to: "  generateSeed: () => 1,",
    // The accept-set case admits a constant (1 IS a valid seed), so it cannot
    // discriminate. The case that can is the one asserting the DEFAULT varies.
    filter: "generateSeed DEFAULT actually varies",
    reason: "two omitted-seed invocations would plan the same campaign",
  },
  {
    id: "AC-4.k3",
    named: "the skip-prefix-writes implementation, which no sha check can catch",
    file: CORE,
    from: "  for (const step of sequence) {\n    deps.writeMutant(mutantFile, step.text);",
    to: '  for (const step of sequence) {\n    if (step.role !== "prefix") deps.writeMutant(mutantFile, step.text);',
    filter: "PREFIX-BEARING",
    reason: "the prefix mutant is never written, so its step reports SURVIVED",
    live: true,
  },
  {
    id: "AC-5.k2",
    named: "the `suitePaths[0]`-only implementation on a MULTI-suite surface",
    file: CORE,
    from: "  const suites = target.surface.suitePaths;",
    to: "  const suites = target.surface.suitePaths.slice(0, 1);",
    // Proven on the CONTROL surface's shared-scope case rather than on
    // premiseScan. The mutant is byte-identical (same anchor as AC-4.k2) and the
    // control is also multi-suite with its deciding mechanism in suite 2, so the
    // defect it exhibits is the same one: a first-suite-only runner reports
    // STABLE where a later suite decides. premiseScan's own agreement case still
    // runs ONCE, unmutated, as the AC-5 verification — running its 170 mutants a
    // second time under a mutant costs ~9 minutes of a two-slot machine and
    // demonstrates nothing the control does not.
    filter: "SHARED state scope reports the flip",
    reason: "a verdict a LATER suite decides is mis-scored on a multi-suite surface",
    live: true,
    sharedAnchorWith: "AC-4.k2",
  },
  {
    id: "AC-10.k3",
    named: "one averaging samples regardless of timestamp",
    file: CORE,
    from: "    return (t.loadSamples ?? []).filter((s) => s.at >= spawnedAt && s.at <= exitedAt);",
    to: "    return [...(t.loadSamples ?? [])];",
    // The all-in-window case cannot discriminate: dropping the window filter
    // changes nothing when every sample is already inside it. The OUT-of-window
    // case is the one that decides.
    filter: "samples all fall OUTSIDE its window",
    reason: "samples from outside the trial window enter the mean",
    sharedAnchorWith: "AC-10.k1",
  },
  {
    id: "AC-16.k3",
    named: "one advancing the load column on a cross-stamp pair",
    file: CORE,
    from: "  if (qDigest !== lDigest) {",
    to: "  if (false) {",
    // The no-samples case refuses for a missing sampler whatever the stamps
    // say, so it cannot see this. The cross-stamp case can, and it now asserts
    // the RENDER's load column as well as the internal refusal.
    filter: "cross-stamp load pair",
    reason: "the load column advances on halves that measured different programs",
    sharedAnchorWith: "AC-10.k4",
  },
  {
    id: "PLAN.k6",
    named: "an implementation that copies the child-reported pid into the parent-observed field",
    file: CORE,
    from: "  if (report.childPid !== pid) {",
    to: "  if (false) {",
    filter: "pid",
    reason: "the two pid observations can never disagree",
    sharedAnchorWith: "AC-2.k1",
  },
  {
    id: "PLAN.k8",
    named: "a SPAWNER omitting MUTATION_RECORD_DIR from the child env",
    file: CORE,
    from: "        env: { ...process.env, ...request.env },",
    to: "        env: { ...process.env },",
    filter: "records land in the redirect",
    reason: "the child writes production records into the default channel",
    live: true,
  },
  {
    id: "PLAN.k9",
    named: "a TRIAL-level rotation among reports (parallel position-keyed structure)",
    file: CORE,
    from: "    if (reportDigest(t.observation.report) !== t.observation.report.digest) {",
    to: "    if (false) {",
    filter: "TRIAL-LEVEL rotation",
    reason: "one trial's evidence is accepted on another trial",
    sharedAnchorWith: "AC-14.k3",
  },
  {
    id: "PLAN.k12",
    named: "skip-prefix-writes AND planned-text receipts together (both seams switched)",
    file: CORE,
    from:
      "    deps.writeMutant(mutantFile, step.text);\n" +
      "    const readBack = deps.readBack(mutantFile);\n" +
      "    const receiptSha = sha256(readBack);",
    // BOTH seams switched together, which is what the plan names: the writer is
    // elided for prefix steps AND the receipt is fed planned bytes. Switching
    // only the receipt source leaves the prefix mutant WRITTEN, so the
    // behavioural case stays green and the mutant proves nothing — measured, it
    // came back 0 failed of 1 matched.
    to:
      '    if (step.role !== "prefix") deps.writeMutant(mutantFile, step.text);\n' +
      "    const readBack =\n" +
      '      step.role === "prefix" ? Buffer.from(step.text, "utf8") : deps.readBack(mutantFile);\n' +
      "    const receiptSha = sha256(readBack);",
    filter: "PREFIX-BEARING",
    reason:
      "every sha check passes while the prefix executes stale bytes; DISTINCT from the " +
      "elided-writer-alone variant, which the read-back path already refuses at the receipt",
    live: true,
  },
  // -------------------------------------------------- structurally ABSENT
  {
    id: "AC-5.k1",
    named: "a reimplemented runner whose verdicts agree by luck",
    absent:
      "No runner is reimplemented. Every verdict comes from the shipped `runMutantRecorded` " +
      "through the `runMutant` seam, and `DEFAULT_TRIAL_DEPS` is asserted bound to it. There is " +
      "no second implementation for luck to operate on.",
  },
  {
    id: "AC-9.k1",
    named: "a CLI-shaped surface the runner cannot overlay",
    absent:
      "The core is an importable module with a referring in-process suite (151 cases), and both " +
      "adapters are thin `main(argv, deps)` entries holding no decision. A CLI-shaped surface " +
      "would score as if untested; this one is imported directly by its suite.",
  },
  {
    id: "AC-13.k1",
    named: 'the widening §1.1 forbids, arriving as an "innocent" helper edit',
    absent:
      "Checked mechanically rather than argued: the AC-13 freeze diff is empty at closeout. See " +
      "the closeout section of this record for the command and its output.",
  },
  {
    id: "AC-13.k2",
    named: "a closeout check that reports without gating",
    absent:
      "The closeout script exits non-zero on every failure branch and is dry-run against a " +
      "constructed failing input before it is depended on. See the closeout section.",
  },
];

const SPEC = "docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md";

/**
 * Re-derive the spec's named kills FROM THE SPEC, so this table cannot silently
 * drift from the document it audits.
 *
 * A hand-kept list closes the moment someone adds an AC row; a derivation
 * re-opens. The split is paren-aware because the fourth column's parentheticals
 * carry semicolons of their own.
 */
export function deriveSpecKills(specPath = SPEC) {
  const rows = readFileSync(specPath, "utf8")
    .split("\n")
    .filter((l) => /^\| AC-/.test(l));
  if (rows.length === 0) throw new Error(`FLOOR: no AC rows matched in ${specPath}`);
  const ids = [];
  for (const row of rows) {
    const cells = row.split("|");
    if (cells.length !== 6) {
      throw new Error(`FLOOR: AC row ${cells[1]?.trim()} has ${cells.length} pipe fields, not 6`);
    }
    const id = cells[1].trim();
    const cell = cells[4].trim();
    let depth = 0;
    let parts = 0;
    let buf = "";
    for (const ch of cell) {
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      if (ch === ";" && depth === 0) {
        if (buf.trim()) parts += 1;
        buf = "";
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) parts += 1;
    if (depth !== 0) throw new Error(`FLOOR: unbalanced parentheses in ${id}`);
    for (let i = 1; i <= parts; i += 1) ids.push(`${id}.k${i}`);
  }
  return ids;
}

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function assertCleanBaseline(files) {
  const dirty = execFileSync("git", ["status", "--porcelain", "--", ...files], {
    encoding: "utf8",
  }).trim();
  if (dirty !== "") {
    throw new Error(
      `REFUSING TO START: the working tree is dirty over the files this audit edits:\n${dirty}\n` +
        `A restore-by-checkout harness whose baseline was never committed-green destroys the ` +
        `repair on iteration 1 and then scores every mutant as killed.`,
    );
  }
}

/**
 * Every case name in a suite, for the filter-coverage check below.
 *
 * Three of this audit's first five unresolved entries were FILTER TYPOS
 * reported as PRESENT-BUT-UNPROVEN — a `-t` value beginning with `--` is eaten
 * as a flag, and `-t` is case-sensitive. "No case ran" and "the mutant survived"
 * are opposite findings that render identically once the count is not printed,
 * so the filters are now validated against the real case list BEFORE any mutant
 * is applied.
 */
function listCases(suite, live = false) {
  const r = spawnSync("pnpm", ["exec", "vitest", "list", suite], {
    encoding: "utf8",
    env: live ? { ...process.env, RUN_PROCESS_PROBE_LIVE: "1" } : process.env,
  });
  return (r.stdout ?? "")
    .split("\n")
    .filter((l) => l.includes(" > "))
    .map((l) => l.slice(l.indexOf(" > ") + 3));
}

function runSuite(suite, filter, live = false) {
  const args = ["vitest", "run", suite];
  if (filter) args.push("-t", filter);
  // NOT wrapped per invocation. The live tier IS a heavy phase — it launches a
  // child per trial, each running one vitest per suite, plus
  // `runSurface(spawnBounded)`'s twelve — but this function reaches it SIX times
  // in one audit (one baseline plus five live kills), and wrapping each one made
  // the audit queue for a slot six separate times on a saturated machine.
  // Measured: eleven minutes waiting without having started. One acquisition for
  // the whole run is strictly better for this arc AND for every other one, so
  // the audit requires a slot at its ENTRY instead (see `main`).
  const r = spawnSync("pnpm", ["exec", ...args], {
    encoding: "utf8",
    env: live ? { ...process.env, RUN_PROCESS_PROBE_LIVE: "1" } : process.env,
  });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const m = text.match(/Tests\s+(?:(\d+) failed)?[ |]*(?:(\d+) passed)?/);
  return {
    status: r.status,
    failed: m?.[1] ? Number(m[1]) : 0,
    passed: m?.[2] ? Number(m[2]) : 0,
    text,
  };
}

export function main() {
  const only = process.argv.includes("--only")
    ? process.argv[process.argv.indexOf("--only") + 1]
    : null;
  /**
   * Defer the live-suite mutants.
   *
   * DEFERRED, never dropped: a deferred obligation is still unresolved, so the
   * run reports it as such and exits non-zero. An audit that quietly shrinks its
   * own denominator is the defect class this arc exists to detect.
   */
  const noLive = process.argv.includes("--no-live");

  // DERIVED COVER: every kill the spec names must be classified here. A new AC
  // row, or a new semicolon-separated kill inside an existing one, fails this
  // audit until somebody dispositions it — which is the difference between a
  // sweep and a list that was true once.
  const specKills = deriveSpecKills();
  const classified = new Set(KILLS.map((k) => k.id));
  const unclassified = specKills.filter((id) => !classified.has(id));
  if (unclassified.length > 0) {
    throw new Error(
      `REFUSING TO START: the spec names ${specKills.length} kills and this table classifies ` +
        `${specKills.length - unclassified.length} of them. Unclassified: ${unclassified.join(", ")}`,
    );
  }
  process.stdout.write(
    `DERIVED COVER: ${specKills.length} spec-named kills, all classified; ` +
      `${KILLS.length - specKills.length} further obligations from the plan's task bodies ` +
      `(total ${KILLS.length}).\n`,
  );

  const files = [...new Set(KILLS.filter((k) => k.file).map((k) => k.file))];
  assertCleanBaseline([...files, SUITE, LIVE_SUITE]);

  // ONE slot for the whole audit, taken by the caller. The audit runs the live
  // tier six times; a wrapper per invocation queues six times, and a wrapper
  // around nothing lets 45 mutant runs loose on a machine whose slot semaphore
  // exists because unbounded arcs hard-reset it once.
  if (!process.env.FX_HEAVY_SLOT_HELD) {
    console.error(
      "REFUSING: this audit runs the live tier and 45 mutant suites, which is a heavy phase.\n" +
        "Run it as:  pnpm heavy node scripts/intraleg-killer-audit.mjs\n" +
        "(FX_HEAVY_SLOT_HELD is set by scripts/with-heavy-slot.py once a slot is held.)\n\n" +
        "NOT also added to AGENTS.md's known-members list, deliberately: that rule's code\n" +
        "spans are pinned by tests/docs/agentsHeavyPhaseRule.test.ts against a fixture, so\n" +
        "appending a member edits a file every concurrent arc shares AND its pin. The\n" +
        "rule's own authority is a derived sweep rather than that list, and a refusal the\n" +
        "script enforces outlives a line someone has to remember to read.",
    );
    process.exit(2);
  }

  const green = runSuite(SUITE, null);
  if (green.status !== 0 || green.failed !== 0) {
    throw new Error(
      `REFUSING TO START: the baseline suite is not green (${green.failed} failed). Every mutant ` +
        `would read KILLED against an already-red suite.`,
    );
  }
  process.stdout.write(`BASELINE GREEN: ${green.passed} passed, 0 failed\n`);

  // FILTER COVERAGE. A `-t` filter matching nothing exits 0 and reports green from
  // the moment it is written; against a mutant it reports "survived". Refused up
  // front, naming every filter that matches no case, so the two can never be
  // confused again.
  const caseNames = { [SUITE]: listCases(SUITE), [LIVE_SUITE]: listCases(LIVE_SUITE, true) };
  const blind = [];
  for (const kill of KILLS) {
    if (kill.absent || !kill.filter) continue;
    const suite = kill.live === true ? LIVE_SUITE : SUITE;
    const hits = caseNames[suite].filter((n) => n.includes(kill.filter)).length;
    if (hits === 0) blind.push(`${kill.id} (${JSON.stringify(kill.filter)} in ${suite})`);
  }
  if (blind.length > 0) {
    throw new Error(
      `REFUSING TO START: ${blind.length} filter(s) match NO case, so their mutants would report ` +
        `as survivors against a suite that never ran them: ${blind.join(", ")}`,
    );
  }
  process.stdout.write(
    `FILTER COVERAGE: every filter matches at least one case ` +
      `(${caseNames[SUITE].length} fast + ${caseNames[LIVE_SUITE].length} live cases listed)\n\n`,
  );

  // The same rule for the LIVE suite: a mutant run against an already-red suite
  // reads KILLED for free, so the live baseline is established before any live
  // mutant is applied — and only when one will actually run.
  const willRunLive = KILLS.some((k) => k.live === true && !noLive && (!only || k.id === only));
  if (willRunLive) {
    const liveGreen = runSuite(LIVE_SUITE, null, true);
    if (liveGreen.status !== 0 || liveGreen.failed !== 0) {
      throw new Error(
        `REFUSING TO RUN LIVE MUTANTS: the live baseline is not green (${liveGreen.failed} failed, ` +
          `${liveGreen.passed} passed). Every live mutant would read KILLED against it.`,
      );
    }
    process.stdout.write(`LIVE BASELINE GREEN: ${liveGreen.passed} passed, 0 failed\n`);
  }

  const results = [];
  for (const kill of KILLS) {
    if (only && kill.id !== only) continue;
    if (kill.live === true && noLive) {
      results.push({ ...kill, state: "DEFERRED-LIVE" });
      process.stdout.write(`DEFERRED-LIVE        ${kill.id}  ${kill.named}\n`);
      continue;
    }
    if (kill.absent) {
      results.push({ ...kill, state: "ABSENT" });
      process.stdout.write(`ABSENT               ${kill.id}  ${kill.named}\n`);
      continue;
    }
    const before = readFileSync(kill.file, "utf8");
    const beforeSha = sha(kill.file);
    const occurrences = before.split(kill.from).length - 1;
    if (occurrences !== 1) {
      results.push({ ...kill, state: "ANCHOR-NOT-UNIQUE", occurrences });
      process.stdout.write(
        `ANCHOR-NOT-UNIQUE    ${kill.id}  anchor matched ${occurrences} times, not 1\n`,
      );
      continue;
    }
    writeFileSync(kill.file, before.replace(kill.from, kill.to), "utf8");
    let outcome;
    try {
      outcome = runSuite(kill.live === true ? LIVE_SUITE : SUITE, kill.filter, kill.live === true);
    } finally {
      writeFileSync(kill.file, before, "utf8");
    }
    const restoredSha = sha(kill.file);
    if (restoredSha !== beforeSha) {
      throw new Error(`RESTORE FAILED for ${kill.id}: ${kill.file} is not byte-identical`);
    }
    const matched = outcome.failed + outcome.passed;
    const state =
      matched === 0
        ? "FILTER-MATCHED-NOTHING"
        : outcome.failed > 0
          ? "PROVEN"
          : "PRESENT-BUT-UNPROVEN";
    results.push({
      ...kill,
      state,
      failed: outcome.failed,
      passed: outcome.passed,
      matched,
    });
    process.stdout.write(
      `${state.padEnd(20)} ${kill.id}  ${outcome.failed} failed of ${outcome.failed + outcome.passed} matched  (${kill.reason})\n`,
    );
  }

  const tally = results.reduce((a, r) => ({ ...a, [r.state]: (a[r.state] ?? 0) + 1 }), {});
  process.stdout.write(`\nTALLY: ${JSON.stringify(tally)}\n`);
  process.stdout.write(`TOTAL OBLIGATIONS: ${results.length}\n`);

  const jsonIndex = process.argv.indexOf("--json");
  if (jsonIndex !== -1) {
    writeFileSync(process.argv[jsonIndex + 1], `${JSON.stringify(results, null, 2)}\n`, "utf8");
  }

  // A single PRESENT-BUT-UNPROVEN or ANCHOR-NOT-UNIQUE entry is a finding, not a
  // pass: the audit's whole claim is that every named kill is either impossible or
  // demonstrated.
  const unresolved = results.filter((r) => r.state !== "PROVEN" && r.state !== "ABSENT");
  process.exitCode = unresolved.length === 0 ? 0 : 1;
  return results;
}

/* c8 ignore start — the process entry, exercised by running the command itself */
const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
/* c8 ignore stop */
