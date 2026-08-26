/**
 * `--color-text-faint` as the RESTING colour of an action target.
 *
 * WHY THIS EXISTS. DESIGN §1.1a bars `--color-text-subtle` from resting on an
 * action target outside three ratified carve-out families.
 * `BL-TEXT-FAINT-AS-RESTING-INTERACTIVE-COLOUR` found four controls resting one
 * rung QUIETER than the token that rule retired, at `--color-text-faint`, which
 * §1.1 already describes as "never used for crew-actionable copy". The census
 * that arc shipped was ratified around ONE token and policing a second is a
 * guard-contract change plus a re-census, so the row filed the question instead:
 * is the faint rung admissible at rest, and under what condition?
 *
 * THE CONDITION, ruled 2026-08-25 (design doc
 * 2026-08-25-ui-polish-class-sweep-design.md, D4). Admissible only where the
 * control renders NO TEXT OF ITS OWN — a glyph-only target whose glyph is the
 * affordance — or where a non-colour affordance at 3:1 or better carries it.
 *
 * The line falls where it does because `text-faint` has TWO problems and only
 * one of them is the hierarchy problem §1.1a is about. On `--color-surface` it
 * measures 3.35:1. That clears the 3:1 non-text floor a glyph or a boundary is
 * held to, and it is under the 4.5:1 floor for TEXT. So a control that renders
 * a label cannot rest here on contrast grounds alone, whatever one thinks about
 * hierarchy, and a glyph-only control is not making the claim that fails.
 *
 * WHY A REGISTRY AND NOT A CENSUS. Policing a second token repo-wide means
 * re-running the ratified `text-text-subtle` census against a second token and
 * re-litigating its 14 exemption rows, which this arc is explicitly fenced out
 * of. The four sites the ledger row PROBED are the subject; each kept one names
 * the affordance that carries it, and the suite reads the live source so a row
 * cannot go stale silently.
 *
 * DOCUMENTED LIMIT: a FIFTH control resting at `text-faint` added tomorrow is
 * not caught here. RE-FILE TRIGGER: a control resting at `text-faint` reaching
 * `main` that renders its own text, or a decision to police the token repo-wide.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";

const ROOT = process.cwd();

type Site = {
  readonly file: string;
  readonly anchor: string;
  readonly window: number;
  /** What carries the control at rest without relying on its colour. */
  readonly affordance: string;
};

/** The two of the four that meet the condition, each naming its affordance. */
const KEPT: readonly Site[] = [
  {
    file: "components/shared/CardReportTrigger.tsx",
    anchor: 'data-testid="card-report-trigger"',
    window: 6,
    affordance:
      "glyph-only: the element renders <FlagGlyph /> and no text at all, so its shape IS the control and 3.35:1 is measured against the 3:1 non-text floor, not the 4.5:1 text one. Its accessible name is an aria-label, which carries no colour.",
  },
  {
    file: "components/admin/HoverHelp.tsx",
    anchor: "cursor-help place-items-center rounded-full border border-text-faint",
    window: 3,
    affordance:
      "a boundary plus a native affordance: the circular badge's own border is text-faint at 3.35:1 on surface, clearing the non-text floor, and `cursor-help` names the control on hover without colour. Its single `?` is aria-hidden and acts as a glyph inside that boundary rather than as copy.",
  },
];

/** The two that did NOT meet it, pinned at the token they moved to. */
const SWAPPED: readonly Site[] = [
  {
    file: "components/crew/primitives/SourceLink.tsx",
    anchor: 'data-slot="source-link"',
    window: 8,
    affordance:
      'renders the label "In sheet", so the faint rung put crew-actionable copy at 3.35:1, under the 4.5:1 text floor. Rests at text-text; hover steps to text-text-strong because its old hover target (text-subtle) is now lighter than its rest.',
  },
  {
    file: "components/admin/BellPanel.tsx",
    anchor: "const GHOST_RESOLVE",
    window: 4,
    affordance:
      'renders "Confirm" or "Mark resolved" as its whole content, with no glyph and no resting boundary, so colour was the only thing carrying it. Rests at text-text; the hover fill stays and the hover text steps to text-text-strong.',
  },
];

function windowAt(site: Site): string {
  const src = readFileSync(join(ROOT, site.file), "utf8").split("\n");
  const at = src.findIndex((l) => l.includes(site.anchor));
  premiseHolds(`the anchor ${site.anchor} is still in ${site.file}`, at >= 0);
  return src.slice(at, at + site.window).join(" ");
}

describe("text-faint at rest is admissible only where a non-colour affordance carries the control", () => {
  it.each(KEPT.map((s) => [s.file, s] as const))(
    "%s keeps text-faint and names what carries it",
    (_label, site) => {
      expect(windowAt(site)).toContain("text-faint");
      expect(site.affordance.trim().length).toBeGreaterThan(60);
    },
  );

  it.each(SWAPPED.map((s) => [s.file, s] as const))(
    "%s no longer rests at text-faint",
    (_label, site) => {
      const w = windowAt(site);
      // Whole-token: `text-text-faint` must be gone, but `border-text-faint`
      // elsewhere in the same window is a different job and stays.
      expect(/(^|\s)text-text-faint(\s|"|`)/.test(w)).toBe(false);
      expect(w).toContain("text-text");
    },
  );

  /**
   * Hover must stay HEAVIER than rest, and raising a resting colour is exactly
   * how that pair gets inverted. Both swapped sites had `text-subtle` as their
   * hover target, which is now LIGHTER than their new rest — §1.1a's own
   * remedy is that such a site steps its hover to `text-text-strong`.
   */
  it.each(SWAPPED.map((s) => [s.file, s] as const))(
    "%s steps its hover above its new resting colour",
    (_label, site) => {
      const w = windowAt(site);
      expect(w).toContain("hover:text-text-strong");
      expect(w).not.toContain("hover:text-text-subtle");
    },
  );

  it("states the condition in DESIGN.md §1.1a", () => {
    const design = readFileSync(join(ROOT, "DESIGN.md"), "utf8").replace(/\s+/g, " ").toLowerCase();
    expect(design).toContain("renders no text of its own");
  });
});
