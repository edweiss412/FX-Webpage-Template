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
 *   - **Windowed render (Codex R7 P1).** Only the active page (and one
 *     neighbor on each side) mounts a real `react-pdf` `<Page>` — the
 *     rest render a stable-height placeholder div so the scroll
 *     surface stays accurate AND the IntersectionObserver still fires.
 *     A 40-page run-of-show book therefore paints at most three PDF
 *     canvases at any time, not 40. The placeholder height starts at a
 *     letter-paper ratio and updates to the first measured `<Page>`'s
 *     height as soon as it renders. Page activation comes from
 *     `IntersectionObserver` so the user always gets the rich rendered
 *     page they're looking at within ±1 of the scroll position.
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

import { messageFor, type MessageCode } from "@/lib/messages/lookup";

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

// Letter-paper aspect ratio (11 / 8.5) is a reasonable default
// placeholder height per page before the first `<Page>` reports its
// rendered viewport. Once the first page renders, `pageHeight` switches
// to the measured value so the scroll surface stays accurate for
// off-window placeholders.
const LETTER_RATIO = 11 / 8.5;

export function AgendaPdfViewer({ src }: AgendaPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [containerWidth, setContainerWidth] = useState<number>(MAX_PAGE_WIDTH);
  const [pageHeight, setPageHeight] = useState<number>(
    Math.round(MAX_PAGE_WIDTH * LETTER_RATIO),
  );
  const [error, setError] = useState<Error | null>(null);
  // M9 C6 / M7-D2: surface the proxy's status code through the §12.4
  // catalog so Doug's 410 (agenda gone) and 401 (link expired)
  // failures render their canonical crewFacing copy. react-pdf's
  // onLoadError event doesn't expose the underlying HTTP status, so
  // we HEAD-fetch the same `src` URL after a load failure to
  // determine which catalog code applies. Default: generic load
  // failure (the existing "Couldn't open" copy, kept as the fallback
  // when the HEAD probe itself fails or returns an unexpected code).
  const [errorCode, setErrorCode] = useState<MessageCode | null>(null);
  const [inverted, setInverted] = useState(prefersDarkAtMount);

  // Track the parent container's actual width via ResizeObserver. The
  // dependency array is empty because we want to attach once on mount;
  // the observer fires on every resize after.
  // Codex R13 P2: track the PREVIOUS actual width in a ref so the
  // placeholder-height ratio calculation always uses the last observed
  // width — not the mount-time `containerWidth` state captured by the
  // effect closure. Without this, a rotation/sheet-resize made the
  // ratio compute `prev / staleWidth`, distorting placeholder heights
  // and breaking the windowing scroll/IO contract.
  const prevWidthRef = useRef<number>(MAX_PAGE_WIDTH);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const w = Math.min(node.clientWidth, MAX_PAGE_WIDTH);
      setContainerWidth(w);
      // Rescale the placeholder height proportionally. The ratio uses
      // the LAST observed width (from the ref), not the closure-time
      // state. After update, the ref advances to the new width so the
      // next resize event computes from current.
      setPageHeight((prev) => {
        const baseWidth = prevWidthRef.current;
        const ratio = prev > 0 && baseWidth > 0 ? prev / baseWidth : LETTER_RATIO;
        return Math.round(w * ratio);
      });
      prevWidthRef.current = w;
    };
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
          <p className="text-sm">
            {/*
              Always catalog-bound. Before the HEAD probe settles
              errorCode is null; we render AGENDA_ASSET_LOOKUP_FAILED's
              crew copy as the catalog-bound default so the alert
              never contains an inline literal even momentarily
              (M9 C6 R2 finding). Once the probe resolves errorCode
              switches to AGENDA_GONE_FOR_CREW / AGENDA_UNAUTHENTICATED
              for the recoverable variants.
            */}
            {messageFor(errorCode ?? "AGENDA_ASSET_LOOKUP_FAILED").crewFacing}
          </p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setErrorCode(null);
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
          onLoadError={async (err: Error) => {
            setError(err);
            // Derive a catalog code from the proxy's actual HTTP status.
            // react-pdf swallows the status before it reaches onLoadError,
            // so we re-probe with a HEAD request to the same URL.
            try {
              const probe = await fetch(src, { method: "HEAD", cache: "no-store" });
              // Spec §12.4 line 2753: BOTH 410 AND 403 route to
              // AGENDA_GONE_FOR_CREW. 403 fires from cross-show or
              // otherwise-forbidden crew sessions (the agenda proxy's
              // picker asset-session forbidden paths); the
              // crew-facing recovery is the same as for a 410 (the
              // agenda is unreachable from this picker session; ask Doug
              // for a fresh one).
              if (probe.status === 410 || probe.status === 403) {
                setErrorCode("AGENDA_GONE_FOR_CREW");
              } else if (probe.status === 401) {
                setErrorCode("AGENDA_UNAUTHENTICATED");
              } else {
                // Other status (typically 5xx) — retryable. Route
                // through AGENDA_ASSET_LOOKUP_FAILED so Doug sees
                // catalog-bound recovery copy instead of an inline
                // literal.
                setErrorCode("AGENDA_ASSET_LOOKUP_FAILED");
              }
            } catch {
              // HEAD probe itself failed (network). Treat as retryable
              // — same catalog code as the 5xx path.
              setErrorCode("AGENDA_ASSET_LOOKUP_FAILED");
            }
          }}
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
                const inWindow = Math.abs(pageNumber - activePage) <= ACTIVE_WINDOW;
                return (
                  <div
                    key={`page-${pageNumber}`}
                    ref={(node) => {
                      pageRefs.current[i] = node;
                    }}
                    data-page={pageNumber}
                    data-in-window={inWindow ? "true" : "false"}
                    className={`mb-4 ${inverted ? "filter-[invert(1)_hue-rotate(180deg)]" : ""}`}
                    style={inWindow ? undefined : { width: containerWidth, height: pageHeight }}
                  >
                    {inWindow ? (
                      <Page
                        pageNumber={pageNumber}
                        width={containerWidth}
                        renderTextLayer
                        renderAnnotationLayer
                        onRenderSuccess={(page: { height: number }) => {
                          if (page?.height && Math.abs(page.height - pageHeight) > 1) {
                            setPageHeight(page.height);
                          }
                        }}
                      />
                    ) : (
                      // Codex R7 P1: off-window pages must NOT mount a
                      // react-pdf `<Page>` — the canvas render fires
                      // regardless of `renderTextLayer/renderAnnotationLayer`
                      // gating, so a 40-page PDF would otherwise paint 40
                      // canvases on open. Render a stable-height
                      // placeholder so scroll position + IntersectionObserver
                      // still work; swap to a real `<Page>` once this slot
                      // enters the active window.
                      <div
                        aria-hidden="true"
                        className="size-full rounded-sm bg-surface-sunken"
                      />
                    )}
                  </div>
                );
              })
            : null}
        </Document>
      )}
    </div>
  );
}
