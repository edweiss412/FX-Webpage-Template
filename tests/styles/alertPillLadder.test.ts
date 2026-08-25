/**
 * The three `-alert-pill` states in the published-review modal, ranked.
 *
 * WHY THIS EXISTS. The alert pill has a two-branch form: monitoring-only
 * ("clearing on their own, no action needed") and needs-you. After the
 * subtle-on-interactive swap the QUIET branch carried more contrast than the
 * URGENT one — `text-text` on `bg-surface-sunken` is roughly 15:1, while
 * `text-warning-text` on `bg-warning-bg` is 8.8:1 — so the pill that means
 * "nothing to do" read louder than the pill that means "you are needed"
 * (`BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT`).
 *
 * THE ROW NAMES ONE PILL; THE SHAPE COVERS THREE. The same file carries an
 * "Alerts unavailable" pill and an "In sync" pill under the same testid, and a
 * fix that ranked two of three would leave the same defect one branch over.
 *
 * WHY WEIGHT AND NOT TEXT CONTRAST. The obvious repair — dim the monitoring
 * branch until it loses — trades a hierarchy problem for a legibility one on a
 * pill an operator has to read. So the urgent branch GAINS instead, and it
 * gains the one emphasis affordance it was missing: a boundary in its own text
 * colour. It already had the tinted fill and the filled dot.
 *
 * WHAT THIS ASSERTS, and why it is not a contrast test. Text contrast alone
 * ranks these wrong — that is the bug. What a reader actually ranks is how many
 * emphasis affordances a pill carries: a fill that separates it from the panel,
 * a resting boundary, and a filled rather than hollow status dot. Those are
 * read off the shipped class strings, so the ladder is derived from the source
 * rather than from a screenshot or an opinion.
 *
 * DOCUMENTED LIMIT: this ranks AFFORDANCE COUNT, which is a proxy. Two pills
 * with the same count are not ordered by it, and it says nothing about hue.
 * The visual check is a screenshot the PR body links. RE-FILE TRIGGER: a fourth
 * pill state, or a design that ranks two states at the same count.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premise } from "../_shared/premise";

const FILE = "components/admin/showpage/PublishedReviewModal.tsx";
const src = readFileSync(join(process.cwd(), FILE), "utf8");

/** The four neutral ground fills; a pill wearing one is not separated by fill. */
const NEUTRAL_FILL = /(^|\s)bg-(bg|surface|surface-sunken|surface-raised)(\s|$)/;
/** A resting outline COLOUR. `border` alone is a width. */
const OUTLINE = /(^|\s)border-[a-z][a-z0-9-]*(\s|$)/;

/**
 * How many emphasis affordances a pill's own class string carries.
 *
 * Deliberately not a contrast number: contrast is what ranks these wrong.
 */
function emphasis(classes: string): number {
  let n = 0;
  if (/(^|\s)bg-[a-z]/.test(classes) && !NEUTRAL_FILL.test(classes)) n += 1;
  if (OUTLINE.test(classes)) n += 1;
  return n;
}

/**
 * The two arms of the two-branch pill, read out of the pill's OWN `className`.
 *
 * Searching the file for `monitoringOnly ? … : …` finds the status DOT's
 * ternary too — it branches on the same flag, a few lines below, inside the same
 * button — and which one a bare regex lands on depends on where a comment
 * happens to sit. So this walks from the testid to the first `className={`
 * after it and reads the ternary inside that attribute, which is the pill's by
 * construction rather than by luck.
 */
function branches(): { monitoring: string; urgent: string } {
  const testid = src.indexOf("-alert-pill`");
  if (testid < 0) throw new Error("the alert pill testid is gone");
  const attr = src.indexOf("className={", testid);
  if (attr < 0) throw new Error("the alert pill has no className attribute");
  // The attribute value is a template literal; its arms are the only two
  // double-quoted strings inside it that sit either side of the `:`.
  const slice = src.slice(attr, src.indexOf("}`}", attr));
  const m = slice.match(
    /monitoringOnly\s*(?:\/\*[\s\S]*?\*\/\s*)?\?\s*(?:\/\*[\s\S]*?\*\/\s*)?"([^"]*)"\s*:\s*(?:\/\*[\s\S]*?\*\/\s*)?"([^"]*)"/,
  );
  if (!m) throw new Error("the two-branch alert pill's ternary is no longer readable");
  return { monitoring: m[1]!, urgent: m[2]! };
}

/**
 * The single-branch pills, anchored on the TESTID that identifies them.
 *
 * Anchoring on the copy and reading backwards finds the status DOT's className,
 * which is the nearest one above "In sync" and scores 2 on its own — a pill
 * would then be ranked by its decoration. The testid is on the pill element
 * itself, so the first className after it is the pill's.
 */
function pillNear(marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`no pill near ${marker}`);
  const testid = src.lastIndexOf("-alert-pill`", at);
  if (testid < 0) throw new Error(`no alert-pill testid above ${marker}`);
  const m = /className="([^"]*)"/.exec(src.slice(testid, at));
  if (!m) throw new Error(`no className between the testid and ${marker}`);
  return m[1]!;
}

describe("the alert pill ladder (BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT)", () => {
  it("premise: the file still carries all three alert-pill states", () => {
    premise("alert-pill testids", (src.match(/-alert-pill`/g) ?? []).length, 2);
  });

  it("ranks the urgent branch above the monitoring one", () => {
    const { monitoring, urgent } = branches();
    // Strictly above. Equal would mean the repair bought nothing, which is the
    // state this row was filed against.
    expect(emphasis(urgent)).toBeGreaterThan(emphasis(monitoring));
  });

  it("gives the urgent branch a boundary, which is the affordance it lacked", () => {
    const { urgent } = branches();
    expect(OUTLINE.test(urgent)).toBe(true);
  });

  it("leaves the monitoring branch's own weight where it was", () => {
    // The repair must not be "dim the quiet one until it loses": that trades a
    // hierarchy problem for a legibility one on a pill an operator reads.
    const { monitoring } = branches();
    expect(monitoring).toContain("text-text");
    expect(monitoring).not.toContain("text-text-subtle");
    expect(monitoring).not.toContain("text-text-faint");
  });

  it.each([
    ["Alerts unavailable", "Alerts unavailable"],
    ["In sync", "In sync"],
  ])("ranks the urgent branch above the %s pill too", (_label, marker) => {
    const { urgent } = branches();
    expect(emphasis(urgent)).toBeGreaterThan(emphasis(pillNear(marker)));
  });
});
