/**
 * The control outline on a TINTED plate.
 *
 * WHY THIS EXISTS. `--color-text-faint` is the control-outline token
 * (DESIGN.md §1.2a). It clears 3:1 against all four neutral grounds, and on a
 * `warning-bg` / `info-bg` / `danger-bg` card it does not: 3.04 light / **2.79**
 * dark on warning, **2.87** light / 3.48 dark on info, **2.88** light / 3.19
 * dark on danger — under the floor in exactly one theme per plate, never both.
 * `BL-CONTROL-OUTLINE-ON-TINTED-PLATES` filed the design question and this arc
 * answered it (design doc 2026-08-25-ui-polish-class-sweep-design.md, D2):
 * a SECOND token used only on a tinted plate, rather than retuning the shared
 * one, because the four neutral grounds already clear and moving the shared
 * token pushes them the other way.
 *
 * HOW COMPLETENESS IS ARGUED, and where it stops.
 *
 * The repo already declares "this control stands on a tinted plate" ON THE
 * ELEMENT ITSELF: `focus-visible:ring-offset-<plate>` must match the card fill
 * the control sits on, a contract an impeccable audit P2 established and the
 * shipped code keeps (see the comment above `RING_OFFSET` in
 * `components/admin/DataQualityWarningControls.tsx`). That signal is
 * element-level, so it needs no ancestor resolution, and the derived arm below
 * walks the whole scanned universe for it. A control added tomorrow that
 * follows the ring-offset contract fails here by default.
 *
 * It does not reach everything, and the registry arm names each site it misses
 * WITH the reason, rather than presenting a hand list as if it were a cover.
 * The three ways a real tinted-plate control stays invisible to the derived arm:
 * a ring-offset resolved through a Record indexed by a variable (the scanner
 * reports the class string unresolved), a control whose file simply never
 * declared a ring-offset, and an element kind the scanner does not admit at all.
 *
 * DOCUMENTED LIMIT (L1 in the design doc), and it STANDS. Asking "is this
 * control inside a tinted plate?" in general needs ancestor RESOLUTION, and a
 * `focus-visible:ring-offset-*` on the element is still the only element-level
 * signal for it.
 *
 * The scanner did gain declared widening axes on 2026-08-26, and this scan opts
 * into both, so `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` is closed rather than
 * left untouched. That does not weaken the limit above: those axes answer "what
 * paints inside this control", which is a different question from "what plate is
 * this control standing on". The registry arm below is still the honest half.
 * RE-FILE TRIGGER: a control on a tinted plate reaching `main` at
 * `border-text-faint`, or the scanner gaining ANCESTOR resolution for some
 * other reason.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { stripCommentsForFile } from "../_shared/stripComments";

import { premise } from "../_shared/premise";
import { allStrings, scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

import { SECONDARY_ACTION_CLASS, SECONDARY_ACTION_ON_TINTED_CLASS } from "@/lib/ui/actionClass";

const ROOT = process.cwd();
// Spec §7.2: this guard reads BOTH declared axes, because the plate question
// reaches a text field exactly as the user's 2026-08-26 ruling says it does.
const UNIVERSE = scanInteractiveElements(ROOT, { textEntry: true, paintedChildren: true });

/** The token this arc added. Named once; every assertion below reads it. */
const TINTED = "border-control-outline-tinted";

/** A resting outline colour. `border` alone is a width, not a colour. */
const RESTING_OUTLINE =
  /(^|\s)border-(text-faint|border|border-strong|control-outline-tinted)(\s|$)/;
const TINTED_RING_OFFSET = /(^|\s)focus-visible:ring-offset-(warning-bg|info-bg|danger-bg)(\s|$)/;

function has(strings: readonly string[], token: string): boolean {
  const whole = new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  return strings.some((s) => whole.test(s));
}

/**
 * Elements whose OWN resolved class strings declare both a tinted plate and a
 * resting outline. This is the derived subject list; nothing about it is typed
 * out by hand.
 */
const DERIVED: ScanElement[] = UNIVERSE.filter((e) => {
  const strings = allStrings(e);
  return (
    strings.some((s) => TINTED_RING_OFFSET.test(s)) && strings.some((s) => RESTING_OUTLINE.test(s))
  );
});

describe("controls that declare a tinted plate carry the tinted outline", () => {
  it("premise: the scanner reaches the tree and finds tinted-plate controls in it", () => {
    // Without both, every assertion below is vacuously true over an empty list
    // — the failure mode a derived cover is most exposed to.
    premise("scanner reaches the component tree", UNIVERSE.length, 200);
    premise("the derived subject list is non-empty", DERIVED.length, 5);
  });

  it.each(DERIVED.map((e) => [`${e.file}:${e.line}`, e] as const))(
    "%s carries the tinted-plate outline",
    (_label, element) => {
      const strings = allStrings(element);
      expect(has(strings, TINTED)).toBe(true);
      expect(has(strings, "border-text-faint")).toBe(false);
    },
  );
});

/**
 * The sites the derived arm cannot see, each with the reason it cannot.
 *
 * A registry is weaker than a walk and this one says so in its own rows. It is
 * here because the alternative — presenting these five as if the walk had found
 * them — would make the cover claim something it does not do.
 */
type RegistryRow = {
  readonly file: string;
  /** A stable literal near the control. Line numbers drift; these do not. */
  readonly anchor: string;
  /** Lines to read after the anchor. The window is part of the claim. */
  readonly window: number;
  readonly plate: "warning-bg" | "info-bg" | "danger-bg";
  /**
   * The literal that must appear in the window. Usually the token; for the two
   * links of the RescanSheetButton chain it is the NEXT link, so the chain is
   * pinned end to end rather than only at its ends.
   */
  readonly carries: string;
  /** Why the derived arm cannot see this one. Never blank. */
  readonly invisibleBecause: string;
  /**
   * How many `border-text-faint` occurrences this file legitimately keeps — the
   * controls in it that stand on a NEUTRAL ground.
   *
   * This is the fail-by-default half. The anchored check above proves the
   * registered site still wears the plate token; it says nothing about a
   * FOURTEENTH control appearing in the same file. Pinning the neutral count
   * means adding one fails here and forces the author to answer the only
   * question that matters: is the new control standing on a plate?
   *
   * The recorded numbers are CODE-ONLY, counted with comments stripped. The
   * first draft counted raw text and was inflated by prose in two files — the
   * very bug this branch hit three times elsewhere. If one of these looks too
   * low, check whether the occurrence you are thinking of is in a comment.
   *
   * Not "an unregistered occurrence is a defect" — a neutral-ground control in
   * a file that also has a plate control is perfectly correct, and
   * `RoleMappingRow` is exactly that (its edit button is on the row card, its
   * remove-confirm button is inside the warning plate).
   */
  readonly neutralFaintCount: number;
};

const REGISTRY: readonly RegistryRow[] = [
  {
    file: "components/admin/DataQualityWarningControls.tsx",
    anchor: "const PLATE",
    window: 8,
    plate: "warning-bg",
    carries: TINTED,
    invisibleBecause:
      "the ring-offset is a Record indexed by the `mode` prop, so the scanner resolves no plate string for the element. The outline joins that same record rather than the shared NEUTRAL_BTN, because `ignored` cards are surface-sunken and already clear.",
    neutralFaintCount: 1,
  },
  {
    file: "components/admin/wizard/archivedTabOffer.tsx",
    anchor: "className={cn(ARCHIVED_TAB_BTN",
    window: 2,
    plate: "warning-bg",
    carries: TINTED,
    invisibleBecause:
      "the file declares no ring-offset at all. The override is at the CALL SITES and not in `ARCHIVED_TAB_BTN`, and that is a correction: the colour was briefly moved into the constant on the reasoning that both card tones are tinted, which is true of this file's two sites and false of the constant — `components/admin/review/PublishedArchivedTabOffer.tsx` uses it at two more, both on `bg-surface-sunken`.",
    neutralFaintCount: 0,
  },
  {
    file: "components/admin/review/PublishedArchivedTabOffer.tsx",
    anchor: "className={cn(ARCHIVED_TAB_BTN",
    window: 2,
    plate: "warning-bg",
    carries: "border-text-faint",
    invisibleBecause:
      "registered for the OPPOSITE reason to every other row: it shares `ARCHIVED_TAB_BTN` with a tinted caller, so it is the file most likely to be swept onto the plate token by accident — as it briefly was. Its two sites stand on `bg-surface-sunken`, a neutral ground, and must keep the shared outline. `carries` therefore pins the NEUTRAL token here, which is the claim worth defending.",
    neutralFaintCount: 2,
  },
  {
    file: "app/admin/settings/roles/RoleMappingRow.tsx",
    anchor: 'data-testid="role-mapping-remove"',
    window: 6,
    plate: "warning-bg",
    carries: TINTED,
    invisibleBecause:
      "the file declares no ring-offset. The override is at THIS call site and not in `outlineBtn`, because the same constant paints the edit button on a neutral card.",
    neutralFaintCount: 1,
  },
  {
    file: "lib/ui/actionClass.ts",
    anchor: "export const SECONDARY_ACTION_ON_TINTED_CLASS",
    window: 3,
    plate: "info-bg",
    carries: TINTED,
    invisibleBecause:
      "`lib/` holds no markup, so no element exists here for the scanner to reach. This is the far end of the only chain in this registry.",
    neutralFaintCount: 1,
  },
  {
    file: "components/admin/RescanSheetButton.tsx",
    anchor: "onTintedPlate ?",
    window: 3,
    plate: "info-bg",
    carries: "SECONDARY_ACTION_ON_TINTED_CLASS",
    invisibleBecause:
      "the shared treatment lives in `lib/` and is neutral at every call site but one, so the plate is a prop rather than a class the scanner could read off this element. Pinned on the NEXT LINK rather than the token: this file selects a treatment, it does not name a colour.",
    neutralFaintCount: 0,
  },
  {
    file: "components/admin/wizard/step3ReviewSections.tsx",
    anchor: "pack-list-rescan-needed-",
    window: 14,
    plate: "info-bg",
    carries: "onTintedPlate",
    invisibleBecause:
      "the control is a <RescanSheetButton> child, so the plate lives on the enclosing div and the button's own class string never mentions it. This is the site that passes the plate, and it is pinned on the prop for the same reason the link above is pinned on the constant.",
    // 4 until 2026-08-26; the control-outline-cover sweep added five to this
    // file (the report textarea and the four painted children), all on neutral
    // grounds. Then on 2026-08-28 the diagram tile's chrome moved off its
    // <Image> and onto the anchor that forms the tile box, so one of those five
    // now sits on the CONTROL rather than on a painted child
    // (docs/superpowers/specs/2026-08-28-diagram-tile-chrome-consistency.md).
    // The pin does not move for it: the class string was relocated within this
    // one file, not added or removed, so the code count is unchanged. What DID
    // move is the raw/comment split: the ruling is explained in two new
    // comment lines inside the component itself.
    // Counted CODE-ONLY: the raw count is 13, four of them in comments.
    neutralFaintCount: 9,
  },
];

describe("tinted-plate sites the derived arm cannot see", () => {
  it.each(REGISTRY.map((r) => [`${r.file} @ ${r.anchor}`, r] as const))(
    "%s still carries the tinted outline",
    (_label, row) => {
      const src = readFileSync(join(ROOT, row.file), "utf8").split("\n");
      const at = src.findIndex((l) => l.includes(row.anchor));
      // The anchor moving is a different failure from the token going away, and
      // conflating them would let a rename read as a passing repair.
      premise(`the anchor ${row.anchor} is still in ${row.file}`, at + 1, 0);
      const window = src.slice(at, at + row.window).join("\n");
      expect(window).toContain(row.carries);
    },
  );

  it("gives every registry row a reason the derived arm cannot see it", () => {
    expect(REGISTRY.filter((r) => r.invisibleBecause.trim().length < 40)).toEqual([]);
  });
});

/**
 * The one control on a tinted plate the 2026-08-25 arc deliberately did NOT
 * move, and which moved on 2026-08-26 when its fence was spent.
 *
 * This case is INVERTED rather than deleted, which is the shape
 * `DESIGN.md:337-352` records for the ShareHub skin: same case, asserting the
 * new token, with the ratification and its date in the docstring. Deleting it
 * would lose the fact that the field was ever fenced, and the next reader would
 * have no way to tell a decision from an oversight in either direction.
 *
 * The fence was `BL-CONTROL-OUTLINE-BEYOND-ELEMENT-COVER` family A's open
 * question: is a text field's border a control outline at all? The user ruled
 * on 2026-08-26 that it is, against a rendered mockup carrying the measured
 * ratios, so the question the fence protected no longer exists. The field is a
 * control on a `warning-bg` plate and takes the plate token like every other.
 *
 * Its own `bg-bg` fill makes the INNER edge a pair nothing pinned before, so
 * that row landed in `DESIGN.md` §1.2 with an assertion in
 * `tests/styles/secondary-action-contrast.test.ts` in the same commit.
 */
describe("the text input inside the validation reset plate carries the plate token", () => {
  it("moved to the tinted outline when the 2026-08-26 ruling spent its fence", () => {
    const src = readFileSync(join(ROOT, "components/admin/MaintenanceResetButtons.tsx"), "utf8");
    const at = src.indexOf('data-testid="validation-reset-input"');
    premise("the validation reset input is still in the file", at + 1, 0);
    const window = src.slice(at, at + 900);
    expect(window).toContain(TINTED);
    expect(window).not.toContain("border-text-faint");
  });
});

/**
 * The two secondary-action treatments differ in EXACTLY the outline token.
 *
 * The registry above pins each link of the chain separately, which proves the
 * links exist and says nothing about whether the plate variant is still the
 * same button. A second constant that drifted in padding, weight or fill would
 * satisfy every row above while quietly shipping a sixth treatment into the
 * slot `lib/ui/actionClass.ts` exists to hold at one.
 */
describe("the tinted secondary action is the same button, one token apart", () => {
  it("differs from the neutral treatment in the outline token and nothing else", () => {
    const neutral = SECONDARY_ACTION_CLASS.split(/\s+/).filter(Boolean);
    const tinted = SECONDARY_ACTION_ON_TINTED_CLASS.split(/\s+/).filter(Boolean);
    premise("the treatments carry enough classes to compare", neutral.length, 5);
    expect(tinted.filter((c) => !neutral.includes(c))).toEqual([TINTED]);
    expect(neutral.filter((c) => !tinted.includes(c))).toEqual(["border-text-faint"]);
  });
});

/**
 * The fail-by-default half of the registry, and the reason it counts rather
 * than forbids.
 *
 * The anchored checks above prove each registered site still wears the plate
 * token. Nothing there notices a NEW control appearing in the same file. An
 * unregistered `border-text-faint` is not itself a defect — a neutral-ground
 * control living beside a plate control is correct, and `RoleMappingRow` is
 * exactly that shape. What IS worth failing on is the count moving, because the
 * author who added one is the only person who knows which ground it stands on.
 *
 * Recorded as a limit rather than sold as a cover: this is per-file, so a
 * fourteenth tinted-plate control in a file with no registry row is still
 * outside it. That is the ancestor-resolution gap in the header, unchanged.
 */
describe("a registered file's neutral-ground count is pinned", () => {
  it.each(REGISTRY.map((r) => [r.file, r] as const))(
    "%s keeps exactly its recorded number of neutral-ground outlines",
    (_label, row) => {
      const found = (
        stripCommentsForFile(readFileSync(join(ROOT, row.file), "utf8"), row.file).match(
          /border-text-faint/g,
        ) ?? []
      ).length;
      expect(
        found,
        `${row.file} now has ${found} \`border-text-faint\` occurrences, recorded ${row.neutralFaintCount}. ` +
          "If the new one stands on a tinted plate it needs the plate token; if it stands on a neutral " +
          "ground, raise neutralFaintCount. Only the author knows which.",
      ).toBe(row.neutralFaintCount);
    },
  );
});
