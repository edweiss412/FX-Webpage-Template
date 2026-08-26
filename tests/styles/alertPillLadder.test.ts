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
 *
 * The compensating check is a rendered capture of all four states in both
 * themes, attached to the PR that added this guard (#890). Naming a
 * compensating control is a promise, so it is worth being exact about what was
 * captured rather than gesturing at "a screenshot": the four pills rendered
 * from the class strings read out of `PublishedReviewModal.tsx` at capture
 * time, measured as well as photographed. The measurement is the part that
 * survives — urgent is a tinted fill with a 1px outline in its own text colour
 * and a filled dot; monitoring is a neutral fill with a 1px outline and a
 * hollow dot; the other two states render 0px of border.
 *
 * RE-FILE TRIGGER: a fourth pill state, or a design that ranks two states at
 * the same count.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";
import { premise, premiseHolds } from "../_shared/premise";

const FILE = "components/admin/showpage/PublishedReviewModal.tsx";
// Read through the shared single source, so every walk below reads CODE.
// The ternary reader used to carry `(?:\/\*[\s\S]*?\*\/\s*)?` at three
// positions to step over comments between its tokens; with the comments
// already gone the pattern is just the ternary, and there is one fewer
// hand-rolled comment idiom in the tree.
const src = stripCommentsForFile(readFileSync(join(process.cwd(), FILE), "utf8"), FILE);

/** The four neutral ground fills; a pill wearing one is not separated by fill. */
const NEUTRAL_FILL = /(^|\s)bg-(bg|surface|surface-sunken|surface-raised)(\s|$)/;
/**
 * A resting outline COLOUR on the WHOLE box.
 *
 * Three token classes, because two of them are not outlines. `border` and
 * `border-2` are WIDTHS. `border-t` / `border-b-2` and friends are DIVIDER
 * edges, and `DESIGN.md` §1.2a puts dividers outside the control-outline rule in
 * both directions. So a colour counts only when the box is not side-restricted:
 * either a full-box width is present, or nothing restricts a side.
 *
 * The naive `border-[a-z-]+` pattern this replaces scored `border-b` as
 * emphasis, and — the case that survived the first repair — scored
 * `border-t border-border` as emphasis too, because the COLOUR there is not
 * itself a side token. A pill could then have won the ladder on the strength of
 * a rule underline.
 */
/**
 * A SIDE utility is `border-<side>` followed by anything: a width (`border-b-2`)
 * or a colour ON that side (`border-t-border`). Round 2 caught the first repair
 * recognising only STANDALONE physical widths, so three families still scored as
 * emphasis: physical side colours (`border-t-border`), logical side colours
 * (`border-s-border`), and logical side widths (`border-s`, `border-e-2`).
 * Logical sides are ordinary Tailwind authoring, not an exotic spelling.
 *
 * Everything else after `border-` is a full-box colour, including colours whose
 * NAMES begin with a side letter — `border-text-faint` and `border-border` both
 * have to keep counting, which is why the pattern requires a hyphen after the
 * side letter rather than just the letter.
 */
const SIDE = /^border-(t|r|b|l|x|y|s|e)(-.*)?$/;
// `border`, `border-2`, and an arbitrary LENGTH like `border-[1.5px]`.
//
// Round 4: the arbitrary form was missing, so a live `border-[1.5px]` scored as
// a COLOUR and a bare width counted as an outline. The first repair admitted
// any bracketed value and immediately broke the mirror case — brackets hold
// either kind, and `border-[color:var(--x)]` is a COLOUR — so the content is
// what decides: a number with an optional CSS unit is a width, anything else
// (a hex, a `color:` function, a `var()`) stays a colour.
const FULL_WIDTH = /^border(-\d+|-\[\d*\.?\d+(px|rem|em|%|vh|vw|pt|ch)?\])?$/;

/**
 * A Tailwind class is `[variant:]... [!]utility[!]`, and only the utility says
 * what is painted. Round 3 caught the predicate classifying the WHOLE token, so
 * every decorated spelling of a full-box colour fell out of the colour test by
 * failing `startsWith("border-")` — and then read as "no outline at all".
 *
 * That was a false PASS waiting to happen, not a loud failure. `emphasis()`
 * feeds a ladder of urgent OVER monitoring: an uncounted outline on the URGENT
 * arm fails loudly, but an uncounted outline on the MONITORING arm widens the
 * gap and the ladder passes while the real ladder is flat.
 *
 * Rounds 1, 2 and 3 each answered this by naming one more family — first
 * standalone physical widths, then side colours and logical sides, then the
 * important marker. That is an accept-list on an open grammar, and it fails
 * CLOSED on every spelling nobody has thought of yet. So this normalizes
 * instead: strip the decoration, classify the bare utility. It closes variants,
 * the v3 leading `!` and the v4 trailing `!` in one move, and it makes the
 * existing rules FEWER rather than more.
 *
 * It also fixes a right-answer-wrong-mechanism case. `hover:border-t-border`
 * was already rejected, but for the wrong reason: it never reached the side
 * test, it just failed to look like a colour. Now it normalizes to
 * `border-t-border` and is rejected as the divider edge it is.
 *
 * Variants are stripped at the LAST `:` before any `[`, so an arbitrary value
 * that contains a colon (`dark:border-[color:var(--x)]`) keeps its brackets
 * intact instead of being cut in half.
 */
function bare(token: string): string {
  // The variant/utility boundary is the LAST colon at bracket depth 0. Scanning
  // for it handles both directions in one rule, which is why it REPLACES the
  // earlier `indexOf("[")` special case rather than adding to it:
  //
  //   dark:border-[color:var(--x)]              colon INSIDE brackets, ignored
  //   data-[popover-side=bottom]:border-border  colon AFTER a bracketed variant
  //
  // Round 3 handled only the first and round 4 caught the second: cutting at
  // the first `[` meant the delimiter after `]` was never seen, so 17 live
  // `data-[…]:border-*` tokens went unnormalized.
  let depth = 0;
  let lastColon = -1;
  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c === "[") depth += 1;
    else if (c === "]") depth -= 1;
    else if (c === ":" && depth === 0) lastColon = i;
  }
  const utility = lastColon < 0 ? token : token.slice(lastColon + 1);
  return utility.replace(/^!/, "").replace(/!$/, "");
}

function hasOutline(classes: string): boolean {
  const tokens = classes.split(/\s+/).filter(Boolean).map(bare);
  const colour = tokens.some(
    (t) => t.startsWith("border-") && !SIDE.test(t) && !FULL_WIDTH.test(t),
  );
  if (!colour) return false;
  const sideOnly = tokens.some((t) => SIDE.test(t)) && !tokens.some((t) => FULL_WIDTH.test(t));
  return !sideOnly;
}

/**
 * How many emphasis affordances a pill's own class string carries.
 *
 * Deliberately not a contrast number: contrast is what ranks these wrong.
 */
function emphasis(classes: string): number {
  let n = 0;
  if (/(^|\s)bg-[a-z]/.test(classes) && !NEUTRAL_FILL.test(classes)) n += 1;
  if (hasOutline(classes)) n += 1;
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
  const m = slice.match(/monitoringOnly\s*\?\s*"([^"]*)"\s*:\s*"([^"]*)"/);
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
    expect(hasOutline(urgent)).toBe(true);
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

/**
 * The predicate itself, on the shapes that actually occur in this repo.
 *
 * Without these the exclusion is a comment: the pills carry no side-specific
 * border today, so the ladder above passes either way and a regression here
 * would be invisible until a pill grew a divider.
 */
describe("the outline predicate does not count a divider as emphasis", () => {
  it.each([
    ["border-warning-text", true],
    ["border border-warning-text bg-warning-bg", true],
    ["rounded-pill border border-text-faint bg-surface-sunken", true],
    ["border border-b-2 border-text-faint", true],
    ["border-text-faint", true],
    ["border-border", true],
    ["border-t-border", false],
    ["border-b-border", false],
    ["border-x-border", false],
    ["border-s-border", false],
    ["border-e-border", false],
    ["border-s", false],
    ["border-e-2", false],
    ["border-b", false],
    ["border-t border-border", false],
    ["border-b-2 border-accent", false],
    ["border", false],
    ["border-2", false],
    ["rounded-pill px-2.5", false],
    // Round 3. A decorated full-box colour is still a full-box colour. The
    // first three are the important marker in both spellings the ecosystem
    // uses; the rest are variants, which are ordinary authoring here.
    ["!border-warning-text", true],
    ["border-warning-text!", true],
    ["hover:border-border-strong", true],
    ["sm:border-border", true],
    ["max-sm:border-text-faint", true],
    ["dark:hover:border-accent", true],
    ["dark:border-[color:var(--x)]", true],
    // ...and a decorated DIVIDER is still a divider. This one was already
    // rejected before round 3, but by the wrong mechanism: it never reached
    // the side test, it just failed to look like a colour at all.
    ["hover:border-t-border", false],
    ["max-sm:border-b-2", false],
    ["!border-s", false],
    // Round 4, finding 1. A BRACKETED variant puts the delimiter after `]`, so
    // cutting at the first `[` never saw it. All three are one edit from live
    // tokens in HoverHelp.tsx, ShareHub.tsx and KeyTimesStrip.tsx.
    ["data-[popover-side=bottom]:border-border-strong", true],
    ["group-data-[popover-side=top]:border-accent", true],
    ["data-[popover-side=bottom]:border-b-border-strong", false],
    ["min-[720px]:border-l-0", false],
    // Round 4, finding 2. Brackets hold EITHER kind, so the content decides.
    // A length is a width; a hex or a `color:` function is still a colour —
    // the first repair admitted any bracketed value and broke the second line.
    ["border-[1.5px]", false],
    ["size-2 shrink-0 rounded-pill border-[1.5px] bg-transparent", false],
    ["border-[1.5px] border-status-positive", true],
    ["border-[#fff]", true],
    ["dark:border-[color:var(--x)]", true],
  ])("%s -> %s", (classes, expected) => {
    expect(hasOutline(classes as string)).toBe(expected);
  });
});

/**
 * The cases above are an enumeration, and an enumeration re-opens the moment
 * somebody writes a spelling nobody listed — which is exactly how rounds 1, 2
 * and 3 each found one more. This is the derived half: it reads every border
 * utility the app ACTUALLY uses and asserts normalization leaves a bare
 * utility, so a new decoration fails here without anyone adding a case.
 *
 * It asserts against the real corpus rather than a fixture, and it states its
 * own premise first: a walk that silently matched nothing would pass every
 * assertion under it.
 */
describe("normalization covers the decorations the app really uses", () => {
  const used = new Set<string>();
  const stack = [join(process.cwd(), "app"), join(process.cwd(), "components")];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(tsx?|mdx)$/.test(entry.name)) {
        const code = stripCommentsForFile(readFileSync(full, "utf8"), full);
        // The prefix must admit a BRACKETED variant (`data-[popover-side=bottom]:`),
        // or the match starts mid-token and the walk records truncations like
        // ":border-t-0" — which normalize and look idempotent while testing nothing.
        for (const m of code.matchAll(/[\w:![\]=.-]*\bborder-[\w[\]().:%-]+!?/g)) {
          used.add(m[0]);
        }
      }
    }
  }

  // Round 4 found this cover VACUOUS for a whole family: its match started
  // mid-token on `data-[popover-side=bottom]:border-b-0`, so it recorded the
  // truncation ":border-t-0" — which normalizes fine and looks idempotent while
  // testing nothing. Non-vacuity has to be asserted on the SHAPE of what was
  // recorded, not only on the count.
  it("records whole utilities, never a truncation", () => {
    const truncated = [...used].filter((c) => c.startsWith(":") || c.startsWith("-"));
    expect(truncated).toEqual([]);
    // and the bracketed-variant family is actually present, or the assertion
    // above ranges over a set that never contained the hard case.
    premiseHolds(
      "a bracketed data-[…] variant border is in use",
      [...used].some((c) => /^(group-)?data-\[[^\]]*\]:border-/.test(c)),
    );
  });

  it("premise: the walk found the decorated spellings this repo is known to use", () => {
    premise("border utilities found across app/ and components/", used.size, 20);
    // Named because each was found live in the tree; if the walk stopped
    // seeing them the assertions below would pass on an empty set.
    premiseHolds(
      "a hover: variant border is in use",
      [...used].some((c) => c.startsWith("hover:border-")),
    );
    premiseHolds(
      "a max-sm: variant border is in use",
      [...used].some((c) => c.startsWith("max-sm:border-")),
    );
  });

  it("leaves no variant prefix or important marker on any utility in use", () => {
    const leftover = [...used]
      .map((c) => [c, bare(c)] as const)
      // An arbitrary value legitimately keeps a colon INSIDE its brackets.
      .filter(
        ([, b]) => (b.includes(":") && !b.includes("[")) || b.startsWith("!") || b.endsWith("!"),
      );
    expect(leftover).toEqual([]);
  });

  it("is idempotent, so normalizing twice cannot change a verdict", () => {
    const unstable = [...used].filter((c) => bare(bare(c)) !== bare(c));
    expect(unstable).toEqual([]);
  });
});
