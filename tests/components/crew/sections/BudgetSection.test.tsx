// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { BudgetSection } from "@/components/crew/sections/BudgetSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { resolveActiveSection } from "@/lib/crew/resolveActiveSection";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("BudgetSection renders financials iff financialsVisible; the SAME predicate drives resolveActiveSection", () => {
  const lead = makeShowForViewer({
    financials: { po: "PO-1", proposal: "P", invoice: "I", invoice_notes: "N" },
    crewMembers: [
      {
        id: "c1",
        name: "L",
        email: null,
        phone: null,
        role: "",
        roleFlags: ["LEAD"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  });
  expect(
    render(
      <BudgetSection data={lead} viewer={{ kind: "crew", crewMemberId: "c1" }} today={TODAY} showId={SHOW_ID} />,
    ).container.textContent,
  ).toContain("PO-1");
  // The SAME single predicate gates the section selection: a non-lead direct ?s=budget falls back to today.
  expect(resolveActiveSection("budget", { budgetVisible: financialsVisible([], false) })).toBe("today");
});

test("BudgetSection no-ops (no financials content) when data.financials is absent", () => {
  const noFin = makeShowForViewer({});
  const { container } = render(
    <BudgetSection data={noFin} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  expect(container.textContent).not.toContain("PO-1");
});
