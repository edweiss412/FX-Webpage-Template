/**
 * components/show-panels/TransportBody.tsx
 *
 * The transport body both surfaces render (crew page redesign spec §6.2,
 * `transport` row, line 308): the admin's compact transport body (spec "1b
 * Compact"), shared. A responsive spec strip of Driver / Load out / Vehicle /
 * Parking cells (each present only when it has real content) above a horizontal
 * Route timeline of the schedule legs, with the free-text transport notes last.
 *
 * - Admin (`TransportBreakdown`, components/admin/wizard/step3ReviewSections.tsx):
 *   contacts linked through `ContactCell`'s digits-and-plus `tel:` rule and a
 *   plain `mailto:`, each leg's time line its `[date, time]` joined, sentinels as
 *   parsed (the plate and colour muted).
 * - Crew (`transportPanel`, components/crew/sections/transportRows.ts, plan
 *   Task 9): rendered only when `transportTileVisible` holds, the crew's
 *   digits-only `telHref`, `hideDates` when the viewer's dates are suppressed,
 *   its own "leaves" time line, legs without a stage kept (`stagelessLegs`), as
 *   the crew page kept them, and a search target per cell, leg and the notes.
 *
 * The body never builds a `tel:` or `mailto:` href (spec line 292): each
 * surface passes its builders, and a value whose builder returns null, or any
 * value when the surface does not linkify, renders as plain text.
 *
 * Crew presentation (PR B invariant-8 UI gate rows 1, 2, 3, 8 and 16), each a
 * prop whose default is the admin's markup:
 *
 * - `layout: "container"`: the switches read the crew section's container
 *   (`@min-crew-split:`, DESIGN.md §6), never the viewport. Below the threshold
 *   the route is a vertical list (a dot, then the leg's lines), since a phone's
 *   or a sheet's width cannot fit eight legs side by side without their words
 *   painting over each other; the horizontal rail starts at the threshold.
 * - `routeMarkers: "neutral"`: one bordered neutral dot per leg and connectors
 *   drawn as borders, which forced colors keep (DESIGN.md §17); no leg carries a
 *   "now" state, so none is accent.
 * - `riders: "with"`: the riders line as the crew's Travel card wrote it on main,
 *   "With" and the names, readable rather than faint.
 * - A leg-time formatter may return a lead-in and a dated part, which renders in
 *   a `<time dateTime>`.
 *
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment).
 * The field and leg derivations live in transportLegs.ts, JSX-free, so the
 * crew's client-reachable peek can read them without this module (gate row 9).
 */
import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";

import { CELL_EYEBROW_CLASS } from "@/components/show-panels/FieldRowList";
import { MiniAvatar } from "@/components/show-panels/MiniAvatar";
import {
  transportBodyFields,
  transportRouteLegs,
  type TransportLegOptions,
  type TransportRouteLeg,
} from "@/components/show-panels/transportLegs";
import type { TransportationRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export {
  transportBodyFields,
  transportRidersText,
  transportRouteLegs,
  type LegTimeLine,
  type TransportBodyFields,
  type TransportContact,
  type TransportLegOptions,
  type TransportRouteLeg,
} from "@/components/show-panels/transportLegs";

export type TransportBodyProps = TransportLegOptions & {
  /** The transport row, already gated by the caller. */
  transport: TransportationRow;
  /** A phone's call link, or null for plain text. */
  telHref: (phone: string) => string | null;
  /** An email's link, or null for plain text. */
  mailtoHref: (email: string) => string | null;
  /** false: no contact is a link, whatever the builders return. */
  linkifyContacts: boolean;
  /**
   * "viewport" (the default, admin): three cells a row from a 560px window and
   * the route always a horizontal rail. "container" (crew): both switch at the
   * crew section container's `@min-crew-split` (DESIGN.md §6), and below it the
   * route is a vertical list.
   */
  layout?: "viewport" | "container";
  /**
   * "alternating" (the default, admin): every other dot an accent fill, the
   * connector a fill. "neutral" (crew): every dot the same bordered neutral, each
   * connector a border.
   */
  routeMarkers?: "alternating" | "neutral";
  /** "names" (the default, admin): the riders alone, faint. "with" (crew): "With" and the names. */
  riders?: "names" | "with";
  /** Search targets (crew). Given, the avatars and the Route eyebrow are skipped. */
  targets?: TransportBodyTargets;
};

/** Search targets by cell, by route leg (in `transportRouteLegs` order) and for the notes. */
export type TransportBodyTargets = {
  driver?: string | undefined;
  loadout?: string | undefined;
  vehicle?: string | undefined;
  parking?: string | undefined;
  legs?: readonly (string | undefined)[];
  notes?: string | undefined;
};

/** One sunken spec cell in the compact transport strip: eyebrow + stacked lines. */
function TransportCell({
  label,
  searchTarget,
  wide = false,
  children,
}: {
  label: string;
  /** The cell's search target (crew): the cell is one line. */
  searchTarget?: string | undefined;
  /**
   * Take the strip's full row below the crew threshold, one column from it (a
   * crew contact cell, PR B invariant-8 gate row 3: its 44px phone and email
   * chips need the width a half cell lacks on a phone).
   */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-search-target={searchTarget}
      className={
        wide
          ? "col-span-2 flex min-w-0 flex-col items-center gap-1 rounded-md bg-surface-sunken px-3 py-2 text-center @min-crew-split:col-span-1"
          : "flex min-w-0 flex-col items-center gap-1 rounded-md bg-surface-sunken px-3 py-2 text-center"
      }
    >
      <span className={CELL_EYEBROW_CLASS}>{label}</span>
      {/* No `flex-1`/`justify-center`: with `items-start` on the grid the cell no longer
          stretches, so there is never surplus height to grow into or centre within. */}
      <div className="flex w-full flex-col items-center gap-1">{children}</div>
    </div>
  );
}

/** Driver / Load-out contact cell — avatar + name, phone + email through the surface's builders. */
function ContactCell({
  label,
  name,
  phone,
  email,
  telHref,
  mailtoHref,
  searchTarget,
  searchSkip,
  wide,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  /** The phone's link, or null for plain text. */
  telHref: string | null;
  /** The email's link, or null for plain text. */
  mailtoHref: string | null;
  searchTarget: string | undefined;
  /** Skip the avatar's initials in search (crew, with targets): they are not sheet text. */
  searchSkip: boolean;
  /** The full row below the crew threshold (`layout: "container"`). */
  wide: boolean;
}) {
  return (
    <TransportCell label={label} searchTarget={searchTarget} wide={wide}>
      {name !== null ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <MiniAvatar name={name} sizeClass="size-5 text-[8px]" searchSkip={searchSkip} />
          <span className="min-w-0 wrap-break-word text-xs font-medium text-text">{name}</span>
        </span>
      ) : null}
      {phone !== null ? (
        telHref !== null ? (
          <a
            href={telHref}
            // Tap floor (spec 2026-08-10 §2, site 6) as a full-width CHIP ROW
            // (spec 2026-08-15-step3-tap-cluster §2.3). `min-h-tap-min` still carries the floor;
            // what is new is that the 44px reads as a row instead of a void. `w-full` is
            // deliberate and is the OPPOSITE of the shrink-wrap contract sites 4/8 keep: a
            // `border-text-faint` chip on the cell's `bg-surface-sunken` ground gives the
            // target a visible edge AT REST, which is the affordance the venue floor requires
            // (PRODUCT.md:59 — phones cannot hover, so `hover:` alone is an invisible target).
            // The house focus ring is new here too; these links carried no focus treatment.
            // The outline is `border-text-faint`, NOT a border token: a control edge that has to
            // stand on its own needs text-grade contrast (DESIGN.md §1.2a). `border-border` here
            // measures 1.15:1 against the sunken cell — an edge that exists in the DOM and is
            // invisible on the floor. `text-faint` is the pinned 3.02:1 light / 4.11:1 dark row
            // (DESIGN.md §1.2), the same recipe the shared secondary-action button uses for
            // its own boundary.
            className="flex w-full min-h-tap-min min-w-0 items-center justify-center gap-1 rounded-sm border border-text-faint bg-surface px-2 text-[11px] tabular-nums text-text hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
          >
            <Phone className="size-3 shrink-0" aria-hidden="true" />
            {/* Same containment as the email chip below: the number is as-parsed, so an
                unbroken string (no spaces) would otherwise set the flex item's automatic
                min-width to its full width and push past a ~165px cell at 390px. */}
            <span className="min-w-0 wrap-break-word">{phone}</span>
          </a>
        ) : (
          // Not a link (the surface does not linkify, or its builder refused the
          // number): the same line as plain text, with no chip edge, since an edge
          // at rest is the affordance that says "tap me".
          <span className="flex w-full min-w-0 items-center justify-center gap-1 px-2 text-[11px] tabular-nums text-text">
            <Phone className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 wrap-break-word">{phone}</span>
          </span>
        )
      ) : null}
      {email !== null ? (
        mailtoHref !== null ? (
          <a
            href={mailtoHref}
            // Site 7 — the same chip recipe as the tel: link above, plus `mt-1.5`. That margin
            // rides on top of the body's `gap-1` to put 10px between the two targets: they are
            // both 44px now, and 6px of separation made "email the driver" and "dial the driver
            // mid-show" a thumb-width apart. It is UNCONDITIONAL, so a phone-less cell carries
            // 6px of leading dead space — accepted (spec §7 limit 4) over a conditional
            // className, which is the non-literal shape BL-TAP-TARGET-STRUCTURAL-GUARD records
            // as the corpus guard's blocker.
            className="mt-1.5 flex w-full min-h-tap-min min-w-0 items-center justify-center gap-1 rounded-sm border border-text-faint bg-surface px-2 text-[11px] text-text hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-sunken"
          >
            <Mail className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 wrap-break-word">{email}</span>
          </a>
        ) : (
          <span className="flex w-full min-w-0 items-center justify-center gap-1 px-2 text-[11px] text-text">
            <Mail className="size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 wrap-break-word">{email}</span>
          </span>
        )
      ) : null}
    </TransportCell>
  );
}

/** A route connector: a fill (the admin's) or a border, which forced colors keep (crew). */
function connectorClass(markers: "alternating" | "neutral", axis: "x" | "y"): string {
  if (markers === "alternating") return axis === "x" ? "h-0.5 bg-border" : "w-0.5 bg-border";
  return axis === "x" ? "border-t-2 border-border" : "border-l-2 border-border";
}

/** A leg's dot: the admin's alternating accent and outline, or one bordered neutral. */
function dotClass(markers: "alternating" | "neutral", index: number): string {
  if (markers === "neutral")
    return "box-border size-3.5 shrink-0 rounded-pill border-2 border-border-strong bg-surface ring-2 ring-surface";
  return `box-border size-3.5 rounded-pill ring-2 ring-surface ${
    index % 2 === 0 ? "bg-accent-on-bg" : "border-2 border-border-strong bg-surface"
  }`;
}

/** A leg's time line: its text, with a dated part in a `<time>` when the formatter gave one. */
function legWhen(leg: TransportRouteLeg): ReactNode {
  if (leg.time === undefined) return leg.when;
  return (
    <>
      {leg.time.lead}
      <time dateTime={leg.time.dateTime}>{leg.time.text}</time>
    </>
  );
}

export function TransportBody(props: TransportBodyProps) {
  const { transport: t, telHref, mailtoHref, linkifyContacts, sentinels, targets } = props;
  const layout = props.layout ?? "viewport";
  const markers = props.routeMarkers ?? "alternating";
  const riders = props.riders ?? "names";
  const contained = layout === "container";
  const {
    driver,
    loadout,
    vehicle: vehicleCell,
    parking,
    notes,
  } = transportBodyFields(t, sentinels);
  const tel = (phone: string | null) => (phone !== null && linkifyContacts ? telHref(phone) : null);
  const mailto = (email: string | null) =>
    email !== null && linkifyContacts ? mailtoHref(email) : null;
  const skip = targets !== undefined;

  const cellCount = [driver, loadout, vehicleCell, parking].filter((c) => c !== null).length;
  const routeLegs = transportRouteLegs(t, props);

  return (
    <div className="flex flex-col gap-4">
      {cellCount > 0 ? (
        // `items-start` (spec 2026-08-15-step3-tap-cluster §2.2): grid items stretch by
        // default, so a one-line Vehicle or Parking cell was dragged to the height of a
        // contact cell whose two 44px tap targets make it ~160px — a large sunken panel
        // around ~34px of content, which reads as broken rather than spacious.
        <div
          className={
            contained
              ? "grid grid-cols-2 items-start gap-2 @min-crew-split:grid-cols-3"
              : "grid grid-cols-2 items-start gap-2 min-[560px]:grid-cols-3"
          }
        >
          {driver !== null ? (
            <ContactCell
              label="Driver"
              {...driver}
              telHref={tel(driver.phone)}
              mailtoHref={mailto(driver.email)}
              searchTarget={targets?.driver}
              searchSkip={skip}
              wide={contained}
            />
          ) : null}
          {loadout !== null ? (
            <ContactCell
              label="Load out"
              {...loadout}
              telHref={tel(loadout.phone)}
              mailtoHref={mailto(loadout.email)}
              searchTarget={targets?.loadout}
              searchSkip={skip}
              wide={contained}
            />
          ) : null}
          {vehicleCell !== null ? (
            <TransportCell label="Vehicle" searchTarget={targets?.vehicle}>
              {vehicleCell.vehicle !== null ? (
                <span className="wrap-break-word text-xs font-medium text-text">
                  {vehicleCell.vehicle}
                </span>
              ) : null}
              {vehicleCell.subs.map((s, i) => (
                <span
                  key={i}
                  className={`wrap-break-word text-[11px] ${
                    shouldHideGenericOptional(s) ? "text-text-faint" : "text-text-subtle"
                  }`}
                >
                  {s}
                </span>
              ))}
            </TransportCell>
          ) : null}
          {parking !== null ? (
            <TransportCell label="Parking" searchTarget={targets?.parking}>
              <span className="wrap-break-word text-xs font-medium text-text">{parking}</span>
            </TransportCell>
          ) : null}
        </div>
      ) : null}

      {routeLegs.length > 0 ? (
        <div>
          <p {...(skip ? { "data-search-skip": "" } : {})} className={`${CELL_EYEBROW_CLASS} mb-3`}>
            Route
          </p>
          {/* Below the crew threshold the route is a vertical list: each leg a row,
              its dot, then its lines, with a segment down to the next leg's dot.
              From the threshold (and always for the admin) it is the horizontal
              rail, one line behind every dot. */}
          <ol
            className={
              contained
                ? "relative flex flex-col gap-3 @min-crew-split:flex-row @min-crew-split:justify-between @min-crew-split:gap-2"
                : "relative flex justify-between gap-2"
            }
          >
            <span
              aria-hidden="true"
              className={`${contained ? "hidden @min-crew-split:block " : ""}absolute inset-x-[8%] top-[6px] ${connectorClass(markers, "x")}`}
            />
            {routeLegs.map((leg, i) => (
              <li
                key={`${leg.stage}-${i}`}
                data-search-target={targets?.legs?.[i]}
                className={
                  contained
                    ? "relative flex min-w-0 items-start gap-3 @min-crew-split:flex-1 @min-crew-split:flex-col @min-crew-split:items-center @min-crew-split:gap-2 @min-crew-split:text-center"
                    : "relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
                }
              >
                {contained && i < routeLegs.length - 1 ? (
                  // From under this dot (3px down, 14px tall) to the top of the next
                  // leg's (the list's 12px gap, then its 3px).
                  <span
                    aria-hidden="true"
                    className={`absolute top-[17px] bottom-[-15px] left-[6px] @min-crew-split:hidden ${connectorClass(markers, "y")}`}
                  />
                ) : null}
                <span
                  aria-hidden="true"
                  className={
                    contained
                      ? `${dotClass(markers, i)} mt-[3px] @min-crew-split:mt-0`
                      : dotClass(markers, i)
                  }
                />
                <span
                  className={contained ? "min-w-0 flex-1 @min-crew-split:flex-none" : "min-w-0"}
                >
                  {leg.stage !== null ? (
                    <span
                      className={
                        contained
                          ? "block wrap-break-word text-sm font-semibold text-text-strong @min-crew-split:text-xs"
                          : "block wrap-break-word text-xs font-semibold text-text-strong"
                      }
                    >
                      {leg.stage}
                    </span>
                  ) : null}
                  {/* Each line's top margin separates it from the line above, so the
                      first line of a crew leg kept without a stage takes none: a
                      margin above nothing is a seam no element accounts for. */}
                  {leg.when ? (
                    <span
                      className={`${leg.stage !== null ? "mt-0.5 " : ""}block text-[11px] tabular-nums text-text-subtle`}
                    >
                      {legWhen(leg)}
                    </span>
                  ) : null}
                  {leg.names.length > 0 ? (
                    riders === "with" ? (
                      // The crew's riders line (gate row 2): "With" and the names, as the
                      // Travel card wrote it on main, readable rather than faint.
                      <span
                        className={`${leg.stage !== null || leg.when ? "mt-0.5 " : ""}block wrap-break-word text-xs text-text-subtle`}
                      >
                        With <span className="text-text">{leg.names.join(", ")}</span>
                      </span>
                    ) : (
                      <span
                        className={`${leg.stage !== null || leg.when ? "mt-0.5 " : ""}block wrap-break-word text-[11px] text-text-faint`}
                      >
                        {leg.names.join(", ")}
                      </span>
                    )
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {notes !== null ? (
        <p data-search-target={targets?.notes} className="wrap-break-word text-sm text-text-subtle">
          {notes}
        </p>
      ) : null}
    </div>
  );
}
