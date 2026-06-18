// @vitest-environment jsdom
/**
 * tests/components/layout/headerStatusPill.test.tsx (Task 14 — D-2 / wp-18)
 *
 * The show-status pill ports from the (deleted) ShowStatusTile into the
 * Header so the compact show-lifecycle state is visible on EVERY section
 * (it complements the Today-only hero). This pins the Header's slot
 * contract directly:
 *
 *   - `Header` given a `statusPill` slot value renders it inside a node
 *     carrying `data-testid="header-status-pill"`.
 *   - `Header` given no `statusPill` (the prop omitted) renders NO pill
 *     node — so the slot is strictly opt-in and Header stays backward-
 *     compatible for every other consumer that never passes it.
 *
 * Failure mode caught: a field-port regression where deleting
 * ShowStatusTile silently drops the status pill (no Header home), OR the
 * pill always rendering even when no slot value is supplied (a stray
 * empty pill on Header consumers that don't opt in).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { Header } from "@/components/layout/Header";

import type { ShowRow } from "@/lib/parser/types";

const baseShow: Pick<ShowRow, "title" | "client_label" | "dates" | "venue"> = {
  title: "Acme Show",
  client_label: "",
  dates: { travelIn: null, set: null, showDays: [], travelOut: null },
  venue: { name: "Acme Arena", address: "1 Arena Way", googleLink: null, notes: null },
};

afterEach(() => {
  cleanup();
});

describe("Header status-pill slot (Task 14 / D-2)", () => {
  it("renders the provided statusPill slot inside data-testid=header-status-pill", () => {
    render(
      <Header
        show={baseShow}
        statusPill={<span data-testid="pill-payload">Show day 1 of 3</span>}
      />,
    );
    const pill = screen.getByTestId("header-status-pill");
    expect(pill).toBeTruthy();
    // The slot value renders inside the pill node.
    expect(pill.textContent).toContain("Show day 1 of 3");
    expect(screen.getByTestId("pill-payload")).toBeTruthy();
  });

  it("renders NO pill node when statusPill is omitted", () => {
    render(<Header show={baseShow} />);
    expect(screen.queryByTestId("header-status-pill")).toBeNull();
  });

  it("renders NO pill node when statusPill is explicitly null", () => {
    render(<Header show={baseShow} statusPill={null} />);
    expect(screen.queryByTestId("header-status-pill")).toBeNull();
  });
});
