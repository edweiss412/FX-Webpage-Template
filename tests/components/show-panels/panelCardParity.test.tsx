// @vitest-environment jsdom
/**
 * tests/components/show-panels/panelCardParity.test.tsx
 * (crew page redesign PR B plan, Task 4; spec
 * docs/superpowers/specs/2026-10-26-crew-page-redesign-design.md §6.1 line 290)
 *
 * The crew panel card is the admin panel card's surface: the same box tokens
 * (surface, border, radius, padding, shadow) and the same 28px icon chip. That
 * is an equality claim between two surfaces, so it is proven by rendering both
 * and comparing class token sets, the admin side through `ModalSectionChrome`
 * itself (its unflagged, not-judgment, top-level branch), never through a copy
 * of its classes. Failure modes caught: a token dropped or added on either side
 * (one is planted on each side after the green and observed red), and the crew
 * card hard-coding a different radius, padding or shadow token.
 *
 * Geometry (the chip renders 28 by 28, the header row is at least the chip's
 * height, the actions never overlap the label) is a real-browser claim; it is
 * the "billing" panel-card case in tests/e2e/crew-page.spec.ts.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import type { LucideIcon } from "lucide-react";
import { afterEach, describe, expect, test } from "vitest";

import { showSection } from "@/lib/showSections/registry";
import {
  ModalSectionChrome,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import { PanelCard } from "@/components/show-panels/PanelCard";
import { premiseHolds } from "@/tests/_shared/premise";

afterEach(cleanup);

const DFID = "dfid-parity";

const ProbeIcon = ((props: { className?: string }) => (
  <svg data-probe-icon="" className={props.className} />
)) as unknown as LucideIcon;

/** The admin card's default branch: not flagged, not a judgment call, a top-level section. */
const CHROME: Step3SectionChrome = {
  Icon: ProbeIcon,
  label: "Billing & docs",
  flagged: false,
  judgment: false,
  headingLevel: 3,
  dfid: DFID,
  sectionId: "billing",
};

function tokens(el: Element | null | undefined): string[] {
  premiseHolds("the compared element rendered", el !== null && el !== undefined);
  return [...new Set((el as Element).className.split(/\s+/).filter(Boolean))].sort();
}

function renderAdmin() {
  const { container } = render(
    <ModalSectionChrome chrome={CHROME} count={4}>
      <p>admin body</p>
    </ModalSectionChrome>,
  );
  return {
    box: container.querySelector(
      `[data-testid="wizard-step3-card-${DFID}-section-billing-panel-card"]`,
    ),
    chip: container.querySelector("svg[data-probe-icon]")?.parentElement,
  };
}

function renderCrew() {
  const { container } = render(
    <PanelCard
      sectionId="billing"
      titled
      cardId="budget-main"
      actions={<button type="button">act</button>}
    >
      <p>crew body</p>
    </PanelCard>,
  );
  const box = container.firstElementChild;
  return { box, chip: box?.querySelector("svg")?.parentElement };
}

describe("crew panel card class parity with the admin panel card (spec line 290)", () => {
  test("the box carries exactly the admin box's tokens", () => {
    premiseHolds(
      "the admin fixture is the unflagged, not-judgment, top-level branch",
      CHROME.flagged === false && CHROME.judgment !== true && CHROME.headingLevel !== 4,
    );
    expect(tokens(renderCrew().box)).toEqual(tokens(renderAdmin().box));
  });

  test("the icon chip carries exactly the admin chip's tokens", () => {
    premiseHolds(
      "the admin fixture is the unflagged, not-judgment, top-level branch",
      CHROME.flagged === false && CHROME.judgment !== true && CHROME.headingLevel !== 4,
    );
    expect(tokens(renderCrew().chip)).toEqual(tokens(renderAdmin().chip));
  });

  test("the crew card's label is an h3, its card id is data-card-id, and its actions render", () => {
    const { box } = renderCrew();
    expect(box?.getAttribute("data-card-id")).toBe("budget-main");
    expect(box?.querySelector("h3")).not.toBeNull();
    expect(box?.querySelector("button")).toHaveTextContent("act");
    // A card with no card id carries no empty attribute.
    cleanup();
    const { container } = render(
      <PanelCard sectionId="billing">
        <p>x</p>
      </PanelCard>,
    );
    expect(container.firstElementChild?.hasAttribute("data-card-id")).toBe(false);
  });
});

describe("one title per section (crew panel follow-ups spec §4)", () => {
  const LABEL = showSection("billing").label;

  /** Everything a person or a screen reader meets, with hidden elements gone. */
  function visibleText(box: Element | null | undefined): string {
    const clone = box?.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("[hidden]").forEach((el) => el.remove());
    return clone.textContent ?? "";
  }

  test("by default a section's card prints no chip or title, and keeps its search group hidden", () => {
    const { container } = render(
      <PanelCard sectionId="billing">
        <p>crew body</p>
      </PanelCard>,
    );
    const box = container.firstElementChild;
    expect(box?.querySelector('[data-slot="panel-card-chip"]')).toBeNull();
    expect(box?.querySelector("h3")).toBeNull();
    expect(visibleText(box)).toBe("crew body");
    const groups = [...(box?.querySelectorAll("[data-search-group]") ?? [])];
    expect(groups.map((g) => g.textContent)).toEqual([LABEL]);
    // `hidden`, so heading navigation and the page's text meet the name once, on the h2.
    expect(groups[0]?.hasAttribute("hidden")).toBe(true);
  });

  test("with actions the untitled header holds only the action slot; with none, no header", () => {
    const { container } = render(
      <PanelCard sectionId="billing" actions={<button type="button">act</button>}>
        <p>x</p>
      </PanelCard>,
    );
    const header = container.querySelector('[data-slot="panel-card-header"]');
    expect(header?.children).toHaveLength(1);
    expect(header?.firstElementChild).toHaveAttribute("data-slot", "section-card-action");
    cleanup();
    const bare = render(
      <PanelCard sectionId="billing">
        <p>x</p>
      </PanelCard>,
    );
    expect(bare.container.querySelector("header")).toBeNull();
  });

  test("titled prints the registry label in an h3, with no hidden copy", () => {
    const { container } = render(
      <PanelCard sectionId="billing" titled>
        <p>x</p>
      </PanelCard>,
    );
    expect(container.querySelector("h3")).toHaveTextContent(LABEL);
    expect(container.querySelector("h3")).toHaveAttribute("data-search-group");
    expect(container.querySelector("[hidden]")).toBeNull();
  });

  test("a crew-only card prints its own title and glyph, and its search line", () => {
    const { container } = render(
      <PanelCard title="Facilities" icon={ProbeIcon} titleSearchTarget="line-1">
        <p>x</p>
      </PanelCard>,
    );
    const title = container.querySelector("h3");
    expect(title).toHaveTextContent("Facilities");
    expect(title).toHaveAttribute("data-search-target", "line-1");
    expect(title).toHaveAttribute("data-search-group");
    const chip = container.querySelector('[data-slot="panel-card-chip"]');
    expect(chip?.querySelector("svg")).toHaveClass("size-4");
    expect(tokens(chip)).toEqual(tokens(renderAdmin().chip));
  });

  test("a card given a title and titled={false} keeps that title as its hidden group", () => {
    const { container } = render(
      <PanelCard title="Crew Schedule" icon={ProbeIcon} titled={false}>
        <p>x</p>
      </PanelCard>,
    );
    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelector("[data-search-group]")).toHaveTextContent("Crew Schedule");
  });
});
