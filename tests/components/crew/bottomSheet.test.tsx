// @vitest-environment jsdom
/**
 * tests/components/crew/bottomSheet.test.tsx: the crew section sheet's modal
 * behavior (crew page redesign spec §5.2, §9.4).
 *
 * The sheet is the compact page's way to open a section. These cases pin what
 * makes it a modal dialog rather than a panel that happens to overlap the page:
 * `role="dialog"` + `aria-modal` + `aria-labelledby` its title, focus to the
 * title on open and back to the opener on close, Tab kept inside, the page
 * behind `inert`, body scroll locked, one `onRequestClose` for every close path,
 * and those paths ignored while another `aria-modal="true"` dialog is open.
 *
 * jsdom has no layout, so `offsetParent` is null for every element and the
 * shared focus trap (`lib/a11y/dialogFocus.ts`) would see no focusable at all;
 * the trap case stubs `offsetParent` to the parent node so the trap's own
 * filter runs on real candidates.
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CrewSectionSheet } from "@/components/crew/CrewSectionSheet";
import { DRAG_DISMISS_THRESHOLD_PX, DRAG_SLOP_PX } from "@/components/shared/sheetConstants";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";

const VENUE = { id: "venue" as const, label: CREW_SECTION_LABELS.venue };
const CREW = { id: "crew" as const, label: CREW_SECTION_LABELS.crew };

function stubMatchMedia({ reduced }: { reduced: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

beforeEach(() => {
  // Reduced motion: the exit runs at 0ms, so a close settles without waiting
  // on framer's frame loop.
  stubMatchMedia({ reduced: true });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.style.overflow = "";
});

/** A page with an opener outside the sheet, the way the home's list row sits behind it. */
function Page({
  initial = null,
  modal = true,
  onRequestClose,
  fallbackFocus,
  children,
}: {
  initial?: typeof VENUE | null;
  modal?: boolean;
  onRequestClose?: () => void;
  fallbackFocus?: (id: CrewSectionId) => HTMLElement | null;
  children?: ReactNode;
}) {
  const [section, setSection] = useState<typeof VENUE | typeof CREW | null>(initial);
  return (
    <div>
      <main data-testid="behind">
        <button type="button" data-testid="opener" onClick={() => setSection(VENUE)}>
          Open venue
        </button>
        <button type="button" data-testid="opener-crew" onClick={() => setSection(CREW)}>
          Open crew
        </button>
        <a href="?s=venue" data-testid="row-venue">
          Venue
        </a>
      </main>
      <CrewSectionSheet
        section={section}
        modal={modal}
        fallbackFocus={fallbackFocus}
        onRequestClose={() => {
          onRequestClose?.();
          setSection(null);
        }}
      >
        {children ?? (
          <div data-testid="sheet-content">
            <a href="#first" data-testid="first-link">
              First
            </a>
            <a href="#last" data-testid="last-link">
              Last
            </a>
          </div>
        )}
      </CrewSectionSheet>
    </div>
  );
}

function dialog(): HTMLElement {
  return screen.getByRole("dialog");
}

describe("CrewSectionSheet (spec §5.2)", () => {
  it("sheet: renders a modal dialog labelled by its title, which is the section label", () => {
    render(<Page initial={VENUE} />);
    const d = dialog();
    expect(d).toHaveAttribute("aria-modal", "true");
    const titleId = d.getAttribute("aria-labelledby");
    expect(titleId, "aria-labelledby").toBeTruthy();
    const title = document.getElementById(titleId!);
    expect(title).not.toBeNull();
    expect(title!.textContent).toBe(VENUE.label);
    expect(d).toHaveAttribute("data-section", VENUE.id);
  });

  it("sheet: the close button is named Close plus the section name (spec §9.4)", () => {
    render(<Page initial={VENUE} />);
    expect(
      screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }),
    ).toBeInTheDocument();
  });

  it("sheet: focus moves to the title on open and back to the opener on close", async () => {
    render(<Page />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    const titleId = dialog().getAttribute("aria-labelledby")!;
    expect(document.activeElement).toBe(document.getElementById(titleId));

    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    await act(async () => {});
    // Focus is back before the exit slide finishes: the page is live at once.
    expect(document.activeElement).toBe(opener);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("sheet: with no opener (a deep link), close focuses the owner's fallback for the open section", async () => {
    const asked: CrewSectionId[] = [];
    render(
      <Page
        initial={VENUE}
        fallbackFocus={(id) => {
          asked.push(id);
          return screen.getByTestId(`row-${id}`);
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    await act(async () => {});
    expect(asked).toContain(VENUE.id);
    expect(document.activeElement).toBe(screen.getByTestId("row-venue"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(screen.getByTestId("row-venue"));
  });

  it("sheet: an opener that is still on the page wins over the fallback", async () => {
    const fallback = vi.fn(() => screen.getByTestId("row-venue"));
    render(<Page fallbackFocus={fallback} />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    await act(async () => {});
    expect(document.activeElement).toBe(opener);
  });

  it("sheet: Tab from the last control wraps to the first and stays inside", () => {
    // Real candidates for the trap's offsetParent filter (jsdom computes no layout).
    vi.spyOn(HTMLElement.prototype, "offsetParent", "get").mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.parentElement;
    });
    render(<Page initial={VENUE} />);
    const close = screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` });
    const last = screen.getByTestId("last-link");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("sheet: the page behind is inert while open and restored on close", async () => {
    render(<Page />);
    const behind = screen.getByTestId("behind");
    expect(behind.closest("[inert]")).toBeNull();
    fireEvent.click(screen.getByTestId("opener"));
    expect(behind.closest("[inert]")).not.toBeNull();
    // The sheet itself is never inside an inert subtree.
    expect(dialog().closest("[inert]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    await act(async () => {});
    expect(behind.closest("[inert]")).toBeNull();
  });

  it("sheet: the inert sweep leaves Next's route announcer live (audit P3-5)", () => {
    // Next mounts `<next-route-announcer>` as a child of <body>, a sibling of the
    // app root, so the sweep reaches it. Inerting it drops it from the
    // accessibility tree, and a navigation started from inside the sheet would be
    // announced into nothing.
    const announcer = document.createElement("next-route-announcer");
    document.body.appendChild(announcer);
    try {
      render(<Page initial={VENUE} />);
      // The sweep ran: the page behind is inert, so the announcer's exemption is
      // a choice the sweep made, not a sweep that never reached it.
      expect(screen.getByTestId("behind").closest("[inert]")).not.toBeNull();
      expect(announcer.hasAttribute("inert")).toBe(false);
    } finally {
      announcer.remove();
    }
  });

  it("sheet: the panel paints the raised surface, and the close ring's offset matches it (critique F14)", () => {
    // Dark mode has one step between `surface` and `surface-raised`; on
    // `bg-surface` the panel matched the cards behind the scrim and had no lift.
    // The close button's ring offset paints the panel's ground, so it names the
    // same token or the ring shows a stripe of the wrong colour.
    render(<Page initial={VENUE} />);
    const panel = screen.getByTestId("crew-section-sheet-panel");
    expect(panel.className.split(/\s+/)).toContain("bg-surface-raised");
    expect(panel.className.split(/\s+/)).not.toContain("bg-surface");
    const close = screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` });
    expect(close.className.split(/\s+/)).toContain("focus-visible:ring-offset-surface-raised");
  });

  it("sheet: body scroll is locked while open and restored on close", async () => {
    document.body.style.overflow = "scroll";
    render(<Page />);
    fireEvent.click(screen.getByTestId("opener"));
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    await act(async () => {});
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("sheet: switching sections keeps one dialog and does not re-run the open", () => {
    render(<Page />);
    const opener = screen.getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    const first = dialog();
    fireEvent.click(screen.getByTestId("opener-crew"));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(dialog()).toBe(first);
    expect(dialog()).toHaveAttribute("data-section", CREW.id);
    const titleId = dialog().getAttribute("aria-labelledby")!;
    expect(document.getElementById(titleId)!.textContent).toBe(CREW.label);
  });

  it("sheet: the close button, the scrim and Esc each request one close", () => {
    for (const path of ["button", "scrim", "esc"] as const) {
      const onRequestClose = vi.fn();
      const { unmount } = render(<Page initial={VENUE} onRequestClose={onRequestClose} />);
      if (path === "button") {
        fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
      } else if (path === "scrim") {
        fireEvent.click(screen.getByTestId("crew-section-sheet-scrim"));
      } else {
        fireEvent.keyDown(document, { key: "Escape" });
      }
      expect(onRequestClose, path).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it("sheet: Esc and the scrim are ignored while another aria-modal dialog is open", () => {
    const onRequestClose = vi.fn();
    render(
      <Page initial={VENUE} onRequestClose={onRequestClose}>
        <div role="dialog" aria-modal="true" aria-label="Agenda" data-testid="nested" />
      </Page>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByTestId("crew-section-sheet-scrim"));
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("sheet: a drag released past the threshold requests close; a shorter drag does not", () => {
    const onRequestClose = vi.fn();
    render(<Page initial={VENUE} onRequestClose={onRequestClose} />);
    const grab = screen.getByTestId("crew-section-sheet-grab");

    // Shorter than the threshold, longer than the slop: a drag that springs back.
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX - 10 });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX - 10 });
    expect(onRequestClose).not.toHaveBeenCalled();
    expect(DRAG_DISMISS_THRESHOLD_PX - 10).toBeGreaterThan(DRAG_SLOP_PX);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.pointerDown(grab, { pointerId: 2, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 2, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 10 });
    fireEvent.pointerUp(grab, { pointerId: 2, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 10 });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
  });

  it("sheet: a swipe is ignored while another aria-modal dialog is open", () => {
    const onRequestClose = vi.fn();
    render(
      <Page initial={VENUE} onRequestClose={onRequestClose}>
        <div role="dialog" aria-modal="true" aria-label="Diagram" />
      </Page>,
    );
    const grab = screen.getByTestId("crew-section-sheet-grab");
    fireEvent.pointerDown(grab, { pointerId: 3, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 3, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 40 });
    fireEvent.pointerUp(grab, { pointerId: 3, clientY: 100 + DRAG_DISMISS_THRESHOLD_PX + 40 });
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  it("sheet: with modal off (server render, wide layout) nothing is inert or locked", () => {
    document.body.style.overflow = "";
    render(<Page initial={VENUE} modal={false} />);
    expect(screen.getByTestId("behind").closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });
});

describe("CrewSectionSheet, compound: open another section while a close is still sliding out (spec §7)", () => {
  /**
   * A sheet whose body is its section's, the way the controller hands it
   * `sectionNodes[open]`: the title and the body both come from the open section,
   * so any frame that shows one section's title over another's body is the
   * defect (critique F4).
   */
  function SwitchingPage() {
    const [section, setSection] = useState<typeof VENUE | typeof CREW | null>(VENUE);
    return (
      <div>
        <main data-testid="behind">
          <button type="button" data-testid="open-crew" onClick={() => setSection(CREW)}>
            Open crew
          </button>
        </main>
        <CrewSectionSheet section={section} modal onRequestClose={() => setSection(null)}>
          {section === null ? null : <p data-testid={`body-${section.id}`}>{section.label}</p>}
        </CrewSectionSheet>
      </div>
    );
  }

  const frames = () =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid="crew-section-sheet-dialog"]'));

  it("sheet: opening B during A's exit shows B's title over B's body, with A's frame gone", async () => {
    // Motion on, so the close leaves a departing frame behind for the length of
    // its slide: that window is the one this case opens B inside.
    stubMatchMedia({ reduced: false });
    render(<SwitchingPage />);
    fireEvent.click(screen.getByRole("button", { name: `Close ${VENUE.label.toLowerCase()}` }));
    // The premise: A is still sliding out, so the next open lands mid-exit.
    expect(frames(), "the close left no departing frame, so nothing is mid-exit").toHaveLength(1);
    expect(frames()[0]).toHaveAttribute("data-section", VENUE.id);

    fireEvent.click(screen.getByTestId("open-crew"));

    // One frame, and everything in it is B's.
    expect(frames()).toHaveLength(1);
    const frame = frames()[0]!;
    expect(frame).toHaveAttribute("data-section", CREW.id);
    const title = document.getElementById(frame.getAttribute("aria-labelledby")!);
    expect(title?.textContent).toBe(CREW.label);
    expect(within(frame).queryByTestId(`body-${VENUE.id}`)).toBeNull();
    expect(within(frame).getByTestId(`body-${CREW.id}`)).toBeInTheDocument();
    // And B's sheet arrives the way any open does: focus on its own title.
    expect(document.activeElement).toBe(title);
  });
});
