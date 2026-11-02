// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { BillingSection } from "@/components/crew/sections/BillingSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { crewSectionEntitled, type CrewSectionsViewer } from "@/lib/crew/crewSections";
import {
  CREW_SECTION_IDS,
  resolveActiveSection,
  type SectionId,
} from "@/lib/crew/resolveActiveSection";
import { ledgerProp } from "./_ledgerProp";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("BillingSection renders financials iff financialsVisible; the SAME predicate drives resolveActiveSection", () => {
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
      <BillingSection
        {...ledgerProp()}
        data={lead}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container.textContent,
  ).toContain("PO-1");
  // The SAME single predicate gates the section selection: a non-lead's direct
  // ?s=billing, or the old ?s=budget, falls back to today.
  const nonLead: CrewSectionsViewer = {
    viewerFlags: [],
    isAdmin: false,
    dateRestriction: { kind: "none" },
  };
  expect(crewSectionEntitled("billing", lead, nonLead)).toBe(financialsVisible([], false));
  const entitled = new Set<SectionId>(
    CREW_SECTION_IDS.filter((id) => crewSectionEntitled(id, lead, nonLead)),
  );
  expect(resolveActiveSection("billing", entitled)).toBe("today");
  expect(resolveActiveSection("budget", entitled)).toBe("today");
});

test("BillingSection no-ops (no financials content) when data.financials is absent", () => {
  const noFin = makeShowForViewer({});
  const { container } = render(
    <BillingSection
      {...ledgerProp()}
      data={noFin}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.textContent).not.toContain("PO-1");
});
