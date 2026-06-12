// app/show/[slug]/unpublish/copy.ts — M12.13 confirm-page shared copy +
// action-state contract (spec §5). Plain constants importable by BOTH the
// server page and the client form so the GET render and the POST in-place
// outcome can never drift. No catalog import here — catalog copy (the
// EXPIRED state) is resolved server-side via lib/messages/lookup and passed
// down as strings (invariant 5: codes never reach the client raw, and the
// 2.6k-line catalog never enters the client bundle).

/** Outcome of the confirm POST server action, rendered in place. */
export type ConfirmUnpublishActionState =
  | { status: "idle" }
  | { status: "success"; title: string }
  | { status: "expired"; title: string | null; body: string }
  | { status: "neutral" }
  | { status: "infra" };

/** Spec §5 R5 retry copy — exact wording, shared by GET and POST faults.
 *  The infra-fault state deliberately has NO §12.4 code (plain-language retry
 *  copy, not a cataloged error), so messageFor() cannot source it. */
// not-subject:M5-D8 — spec §5 R5 prescribes this exact uncataloged retry copy
export const RETRY_COPY =
  "We couldn't check this link just now. Nothing has changed — try again in a minute.";

export const RETRY_HEADING = "Try again in a minute";

/** Neutral not-found state: no oracle about whether the slug exists, whether
 *  the link was ever real, or whether it was consumed/revoked/stale. */
export const NEUTRAL_HEADING = "We couldn’t open this link";

export const NEUTRAL_BODY =
  "It may be incomplete, out of date, or already spent — either way, nothing has changed. " +
  "If a show needs to come offline, you can always archive it from the admin.";

export const CONFIRM_HEADING = "Take this show offline?";

/** Spec §5: plain-language consequence line. */
export const CONFIRM_CONSEQUENCE = "Crew links switch off until you republish it from the admin.";

export const CONFIRM_BUTTON_LABEL = "Take it offline";

export const CONFIRM_BUTTON_PENDING_LABEL = "Taking it offline…";

/** Spec §5: secondary line stating that doing nothing leaves the show live. */
export const KEEP_LIVE_LINE =
  "Want to keep it live? Doing nothing leaves the show live — just close this page.";

export const SUCCESS_HEADING = "Done — it’s offline";

/** Rendered as: <strong>{title}</strong> {SUCCESS_BODY_AFTER_TITLE} */
export const SUCCESS_BODY_AFTER_TITLE =
  "is now offline. Crew links are switched off; you can publish it again any time from the admin.";

export const SUCCESS_ADMIN_LINK_LABEL = "Open it in the admin";
