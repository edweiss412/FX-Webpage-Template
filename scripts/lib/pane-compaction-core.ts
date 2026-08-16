/**
 * Orchestrator pane compaction — classifier core.
 *
 * NO SUBPROCESS SPAWNING, and unlike the precedent that claims this, the claim
 * is guarded: `tests/paneCompaction/purity.test.ts` walks `scripts/lib/` and
 * bans `node:child_process` IMPORT SYNTAX (not the bare specifier, which would
 * match prose describing the rule). Every roster, git, gh, filesystem and clock
 * read arrives through an injected surface, which is what makes non-invocation
 * assertable at one seam.
 *
 * Design: `docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md`
 */

/** Band names. Pressure is an INTEGER in tenths; see `parseGauge`. */
export type Band = "below" | "eligible" | "critical";

/**
 * Band thresholds, in tenths (spec §4.2).
 *
 * Integers deliberately: each is an `integer-literal` mutation site and each
 * comparison below is a `relational-boundary` site, both inside the declared
 * operator set (`tests/mutation/source/operators.ts:17`). A float fraction would
 * sit outside every declared operator, so the thresholds could not be attacked.
 */
export const ELIGIBLE_AT = 5;
export const CRITICAL_AT = 8;

/** Full, half and empty cells as the TUI renders them. */
const FULL = "█";
const HALF = "▓";
const EMPTY = "░";

/**
 * The gauge's anchor. It is located by this, NOT by scanning the screen for
 * block characters.
 *
 * Probed: the TUI renders a progress bar during compaction itself
 * (`███░░░░░░░░░░░░ 8%`), and a whole-screen filter reads THAT as the gauge —
 * 8 tenths, `critical` — where the real gauge beside it reads 2, `below`. The
 * pane would classify FORCE and be driven while it is already compacting, and
 * the bar exists only while a compaction runs, so the error is self-reinforcing.
 *
 * Five cells exactly: a looser count would re-admit the progress bar, which is
 * longer.
 */
const CELLS = `${FULL}${HALF}${EMPTY}`;
/** Built from the cell constants, so the glyphs have exactly one definition. */
const GAUGE = new RegExp(String.raw`ctx\s+([${CELLS}]{5})`);

/**
 * Pressure as an integer in 0..10: `2 * full + half`.
 *
 * Returns null when the screen carries no gauge — the caller demotes that to
 * UNDETERMINED rather than defaulting a band, because a default band is a
 * silent classification of something never observed.
 */
export function parseGauge(screen: string): number | null {
  const m = GAUGE.exec(screen);
  const cells = m?.[1];
  if (cells === undefined) return null;
  let tenths = 0;
  for (const c of cells) {
    if (c === FULL) tenths += 2;
    else if (c === HALF) tenths += 1;
  }
  return tenths;
}

/** Spec §4.2. Both comparisons are inclusive at the boundary. */
export function bandFor(tenths: number): Band {
  if (tenths >= CRITICAL_AT) return "critical";
  if (tenths >= ELIGIBLE_AT) return "eligible";
  return "below";
}
