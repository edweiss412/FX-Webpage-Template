/**
 * components/crew/primitives/PersonRow.tsx — crew-redesign §4.6 primitive.
 *
 * A reusable person/contact row, ported from the CrewTile/ContactsTile
 * contact-row idiom (components/tiles/CrewTile.tsx + ContactsTile.tsx) so
 * the §6-section crew page renders crew, venue contacts, and in-house AV
 * with one shared shape.
 *
 * Dead-link guard (port of the round-15/16 sentinel-on-actionable-link
 * fix): a `tel:`/`mailto:` control renders ONLY when its value is a real,
 * non-sentinel address — a `tel:TBD` / `mailto:N/A` link is a dead and
 * misleading contact control. Phone routes through `digitsOnly`
 * (lib/format/phone.ts) so the dialer opens cleanly; both phone and email
 * are gated on `!shouldHideGenericOptional(value)` (lib/visibility/
 * emptyState.ts) so `''`/`TBD`/`N/A`/`TBA` never produce an action.
 *
 * Nameless-but-actionable contacts (a venue/AV row with phone/email but no
 * name) still render — using `fallbackLabel` as the heading — so the
 * actionable contact is never dropped (preserves ContactsTile behavior).
 *
 * `notes` routes through the same `shouldHideGenericOptional` predicate so
 * a sentinel note reflows out (this is the §8.3 generic-optional field that
 * the sentinel-hiding meta-test enforces on this file).
 *
 * Whole-row omission: when name, role, phone, AND email are all absent the
 * row has no identity and no action, so it omits entirely (returns null) —
 * no empty band reflows in.
 *
 * `you` / `lead` / `primary` set role chips + `data-*` style hooks for the
 * downstream highlight treatment (the orange accent stays text-paired per
 * DESIGN.md §1 color-blind floor).
 *
 * Tap targets: each `tel:`/`mailto:` anchor is the mock's icon-only
 * `.cbtn` — a 44px-square tap target (`size-tap-min`, with `min-h-tap-min`
 * as the explicit ≥44px floor per DESIGN.md §3) rendering ONLY a centered
 * glyph; the visible "Call"/"Email" text is dropped and the control's name
 * lives on `aria-label`. The project has no SVG phone/mail icon, so the
 * legible unicode `☎`/`✉` glyph stands in (sized + centered), not an
 * invented icon import.
 *
 * Server Component (no `'use client'`) — props in, markup out.
 */
import { Avatar } from "@/components/atoms/Avatar";
import { digitsOnly } from "@/lib/format/phone";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type Person = {
  /** Display name. Absent/blank → the row falls back to `fallbackLabel`. */
  name?: string;
  /** Role/title eyebrow (e.g. "Producer", "Venue contact"). */
  role?: string;
  /** Heading used when `name` is absent (e.g. "Venue contact"). */
  fallbackLabel?: string;
  /** Phone for the tap-to-call control. Sentinel/blank → no control. */
  phone?: string;
  /** Email for the tap-to-email control. Sentinel/blank → no control. */
  email?: string;
  /** Optional generic-optional note line. Sentinel → hidden. */
  notes?: string;
  /** The viewer is this person → "You" chip + data-you hook. */
  you?: boolean;
  /** Department lead → "Lead" chip + data-lead hook. */
  lead?: boolean;
  /** Primary contact for the row's domain → "Primary" chip + data-primary hook. */
  primary?: boolean;
};

type PersonRowProps = {
  person: Person;
};

/**
 * Shared chip styling for the You/Lead/Primary badges. `min-w-0 max-w-full
 * truncate` lets the chip shrink to its column in the ultra-narrow §4.9
 * Need-something quick-card at 390px (content column ≈27px) instead of forcing
 * its intrinsic width past the card's right edge; in normal-width contexts the
 * chip is wider than its content so the truncate is a no-op.
 */
const CHIP_CLASS = [
  // `inline-block` (not `inline-flex`) so `truncate` actually clips the label:
  // text-overflow:ellipsis applies to block/inline-block boxes, not to a flex
  // container's flowed text. `max-w-full` bounds it to the column.
  "inline-block max-w-full truncate rounded-sm px-1.5 py-0.5 align-middle",
  "text-xs font-semibold uppercase tracking-eyebrow",
].join(" ");

/**
 * Shared action-anchor styling — the mock `.cbtn`: an icon-only 44px-square
 * tap target. `size-tap-min` (= `--spacing-tap-min` = 44px, globals.css) makes
 * the anchor a flush 44×44 square; `min-h-tap-min` keeps the explicit ≥44px tap
 * floor (DESIGN.md §3) even if the glyph's line-box would otherwise undershoot.
 * `shrink-0` keeps the square from collapsing inside the very narrow §4.9
 * Need-something quick-card at 390px (the buttons sit on their own wrap row, so
 * they never need to shrink to fit). `justify-center` centers the single glyph
 * in the square — the visible "Call"/"Email" text is dropped; the control's name
 * lives in `aria-label`. Hover deepens border + sunken fill and warms the glyph
 * to the accent, matching the mock's contact-button affordance.
 */
const ACTION_CLASS = [
  "inline-flex size-tap-min min-h-tap-min shrink-0 items-center justify-center",
  "rounded-[11px] border border-border bg-surface text-text-subtle",
  "transition-colors duration-fast",
  "hover:border-border-strong hover:bg-surface-sunken hover:text-accent-on-bg",
].join(" ");

export function PersonRow({ person }: PersonRowProps) {
  const { role, fallbackLabel, you, lead, primary } = person;

  const hasName = typeof person.name === "string" && person.name.trim().length > 0;
  const heading = hasName ? person.name : fallbackLabel;

  // Actionable only when the value is a real, non-sentinel address. Phone
  // additionally requires ≥1 digit so a digit-less label can't make a
  // `tel:` href with no number. Member access (`person.phone` / `.email` /
  // `.notes`) is intentional so the §8.3 sentinel-hiding meta-test's
  // field-access patterns enforce the predicate on THIS file.
  const phoneActionable =
    !shouldHideGenericOptional(person.phone ?? null) && digitsOnly(person.phone ?? "").length > 0;
  const emailActionable = !shouldHideGenericOptional(person.email ?? null);

  // §8.3 whole-row omission: no identity (name/role) AND no action
  // (phone/email) → nothing to render.
  const hasIdentity = hasName || (typeof role === "string" && role.trim().length > 0);
  if (!hasIdentity && !phoneActionable && !emailActionable) {
    return null;
  }

  // Accessible-name base for the tap controls: the heading if we have one,
  // else a generic "contact" so the control is never unnamed.
  const actionTarget = heading && heading.trim().length > 0 ? heading : "contact";
  const showNotes = !shouldHideGenericOptional(person.notes ?? null);

  return (
    <li
      data-testid="person-row"
      {...(you ? { "data-you": "true" } : {})}
      {...(lead ? { "data-lead": "true" } : {})}
      {...(primary ? { "data-primary": "true" } : {})}
      // `min-w-0` so the row collapses below its content width inside a narrow
      // flex slot (the §4.9 Need-something quick-card at 390px is ≈70px wide).
      // Without it the row keeps its intrinsic width and overflows the card.
      className="flex min-w-0 items-start gap-3"
    >
      <Avatar name={heading ?? ""} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {heading !== undefined ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* `min-w-0` lets `truncate` actually engage inside this flex row:
                without it the nowrap name keeps its intrinsic width and pushes
                the You/Lead/Primary chip past the card's right edge at 390px. */}
            <p className="min-w-0 max-w-full truncate text-sm/tight font-semibold text-text-strong">
              {heading}
            </p>
            {you ? (
              <span className={[CHIP_CLASS, "bg-stale-tint text-accent-on-bg"].join(" ")}>You</span>
            ) : null}
            {lead ? (
              <span className={[CHIP_CLASS, "bg-surface-sunken text-text-subtle"].join(" ")}>
                Lead
              </span>
            ) : null}
            {primary ? (
              <span className={[CHIP_CLASS, "bg-surface-sunken text-text-subtle"].join(" ")}>
                Primary
              </span>
            ) : null}
          </div>
        ) : null}
        {role !== undefined && role.trim().length > 0 ? (
          <p className="truncate text-xs uppercase tracking-eyebrow text-text-subtle">{role}</p>
        ) : null}
        {phoneActionable || emailActionable ? (
          <div className="flex min-w-0 flex-wrap gap-2 pt-1">
            {phoneActionable ? (
              <a
                href={`tel:${digitsOnly(person.phone ?? "")}`}
                className={ACTION_CLASS}
                aria-label={`Call ${actionTarget}`}
              >
                {/* Icon-only: the glyph is the whole control; the accessible
                    name is on the anchor's `aria-label`, so the glyph is
                    `aria-hidden`. `leading-none` keeps it optically centered in
                    the 44px square (the default line-box would bias it low). No
                    SVG phone/mail icon exists in the project, so the legible
                    unicode glyph stands in per the mock. */}
                <span className="text-[18px] leading-none" aria-hidden="true">
                  {"☎"}
                </span>
              </a>
            ) : null}
            {emailActionable ? (
              <a
                href={`mailto:${person.email}`}
                className={ACTION_CLASS}
                aria-label={`Email ${actionTarget}`}
              >
                <span className="text-[18px] leading-none" aria-hidden="true">
                  {"✉"}
                </span>
              </a>
            ) : null}
          </div>
        ) : null}
        {showNotes ? <p className="pt-1 text-xs/snug text-text-subtle">{person.notes}</p> : null}
      </div>
    </li>
  );
}
