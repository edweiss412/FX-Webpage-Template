/**
 * tests/messages/popoverContextCoverage.ts
 * (spec 2026-07-20-alert-popover-context-design §4)
 *
 * Pure coverage checker for the compact-alert "?" popover. Returns a list of
 * violations of the four §4 rules. Two consumers: the live meta-test asserts
 * zero violations against the real catalog + shipped ledger; synthetic-input
 * unit tests exercise every rule/branch on hand-built fixtures (including the
 * exemption branches the empty ledger leaves un-exercised on the live catalog).
 */
import type { ReactNode } from "react";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { HELP_ONLY_LEARN_MORE_LEAD_IN } from "@/components/admin/compactAlertHelp";

export type CoverageEntry = {
  code: string;
  helpHref: string | null;
  helpfulContext: string | null;
};
export type ExemptRow = { code: string; reason: string };
export type Violation = { rule: 1 | 2 | 3 | 4; code: string; detail: string };

/** Flatten renderEmphasis output (marker-free copy => [string]) to text. */
function renderedText(node: ReactNode): string {
  if (node === null || node === undefined || node === false || node === true) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(renderedText).join("");
  const props = (node as { props?: { children?: ReactNode } }).props;
  return props ? renderedText(props.children) : "";
}

export function checkPopoverContextCoverage(
  entries: readonly CoverageEntry[],
  exempt: readonly ExemptRow[],
): Violation[] {
  const violations: Violation[] = [];
  const exemptCodes = new Set(exempt.map((r) => r.code));
  const byCode = new Map(entries.map((e) => [e.code, e] as const));

  // Rule 4: ledger closed and non-vacuous.
  const seen = new Set<string>();
  for (const row of exempt) {
    if (seen.has(row.code))
      violations.push({ rule: 4, code: row.code, detail: "duplicate exemption row" });
    seen.add(row.code);
    const e = byCode.get(row.code);
    if (e === undefined) {
      violations.push({ rule: 4, code: row.code, detail: "exempt code not in catalog" });
      continue;
    }
    if (e.helpHref === null)
      violations.push({
        rule: 4,
        code: row.code,
        detail: "exempt code has no helpHref; it never reaches a popover",
      });
    if (row.reason.trim().length === 0)
      violations.push({ rule: 4, code: row.code, detail: "exemption reason is empty" });
  }

  // Rule 3: exemption and authored copy are mutually exclusive.
  for (const row of exempt) {
    const e = byCode.get(row.code);
    if (e !== undefined && e.helpfulContext !== null)
      violations.push({
        rule: 3,
        code: row.code,
        detail: "exempt code also authors helpfulContext; drop one",
      });
  }

  // Rules 1 and 2 over popover-reachable entries (helpHref != null).
  for (const e of entries) {
    if (e.helpHref === null) continue;
    const isExempt = exemptCodes.has(e.code);
    if (e.helpfulContext === null) {
      if (!isExempt)
        violations.push({
          rule: 1,
          code: e.code,
          detail: "helpHref set but helpfulContext null and not exempt",
        });
      continue;
    }
    // helpfulContext non-null. Rule 3 already flags exempt+authored; skip rule 2 there.
    if (isExempt) continue;
    // Mirror production: nonEmpty trims first, then renderEmphasis renders the trimmed value.
    const text = renderedText(renderEmphasis(e.helpfulContext.trim())).trim();
    if (text.length === 0)
      violations.push({ rule: 2, code: e.code, detail: "helpfulContext renders empty after trim" });
    else if (text === HELP_ONLY_LEARN_MORE_LEAD_IN)
      violations.push({
        rule: 2,
        code: e.code,
        detail: "helpfulContext equals the fallback lead-in",
      });
  }

  return violations;
}
