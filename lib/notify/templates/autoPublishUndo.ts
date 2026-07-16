import { BATCH_EMAIL_MAX_ITEMS } from "@/lib/notify/constants";
import { recipientBindingFor } from "@/lib/sync/unpublishBinding";
import { escapeHtml } from "./escapeHtml";
import type { RenderedEmail } from "./realtimeProblem";

/**
 * Auto-publish undo email (M12.13 spec §4.3). Rendered PER RECIPIENT (R17):
 * the input REQUIRES the recipient email and derives the capability binding
 * `r` internally via `recipientBindingFor`, so a per-recipient URL is
 * structurally inevitable — there is no way to render this template without
 * binding the link to one recipient. The raw bearer token appears ONLY here,
 * in the rendered link; the persisted delivery row carries the one-way mintId.
 */
export type AutoPublishUndoInput = {
  origin: string;
  slug: string;
  showTitle: string;
  showId: string;
  /** Raw bearer token — in-memory only; renders into the link, never persists. */
  token: string;
  /** sha256(token) hex prefix — the mint identity the binding is scoped to. */
  mintId: string;
  expiresAt: Date;
  /** Recipient email; canonicalized inside recipientBindingFor. */
  recipient: string;
  /** Clock for the "about N hours" remainder; defaults to wall time. */
  now?: Date;
};

// Same ET zone the digest email uses (lib/notify/digest.ts) — Doug-facing
// times on this project are Eastern.
const EMAIL_TIMEZONE = "America/New_York";

function closesAtAbsolute(expiresAt: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: EMAIL_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(expiresAt);
}

function aboutHours(expiresAt: Date, now: Date): string {
  const hours = Math.max(1, Math.round((expiresAt.getTime() - now.getTime()) / 3_600_000));
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

const WHAT_UNDO_DOES =
  "Undoing takes the show offline; crew links pause until Published is turned back on from the show's page.";
const IGNORING = "If everything looks right, ignore this email and the show stays live.";
const LINK_LABEL = "Take this show offline";

export function renderAutoPublishUndo(input: AutoPublishUndoInput): RenderedEmail {
  const r = recipientBindingFor(input.recipient, input.showId, input.mintId);
  const href = `${input.origin}/show/${input.slug}/unpublish?token=${input.token}&r=${r}`;
  const now = input.now ?? new Date();

  const opening = `${input.showTitle} published itself and is now live for the crew.`;
  const window = `The undo window closes ${closesAtAbsolute(input.expiresAt)} (${aboutHours(
    input.expiresAt,
    now,
  )} from now).`;

  const subject = `FXAV: ${input.showTitle} published itself`;
  const text = [opening, window, `${LINK_LABEL}: ${href}`, `${WHAT_UNDO_DOES} ${IGNORING}`].join(
    "\n\n",
  );
  const html =
    `<p>${escapeHtml(opening)}</p>` +
    `<p>${escapeHtml(window)}</p>` +
    `<p><a href="${escapeHtml(href)}">${escapeHtml(LINK_LABEL)}</a></p>` +
    `<p>${escapeHtml(WHAT_UNDO_DOES)} ${escapeHtml(IGNORING)}</p>`;

  return { subject, html, text };
}

export type AutoPublishUndoBatchShow = {
  slug: string;
  showTitle: string;
  showId: string;
  token: string;
  mintId: string;
  expiresAt: Date;
};

export type AutoPublishUndoBatchInput = {
  origin: string;
  shows: AutoPublishUndoBatchShow[];
  recipient: string;
  now?: Date;
};

/** Batch variant (batching spec §2.4). N=1 delegates to the single template so a
 * lone publish renders byte-identically to the historical email. Every show keeps
 * its OWN recipient-bound r — the binding never spans shows. */
export function renderAutoPublishUndoBatch(input: AutoPublishUndoBatchInput): RenderedEmail {
  const first = input.shows[0];
  if (input.shows.length === 1 && first) {
    return renderAutoPublishUndo({
      origin: input.origin,
      recipient: input.recipient,
      ...(input.now ? { now: input.now } : {}),
      ...first,
    });
  }
  const now = input.now ?? new Date();
  const shown = input.shows.slice(0, BATCH_EMAIL_MAX_ITEMS);
  const overflow = input.shows.length - shown.length;

  const subject = `FXAV: ${input.shows.length} shows published themselves`;
  const intro = `${input.shows.length} shows published themselves and are now live for the crew.`;

  const blocks = shown.map((show) => {
    const r = recipientBindingFor(input.recipient, show.showId, show.mintId);
    const href = `${input.origin}/show/${show.slug}/unpublish?token=${show.token}&r=${r}`;
    const window = `The undo window closes ${closesAtAbsolute(show.expiresAt)} (${aboutHours(
      show.expiresAt,
      now,
    )} from now).`;
    return { title: show.showTitle, window, href };
  });
  const overflowLine =
    overflow > 0
      ? `…and ${overflow} more — manage shows from the dashboard: ${input.origin}/admin`
      : null;
  const closing = `${WHAT_UNDO_DOES} ${IGNORING}`;

  const text = [
    intro,
    ...blocks.map((block) => `${block.title}\n${block.window}\n${LINK_LABEL}: ${block.href}`),
    ...(overflowLine ? [overflowLine] : []),
    closing,
  ].join("\n\n");
  const html =
    `<p>${escapeHtml(intro)}</p>` +
    blocks
      .map(
        (block) =>
          `<p><strong>${escapeHtml(block.title)}</strong><br>${escapeHtml(block.window)}<br>` +
          `<a href="${escapeHtml(block.href)}">${escapeHtml(LINK_LABEL)}</a></p>`,
      )
      .join("") +
    (overflowLine ? `<p>${escapeHtml(overflowLine)}</p>` : "") +
    `<p>${escapeHtml(closing)}</p>`;

  return { subject, html, text };
}
