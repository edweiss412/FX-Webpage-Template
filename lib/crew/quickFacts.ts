/**
 * lib/crew/quickFacts.ts — the crew home's quick facts.
 *
 * Up to four small tiles that answer the most-hunted facts without opening a
 * section (crew page redesign spec §4.5). Every value comes from a field the
 * live page already renders, through the gate that section already applies, so
 * a tile can never show something its section withholds. Computed once on the
 * server; the tiles do not follow the day row.
 *
 * The order is a closed union with a hardcoded default. Project 4 replaces the
 * source of the order with a per-show setting; the ids stay.
 */
import type { ContactRow, HotelReservationRow } from "@/lib/parser/types";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import { suppressesDates } from "@/lib/crew/dateSuppression";
import { selectPrimaryContact } from "@/lib/crew/selectPrimaryContact";
import { todayIsoInShowTimezone } from "@/lib/visibility/packList";
import { transportTileVisible } from "@/lib/visibility/scopeTiles";
import { resolveWifiDisplay } from "@/lib/crew/wifiDisplay";
import {
  dressCodeLineForPhase,
  parseDressCodeLines,
  type DressPhase,
} from "@/lib/crew/dressCodeLines";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { digitsOnly } from "@/lib/format/phone";
import { isParseableUrl } from "@/lib/url/isParseableUrl";

export type QuickFactId =
  | "wifi"
  | "hotel"
  | "dock"
  | "contact"
  | "parking"
  | "dressCode"
  | "address";

export const DEFAULT_QUICK_FACT_ORDER: readonly QuickFactId[] = [
  "wifi",
  "hotel",
  "dock",
  "contact",
  "parking",
  "dressCode",
  "address",
];

export const QUICK_FACT_LIMIT = 4;

/** One line of a tile's value. `label` is set only on split values (Wi-Fi, a phased dress code). */
export type QuickFactLine = { label?: string; text: string };

export type QuickFactAction =
  | { kind: "copy"; label: string; value: string }
  | { kind: "call"; href: string }
  | { kind: "text"; href: string }
  | { kind: "email"; href: string }
  | { kind: "directions"; href: string };

export type QuickFact = {
  id: QuickFactId;
  label: string;
  lines: QuickFactLine[];
  actions: QuickFactAction[];
};

/**
 * What the selector needs to know about the viewer, computed by the caller from
 * the viewer context. Kept separate from `ShowForViewer` because the projection
 * carries no viewer kind.
 */
export type QuickFactViewer = {
  /** `crew` or `admin_preview`: the viewer has a roster row and only its own reservations. */
  personal: boolean;
  /** `suppressesDates(restriction)` for this viewer. */
  datesSuppressed: boolean;
  /** `transportTileVisible(...)` for this viewer, the Venue section's parking gate. */
  transportVisible: boolean;
  /** Today's ISO date in the show timezone, from the request-scoped server clock. */
  tonightIso: string;
};

/** Trimmed text, or null when the cell is empty or a sentinel. */
function present(value: string | null | undefined): string | null {
  if (value == null || shouldHideGenericOptional(value)) return null;
  return value.trim();
}

/**
 * The viewer's reservation for one night: `check_in <= isoDate < check_out`,
 * ties broken by `ordinal`. Never falls back to the first reservation, which
 * names the wrong hotel on a multi-hotel tour.
 */
export function reservationForNight(
  reservations: readonly HotelReservationRow[],
  isoDate: string,
): HotelReservationRow | null {
  const matches = reservations.filter(
    (row) =>
      row.check_in !== null &&
      row.check_out !== null &&
      row.check_in <= isoDate &&
      isoDate < row.check_out,
  );
  return [...matches].sort((a, b) => a.ordinal - b.ordinal)[0] ?? null;
}

/**
 * The Who to call value, "name and kind label" (spec §4.5): the name, then the
 * kind on its own line, since the kind is why a crew member would call. A
 * nameless contact is the kind label alone.
 */
function contactLines(contact: ContactRow): QuickFactLine[] {
  const kind = contact.kind === "in_house_av" ? "In-house AV" : "Venue contact";
  const name = present(contact.name);
  return name === null ? [{ text: kind }] : [{ text: name }, { text: kind }];
}

function resolveFact(
  id: QuickFactId,
  data: ShowForViewer,
  viewer: QuickFactViewer,
): QuickFact | null {
  switch (id) {
    case "wifi": {
      const wifi = resolveWifiDisplay(data.show.event_details["internet"] ?? null);
      if (wifi === null) return null;
      // No password, split or not: the whole text, shown and copied (spec §4.5,
      // L2). A split that found only a network used to show "Network: <ssid>"
      // alone and drop the value's other lines (whole-diff review round 2, 3A-1).
      if (wifi.split === null || wifi.split.password === null) {
        return {
          id,
          label: "Wi-Fi",
          lines: [{ text: wifi.text }],
          actions: [{ kind: "copy", label: "Copy Wi-Fi details", value: wifi.text }],
        };
      }
      const { ssid, password } = wifi.split;
      return {
        id,
        label: "Wi-Fi",
        lines: [
          { label: "Network", text: ssid },
          { label: "Password", text: password },
        ],
        actions: [{ kind: "copy", label: "Copy Wi-Fi password", value: password }],
      };
    }
    case "hotel": {
      if (!viewer.personal || viewer.datesSuppressed) return null;
      const reservation = reservationForNight(data.hotelReservations, viewer.tonightIso);
      const name = present(reservation?.hotel_name);
      if (reservation === null || name === null) return null;
      const confirmation = present(reservation.confirmation_no);
      return {
        id,
        label: "Hotel",
        lines:
          confirmation !== null
            ? [{ text: name }, { label: "Confirmation", text: confirmation }]
            : [{ text: name }],
        actions:
          confirmation !== null
            ? [{ kind: "copy", label: "Copy hotel confirmation number", value: confirmation }]
            : [],
      };
    }
    case "dock": {
      const dock = present(data.show.venue?.loadingDock);
      return dock === null
        ? null
        : { id, label: "Loading dock", lines: [{ text: dock }], actions: [] };
    }
    case "contact": {
      // `contacts` never holds the client contact (ContactKind excludes it).
      const contact = selectPrimaryContact(data.contacts);
      if (contact === null) return null;
      const actions: QuickFactAction[] = [];
      const digits = digitsOnly(present(contact.phone) ?? "");
      if (digits.length > 0) {
        actions.push(
          { kind: "call", href: `tel:${digits}` },
          { kind: "text", href: `sms:${digits}` },
        );
      }
      const email = present(contact.email);
      if (email !== null) actions.push({ kind: "email", href: `mailto:${email}` });
      return { id, label: "Who to call", lines: contactLines(contact), actions };
    }
    case "parking": {
      if (!viewer.transportVisible) return null;
      const parking = present(data.transportation?.parking);
      return parking === null
        ? null
        : { id, label: "Parking", lines: [{ text: parking }], actions: [] };
    }
    case "dressCode": {
      const dress = present(data.show.event_details.dress_code);
      return dress === null
        ? null
        : { id, label: "Dress code", lines: dressCodeLines(dress, data, viewer), actions: [] };
    }
    case "address": {
      const name = present(data.show.venue?.name);
      const address = present(data.show.venue?.address);
      if (name === null && address === null) return null;
      const lines: QuickFactLine[] = [];
      if (name !== null) lines.push({ text: name });
      if (address !== null) lines.push({ text: address });
      const link = data.show.venue?.googleLink ?? null;
      return {
        id,
        label: "Venue",
        lines,
        actions: isParseableUrl(link) ? [{ kind: "directions", href: link!.trim() }] : [],
      };
    }
  }
}

/**
 * The Dress code tile's lines (UI-gate re-run, critique N1). A phased value gives
 * tonight's phase line, labelled: Show on a show day, Set/Strike on the load-in
 * day. Any other night, a value that names tonight's phase in no single line, or
 * a viewer whose dates are withheld (the line would say what day it is) gets
 * every phase on its own labelled line; the tile used to run them together with
 * the line break collapsed. A value with no phase lines stays one line.
 */
function dressCodeLines(
  value: string,
  data: ShowForViewer,
  viewer: QuickFactViewer,
): QuickFactLine[] {
  const phases = parseDressCodeLines(value);
  if (phases === null) return [{ text: value }];
  const { set, showDays } = data.show.dates;
  const tonight: DressPhase | null = viewer.datesSuppressed
    ? null
    : showDays.includes(viewer.tonightIso)
      ? "show"
      : set === viewer.tonightIso
        ? "set_strike"
        : null;
  const line = tonight === null ? null : dressCodeLineForPhase(value, tonight);
  return (line === null ? phases : [line]).map((l) => ({ label: l.phase, text: l.attire }));
}

/** Walks `order` and keeps the first `QUICK_FACT_LIMIT` facts that resolve for this viewer. */
export function selectQuickFacts(
  order: readonly QuickFactId[],
  data: ShowForViewer,
  viewer: QuickFactViewer,
): QuickFact[] {
  const facts: QuickFact[] = [];
  for (const id of order) {
    if (facts.length === QUICK_FACT_LIMIT) break;
    const fact = resolveFact(id, data, viewer);
    if (fact !== null) facts.push(fact);
  }
  return facts;
}

/**
 * The quick facts one viewer gets on the home, built on the server: the shell's
 * home body hands exactly this to the client island, so the props carry only
 * what this viewer may see (plan harness rule "Client props").
 *
 * The viewer input is computed here from the projection and the request-scoped
 * `today` (never a client clock): personal for `crew` and `admin_preview`
 * (spec §4.3 personal cells), dates suppressed per `suppressesDates`, the
 * parking gate the Venue section applies (`transportTileVisible`, the call
 * `venueTransportVisible` makes), and tonight as today's ISO date in the show
 * timezone, as the Schedule today-pin computes it.
 */
export function buildQuickFacts(input: {
  data: ShowForViewer;
  viewer: Viewer;
  today: Date;
}): QuickFact[] {
  const { data, viewer, today } = input;
  const ctx = resolveViewerContext(viewer, data);
  return selectQuickFacts(DEFAULT_QUICK_FACT_ORDER, data, {
    personal: viewer.kind === "crew" || viewer.kind === "admin_preview",
    datesSuppressed: suppressesDates(ctx.dateRestriction),
    transportVisible: transportTileVisible({
      transportation: data.transportation,
      viewerId: data.viewerId,
      transportationOwnerIds: data.transportationOwnerIds,
      viewerName: data.viewerName,
      viewerNameAliases: data.viewerNameAliases,
      isAdmin: ctx.isAdmin,
    }),
    tonightIso: todayIsoInShowTimezone(data.show, today),
  });
}
