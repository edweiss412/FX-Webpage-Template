/**
 * components/auth/TerminalFailure.tsx (M11.5 §B Task C0)
 *
 * Reusable cataloged-message surface. Reads a MessageCode prop, renders the
 * crew-facing copy via messageFor() (or falls back to dougFacing). Never
 * renders the raw code — AGENTS.md invariant 5 / spec §12.4.
 *
 * Visual chrome mirrors the existing show-page terminal-failure block at
 * `app/show/[slug]/page.tsx:425-441` (R21 F2). The intent in M11.5 is that
 * the page route delegates this render to the component rather than
 * inlining the JSX, so the same visual treatment applies to picker-bootstrap
 * 502s, resolver infra faults, and any other auth-chain failure surfaced
 * by code.
 *
 * Server Component — no `'use client'`. The component is pure; consumers
 * mount it inside a route that has already decided to render terminal
 * failure (e.g., after `resolveShowPageAccess` returns the `infra_error`
 * arm).
 */
import { messageFor, type MessageCode } from "@/lib/messages/lookup";

export function TerminalFailure({ code }: { code: MessageCode }) {
  const entry = messageFor(code);
  const body =
    entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment.";
  return (
    <main
      data-testid="terminal-failure"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <h1 className="text-2xl font-bold text-text-strong">
        We&rsquo;re having trouble loading this show
      </h1>
      <p className="mt-4 text-base text-text-subtle">{body}</p>
    </main>
  );
}
