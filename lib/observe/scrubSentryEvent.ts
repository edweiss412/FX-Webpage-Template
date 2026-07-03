// lib/observe/scrubSentryEvent.ts
// Sentry `beforeSend` scrubber (bug-audit finding C12). The crew share-token is the
// rotatable auth credential and rides in the `/show/<slug>/<shareToken>` path segment;
// raw error text can embed crew emails. Sentry's SDK attaches request.url, transaction
// names, breadcrumb URLs and exception values with ZERO scrubbing, so this bridges the
// email-redaction discipline enforced on the app_events path (lib/log/sanitize.ts) onto
// the third-party Sentry path. Client-safe: redactEmails is pure regex (NO node:crypto).
import type { Event } from "@sentry/nextjs";
import { redactEmails } from "@/lib/log/sanitize";

// Captures `/show/<slug>/` so the slug survives while the 3rd segment (the share token)
// is replaced. Both segments are whitespace-bounded so a token embedded in prose does not
// swallow following words, and a trailing `?s=...&gate=...` / `#frag` is preserved.
const SHOW_TOKEN_RE = /(\/show\/[^/?#\s]+\/)[^/?#\s]+/g;
const TOKEN_PLACEHOLDER = "$1[shareToken-redacted]";

function scrubUrl(value: string): string {
  return value.replace(SHOW_TOKEN_RE, TOKEN_PLACEHOLDER);
}
function scrubText(value: string): string {
  return redactEmails(scrubUrl(value));
}

export function scrubSentryEvent<T extends Event>(event: T): T {
  if (event.request && typeof event.request.url === "string") {
    event.request.url = scrubUrl(event.request.url);
  }
  if (typeof event.transaction === "string") {
    event.transaction = scrubUrl(event.transaction);
  }
  if (typeof event.message === "string") {
    event.message = scrubText(event.message);
  }
  if (event.exception?.values) {
    for (const ex of event.exception.values) {
      if (typeof ex.value === "string") ex.value = scrubText(ex.value);
    }
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.data && typeof b.data.url === "string") b.data.url = scrubUrl(b.data.url);
      if (typeof b.message === "string") b.message = scrubText(b.message);
    }
  }
  return event;
}
