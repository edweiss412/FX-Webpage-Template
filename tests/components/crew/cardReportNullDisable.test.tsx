// @vitest-environment jsdom
/**
 * Task 2 — explicit `cardReport={null}` disables every card report trigger.
 *
 * Spec: docs/superpowers/specs/step3-onboarding/2026-08-15-step3-crew-preview-and-opslog-disposition-design.md §2.6 item 5
 *
 * `undefined` must keep today's `DEFAULT_CARD_REPORT` parameter default (both
 * existing CrewShell callers rely on it, AC-8); `null` is a NEW, explicit
 * "reporting disabled" state that renders no trigger at all. The negative arm
 * below is what makes the positive arm falsifiable.
 */
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { CardReportTrigger } from "@/components/shared/CardReportTrigger";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./sections/_ledgerProp";

afterEach(cleanup);

const SHOW_ID = "show-abc";
const TODAY = new Date("2026-05-14T15:00:00Z");
const TRIGGER_LABEL = "Report a problem with this card";

/** Every trigger in the WHOLE rendered tree, found two independent ways. */
function triggerCount(container: HTMLElement): number {
  const bySlot = container.querySelectorAll('[data-slot="card-report-trigger"]').length;
  const byName = screen.queryAllByRole("button", { name: TRIGGER_LABEL }).length;
  expect(bySlot).toBe(byName);
  return bySlot;
}

function venueData(): ReturnType<typeof makeShowForViewer> {
  return makeShowForViewer({
    show: {
      venue: { name: "Center", address: "5 Ave", loadingDock: "Dock at rear", notes: "Quiet" },
      coi_status: "Received",
      event_details: { power: "200A 3-phase", internet: "SSID Guest / pw 1234" },
    },
  });
}

test("CardReportTrigger renders nothing under an explicit null context", () => {
  const { container } = render(
    <CardReportTrigger cardId="today-dress" region="dress" showId={SHOW_ID} cardReport={null} />,
  );
  expect(triggerCount(container)).toBe(0);
});

test("CardHeaderActions keeps the source link but drops the trigger under null", () => {
  const { container } = render(
    <CardHeaderActions
      cardId="today-dress"
      driveFileId="drive-1"
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
      showId={SHOW_ID}
      cardReport={null}
    />,
  );
  expect(triggerCount(container)).toBe(0);
  // The rest of the cluster is untouched: null disables REPORTING, not the header.
  expect(container.querySelector('[data-slot="source-link"]')).not.toBeNull();
});

test("CardHeaderActions still renders the trigger when cardReport is omitted", () => {
  const { container } = render(
    <CardHeaderActions
      cardId="today-dress"
      driveFileId="drive-1"
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
      showId={SHOW_ID}
    />,
  );
  // Proves the assertion above discriminates rather than passing vacuously.
  expect(triggerCount(container)).toBe(1);
});

test("a representative section renders zero triggers under null and some when omitted", () => {
  const omitted = render(
    <VenueSection
      data={venueData()}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
      {...ledgerProp()}
    />,
  );
  const baseline = triggerCount(omitted.container);
  // Premise: this fixture actually renders triggers, so zero is a real change.
  expect(baseline).toBeGreaterThan(0);
  cleanup();

  const nulled = render(
    <VenueSection
      data={venueData()}
      viewer={{ kind: "admin" }}
      today={TODAY}
      showId={SHOW_ID}
      cardReport={null}
      {...ledgerProp()}
    />,
  );
  expect(triggerCount(nulled.container)).toBe(0);
  // The section body itself still rendered (null suppresses the trigger only).
  expect(nulled.container.textContent).toContain("Dock at rear");
});
