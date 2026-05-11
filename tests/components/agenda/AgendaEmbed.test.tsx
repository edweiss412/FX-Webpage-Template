// @vitest-environment jsdom
/**
 * tests/components/agenda/AgendaEmbed.test.tsx (M7 Task 7.9 / AC-7.1).
 *
 * Pins the AgendaEmbed's data → DOM contract. The PDF.js rendering
 * itself is exercised via Playwright (`tests/e2e/agenda-embed.spec.ts`)
 * — jsdom can't render canvas-backed PDF.js views. Here we focus on:
 *
 *   - The "Open agenda" affordance renders only when at least one
 *     agenda_links entry carries a Drive fileId (the proxy route's
 *     binding key).
 *   - The proxy URL is built as `/api/asset/agenda/<show>/<fileId>`
 *     with no Drive host or query suffix.
 *   - When no agenda link carries a fileId, the component returns
 *     null (whole-component-missing reflow).
 *   - Initial collapsed state: react-pdf NOT mounted (sheet closed).
 *     Tap on "Open agenda" sets the sheet open — the Dialog wrapper
 *     element is now present.
 *   - Crew DOM never carries `drive.google.com` substrings from
 *     AgendaEmbed itself (the URL builder lives in this component
 *     for the proxy path; no external Drive URL is rendered).
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// Mock the PDF.js viewer so jsdom never tries to load `react-pdf` /
// `pdfjs-dist` (which require DOMMatrix + a real canvas). The mock
// stubs the viewer with a marker element so we can verify the parent
// sheet mounts it; the real viewer is exercised in Playwright.
vi.mock("@/components/agenda/AgendaPdfViewer", () => ({
  AgendaPdfViewer: ({ src }: { src: string }) => (
    <div data-testid="agenda-pdf-viewer-stub" data-src={src} />
  ),
}));

import { AgendaEmbed } from "@/components/agenda/AgendaEmbed";

const SHOW_ID = "11111111-1111-4111-8111-111111111111";
const AGENDA_FILE_ID = "1AgendaFileId_abc-123";

afterEach(() => cleanup());

describe("AgendaEmbed", () => {
  test("renders 'Open agenda' affordance when at least one agenda_links entry carries fileId", () => {
    render(
      <AgendaEmbed
        showId={SHOW_ID}
        agendaLinks={[{ label: "Run-of-show", fileId: AGENDA_FILE_ID }]}
      />,
    );
    const btn = screen.getByRole("button", { name: /open agenda/i });
    expect(btn).toBeTruthy();
  });

  test("returns null when no agenda link has a fileId", () => {
    const { container } = render(
      <AgendaEmbed
        showId={SHOW_ID}
        agendaLinks={[{ label: "Agenda (link only)", url: "https://example.com/x" }]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  test("returns null when agendaLinks is empty", () => {
    const { container } = render(<AgendaEmbed showId={SHOW_ID} agendaLinks={[]} />);
    expect(container.firstChild).toBeNull();
  });

  test("clicking 'Open agenda' opens the sheet (data-testid present)", () => {
    render(
      <AgendaEmbed
        showId={SHOW_ID}
        agendaLinks={[{ label: "Run-of-show", fileId: AGENDA_FILE_ID }]}
      />,
    );
    expect(screen.queryByTestId("agenda-sheet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /open agenda/i }));
    expect(screen.getByTestId("agenda-sheet")).toBeTruthy();
  });

  test("AgendaEmbed crew DOM does NOT carry drive.google.com (proxy-route only)", () => {
    const { container } = render(
      <AgendaEmbed
        showId={SHOW_ID}
        agendaLinks={[{ label: "Run-of-show", fileId: AGENDA_FILE_ID }]}
      />,
    );
    expect(container.innerHTML).not.toContain("drive.google.com");
  });

  test("Sheet, when open, references /api/asset/agenda/<show>/<fileId>", () => {
    render(
      <AgendaEmbed
        showId={SHOW_ID}
        agendaLinks={[{ label: "Run-of-show", fileId: AGENDA_FILE_ID }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /open agenda/i }));
    // We assert the proxy URL is composed in the markup somewhere
    // inside the sheet — react-pdf's <Document file={...}> doesn't
    // render the URL into innerHTML directly, so we check the rendered
    // sheet container's data-pdf-src attribute (set by AgendaSheet).
    const sheet = screen.getByTestId("agenda-sheet");
    expect(sheet.getAttribute("data-pdf-src")).toBe(
      `/api/asset/agenda/${SHOW_ID}/${AGENDA_FILE_ID}`,
    );
  });
});
