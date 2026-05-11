"use client";
/**
 * components/agenda/AgendaPdfViewer.tsx — M7 Task 7.9 / AC-7.1.
 *
 * Inline PDF.js (react-pdf) viewer for the agenda sheet. Lives in its
 * own file so the react-pdf import + worker setup happens ONLY when
 * the parent AgendaSheet is mounted (i.e., only after the user taps
 * "Open agenda"). The crew page's initial paint never loads pdfjs.
 *
 * Quality contracts (M7 §12 audit close-out):
 *
 *   - **Container-driven width.** A `ResizeObserver` on the viewer
 *     wrapper tracks the actual available width so rotating the phone
 *     or resizing the sheet reflows pages cleanly. The previous
 *     `window.innerWidth - 32` math went stale on rotate AND was off
 *     by the 32px of inner padding the sheet's body carries.
 *   - **Windowed render.** Only the active page (and one neighbor on
 *     each side) renders the heavy text + annotation layers; the rest
 *     get a canvas-only render so a 40-page run-of-show book doesn't
 *     instantiate 40 text-layer DOM trees on first paint. Page
 *     activation comes from `IntersectionObserver` so the user always
 *     gets the rich text layer for the page they're looking at.
 *   - **Page counter.** Sticky `Page X of Y` indicator at the top of
 *     the viewer so crew know their position in long agendas.
 *   - **Auto-dark.** Pages auto-invert under `prefers-color-scheme:
 *     dark` so a 1am backstage view doesn't blast white paper at the
 *     crew member's face. A toggle in the header lets crew flip back
 *     to original colors when the auto-invert breaks a color chart.
 *   - **aria-live.** The loading and error states are announced.
 *   - **Worker setup.** Canonical react-pdf v10 recipe via
 *     `import.meta.url` so Turbopack/webpack bundle the worker file
 *     alongside the page chunk — no CDN dependency.
 */
import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Moon, Sun } from "lucide-react";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type AgendaPdfViewerProps = {
  /** Proxy URL `/api/asset/agenda/<show>/<fileId>` — never a Drive host. */
  src: string;
};

const MAX_PAGE_WIDTH = 800;
const ACTIVE_WINDOW = 1; // render rich layers for active page ± this many

function prefersDarkAtMount(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AgendaPdfViewer({ src }: AgendaPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [containerWidth, setContainerWidth] = useState<number>(MAX_PAGE_WIDTH);
  const [error, setError] = useState<Error | null>(null);
  const [inverted, setInverted] = useState(prefersDarkAtMount);

  // Track the parent container's actual width via ResizeObserver. The
  // dependency array is empty because we want to attach once on mount;
  // the observer fires on every resize after.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => setContainerWidth(Math.min(node.clientWidth, MAX_PAGE_WIDTH));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // IntersectionObserver to track the active page. The threshold-50%
  // policy means a page becomes "active" once half of it is in the
  // scroll viewport — single source of truth for the page counter
  // AND the windowed-render gate.
  useEffect(() => {
    if (numPages === null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = pageRefs.current.findIndex((node) => node === entry.target);
          if (idx >= 0) setActivePage(idx + 1);
        }
      },
      { threshold: 0.5 },
    );
    for (const node of pageRefs.current) {
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, [numPages]);

  // Reflect the prefers-color-scheme change while the sheet is open so
  // the page invert toggles automatically. Manual toggle still overrides
  // until the sheet closes (mount-scope state).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setInverted(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return (
    <div ref={containerRef} className="flex w-full max-w-3xl flex-col items-center px-2 sm:px-4">
      {numPages !== null && !error ? (
        <div className="sticky top-0 z-10 mb-3 flex w-full items-center justify-between rounded-sm border border-border bg-surface px-3 py-2 shadow-(--shadow-tile)">
          <span className="text-sm font-medium tabular-nums text-text-strong">
            Page <span data-testid="agenda-active-page">{activePage}</span> of {numPages}
          </span>
          <button
            type="button"
            onClick={() => setInverted((prev) => !prev)}
            aria-pressed={inverted}
            aria-label={inverted ? "Show original colors" : "Dim agenda for dark mode"}
            className="inline-flex min-h-tap-min items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium text-text-subtle hover:bg-surface-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            {inverted ? (
              <>
                <Sun aria-hidden="true" className="size-4" /> Original
              </>
            ) : (
              <>
                <Moon aria-hidden="true" className="size-4" /> Dim
              </>
            )}
          </button>
        </div>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 py-8 text-text-subtle"
        >
          <p className="text-sm">Couldn&rsquo;t open the agenda right now.</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNumPages(null);
            }}
            className="min-h-tap-min rounded-sm border border-border bg-surface px-3 py-2 text-sm font-medium text-text-strong hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <Document
          file={src}
          onLoadSuccess={(pdf: { numPages: number }) => {
            setNumPages(pdf.numPages);
            pageRefs.current = new Array(pdf.numPages).fill(null);
          }}
          onLoadError={(err: Error) => setError(err)}
          loading={
            <div role="status" aria-live="polite" className="py-8 text-sm text-text-subtle">
              Loading agenda…
            </div>
          }
          className="flex w-full flex-col items-center"
        >
          {numPages !== null
            ? Array.from({ length: numPages }, (_v, i) => {
                const pageNumber = i + 1;
                const isRich = Math.abs(pageNumber - activePage) <= ACTIVE_WINDOW;
                return (
                  <div
                    key={`page-${pageNumber}`}
                    ref={(node) => {
                      pageRefs.current[i] = node;
                    }}
                    data-page={pageNumber}
                    className={`mb-4 ${inverted ? "filter-[invert(1)_hue-rotate(180deg)]" : ""}`}
                  >
                    <Page
                      pageNumber={pageNumber}
                      width={containerWidth}
                      renderTextLayer={isRich}
                      renderAnnotationLayer={isRich}
                    />
                  </div>
                );
              })
            : null}
        </Document>
      )}
    </div>
  );
}
