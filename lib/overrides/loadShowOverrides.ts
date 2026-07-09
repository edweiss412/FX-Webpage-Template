// Surface-B / Surface-A live override loader (spec 2026-07-07 §8.2a / §8.4, R17).
//
// Reads `admin_overrides` for the show (under the cookie-bound admin client's
// `admin_only` RLS policy — the same posture loadNeedsAttention uses; §9.4) plus
// the live `hotel_reservations`, and derives — per the 6 overridable fields — the
// props <OverrideableField> consumes:
//   • matchKey             — the DURABLE PARSED key (§8.2a), never the display value:
//                            crew → sheet_name ?? name; hotel → active override's
//                            stored match_key else the §5.3 name[+disambiguator] key;
//                            show → ''.
//   • expectedCurrentValue — the RAW loader-source value (jsonb for dates/venue, the
//                            text column for crew/hotel), passed UNCHANGED as CAS-B (R17).
//   • currentLiveHotelName — hotel only (§5.3 RPC row locator): the live hotel_name.
//   • currentOrdinal       — hotel only, ADVISORY (R20).
//   • override             — the OverrideState (or null) from the admin_overrides row.
//
// Supabase call-boundary discipline (invariant 9): every read destructures
// `{ data, error }`; a returned/thrown error degrades the affected field to
// `override: null` (renders the plain live value) rather than crashing the page.
// not-subject-to-meta: lib/overrides is outside the _metaInfraContract auth roots
// (lib/auth, app/auth, app/api/auth, app/api/show); the discipline is honored inline
// here (mirrors setFieldOverride.ts).

import type { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OverrideState } from "@/components/admin/overrides/OverrideableField";
import {
  HOTEL_DISAMBIGUATOR_SEP,
  computeHotelDisambiguator,
} from "@/lib/overrides/hotelDisambiguator";
import { log } from "@/lib/log";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// One admin_overrides row (the subset the loader projects).
type OverrideRow = {
  domain: string;
  field: string;
  match_key: string;
  override_value: unknown;
  sheet_value: unknown;
  active: boolean;
  deactivation_code: "target_missing" | "name_conflict" | null;
  version: number;
};

type HotelRow = {
  id: string;
  ordinal: number | null;
  hotel_name: string | null;
  hotel_address: string | null;
  check_in: string | null;
  confirmation_no: string | null;
};

export type CrewInput = {
  id: string;
  name: string;
  role: string | null;
  sheet_name: string | null;
};

export type OverrideFieldView = {
  currentValue: string; // display (rendered) — string form of the live value
  expectedCurrentValue: unknown; // RAW loader-source (jsonb/text) — CAS-B (R17), passed UNCHANGED
  override: OverrideState | null;
};

export type CrewOverrideView = {
  id: string;
  matchKey: string; // sheet_name ?? name (§8.2a) — name + role SHARE this key
  name: OverrideFieldView;
  role: OverrideFieldView;
};

export type HotelOverrideView = {
  id: string;
  matchKey: string; // §5.3 parsed name [+ disambiguator] — hotel_name + hotel_address SHARE this key
  currentLiveHotelName: string; // §5.3 RPC row locator
  currentOrdinal: number | undefined; // advisory (R20)
  hotel_name: OverrideFieldView;
  hotel_address: OverrideFieldView;
};

export type ShowOverridesView = {
  show: { dates: OverrideFieldView; venue: OverrideFieldView };
  crew: CrewOverrideView[];
  hotels: HotelOverrideView[];
};

function toOverrideState(row: OverrideRow | undefined): OverrideState | null {
  if (!row) return null;
  return {
    overrideValue: row.override_value,
    sheetValue: row.sheet_value ?? null,
    active: row.active,
    deactivationCode: row.deactivation_code ?? null,
    version: row.version,
  };
}

// Display string for the value cell — scalars verbatim, structured jsonb compacted.
function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

// The name portion of a hotel match_key (everything before the first separator).
function hotelNamePart(matchKey: string): string {
  const idx = matchKey.indexOf(HOTEL_DISAMBIGUATOR_SEP);
  return idx === -1 ? matchKey : matchKey.slice(0, idx);
}

export async function loadShowOverrides(
  supabase: ServerClient,
  input: {
    showId: string;
    crew: readonly CrewInput[];
    showDates: unknown;
    showVenue: unknown;
  },
): Promise<ShowOverridesView> {
  const { showId, crew, showDates, showVenue } = input;

  // (1) admin_overrides for the show (admin_only RLS). {data,error} — degrade to
  // no overrides on fault so the page renders live values rather than crashing.
  let overrideRows: OverrideRow[] = [];
  try {
    const { data, error } = await supabase
      .from("admin_overrides")
      .select(
        "domain, field, match_key, override_value, sheet_value, active, deactivation_code, version",
      )
      .eq("show_id", showId)
      .returns<OverrideRow[]>();
    if (error) {
      log.error("admin_overrides load failed:", {
        source: "admin.show.overrides",
        code: "ADMIN_OVERRIDES_LOAD_FAILED",
        showId,
        error: error.message,
      });
    } else {
      overrideRows = data ?? [];
    }
  } catch (err) {
    log.error("admin_overrides load threw:", {
      source: "admin.show.overrides",
      code: "ADMIN_OVERRIDES_LOAD_THREW",
      showId,
      error: err,
    });
  }

  // (2) live hotel_reservations (booking columns are non-overridable — §5.3 disambiguator).
  let hotelRows: HotelRow[] = [];
  try {
    const { data, error } = await supabase
      .from("hotel_reservations")
      .select("id, ordinal, hotel_name, hotel_address, check_in, confirmation_no")
      .eq("show_id", showId)
      .order("ordinal", { ascending: true })
      .returns<HotelRow[]>();
    if (error) {
      log.error("hotel_reservations load failed:", {
        source: "admin.show.overrides",
        code: "ADMIN_OVERRIDES_HOTEL_LOAD_FAILED",
        showId,
        error: error.message,
      });
    } else {
      hotelRows = data ?? [];
    }
  } catch (err) {
    log.error("hotel_reservations load threw:", {
      source: "admin.show.overrides",
      code: "ADMIN_OVERRIDES_HOTEL_LOAD_THREW",
      showId,
      error: err,
    });
  }

  const showRow = (field: "dates" | "venue") =>
    overrideRows.find((r) => r.domain === "show" && r.field === field && r.match_key === "");
  const crewRow = (field: "name" | "role", matchKey: string) =>
    overrideRows.find((r) => r.domain === "crew" && r.field === field && r.match_key === matchKey);

  // ── show details ──────────────────────────────────────────────────────────
  const show = {
    dates: {
      currentValue: displayValue(showDates),
      expectedCurrentValue: showDates ?? null,
      override: toOverrideState(showRow("dates")),
    },
    venue: {
      currentValue: displayValue(showVenue),
      expectedCurrentValue: showVenue ?? null,
      override: toOverrideState(showRow("venue")),
    },
  };

  // ── crew (name + role share the parsed matchKey = sheet_name ?? name) ───────
  const crewViews: CrewOverrideView[] = crew.map((m) => {
    const matchKey = m.sheet_name ?? m.name; // §8.2a — parsed key, never the display value
    return {
      id: m.id,
      matchKey,
      name: {
        currentValue: m.name,
        expectedCurrentValue: m.name,
        override: toOverrideState(crewRow("name", matchKey)),
      },
      role: {
        currentValue: m.role ?? "",
        expectedCurrentValue: m.role ?? null,
        override: toOverrideState(crewRow("role", matchKey)),
      },
    };
  });

  // ── hotels (hotel_name + hotel_address share a matchKey) ────────────────────
  const nameCounts = new Map<string, number>();
  for (const h of hotelRows) {
    const n = h.hotel_name ?? "";
    nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }

  const hotelViews: HotelOverrideView[] = hotelRows.map((res) => {
    const liveName = res.hotel_name ?? "";
    const unique = (nameCounts.get(liveName) ?? 0) <= 1;
    const disamb = computeHotelDisambiguator(res);

    // An ACTIVE hotel_name override renamed the live row to override_value; a STALE
    // one released the row (live name === parsed name). Resolve the name override for
    // THIS reservation from either shape.
    const nameOverride = overrideRows.find((r) => {
      if (r.domain !== "hotel" || r.field !== "hotel_name") return false;
      if (r.active) return displayValue(r.override_value) === liveName;
      // stale: live row shows the parsed name; the disambiguator (from stable booking
      // cols) still identifies the reservation.
      const np = hotelNamePart(r.match_key);
      return np === liveName;
    });

    // matchKey (§8.2a): the override's stored parsed key when present, else the
    // §5.3 name[+disambiguator] key (NOT plain hotel_name for a same-name group).
    const matchKey = nameOverride
      ? nameOverride.match_key
      : unique
        ? liveName
        : `${liveName}${HOTEL_DISAMBIGUATOR_SEP}${disamb}`;

    const addressOverride = overrideRows.find(
      (r) => r.domain === "hotel" && r.field === "hotel_address" && r.match_key === matchKey,
    );

    return {
      id: res.id,
      matchKey,
      currentLiveHotelName: liveName,
      currentOrdinal: res.ordinal ?? undefined,
      hotel_name: {
        currentValue: liveName,
        expectedCurrentValue: res.hotel_name ?? null,
        override: toOverrideState(nameOverride),
      },
      hotel_address: {
        currentValue: res.hotel_address ?? "",
        expectedCurrentValue: res.hotel_address ?? null,
        override: toOverrideState(addressOverride),
      },
    };
  });

  return { show, crew: crewViews, hotels: hotelViews };
}
