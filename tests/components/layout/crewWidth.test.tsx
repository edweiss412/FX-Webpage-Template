// @vitest-environment jsdom
/**
 * tests/components/layout/crewWidth.test.tsx
 *
 * The crew page's desktop width (docs/superpowers/specs/2026-11-11-crew-page-width-1440-design.md):
 * its body, header, footer and the admin preview banners all stop at 1440px, so
 * their edges line up. One surface left at the old 1200px limit would leave the
 * header or the banner narrower than the content under it on a wide screen.
 *
 * The header and both banners are rendered; the footer is an async server
 * component with a report modal's dependencies, and the preview loading state a
 * route file, so those two are read as source for their width row's classes.
 * tests/e2e/crew-wide-nav.spec.ts measures the rendered edges in a browser.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PreviewBanner } from "@/components/admin/PreviewBanner";
import { StagedPreviewBanner } from "@/components/admin/StagedPreviewBanner";
import { Header } from "@/components/layout/Header";
import { CREW_PAGE_CONTAINER } from "@/lib/crew/pageContainer";
import type { ShowRow } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/",
}));

afterEach(cleanup);

const NEW = "max-w-360";
const OLD = /\bmax-w-300\b|max-w-\[1200px\]/;

const SHOW: Pick<ShowRow, "title" | "client_label" | "dates" | "venue"> = {
  title: "Spring Gala 2026",
  client_label: "Acme Corp",
  dates: { travelIn: null, set: "2026-04-17", showDays: ["2026-04-18"], travelOut: null },
  venue: { name: "Hilton Chicago", address: "720 S Michigan Ave", googleLink: null, notes: null },
};

/** The rendered element that carries the width limit, by its centring class. */
function widthRow(container: HTMLElement): Element {
  const row = container.querySelector(".mx-auto");
  expect(row, "a centred width row rendered").not.toBeNull();
  return row as Element;
}

describe("the crew page and its chrome stop at 1440px", () => {
  it("the body row", () => {
    expect(CREW_PAGE_CONTAINER.split(" ")).toContain(NEW);
    expect(CREW_PAGE_CONTAINER).not.toMatch(OLD);
  });

  it("the header", () => {
    const { container } = render(<Header show={SHOW} />);
    expect(widthRow(container)).toHaveClass(NEW);
    expect(widthRow(container).className).not.toMatch(OLD);
  });

  it("the preview banner", () => {
    const { container } = render(
      <PreviewBanner
        crewMemberName="Eric Weiss"
        crewMemberRoleLabel="A1"
        slug="spring-gala"
        showId="00000000-0000-4000-8000-000000000001"
        crewMemberId="00000000-0000-4000-8000-000000000002"
      />,
    );
    expect(widthRow(container)).toHaveClass(NEW);
    expect(widthRow(container).className).not.toMatch(OLD);
  });

  it("the staged preview banner", () => {
    const { container } = render(
      <StagedPreviewBanner
        stagedId="3f1c9b7e-0000-4000-8000-0000000000aa"
        roster={[{ id: "staged-crew-0", name: "Crew Member 0", role: "Role 0" }]}
        selectedId="staged-crew-0"
      />,
    );
    expect(widthRow(container)).toHaveClass(NEW);
    expect(widthRow(container).className).not.toMatch(OLD);
  });

  it.each([
    ["the footer", "components/layout/Footer.tsx"],
    ["the preview's loading state", "app/admin/show/[slug]/preview/[crewId]/loading.tsx"],
    ["the loading skeleton's header", "components/crew/CrewLoadingSkeleton.tsx"],
  ])("%s", (_name, file) => {
    const source = readFileSync(file, "utf8");
    expect(source).toContain(NEW);
    expect(source).not.toMatch(OLD);
  });
});
