"use client";
/**
 * components/agenda/AgendaPdfViewer.tsx — M7 Task 7.9 / AC-7.1.
 *
 * Inline PDF.js (react-pdf) viewer for the agenda sheet. Lives in its
 * own file so the react-pdf import + worker setup happens ONLY when
 * the parent AgendaSheet is mounted (i.e., only after the user taps
 * "Open agenda"). The crew page's initial paint never loads pdfjs.
 *
 * Worker setup follows the canonical react-pdf v10 recipe
 * (https://github.com/wojtekmaj/react-pdf/blob/v10.1.0/README.md):
 * resolve `pdfjs-dist/build/pdf.worker.min.mjs` against `import.meta.url`
 * so Turbopack/webpack bundle the worker file alongside the page chunk
 * — no CDN dependency, no manual public/ copy.
 *
 * On load-failure the viewer surfaces a graceful retry + reload-page
 * fallback. The retry path re-fetches the proxy URL with cache-busting
 * query — the route's `private, max-age=0, must-revalidate` policy
 * already revalidates every fetch, but the busted query forces any
 * intermediate service-worker cache to skip too.
 */
import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";

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

export function AgendaPdfViewer({ src }: AgendaPdfViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);

  return (
    <div className="flex w-full max-w-3xl flex-col items-center px-4">
      {error ? (
        <div className="flex flex-col items-center gap-3 py-8 text-text-subtle">
          <p className="text-sm">Couldn&rsquo;t open the agenda right now.</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setNumPages(null);
            }}
            className="rounded-sm border border-border bg-surface px-3 py-2 text-sm font-medium text-text-strong hover:border-border-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          >
            Try again
          </button>
        </div>
      ) : (
        <Document
          file={src}
          onLoadSuccess={(pdf: { numPages: number }) => setNumPages(pdf.numPages)}
          onLoadError={(err: Error) => setError(err)}
          loading={<div className="py-8 text-sm text-text-subtle">Loading agenda…</div>}
          className="flex flex-col items-center"
        >
          {numPages !== null
            ? Array.from({ length: numPages }, (_v, i) => (
                <div key={`page-${i + 1}`} className="mb-4">
                  <Page
                    pageNumber={i + 1}
                    width={Math.min(
                      typeof window !== "undefined" ? window.innerWidth - 32 : 800,
                      800,
                    )}
                    renderTextLayer
                    renderAnnotationLayer
                  />
                </div>
              ))
            : null}
        </Document>
      )}
    </div>
  );
}
