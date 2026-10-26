/**
 * Splits an `event_details.dress_code` value into phase/attire pairs.
 *
 * The DRESS block (lib/parser/blocks/dress.ts) keeps the sheet's labels and joins
 * one line per phase with "\n": `Set/Strike: Black Pants, …` / `Show: …`. Both
 * dress renderers (crew Today card, admin step-3 review) show the phase as a
 * label over its attire instead of one undifferentiated block.
 *
 * Returns null unless there are at least two non-blank lines and EVERY one is
 * `<phase>: <attire>`, so free text and mixed values keep their plain
 * rendering. A single line stays plain because "Business casual: no jeans"
 * would otherwise demote the main instruction to a label, and one phase has
 * nothing to compare against. The phase holds no colon and no sentence
 * punctuation ("All black. Note: no logos"), and the colon must be followed by
 * whitespace, which keeps times ("7:00 PM") and URLs from being split. A wrong
 * split would put sheet text under the wrong label; falling back to plain text
 * loses nothing.
 */
export type DressCodeLine = { phase: string; attire: string };

// 24 chars covers "Set/Strike", "Load In/Out", "Show Day 2" with room to spare
// and rejects sentences that happen to contain ": ".
const PHASE_LINE = /^([^:.!?]{1,24}):\s+(\S.*)$/;

export function parseDressCodeLines(value: string): DressCodeLine[] | null {
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;

  const parsed: DressCodeLine[] = [];
  for (const line of lines) {
    const match = PHASE_LINE.exec(line);
    const phase = match?.[1]?.trim();
    const attire = match?.[2]?.trim();
    if (!phase || !attire) return null;
    parsed.push({ phase, attire });
  }
  return parsed;
}
