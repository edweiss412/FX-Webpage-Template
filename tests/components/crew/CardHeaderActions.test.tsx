// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CardHeaderActions } from "@/components/crew/primitives/CardHeaderActions";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";

afterEach(cleanup);
const DRIVE = "drive-1";

it("renders the SourceLink <a> with the EXACT passed-in anchor (not a CARD_REGION_MAP-derived one)", () => {
  // gear-scope passes a dynamic gear_scope anchor even though its region is `rooms`.
  const gearScope: SourceAnchor = { title: "GEAR", gid: 7, a1: "A1:D9" };
  const { container } = render(
    <CardHeaderActions
      cardId="gear-scope-audio"
      driveFileId={DRIVE}
      anchor={gearScope}
      showId="s1"
    />,
  );
  const a = container.querySelector('a[data-slot="source-link"]')!;
  expect(a.getAttribute("href")).toBe(buildSheetDeepLink(DRIVE, gearScope));
});

it("renders both the source link and the report trigger in the cluster", () => {
  const { container } = render(
    <CardHeaderActions
      cardId="today-dress"
      driveFileId={DRIVE}
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
      showId="s1"
    />,
  );
  expect(container.querySelector('[data-slot="source-link"]')).not.toBeNull();
  expect(container.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
});

it("still renders the report trigger when there is no source sheet (SourceLink null)", () => {
  const { container } = render(
    <CardHeaderActions cardId="today-dress" driveFileId={null} anchor={null} showId="s1" />,
  );
  expect(container.querySelector('[data-slot="source-link"]')).toBeNull();
  expect(container.querySelector('[data-slot="card-report-trigger"]')).not.toBeNull();
});

// CARDREPORT-1: the cluster widens to gap-4 and threads a hit-grow direction to
// both leaves, reflecting it as data-hit-direction (the production-wiring seam).
it("reflects the default up direction, uses gap-4, and threads it to both leaves", () => {
  const { container } = render(
    <CardHeaderActions
      cardId="today-dress"
      driveFileId={DRIVE}
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
      showId="s1"
    />,
  );
  const wrap = container.querySelector('[data-slot="card-header-actions"]')!;
  expect(wrap.getAttribute("data-hit-direction")).toBe("up");
  expect(wrap.getAttribute("class")).toContain("gap-4");
  expect(container.querySelector('[data-slot="source-link"]')!.getAttribute("class")).toContain(
    "before:bottom-0",
  );
  expect(
    container.querySelector('[data-slot="card-report-trigger"]')!.getAttribute("class"),
  ).toContain("before:bottom-0");
});

it("threads hitDirection=down to both leaves and reflects it", () => {
  const { container } = render(
    <CardHeaderActions
      cardId="today-dress"
      driveFileId={DRIVE}
      anchor={{ title: "INFO", gid: 0, a1: "A4:B5" }}
      showId="s1"
      hitDirection="down"
    />,
  );
  const wrap = container.querySelector('[data-slot="card-header-actions"]')!;
  expect(wrap.getAttribute("data-hit-direction")).toBe("down");
  expect(container.querySelector('[data-slot="source-link"]')!.getAttribute("class")).toContain(
    "before:top-0",
  );
  expect(
    container.querySelector('[data-slot="card-report-trigger"]')!.getAttribute("class"),
  ).toContain("before:top-0");
});
