import { getRequiredDougFacing } from "@/lib/messages/lookup";

// Grantable role flags → plain-language discipline labels (spec
// 2026-07-15-extend-role-scope-vocab §9). GRANT_ORDER is the pinned display
// order (A1, V1, L1, FINANCIALS) so a summary reads the same regardless of the
// order grants were stored/hand-edited in.
const GRANT_LABELS = {
  A1: "Audio",
  V1: "Video",
  L1: "Lighting",
  FINANCIALS: "Financial",
} as const;
const GRANT_ORDER = ["A1", "V1", "L1", "FINANCIALS"] as const;

/**
 * Plain-language summary of what a recognized role's members now see (spec §9 /
 * §10 point 6). Empty grants (recognize-only — a valid v1 state) resolve to
 * "the standard show page"; the join NEVER produces an empty artifact such as
 * "see ." or "and details".
 */
export function roleGrantsSummary(grants: readonly string[]): string {
  const labels = GRANT_ORDER.filter((flag) => grants.includes(flag)).map(
    (flag) => GRANT_LABELS[flag],
  );
  if (labels.length === 0) return "the standard show page";
  const joined =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `${joined} details`;
}

/**
 * Render the ROLE_TOKEN_MAPPED app_event's Doug-facing copy from its context.
 * The catalog dougFacing carries the interpolated `<token>` through the real
 * `messageFor` placeholder path; the grants summary is appended via
 * roleGrantsSummary so the empty-grants branch (§10 point 6) reads cleanly.
 */
export function renderRoleTokenMappedCopy(context: {
  token: string;
  grants: readonly string[];
}): string {
  const dougFacing = getRequiredDougFacing("ROLE_TOKEN_MAPPED", { token: context.token });
  return `${dougFacing} People with this role now see ${roleGrantsSummary(context.grants)}.`;
}
