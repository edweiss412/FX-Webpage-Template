/**
 * tests/components/agenda/_metaPdfjsWorkerVersionParity.test.ts
 *
 * THE PROBLEM (live-diagnosed on validation, 2026-06-12):
 *   The crew agenda PDF viewer failed for EVERY agenda with
 *   "This agenda could not be loaded" BEFORE fetching any PDF bytes.
 *   Network trace: the worker script itself loaded (200), but pdf.js
 *   never issued its document GET — `onLoadError` fired with no
 *   console output.
 *
 *   Root cause: pnpm resolved TWO pdfjs-dist versions. `react-pdf`
 *   bundles its API against ITS OWN `pdfjs-dist` dependency, while
 *   `components/agenda/AgendaPdfViewer.tsx`'s
 *   `pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/
 *   pdf.worker.min.mjs", import.meta.url)` resolves the APP's direct
 *   `pdfjs-dist` dependency. When the two versions differ, the pdf.js
 *   API↔worker handshake fails its internal version check and every
 *   document load aborts before the first byte is requested.
 *
 *   jsdom/node test environments never run the real worker, so the
 *   mismatch is INVISIBLE to component tests and only surfaces in a
 *   real browser (mocked-only bug class, browser-runtime flavor).
 *
 * THE META-DISCIPLINE:
 *   Pin, at CI time, that the `pdfjs-dist` version the app root
 *   resolves (worker script source) is EXACTLY the version `react-pdf`
 *   resolves (API the worker must handshake with). Any dependency bump
 *   that re-forks the two versions fails here instead of in production.
 */
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const appRequire = createRequire(new URL("../../../package.json", import.meta.url));

describe("pdfjs-dist worker/API version parity (structural meta-test)", () => {
  it("app-root pdfjs-dist === react-pdf's pdfjs-dist (exact)", () => {
    // The version AgendaPdfViewer's `new URL("pdfjs-dist/build/
    // pdf.worker.min.mjs", import.meta.url)` worker pin resolves:
    // the app root's own pdfjs-dist dependency.
    const appResolved = appRequire.resolve("pdfjs-dist/package.json");
    const appVersion = (
      appRequire(appResolved) as {
        version: string;
      }
    ).version;

    // The version react-pdf's API bundle was installed against: resolve
    // pdfjs-dist FROM react-pdf's real on-disk location (pnpm gives each
    // package its own node_modules link tree, so this follows react-pdf's
    // OWN dependency edge, not the app root's).
    const reactPdfPkgPath = appRequire.resolve("react-pdf/package.json");
    const reactPdfRequire = createRequire(reactPdfPkgPath);
    const reactPdfResolved = reactPdfRequire.resolve("pdfjs-dist/package.json");
    const reactPdfVersion = (
      reactPdfRequire(reactPdfResolved) as {
        version: string;
      }
    ).version;

    expect(
      appVersion,
      [
        `pdfjs-dist version fork detected:`,
        `  app root resolves   pdfjs-dist@${appVersion} (${appResolved})`,
        `  react-pdf resolves  pdfjs-dist@${reactPdfVersion} (${reactPdfResolved})`,
        ``,
        `AgendaPdfViewer.tsx pins workerSrc to the APP ROOT's pdfjs-dist`,
        `worker file, but react-pdf's API handshakes the worker against`,
        `ITS OWN pdfjs-dist version. A mismatch makes pdf.js abort every`,
        `document load in a real browser ("This agenda could not be`,
        `loaded") before any PDF bytes are fetched — and no jsdom/node`,
        `test can catch it because workers never run there.`,
        ``,
        `Fix: set package.json "pdfjs-dist" to the EXACT version`,
        `react-pdf resolves (\`pnpm why pdfjs-dist\` must show ONE version).`,
      ].join("\n"),
    ).toBe(reactPdfVersion);
  });
});
