/**
 * components/show-panels/transportLegs.ts
 *
 * The transport body's field and route-leg derivations, without its markup.
 * `TransportBody` renders from these, the crew search index and the "All
 * sections" peek read them, and the admin's section count reads the leg list,
 * so none of them can disagree about which cells and legs exist.
 *
 * JSX-free on purpose (PR B invariant-8 gate, row 9): the peek
 * (lib/crew/sectionPeek.ts) is reachable from the crew page's client bundle, and
 * importing these from TransportBody.tsx pulled the body, its avatar and the
 * field list into that chunk, never executed there.
 *
 * Pure and server-safe.
 */
import type { TransportationRow } from "@/lib/parser/types";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";

/**
 * A leg's time line as a surface words it: plain text (the admin's `[date,
 * time]`), or a lead-in and a date-and-time the body puts in a `<time>` whose
 * `dateTime` is the leg's ISO date (the crew's "leaves Wed Mar 18, 2:00 PM").
 * "" renders none.
 */
export type LegTimeLine = string | { lead: string; text: string; dateTime: string };

/** The options a route leg's derivation reads, shared by the body and its readers. */
export type TransportLegOptions = {
  /** No leg date reaches the formatter: the viewer's dates are suppressed (crew). */
  hideDates: boolean;
  /** A route leg's time line from its date (null under `hideDates`) and time. */
  legTime: (date: string | null, time: string | null) => LegTimeLine;
  /** "show": a sentinel renders as parsed (admin). "hide": its field is omitted (crew). */
  sentinels: "show" | "hide";
  /**
   * "drop" (the default, admin): a leg needs a stage to be on the route. "keep"
   * (crew): a leg without one stays when it has a time line or riders.
   */
  stagelessLegs?: "drop" | "keep";
};

/**
 * A route node: a schedule leg, its stage (null only under `stagelessLegs:
 * "keep"`), its time line as text, and its riders. `time` is present only when
 * the formatter gave a machine-readable date, so a plain-text leg's object is
 * exactly `{ stage, when, names }`.
 */
export type TransportRouteLeg = {
  stage: string | null;
  when: string;
  time?: { lead: string; text: string; dateTime: string };
  names: string[];
};

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
export function shownTransportValue(
  value: string | null,
  sentinels: "show" | "hide",
): string | null {
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
  { hideDates, legTime, sentinels, stagelessLegs = "drop" }: TransportLegOptions,
): TransportRouteLeg[] {
  const legs = Array.isArray(transport.schedule) ? transport.schedule : [];
  const out: TransportRouteLeg[] = [];
  for (const leg of legs) {
    const stage = shownTransportValue(leg.stage, sentinels);
    if (stage === null && stagelessLegs !== "keep") continue;
    const date = hideDates ? null : shownTransportValue(leg.date, sentinels);
    const line = legTime(date, shownTransportValue(leg.time, sentinels));
    const when = typeof line === "string" ? line : `${line.lead}${line.text}`;
    const names = (Array.isArray(leg.assigned_names) ? leg.assigned_names : []).filter(
      (n) => shownTransportValue(n, sentinels) !== null,
    );
    // A kept stage-less leg still needs something to show.
    if (stage === null && when === "" && names.length === 0) continue;
    out.push(
      typeof line === "string" ? { stage, when, names } : { stage, when, time: line, names },
    );
  }
  return out;
}

/**
 * A leg's riders line as the surface writes it: the names alone (the admin), or
 * after a "With" lead-in (the crew, as its Travel card wrote them on main). The
 * body renders this text and the crew index carries it, so the two agree.
 */
export function transportRidersText(names: readonly string[], riders: "names" | "with"): string {
  if (names.length === 0) return "";
  const list = names.join(", ");
  return riders === "with" ? `With ${list}` : list;
}

/** The cells and notes this transport row renders under these sentinels. */
export function transportBodyFields(
  t: TransportationRow,
  sentinels: "show" | "hide",
): TransportBodyFields {
  const field = (value: string | null) => shownTransportValue(value, sentinels);
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
