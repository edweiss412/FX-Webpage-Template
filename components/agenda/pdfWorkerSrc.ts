/**
 * components/agenda/pdfWorkerSrc.ts
 *
 * The pdf.js worker URL, computed once for every reader. AgendaPdfViewer
 * assigns it to `pdfjs.GlobalWorkerOptions.workerSrc`, and the saved-copy
 * registrar (components/offline/SavedCopyRegistrar.tsx) prefetches it, so both
 * name the same bundled file.
 *
 * Canonical react-pdf v10 recipe: `new URL(..., import.meta.url)` makes the
 * bundler emit the worker as a hashed static asset beside the chunk, with no
 * CDN. The specifier resolves the app root's own `pdfjs-dist`, whose version
 * tests/components/agenda/_metaPdfjsWorkerVersionParity.test.ts pins to
 * react-pdf's.
 *
 * Read it from here, never from `pdfjs.GlobalWorkerOptions` after an
 * `import("react-pdf")` of your own: in the production build that import can
 * load a second copy of react-pdf's index, whose side effect resets the worker
 * URL to the relative `pdf.worker.mjs` for the whole page.
 */
export const PDF_WORKER_SRC = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();
