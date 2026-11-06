// @vitest-environment jsdom
/**
 * components/crew/sections/PackListSection.tsx (crew page redesign PR C Task 6; spec
 * §6.2 `packlist` row, line 310; AC-9, AC-13).
 *
 * The Pack list section is the crew panel card titled with the registry label "Pack
 * list", card id `gear-pack-list`, around the shared case list
 * (components/show-panels/PackListBody.tsx) with the crew props: the 12-case cap and
 * its stub, no items cap, the raw snippets, numbered cases and search targets. Its own
 * wrapper is `crew:packlist:cases` (plan decision 5).
 *
 * Its gate is an entitlement, so the shell builds this section only for a viewer
 * `isPackListVisibleToday` lets through (tests/crew/crewSections.test.ts,
 * tests/components/crew/crewShellSections.test.tsx); the section itself has no gate.
 *
 * The raw snippet cases moved here from GearSection.rawSnippet.test.tsx, which closed
 * the coverage residue the deleted tests/e2e/pack-list.spec.ts left. Expected values
 * are read back from the fixture.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CASE_CAP, packList } from "@/components/crew/sections/packListRows";
import { PackListSection } from "@/components/crew/sections/PackListSection";
import * as packCaseItemsModule from "@/components/show-panels/PackCaseItems";
import * as packListBodyModule from "@/components/show-panels/PackListBody";
import { createTileRenderLedger, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import type { PullSheetCase } from "@/lib/parser/types";
import { buildSheetDeepLink, CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";
import { showSection } from "@/lib/showSections/registry";
import { premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const SHOW_ID = "show-pack";
const TODAY = new Date("2026-05-14T15:00:00Z");
const CREW: Viewer = { kind: "crew", crewMemberId: "c1" };
const PACK_LABEL = showSection("packlist").label;
const EMPTY_STATE = "No pack list on file yet.";

// The snippet is deliberately NOT a substring of any label the row also renders
// (label = `${qty} × ${item} (${cat} / ${subCat})`). If it were, a containment
// assertion would pass off the label alone and prove nothing about the branch.
const SNIPPET = "12 | Audio | Mics | Shure SM58 | TRUE";
const ITEM_WITH_SNIPPET = "Shure SM58";
const ITEM_WITHOUT_SNIPPET = "Sennheiser G4";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function withCases(
  pullSheet: unknown,
  overrides: Parameters<typeof makeShowForViewer>[0] = {},
): ShowForViewer {
  return makeShowForViewer({ pullSheet: pullSheet as PullSheetCase[] | null, ...overrides });
}

function renderPack(
  data: ShowForViewer,
  viewer: Viewer = CREW,
  ledger?: TileRenderLedger,
): HTMLElement {
  const { container } = render(
    <PackListSection
      {...(ledger === undefined ? ledgerProp() : { ledger })}
      data={data}
      viewer={viewer}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return container;
}

/** `count` cases, zero padded so "Road Case 01" is never a substring of "Road Case 10". */
function roadCases(count: number): PullSheetCase[] {
  return Array.from({ length: count }, (_, i) => ({
    caseLabel: `Road Case ${String(i + 1).padStart(2, "0")}`,
    items: [
      { qty: 1, cat: null, subCat: null, item: `Cable Loom ${String(i + 1).padStart(2, "0")}` },
    ],
  }));
}

const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[data-card-id="gear-pack-list"]');
const stub = (root: HTMLElement) =>
  root.querySelector('[data-testid="gear-pack-list-overflow-stub"]');
const caseRows = (root: HTMLElement) => [...panel(root)!.querySelectorAll(":scope > ol > li")];
const snippets = (root: HTMLElement) =>
  root.querySelectorAll('[data-testid="crew-panel-pack-item-raw-snippet"]');

/**
 * The ITEM `<li>` that renders `itemName`: scoped extraction, so a snippet rendered by
 * a SIBLING item can never satisfy an assertion about this one. The innermost-`<li>`
 * filter is load-bearing: item rows nest inside a case row (`ol > li > details > ul >
 * li`), so "the first li holding the name" is the OUTER case row, holding both items.
 */
function rowFor(container: HTMLElement, itemName: string): HTMLElement {
  const row = [...container.querySelectorAll("li")]
    .filter((li) => li.querySelector("li") === null)
    .find((li) => li.textContent?.includes(itemName));
  if (!row) throw new Error(`no pack-list item row rendered for ${itemName}`);
  return row as HTMLElement;
}

describe("pack list: the panel card", () => {
  test("pack list: the card keeps its id, the registry label and an h3 title", () => {
    const root = renderPack(withCases(roadCases(1)));
    const section = root.querySelector('[data-testid="section-packlist"]');
    expect(section).not.toBeNull();
    const card = panel(root);
    expect(card).not.toBeNull();
    expect(section!.contains(card)).toBe(true);
    expect(within(card!).getByRole("heading", { level: 3 })).toHaveTextContent(PACK_LABEL);
    expect(card!.getAttribute("data-testid")).toBe("crew-panel-card");
  });

  test("pack list: the card's source link goes to the pull sheet's region", () => {
    const data = withCases(roadCases(1), {
      driveFileId: "DRIVE123",
      sourceAnchors: { gear_packlist: { title: "PULL", gid: 7 } },
    });
    const slot = panel(renderPack(data))!.querySelector('[data-slot="section-card-action"]');
    const expected = buildSheetDeepLink(
      data.driveFileId,
      data.sourceAnchors[CARD_REGION_MAP["gear-pack-list"]],
    );
    expect(expected).not.toBeNull();
    expect(slot?.querySelector('a[data-slot="source-link"]')?.getAttribute("href")).toBe(expected);
  });

  test("pack list: a null card report leaves the source link and drops the report trigger", () => {
    const data = withCases(roadCases(1), {
      driveFileId: "DRIVE123",
      sourceAnchors: { gear_packlist: { title: "PULL", gid: 7 } },
    });
    const { container } = render(
      <PackListSection
        {...ledgerProp()}
        data={data}
        viewer={CREW}
        today={TODAY}
        showId={SHOW_ID}
        cardReport={null}
      />,
    );
    const slot = panel(container)!.querySelector('[data-slot="section-card-action"]');
    expect(slot?.querySelector('a[data-slot="source-link"]')).not.toBeNull();
    expect(slot?.querySelector('[data-slot="card-report-trigger"]')).toBeNull();
  });
});

describe("pack list: the empty state", () => {
  test.each([
    ["null", null],
    ["an empty list", []],
    ["a value that is not a list", { caseLabel: "not a list" }],
  ])("pack list: %s reads as no pack list, with no panel", (_name, pullSheet) => {
    const root = renderPack(withCases(pullSheet));
    expect(root.querySelector('[data-testid="section-empty"]')?.textContent).toBe(EMPTY_STATE);
    expect(panel(root)).toBeNull();
  });

  test("pack list: a case on file leaves no empty state, and an itemless case counts", () => {
    const root = renderPack(withCases([{ caseLabel: "Empty Case", items: [] }]));
    expect(root.querySelector('[data-testid="section-empty"]')).toBeNull();
    expect(panel(root)).toHaveTextContent("Empty Case");
  });
});

describe("pack list: the case cap and its stub", () => {
  test("pack list: the cap is twelve cases", () => {
    expect(CASE_CAP).toBe(12);
  });

  test(`pack list: ${CASE_CAP - 1} cases all show, with no stub`, () => {
    const root = renderPack(withCases(roadCases(CASE_CAP - 1)));
    expect(caseRows(root)).toHaveLength(CASE_CAP - 1);
    expect(stub(root)).toBeNull();
  });

  test(`pack list: exactly ${CASE_CAP} cases all show, with no stub and no "+0"`, () => {
    const root = renderPack(withCases(roadCases(CASE_CAP)));
    expect(caseRows(root)).toHaveLength(CASE_CAP);
    expect(stub(root)).toBeNull();
    expect(root.textContent ?? "").not.toContain("+0");
  });

  test(`pack list: ${CASE_CAP + 1} cases show ${CASE_CAP} and a stub for one more case, in the singular`, () => {
    const root = renderPack(withCases(roadCases(CASE_CAP + 1)));
    expect(caseRows(root)).toHaveLength(CASE_CAP);
    expect(stub(root)?.textContent).toBe("+1 more case on the source pull sheet");
    expect(stub(root)!.getAttribute("data-tile-show-more")).toBe("true");
    expect(stub(root)!.hasAttribute("data-search-skip")).toBe(true);
    const text = root.textContent ?? "";
    expect(text).toContain(`Road Case ${String(CASE_CAP).padStart(2, "0")}`);
    expect(text).not.toContain(`Road Case ${String(CASE_CAP + 1).padStart(2, "0")}`);
  });

  test(`pack list: ${CASE_CAP + 2} cases read "more cases", the stub inside the panel card`, () => {
    const root = renderPack(withCases(roadCases(CASE_CAP + 2)));
    expect(stub(root)?.textContent).toBe("+2 more cases on the source pull sheet");
    expect(panel(root)!.contains(stub(root))).toBe(true);
  });
});

describe("pack list: the items", () => {
  test("pack list: every item shows, past the admin's cap, with no toggle and no client leaf", () => {
    const leaf = vi.spyOn(packCaseItemsModule, "PackCaseItems");
    const count = 40;
    const items = Array.from({ length: count }, (_, i) => ({
      qty: 1,
      cat: null,
      subCat: null,
      item: `Loom ${String(i + 1).padStart(2, "0")}`,
    }));
    const root = renderPack(withCases([{ caseLabel: "Fat Case", items }]));
    const rows = [...panel(root)!.querySelectorAll("details ul > li")];
    expect(rows).toHaveLength(count);
    expect(rows.at(-1)).toHaveTextContent(items.at(-1)!.item);
    expect(root.querySelector("details button")).toBeNull();
    expect(root.textContent ?? "").not.toMatch(/Show all/);
    expect(leaf).not.toHaveBeenCalled();
  });

  test("pack list: a blank case label reads as its invented Case N, in the sheet's place", () => {
    const root = renderPack(
      withCases([
        { caseLabel: "Named", items: [] },
        { caseLabel: "", items: [{ qty: 1, cat: null, subCat: null, item: "Spare" }] },
      ]),
    );
    expect(caseRows(root)[1]).toHaveTextContent("Case 2");
  });

  test("pack list: a null quantity and a sentinel category leave the item's bare name", () => {
    const root = renderPack(
      withCases([
        { caseLabel: "C", items: [{ qty: null, cat: "TBD", subCat: null, item: "Spare loom" }] },
      ]),
    );
    const row = rowFor(root, "Spare loom");
    expect(row.textContent).toBe("Spare loom");
  });

  test("pack list: the item label is the shared one, the admin's", () => {
    const item = { qty: 4, cat: "Audio", subCat: "Wireless", item: "Shure ULXD4 receiver" };
    const root = renderPack(withCases([{ caseLabel: "C", items: [item] }]));
    expect(rowFor(root, item.item).textContent).toBe(packListBodyModule.packItemLabel(item));
    expect(rowFor(root, item.item).textContent).toBe("4 × Shure ULXD4 receiver (Audio / Wireless)");
  });
});

describe("pack list: the raw snippet", () => {
  const data = () =>
    withCases([
      {
        caseLabel: "Case A",
        items: [
          { qty: 12, cat: "Audio", subCat: "Mics", item: ITEM_WITH_SNIPPET, rawSnippet: SNIPPET },
          { qty: 2, cat: "Audio", subCat: "Mics", item: ITEM_WITHOUT_SNIPPET },
        ],
      },
    ]);

  test("pack list: an item with a raw snippet renders it inside its OWN row", () => {
    const root = renderPack(data());
    premiseHolds("item rows exist to assert about", panel(root) !== null);
    const snippet = rowFor(root, ITEM_WITH_SNIPPET).querySelector(
      '[data-testid="crew-panel-pack-item-raw-snippet"]',
    );
    expect(snippet, "the rawSnippet branch must render in its own row").not.toBeNull();
    expect(snippet!.textContent).toBe(SNIPPET);
  });

  test("pack list: an item with no raw snippet renders no snippet node", () => {
    const root = renderPack(data());
    // Counted on item rows (innermost `<li>`): the case row is also an `<li>`.
    premiseHolds(
      "both a with-snippet and a without-snippet item row rendered",
      [...root.querySelectorAll("li")].filter((li) => li.querySelector("li") === null).length === 2,
    );
    expect(
      rowFor(root, ITEM_WITHOUT_SNIPPET).querySelector(
        '[data-testid="crew-panel-pack-item-raw-snippet"]',
      ),
    ).toBeNull();
    // The branch discriminates BETWEEN rows, not merely once per render.
    expect(snippets(root)).toHaveLength(1);
  });
});

describe("pack list: the numbered summary", () => {
  test("pack list: the cases are an ordered list, each summary carrying its place", () => {
    const root = renderPack(withCases(roadCases(3)));
    const card = panel(root)!;
    expect(card.querySelector(":scope > ol")).not.toBeNull();
    expect(card.querySelector(":scope > ul")).toBeNull();
    const indexes = [...card.querySelectorAll("summary > [aria-hidden='true'].tabular-nums")];
    expect(indexes.map((el) => el.textContent)).toEqual(["1.", "2.", "3."]);
  });

  test("pack list: the index is chrome, skipped by search and hidden from a reader", () => {
    const root = renderPack(withCases(roadCases(1)));
    const index = panel(root)!.querySelector("summary > .tabular-nums");
    expect(index?.getAttribute("aria-hidden")).toBe("true");
    expect(index?.hasAttribute("data-search-skip")).toBe(true);
  });

  test("pack list: a summary carries the count in its pill, in the singular and the plural", () => {
    const root = renderPack(
      withCases([
        { caseLabel: "One", items: [{ qty: 1, cat: null, subCat: null, item: "A" }] },
        {
          caseLabel: "Two",
          items: [
            { qty: 1, cat: null, subCat: null, item: "B" },
            { qty: 1, cat: null, subCat: null, item: "C" },
          ],
        },
      ]),
    );
    const [one, two] = caseRows(root);
    expect(one!.querySelector("summary")).toHaveTextContent("1 item");
    expect(two!.querySelector("summary")).toHaveTextContent("2 items");
  });

  test("pack list: every case is its own disclosure, closed on arrival", () => {
    const root = renderPack(withCases(roadCases(2)));
    const details = [...root.querySelectorAll("details")];
    expect(details).toHaveLength(2);
    expect(details.every((d) => !d.open)).toBe(true);
    expect(details[1]!.getAttribute("data-testid")).toBe("crew-panel-pack-case-1");
  });
});

describe("pack list: search targets", () => {
  test("pack list: each line the model indexes is a target on the page, in its order", () => {
    const data = withCases([
      {
        caseLabel: "Case A",
        items: [{ qty: 1, cat: null, subCat: null, item: "Loom", rawSnippet: SNIPPET }],
      },
    ]);
    const root = renderPack(data);
    const targets = [...root.querySelectorAll("[data-search-target]")].map((el) =>
      el.getAttribute("data-search-target"),
    );
    expect(targets).toEqual(packList(data).entries.map((e) => e.id));
    premiseHolds("the model indexes the case and its item", targets.length === 2);
  });

  test("pack list: a summary with an invented label is skipped, and its items are still lines", () => {
    const data = withCases([
      { caseLabel: "", items: [{ qty: 1, cat: null, subCat: null, item: "Loom" }] },
    ]);
    const root = renderPack(data);
    expect(root.querySelector("summary")?.hasAttribute("data-search-skip")).toBe(true);
    expect(root.querySelector("summary")?.hasAttribute("data-search-target")).toBe(false);
    expect(root.querySelector("details ul > li")?.hasAttribute("data-search-target")).toBe(true);
  });
});

describe("pack list: containment", () => {
  test("pack list: a throw from the body is contained and recorded under crew:packlist:cases", () => {
    vi.spyOn(packListBodyModule, "PackListBody").mockImplementation(() => {
      throw new Error("planted body fault");
    });
    const ledger = createTileRenderLedger();
    const root = renderPack(withCases(roadCases(1)), CREW, ledger);
    expect(within(root).getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(root.querySelector('[data-testid="section-packlist"]')).not.toBeNull();
    expect(ledger.failed.get("crew:packlist:cases")?.message).toBe("planted body fault");
  });

  test("pack list: a clean render records the tile as attempted and not failed", () => {
    const ledger = createTileRenderLedger();
    renderPack(withCases(roadCases(1)), CREW, ledger);
    expect(ledger.attempted.has("crew:packlist:cases")).toBe(true);
    expect(ledger.failed.has("crew:packlist:cases")).toBe(false);
  });

  test("pack list: a malformed projection reaches the route, outside the wrapper", () => {
    const data = withCases(roadCases(1), { crewMembers: [] });
    expect(() => renderPack(data, { kind: "crew", crewMemberId: "ghost" })).toThrow();
  });
});
