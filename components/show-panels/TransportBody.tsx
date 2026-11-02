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
 * Plain props, hook-free, no context: the crew page calls it as a function
 * inside `WrappedSection`'s render callback (spec §6.1, error containment).
 */
import type { ReactNode } from "react";
import { Mail, Phone } from "lucide-react";

import { CELL_EYEBROW_CLASS } from "@/components/show-panels/FieldRowList";
import { MiniAvatar } from "@/components/show-panels/MiniAvatar";
import type { TransportationRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

export type TransportBodyProps = {
  /** The transport row, already gated by the caller. */
  transport: TransportationRow;
  /** A phone's call link, or null for plain text. */
  telHref: (phone: string) => string | null;
  /** An email's link, or null for plain text. */
  mailtoHref: (email: string) => string | null;
  /** false: no contact is a link, whatever the builders return. */
  linkifyContacts: boolean;
  /** No leg date reaches the formatter: the viewer's dates are suppressed (crew). */
  hideDates: boolean;
  /** A route leg's time line from its date (null under `hideDates`) and time. "" renders none. */
  legTime: (date: string | null, time: string | null) => string;
  /** "show": a sentinel renders as parsed (admin). "hide": its field is omitted (crew). */
  sentinels: "show" | "hide";
  /**
   * "drop" (the default, admin): a leg needs a stage to be on the route. "keep"
   * (crew): a leg without one stays when it has a time line or riders.
   */
  stagelessLegs?: "drop" | "keep";
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

/** A route node: a schedule leg, its stage (null only under `stagelessLegs: "keep"`), time line and riders. */
export type TransportRouteLeg = { stage: string | null; when: string; names: string[] };

/** A contact cell's lines, each null when the surface does not render it. */
export type TransportContact = { name: string | null; phone: string | null; email: string | null };

/**
 * The cells and notes the body renders, field by field: the body renders from
 * this and the crew search index reads it, so the two cannot disagree. A cell
 * is null when it renders nothing.
 */
export type TransportBodyFields = {
  driver: TransportContact | null;
  loadout: TransportContact | null;
  /** The vehicle and its plate and colour, in render order. */
  vehicle: { vehicle: string | null; subs: string[] } | null;
  parking: string | null;
  notes: string | null;
};

/** A value to render, or null: blank, or a sentinel the surface hides. */
function shown(value: string | null, sentinels: "show" | "hide"): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return sentinels === "hide" && shouldHideGenericOptional(value) ? null : value;
}

/**
 * The route legs the body renders: each schedule leg with a real stage, with its
 * time line and any assigned riders (review completeness). The admin's section
 * count reads this list too, so the count and the timeline cannot disagree.
 */
export function transportRouteLegs(
  transport: TransportationRow,
  {
    hideDates,
    legTime,
    sentinels,
    stagelessLegs = "drop",
  }: Pick<TransportBodyProps, "hideDates" | "legTime" | "sentinels" | "stagelessLegs">,
): TransportRouteLeg[] {
  const legs = Array.isArray(transport.schedule) ? transport.schedule : [];
  const out: TransportRouteLeg[] = [];
  for (const leg of legs) {
    const stage = shown(leg.stage, sentinels);
    if (stage === null && stagelessLegs !== "keep") continue;
    const date = hideDates ? null : shown(leg.date, sentinels);
    const when = legTime(date, shown(leg.time, sentinels));
    const names = (Array.isArray(leg.assigned_names) ? leg.assigned_names : []).filter(
      (n) => shown(n, sentinels) !== null,
    );
    // A kept stage-less leg still needs something to show.
    if (stage === null && when === "" && names.length === 0) continue;
    out.push({ stage, when, names });
  }
  return out;
}

/** The cells and notes this transport row renders under these sentinels. */
export function transportBodyFields(
  t: TransportationRow,
  sentinels: "show" | "hide",
): TransportBodyFields {
  const field = (value: string | null) => shown(value, sentinels);
  const contact = (
    name: string | null,
    phone: string | null,
    email: string | null,
  ): TransportContact | null => {
    const c = { name: field(name), phone: field(phone), email: field(email) };
    return c.name !== null || c.phone !== null || c.email !== null ? c : null;
  };
  const vehicle = field(t.vehicle);
  const subs = [field(t.license_plate), field(t.color)].filter((x): x is string => x !== null);
  return {
    driver: contact(t.driver_name, t.driver_phone, t.driver_email),
    loadout: contact(t.loadout_name, t.loadout_phone, t.loadout_email),
    vehicle: vehicle !== null || subs.length > 0 ? { vehicle, subs } : null,
    parking: field(t.parking),
    notes: field(t.notes),
  };
}

/** One sunken spec cell in the compact transport strip: eyebrow + stacked lines. */
function TransportCell({
  label,
  searchTarget,
  children,
}: {
  label: string;
  /** The cell's search target (crew): the cell is one line. */
  searchTarget?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      data-search-target={searchTarget}
      className="flex min-w-0 flex-col items-center gap-1 rounded-md bg-surface-sunken px-3 py-2 text-center"
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
}) {
  return (
    <TransportCell label={label} searchTarget={searchTarget}>
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

export function TransportBody(props: TransportBodyProps) {
  const { transport: t, telHref, mailtoHref, linkifyContacts, sentinels, targets } = props;
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
        <div className="grid grid-cols-2 items-start gap-2 min-[560px]:grid-cols-3">
          {driver !== null ? (
            <ContactCell
              label="Driver"
              {...driver}
              telHref={tel(driver.phone)}
              mailtoHref={mailto(driver.email)}
              searchTarget={targets?.driver}
              searchSkip={skip}
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
          <ol className="relative flex justify-between gap-2">
            <span aria-hidden="true" className="absolute inset-x-[8%] top-[6px] h-0.5 bg-border" />
            {routeLegs.map((leg, i) => (
              <li
                key={`${leg.stage}-${i}`}
                data-search-target={targets?.legs?.[i]}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  aria-hidden="true"
                  className={`box-border size-3.5 rounded-pill ring-2 ring-surface ${
                    i % 2 === 0 ? "bg-accent-on-bg" : "border-2 border-border-strong bg-surface"
                  }`}
                />
                <span className="min-w-0">
                  {leg.stage !== null ? (
                    <span className="block wrap-break-word text-xs font-semibold text-text-strong">
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
                      {leg.when}
                    </span>
                  ) : null}
                  {leg.names.length > 0 ? (
                    <span
                      className={`${leg.stage !== null || leg.when ? "mt-0.5 " : ""}block wrap-break-word text-[11px] text-text-faint`}
                    >
                      {leg.names.join(", ")}
                    </span>
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
