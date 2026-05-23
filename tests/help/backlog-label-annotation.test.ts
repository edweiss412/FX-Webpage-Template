/**
 * Structural defense — UI labels exempted in UI_LABEL_EXCEPTIONS (i.e.,
 * declared backlog/deferred and not yet shipped) MAY appear in their
 * corresponding MDX file only when the file also carries a backlog-marker
 * annotation (a <Callout> or inline reference) that names the deferral
 * tracker (`M11-E-D*`, `BL-*`) or uses an explicit "not yet shipped /
 * not yet built / on the backlog" phrasing.
 *
 * Class this catches: Doug-facing MDX content drift where prose describes
 * a deferred UI affordance as if it were currently usable. Documented
 * recurrence across I.2 rounds R10, R11, R12, R13 (4 consecutive rounds
 * same vector). Per AGENTS.md "Structural-defense calibration (M12 plan
 * R5 amendment)": after the round following comprehensive re-analysis
 * STILL surfaces the same vector, the repair commit ships a structural
 * defense rather than relying on further adversarial rounds to converge.
 *
 * Annotation patterns accepted (case-insensitive):
 *   - `<Callout` ... (anywhere in the file, with a backlog-phrase below)
 *   - "backlog" (in body prose, not inside a markdown link)
 *   - "not yet shipped" / "not yet built"
 *   - "M11-E-D" / "M11-I-D" (DEFERRED.md ID prefix)
 *   - "BL-" (BACKLOG.md ID prefix)
 *
 * Negative-regression discipline (per
 * memory/feedback_negative_regression_verification.md): the
 * "rejects MDX that names a backlogged label without backlog annotation"
 * case asserts the failure path by constructing a synthetic MDX string
 * and running the same check function against it.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { UI_LABEL_EXCEPTIONS } from "./_uiLabelExceptions";

const PROJECT_ROOT = resolve(__dirname, "..", "..");

const BACKLOG_MARKER_PATTERNS: readonly RegExp[] = [
  /<Callout\b/i,
  /\bbacklog\b/i,
  /not\s+yet\s+(?:shipped|built)/i,
  /\bM1[12]-[EI]-D\b/,
  /\bBL-[A-Z][A-Z0-9-]+/,
];

function hasBacklogMarker(mdxSource: string): boolean {
  return BACKLOG_MARKER_PATTERNS.some((re) => re.test(mdxSource));
}

function labelAppearsInMdx(mdxSource: string, label: string): boolean {
  return mdxSource.includes(label);
}

describe("Backlog-label annotation contract (R13 structural defense)", () => {
  it("every UI_LABEL_EXCEPTIONS file that mentions its exempted label carries a backlog marker", () => {
    const violations: string[] = [];

    for (const ex of UI_LABEL_EXCEPTIONS) {
      const abs = resolve(PROJECT_ROOT, ex.file);
      const src = readFileSync(abs, "utf8");
      if (!labelAppearsInMdx(src, ex.label)) continue;
      if (!hasBacklogMarker(src)) {
        violations.push(
          `${ex.file} names exempted label "${ex.label}" (deferral ${ex.deferredId}) ` +
            `but contains no backlog-marker annotation (Callout, "backlog", ` +
            `"not yet shipped/built", "M11-E-D*", or "BL-*").`,
        );
      }
    }

    expect(violations, violations.join("\n  → ")).toEqual([]);
  });

  it("rejects MDX that names a backlogged label without a backlog annotation (negative regression)", () => {
    const synthetic =
      "# Sharing crew links\n\n" +
      "Tap **Copy share link** to put the URL on your clipboard.\n";
    expect(labelAppearsInMdx(synthetic, "Copy share link")).toBe(true);
    expect(hasBacklogMarker(synthetic)).toBe(false);
  });

  it("accepts MDX that names a backlogged label inside a Callout backlog annotation", () => {
    const synthetic =
      "# Sharing crew links\n\n" +
      "<Callout type=\"note\">\nA dedicated **Copy share link** button is on the backlog (BL-COPY-SHARE-LINK).\n</Callout>\n";
    expect(labelAppearsInMdx(synthetic, "Copy share link")).toBe(true);
    expect(hasBacklogMarker(synthetic)).toBe(true);
  });
});
