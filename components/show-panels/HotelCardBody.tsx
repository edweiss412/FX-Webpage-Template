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
 * - Crew (`hotelsPanel`, components/crew/sections/hotelsRows.ts, plan Task 9):
 *   `showConfirmation: true`, `showNotes: true`, `showGuests: false`,
 *   `hideDates` when the viewer's dates are suppressed, sentinels hidden,
 *   `placeholders: false` (a nameless stay is not called "Hotel" and a missing
 *   stay end is not "Not listed": the crew card showed neither), and a search
 *   target per line (`targets`).
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

/** Search targets by line (crew); the admin passes none, so its DOM carries no marker. */
export type HotelCardBodyTargets = {
  name?: string;
  address?: string;
  checkIn?: string;
  checkOut?: string;
  confirmation?: string;
  notes?: string;
};

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
  /**
   * true (the default, admin): a blank hotel name reads "Hotel" and a missing
   * stay end "Not listed". false (crew): neither renders, as the crew card
   * showed only the fields a reservation has.
   */
  placeholders?: boolean;
  /**
   * Search targets (crew). Given, the night count is skipped and each stay end's
   * text reads as words (its label, day, month and weekday spaced apart), so the
   * line its target names can be indexed.
   */
  targets?: HotelCardBodyTargets;
};

/** One end of the stay as the card writes it: the date stub's parts, raw text, or nothing. */
export type StayEndText =
  | { kind: "date"; iso: string; day: string; month: string; weekday: string }
  | { kind: "raw"; text: string }
  | { kind: "missing" };

/** What the card renders, field by field: the crew index reads it, so the two cannot disagree. */
export type HotelCardLines = {
  /** The name line, or null when it renders none (a blank name without placeholders). */
  name: string | null;
  address: string | null;
  /** Null when the stub does not render that end. */
  checkIn: StayEndText | null;
  checkOut: StayEndText | null;
  confirmation: string | null;
  notes: string | null;
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

function stayEnd(value: string | null): StayEndText {
  const parts = value ? dateStubParts(value) : null;
  if (parts === null) return { kind: "missing" };
  if (parts.kind === "raw") return { kind: "raw", text: parts.text };
  return {
    kind: "date",
    iso: value ?? "",
    day: parts.day,
    month: parts.month,
    weekday: parts.weekday,
  };
}

/**
 * The lines the card renders for these props, in render order. The body renders
 * from this, and the crew search index reads it (spec §2.4).
 */
export function hotelCardLines(
  h: HotelReservationRow,
  {
    showConfirmation,
    showNotes,
    hideDates,
    sentinels,
    placeholders = true,
  }: Pick<
    HotelCardBodyProps,
    "showConfirmation" | "showNotes" | "hideDates" | "sentinels" | "placeholders"
  >,
): HotelCardLines {
  const showDates = !hideDates && Boolean(h.check_in || h.check_out);
  const end = (value: string | null): StayEndText | null =>
    !showDates || (!placeholders && !value) ? null : stayEnd(value);
  return {
    name: placeholders ? hotelCardLabel(h) : h.hotel_name || null,
    address: shown(h.hotel_address, sentinels),
    checkIn: end(h.check_in),
    checkOut: end(h.check_out),
    confirmation: showConfirmation ? shown(h.confirmation_no, sentinels) : null,
    notes: showNotes ? shown(h.notes, sentinels) : null,
  };
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
  end,
  testId,
  alignEnd = false,
  searchTarget,
  spaced,
}: {
  label: string;
  end: StayEndText;
  testId: string;
  alignEnd?: boolean;
  /** The end's search target (crew). */
  searchTarget: string | undefined;
  /**
   * Space the end's text nodes apart (crew, with targets). Every space falls
   * between block or flex boxes, where white space lays out nothing, so only the
   * text reads differently: "Check in 10 Apr Friday", not "Check in10AprFriday".
   */
  spaced: boolean;
}) {
  const gap = spaced ? " " : null;
  return (
    <div
      data-testid={testId}
      data-search-target={searchTarget}
      className={cn("min-w-0", alignEnd && "text-right")}
    >
      <p className={CELL_EYEBROW_CLASS}>{label}</p>
      {gap}
      {end.kind === "missing" ? (
        <p className="mt-1 text-sm font-medium text-text-subtle">Not listed</p>
      ) : end.kind === "raw" ? (
        <p className="mt-1 wrap-break-word text-xl font-bold text-text-strong">{end.text}</p>
      ) : (
        <time dateTime={end.iso} className="mt-1 block">
          <span
            className={cn("flex items-baseline gap-1.5 tabular-nums", alignEnd && "justify-end")}
          >
            <span className="text-3xl font-bold leading-none tracking-daynum text-text-strong">
              {end.day}
            </span>
            {gap}
            <span className="text-sm font-semibold text-text-strong">{end.month}</span>
          </span>
          {gap}
          <span className="mt-1 block text-xs text-text-subtle">{end.weekday}</span>
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
  placeholders = true,
  targets,
}: HotelCardBodyProps) {
  const lines = hotelCardLines(h, {
    showConfirmation,
    showNotes,
    hideDates,
    sentinels,
    placeholders,
  });
  const { name, address, checkIn, checkOut, confirmation, notes } = lines;
  const names = showGuests
    ? (Array.isArray(h.names) ? h.names : []).filter((n) => shown(n, sentinels) !== null)
    : [];
  const nights = nightsBetween(h.check_in, h.check_out);
  const spaced = targets !== undefined;
  return (
    <div
      data-testid={testIdPrefix !== undefined ? `${testIdPrefix}-hotel-card` : undefined}
      // warning-card-fixes §5.5: the card jump's target (same idiom as data-room-nav).
      data-hotel-index={jumpIndex}
      // warning-card-fixes §15 (UI gate P3): the card is a jump's focus target, so it is a
      // group named by its own hotel name (when it renders one).
      role="group"
      aria-labelledby={name !== null ? nameId : undefined}
      className={
        flat
          ? "@container flex flex-col gap-3"
          : "@container flex flex-col gap-3 rounded-md border border-border p-4"
      }
    >
      {/* §5.4: the judgment marker sits above the hotel name. The card paints no fill
          of its own, so the tag's plate is the panel's surface in both layouts. */}
      {marker}
      {name !== null || address ? (
        <div className="min-w-0">
          {name !== null ? (
            <p
              id={nameId}
              data-search-target={targets?.name}
              className="wrap-break-word text-base font-semibold text-text-strong"
            >
              {name}
            </p>
          ) : null}
          {address ? (
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-text-subtle">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span data-search-target={targets?.address} className="min-w-0 wrap-break-word">
                {address}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {checkIn !== null || checkOut !== null ? (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 rounded-md bg-surface-sunken px-4 py-3 @2xs:flex-nowrap">
          {checkIn !== null ? (
            <StayEnd
              label="Check in"
              end={checkIn}
              testId="hotel-stay-check-in"
              searchTarget={targets?.checkIn}
              spaced={spaced}
            />
          ) : null}
          {/* One row from an 18rem card up: the connector sits between the dates. Below
              that (a 320px phone, or enlarged text, since the query is in rem) it drops
              to its own full-width row under them instead of painting over them. The
              ends top-align so their labels line up when one end is "Not listed".
              The line is a standalone 1px rule, so it takes the text-faint hairline
              ramp (DESIGN.md §1.2a). It is a ::before BORDER, not a fill: a background
              vanishes in forced-colors mode, and the pseudo-element means no childless
              flex-1 span exists. Without a night count it has nothing to say on its
              own row, so it only shows in the one-row layout. Without placeholders a stay
              with one end draws no connector: there is nothing on its other side. */}
          {checkIn !== null && checkOut !== null ? (
            <div
              {...(spaced ? { "data-search-skip": "" } : {})}
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
          ) : null}
          {checkOut !== null ? (
            <StayEnd
              label="Check out"
              end={checkOut}
              testId="hotel-stay-check-out"
              alignEnd
              searchTarget={targets?.checkOut}
              spaced={spaced}
            />
          ) : null}
        </div>
      ) : null}

      {/* The stay's confirmation number and notes (crew). The confirmation is a code
          someone reads back, so it takes the slashed zero (DESIGN.md §2.4). */}
      {confirmation !== null || notes !== null ? (
        <dl className="flex flex-col gap-2">
          {confirmation !== null ? (
            <div data-search-target={targets?.confirmation} className="min-w-0">
              <dt className={CELL_EYEBROW_CLASS}>Confirmation</dt>
              <dd className="code-value mt-1 wrap-break-word text-sm text-text">{confirmation}</dd>
            </div>
          ) : null}
          {notes !== null ? (
            <div data-search-target={targets?.notes} className="min-w-0">
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
