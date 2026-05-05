/**
 * components/tiles/CrewTile.tsx — crew roster tile (M4 Task 4.4 line
 * 290-306; spec §8.1 + §8.3).
 *
 * Reads `props.crewMembers` straight off `getShowForViewer.ts:88-102`.
 * Each row carries `{ id, name, email, phone, role, roleFlags }` per
 * the §11 projection contract. Plan §4.4 explicitly states "Do NOT
 * filter the viewer themselves out — the viewer SEES themselves in
 * the crew list (it's intentional; crew want to see their own
 * role/phone/email displayed correctly)."
 *
 * Render contract:
 *   - Every crew member with role + phone + email.
 *   - Phone: rendered with original formatting in the visible label,
 *     digits-only in the `tel:` href so the dialer opens cleanly.
 *   - Email: canonicalized at the M1 boundary (lib/email/canonicalize.ts),
 *     rendered as a `mailto:` link.
 *   - Tap targets: every interactive anchor is ≥44×44px via the
 *     `min-h-tap-min` class on KeyValue's anchor variant.
 *
 * Empty-state behavior (spec §8.3):
 *   - crewMembers.length === 0 (very unlikely; a show always has crew)
 *     → render the EmptyState placeholder. The tile is conceptually
 *     required (every show has crew), so the required-field branch
 *     applies, not whole-tile-missing.
 *   - phone or email missing on a row → render the canonical
 *     placeholder via KeyValue (the field is structurally required).
 *   - role missing → render the placeholder (parser warns separately
 *     if the source row is malformed; render-time we just say "Doug
 *     placeholder ("No crew listed for this show yet.") per Task 4.14.
 *
 * Each row carries `data-testid="crew-row"` for the e2e suite to
 * enumerate.
 *
 * Server Component (no `'use client'`).
 */
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { Avatar } from "@/components/atoms/Avatar";
import { Section } from "@/components/atoms/Section";
import { EmptyState } from "@/components/atoms/EmptyState";
import { digitsOnly } from "@/lib/format/phone";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

type CrewTileProps = {
  crewMembers: ShowForViewer["crewMembers"];
};

/**
 * Cardinality cap before the §8.4 / AC-4.4 overflow disclosure
 * (`[data-tile-show-more="true"]`) renders. The threshold is a
 * conservative heuristic: avatar (32px) + 2 lines (~36px) + gap
 * (~12px) ≈ 80px per crew row at the typography defaults. The
 * tile body's max-h-tile-overflow is 240px, so 8 rows clear the
 * floor before scrolling. NotesTile / PackListTile use 8 / 12
 * for their respective row heights; this is the analogous Crew
 * threshold (Codex round-22 MEDIUM closure).
 */
const CREW_INLINE_CAP = 8;

export function CrewTile({ crewMembers }: CrewTileProps) {
  if (!crewMembers || crewMembers.length === 0) {
    return (
      <Section
        testId="crew-tile"
        heading="Crew"
        headingTone="eyebrow"
        variant="people"
        ariaLabel="Crew"
        bodyAs="div"
      >
        <EmptyState label="No crew listed for this show yet." />
      </Section>
    );
  }

  const visibleCrew = crewMembers.slice(0, CREW_INLINE_CAP);
  const overflowCount = Math.max(0, crewMembers.length - CREW_INLINE_CAP);

  return (
    <Section
      testId="crew-tile"
      heading="Crew"
      headingTone="eyebrow"
      variant="people"
      ariaLabel="Crew"
    >
      {visibleCrew.map((member, idx) => (
        <li
          key={member.id}
          data-testid="crew-row"
          className={[
            "flex items-start gap-3",
            idx > 0 ? "border-t border-border pt-4" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <Avatar name={member.name} />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <p className="truncate text-sm/tight font-semibold text-text-strong">
              {member.name}
            </p>
            {member.role ? (
              <p className="truncate text-xs uppercase tracking-[0.12em] text-text-faint">
                {member.role}
              </p>
            ) : null}
            {/*
              Tap-to-call / tap-to-email controls. Each anchor is a
              standalone tap target ≥44px (--spacing-tap-min) per
              DESIGN.md §3. The visible label is just the icon-glyph +
              short word ("Call" / "Email") to keep the row scannable;
              the digits / address are NOT repeated as text — crew
              don't read 10-digit numbers from the row, they tap to
              dial. This is the substantive shape difference from the
              old `dl`-of-KeyValue treatment (Finding 2 close-out).
            */}
            <div className="flex flex-wrap gap-2 pt-1">
              {/*
                §8.3 actionable-link sentinel guard (round-16
                class-sweep extension): hide the phone tap target
                when value is a sentinel. Same harm pattern as
                round-15 driver_phone — `tel:TBD` is dead.
              */}
              {!shouldHideGenericOptional(member.phone) &&
              digitsOnly(member.phone ?? "").length > 0 ? (
                <a
                  href={`tel:${digitsOnly(member.phone ?? "")}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium tabular-nums text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={`Call ${member.name}`}
                >
                  <span aria-hidden="true">{"☎"}</span>
                  <span>Call</span>
                </a>
              ) : null}
              {/*
                §8.3 actionable-link sentinel guard (round-16
                class-sweep extension): hide the email tap target
                when value is a sentinel. `mailto:TBD` is dead.
              */}
              {!shouldHideGenericOptional(member.email) ? (
                <a
                  href={`mailto:${member.email}`}
                  className={[
                    "inline-flex min-h-tap-min items-center gap-1.5",
                    "rounded-sm border border-border bg-surface-sunken px-2.5 py-1",
                    "text-xs font-medium text-text",
                    "transition-colors duration-fast",
                    "hover:text-accent-on-bg hover:border-border-strong",
                  ].join(" ")}
                  aria-label={`Email ${member.name}`}
                >
                  <span aria-hidden="true">{"✉"}</span>
                  <span>Email</span>
                </a>
              ) : null}
            </div>
          </div>
        </li>
      ))}
      {overflowCount > 0 ? (
        // §8.4 / AC-4.4 overflow disclosure (Codex round-22 MEDIUM):
        // when the crew roster exceeds CREW_INLINE_CAP, render a
        // `data-tile-show-more` stub so users have an explicit
        // affordance that more content exists. Mirrors the
        // notes-overflow-stub / pack-list-overflow-stub pattern.
        <li
          data-testid="crew-overflow-stub"
          data-tile-show-more="true"
          className={[
            "rounded-sm bg-surface-sunken px-3 py-2",
            "text-sm text-text-subtle",
            "border-t border-border pt-4",
          ].join(" ")}
        >
          <span className="tabular-nums">+{overflowCount}</span>{" "}
          {overflowCount === 1 ? "more crew member" : "more crew members"} on
          the source sheet
        </li>
      ) : null}
    </Section>
  );
}
