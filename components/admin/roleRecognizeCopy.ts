/**
 * components/admin/roleRecognizeCopy.ts
 *
 * SINGLE source for every Doug-facing string in the recognize-role feature: the
 * inline warning control (`RoleRecognizeControl` + its boundary) AND the settings
 * "Roles you've added" page + row (spec 2026-07-15-extend-role-scope-vocab §9).
 *
 * Every user-visible string in those components flows through a constant here —
 * the copy-hygiene sweep (`tests/messages/_metaCatalogCopyHygiene.test.ts`) both
 * (a) asserts none of these strings contains a D7 banned standalone word
 * (scope/flag/token/mapping/capability/sync/overlay/parse) and (b) reads the
 * component sources and forbids raw JSX text nodes, so an inline literal can never
 * bypass the vocabulary check. "role" and "refresh" are allowed; the sync verb is
 * "checks its sheet" / "sheet check".
 *
 * Interpolation templates carry `<TOKEN>` / `<SUMMARY>` placeholder spans (the sweep
 * strips those before the banned-word check); the exported formatter functions fill
 * them. Formatter OUTPUT nouns ("Audio", "Video", …) carry no banned words either.
 */

import type { GrantableFlag } from "@/lib/sync/roleMappingOverlay";

// ── Inline warning control ────────────────────────────────────────────────
export const TRIGGER_LABEL = "Recognize this role";
export const PANEL_HEADING = "What should people with this role see?";
export const SCOPE_LINE =
  "Applies to anyone whose role says <TOKEN> — this show and every show after.";
export const CHECKBOX_AUDIO = "Audio details";
export const CHECKBOX_VIDEO = "Video details";
export const CHECKBOX_LIGHTING = "Lighting details";
export const CHECKBOX_FINANCIAL = "Financial details";
export const FINANCIAL_CAUTION =
  "Includes budgets and rates. Only grant this if people with this role should see money.";
export const NONE_CHECKED_HELPER = "They'll get the standard show page.";
export const SAVE_LABEL = "Recognize role";
export const SAVING_LABEL = "Recognizing…";
export const CANCEL_LABEL = "Cancel";
export const RETRY_LABEL = "Try again";
// not-subject:M5-D8 — pinned §9 static copy (generic infra + the two benign
// result notices), NOT catalog codes. Invariant 5 governs error CODES; §9 pins
// these verbatim and this module IS their single source, D7-swept above.
export const ERROR_COPY =
  "That didn't save, so nothing has changed yet. Check your connection and try again.";
// not-subject:M5-D8 — §9 stale-provenance benign notice (pinned static copy).
export const STALE_COPY =
  "Looks like this was already taken care of. The page will show the latest next time it loads.";
// not-subject:M5-D8 — §9 conflict benign notice (pinned static copy).
export const CONFLICT_COPY =
  "This role was already added with different choices. You can change what people with it see from Settings.";
export const SAVED_HEADING =
  "Got it — anyone with this role is recognized from now on, on every show.";
export const SAVED_SUMMARY = "People with <TOKEN> now see <SUMMARY>.";
export const APPLY_PENDING_SUMMARY =
  "The role is saved and applies to every show. This show couldn't refresh just now — it'll catch up on its next sheet check.";
export const CHANGE_LINK = "Change what they see";
export const STANDARD_PAGE_SUMMARY = "the standard show page";

// ── Settings page + row ───────────────────────────────────────────────────
export const SETTINGS_EYEBROW = "Settings";
export const SETTINGS_TITLE = "Roles you've added";
export const SETTINGS_SUBTITLE =
  "Anyone whose sheet role matches one of these gets the page you picked — on every show.";
export const STANDARD_PAGE_CHIP = "Standard page only";
export const EDIT_LABEL = "Edit what they see";
// §9 edit-saved convergence confirmation (Codex R6 F4 — must NOT imply immediate
// effect on live shows; each show picks the change up on its next sheet check).
export const EDIT_SAVED_CONFIRM =
  "Saved. Each show picks this up the next time it checks its sheet.";
export const REMOVE_LABEL = "Remove";
export const SAVE_CHANGES_LABEL = "Save changes";
export const SAVING_CHANGES_LABEL = "Saving…";
export const REMOVE_CONFIRM =
  "Remove this role? People with it go back to “unrecognized” the next time each show checks its sheet.";
export const REMOVE_CONFIRM_YES = "Yes, remove it";
export const REMOVING_LABEL = "Removing…";
export const REMOVE_KEEP = "Keep it";
export const EMPTY_TITLE = "Nothing here yet";
export const EMPTY_BODY =
  "When a sheet uses a role we don't recognize, you can add it from the warning — added roles show up here.";
export const LOAD_FAILURE = "We couldn't load your roles just now. Refresh the page to try again.";
export const YOU_LABEL = "You";

// Grant → display noun (summary join) and chip label.
const GRANT_NOUN: Record<GrantableFlag, string> = {
  A1: "Audio",
  V1: "Video",
  L1: "Lighting",
  FINANCIALS: "Financial",
};
const GRANT_CHIP: Record<GrantableFlag, string> = {
  A1: CHECKBOX_AUDIO,
  V1: CHECKBOX_VIDEO,
  L1: CHECKBOX_LIGHTING,
  FINANCIALS: CHECKBOX_FINANCIAL,
};

/**
 * Grants summary join (mock parity, `Recognize Role Control.dc.html` renderVals):
 * 0 grants → "the standard show page"; 1 → "Audio details"; 2 → "Audio and Video
 * details"; 3+ → "Audio, Video and Lighting details". Callers pass already
 * stable-ordered grants (A1, V1, L1, FINANCIALS).
 */
export function grantsSummary(grants: readonly GrantableFlag[]): string {
  if (grants.length === 0) return STANDARD_PAGE_SUMMARY;
  const parts = grants.map((g) => GRANT_NOUN[g]);
  if (parts.length === 1) return `${parts[0]} details`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]} details`;
}

/** The plain-language chip label for a single grant. */
export function chipLabel(grant: GrantableFlag): string {
  return GRANT_CHIP[grant];
}

/** "Applies to anyone whose role says <TOKEN> — …" with the raw word filled in. */
export function scopeLine(token: string): string {
  return SCOPE_LINE.replace("<TOKEN>", token);
}

/** "People with <TOKEN> now see <SUMMARY>." — the applied saved-card summary. */
export function savedSummary(token: string, grants: readonly GrantableFlag[]): string {
  return SAVED_SUMMARY.replace("<TOKEN>", token).replace("<SUMMARY>", grantsSummary(grants));
}
