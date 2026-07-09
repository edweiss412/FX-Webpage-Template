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

// An ORPHANED deactivated override (R3 G2 / spec §6 step 4): active=false and its
// parsed match_key matches NO live row in its domain (crew member dropped, hotel
// reservation removed). It has no live field to render inline, so the show page
// surfaces it in a dedicated block whose Re-point/Discard controls back the paused-
// override needs-attention deep-link (otherwise a dead end). show-domain overrides are
// never orphaned (singleton always present); name_conflict overrides keep a live row
// (the member/reservation reverts to its parsed name) and bind inline, so orphans are
// always target_missing.
export type OrphanOverrideView = {
  domain: "crew" | "hotel";
  field: "name" | "role" | "hotel_name" | "hotel_address";
  matchKey: string; // the DURABLE PARSED key the override was created against (§8.2a)
  override: OverrideState; // always active:false
};

export type ShowOverridesView = {
  show: { dates: OverrideFieldView; venue: OverrideFieldView };
  crew: CrewOverrideView[];
  hotels: HotelOverrideView[];
  orphans: OrphanOverrideView[];
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

  // Every override row bound to a live field is recorded here; any deactivated row NOT
  // in this set (and not show-domain) is an ORPHAN (§6 step 4 / G2) surfaced separately.
  const consumed = new Set<OverrideRow>();
  const mark = (r: OverrideRow | undefined): OverrideRow | undefined => {
    if (r) consumed.add(r);
    return r;
  };

  const showRow = (field: "dates" | "venue") =>
    overrideRows.find((r) => r.domain === "show" && r.field === field && r.match_key === "");
  const crewRow = (field: "name" | "role", matchKey: string) =>
    overrideRows.find((r) => r.domain === "crew" && r.field === field && r.match_key === matchKey);

  // ── show details ──────────────────────────────────────────────────────────
  const show = {
    dates: {
      currentValue: displayValue(showDates),
      expectedCurrentValue: showDates ?? null,
      override: toOverrideState(mark(showRow("dates"))),
    },
    venue: {
      currentValue: displayValue(showVenue),
      expectedCurrentValue: showVenue ?? null,
      override: toOverrideState(mark(showRow("venue"))),
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
        override: toOverrideState(mark(crewRow("name", matchKey))),
      },
      role: {
        currentValue: m.role ?? "",
        expectedCurrentValue: m.role ?? null,
        override: toOverrideState(mark(crewRow("role", matchKey))),
      },
    };
  });

  // ── hotels (hotel_name + hotel_address share a matchKey) ────────────────────
  // §5.3 uniqueness that decides whether a matchKey needs a `\x1f`-disambiguator must be
  // computed over PARSED names, NOT live DISPLAY names (R3 G1). An ACTIVE hotel_name override
  // renames its live row to override_value, so counting live names would see a renamed same-name
  // sibling as "unique" and mint a disambiguator-LESS key for the un-renamed twin — a key that can
  // no longer identify its row once the rename is discarded (both revert to the shared parsed name)
  // or on the next full-replace re-sync (the overlay re-derives match_key from the parsed name).
  // The parsed name of a live row = the name-part of its ACTIVE hotel_name override's stored
  // match_key (the override records the parsed identity it was created against) else the live name.
  const parsedHotelName = (h: HotelRow): string => {
    const liveName = h.hotel_name ?? "";
    const activeRename = overrideRows.find(
      (r) =>
        r.domain === "hotel" &&
        r.field === "hotel_name" &&
        r.active &&
        displayValue(r.override_value) === liveName,
    );
    if (!activeRename) return liveName;
    const sepIdx = activeRename.match_key.indexOf(HOTEL_DISAMBIGUATOR_SEP);
    return sepIdx < 0 ? activeRename.match_key : activeRename.match_key.slice(0, sepIdx);
  };

  const nameCounts = new Map<string, number>();
  for (const h of hotelRows) {
    const n = parsedHotelName(h);
    nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }

  const hotelViews: HotelOverrideView[] = hotelRows.map((res) => {
    const liveName = res.hotel_name ?? "";
    // Uniqueness is keyed on the PARSED name (G1) — a row un-renamed but sharing its parsed name
    // with a renamed sibling is NOT unique and must carry a disambiguator in its matchKey.
    const unique = (nameCounts.get(parsedHotelName(res)) ?? 0) <= 1;
    const disamb = computeHotelDisambiguator(res);

    // An ACTIVE hotel_name override renamed the live row to override_value; a STALE
    // one released the row (live name === parsed name). Resolve the name override for
    // THIS reservation from either shape.
    const nameOverride = mark(
      overrideRows.find((r) => {
        if (r.domain !== "hotel" || r.field !== "hotel_name") return false;
        if (r.active) return displayValue(r.override_value) === liveName;
        // stale: the live row shows the parsed name again, so the name alone is NOT a
        // unique key inside a same-name group (§5.3). Match on the parsed name AND, when
        // the stored key carries a `\x1f`-delimited disambiguator, require it to equal
        // THIS reservation's disambiguator — otherwise two paused overrides for two
        // same-name reservations would both bind to whichever row renders first, and a
        // discard/repoint would act on the wrong override (adversarial R1).
        const sepIdx = r.match_key.indexOf(HOTEL_DISAMBIGUATOR_SEP);
        if (sepIdx < 0) {
          // Name-only key (target was unique at create). Bind ONLY while the live name is
          // STILL unique — if a later sync introduced a second same-name reservation, this
          // key can no longer identify one row, so it must NOT attach to every duplicate
          // (adversarial R2 MEDIUM). It stays in the non-row needs-attention stream until
          // Doug re-points it to a disambiguated target.
          return unique && r.match_key === liveName;
        }
        return (
          r.match_key.slice(0, sepIdx) === liveName && r.match_key.slice(sepIdx + 1) === disamb
        );
      }),
    );

    // matchKey (§8.2a): the override's stored parsed key when present, else the
    // §5.3 name[+disambiguator] key (NOT plain hotel_name for a same-name group).
    const matchKey = nameOverride
      ? nameOverride.match_key
      : unique
        ? liveName
        : `${liveName}${HOTEL_DISAMBIGUATOR_SEP}${disamb}`;

    const addressOverride = mark(
      overrideRows.find(
        (r) => r.domain === "hotel" && r.field === "hotel_address" && r.match_key === matchKey,
      ),
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

  // ── orphaned overrides (§6 step 4 / G2) ─────────────────────────────────────
  // A deactivated override NOT bound to any live field above, and not show-domain
  // (singleton never orphans). These are the target_missing rows whose crew member /
  // hotel reservation is gone — the show page renders them so the paused-override
  // needs-attention deep-link lands on a real Re-point/Discard control.
  const orphans: OrphanOverrideView[] = overrideRows
    .filter((r) => !r.active && r.domain !== "show" && !consumed.has(r))
    .map((r) => ({
      domain: r.domain as "crew" | "hotel",
      field: r.field as OrphanOverrideView["field"],
      matchKey: r.match_key,
      override: toOverrideState(r)!,
    }));

  return { show, crew: crewViews, hotels: hotelViews, orphans };
}
