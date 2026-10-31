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

/** The work a day is for, as far as attire goes: show days, and the load-in day. */
export type DressPhase = "show" | "set_strike";

/**
 * The phase names each day's attire goes by, lower case. A label names the phase
 * when it, or one of its parts split on "/", "&", "," or "and", is one of these:
 * "Set/Strike" and "Load In/Out" name the load-in day, "Show" the show days.
 */
const PHASE_NAMES: Record<DressPhase, ReadonlySet<string>> = {
  show: new Set(["show"]),
  set_strike: new Set([
    "set",
    "set up",
    "set-up",
    "setup",
    "strike",
    "load in",
    "load-in",
    "loadin",
    "load out",
    "load-out",
  ]),
};

/** True when a line's phase label names the day's phase. */
function namesPhase(label: string, phase: DressPhase): boolean {
  const names = PHASE_NAMES[phase];
  const whole = label.toLowerCase().replace(/\s+/g, " ").trim();
  return whole.split(/\s*[/&,]\s*|\s+and\s+/).some((part) => names.has(part));
}

/**
 * The one line of a phased dress code that names `phase`, or null: the value is
 * not phased (`parseDressCodeLines`), no line names the phase, or more than one
 * does. Conservative by design (UI-gate re-run, critique N1): the pass and the
 * quick-fact tile show the day's line only when there is exactly one to show,
 * and the whole value otherwise, so a wrong guess never hides the right attire.
 */
export function dressCodeLineForPhase(value: string, phase: DressPhase): DressCodeLine | null {
  const lines = parseDressCodeLines(value);
  if (lines === null) return null;
  const matches = lines.filter((line) => namesPhase(line.phase, phase));
  return matches.length === 1 ? matches[0]! : null;
}
