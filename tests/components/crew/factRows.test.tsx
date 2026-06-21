// @vitest-environment jsdom
/**
 * tests/components/crew/factRows.test.tsx (crew-mock-fidelity Task 6)
 *
 * <FactRows> is the HORIZONTAL counterpart to the vertical <KeyValueRows>:
 * the mock's `.kvrow` fact list. Each present row puts `k` (an optional 28px
 * sunken mini-icon square + label) on the LEFT and `v` (+ optional `sub`
 * below) RIGHT-aligned, with bordered rows. Like <KeyValueRows> it routes
 * row visibility through the single `shouldHideGenericOptional` predicate, so
 * a sentinel/empty `v` ('', 'TBD', 'N/A', 'TBA') reflows the whole row out.
 *
 * This suite pins:
 *   - a present row renders k-label + value + sub;
 *   - the mini-icon square renders ONLY when an `icon` is passed;
 *   - a sentinel/empty value omits the entire row (label included);
 *   - the present-row count is derived from the fixture, never hardcoded.
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { FactRows, type FactRow } from "@/components/crew/primitives/FactRows";

afterEach(cleanup);

// Fixture: two present rows (one with an icon + sub), two sentinel/empty rows.
const rows: FactRow[] = [
  {
    k: "Loading dock",
    v: "Dock at rear",
    sub: "Service entrance",
    icon: <svg data-testid="dock-glyph" />,
  },
  { k: "Crew Wi-Fi", v: "SSID Guest / pw 1234" },
  { k: "Parking", v: "TBD" }, // sentinel → OMITTED
  { k: "Power", v: "" }, // empty → OMITTED
];

const SENTINELS = new Set(["", "TBD", "N/A", "TBA"]);
const presentCount = rows.filter((r) => !SENTINELS.has(r.v.trim().toUpperCase())).length;

test("renders present rows with k-label + value + sub; the mini-icon square renders when icon is passed", () => {
  const { getByTestId } = render(<FactRows rows={rows} />);
  const list = getByTestId("fact-rows");
  const text = list.textContent ?? "";

  // Present rows: labels + values + sub all present.
  expect(text).toContain("Loading dock");
  expect(text).toContain("Dock at rear");
  expect(text).toContain("Service entrance");
  expect(text).toContain("Crew Wi-Fi");
  expect(text).toContain("SSID Guest / pw 1234");

  // The mini-icon square wraps the passed glyph (present for the iconed row).
  const iconSquare = list.querySelector('[data-slot="fact-row-icon"]');
  expect(iconSquare).not.toBeNull();
  expect(iconSquare!.querySelector('[data-testid="dock-glyph"]')).not.toBeNull();

  // The non-iconed present row has NO icon square — count squares == iconed rows.
  const iconedPresent = rows.filter(
    (r) => !SENTINELS.has(r.v.trim().toUpperCase()) && r.icon !== undefined,
  ).length;
  expect(list.querySelectorAll('[data-slot="fact-row-icon"]').length).toBe(iconedPresent);
});

test("omits rows whose value is empty or a sentinel — neither label nor value leaks", () => {
  const { getByTestId } = render(<FactRows rows={rows} />);
  const list = getByTestId("fact-rows");
  const text = list.textContent ?? "";

  expect(text).not.toContain("Parking");
  expect(text).not.toContain("Power");
  expect(text).not.toContain("TBD");

  // Present-row count derived from the fixture, not hardcoded.
  expect(list.querySelectorAll("dt").length).toBe(presentCount);
});

test("a row with no icon and no sub renders just k + v (no icon square, no sub node)", () => {
  const { getByTestId } = render(<FactRows rows={[{ k: "Crew Wi-Fi", v: "SSID Guest" }]} />);
  const list = getByTestId("fact-rows");
  expect(list.querySelector('[data-slot="fact-row-icon"]')).toBeNull();
  expect(list.querySelector('[data-slot="fact-row-sub"]')).toBeNull();
  expect(list.textContent).toContain("Crew Wi-Fi");
  expect(list.textContent).toContain("SSID Guest");
});
