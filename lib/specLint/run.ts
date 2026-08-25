import { checkAcCoverage } from "./acCoverage";
import { checkCitations } from "./citations";
import { claimSweep } from "./claimSweep";
import { checkCopy } from "./copyRules";
import { ambiguousBasenames, basenameOf, checkNumerics, scriptMentionMatcher } from "./numerics";
import { parseDoc, type DocModel } from "./parse";
import {
  checkRedContract,
  collectionProbePlan,
  parseCheckPlan,
  parseFailedLines,
  planExecutions,
  redTargetSpans,
  synthesizeCollectionFindings,
  synthesizeExecFindings,
  synthesizeParseFindings,
} from "./redContract";
import {
  RAW_SUITE_PREPARER,
  checkDeclaredLimitPins,
  type DeclaredLimitPinInputs,
} from "./declaredLimitPins";
import {
  checkFixtureContract,
  spliceFixturePlan,
  synthesizeFixtureFindings,
} from "./fixtureContract";
import { fenceCoverage, waiverTarget } from "./waiverCoverage";
import { checkTaskContract } from "./taskContract";
import { checkUniversals } from "./universals";
import { checkSections } from "./sections";
import type {
  Check,
  AcBlocks,
  AcParseResults,
  ClaimSweepInput,
  ExecResults,
  FileResolver,
  Finding,
  FixtureResults,
  LintDoc,
  LintResult,
  ParseResults,
  ProbeResults,
} from "./types";

const CHECK_ORDER: Record<Check, number> = {
  document: 0,
  citations: 1,
  numerics: 2,
  copy: 3,
  sections: 4,
  taskContract: 5,
  universals: 6,
  claimSweep: 7,
  acCoverage: 8,
};

// WAIVER_MISSING_REASON is unsuppressible (spec §3 — an empty waiver must not launder itself).
const UNSUPPRESSIBLE = new Set(["WAIVER_MISSING_REASON", "EMPTY_DOC"]);

const waiverAdvisory = (line: number, message: string): Finding => ({
  check: "document",
  code: "WAIVER_UNUSED",
  severity: "advisory",
  docLine: line,
  column: 1,
  message,
});

/**
 * Script texts for SCRIPT_CONSTANT_PARITY (spec §2).
 *
 * The I/O boundary stays here: `numerics.ts` performs none, and this resolves the
 * `scripts/` paths the doc names — by path OR basename, using the same
 * `scriptMentionMatcher` the arm's association uses, so the resolver and the
 * arm can never disagree about what a mention is. A path the resolver cannot
 * serve contributes nothing and is skipped silently (tripwire posture).
 */
function resolveScriptTexts(
  model: DocModel,
  resolver: FileResolver,
): { texts: Record<string, string>; ambiguous: ReadonlySet<string> } {
  const texts: Record<string, string> = {};
  const lines = model.lines.filter((_, i) => model.fencedInfo[i] === undefined);
  const scripts = resolver.listTrackedFiles().filter((p) => p.startsWith("scripts/"));
  // A basename shared by two scripts identifies neither, so those resolve by path only.
  // Returned alongside the texts because it is a fact about the TRACKED UNIVERSE: the arm
  // cannot recompute it from what resolved here, since resolving narrows the universe.
  const ambiguous = ambiguousBasenames(scripts);
  for (const path of scripts) {
    // Compiled once per script, then tested against every non-fenced line.
    const mentions = scriptMentionMatcher(path, !ambiguous.has(basenameOf(path)));
    if (!lines.some((line) => mentions.test(line))) continue;
    const text = resolver.readFileLines(path);
    if (text === null) continue;
    texts[path] = text.join("\n");
  }
  return { texts, ambiguous };
}

export function runLint(
  doc: LintDoc,
  resolver: FileResolver,
  exec?: ExecResults | null,
  parse?: ParseResults | null,
  probes?: ProbeResults | null,
  fixtures?: FixtureResults | null,
  // ORDER IS LOAD-BEARING AND WAS DECIDED BY THE MERGE, not by preference.
  // Both arms appended a parameter to the same slot on their own branch. The
  // pin arm merged first, so its callers on main pass it positionally HERE; the
  // claim sweep therefore takes the slot after it, and the arc that had not yet
  // merged is the one that moves. Reversing this typechecks on this branch and
  // breaks seven positional call sites that are already on main.
  declaredLimitPins?: DeclaredLimitPinInputs | null,
  sweep?: ClaimSweepInput | null,
  // APPENDED LAST, deliberately. This slot's history is in the comment above:
  // two arms once appended to the same position on their own branches and the
  // later one had to move. Measured before adding this: 22 `runLint` call
  // expressions across 8 files, 17 of them passing more than two arguments.
  //
  // ONE parameter rather than two. The arm needs the injected view AND its own
  // parse outcomes, and separate slots would double the collision surface
  // against any sibling arc doing the same thing this week.
  acCoverage?: { blocks: AcBlocks; parse: AcParseResults | null } | null,
): LintResult {
  const model = parseDoc(doc.text);
  // Span-exact exclusion (arms spec §5): a `red-target=` capture IS a citation,
  // and `redContract` validates it itself. Plan-kind only — in a spec the
  // red-contract module never runs, so those spans keep today's behavior.
  const excludedSpans = doc.kind === "plan" ? redTargetSpans(model) : new Set<string>();
  const citations = checkCitations(model, resolver, excludedSpans);
  const scripts = resolveScriptTexts(model, resolver);
  const numerics = checkNumerics(model, citations.candidateSpans, scripts.texts, scripts.ambiguous);
  const copy = checkCopy(model);
  const sections = checkSections(model, doc.kind, citations.resolvedPaths);
  const taskContract = checkTaskContract(model, doc.kind);
  const universals = checkUniversals(model, doc.kind);
  const redContract = checkRedContract(model, doc.kind, resolver);
  // The fixture arm's STATIC half (fixture spec §3) runs on EVERY invocation —
  // it is pure text over the parsed model, costs zero spawns, and the payoff
  // moment is review-time linting, which never passes `--exec-red`. Gating it
  // behind the flag would hide malformed markers from `codex-guard --lint-doc`.
  const fixtureContract = checkFixtureContract(model, doc.kind);
  // Parse-capability findings (verdict spec §3). Unlike execution, this pass
  // runs on EVERY plan-kind invocation — the payoff moment is review-time
  // linting, which never passes `--exec-red`.
  const parsePlan = doc.kind === "plan" ? parseCheckPlan(model) : [];
  const parseResults = parse ?? null;
  const parseFindings = synthesizeParseFindings(parsePlan, parseResults);
  // ONE derivation of the exclusion, shared by execution and probing: a
  // command the shell cannot parse — or whose parseability was never observed —
  // is not run and not probed (§3).
  const excluded = parseFailedLines(parsePlan, parseResults);

  // Execution findings (arms spec §4.4). The adapter alone runs subprocesses;
  // the core is handed their outcomes. Absent map = static invocation.
  const execResults = exec ?? null;
  const execFindings =
    doc.kind === "plan" && execResults !== null
      ? synthesizeExecFindings(planExecutions(model, excluded), execResults)
      : [];
  // Collection findings (verdict spec §5.2), likewise outcome-injected.
  const collectionFindings =
    doc.kind === "plan" && probes !== undefined && probes !== null
      ? synthesizeCollectionFindings(
          collectionProbePlan(model, new Set(resolver.listTrackedFiles()), excluded),
          execResults,
          probes,
        )
      : [];

  // Fixture-execution findings (fixture spec §4.3), outcome-injected like the
  // three above. Absent map = a static invocation, which ran nothing and so
  // classifies nothing.
  const fixtureFindings =
    doc.kind === "plan" && fixtures !== undefined && fixtures !== null
      ? synthesizeFixtureFindings(spliceFixturePlan(model, doc.kind), fixtures)
      : [];

  // Claim-sweep findings (claim-sweep spec §3), outcome-injected like the four
  // above: the adapter resolves the declared documents and the repair's hunk
  // spans, and the core is a pure map from those to findings. Absent record =
  // nothing was declared and the arm runs nothing -- and the adapter REFUSES an
  // undeclared invocation rather than reporting that silence as a clean.
  //
  // Runs for BOTH kinds. A repair's superseded claims can survive in a spec or
  // in a plan, and the incident had 7 of its 9 in the plan.
  const sweepFindings =
    sweep === undefined || sweep === null ? [] : claimSweep(sweep.documents, sweep.record);
  // Declared-limit pin advisories (pin-collision spec §3.3, §3.4). Plan-kind only, and
  // a null injected table runs nothing — the same static/injected split the four arms
  // above use, so every existing caller stays byte-identical.
  const declaredLimitPinFindings =
    doc.kind === "plan" && declaredLimitPins !== undefined && declaredLimitPins !== null
      ? checkDeclaredLimitPins(
          model,
          doc.kind,
          declaredLimitPins.surfaces,
          resolver,
          // Task 5 injects the table only. The adapter passes RAW lines until Task 7b
          // lands real preparation, and this default is what makes that ordering true
          // rather than merely intended.
          declaredLimitPins.prepareSuite ?? RAW_SUITE_PREPARER,
          declaredLimitPins.dispositions ?? [],
        )
      : [];

  // The AC coverage arm reads the ADAPTER's parsed view. A null one is the
  // no-view invocation and the arm contributes nothing, the same static/injected
  // split every other injected arm uses.
  const acCoverageFindings =
    acCoverage == null ? [] : checkAcCoverage(acCoverage.blocks, doc.kind, acCoverage.parse);

  let findings: Finding[] = [
    ...model.documentFindings,
    ...citations.findings,
    ...numerics.findings,
    ...copy,
    ...sections,
    ...taskContract,
    ...universals.findings,
    ...redContract,
    ...fixtureContract,
    ...parseFindings,
    ...execFindings,
    ...collectionFindings,
    ...fixtureFindings,
    ...sweepFindings,
    ...declaredLimitPinFindings,
    ...acCoverageFindings,
  ];

  // ---- ignore-waiver application (spec §3) ----
  // Waiver-shaped lines for stack skipping: valid waivers + empty-reason waiver lines.
  const waiverShapedLines = new Set<number>([
    ...model.waivers.map((w) => w.line),
    ...model.documentFindings
      .filter((f) => f.code === "WAIVER_MISSING_REASON")
      .map((f) => f.docLine),
  ]);

  // Both helpers now live in ./waiverCoverage — ONE definition, shared with
  // lib/planFences, which must agree with this linter about which lines a
  // waiver covers (arc B spec §2.1). Behavior here is unchanged.
  const targetOf = (waiverLine: number): number | null =>
    waiverTarget(model.lines, (l) => waiverShapedLines.has(l), waiverLine);
  const coverageOf = (target: number): Set<number> =>
    fenceCoverage(model.lines, (l) => model.fencedInfo[l - 1] === null, target);

  const ignores = model.waivers.filter((w) => w.kind === "ignore");
  const byTarget = new Map<number | null, typeof ignores>();
  for (const w of ignores) {
    const t = targetOf(w.line);
    const list = byTarget.get(t);
    if (list) list.push(w);
    else byTarget.set(t, [w]);
  }

  const waiverFindings: Finding[] = [];
  for (const [target, stack] of byTarget) {
    if (target === null) {
      for (const w of stack) waiverFindings.push(waiverAdvisory(w.line, "waiver has no target"));
      continue;
    }
    const cov = coverageOf(target);
    const before = findings.length;
    findings = findings.filter(
      (f) => !(f.severity === "fail" && cov.has(f.docLine) && !UNSUPPRESSIBLE.has(f.code)),
    );
    if (findings.length === before) {
      for (const w of stack)
        waiverFindings.push(waiverAdvisory(w.line, "waiver suppressed nothing"));
    }
  }

  // not-ui: first is active (sections.ts consumes it via the model); duplicates are unused.
  const notUi = model.waivers.filter((w) => w.kind === "not-ui").sort((a, b) => a.line - b.line);
  for (const dup of notUi.slice(1)) {
    waiverFindings.push(waiverAdvisory(dup.line, "duplicate not-ui waiver"));
  }

  findings.push(...waiverFindings);
  findings.sort(
    (a, b) =>
      CHECK_ORDER[a.check] - CHECK_ORDER[b.check] ||
      a.docLine - b.docLine ||
      a.column - b.column ||
      (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );

  return {
    doc: doc.repoRelPath,
    kind: doc.kind,
    kindSource: doc.kindSource,
    findings,
    inventory: [...numerics.inventory, ...universals.inventory],
  };
}

export function exitCodeForResult(r: LintResult): 0 | 1 {
  return r.findings.some((f) => f.severity === "fail") ? 1 : 0;
}
