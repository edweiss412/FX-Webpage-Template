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

export function renderAutoPublishUndo(input: AutoPublishUndoInput): RenderedEmail {
  const r = recipientBindingFor(input.recipient, input.showId, input.mintId);
  const href = `${input.origin}/show/${input.slug}/unpublish?token=${input.token}&r=${r}`;
  const now = input.now ?? new Date();

  const opening = `${input.showTitle} published itself and is now live for the crew.`;
  const window = `The undo window closes ${closesAtAbsolute(input.expiresAt)} (${aboutHours(
    input.expiresAt,
    now,
  )} from now).`;
  const whatUndoDoes =
    "Undoing takes the show offline; crew links switch off until it is republished.";
  const ignoring = "If everything looks right, ignore this email and the show stays live.";
  const linkLabel = "Take this show offline";

  const subject = `FXAV: ${input.showTitle} published itself`;
  const text = [opening, window, `${linkLabel}: ${href}`, `${whatUndoDoes} ${ignoring}`].join(
    "\n\n",
  );
  const html =
    `<p>${escapeHtml(opening)}</p>` +
    `<p>${escapeHtml(window)}</p>` +
    `<p><a href="${escapeHtml(href)}">${escapeHtml(linkLabel)}</a></p>` +
    `<p>${escapeHtml(whatUndoDoes)} ${escapeHtml(ignoring)}</p>`;

  return { subject, html, text };
}
