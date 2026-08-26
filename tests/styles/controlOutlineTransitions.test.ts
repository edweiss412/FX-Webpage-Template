/**
 * The Transition Inventory of spec §15, asserted at its source.
 *
 * Spec: docs/superpowers/specs/2026-08-26-control-outline-cover-widening-design.md
 * §15, AC-13.
 *
 * WHAT IT RANGES OVER. All THREE of §15's tables, not the swapped elements
 * alone: the two REGISTERED switch tracks and the deliberately-instant rows are
 * in the inventory, so a suite that walked only the swaps could pass while
 * covering neither.
 *
 * WHY IT IS A SOURCE SCAN. Every row here is a claim about what a class string
 * declares, and a rendered assertion would measure a tween's presence rather
 * than the declaration §15 records. The colour ENDPOINTS the tween runs between
 * are pinned elsewhere: the swap itself by the residue census, the ratios by
 * `secondary-action-contrast`.
 *
 * ITS OWN CHECK. Two plant kinds, because the inventory has two kinds of row.
 * A row naming a transition is planted by REMOVING the token; a row declared
 * instant has nothing to remove, so it is planted by ADDING one. Both were run
 * and both fire; the commit records them.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premise } from "../_shared/premise";
import { allStrings, scanInteractiveElements } from "./interactiveScanCore";
import { stripCommentsForFile } from "../_shared/stripComments";

const ROOT = process.cwd();
const TOKEN = "transition-colors";

function code(file: string): string {
  return stripCommentsForFile(readFileSync(join(ROOT, file), "utf8"), file);
}

/** Every string literal in a window, which is where a class list lives. */
function armsIn(src: string, anchor: string, window: number, marker: string): string[] {
  const at = src.indexOf(anchor);
  premise(`the anchor ${anchor.slice(0, 40)} is still present`, at + 1, 0);
  const slice = src.slice(at, at + window);
  // Double-quoted AND backtick-template class lists: `AutoRefreshControl`'s
  // track is a template literal, and a matcher that saw only `"..."` reported
  // zero arms for it, which the premise below turns into a loud failure rather
  // than a silent pass.
  return [...slice.matchAll(/"([^"]*)"|`([^`]*)`/g)]
    .map((m) => m[1] ?? m[2] ?? "")
    .filter((str) => str.includes(marker));
}

/** §15 tables 1 and 2: rows whose outline colour is TWEENED. */
const TWEENED: ReadonlyArray<{
  readonly label: string;
  readonly file: string;
  readonly anchor: string;
  readonly window: number;
  readonly marker: string;
}> = [
  {
    label: "ShowRowActions trigger visual, closed <-> open",
    file: "components/admin/ShowRowActions.tsx",
    anchor: "data-testid={`row-actions-trigger-${slug}`}",
    window: 900,
    marker: "place-items-center",
  },
  {
    label: "CrewRowActions trigger visual, closed <-> open",
    file: "components/admin/wizard/CrewRowActions.tsx",
    anchor: "data-testid={`crew-row-menu-button-${crewId}`}",
    window: 700,
    marker: "place-items-center",
  },
  {
    label: "AutoRefreshControl switch track, OFF <-> ON (registered, not swapped)",
    file: "components/admin/telemetry/AutoRefreshControl.tsx",
    anchor: 'data-testid="autorefresh-toggle"',
    window: 700,
    marker: "rounded-full border",
  },
  {
    label: "DeveloperToggleButton switch track, OFF <-> ON (registered, not swapped)",
    file: "components/admin/settings/DeveloperToggleButton.tsx",
    anchor: "const TRACK_BASE",
    window: 200,
    marker: "rounded-full border",
  },
  {
    label: "OnboardingWizard step pill, all six state pairs of its four states",
    file: "components/admin/OnboardingWizard.tsx",
    anchor: "const base = cn(",
    window: 300,
    marker: "rounded-pill border",
  },
];

/** §15 table 3: rows declared deliberately INSTANT. */
const INSTANT: ReadonlyArray<{
  readonly label: string;
  readonly file: string;
  readonly anchor: string;
  readonly window: number;
  readonly marker: string;
}> = [
  {
    label: "SwitcherControls select, rest <-> hover",
    file: "components/admin/dev/SwitcherControls.tsx",
    anchor: 'data-testid="attention-switcher-group-select"',
    window: 500,
    marker: "max-w-28",
  },
  {
    label: "VenueMapTile Directions visual, single-state",
    file: "components/admin/wizard/VenueMapTile.tsx",
    anchor: 'data-testid="venue-directions"',
    window: 400,
    marker: "inline-flex",
  },
  {
    label: "ReSyncButton mobile skin, single-state",
    file: "components/admin/ReSyncButton.tsx",
    anchor: 'data-testid="admin-resync-mobile-label"',
    window: 300,
    marker: "max-sm:inline-flex",
  },
  {
    label: "CronRunSummaryCard root, single-state",
    file: "components/admin/telemetry/CronRunSummaryCard.tsx",
    // Anchored on the function, NOT on the class string: anchoring inside a
    // string literal starts the slice mid-token and the arm matcher then finds
    // no complete literal at all.
    anchor: "export function CronRunSummaryCard",
    window: 900,
    marker: "rounded-md border",
  },
];

describe("§15 transition inventory: the tweened rows", () => {
  it.each(TWEENED.map((r) => [r.label, r] as const))("%s keeps its tween", (_label, row) => {
    const arms = armsIn(code(row.file), row.anchor, row.window, row.marker);
    premise(`${row.label}: the window holds at least one arm`, arms.length, 0);
    expect(
      arms.filter((a) => !a.includes(TOKEN)),
      `${row.label}: EVERY arm carrying ${row.marker} keeps ${TOKEN}`,
    ).toEqual([]);
  });
});

describe("§15 transition inventory: the deliberately instant rows", () => {
  it.each(INSTANT.map((r) => [r.label, r] as const))("%s stays instant", (_label, row) => {
    const arms = armsIn(code(row.file), row.anchor, row.window, row.marker);
    premise(`${row.label}: the window holds at least one arm`, arms.length, 0);
    expect(
      arms.filter((a) => a.includes(TOKEN)),
      `${row.label}: no arm gains ${TOKEN}; §15 declares this one instant`,
    ).toEqual([]);
  });
});

/**
 * §15 table 3, row 1: "every Family A field ... the focus cue is a
 * `focus-visible:ring-*`, not a border tween".
 *
 * DERIVED, not enumerated. The hand-written INSTANT list above names the rows
 * §15 names individually; Family A is a CLASS — every text-entry control the
 * widened cover admits — and a list of twelve would go stale the day someone
 * adds a thirteenth field, which is exactly the drift this arc exists to close.
 * So the population comes from the scanner, on the same axes the outline guards
 * read, and a new field is covered on arrival rather than on someone noticing.
 *
 * Round 1 of the whole-diff review found this half missing: the suite covered
 * four rows of an inventory the plan says it asserts over whole.
 */
describe("§15 table 3: every Family A field stays instant (derived)", () => {
  // Family A is defined by DIFFERENCE, not by a tag list. The `textEntry` axis
  // is the thing that admits these controls, so the population is exactly what
  // the axis adds: scan with it on, scan with it off, keep what only the first
  // saw. A tag list here would be a second copy of `isInScope`'s predicate and
  // would go stale the moment that one widens; this cannot.
  const key = (el: { file: string; line: number; tag: string }) =>
    `${el.file}:${el.line}:${el.tag}`;
  const withAxis = scanInteractiveElements(ROOT, { textEntry: true, paintedChildren: true });
  const withoutAxis = new Set(
    scanInteractiveElements(ROOT, { paintedChildren: true }).map((el) => key(el)),
  );
  // A field with NO readable className declares no tween and is not what §15
  // means by a Family A field — every row it names has a recipe. Restricting to
  // the ones that resolved keeps each assertion about something, and the
  // premises below are what stop that restriction from quietly emptying the set.
  const fields = withAxis
    .filter((el) => !withoutAxis.has(key(el)))
    .filter((el) => allStrings(el).length > 0);

  it("the derivation finds the Family A population, including the fields §15 names", () => {
    // Two premises, because a derived cover has two ways to go vacuous: the
    // difference could be empty, and the readable-string filter could empty it.
    premise("the textEntry axis admits controls the default scan does not", fields.length, 11);
    // And it reaches the specific fields §15's third table is about. Named
    // rather than counted: a count stays green while the set drifts to some
    // other twelve elements.
    const seen = new Set(fields.map((el) => el.file));
    for (const file of [
      "app/admin/settings/admins/AddAdminForm.tsx",
      "components/admin/BellPanel.tsx",
      "components/admin/telemetry/EventFilters.tsx",
      "components/shared/ReportModal.tsx",
    ]) {
      expect(seen, `${file} carries a Family A field the derivation must see`).toContain(file);
    }
  });

  it.each(fields.map((el) => [`${el.file}:${el.line} <${el.tag}>`, el] as const))(
    "%s rests and focuses without a border tween",
    (_label, el) => {
      const strings = allStrings(el);
      premise(
        `${el.file}:${el.line}: the element resolved to at least one class string`,
        strings.length,
        0,
      );
      expect(
        strings.filter((str) => str.includes(TOKEN)),
        `${el.file}:${el.line}: §15 says Family A's focus cue is a ring, not a ${TOKEN} tween`,
      ).toEqual([]);
    },
  );
});

/**
 * §15 table 3, last row: "the four `step3ReviewSections` visuals ... single-state;
 * no state pair exists; instant by construction".
 *
 * DERIVED for the same reason as Family A, and scoped the same way §15's own row
 * is: by FILE. The four were originally cited by line, and every one of those
 * line numbers had already drifted by the time this was written — three merges
 * from main moved them. A file-scoped derivation says the same thing and cannot
 * go stale.
 *
 * NOT a blanket claim about painted children: the row-actions trigger visual is
 * a painted child too, and it is TWEENED (table 1). The scope is what makes this
 * true, so it is stated as a scope rather than as a property of the admission.
 */
describe("§15 table 3: the step-3 single-state visuals stay instant (derived)", () => {
  const SWEPT = /border-(text-faint|control-outline-tinted)/;
  const visuals = scanInteractiveElements(ROOT, { textEntry: true, paintedChildren: true }).filter(
    (el) =>
      el.file === "components/admin/wizard/step3ReviewSections.tsx" &&
      el.admittedAs === "painted-child" &&
      allStrings(el).some((str) => SWEPT.test(str)),
  );

  it("the derivation finds the four visuals §15 names", () => {
    // Exactly four, and the count IS the claim here: §15 says "the four", so a
    // fifth appearing is a change to the inventory rather than a passing test.
    expect(visuals.map((el) => `${el.line} <${el.tag}>`)).toHaveLength(4);
  });

  it.each(visuals.map((el) => [`${el.file}:${el.line} <${el.tag}>`, el] as const))(
    "%s is single-state, so it carries no tween",
    (_label, el) => {
      expect(
        allStrings(el).filter((str) => str.includes(TOKEN)),
        `${el.file}:${el.line}: §15 declares this visual single-state and instant`,
      ).toEqual([]);
    },
  );
});

describe("§15 compound cases", () => {
  it("both menu triggers select their two states on ONE element, as a ternary", () => {
    // §15's first compound case says the tween can be interrupted by a
    // re-render that swaps the whole class string, and that is true precisely
    // because the two states are ARMS of one expression on one element. Two
    // arms, both carrying the visual's marker, is what expresses that.
    for (const file of [
      "components/admin/ShowRowActions.tsx",
      "components/admin/wizard/CrewRowActions.tsx",
    ]) {
      const anchor = file.endsWith("ShowRowActions.tsx")
        ? "data-testid={`row-actions-trigger-${slug}`}"
        : "data-testid={`crew-row-menu-button-${crewId}`}";
      const arms = armsIn(code(file), anchor, 900, "place-items-center");
      expect(arms.length, `${file}: two arms select the two states`).toBe(2);
      expect(
        arms.filter((a) => !a.includes(TOKEN)),
        `${file}: both arms carry the tween, so either direction animates`,
      ).toEqual([]);
    }
  });

  it("the wizard pill's four states are one ternary chain on one element", () => {
    // §15's second compound case: pillState can change while a previous
    // transition-colors is still running, which holds only while all four
    // states are selected on ONE element. Asserted by the four arms being
    // present in one chain, not by counting punctuation.
    const src = code("components/admin/OnboardingWizard.tsx");
    const at = src.indexOf("const pillState = ");
    premise("pillState is still the selector", at + 1, 0);
    const chain = src.slice(at, at + 700);
    for (const arm of [
      "border-accent-edge bg-accent",
      "border-text-faint bg-surface",
      "border-transparent bg-surface-sunken text-text-subtle",
      "border-transparent bg-surface-sunken text-text-faint",
    ]) {
      expect(chain, `pillState selects the ${arm} state`).toContain(arm);
    }
    // And the element that WEARS pillState is the one carrying the tween.
    expect(src).toContain("cn(base, pillState)");
    const base = armsIn(src, "const base = cn(", 300, "rounded-pill border");
    expect(base.filter((a) => !a.includes(TOKEN))).toEqual([]);
  });
});
