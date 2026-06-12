// app/show/[slug]/unpublish/blocks.tsx — M12.13 confirm-page presentational
// state blocks (spec §5 render states). Pure JSX, no hooks, no data access:
// the server page renders these for GET-resolved states and the client form
// renders the SAME blocks for POST outcomes, so the two surfaces cannot
// drift. Minimal standalone register (the page is reached from email,
// unauthenticated, on any device): DESIGN.md text/accent tokens, no admin
// chrome, no help affordances.
import {
  NEUTRAL_BODY,
  NEUTRAL_HEADING,
  RETRY_COPY,
  RETRY_HEADING,
  SUCCESS_ADMIN_LINK_LABEL,
  SUCCESS_BODY_AFTER_TITLE,
  SUCCESS_HEADING,
} from "./copy";

export function NeutralBlock() {
  return (
    <div data-testid="unpublish-neutral">
      <h1 className="text-2xl font-bold text-text-strong">{NEUTRAL_HEADING}</h1>
      <p className="mt-4 text-base text-text-subtle">{NEUTRAL_BODY}</p>
    </div>
  );
}

export function RetryBlock() {
  return (
    <div data-testid="unpublish-retry">
      <h1 className="text-2xl font-bold text-text-strong">{RETRY_HEADING}</h1>
      <p className="mt-4 text-base text-text-subtle">{RETRY_COPY}</p>
    </div>
  );
}

/** The POST-fault variant: the same retry copy WITHOUT the page-level
 *  heading swap, rendered above the still-available confirm form (a
 *  transient fault must leave the retry path open — spec §5 R5). */
export function RetryNotice() {
  return (
    <p data-testid="unpublish-retry-notice" className="text-base text-warning-text" role="status">
      {RETRY_COPY}
    </p>
  );
}

export function ExpiredBlock({ title, body }: { title: string | null; body: string }) {
  return (
    <div data-testid="unpublish-expired">
      <h1 className="text-2xl font-bold text-text-strong">{title ?? "This link expired"}</h1>
      <p className="mt-4 text-base text-text-subtle">{body}</p>
    </div>
  );
}

export function SuccessBlock({ title, slug }: { title: string; slug: string }) {
  return (
    <div data-testid="unpublish-success">
      <h1 className="text-2xl font-bold text-text-strong">{SUCCESS_HEADING}</h1>
      <p className="mt-4 text-base text-text">
        <strong className="font-semibold text-text-strong">{title}</strong>{" "}
        {SUCCESS_BODY_AFTER_TITLE}
      </p>
      <p className="mt-4">
        <a
          href={`/admin/show/${slug}`}
          className="text-base font-medium text-accent-on-bg underline underline-offset-2"
        >
          {SUCCESS_ADMIN_LINK_LABEL}
        </a>
      </p>
    </div>
  );
}
