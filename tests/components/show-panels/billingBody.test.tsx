// @vitest-environment jsdom
/**
 * tests/components/show-panels/billingBody.test.tsx
 * (crew page redesign PR B plan, Task 4; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1, §6.2
 * `billing` row, line 311)
 *
 * The Billing body is the key-value rows of the admin's `OpsBreakdown`, shared:
 * the admin passes all five rows (COI, Proposal, PO#, Invoice, Invoice notes)
 * with sentinels shown as parsed; the crew passes PO, Proposal, Invoice and
 * Invoice notes with sentinels hidden and a search target per row. The admin
 * rendering itself is pinned byte for byte by the Task 1 golden
 * (tests/components/admin/wizard/adminSectionDom.test.tsx); the admin cases here
 * describe what `OpsBreakdown` renders at 7e927e927
 * (components/admin/wizard/step3ReviewSections.tsx:1693-1711).
 *
 * Also here: the crew section around the body (the panel card, its title, the
 * section root), error containment for a body and for a client leaf (spec line
 * 291), and the serialized billing props for a viewer the gate excludes (AC-6).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const captureBoundaryError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError }));

import { BillingSection } from "@/components/crew/sections/BillingSection";
import {
  BUDGET_CARD_ID,
  billingBodyProps,
  budgetRows,
} from "@/components/crew/sections/budgetRows";
import { TileErrorBoundary } from "@/components/shared/TileErrorBoundary";
import { BillingBody, type BillingRow } from "@/components/show-panels/BillingBody";
import * as billingBodyModule from "@/components/show-panels/BillingBody";
import { createTileRenderLedger } from "@/lib/crew/tileRenderLedger";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { showSection } from "@/lib/showSections/registry";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { expectUntitledPanel } from "@/tests/components/show-panels/_panelCardAssert";

beforeEach(() => {
  captureBoundaryError.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-billing";

/** The admin's five rows in its order, a sentinel in one of them (OpsBreakdown's input shape). */
const ADMIN_ROWS: BillingRow[] = [
  { label: "COI", value: "On file" },
  { label: "Proposal", value: "TBD" },
  { label: "PO#", value: "PO-4471" },
  { label: "Invoice", value: "INV-208" },
  { label: "Invoice notes", value: "Net 30" },
];

const FINANCIALS = {
  po: "PO-4471",
  proposal: "PROP-19",
  invoice: "INV-208",
  invoice_notes: "Net 30 from load-out",
};

function lead(financials: ShowForViewer["financials"] = FINANCIALS): ShowForViewer {
  return makeShowForViewer({
    ...(financials === undefined ? {} : { financials }),
    crewMembers: [
      {
        id: "lead-1",
        name: "Lee Lead",
        email: null,
        phone: null,
        role: "TD",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
      {
        id: "crew-2",
        name: "Cam Crew",
        email: null,
        phone: null,
        role: "A1",
        roleFlags: [],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  });
}

const LEAD_VIEWER: Viewer = { kind: "crew", crewMemberId: "lead-1" };
const NON_LEAD_VIEWER: Viewer = { kind: "crew", crewMemberId: "crew-2" };

function valueSpan(row: Element): Element {
  return row.querySelectorAll(":scope > span")[1] as Element;
}

describe("BillingBody, admin props (sentinels shown)", () => {
  test("renders every row it is given, in order, with the admin's Label: keys", () => {
    const { container } = render(<BillingBody rows={ADMIN_ROWS} sentinels="show" />);
    const rows = [...container.querySelectorAll("li")];
    expect(rows.map((r) => r.textContent)).toEqual(ADMIN_ROWS.map((r) => `${r.label}:${r.value}`));
  });

  test("a sentinel is shown as parsed, in the same style as any value", () => {
    const { container } = render(<BillingBody rows={ADMIN_ROWS} sentinels="show" />);
    const rows = [...container.querySelectorAll("li")];
    const sentinel = rows.find((r) => r.textContent === "Proposal:TBD");
    const plain = rows.find((r) => r.textContent === "PO#:PO-4471");
    premiseHolds("the fixture holds a sentinel row and a plain row", !!sentinel && !!plain);
    expect(valueSpan(sentinel!).className).toBe(valueSpan(plain!).className);
  });

  test("carries no search marker of any kind", () => {
    const { container } = render(<BillingBody rows={ADMIN_ROWS} sentinels="show" />);
    expect(
      container.querySelector("[data-search-target],[data-search-skip],[data-search-group]"),
    ).toBeNull();
  });

  test('no rows renders "No billing details parsed."', () => {
    render(<BillingBody rows={[]} sentinels="show" />);
    expect(screen.getByText("No billing details parsed.")).toBeInTheDocument();
  });
});

describe("BillingBody, crew props (sentinels hidden, search targets)", () => {
  const CREW_ROWS: BillingRow[] = [
    { label: "PO", value: "PO-4471", searchTarget: "t-po" },
    { label: "Proposal", value: "TBD", searchTarget: "t-prop" },
    { label: "Invoice", value: "INV-208", searchTarget: "t-inv" },
  ];

  test("a sentinel row is hidden; its neighbours render", () => {
    const { container } = render(<BillingBody rows={CREW_ROWS} sentinels="hide" />);
    const text = [...container.querySelectorAll("li")].map((r) => r.textContent);
    expect(text).toEqual(["PO:PO-4471", "Invoice:INV-208"]);
    // Positive control: the same rows with sentinels shown keep the sentinel.
    cleanup();
    const shown = render(<BillingBody rows={CREW_ROWS} sentinels="show" />).container;
    expect([...shown.querySelectorAll("li")]).toHaveLength(3);
  });

  test("each row carries its search target, and its key's colon is outside search text", () => {
    const { container } = render(<BillingBody rows={CREW_ROWS} sentinels="hide" />);
    const targets = [...container.querySelectorAll("[data-search-target]")];
    expect(targets.map((t) => t.getAttribute("data-search-target"))).toEqual(["t-po", "t-inv"]);
    for (const t of targets) {
      const skip = t.querySelector("[data-search-skip]");
      expect(skip?.textContent).toBe(":");
    }
  });

  test("a row with no target carries no marker, even beside a row that has one", () => {
    const { container } = render(
      <BillingBody
        rows={[
          { label: "PO", value: "PO-1", searchTarget: "t" },
          { label: "Invoice", value: "INV-1" },
        ]}
        sentinels="hide"
      />,
    );
    const second = container.querySelectorAll("li")[1]!;
    expect(second.hasAttribute("data-search-target")).toBe(false);
    expect(second.querySelector("[data-search-skip]")).toBeNull();
  });
});

describe("crew billing rows and props", () => {
  test("the crew field set is PO, Proposal, Invoice, Invoice notes, in that order, never COI", () => {
    expect(budgetRows(FINANCIALS).map((r) => r.label)).toEqual([
      "PO",
      "Proposal",
      "Invoice",
      "Invoice notes",
    ]);
  });

  test("each shown row carries a billing search target on the budget-main card; a sentinel none", () => {
    const rows = budgetRows({ ...FINANCIALS, proposal: "N/A" });
    const prop = rows.find((r) => r.label === "Proposal")!;
    expect(prop.value).toBe("");
    expect(prop.searchTarget).toBeUndefined();
    for (const r of rows.filter((x) => x.value !== "")) {
      expect(r.searchTarget, r.label).toMatch(new RegExp(`^billing:${BUDGET_CARD_ID}:`));
    }
  });

  test("AC-6: a viewer financialsVisible excludes gets props holding no financial value; a lead's hold each", () => {
    const data = lead();
    const nonLead = resolveViewerContext(NON_LEAD_VIEWER, data);
    const leadCtx = resolveViewerContext(LEAD_VIEWER, data);
    premiseHolds(
      "the gate excludes the non-lead and admits the lead",
      !financialsVisible(nonLead.viewerFlags, nonLead.isAdmin) &&
        financialsVisible(leadCtx.viewerFlags, leadCtx.isAdmin),
    );
    // The fixture hands the non-lead the financials too (a projection that leaked),
    // so the props builder's own gate is what is under test.
    const withheld = JSON.stringify(billingBodyProps(data, nonLead));
    const shown = JSON.stringify(billingBodyProps(data, leadCtx));
    premise("financial values in the fixture", Object.values(FINANCIALS).length, 0);
    for (const value of Object.values(FINANCIALS)) {
      expect(withheld, value).not.toContain(value);
      expect(shown, value).toContain(value);
    }
  });
});

describe("BillingSection (crew)", () => {
  test('the panel card is titled with the registry label, "Billing & docs" (spec line 405), with card id budget-main', () => {
    render(
      <BillingSection
        ledger={createTileRenderLedger()}
        data={lead()}
        viewer={LEAD_VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const root = screen.getByTestId("section-billing");
    const card = root.querySelector(`[data-card-id="${BUDGET_CARD_ID}"]`);
    premiseHolds("the section renders its card", card !== null);
    expectUntitledPanel(card as HTMLElement, showSection("billing").label);
    expect(showSection("billing").label).toBe("Billing & docs");
    for (const value of Object.values(FINANCIALS)) expect(card).toHaveTextContent(value);
  });

  test("all-blank financials show the section's empty state and no card", () => {
    render(
      <BillingSection
        ledger={createTileRenderLedger()}
        data={lead({ po: "TBD", proposal: null, invoice: "", invoice_notes: "N/A" })}
        viewer={LEAD_VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const root = screen.getByTestId("section-billing");
    expect(within(root).getByTestId("section-empty")).toBeInTheDocument();
    expect(root.querySelector(`[data-card-id="${BUDGET_CARD_ID}"]`)).toBeNull();
  });
});

describe("error containment (spec line 291, line 507)", () => {
  test("a throw from BillingBody inside the crew WrappedSection renders the fallback and records the tile id", () => {
    const ledger = createTileRenderLedger();
    const spy = vi.spyOn(billingBodyModule, "BillingBody").mockImplementation(() => {
      throw new Error("planted billing body fault");
    });
    render(
      <BillingSection
        ledger={ledger}
        data={lead()}
        viewer={LEAD_VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    premiseHolds("the section called the body", spy.mock.calls.length > 0);
    expect(screen.getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(ledger.failed.get("crew:budget:rows")?.message).toBe("planted billing body fault");
    for (const value of Object.values(FINANCIALS)) {
      expect(document.body.textContent, value).not.toContain(value);
    }
  });

  test("a throw from a client leaf under TileErrorBoundary renders its fallback and reports its tile id", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    function ThrowingLeaf(): never {
      throw new Error("planted leaf fault");
    }
    render(
      <div>
        <TileErrorBoundary tileId="crew:billing:leaf">
          <ThrowingLeaf />
        </TileErrorBoundary>
        <p>sibling survives</p>
      </div>,
    );
    expect(screen.getByTestId("tile-error-fallback")).toBeInTheDocument();
    expect(screen.getByText("sibling survives")).toBeInTheDocument();
    expect(captureBoundaryError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "planted leaf fault" }),
      "tile",
      expect.objectContaining({ tileId: "crew:billing:leaf" }),
    );
  });
});

/**
 * PR B invariant-8 UI gate rows 10 and 15: the crew Billing section's empty state
 * and its field keys.
 */
describe("Billing crew presentation (gate rows 10, 15)", () => {
  const keyText = (row: Element) => row.querySelectorAll(":scope > span")[0]!.textContent;

  test("keyColon false: each key reads without its trailing colon; the default keeps the admin's Label:", () => {
    const rows: BillingRow[] = [
      { label: "PO", value: "PO-4471", searchTarget: "t-po" },
      { label: "Proposal", value: "PROP-19" },
    ];
    const admin = render(<BillingBody rows={rows} sentinels="show" />).container;
    expect([...admin.querySelectorAll("li")].map(keyText)).toEqual(["PO:", "Proposal:"]);
    cleanup();
    const crew = render(<BillingBody rows={rows} sentinels="hide" keyColon={false} />).container;
    const keys = [...crew.querySelectorAll("li")].map(keyText);
    expect(keys).toEqual(["PO", "Proposal"]);
    // The colon is gone, not hidden: no skip span is left behind it.
    expect(crew.querySelector("[data-search-skip]")).toBeNull();
  });

  test("the crew Billing card's keys carry no colon", () => {
    render(
      <BillingSection
        ledger={createTileRenderLedger()}
        data={lead()}
        viewer={LEAD_VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const card = screen
      .getByTestId("section-billing")
      .querySelector(`[data-card-id="${BUDGET_CARD_ID}"]`)!;
    const keys = [...card.querySelectorAll("li")].map(keyText);
    premise("billing rows rendered", keys.length, 0);
    for (const key of keys) expect(key, key ?? "").not.toMatch(/:$/);
  });

  test('all-blank financials say "No billing details on file yet.", the section\'s own name', () => {
    render(
      <BillingSection
        ledger={createTileRenderLedger()}
        data={lead({ po: "TBD", proposal: null, invoice: "", invoice_notes: "N/A" })}
        viewer={LEAD_VIEWER}
        today={TODAY}
        showId={SHOW_ID}
      />,
    );
    const empty = within(screen.getByTestId("section-billing")).getByTestId("section-empty");
    expect(empty.textContent).toBe("No billing details on file yet.");
    expect(empty).toBeVisible();
  });
});
