// @vitest-environment jsdom
/**
 * tests/components/show-panels/packListBody.test.tsx
 * (crew page redesign PR C plan, Task 4; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `packlist` row, line 310)
 *
 * The Pack list body is the case list of the admin's `PackListBreakdown`, shared.
 * The admin rendering is pinned byte for byte by the goldens
 * (tests/components/admin/wizard/adminSectionDom.test.tsx) and asserted nowhere
 * else: every case here is about the body and its props, each rendered off and on
 * over a fixture that carries the field.
 *
 * The body is rendered by CALLING it, the way the crew page will (spec line 291).
 * The leaf is wrapped so one case can make it throw; it renders as itself otherwise.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  arr as adminArr,
  packItemLabel as adminPackItemLabel,
} from "@/components/admin/wizard/step3ReviewSections";
import {
  PackListBody,
  packItemLabel,
  type PackCaseTargets,
  type PackListBodyProps,
} from "@/components/show-panels/PackListBody";
import type { PackCaseItems as RealPackCaseItems } from "@/components/show-panels/PackCaseItems";
import { arr } from "@/components/show-panels/fieldRows";
import type { PullSheetCase, PullSheetItem } from "@/lib/parser/types";
import type { SearchEntry } from "@/lib/search/types";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { assertParity } from "@/tests/search/_parity";

const leaf = vi.hoisted(() => ({ throws: false, mounts: 0 }));

vi.mock("@/components/show-panels/PackCaseItems", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/show-panels/PackCaseItems")>();
  return {
    PackCaseItems: (props: ComponentProps<typeof RealPackCaseItems>) => {
      leaf.mounts += 1;
      if (leaf.throws) throw new Error("leaf render fault");
      return <real.PackCaseItems {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  leaf.throws = false;
  leaf.mounts = 0;
});

const PREFIX = "probe";

const item = (over: Partial<PullSheetItem> = {}): PullSheetItem => ({
  qty: 4,
  cat: "Audio",
  subCat: "Wireless",
  item: "Shure ULXD4",
  ...over,
});

/** A case of `count` items, each name unique so a row can be told from its neighbors. */
const packCase = (caseLabel: string, count = 2): PullSheetCase => ({
  caseLabel,
  items: Array.from({ length: count }, (_, j) => item({ item: `${caseLabel} item ${j + 1}` })),
});

const body = (props: Partial<PackListBodyProps> = {}): HTMLElement =>
  render(
    PackListBody({
      cases: [packCase("Rack A")],
      cap: 12,
      itemsCap: 8,
      testIdPrefix: PREFIX,
      ...props,
    }),
  ).container;

const list = (root: HTMLElement) => root.firstElementChild as HTMLElement;

const caseRows = (root: HTMLElement) => [
  ...list(root).querySelectorAll<HTMLElement>(":scope > li"),
];

const details = (root: HTMLElement, i = 0) => within(root).getByTestId(`${PREFIX}-pack-case-${i}`);

const summary = (root: HTMLElement, i = 0) =>
  details(root, i).querySelector("summary") as HTMLElement;

const itemList = (root: HTMLElement, i = 0) => details(root, i).querySelector("ul") as HTMLElement;

const itemRows = (root: HTMLElement, i = 0) => [
  ...itemList(root, i).querySelectorAll<HTMLElement>(":scope > li"),
];

const toggle = (root: HTMLElement) => within(root).queryByRole("button", { hidden: true });

/** The `numbered` index of each case; the chevron's spacer shares its aria-hidden, not its class. */
const indexes = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLElement>("span[aria-hidden='true'].tabular-nums"),
];

describe("the moved names", () => {
  test("the admin's packItemLabel and arr are the shared ones", () => {
    expect(adminPackItemLabel).toBe(packItemLabel);
    expect(adminArr).toBe(arr);
  });

  test.each<[string, Partial<PullSheetItem>, string]>([
    ["every part", {}, "4 × Shure ULXD4 (Audio / Wireless)"],
    ["a zero quantity, which is a quantity", { qty: 0 }, "0 × Shure ULXD4 (Audio / Wireless)"],
    ["a null quantity", { qty: null }, "Shure ULXD4 (Audio / Wireless)"],
    [
      "a quantity missing on the wire",
      { qty: undefined as unknown as null },
      "Shure ULXD4 (Audio / Wireless)",
    ],
    ["a sentinel category", { cat: "TBD" }, "4 × Shure ULXD4 (Wireless)"],
    ["a sentinel subcategory", { subCat: "N/A" }, "4 × Shure ULXD4 (Audio)"],
    ["no taxonomy", { cat: null, subCat: null }, "4 × Shure ULXD4"],
    ["a blank name", { item: "   " }, "4 × (unnamed item) (Audio / Wireless)"],
    [
      "a name missing on the wire",
      { item: undefined as unknown as string },
      "4 × (unnamed item) (Audio / Wireless)",
    ],
    ["a sentinel name, shown as parsed", { item: "TBD" }, "4 × TBD (Audio / Wireless)"],
  ])("packItemLabel with %s", (_title, over, expected) => {
    expect(packItemLabel(item(over))).toBe(expected);
  });

  test("arr keeps an array and reads anything else as none", () => {
    const value = [1, 2];
    expect(arr(value)).toBe(value);
    expect(arr(null)).toEqual([]);
    expect(arr(undefined)).toEqual([]);
    expect(arr("not a list" as unknown as string[])).toEqual([]);
  });
});

describe("cases and the cap", () => {
  const FIVE = ["Rack A", "Rack B", "Rack C", "Rack D", "Rack E"].map((l) => packCase(l));
  const NOTE = "and more cases";
  const overflow = <p data-testid="probe-overflow">{NOTE}</p>;

  test.each([2, 3])("a cap of %i shows that many cases, with overflow following", (cap) => {
    premise("cases past the cap", FIVE.length, cap);
    const root = body({ cases: FIVE, cap, overflow });
    expect(caseRows(root)).toHaveLength(cap);
    expect(root).toHaveTextContent(FIVE[cap - 1]?.caseLabel as string);
    expect(root).not.toHaveTextContent(FIVE[cap]?.caseLabel as string);
    expect(list(root).nextElementSibling).toBe(within(root).getByTestId("probe-overflow"));
  });

  test.each([5, 6])("a cap of %i cuts nothing, so overflow does not render", (cap) => {
    const root = body({ cases: FIVE, cap, overflow });
    expect(caseRows(root)).toHaveLength(FIVE.length);
    expect(root).not.toHaveTextContent(NOTE);
  });

  test("a cut list with no overflow given ends at the list", () => {
    const root = body({ cases: FIVE, cap: 2 });
    expect(list(root).nextElementSibling).toBeNull();
  });
});

describe("a case", () => {
  test("is a closed disclosure: chevron, label and count pill in its summary", () => {
    const root = body();
    const open = details(root);
    expect(open.tagName).toBe("DETAILS");
    expect(open).not.toHaveAttribute("open");
    const [chevron, label, pill] = [...summary(root).children] as HTMLElement[];
    expect(chevron?.tagName.toLowerCase()).toBe("svg");
    expect(chevron).toHaveAttribute("aria-hidden", "true");
    expect(label).toHaveTextContent("Rack A");
    expect(pill).toHaveTextContent("2 items");
  });

  test("takes its test id from the prefix and its place in the list", () => {
    const root = body({ cases: [packCase("Rack A"), packCase("Rack B")] });
    expect(details(root, 1)).toHaveTextContent("Rack B");
  });

  test("uses the sheet's label, else its place in the list", () => {
    const root = body({ cases: [packCase("Rack A"), packCase("")] });
    expect(summary(root, 1).children[1]?.textContent).toBe("Case 2");
    expect(summary(root, 0).children[1]?.textContent).toBe("Rack A");
  });

  test.each([
    [1, "1 item"],
    [2, "2 items"],
  ])("with %i parsed reads %s", (count, text) => {
    const root = body({ cases: [packCase("Rack A", count)] });
    expect(summary(root)).toHaveTextContent(text);
    expect(summary(root).querySelector(".tabular-nums")).toHaveTextContent(String(count));
  });

  describe("with no items", () => {
    test("is a plain line: no disclosure, its label and a zero count", () => {
      const root = body({ cases: [packCase("Spares", 0)] });
      const [row] = caseRows(root);
      expect(root.querySelector("details")).toBeNull();
      expect(row).toHaveTextContent("Spares");
      expect(row).toHaveTextContent("0 items");
    });

    test("keeps the chevron's column as a spacer, so its label stays in line", () => {
      const root = body({ cases: [packCase("Spares", 0)] });
      const [spacer, label] = [...(caseRows(root)[0] as HTMLElement).children] as HTMLElement[];
      expect(spacer).toHaveAttribute("aria-hidden", "true");
      expect(spacer).toHaveClass("size-4");
      expect(spacer).toBeEmptyDOMElement();
      expect(label).toHaveTextContent("Spares");
    });

    test("with a blank label too, reads its place in the list", () => {
      const root = body({ cases: [packCase("Rack A"), packCase("", 0)] });
      expect(caseRows(root)[1]?.children[1]?.textContent).toBe("Case 2");
    });

    test("a case whose items are not a list reads as having none", () => {
      const thin = { caseLabel: "Spares", items: null } as unknown as PullSheetCase;
      const root = body({ cases: [thin] });
      expect(root.querySelector("details")).toBeNull();
      expect(caseRows(root)[0]).toHaveTextContent("0 items");
    });
  });
});

describe("itemsCap", () => {
  const FIVE_ITEMS = packCase("Rack A", 5);

  test.each([2, 4])("%i shows that many items and the toggle names them all", (itemsCap) => {
    premise("items past the cap", FIVE_ITEMS.items.length, itemsCap);
    const root = body({ cases: [FIVE_ITEMS], itemsCap });
    const rows = itemRows(root);
    expect(rows).toHaveLength(itemsCap + 1);
    expect(rows[itemsCap - 1]).toHaveTextContent(`Rack A item ${itemsCap}`);
    expect(root).not.toHaveTextContent(`Rack A item ${itemsCap + 1}`);
    expect(rows[itemsCap]).toContainElement(toggle(root));
    expect(toggle(root)?.textContent).toBe("Show all 5 items");
    expect(toggle(root)).toHaveAttribute("aria-expanded", "false");
    expect(toggle(root)).toHaveAttribute("type", "button");
  });

  test("the toggle shows every item, then folds them back", () => {
    const root = body({ cases: [FIVE_ITEMS], itemsCap: 2 });
    fireEvent.click(toggle(root) as HTMLElement);
    expect(itemRows(root)).toHaveLength(6);
    expect(root).toHaveTextContent("Rack A item 5");
    expect(toggle(root)?.textContent).toBe("Show fewer items");
    expect(toggle(root)).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle(root) as HTMLElement);
    expect(itemRows(root)).toHaveLength(3);
    expect(toggle(root)?.textContent).toBe("Show all 5 items");
  });

  test("a case at the cap has no toggle", () => {
    const root = body({ cases: [FIVE_ITEMS], itemsCap: 5 });
    expect(itemRows(root)).toHaveLength(5);
    expect(toggle(root)).toBeNull();
  });

  test("each case folds on its own", () => {
    const root = body({ cases: [FIVE_ITEMS, packCase("Rack B", 5)], itemsCap: 2 });
    fireEvent.click(within(details(root, 0)).getByRole("button", { hidden: true }));
    expect(itemRows(root, 0)).toHaveLength(6);
    expect(itemRows(root, 1)).toHaveLength(3);
  });

  test("null shows every item in a plain list and mounts no leaf", () => {
    const root = body({ cases: [FIVE_ITEMS], itemsCap: null });
    expect(itemRows(root)).toHaveLength(5);
    expect(root).toHaveTextContent("Rack A item 5");
    expect(toggle(root)).toBeNull();
    expect(leaf.mounts).toBe(0);
  });

  test("a number mounts the leaf, the premise of the case above", () => {
    body({ cases: [FIVE_ITEMS], itemsCap: 5 });
    expect(leaf.mounts).toBe(1);
  });
});

describe("containment (spec line 507)", () => {
  test("a throwing leaf cannot reach the crew's list: null renders, a number throws", () => {
    const cases = [packCase("Rack A")];
    premise("items the leaf would render", cases[0]?.items.length ?? 0, 0);
    leaf.throws = true;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => body({ cases, itemsCap: 8 })).toThrow("leaf render fault");
    cleanup();
    expect(itemRows(body({ cases, itemsCap: null }))).toHaveLength(2);
  });
});

describe("showRawSnippet", () => {
  const SNIPPET = "12 | Audio | Mics | Shure SM58 | TRUE";
  const CASE: PullSheetCase = {
    caseLabel: "Rack A",
    items: [
      item({ item: "Shure SM58", rawSnippet: SNIPPET }),
      item({ item: "Sennheiser G4" }),
      item({ item: "Blank snippet", rawSnippet: "   " }),
    ],
  };
  const snippets = (root: HTMLElement) =>
    within(root).queryAllByTestId(`${PREFIX}-pack-item-raw-snippet`);

  test("off, the default: an item carrying one shows only its label", () => {
    premiseHolds("the fixture carries a snippet", CASE.items[0]?.rawSnippet === SNIPPET);
    const root = body({ cases: [CASE] });
    expect(root).not.toHaveTextContent(SNIPPET);
    expect(snippets(root)).toHaveLength(0);
  });

  test("on: the snippet sits in its own item's row, on its own line", () => {
    premiseHolds(
      "the snippet is not part of any label",
      !packItemLabel(CASE.items[0] as PullSheetItem).includes(SNIPPET),
    );
    const root = body({ cases: [CASE], showRawSnippet: true });
    const [row, plain, blank] = itemRows(root) as [HTMLElement, HTMLElement, HTMLElement];
    const snippet = within(row).getByText(SNIPPET);
    expect(snippet).toHaveAttribute("data-testid", `${PREFIX}-pack-item-raw-snippet`);
    expect(snippet).toHaveClass("block", "italic");
    expect(row).toHaveTextContent(packItemLabel(CASE.items[0] as PullSheetItem));
    expect(plain).not.toHaveTextContent(SNIPPET);
    expect(within(plain).queryByTestId(`${PREFIX}-pack-item-raw-snippet`)).toBeNull();
    expect(within(blank).queryByTestId(`${PREFIX}-pack-item-raw-snippet`)).toBeNull();
    expect(snippets(root)).toHaveLength(1);
  });

  test("on, under an items cap too", () => {
    const root = body({ cases: [CASE], showRawSnippet: true, itemsCap: 1 });
    expect(within(itemRows(root)[0] as HTMLElement).getByText(SNIPPET)).toBeInTheDocument();
  });
});

describe("numbered", () => {
  const CASES = [packCase("Rack A"), packCase("Spares", 0), packCase("Rack C")];
  test("off, the default: an unordered list with no index", () => {
    const root = body({ cases: CASES });
    expect(list(root).tagName).toBe("UL");
    expect(indexes(root)).toHaveLength(0);
    expect(summary(root)).not.toHaveTextContent("1.");
  });

  test("on: an ordered list, each case its place, hidden from assistive tech", () => {
    const root = body({ cases: CASES, numbered: true });
    expect(list(root).tagName).toBe("OL");
    expect(indexes(root).map((n) => n.textContent)).toEqual(["1.", "2.", "3."]);
    for (const index of indexes(root)) {
      expect(index).toHaveAttribute("aria-hidden", "true");
      expect(index).toHaveClass("shrink-0", "tabular-nums", "text-xs", "text-text-subtle");
    }
  });

  test("on: the index leads the label, in a summary and on a plain line", () => {
    const root = body({ cases: CASES, numbered: true });
    const [first, plain] = indexes(root) as [HTMLElement, HTMLElement];
    expect(first.nextElementSibling).toHaveTextContent("Rack A");
    expect(summary(root)).toContainElement(first);
    expect(plain.nextElementSibling).toHaveTextContent("Spares");
    expect(caseRows(root)[1]).toContainElement(plain);
  });
});

describe("targets", () => {
  const CASES = [packCase("Rack A"), packCase("", 1), packCase("Spares", 0)];
  const TARGETS: PackCaseTargets[] = [
    { line: "t-rack-a", items: ["t-item-1", undefined] },
    { items: ["t-item-only"] },
    { line: "t-spares" },
  ];

  test("no marker renders without them, whatever the other crew props", () => {
    const root = body({
      cases: CASES,
      itemsCap: null,
      numbered: true,
      showRawSnippet: true,
    });
    expect(root.querySelector("[data-search-target], [data-search-skip]")).toBeNull();
  });

  test("a case's line sits on its summary, and an item's on its row", () => {
    const root = body({ cases: CASES, targets: TARGETS });
    expect(summary(root)).toHaveAttribute("data-search-target", "t-rack-a");
    expect(summary(root)).not.toHaveAttribute("data-search-skip");
    expect(itemRows(root)[0]).toHaveAttribute("data-search-target", "t-item-1");
    expect(itemRows(root)[0]).not.toHaveAttribute("data-search-skip");
  });

  test("a case with no items carries its line on the row itself", () => {
    const root = body({ cases: CASES, targets: TARGETS });
    expect(caseRows(root)[2]).toHaveAttribute("data-search-target", "t-spares");
  });

  test("a case's targets go to that case, by its place in the list", () => {
    const root = body({ cases: CASES, targets: TARGETS });
    expect(itemRows(root, 1)[0]).toHaveAttribute("data-search-target", "t-item-only");
  });

  test("a line with no id is skipped: an invented label, an item with no entry", () => {
    const root = body({ cases: CASES, targets: TARGETS });
    expect(summary(root, 1)).toHaveAttribute("data-search-skip");
    expect(summary(root, 1)).not.toHaveAttribute("data-search-target");
    expect(itemRows(root)[1]).toHaveAttribute("data-search-skip");
    expect(itemRows(root)[1]).not.toHaveAttribute("data-search-target");
  });

  test("a case past the end of the list has nothing to mark and is skipped", () => {
    const root = body({ cases: CASES, targets: [TARGETS[0] as PackCaseTargets] });
    expect(summary(root, 1)).toHaveAttribute("data-search-skip");
    expect(itemRows(root, 1)[0]).toHaveAttribute("data-search-skip");
  });

  test("the index is chrome: skipped under targets", () => {
    const root = body({ cases: CASES, targets: TARGETS, numbered: true });
    expect(indexes(root)).toHaveLength(3);
    for (const index of indexes(root)) expect(index).toHaveAttribute("data-search-skip");
  });

  test("the markers pass the parity harness, the count and snippet carried as context", () => {
    const group = "Pack list";
    const line = (id: string, value: string, context: string[]): SearchEntry => ({
      id,
      section: "gear",
      group,
      label: null,
      value,
      context,
      copy: null,
    });
    const snippet = "4 | Audio | Wireless | Shure ULXD4";
    const cases: PullSheetCase[] = [
      { caseLabel: "Rack A", items: [item({ rawSnippet: snippet })] },
      { caseLabel: "Spares", items: [] },
    ];
    const entries: SearchEntry[] = [
      line("t-case", "Rack A", ["1 item"]),
      line("t-item", packItemLabel(cases[0]?.items[0] as PullSheetItem), [snippet, "Rack A"]),
      line("t-spares", "Spares", ["0 items"]),
    ];
    const { container } = render(
      <section>
        <div data-card-id="gear-pack-list">
          <h3 data-search-group="">{group}</h3>
          {PackListBody({
            cases,
            cap: 12,
            itemsCap: null,
            showRawSnippet: true,
            numbered: true,
            testIdPrefix: PREFIX,
            targets: [{ line: "t-case", items: ["t-item"] }, { line: "t-spares" }],
          })}
        </div>
      </section>,
    );
    expect(assertParity(container.firstElementChild as Element, entries)).toEqual([]);
  });
});
