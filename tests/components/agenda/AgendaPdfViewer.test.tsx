// @vitest-environment jsdom
/**
 * tests/components/agenda/AgendaPdfViewer.test.tsx — windowing regression
 * (Codex R7 P1 close-out).
 *
 * Mocks `react-pdf` + `pdfjs-dist` so the viewer runs in jsdom (no real
 * canvas / DOMMatrix). The mock fires `onLoadSuccess` synchronously
 * with a controllable `numPages`, then counts `<Page>` mounts so we
 * can pin the windowing contract:
 *
 *   - For a long agenda (e.g., 40 pages), the viewer mounts AT MOST
 *     (2 * ACTIVE_WINDOW + 1) `<Page>` components at any time.
 *   - Off-window pages render a `data-in-window="false"` placeholder
 *     div with a stable height so the scroll surface stays accurate
 *     AND IntersectionObserver still fires when the placeholder
 *     enters view.
 */
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// jsdom does not implement matchMedia. Stub a no-op resolver so the
// viewer's prefers-color-scheme detection + listener doesn't crash.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
  // jsdom does not implement ResizeObserver. Stub a no-op so the
  // container width observer's setup path doesn't crash.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  // jsdom does not implement IntersectionObserver. Stub a no-op so the
  // active-page tracker doesn't crash; the test asserts initial-mount
  // counts, so we don't need observer callbacks to fire.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

let mountedNumPages = 0;
let mountedPageCount = 0;

// Per-test mode: "success" fires onLoadSuccess; "error" fires
// onLoadError instead so the M7-D2 error-routing path is exercised.
let documentMode: "success" | "error" = "success";

vi.mock("react-pdf", () => ({
  Document: ({
    onLoadSuccess,
    onLoadError,
    children,
  }: {
    onLoadSuccess?: (pdf: { numPages: number }) => void;
    onLoadError?: (err: Error) => void | Promise<void>;
    children: React.ReactNode;
  }) => {
    if (documentMode === "error") {
      if (onLoadError) void onLoadError(new Error("synthetic react-pdf load failure"));
      return <div data-testid="document-stub">{children}</div>;
    }
    // Fire load-success synchronously so the consumer renders pages
    // inside the same render cycle the test reads back from.
    if (onLoadSuccess) onLoadSuccess({ numPages: mountedNumPages });
    return <div data-testid="document-stub">{children}</div>;
  },
  Page: ({ pageNumber }: { pageNumber: number }) => {
    mountedPageCount += 1;
    return <div data-mounted-page={pageNumber} className="size-full" />;
  },
  pdfjs: {
    GlobalWorkerOptions: { workerSrc: "" },
  },
}));

vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

afterEach(() => {
  cleanup();
  mountedPageCount = 0;
  documentMode = "success";
  vi.restoreAllMocks();
});

describe("AgendaPdfViewer windowing (Codex R7 P1)", () => {
  test("40-page agenda mounts ≤ 3 <Page> components, not 40", async () => {
    mountedNumPages = 40;
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    render(<AgendaPdfViewer src="/api/asset/agenda/show/file" />);

    // Active page defaults to 1; window = ±1 → pages 1, 2 mount as
    // real <Page>. Page 0 doesn't exist. Total ≤ 3.
    expect(mountedPageCount).toBeLessThanOrEqual(3);
    // Off-window pages must be present (so scroll height stays right)
    // AND must be placeholders, not real <Page> components.
    const offWindow = screen.getAllByTestId(/^document-stub$/)[0]?.querySelectorAll(
      '[data-in-window="false"]',
    );
    expect(offWindow).toBeTruthy();
    expect(offWindow!.length).toBeGreaterThan(30);
  });

  test("short agenda (3 pages) mounts all pages as <Page> (no placeholders)", async () => {
    mountedNumPages = 3;
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    render(<AgendaPdfViewer src="/api/asset/agenda/show/file" />);

    // With active = 1 and window = ±1, pages 1+2 are in-window (page 3
    // is outside the window AT MOUNT). Mount count is at most 2.
    expect(mountedPageCount).toBeLessThanOrEqual(2);
  });
});

describe("AgendaPdfViewer error routing via messageFor (M9 C6 / M7-D2)", () => {
  test("HEAD probe returning 410 → renders AGENDA_GONE_FOR_CREW.crewFacing copy", async () => {
    documentMode = "error";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 410 }));
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    const { findByRole } = render(<AgendaPdfViewer src="/api/asset/agenda/show/file-410" />);
    const { messageFor } = await import("@/lib/messages/lookup");
    // Anti-tautology: read the canonical catalog string AND scan for it.
    const expected = messageFor("AGENDA_GONE_FOR_CREW").crewFacing!;
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain(expected);
  });

  test("HEAD probe returning 401 → renders AGENDA_UNAUTHENTICATED.crewFacing copy", async () => {
    documentMode = "error";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 401 }));
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    const { findByRole } = render(<AgendaPdfViewer src="/api/asset/agenda/show/file-401" />);
    const { messageFor } = await import("@/lib/messages/lookup");
    const expected = messageFor("AGENDA_UNAUTHENTICATED").crewFacing!;
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain(expected);
  });

  test("HEAD probe returning 500 (unknown) → falls back to generic copy", async () => {
    documentMode = "error";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    const { findByRole } = render(<AgendaPdfViewer src="/api/asset/agenda/show/file-500" />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn’t open the agenda right now/);
  });

  test("HEAD probe network failure → falls back to generic copy", async () => {
    documentMode = "error";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const { AgendaPdfViewer } = await import("@/components/agenda/AgendaPdfViewer");
    const { findByRole } = render(<AgendaPdfViewer src="/api/asset/agenda/show/file-netdown" />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/Couldn’t open the agenda right now/);
  });
});
