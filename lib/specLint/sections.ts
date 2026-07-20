import type { DocModel } from "./parse";
import type { Finding } from "./types";

const RESOLVED_SCOPE = /resolved scope/i;
const DIMENSIONAL = /dimensional invariants/i;
const TRANSITION = /transition inventory/i;

const docFail = (code: string, message: string): Finding => ({
  check: "sections",
  code,
  severity: "fail",
  docLine: 1,
  column: 1,
  message,
});

function isUiPath(p: string): boolean {
  if (p.startsWith("components/")) return true;
  return p.startsWith("app/") && !p.startsWith("app/api/");
}

export function checkSections(
  model: DocModel,
  kind: "spec" | "plan",
  resolvedPaths: string[],
): Finding[] {
  if (kind === "plan") return [];
  const findings: Finding[] = [];
  const headingTexts = model.headings.map((h) => h.text);

  if (!headingTexts.some((t) => RESOLVED_SCOPE.test(t))) {
    findings.push(
      docFail(
        "SECTION_MISSING_RESOLVED_SCOPE",
        'spec has no "Resolved scope — do not relitigate" heading',
      ),
    );
  }

  const notUiWaived = model.waivers.some((w) => w.kind === "not-ui");
  if (!notUiWaived && resolvedPaths.some(isUiPath)) {
    if (!headingTexts.some((t) => DIMENSIONAL.test(t))) {
      findings.push(
        docFail(
          "SECTION_MISSING_DIMENSIONAL_INVARIANTS",
          'UI spec has no "Dimensional Invariants" heading',
        ),
      );
    }
    if (!headingTexts.some((t) => TRANSITION.test(t))) {
      findings.push(
        docFail(
          "SECTION_MISSING_TRANSITION_INVENTORY",
          'UI spec has no "Transition Inventory" heading',
        ),
      );
    }
  }
  return findings;
}
