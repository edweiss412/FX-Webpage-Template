// @vitest-environment jsdom
/**
 * tests/components/crew/sheetFocusContainment.test.tsx: an open section sheet
 * keeps keyboard focus inside it when the focused content leaves the page
 * (whole-diff review round 2, second pass, 2A-R2-1; redesign spec §5.2 "focus
 * is trapped", §7's refresh rows).
 *
 * The sheet set focus once, on open. When the focused node was then removed (an
 * in-sheet link swapping the body, a refresh replacing the focused control, a
 * nested dialog whose owner went away with it open), focus fell to <body>, the
 * page behind was inert, and the walk ignored the next Tab because its target
 * was outside the dialog: the keyboard user had nowhere to act from.
 *
 * Every case is FOCUS-FIRST: the control the user was on is focused before the
 * change, as a keyboard user's would be (the older cases clicked without
 * focusing, so focus was never on the node that left). The nested dialogs are
 * the real ones: the agenda viewer (its PDF canvas stubbed, as AgendaEmbed's
 * own suite does), the diagram lightbox (its carousel and zoom stubbed, as
 * GalleryLightbox's own suite does) and the card report modal.
 *
 * jsdom lays nothing out, so `offsetParent` is the parent element here, as in
 * tests/lib/a11y/dialogFocusWalk.test.tsx: the walk then sees the sheet's stops.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/agenda/AgendaPdfViewer", () => ({
  AgendaPdfViewer: ({ src }: { src: string }) => (
    <div data-testid="agenda-pdf-viewer-stub" data-src={src} />
  ),
}));
vi.mock("react-zoom-pan-pinch", async () => {
  const React = await import("react");
  return {
    TransformWrapper: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", null, children),
    TransformComponent: ({ children }: { children?: ReactNode }) =>
      React.createElement("div", null, children),
    useTransformEffect: () => {},
    useControls: () => ({
      resetTransform: () => {},
      centerView: () => {},
      setTransform: () => {},
      zoomIn: () => {},
      zoomOut: () => {},
    }),
  };
});
vi.mock("embla-carousel-react", async () => {
  const React = await import("react");
  function useEmblaCarouselMock() {
    const api = React.useMemo(
      () => ({
        selectedScrollSnap: () => 0,
        scrollTo: () => {},
        scrollNext: () => {},
        scrollPrev: () => {},
        canScrollNext: () => false,
        canScrollPrev: () => false,
        on: () => api,
        off: () => api,
        reInit: () => {},
        rootNode: () => document.createElement("div"),
        internalEngine: () => ({}),
      }),
      [],
    );
    return [() => {}, api] as const;
  }
  return { default: useEmblaCarouselMock };
});

const nav = vi.hoisted(() => ({
  pathname: "/show/spring-gala/tok123",
  searchParams: new URLSearchParams(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.searchParams,
}));

import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";
import { CrewSections } from "@/components/crew/CrewSections";
import { CopyFactValue } from "@/components/crew/primitives/CopyFactValue";
import { GalleryLightbox } from "@/components/diagrams/GalleryLightbox";
import { CardReportTrigger } from "@/components/shared/CardReportTrigger";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { buildSectionHref } from "@/lib/crew/sectionHref";

const PATH = "/show/spring-gala/tok123";
const SHOW_ID = "11111111-1111-4111-8111-111111111111";

const originalOffsetParent = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");

beforeAll(() => {
  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Observer);
  vi.stubGlobal("ResizeObserver", Observer);
});

beforeEach(() => {
  nav.searchParams = new URLSearchParams();
  History.prototype.replaceState.call(window.history, null, "", PATH);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      // Compact (the sheet), reduced motion (no exit slide to wait on).
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.spyOn(window.history, "back").mockImplementation(() => {});
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.parentElement;
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 201 })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (originalOffsetParent) {
    Object.defineProperty(HTMLElement.prototype, "offsetParent", originalOffsetParent);
  }
  document.body.style.overflow = "";
  sessionStorage.clear();
});

const SECTIONS: CrewSectionId[] = ["schedule", "venue", "travel", "crew", "gear"];

function controller(bodies: Partial<Record<SectionId, ReactNode>>) {
  return (
    <CrewSections
      initialSection="today"
      sections={SECTIONS.map((id) => ({ id, label: CREW_SECTION_LABELS[id], peek: null }))}
      sectionNodes={{
        today: <div data-testid="body-today">today</div>,
        ...Object.fromEntries(
          SECTIONS.map((id) => [
            id,
            <div key={id} data-testid={`body-${id}`}>
              {id}
            </div>,
          ]),
        ),
        ...bodies,
      }}
    />
  );
}

function openFromRow(id: CrewSectionId): HTMLElement {
  fireEvent.click(
    within(screen.getByTestId("crew-all-sections")).getByRole("link", {
      name: new RegExp(`^${CREW_SECTION_LABELS[id]}\\b`),
    }),
  );
  return screen.getByTestId("crew-section-sheet-dialog");
}

/** Lets the document's change records and the focus they trigger settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

/** Focus is inside the open sheet, and the next Tab is the sheet's own. */
function expectFocusInSheet(at: string): void {
  const dialog = screen.getByTestId("crew-section-sheet-dialog");
  const active = document.activeElement;
  expect(active, `${at}: focus is not on <body>`).not.toBe(document.body);
  expect(dialog.contains(active), `${at}: focus is inside the sheet`).toBe(true);
  const moved = !fireEvent.keyDown(active!, { key: "Tab" });
  expect(moved, `${at}: the sheet takes the next Tab`).toBe(true);
  expect(dialog.contains(document.activeElement), `${at}: and keeps focus in it`).toBe(true);
}

describe("an open sheet keeps focus inside it when the focused content leaves (2A-R2-1)", () => {
  it("an in-sheet section link, focused and activated, swaps the body and focus stays in the sheet", async () => {
    const link = (
      <a data-testid="in-sheet-link" href={buildSectionHref(PATH, nav.searchParams, "crew")}>
        Crew roster
      </a>
    );
    render(controller({ venue: <div data-testid="body-venue">venue {link}</div> }));
    openFromRow("venue");
    const anchor = screen.getByTestId("in-sheet-link");
    anchor.focus();
    expect(document.activeElement, "PREMISE: the link holds focus").toBe(anchor);
    fireEvent.click(anchor);
    expect(screen.getByTestId("crew-section-sheet-dialog")).toHaveAttribute("data-section", "crew");
    await settle();
    expect(anchor.isConnected, "PREMISE: the link left with the venue body").toBe(false);
    expectFocusInSheet("section switch");
  });

  it("a refresh that replaces the focused password-copy button keeps focus in the sheet", async () => {
    const withPassword = (
      <div data-testid="body-venue">
        <CopyFactValue
          value="FITS2025"
          label="Copy Wi-Fi password"
          identity="venue-wifi-password"
        />
      </div>
    );
    const { rerender } = render(controller({ venue: withPassword }));
    openFromRow("venue");
    const copy = screen.getByRole("button", { name: /Copy Wi-Fi password/ });
    copy.focus();
    expect(document.activeElement, "PREMISE: the copy button holds focus").toBe(copy);
    // The refreshed projection: the Wi-Fi cell lost its password.
    rerender(controller({ venue: <div data-testid="body-venue">SSID: Hyatt_Meeting</div> }));
    expect(copy.isConnected, "PREMISE: the refresh removed the button").toBe(false);
    await settle();
    expectFocusInSheet("refresh");
  });

  it("removing the agenda owner while its viewer is open keeps focus in the sheet", async () => {
    const agenda = (
      <div data-testid="body-schedule">
        <AgendaEmbed
          showId={SHOW_ID}
          agendaLinks={[{ label: "AGENDA", fileId: "compoundOwnerAgenda01" }]}
        />
      </div>
    );
    const { rerender } = render(controller({ schedule: agenda }));
    openFromRow("schedule");
    const view = screen.getByRole("button", { name: /view agenda/i });
    view.focus();
    fireEvent.click(view);
    const viewer = screen.getByTestId("agenda-sheet");
    expect(viewer.contains(document.activeElement), "PREMISE: focus is in the viewer").toBe(true);
    rerender(controller({ schedule: <div data-testid="body-schedule">schedule</div> }));
    expect(viewer.isConnected, "PREMISE: the viewer left with its owner").toBe(false);
    await settle();
    expectFocusInSheet("agenda owner removed");
  });

  it("removing the gallery while its lightbox is open keeps focus in the sheet", async () => {
    const props: ComponentProps<typeof GalleryLightbox> = {
      showId: SHOW_ID,
      snapshotRevisionId: "22222222-2222-4222-8222-222222222222",
      items: [
        {
          id: "embedded:obj-1",
          key: "embedded-obj-1.png",
          alt: "Diagram 1",
          available: true,
          variants: [{ width: 256, key: "embedded-obj-1.png@256.webp" }],
        },
      ],
      startIndex: 0,
      onClose: () => {},
    };
    const gallery = (
      <div data-testid="body-gear">
        <GalleryLightbox {...props} />
      </div>
    );
    const { rerender } = render(controller({ gear: gallery }));
    openFromRow("gear");
    const lightbox = screen.getAllByRole("dialog").find((d) => d.getAttribute("aria-label"))!;
    expect(lightbox, "PREMISE: the lightbox is open").toBeTruthy();
    expect(lightbox.contains(document.activeElement), "PREMISE: focus is in the lightbox").toBe(
      true,
    );
    rerender(controller({ gear: <div data-testid="body-gear">gear</div> }));
    expect(lightbox.isConnected, "PREMISE: the lightbox left with the gallery").toBe(false);
    await settle();
    expectFocusInSheet("gallery removed");
  });

  it("removing a report card while its report modal is open keeps focus in the sheet", async () => {
    const card = (
      <div data-testid="body-travel">
        <CardReportTrigger cardId="travel-hotels" region="hotels" showId={SHOW_ID} />
      </div>
    );
    const { rerender } = render(controller({ travel: card }));
    openFromRow("travel");
    const trigger = screen.getByTestId("card-report-trigger");
    trigger.focus();
    fireEvent.click(trigger);
    const modal = screen.getByTestId("report-modal-submit").closest('[aria-modal="true"]')!;
    expect(modal, "PREMISE: the report modal is open").not.toBeNull();
    expect(modal.contains(document.activeElement), "PREMISE: focus is in the modal").toBe(true);
    rerender(controller({ travel: <div data-testid="body-travel">travel</div> }));
    expect(modal.isConnected, "PREMISE: the modal left with its card").toBe(false);
    await settle();
    expectFocusInSheet("report card removed");
  });
});
