// @vitest-environment jsdom
/**
 * tests/components/offline/savedCopySheetMarker.test.tsx: the saved-copy bar's
 * URL correction keeps the section sheet's history marker (Codex review of the
 * origin/main merge, M1-1; crew page redesign spec §5.2, the close rows).
 *
 * A saved copy can render a different section from the one the URL asks for:
 * saved at `?s=venue`, closed to home, Gear opened (pushed with the `crewSheet`
 * marker), then reloaded with no signal. The bar puts the rendered section in
 * the URL (spec 4.7.4). It did so with `replaceState(null, …)`, which erased the
 * marker before CrewSections read it, so closing the saved Venue replaced the
 * entry instead of going Back: two home entries, and close then Forward broken.
 *
 * The real SavedCopyBar and the real CrewSections mount in the shell's order
 * (the slot before the controller, app/show/[slug]/[shareToken]/_CrewShell.tsx),
 * under each served condition that rewrites the URL.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/offline/client/reload", () => ({ reloadPage: vi.fn() }));
vi.mock("@/lib/offline/client/messaging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/offline/client/messaging")>()),
  postToWorker: vi.fn(async () => ({ outcome: "failed" })),
}));

const nav = vi.hoisted(() => ({ pathname: "/show/demo-show/abc123" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

import { CrewSections } from "@/components/crew/CrewSections";
import { SavedCopyBar } from "@/components/offline/SavedCopyBar";
import { CREW_SECTION_LABELS, type CrewSectionId } from "@/lib/crew/crewSections";

const PATH = "/show/demo-show/abc123";
const SAVED_AT = "2026-10-27T11:30:00.000Z";
const SECTIONS: CrewSectionId[] = ["schedule", "venue", "travel", "crew", "gear"];
/** Next's own history keys, as its patched history leaves them on an entry. */
const NEXT_STATE = { __NA: true, _N: 1, __PRIVATE_NEXTJS_INTERNALS_TREE: {} };

function setServedMeta(content: string): void {
  for (const meta of document.head.querySelectorAll('meta[name="fxav-served"]')) meta.remove();
  const meta = document.createElement("meta");
  meta.setAttribute("name", "fxav-served");
  meta.setAttribute("content", content);
  meta.setAttribute("data-saved-at", SAVED_AT);
  document.head.appendChild(meta);
}

beforeEach(() => {
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
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const meta of document.head.querySelectorAll('meta[name="fxav-served"]')) meta.remove();
  document.body.style.overflow = "";
  History.prototype.replaceState.call(window.history, null, "", PATH);
});

/** The saved copy: rendered at Venue, served under `mode`, reloaded on the entry Gear was pushed on. */
function renderSavedVenueOnGearEntry(mode: string) {
  History.prototype.replaceState.call(
    window.history,
    { ...NEXT_STATE, crewSheet: true, keep: "x" },
    "",
    `${PATH}?s=gear&gate=skip`,
  );
  setServedMeta(mode);
  const replace = vi.spyOn(window.history, "replaceState");
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  render(
    <>
      <SavedCopyBar
        renderedAt="2026-10-27T11:29:00.000Z"
        sheetUnavailable={false}
        slug="demo-show"
        shareToken="abc123"
      />
      <CrewSections
        initialSection="venue"
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
        }}
      />
    </>,
  );
  return { replace, back };
}

const CLOSES = {
  "the close button": () =>
    fireEvent.click(
      screen.getByRole("button", { name: `Close ${CREW_SECTION_LABELS.venue.toLowerCase()}` }),
    ),
  "the scrim": () => fireEvent.click(screen.getByTestId("crew-section-sheet-scrim")),
  Escape: () => fireEvent.keyDown(document, { key: "Escape" }),
} as const;

describe("the saved-copy URL correction keeps the sheet's history marker (M1-1)", () => {
  for (const mode of ["offline", "slow", "server-error", "ended"]) {
    for (const [path, close] of Object.entries(CLOSES)) {
      test(`served ${mode}: the URL names the saved Venue, the marker survives, and closing with ${path} goes Back`, () => {
        const { replace, back } = renderSavedVenueOnGearEntry(mode);
        // PREMISE: the saved copy opened Venue's sheet on Gear's entry.
        expect(screen.getByTestId("crew-section-sheet-dialog")).toHaveAttribute(
          "data-section",
          "venue",
        );
        // The correction: only the URL changes; the page's own keys stay, and
        // Next's are left for its patched history to copy back (no Next key in
        // the state handed over, or the router would not follow the URL).
        expect(window.location.search).toBe("?s=venue&gate=skip");
        const [state] = replace.mock.calls[0]!;
        expect(state).toEqual({ crewSheet: true, keep: "x" });
        expect((window.history.state as { crewSheet?: boolean } | null)?.crewSheet).toBe(true);

        close();
        expect(back, "the close goes Back to the entry beneath").toHaveBeenCalledTimes(1);
        expect(replace, "and does not replace the entry").toHaveBeenCalledTimes(1);
      });
    }
  }
});
