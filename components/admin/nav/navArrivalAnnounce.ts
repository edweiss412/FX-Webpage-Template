// The copy and the selectors behind the nav badge arrival announcement.
// Spec: docs/superpowers/specs/2026-08-31-nav-badge-arrival-announce-design.md
// §3.2 (the join), §3.3 (copy), §3.6 (guard conditions).
//
// No React here on purpose. This module is one decision with two callers:
// `NotifBell`'s aria-label and the announced sentence both read the bell's
// state through `bellAnnounceableCount`, so the name and the utterance cannot
// drift apart (§3.3, and §3.11's account of why no guard replaces it).

/**
 * What the bell would ANNOUNCE, which is also what its accessible name carries.
 *
 * `null` under `degraded`: that branch renders a `!` chip and no numeric badge
 * (NotifBell.tsx:56-74), so a retained count is real state that is not
 * DISPLAYED, and what is not displayed is not spoken. `null` for anything not
 * finite and above zero.
 */
export function bellAnnounceableCount(count: number | null, degraded: boolean): number | null {
  if (degraded) return null;
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) return null;
  return count;
}

/**
 * The bell's accessible name, DEFINED on the selector above so the label and
 * the sentence are two renderings of one decision rather than two
 * implementations of one rule.
 *
 * Carries the true count, never the `9+` pill cap (NotifBell.tsx:93): the pill
 * is a width constraint on a decorative glyph, and the name is the referent
 * (spec §3.3).
 */
export function bellAccessibleName(count: number | null, degraded: boolean): string {
  const n = bellAnnounceableCount(count, degraded);
  return n === null ? "Notifications" : `Notifications: ${n} unseen`;
}

/** Finite and above zero, the one filter both halves of the sentence apply. */
function speakable(n: number | null): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/**
 * The utterance, or `null` when there is nothing true to say.
 *
 * Each half chooses its own noun from its OWN count. Both counts are the true
 * ones, matching the accessible names rather than the capped pills (AC-8).
 */
export function navBadgeArrivalAnnouncement(
  bell: number | null,
  attention: number | null,
): string | null {
  // Composed directly rather than joined from an array. `tests/specLint/canonicalClassCallee.test.ts`
  // forbids array-join call sites because the Tailwind plugin cannot see inside
  // one, and its escape hatch is an EXEMPT_SITES row keyed by operand
  // signature. This join's operands are an array variable, so its signature is
  // EMPTY, and a row keyed on nothing would exempt any future join in this
  // function including a real className one. Removing the array removes the
  // hazard instead of excusing it, and reads no worse at two halves.
  const bellSentence = speakable(bell)
    ? `${bell} unseen notification${bell === 1 ? "" : "s"}.`
    : null;
  const attentionSentence = speakable(attention)
    ? `${attention} item${attention === 1 ? "" : "s"} need${attention === 1 ? "s" : ""} attention.`
    : null;

  if (bellSentence && attentionSentence) return `${bellSentence} ${attentionSentence}`;
  return bellSentence ?? attentionSentence;
}
