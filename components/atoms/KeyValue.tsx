/**
 * components/atoms/KeyValue.tsx — labelled key/value pair (M4 Task 4.4
 * shared atoms; spec §8.3 + DESIGN.md §2/§3).
 *
 * Used by every tile that renders structured fields (Lodging, Venue,
 * Crew, Contacts at M4; more in subsequent tasks). One stacked row:
 *
 *   <dt>  uppercase label, tracking-wide, --text-xs, --color-text-faint
 *   <dd>  the value or — when missing — an EmptyState placeholder.
 *
 * Why <dt>/<dd>: spec calls these "key/value pairs"; HTML's <dl> is the
 * semantic match (description list). Screen readers announce the label
 * before the value, which is the read pattern this atom expresses.
 * Tiles wrap a sequence of <KeyValue> in a <dl> — see Section atom.
 *
 * Empty-state behavior (§8.3 — required-field missing inside a rendered
 * tile):
 *   - null / undefined / whitespace-only string → render the canonical
 *     "Doug hasn't filled this in yet" placeholder via the EmptyState
 *     atom. Tiles MUST NOT inline the literal.
 *   - empty array of values is treated identically (a future variant
 *     for list-valued fields can change this; today's atom is scalar).
 *
 * Tap targets: when `linkAs` is `'tel'` or `'mailto'`, the value is
 * wrapped in an <a> with the §3 `min-h-[var(--spacing-tap-min)]` floor
 * and `inline-flex items-center` so the entire 44px row is the tap
 * target. The display label keeps the source formatting; the href
 * digits-strips for `tel:` so the dialer opens cleanly across phone-
 * format variations (e.g., "508-404-4496" → tel:5084044496).
 *
 * Tabular figures: the value carries `font-variant-numeric: tabular-
 * nums` via the `tabular-nums` Tailwind utility when `tabular` is set
 * (default true for `linkAs='tel'` and for explicit `tabular={true}`).
 * Confirmation numbers, dates, phones — all benefit; non-numeric copy
 * stays proportional.
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";
import { EmptyState } from "@/components/atoms/EmptyState";

type KeyValueProps = {
  /** Field label rendered as the <dt>. Required. */
  label: string;

  /**
   * The value to render in the <dd>. `null`, `undefined`, or a string
   * containing only whitespace all trigger the canonical empty-state
   * placeholder. A ReactNode is accepted so callers can pass <time>
   * elements, anchors composed elsewhere, etc.
   */
  value: string | ReactNode | null | undefined;

  /**
   * When set, wrap the value in a <a href="tel:…">/<a href="mailto:…">.
   * The href is digits-only for `tel:` (so the dialer opens regardless
   * of the display string's formatting). Display label preserves the
   * original formatting.
   */
  linkAs?: "tel" | "mailto";

  /**
   * Apply tabular-nums to the value. Defaults to `true` for `tel:` and
   * for any value that is plausibly a number/date string at the
   * callsite — explicit override available.
   */
  tabular?: boolean;

  /**
   * Optional override for the empty-state placeholder copy. Forwarded
   * to EmptyState. Most callers omit and accept the canonical "Doug
   * hasn't filled this in yet" string.
   */
  emptyLabel?: string;
};

/** Treat null/undefined/whitespace as missing per §8.3. */
function isMissing(value: KeyValueProps["value"]): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

/** Normalize a phone display string to digits-only for the tel: href. */
function digitsOnly(s: string): string {
  return s.replace(/\D+/g, "");
}

export function KeyValue({
  label,
  value,
  linkAs,
  tabular,
  emptyLabel,
}: KeyValueProps) {
  // Decide value rendering up front so the missing branch is obvious.
  if (isMissing(value)) {
    return (
      <div className="flex flex-col gap-1">
        <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
          {label}
        </dt>
        <dd>
          <EmptyState
            variant="required-field"
            {...(emptyLabel !== undefined ? { label: emptyLabel } : {})}
          />
        </dd>
      </div>
    );
  }

  // tabular default: true for phone numbers (via linkAs="tel") since
  // those are essentially digit strings; otherwise let the caller
  // opt in. Email links + free-text notes stay proportional.
  const useTabular = tabular ?? linkAs === "tel";

  // Stringify for the link-href derivation. ReactNode values that
  // aren't strings (e.g., a pre-built <time> child) skip linkAs.
  const renderedValue: ReactNode = (() => {
    if (linkAs && typeof value === "string") {
      const href =
        linkAs === "tel" ? `tel:${digitsOnly(value)}` : `mailto:${value}`;
      return (
        <a
          href={href}
          className={[
            // 44px tap-target floor (§3 / DESIGN.md `--spacing-tap-min`).
            "inline-flex min-h-(--spacing-tap-min) items-center",
            // Row-gap spacing on the wrapper handles vertical rhythm;
            // the anchor itself only needs internal padding for hit-
            // area generosity.
            "-mx-1 px-1 py-1.5",
            // Color: text gets the strong-on-bg accent on hover; rest
            // is normal text weight per §1 ≤10% accent coverage cap.
            "text-text underline-offset-4 transition-colors duration-(--duration-fast)",
            "hover:text-accent-on-bg hover:underline",
            // Tabular figures for phone strings; let mailto stay
            // proportional unless caller opts in.
            useTabular ? "tabular-nums" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </a>
      );
    }
    if (useTabular && typeof value === "string") {
      return <span className="tabular-nums text-text">{value}</span>;
    }
    return <span className="text-text">{value}</span>;
  })();

  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-[0.12em] text-text-faint">
        {label}
      </dt>
      <dd className="text-sm leading-snug">{renderedValue}</dd>
    </div>
  );
}
