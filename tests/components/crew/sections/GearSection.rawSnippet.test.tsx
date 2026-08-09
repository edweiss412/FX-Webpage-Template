// @vitest-environment jsdom
/**
 * tests/components/crew/sections/GearSection.rawSnippet.test.tsx
 *
 * Closes the pack-list coverage residue identified by
 * `docs/superpowers/specs/ci/2026-08-09-resurrect-mobile-safari-e2e-design.md` §2.3.
 *
 * The deleted `tests/e2e/pack-list.spec.ts` was the only test that touched the
 * pack list's per-item raw-snippet line. Its phase gate, stage_restriction, cap
 * and wiring all keep live coverage (tests/visibility/packList.test.ts,
 * CardinalityCapBoundary.test.tsx, GearSection.test.tsx), but the
 * `item.rawSnippet ?` branch at `components/crew/sections/GearSection.tsx:418`
 * renders text that NO test in any crew-render context asserted — every other
 * `rawSnippet` reference in the suite is admin-side (per-show data-quality).
 *
 * Production line under test: the `item.rawSnippet ?` branch,
 * `components/crew/sections/GearSection.tsx:418-425`.
 */
import { expect, test } from "vitest";
import { render } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { premiseHolds } from "@/tests/_shared/premise";
import { ledgerProp } from "./_ledgerProp";

// 2026-05-14T15:00:00Z is 11:00 EDT on 2026-05-14, so the venue-timezone ISO
// date the pack-list gate resolves is "2026-05-14".
const TODAY = new Date("2026-05-14T15:00:00Z");
const TODAY_VENUE_ISO = "2026-05-14";
const SHOW_ID = "show-abc";

// The snippet is deliberately NOT a substring of any label the row also renders
// (label = `${qty} × ${item} (${cat} / ${subCat})`). If it were, a containment
// assertion would pass off the label alone and prove nothing about the branch.
const SNIPPET = "12 | Audio | Mics | Shure SM58 | TRUE";
const ITEM_WITH_SNIPPET = "Shure SM58";
const ITEM_WITHOUT_SNIPPET = "Sennheiser G4";

function renderGear() {
  const data = makeShowForViewer({
    // Gate TRUE via the predicate's own first conjunct: today's venue-tz date
    // maps to a PACK_LIST_VISIBLE_PHASES phase. Not faked by bypassing the gate.
    show: { schedule_phases: { [TODAY_VENUE_ISO]: ["Set"] } },
    pullSheet: [
      {
        caseLabel: "Case A",
        items: [
          { qty: 12, cat: "Audio", subCat: "Mics", item: ITEM_WITH_SNIPPET, rawSnippet: SNIPPET },
          { qty: 2, cat: "Audio", subCat: "Mics", item: ITEM_WITHOUT_SNIPPET },
        ],
      },
    ],
  });
  return render(
    <GearSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
}

/**
 * The ITEM `<li>` that renders `itemName` — scoped extraction, so a snippet
 * rendered by a SIBLING item can never satisfy an assertion about this one.
 *
 * The innermost-`<li>` filter is load-bearing, not defensive tidiness. The pack
 * list nests item rows inside a CASE row (`ol > li > details > ul > li`), so a
 * plain "first li whose text contains the item name" matches the OUTER case row,
 * which contains BOTH items' nodes — under which the negative assertion below
 * reads a sibling's snippet and the positive one passes without ever proving the
 * snippet sits in its own row. Observed, not hypothesized: the negative test
 * failed exactly this way before the filter was added.
 */
function rowFor(container: HTMLElement, itemName: string): HTMLElement {
  const row = [...container.querySelectorAll("li")]
    .filter((li) => li.querySelector("li") === null)
    .find((li) => li.textContent?.includes(itemName));
  if (!row) throw new Error(`no pack-list item row rendered for ${itemName}`);
  return row as HTMLElement;
}

test("a pack-list item with rawSnippet renders that snippet inside its OWN row", () => {
  const { container } = renderGear();

  // Premise: the pack list actually rendered. Without this, a gate-false fixture
  // renders no rows at all and every assertion below is vacuously satisfiable.
  premiseHolds(
    "the pack-list gate is open, so item rows exist to assert about",
    container.querySelector('[data-testid="gear-pack-list"]') !== null,
  );

  const row = rowFor(container, ITEM_WITH_SNIPPET);
  const snippet = row.querySelector('[data-testid="gear-pack-list-item-raw-snippet"]');
  expect(snippet, "the rawSnippet branch must render a snippet node in its own row").not.toBeNull();
  // Expected value is the fixture's own constant, never a literal retyped here.
  expect(snippet!.textContent).toBe(SNIPPET);
});

test("a pack-list item WITHOUT rawSnippet renders no snippet node", () => {
  const { container } = renderGear();

  premiseHolds(
    "the pack-list gate is open, so item rows exist to assert about",
    container.querySelector('[data-testid="gear-pack-list"]') !== null,
  );
  // Premise: the discriminating case is present. If only one ITEM row rendered,
  // the negative below would hold trivially and prove nothing about the branch.
  // Counted on item rows (innermost `<li>`), not on every `<li>` — the case row
  // is also an `<li>`, so a naive count reaches 2 with a single item.
  premiseHolds(
    "both a with-snippet and a without-snippet item row rendered",
    [...container.querySelectorAll("li")].filter((li) => li.querySelector("li") === null).length ===
      2,
  );

  const row = rowFor(container, ITEM_WITHOUT_SNIPPET);
  expect(
    row.querySelector('[data-testid="gear-pack-list-item-raw-snippet"]'),
    "an item with no rawSnippet must render no snippet node",
  ).toBeNull();

  // The branch discriminates BETWEEN rows, not merely once per render: exactly
  // one of the two rows carries a snippet node.
  expect(
    container.querySelectorAll('[data-testid="gear-pack-list-item-raw-snippet"]'),
  ).toHaveLength(1);
});
