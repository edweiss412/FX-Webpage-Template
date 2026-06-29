// Ambient declaration for the pdfjs worker entry.
//
// `pdfjs-dist` ships type definitions for `legacy/build/pdf.mjs` but NOT for the
// worker entry `legacy/build/pdf.worker.mjs`, so `await import(...)` of it emits
// TS7016 ("implicitly has an 'any' type"). lib/agenda/extractAgendaSchedule.ts
// imports the worker only to register its `WorkerMessageHandler` on
// `globalThis.pdfjsWorker` (the value pdfjs reads via `#mainThreadWorkerMessageHandler`
// to run on the main thread instead of dynamically importing the bundle-unresolvable
// "./pdf.worker.mjs" on Vercel — see that file's loadPdfjs() comment).
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  // Opaque handler object; we only assign it through to globalThis.pdfjsWorker.
  export const WorkerMessageHandler: unknown;
}
