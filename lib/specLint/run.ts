import { checkCitations } from "./citations";
import { checkCopy } from "./copyRules";
import { checkNumerics } from "./numerics";
import { parseDoc } from "./parse";
import { checkSections } from "./sections";
import type { Check, FileResolver, Finding, LintDoc, LintResult } from "./types";

const CHECK_ORDER: Record<Check, number> = {
  document: 0,
  citations: 1,
  numerics: 2,
  copy: 3,
  sections: 4,
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

export function runLint(doc: LintDoc, resolver: FileResolver): LintResult {
  const model = parseDoc(doc.text);
  const citations = checkCitations(model, resolver);
  const numerics = checkNumerics(model, citations.candidateSpans);
  const copy = checkCopy(model);
  const sections = checkSections(model, doc.kind, citations.resolvedPaths);

  let findings: Finding[] = [
    ...model.documentFindings,
    ...citations.findings,
    ...numerics.findings,
    ...copy,
    ...sections,
  ];

  // ---- ignore-waiver application (spec §3) ----
  // Waiver-shaped lines for stack skipping: valid waivers + empty-reason waiver lines.
  const waiverShapedLines = new Set<number>([
    ...model.waivers.map((w) => w.line),
    ...model.documentFindings
      .filter((f) => f.code === "WAIVER_MISSING_REASON")
      .map((f) => f.docLine),
  ]);
  const isBlank = (lineNo: number): boolean => (model.lines[lineNo - 1] ?? "").trim() === "";

  /** Target line of a waiver: next non-blank, non-waiver line; null if the stack reaches EOF. */
  function targetOf(waiverLine: number): number | null {
    for (let l = waiverLine + 1; l <= model.lines.length; l++) {
      if (waiverShapedLines.has(l) || isBlank(l)) continue;
      return l;
    }
    return null;
  }

  /** Coverage of a target line: the whole fence region when the target opens a fence. */
  function coverageOf(target: number): Set<number> {
    const cov = new Set<number>([target]);
    if (model.fencedInfo[target - 1] === null) {
      // opening delimiter: extend through interior to the closing delimiter (or EOF)
      for (let l = target + 1; l <= model.lines.length; l++) {
        cov.add(l);
        if (model.fencedInfo[l - 1] === null) break; // closer
      }
    }
    return cov;
  }

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
