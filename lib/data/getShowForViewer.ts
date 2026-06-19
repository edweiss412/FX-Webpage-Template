/**
 * lib/data/getShowForViewer.ts (Task 4.3, spec §7.4)
 *
 * The data spine for every per-show crew page. Carries TWO load-bearing invariants:
 *
 * 1. **Internal role re-derivation** (§4.4 / §7.4). Role IS NOT supplied by the
 *    caller. The helper accepts only viewer IDENTITY (`{ kind: 'crew',
 *    crewMemberId }`, `{ kind: 'admin' }`, or `{ kind: 'admin_preview',
 *    crewMemberId }`) and reads `crew_members.role_flags` itself on every
 *    call. This blocks three classes of stale-role bug:
 *
 *      a. A redeemed-link cookie that pre-dates a sync-time demote.
 *      b. A `?role=lead` preview param trying to widen authority.
 *      c. An accidental role-bearing parameter introduced by a refactor
 *         that the type system would otherwise tolerate.
 *
 *    The contract is enforced by a static-analysis test that greps this file
 *    for the role-flags-colon and viewer-role-colon signature patterns. If
 *    you add a type annotation that uses either name, the test will fail —
 *    that's the intended behavior, NOT a regex bug to game around.
 *
 * 2. **Cross-show fail-closed** (§7.2.2 step 5). The crew_members lookup is
 *    bound to BOTH `id` AND `show_id`. A caller with a wrong `crewMemberId`
 *    from a DIFFERENT show fails closed with `PICKER_CREW_MEMBER_WRONG_SHOW`; the helper
 *    does NOT silently fall through and return the requested show with the
 *    foreign crew row's flags applied.
 *
 * Defense in depth (§4.4):
 *   - Application gate: `isLead` derivation here decides whether to JOIN
 *     `shows_internal` at all. When non-LEAD, the JSONB column is never
 *     queried.
 *   - RLS: `shows_internal` is admin-only via `is_admin()`. M5 will widen
 *     this to LEAD-aware for cookie-bound viewers; for now, we use the
 *     service-role client to bypass RLS on the LEAD branch (RLS catches
 *     what the app misses on the non-LEAD branch — the helper just doesn't
 *     query at all).
 *   - Physical separation: financials live in `shows_internal`, NOT `shows`.
 *     A `select * from shows` cannot leak them.
 *
 * Per spec §7.4 (line 2315 of the spec), the crew page is a Server Component
 * that calls this helper directly, server-side, via the service role —
 * redeemed-link viewers don't carry a Supabase Auth session, so a cookie-
 * bound client can't read `shows_internal` under RLS for them.
 */
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { decodeJsonbColumn } from "@/lib/db/coerceJsonbObject";
import { decodeRunOfShow } from "@/lib/data/decodeRunOfShow";
import { deriveSchedulePhases } from "@/lib/parser";
import { normalizeDateRestriction } from "@/lib/data/normalizeDateRestriction";
import { resolveCurrentDiagrams } from "@/lib/data/diagrams";
import { projectOpeningReelHasVideo } from "@/lib/data/openingReel";
import type { ProjectedRoomRow } from "@/lib/crew/resolveKeyTimes";
import type {
  AgendaEntry,
  ContactRow,
  DateRestriction,
  HotelReservationRow,
  PersistedDiagrams,
  PullSheetCase,
  RoleFlag,
  RoomRow,
  ShowRow,
  StageRestriction,
  TransportationRow,
} from "@/lib/parser/types";

// LEAD-only financials JSONB shape (matches `shows_internal.financials` and
// the seed writer at supabase/seed.ts:233-238 — `invoice_notes` snake_case
// because that's how it's persisted).
export type FinancialsRow = {
  po: string | null;
  proposal: string | null;
  invoice: string | null;
  invoice_notes: string | null;
};

// Identity-only viewer discriminated union. Carries NO role-bearing field —
// see file-header comment #1 above and the static-analysis test in
// tests/data/getShowForViewer.test.ts. `admin_preview` resolves identically
// to `crew` inside this helper (binds id+show_id, fresh role flags from DB,
// fails closed cross-show); the surface-level difference (requireAdmin gate
// + sticky preview banner) is Task 10.8's responsibility.
export type Viewer =
  | { kind: "crew"; crewMemberId: string }
  | { kind: "admin" }
  | { kind: "admin_preview"; crewMemberId: string };

// Crew-page-shaped projection of a show. Mirrors `ParsedSheet` from
// lib/parser/types.ts:311 with three crew-page-specific differences:
//   - `financials?: FinancialsRow` is OPTIONAL — present only when the
//     viewer is admin OR the freshly-derived role flags include LEAD.
//   - `hotelReservations` is filtered by viewer name for crew /
//     admin_preview (the projection does the filter so the LodgingTile
//     doesn't have to). Admin viewers see ALL reservations.
//   - `transportation.schedule[*].assigned_names` is preserved verbatim
//     (regression test #7).
export type ShowForViewer = {
  show: ShowRow;
  crewMembers: Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    // Atomic capability flags freshly read from DB — kept on the row so
    // tile-visibility predicates downstream don't re-fetch. Note the field
    // name on this PROJECTION row is a property access on the DB result,
    // NOT a function-parameter type declaration (the static-analysis test
    // on Task 4.3 enforces the latter, not the former — but to keep the
    // contract crisp we name this field `roleFlags`, camelCase, away from
    // both forbidden patterns).
    roleFlags: RoleFlag[];
    // Per-crew restrictions, projected verbatim from the JSONB columns
    // crew_members.date_restriction / .stage_restriction. ScheduleTile
    // (Task 4.5) reads `date_restriction` to decide which day rows to
    // render for the viewer; PackListTile (Task 4.9) will read
    // `stage_restriction` for the same purpose. The projection populates
    // both at this milestone so subsequent tile tasks can rely on the
    // shape without churning the helper signature again.
    dateRestriction: DateRestriction;
    stageRestriction: StageRestriction;
  }>;
  hotelReservations: HotelReservationRow[];
  rooms: ProjectedRoomRow[];
  transportation: TransportationRow | null;
  contacts: ContactRow[];
  pullSheet: PullSheetCase[] | null;
  /**
   * Resolved `shows.diagrams.current` sub-payload OR `null`. The crew
   * gallery (DiagramsTile / Gallery) reads this and emits asset URLs of
   * the form `/api/asset/diagram/<show>/<bare-uuid>/<key>` where the
   * bare-UUID rev segment IS `diagrams.snapshot_revision_id`. The route
   * literal-equality-compares against the same field, so prior-revision
   * URLs naturally 410 (§7.3, M7 §6 watchpoint 12 + 13).
   *
   * The `pending` sub-payload is the cutover staging slot for the
   * post-commit promoter and is NEVER read by the crew page or the
   * route — `resolveCurrentDiagrams()` enforces this gate.
   */
  diagrams: PersistedDiagrams | null;
  /**
   * `true` iff ALL FOUR `shows.opening_reel_*` pin columns are non-NULL
   * AND `opening_reel_mime_type.startsWith('video/')`. The crew page
   * renders the inline `<video src="/api/asset/reel/<show>">` ONLY when
   * this is true; drift cases (any pin NULL) fall back to text-only
   * without ever calling the route (AC-7.24 / AC-7.25). The boolean is
   * the only opening-reel projection — the four raw pin columns stay
   * server-internal so the crew DOM never carries `https://drive...`.
   */
  openingReelHasVideo: boolean;
  /**
   * `shows.last_synced_at` ISO timestamp + `shows.last_sync_status` — surfaced
   * to the page so the chrome <Footer asOf=...> slot can render <StaleFooter>
   * (M9 Task 9.1) with tier-aware status precedence. Kept at the
   * ShowForViewer top level (not inside `show`) because these are sync-time
   * metadata fields, not parser-emitted shape — ShowRow stays the parser
   * contract surface.
   */
  lastSyncedAt: string | null;
  lastSyncStatus: string | null;
  /**
   * Per-tile-domain sub-query errors (M9 Codex round-1 H1). Each
   * tile-owned query (hotel_reservations, rooms, transportation, contacts,
   * shows_internal) wraps its own try/catch and records errors here keyed
   * by tile id. The page passes this map to each `<WrappedTile>`'s `load`
   * callback so a single failed sub-query produces a per-tile fallback —
   * not a whole-page failure. Critical page-level queries (shows,
   * crew_members, viewer_version_token RPC) still throw because the page
   * cannot render without them.
   */
  tileErrors: Record<string, string>;
  /**
   * Per-day run-of-show (agenda) projection, keyed by ISO `YYYY-MM-DD` day.
   * Read UNCONDITIONALLY from `shows_internal.run_of_show` for every viewer
   * (NOT lead-gated — `run_of_show` is date-gated, not financial). The keys
   * emitted are the intersection of (decoded stored days) ∩ (current
   * `show.dates.showDays`) ∩ (the active viewer's normalized
   * `DateRestriction`): `unknown_asterisk` drops all days, `explicit` keeps
   * only assigned days, `none`/admin keeps all current show days. The
   * date-gating happens at READ only — stored storage is never mutated.
   * `null` when no agenda survives (no-row, corrupt-and-empty, or all days
   * gated out). Corrupt stored shape → `null` + a FIXED-string
   * `tileErrors["run_of_show"]` (never raw infra text). §03's Schedule UI
   * keys off `runOfShow[isoDate]?.length > 0`.
   */
  runOfShow: Record<string, AgendaEntry[]> | null;
  financials?: FinancialsRow;
  /**
   * Resolved viewer name for the active crew / admin_preview viewer, or
   * null when the viewer is `kind: 'admin'` (admin has no specific crew
   * row — they see every reservation, every transport entry, etc.).
   * TransportTile (Task 4.7) uses this to evaluate the
   * driver_name === viewerName branch and to scan
   * transportation.schedule[*].assigned_names for the viewer's name.
   */
  viewerName: string | null;

  /**
   * The viewer's OWN flight itinerary (crew_members.flight_info), read on the
   * same own-row lookup as viewerName, blank-normalized to null. NOT on the
   * crewMembers[] roster — the Travel card shows the viewer their own flight
   * (presentation/leanness, not a security boundary; flight_info is
   * crew-readable like email/phone). Null for admin viewers and blank cells.
   */
  viewerFlightInfo: string | null;

  /**
   * Monotonic millisecond high-water-mark across (shows.last_synced_at,
   * max(shows.picker_epoch_bumped_at), max(crew_members.last_changed_at)),
   * computed by `public.viewer_version_token(uuid)` (see
   * supabase/migrations/20260501001000_internal_and_admin.sql:18-32). Used
   * by the M4 Task 4.16 Checkpoint B `<ShowRealtimeBridge>` client island
   * as the SSR-time fence for the post-subscribe + system.reconnected
   * version-catch-up path: the bridge fetches the server's current value
   * via `/api/show/[slug]/version` and compares it to the snapshot's token
   * — a mismatch means a publish fired during the SSR → hydrate gap or
   * during a websocket reconnect, and the bridge synchronously
   * router.refresh()es to re-execute the Server Component.
   *
   * Empty string is a valid sentinel for "no data yet" (the RPC returns
   * '0' when no rows exist for the show); the bridge's comparison handles
   * this by treating it as "no fence" (any subsequent token wins).
   */
  viewerVersionToken: string;
};

export async function getShowForViewer(showId: string, viewer: Viewer): Promise<ShowForViewer> {
  const supabase = createSupabaseServiceRoleClient();

  const isAdmin = viewer.kind === "admin";
  const needsCrewLookup = viewer.kind === "crew" || viewer.kind === "admin_preview";

  // Freshly-derived flags. Empty array on the admin branch (admin authority
  // comes from `isAdmin`, NOT from a crew row — admins may have no crew row
  // for this show at all).
  let derivedFlags: RoleFlag[] = [];
  let viewerName: string | null = null;
  let viewerFlightInfo: string | null = null;

  if (needsCrewLookup) {
    // Bind lookup to BOTH id AND show_id. The dual constraint is the
    // cross-show fail-closed. A crew row with the right id but the wrong
    // show_id returns `data === null` here; the row's flags are NEVER
    // applied to the requested show.
    const lookup = await supabase
      .from("crew_members")
      .select("role_flags, name, flight_info")
      .eq("id", viewer.crewMemberId)
      .eq("show_id", showId)
      .maybeSingle();
    if (lookup.error) {
      throw new Error(`getShowForViewer: crew lookup failed: ${lookup.error.message}`);
    }
    if (!lookup.data) {
      throw new Error("PICKER_CREW_MEMBER_WRONG_SHOW");
    }
    derivedFlags = (lookup.data.role_flags as RoleFlag[]) ?? [];
    viewerName = (lookup.data.name as string) ?? null;
    const rawFlight = (lookup.data.flight_info as string | null) ?? null;
    viewerFlightInfo = rawFlight && rawFlight.trim().length > 0 ? rawFlight : null;
  }

  const isLead = isAdmin || derivedFlags.includes("LEAD");

  // === Show row (always loaded) ===
  const showRes = await supabase.from("shows").select("*").eq("id", showId).maybeSingle();
  if (showRes.error) {
    throw new Error(`getShowForViewer: show fetch failed: ${showRes.error.message}`);
  }
  if (!showRes.data) {
    throw new Error("PICKER_CREW_MEMBER_WRONG_SHOW");
  }
  const showRowDb = showRes.data;
  if (!isAdmin && showRowDb.published !== true) {
    throw new Error("PICKER_CREW_MEMBER_WRONG_SHOW");
  }
  // Decode legacy double-encoded jsonb string scalars (Codex R7): the write fix
  // prevents new ones, but a reader must degrade gracefully if a stale/cron-written
  // row is a string scalar rather than passing a string to a tile expecting an
  // object/array. No-op for correctly-encoded (object/array) rows.
  const datesDecoded = decodeJsonbColumn<ShowRow["dates"]>(showRowDb.dates);
  const eventDetailsDecoded = decodeJsonbColumn<ShowRow["event_details"]>(showRowDb.event_details);
  const datesValue: ShowRow["dates"] = datesDecoded ?? {
    travelIn: null,
    set: null,
    showDays: [],
    travelOut: null,
  };
  // schedule_phases projection (Task 4.9 prerequisite, spec §6.10):
  //   - Prefer the persisted value at `event_details.schedule_phases` when
  //     present (forward-compat with future M6/M7 sync writes that may emit
  //     a richer per-day map than dates-derivation alone can produce).
  //   - Otherwise derive inline from `dates` via the canonical M1
  //     deriveSchedulePhases helper. The current seed (supabase/seed.ts)
  //     writes only the parser's `event_details` Record without merging
  //     schedule_phases, so this fallback keeps PackListTile (Task 4.9)
  //     working end-to-end at the M4 ship boundary.
  const persistedPhases = eventDetailsDecoded?.schedule_phases as
    | ShowRow["schedule_phases"]
    | undefined;
  const schedulePhases: ShowRow["schedule_phases"] =
    persistedPhases && typeof persistedPhases === "object"
      ? persistedPhases
      : deriveSchedulePhases(datesValue);
  const show: ShowRow = {
    title: showRowDb.title,
    client_label: showRowDb.client_label,
    client_contact: decodeJsonbColumn<ShowRow["client_contact"]>(showRowDb.client_contact) ?? null,
    template_version: showRowDb.template_version,
    venue: decodeJsonbColumn<ShowRow["venue"]>(showRowDb.venue) ?? null,
    dates: datesValue,
    schedule_phases: schedulePhases,
    event_details: eventDetailsDecoded ?? {},
    agenda_links: decodeJsonbColumn<ShowRow["agenda_links"]>(showRowDb.agenda_links) ?? [],
    coi_status: showRowDb.coi_status ?? null,
    po: null, // public ShowRow.po/proposal/invoice/invoice_notes were on the
    proposal: null, // pre-§4.4 single-table schema. Now financials lives ONLY
    invoice: null, // in shows_internal; we never expose them via the public
    invoice_notes: null, // ShowRow projection. The optional `financials` field
    // on ShowForViewer is the LEAD-gated channel.
  };

  // === Crew members (always loaded; tile-visibility predicates need flags) ===
  // Schema columns: see supabase/migrations/20260501000000_initial_public_schema.sql:39-40
  // (date_restriction jsonb, stage_restriction jsonb). Both are JSONB
  // discriminated unions per lib/parser/types.ts:10-16. Fall back to
  // `{ kind: 'none' }` when DB row is null so consumers don't need to
  // distinguish "no restriction set" from "restriction = none".
  const crewRes = await supabase
    .from("crew_members")
    .select("id, name, email, phone, role, role_flags, date_restriction, stage_restriction")
    .eq("show_id", showId);
  if (crewRes.error) {
    throw new Error(`getShowForViewer: crew fetch failed: ${crewRes.error.message}`);
  }
  const crewMembers = (crewRes.data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    role: row.role as string,
    roleFlags: ((row.role_flags as string[]) ?? []) as RoleFlag[],
    // Codex round-23 HIGH: parser produces M/D tokens like "6/24"
    // for explicit date restrictions. ScheduleTile + RightNow
    // compare to ISO YYYY-MM-DD show dates; format mismatch left
    // restricted crew with zero matching days. Normalize at the
    // projection boundary so every UI consumer sees ISO. See
    // lib/data/normalizeDateRestriction.ts.
    dateRestriction: normalizeDateRestriction(
      // decodeJsonbColumn: a legacy double-encoded restriction comes back from
      // Supabase-JS as a STRING scalar; without decoding, restriction.kind is
      // undefined → normalizeDateRestriction returns the string and ScheduleTile
      // mis-renders all days (visibility regression). No-op for correct rows (R8).
      decodeJsonbColumn<DateRestriction>(row.date_restriction) ?? { kind: "none" },
      show.dates,
    ),
    stageRestriction: decodeJsonbColumn<StageRestriction>(row.stage_restriction) ?? {
      kind: "none",
    },
  }));

  // Per-tile-domain error map (M9 H1 fix). Each tile-owned sub-query
  // populates this on failure; the page passes it to each WrappedTile's
  // load callback to convert a sub-query failure into a per-tile fallback
  // instead of a whole-page failure.
  const tileErrors: Record<string, string> = {};

  // === Hotel reservations (lodging tile + notes tile) ===
  // For crew / admin_preview viewers, filter to those that name the viewer.
  // Admin viewers see ALL reservations.
  let allHotels: HotelReservationRow[] = [];
  try {
    const hotelRes = await supabase
      .from("hotel_reservations")
      .select(
        "ordinal, hotel_name, hotel_address, names, confirmation_no, check_in, check_out, notes",
      )
      .eq("show_id", showId)
      .order("ordinal", { ascending: true });
    if (hotelRes.error) {
      tileErrors["hotel"] = hotelRes.error.message;
    } else {
      allHotels = (hotelRes.data ?? []).map((row) => ({
        ordinal: row.ordinal as number,
        hotel_name: (row.hotel_name as string | null) ?? null,
        hotel_address: (row.hotel_address as string | null) ?? null,
        names: ((row.names as string[]) ?? []) as string[],
        confirmation_no: (row.confirmation_no as string | null) ?? null,
        check_in: (row.check_in as string | null) ?? null,
        check_out: (row.check_out as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      }));
    }
  } catch (e) {
    tileErrors["hotel"] = e instanceof Error ? e.message : String(e);
  }
  const hotelReservations: HotelReservationRow[] =
    isAdmin || viewerName === null
      ? allHotels
      : allHotels.filter((res) =>
          res.names.some((n) => n.toLowerCase().includes((viewerName as string).toLowerCase())),
        );

  // === Rooms (schedule + audio/video/lighting scope tiles + notes) ===
  let rooms: ProjectedRoomRow[] = [];
  try {
    const roomRes = await supabase.from("rooms").select("*").eq("show_id", showId);
    if (roomRes.error) {
      tileErrors["rooms"] = roomRes.error.message;
    } else {
      rooms = (roomRes.data ?? []).map((row) => ({
        id: row.id as string,
        kind: row.kind as RoomRow["kind"],
        name: row.name as string,
        dimensions: (row.dimensions as string | null) ?? null,
        floor: (row.floor as string | null) ?? null,
        setup: (row.setup as string | null) ?? null,
        set_time: (row.set_time as string | null) ?? null,
        show_time: (row.show_time as string | null) ?? null,
        strike_time: (row.strike_time as string | null) ?? null,
        audio: (row.audio as string | null) ?? null,
        video: (row.video as string | null) ?? null,
        lighting: (row.lighting as string | null) ?? null,
        scenic: (row.scenic as string | null) ?? null,
        power: (row.power as string | null) ?? null,
        digital_signage: (row.digital_signage as string | null) ?? null,
        other: (row.other as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      }));
    }
  } catch (e) {
    tileErrors["rooms"] = e instanceof Error ? e.message : String(e);
  }

  // === Transportation (1:1 with show; null when no row) ===
  let transportation: TransportationRow | null = null;
  try {
    const transRes = await supabase
      .from("transportation")
      .select("*")
      .eq("show_id", showId)
      .maybeSingle();
    if (transRes.error) {
      tileErrors["transportation"] = transRes.error.message;
    } else if (transRes.data) {
      transportation = {
        driver_name: (transRes.data.driver_name as string | null) ?? null,
        driver_phone: (transRes.data.driver_phone as string | null) ?? null,
        driver_email: (transRes.data.driver_email as string | null) ?? null,
        vehicle: (transRes.data.vehicle as string | null) ?? null,
        license_plate: (transRes.data.license_plate as string | null) ?? null,
        color: (transRes.data.color as string | null) ?? null,
        parking: (transRes.data.parking as string | null) ?? null,
        // schedule is JSONB. Supabase preserves nested fields verbatim — but
        // we explicitly project each entry to make the contract obvious AND
        // to defend against a future projector dropping `assigned_names`
        // (regression test #7 enforces this).
        schedule: (
          // decodeJsonbColumn: a legacy double-encoded transportation.schedule is a
          // STRING scalar from Supabase-JS; without decoding, `.map` throws (R8).
          decodeJsonbColumn<
            Array<{
              stage: string;
              date: string | null;
              time: string | null;
              assigned_names: string[];
            }>
          >(transRes.data.schedule) ?? []
        ).map((entry) => ({
          stage: entry.stage,
          date: entry.date ?? null,
          time: entry.time ?? null,
          assigned_names: Array.isArray(entry.assigned_names) ? entry.assigned_names : [],
        })),
        notes: (transRes.data.notes as string | null) ?? null,
      };
    }
  } catch (e) {
    tileErrors["transportation"] = e instanceof Error ? e.message : String(e);
  }

  // === Contacts (contacts tile + notes tile) ===
  let contacts: ContactRow[] = [];
  try {
    const contactsRes = await supabase.from("contacts").select("*").eq("show_id", showId);
    if (contactsRes.error) {
      tileErrors["contacts"] = contactsRes.error.message;
    } else {
      contacts = (contactsRes.data ?? []).map((row) => ({
        kind: row.kind as ContactRow["kind"],
        name: (row.name as string | null) ?? null,
        email: (row.email as string | null) ?? null,
        phone: (row.phone as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
      }));
    }
  } catch (e) {
    tileErrors["contacts"] = e instanceof Error ? e.message : String(e);
  }

  // === Run-of-show (agenda) — UNCONDITIONAL read for every viewer (D-4) ===
  // NOT lead-gated: `run_of_show` is DATE-gated, not financial. The read is
  // service-role + fail-soft (returned-error AND thrown exception both →
  // runOfShow=null + a FIXED tileErrors string, never raw infra text). The
  // date∩DateRestriction intersection below happens at READ only — the stored
  // shows_internal.run_of_show object is never mutated.
  let runOfShow: Record<string, AgendaEntry[]> | null = null;
  try {
    // not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan
    // (tests/auth/_metaInfraContract.test.ts:258-259 walks lib/auth/app/auth/app/api/auth/app/api/show only);
    // the { data, error } boundary is pinned by the behavioral returned-error + thrown-exception tests below.
    const r = await supabase
      .from("shows_internal")
      .select("run_of_show")
      .eq("show_id", showId)
      .maybeSingle();
    if (r.error) {
      tileErrors["run_of_show"] = "run_of_show read failed";
    } else {
      // `?? null` is LOAD-BEARING: .maybeSingle() returns { data: null } for the
      // common no-row (no-agenda) case → r.data?.run_of_show is `undefined`.
      // Without the coercion the decoder flags `undefined` as corrupt and fires
      // a FALSE alert on every no-row show. `null` hits the decoder's
      // legitimate-empty branch (no tileErrors).
      const decoded = decodeRunOfShow(
        (r.data as { run_of_show?: unknown } | null)?.run_of_show ?? null,
      );
      if (decoded.corrupt) {
        tileErrors["run_of_show"] = "run_of_show decode: corrupt stored shape";
      }
      runOfShow = decoded.value;
    }
  } catch (e) {
    void e;
    tileErrors["run_of_show"] = "run_of_show read failed";
  }

  // Intersection (D-4): emit only days that survive (decoded keys) ∩
  // (current show.dates.showDays) ∩ (the ACTIVE viewer's normalized
  // DateRestriction). The active viewer's restriction is the one ALREADY
  // computed for the matching crewMembers[] row (normalizeDateRestriction at
  // the projection boundary above) — reuse it, do NOT re-query. Admin /
  // admin_preview with no per-day restriction → treated as `none` (all current
  // show days), matching the Schedule day-set behavior.
  if (runOfShow !== null) {
    const showDaySet = new Set(show.dates.showDays ?? []);
    const activeRestriction: DateRestriction =
      needsCrewLookup
        ? (crewMembers.find((m) => m.id === (viewer as { crewMemberId: string }).crewMemberId)
            ?.dateRestriction ?? { kind: "none" })
        : { kind: "none" };

    let allowed: Set<string>;
    if (activeRestriction.kind === "unknown_asterisk") {
      // Cannot infer show days for this viewer → drop everything.
      allowed = new Set<string>();
    } else if (activeRestriction.kind === "explicit") {
      // restriction.days are already ISO (normalizeDateRestriction) ∩ showDays.
      allowed = new Set(activeRestriction.days.filter((d) => showDaySet.has(d)));
    } else {
      // `none` (or admin) → all current show days.
      allowed = showDaySet;
    }

    const gated: Record<string, AgendaEntry[]> = {};
    for (const key of Object.keys(runOfShow)) {
      if (allowed.has(key)) {
        gated[key] = runOfShow[key]!;
      }
    }
    runOfShow = Object.keys(gated).length > 0 ? gated : null;
  }

  // === Pull sheet (JSONB on shows) ===
  const pullSheet: PullSheetCase[] | null =
    decodeJsonbColumn<PullSheetCase[]>(showRowDb.pull_sheet) ?? null;

  // === Financials — JOIN shows_internal ONLY when authorized ===
  // The first-line-of-defense gate: when not LEAD, this branch is never
  // taken, so the JSONB column isn't even queried. RLS on shows_internal
  // (admin-only via is_admin()) is the second line; physical separation
  // (financials NOT on `shows`) is the third.
  let financials: FinancialsRow | undefined;
  if (isLead) {
    try {
      const internalRes = await supabase
        .from("shows_internal")
        .select("financials")
        .eq("show_id", showId)
        .maybeSingle();
      if (internalRes.error) {
        tileErrors["financials"] = internalRes.error.message;
      } else if (internalRes.data?.financials) {
        // decodeJsonbColumn: a legacy double-encoded financials is a STRING scalar
        // from Supabase-JS; decode so f.po/proposal/... read as fields, not chars (R8).
        const f = decodeJsonbColumn<FinancialsRow>(internalRes.data.financials) ?? {
          po: null,
          proposal: null,
          invoice: null,
          invoice_notes: null,
        };
        financials = {
          po: f.po ?? null,
          proposal: f.proposal ?? null,
          invoice: f.invoice ?? null,
          invoice_notes: f.invoice_notes ?? null,
        };
      }
    } catch (e) {
      tileErrors["financials"] = e instanceof Error ? e.message : String(e);
    }
  }

  // === viewer_version_token RPC (Task 4.16 Checkpoint B SSR fence) ===
  // Computed by public.viewer_version_token(uuid) — defined in
  // supabase/migrations/20260501001000_internal_and_admin.sql:18-32. The
  // function is granted EXECUTE to authenticated, anon, AND service_role,
  // so this RPC succeeds under every viewer kind. Empty string is the
  // "no fence" sentinel — the bridge tolerates it.
  const versionRpc = await supabase.rpc("viewer_version_token", {
    p_show_id: showId,
  });
  if (versionRpc.error) {
    throw new Error(
      `getShowForViewer: viewer_version_token RPC failed: ${versionRpc.error.message}`,
    );
  }
  const viewerVersionToken: string = typeof versionRpc.data === "string" ? versionRpc.data : "";

  const diagrams = resolveCurrentDiagrams(decodeJsonbColumn(showRowDb.diagrams));
  const openingReelHasVideo = projectOpeningReelHasVideo({
    opening_reel_drive_file_id:
      (showRowDb.opening_reel_drive_file_id as string | null | undefined) ?? null,
    opening_reel_drive_modified_time:
      (showRowDb.opening_reel_drive_modified_time as string | null | undefined) ?? null,
    opening_reel_head_revision_id:
      (showRowDb.opening_reel_head_revision_id as string | null | undefined) ?? null,
    opening_reel_mime_type:
      (showRowDb.opening_reel_mime_type as string | null | undefined) ?? null,
  });

  return {
    show,
    crewMembers,
    hotelReservations,
    rooms,
    transportation,
    contacts,
    pullSheet,
    viewerName,
    viewerFlightInfo,
    viewerVersionToken,
    diagrams,
    openingReelHasVideo,
    lastSyncedAt: (showRowDb.last_synced_at as string | null | undefined) ?? null,
    lastSyncStatus: (showRowDb.last_sync_status as string | null | undefined) ?? null,
    tileErrors,
    runOfShow,
    ...(financials ? { financials } : {}),
  };
}
