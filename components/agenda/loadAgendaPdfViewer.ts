/**
 * components/agenda/loadAgendaPdfViewer.ts
 *
 * The one `import()` of the agenda viewer. AgendaEmbed's `next/dynamic` and the
 * saved-copy registrar's prefetch (components/offline/SavedCopyRegistrar.tsx)
 * both call it, so both load the same chunks. Turbopack gives every `import()`
 * site its own small loader chunk beside the shared viewer chunk: when the
 * registrar imported the viewer itself, it warmed a loader chunk the sheet never
 * asks for, and the sheet's own one was missing from the worker's cache, so an
 * agenda nobody had opened failed offline (fix-task-25 round 2).
 */
export function loadAgendaPdfViewer() {
  return import("@/components/agenda/AgendaPdfViewer");
}
