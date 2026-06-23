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
import Link from "next/link";

import { messageFor, type MessageCode } from "@/lib/messages/lookup";

export function TerminalFailure({
  code,
  title,
  retryHref,
}: {
  code: MessageCode;
  /**
   * Optional override for the h1. Defaults to the show-context phrasing.
   * /me and other non-show surfaces pass their own to keep voice accurate.
   */
  title?: string;
  /**
   * Optional href for a "Try again" recovery link. When provided, renders
   * a 44px tap-target link below the cataloged body copy. /me's inline
   * terminal-failure block (app/me/page.tsx) is the precedent; surfaces
   * that have a meaningful retry destination should pass it.
   */
  retryHref?: string;
}) {
  const entry = messageFor(code);
  const body = entry.crewFacing ?? entry.dougFacing ?? "Please try again in a moment.";
  const heading = title ?? "We’re having trouble loading this show";
  return (
    <main
      data-testid="terminal-failure"
      className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 py-section-gap text-center text-text"
    >
      <h1 className="text-2xl font-bold text-text-strong">{heading}</h1>
      <p className="mt-4 text-base text-text-subtle">{body}</p>
      {retryHref && (
        <Link
          href={retryHref}
          data-testid="terminal-failure-retry"
          className="mt-section-gap inline-flex min-h-tap-min min-w-tap-min items-center justify-center px-4 py-2 text-base text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Try again
        </Link>
      )}
    </main>
  );
}
