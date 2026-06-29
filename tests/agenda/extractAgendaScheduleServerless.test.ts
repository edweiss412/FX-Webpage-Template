/**
 * Regression: extractAgendaSchedule must load + run in the Node serverless runtime
 * (Vercel), where `DOMMatrix`/`ImageData`/`Path2D` are not globals and pdfjs's
 * optional native polyfill `@napi-rs/canvas` is not installed.
 *
 * The original bug: `import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs"` at
 * the top of extractAgendaSchedule.ts evaluated pdf.mjs at MODULE-LOAD time, which
 * references DOMMatrix → `ReferenceError: DOMMatrix is not defined` → 500 on EVERY
 * route whose server bundle imported this file (e.g. `/admin` via enrichAgenda).
 * It passed CI/local only because pnpm installed the macOS/linux native canvas
 * binary, which pdfjs auto-loaded to define DOMMatrix; Vercel's install did not.
 *
 * Two guards:
 *   1. Structural — the module must NOT statically import pdfjs (which would
 *      re-introduce the load-time evaluation), and must load it via a dynamic
 *      import after installing the polyfill. Deterministic; fails on the old code
 *      regardless of whether the native canvas binary happens to be installed.
 *   2. Behavioral — with DOMMatrix/ImageData/Path2D deleted (as on Vercel),
 *      extraction still succeeds, AND the in-module stub is what supplied
 *      DOMMatrix. The stub-identity assertion (no native `multiplySelf` method) is
 *      the load-bearing guarantee: because the fix pre-defines DOMMatrix before
 *      importing pdfjs, pdfjs takes the stub and never reaches for the native
 *      canvas package — so the path works even when that package is absent. (The
 *      negative-regression check that proves this is not tautological: deleting
 *      the polyfill makes pdfjs fall back to native canvas and this test fails.)
 */
import { test, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";

const SRC = "lib/agenda/extractAgendaSchedule.ts";

test("module does not statically import pdfjs (no module-load evaluation)", () => {
  const src = readFileSync(SRC, "utf8");
  // No top-level static `import ... from "pdfjs-dist..."` — that is what evaluated
  // pdf.mjs at load time and 500'd unrelated routes.
  expect(src).not.toMatch(/^\s*import\s+[^;]*\bfrom\s+["']pdfjs-dist/m);
  // pdfjs must instead be pulled in via a runtime dynamic import...
  expect(src).toMatch(/\bimport\(\s*["']pdfjs-dist\/legacy\/build\/pdf\.mjs["']\s*\)/);
  // ...and a DOMMatrix polyfill must be present for the serverless runtime.
  expect(src).toMatch(/DOMMatrix/);
});

test("registers pdfjs's worker on the main thread via a STATIC-specifier lazy import", () => {
  const src = readFileSync(SRC, "utf8");
  // The worker module must be pulled in with a STATIC string specifier (Next bundles
  // it into a resolvable chunk) — NOT a runtime variable, which the bundler cannot
  // trace. This is the load-bearing difference from pdfjs's own internal
  // `import(GlobalWorkerOptions.workerSrc)` over a variable, which resolved a relative
  // "./pdf.worker.mjs" to a non-existent Lambda chunk → "Setting up fake worker failed"
  // → swallowed to a 0-session low-confidence result → admin card "No schedule detected".
  expect(src).toMatch(/\bimport\(\s*["']pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs["']\s*\)/);
  // ...and the worker module must be assigned to globalThis.pdfjsWorker, which pdfjs's
  // `#mainThreadWorkerMessageHandler` reads to skip the failing dynamic import entirely.
  expect(src).toMatch(/globalThis[^\n]*\.pdfjsWorker\b|["']pdfjsWorker["']\s*\]/);
});

const g = globalThis as Record<string, unknown>;
const PDF_GLOBALS = ["DOMMatrix", "ImageData", "Path2D"] as const;
const saved: Record<string, unknown> = {};

beforeAll(() => {
  for (const k of PDF_GLOBALS) {
    saved[k] = g[k];
    delete g[k];
  }
});
const savedPdfjsWorker = g.pdfjsWorker;
afterAll(() => {
  for (const k of PDF_GLOBALS) {
    if (saved[k] === undefined) delete g[k];
    else g[k] = saved[k];
  }
  if (savedPdfjsWorker === undefined) delete g.pdfjsWorker;
  else g.pdfjsWorker = savedPdfjsWorker;
});

test("extracts with no global DOMMatrix, via the in-module polyfill (Vercel serverless regression)", async () => {
  // Precondition: no global DOMMatrix — matches the Vercel runtime that crashed.
  expect(g.DOMMatrix).toBeUndefined();

  // Importing the module must NOT evaluate pdfjs (the old static import did, and
  // threw ReferenceError at load on Vercel). Loading it here must be inert.
  const { extractAgendaSchedule } = await import("@/lib/agenda/extractAgendaSchedule");
  const x = await extractAgendaSchedule(new Uint8Array(readFileSync("fixtures/agenda/rfi.pdf")));

  // Extraction is fully functional with the stub polyfill (verified byte-identical
  // to the native-canvas output across all fixtures).
  expect(x.confidence).toBe("high");
  expect(x.days.flatMap((d) => d.sessions).length).toBeGreaterThanOrEqual(16);

  // The in-module polyfill is what supplied DOMMatrix: because it pre-defines the
  // global before pdfjs loads, pdfjs uses the stub and never reaches for the native
  // canvas package — so the path holds on Vercel where that package is absent. The
  // stub has none of the native prototype methods (e.g. multiplySelf).
  expect(typeof g.DOMMatrix).toBe("function");
  expect("multiplySelf" in (g.DOMMatrix as { prototype: object }).prototype).toBe(false);

  // Worker-on-main-thread guarantee (Vercel "Setting up fake worker failed" regression):
  // extraction registered pdfjs's WorkerMessageHandler on globalThis.pdfjsWorker, which is
  // the exact value pdfjs's `#mainThreadWorkerMessageHandler` reads to AVOID importing the
  // bundle-unresolvable "./pdf.worker.mjs". Without this, getDocument throws on Lambda and
  // every agenda PDF degrades to "No schedule detected". The successful high-confidence
  // parse above already proves the worker path ran — this pins the mechanism.
  expect(typeof (g.pdfjsWorker as { WorkerMessageHandler?: unknown })?.WorkerMessageHandler).toBe(
    "function",
  );
});
