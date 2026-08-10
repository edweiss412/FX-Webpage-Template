"use client";
// app/help/errors/_components/HelpReportCta.tsx — 2026-08-09 spec §2.1.
//
// The trailing CTA on /help/errors, and the only client island the page adds
// (RefAnchor is the other). It captures the page's URL fragment — the
// error-code anchor Doug arrived on, or a family anchor like `#sync` — as
// best-effort context on the report.
//
// Attempt identity is bound to the code context BY CONSTRUCTION. The modal
// persists {idempotencyKey, draft, status} in sessionStorage scoped by
// surfaceId and reuses the key on resume, so a stable surfaceId under a live
// hash would let a resumed attempt reuse its key while the spread-at-submit
// autocapture carried a DIFFERENT helpCode — silent context misassociation,
// worst after the lease stores the first context ON CONFLICT DO NOTHING.
// Deriving surfaceId AND the element key from the same hash makes key, draft,
// and helpCode co-vary: a different fragment is a new attempt scope, returning
// to an old fragment resumes that attempt with its original code, and a
// mid-open fragment change remounts (closing the modal) rather than mutating a
// live attempt's context.
//
// The encoding is collision-free: every captured fragment takes the `c-`
// prefix and the hashless state is the un-prefixed `help-errors-none`, so no
// manual fragment (including a literal `#no-code`) can alias the hashless
// scope.
import { useSyncExternalStore } from "react";

import { ReportButton } from "@/components/shared/ReportButton";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function readHash(): string {
  return window.location.hash.slice(1);
}

export function HelpReportCta() {
  // Server snapshot is "" — there is no fragment on the server, and the first
  // client render reconciles to the real value.
  const hash = useSyncExternalStore(subscribe, readHash, () => "");

  return (
    <ReportButton
      key={hash}
      surface="help"
      surfaceId={hash ? `help-errors-c-${hash}` : "help-errors-none"}
      showId={null}
      ringOffset="info-bg"
      {...(hash ? { autocapture: { fieldRef: { helpCode: hash } } } : {})}
    />
  );
}
