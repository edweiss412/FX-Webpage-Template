/**
 * components/show-panels/HotelCardBody.tsx
 *
 * One hotel reservation as a card, the body both surfaces render (crew page
 * redesign spec §6.2, `hotels` row, line 307): the admin's `HotelCard`, shared.
 * The hotel name and its map-pin address on one left edge, a sunken date stub
 * whose connector carries the night count, the stay's confirmation number and
 * notes, and one named chip per guest. Each surface turns its fields on with a
 * flag, so each keeps exactly the fields it shows today:
 *
 * - Admin (`HotelCard`, components/admin/wizard/step3ReviewSections.tsx):
 *   `showConfirmation: false` (the confirmation number stays private to the
 *   review surface), `showNotes: false`, `showGuests: true`, `hideDates: false`,
 *   sentinels as parsed, the judgment marker in the `marker` slot, the
 *   `data-hotel-index` jump target, and `HotelCard`'s two `useId` values passed
 *   in as `nameId` and `guestsLabelId`.
 * - Crew (plan Task 9): `showConfirmation: true`, `showNotes: true`,
 *   `showGuests: false`, `hideDates` when the viewer's dates are suppressed.
 *
 * Dates are shown as parsed (a non-ISO value echoes verbatim). The hotel name is
 * never sentinel-gated: neither surface gates it today.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment), and
 * the admin's `HotelCard` keeps its hooks and passes their values in. Its
 * unprefixed test ids (`hotel-stay-*`, `hotel-guest-*`) are the admin's and stay
 * unprefixed on both surfaces; the card's own id comes from `testIdPrefix`.
 */
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";

import { CELL_EYEBROW_CLASS } from "@/components/show-panels/FieldRowList";
import { MiniAvatar } from "@/components/show-panels/MiniAvatar";
import { dateStubParts } from "@/lib/format/date";
import type { HotelReservationRow } from "@/lib/parser/types";
import { cn } from "@/lib/ui/cn";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type HotelCardBodyProps = {
  /** The reservation, already gated by the caller. */
  hotel: HotelReservationRow;
  /** The hotel name element's id: the card is a group it names. */
  nameId: string;
  /** The guests eyebrow's id: it names the guest list. */
  guestsLabelId: string;
  /** Above the hotel name: the admin's judgment marker. */
  marker?: ReactNode;
  /** The card's position in its list, as the `data-hotel-index` jump target (admin). */
  jumpIndex?: number;
  /** true: the card draws no border of its own (it is its section's only card). */
  flat?: boolean;
  /** The stay's confirmation number (crew). */
  showConfirmation: boolean;
  /** The reservation's notes (crew). */
  showNotes: boolean;
  /** One chip per guest on the reservation (admin). */
  showGuests: boolean;
  /** No check-in, check-out or night count: the viewer's dates are suppressed (crew). */
  hideDates: boolean;
  /** "show": a sentinel renders as parsed (admin). "hide": its line is omitted (crew). */
  sentinels: "show" | "hide";
  /** Given, the card is `${testIdPrefix}-hotel-card`. */
  testIdPrefix?: string;
};

/** A value to render, or null: blank, or a sentinel the surface hides. */
function shown(value: string | null, sentinels: "show" | "hide"): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return sentinels === "hide" && shouldHideGenericOptional(value) ? null : value;
}

/** The card's name: the hotel's, else "Hotel". The admin's marker names it too. */
export function hotelCardLabel(hotel: HotelReservationRow): string {
  return hotel.hotel_name || "Hotel";
}

/**
 * Nights between an ISO check-in and check-out (both `YYYY-MM-DD`). Returns
 * null when either is missing, unparseable (a sentinel like `TBD`), or the
 * span is non-positive — so the "N nights" pill only appears for a real stay.
 * UTC-pinned (same day-boundary discipline as `formatIsoDate`). Moved here from
 * step3ReviewSections.tsx with the card (PR B plan Task 8); the admin file
 * re-exports it under the same name.
 */
export function nightsBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(`${checkIn}T00:00:00Z`);
  const b = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const nights = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return nights > 0 ? nights : null;
}

/**
 * One end of the hotel card's date stub: a field label over the day set large
 * with its month beside it and the weekday underneath. A missing date says so
 * in plain words. The parser normalizes a non-date cell (e.g. "TBD") to null,
 * so the verbatim-echo branch is defensive only; neither claims a `<time>`.
 */
function StayEnd({
  label,
  value,
  testId,
  alignEnd = false,
}: {
  label: string;
  value: string | null;
  testId: string;
  alignEnd?: boolean;
}) {
  const parts = value ? dateStubParts(value) : null;
  return (
    <div data-testid={testId} className={cn("min-w-0", alignEnd && "text-right")}>
      <p className={CELL_EYEBROW_CLASS}>{label}</p>
      {parts === null ? (
        <p className="mt-1 text-sm font-medium text-text-subtle">Not listed</p>
      ) : parts.kind === "raw" ? (
        <p className="mt-1 wrap-break-word text-xl font-bold text-text-strong">{parts.text}</p>
      ) : (
        <time dateTime={value ?? undefined} className="mt-1 block">
          <span
            className={cn("flex items-baseline gap-1.5 tabular-nums", alignEnd && "justify-end")}
          >
            <span className="text-3xl font-bold leading-none tracking-daynum text-text-strong">
              {parts.day}
            </span>
            <span className="text-sm font-semibold text-text-strong">{parts.month}</span>
          </span>
          <span className="mt-1 block text-xs text-text-subtle">{parts.weekday}</span>
        </time>
      )}
    </div>
  );
}

export function HotelCardBody({
  hotel: h,
  nameId,
  guestsLabelId,
  marker = null,
  jumpIndex,
  flat = false,
  showConfirmation,
  showNotes,
  showGuests,
  hideDates,
  sentinels,
  testIdPrefix,
}: HotelCardBodyProps) {
  const address = shown(h.hotel_address, sentinels);
  const names = showGuests
    ? (Array.isArray(h.names) ? h.names : []).filter((n) => shown(n, sentinels) !== null)
    : [];
  const showDates = !hideDates && Boolean(h.check_in || h.check_out);
  const nights = nightsBetween(h.check_in, h.check_out);
  const confirmation = showConfirmation ? shown(h.confirmation_no, sentinels) : null;
  const notes = showNotes ? shown(h.notes, sentinels) : null;
  return (
    <div
      data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-hotel-card` : undefined}
      // warning-card-fixes §5.5: the card jump's target (same idiom as data-room-nav).
      data-hotel-index={jumpIndex}
      // warning-card-fixes §15 (UI gate P3): the card is a jump's focus target, so it is a
      // group named by its own hotel name.
      role="group"
      aria-labelledby={nameId}
      className={
        flat
          ? "@container flex flex-col gap-3"
          : "@container flex flex-col gap-3 rounded-md border border-border p-4"
      }
    >
      {/* §5.4: the judgment marker sits above the hotel name. The card paints no fill
          of its own, so the tag's plate is the panel's surface in both layouts. */}
      {marker}
      <div className="min-w-0">
        <p id={nameId} className="wrap-break-word text-base font-semibold text-text-strong">
          {hotelCardLabel(h)}
        </p>
        {address ? (
          <p className="mt-0.5 flex items-start gap-1.5 text-sm text-text-subtle">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 wrap-break-word">{address}</span>
          </p>
        ) : null}
      </div>

      {showDates ? (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-md bg-surface-sunken px-4 py-3 @2xs:flex-nowrap">
          <StayEnd label="Check in" value={h.check_in} testId="hotel-stay-check-in" />
          {/* One row from an 18rem card up: the connector sits between the dates. Below
              that (a 320px phone, or enlarged text, since the query is in rem) it drops
              to its own full-width row under them instead of painting over them. The
              ends top-align so their labels line up when one end is "Not listed".
              The line is a standalone 1px rule, so it takes the text-faint hairline
              ramp (DESIGN.md §1.2a). It is a ::before BORDER, not a fill: a background
              vanishes in forced-colors mode, and the pseudo-element means no childless
              flex-1 span exists. Without a night count it has nothing to say on its
              own row, so it only shows in the one-row layout. */}
          <div
            className={cn(
              "relative order-last basis-full items-center justify-center self-center before:absolute before:inset-x-0 before:top-1/2 before:-translate-y-1/2 before:border-t before:border-text-faint @2xs:order-0 @2xs:min-w-fit @2xs:flex-1 @2xs:basis-0",
              nights === null ? "hidden @2xs:flex" : "flex",
            )}
          >
            {nights !== null ? (
              <span
                data-testid="hotel-stay-nights"
                className="relative whitespace-nowrap bg-surface-sunken px-2 text-xs font-semibold tabular-nums text-text-subtle"
              >
                {nights} {nights === 1 ? "night" : "nights"}
              </span>
            ) : null}
          </div>
          <StayEnd label="Check out" value={h.check_out} testId="hotel-stay-check-out" alignEnd />
        </div>
      ) : null}

      {/* The stay's confirmation number and notes (crew). The confirmation is a code
          someone reads back, so it takes the slashed zero (DESIGN.md §2.4). */}
      {confirmation !== null || notes !== null ? (
        <dl className="flex flex-col gap-2">
          {confirmation !== null ? (
            <div className="min-w-0">
              <dt className={CELL_EYEBROW_CLASS}>Confirmation</dt>
              <dd className="code-value mt-1 wrap-break-word text-sm text-text">{confirmation}</dd>
            </div>
          ) : null}
          {notes !== null ? (
            <div className="min-w-0">
              <dt className={CELL_EYEBROW_CLASS}>Notes</dt>
              <dd className="mt-1 wrap-break-word text-sm text-text-subtle">{notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {names.length > 0 ? (
        <div>
          <p id={guestsLabelId} className={CELL_EYEBROW_CLASS}>
            Guests
          </p>
          {/* Explicit role: preflight's list-style:none makes Safari drop list
              semantics, and with them the guest count. */}
          <ul role="list" aria-labelledby={guestsLabelId} className="mt-2 flex flex-wrap gap-2">
            {names.map((n, idx) => (
              <li
                key={`${n}-${idx}`}
                data-testid="hotel-guest-chip"
                className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-pill border border-border py-0.5 pl-0.5 pr-3 text-sm text-text"
              >
                <MiniAvatar
                  name={n}
                  testId="hotel-guest-avatar"
                  sizeClass="size-6 text-[10px]"
                  ringed={false}
                />
                <span data-testid="hotel-guest-name" className="min-w-0 wrap-break-word">
                  {n}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
