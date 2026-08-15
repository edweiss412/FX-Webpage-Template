import { checkCitations } from "./citations";
import { checkCopy } from "./copyRules";
import { checkNumerics } from "./numerics";
import { parseDoc } from "./parse";
import {
  checkRedContract,
  planExecutions,
  redTargetSpans,
  synthesizeExecFindings,
} from "./redContract";
import { fenceCoverage, waiverTarget } from "./waiverCoverage";
import { checkTaskContract } from "./taskContract";
import { checkSections } from "./sections";
import type { Check, ExecResults, FileResolver, Finding, LintDoc, LintResult } from "./types";

const CHECK_ORDER: Record<Check, number> = {
  document: 0,
  citations: 1,
  numerics: 2,
  copy: 3,
  sections: 4,
  taskContract: 5,
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

export function runLint(
  doc: LintDoc,
  resolver: FileResolver,
  exec?: ExecResults | null,
): LintResult {
  const model = parseDoc(doc.text);
  // Span-exact exclusion (arms spec §5): a `red-target=` capture IS a citation,
  // and `redContract` validates it itself. Plan-kind only — in a spec the
  // red-contract module never runs, so those spans keep today's behavior.
  const excludedSpans = doc.kind === "plan" ? redTargetSpans(model) : new Set<string>();
  const citations = checkCitations(model, resolver, excludedSpans);
  const numerics = checkNumerics(model, citations.candidateSpans);
  const copy = checkCopy(model);
  const sections = checkSections(model, doc.kind, citations.resolvedPaths);
  const taskContract = checkTaskContract(model, doc.kind);
  const redContract = checkRedContract(model, doc.kind, resolver);
  // Execution findings (arms spec §4.4). The adapter alone runs subprocesses;
  // the core is handed their outcomes. Absent map = static invocation.
  const execFindings =
    doc.kind === "plan" && exec !== undefined && exec !== null
      ? synthesizeExecFindings(planExecutions(model), exec)
      : [];

  let findings: Finding[] = [
    ...model.documentFindings,
    ...citations.findings,
    ...numerics.findings,
    ...copy,
    ...sections,
    ...taskContract,
    ...redContract,
    ...execFindings,
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
    inventory: numerics.inventory,
  };
}

export function exitCodeForResult(r: LintResult): 0 | 1 {
  return r.findings.some((f) => f.severity === "fail") ? 1 : 0;
}
