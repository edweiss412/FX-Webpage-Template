"use client";
/**
 * app/admin/wizard/preview/[stagedId]/error.tsx
 *
 * The staged crew preview's SEGMENT error boundary (spec §2.7). A throw inside a
 * DESCENDANT Server Component's render never passes through the page function's
 * try/catch, so without this file a malformed staged row that survives every
 * normalizer would land on the generic admin error boundary. This is the
 * structural guarantee that it cannot.
 *
 * Client component by Next's requirement. Static by contract: no state, no
 * animation, no `transition-` class (spec Transition Inventory).
 *
 * The thrown error's own text is deliberately never rendered: it can carry infra
 * detail, and invariant 5 keeps raw codes out of the UI.
 */

// not-subject:M5-D8 — admin-only copy, matching the page's §2.7 surfaces.
const RENDER_FAILURE_COPY = "We could not load this preview.";

export default function StagedPreviewError({
  error: _error,
  reset: _reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main
      data-testid="staged-preview-render-error"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <p className="text-base text-text-subtle">{RENDER_FAILURE_COPY}</p>
      <a
        href="/admin"
        className="mt-section-gap inline-flex min-h-tap-min items-center px-4 py-2 text-base text-text-strong underline underline-offset-2"
      >
        Back to setup
      </a>
    </main>
  );
}
