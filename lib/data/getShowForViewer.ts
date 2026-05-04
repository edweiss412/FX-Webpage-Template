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
 *    from a DIFFERENT show fails closed with `LINK_NO_CREW_MATCH`; the helper
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
import { deriveSchedulePhases } from "@/lib/parser";
import type {
  ContactRow,
  DateRestriction,
  HotelReservationRow,
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
  rooms: RoomRow[];
  transportation: TransportationRow | null;
  contacts: ContactRow[];
  pullSheet: PullSheetCase[] | null;
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
   * Monotonic millisecond high-water-mark across (shows.last_synced_at,
   * max(crew_member_auth.last_changed_at), max(crew_members.last_changed_at)),
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

export async function getShowForViewer(
  showId: string,
  viewer: Viewer,
): Promise<ShowForViewer> {
  const supabase = createSupabaseServiceRoleClient();

  const isAdmin = viewer.kind === "admin";
  const needsCrewLookup = viewer.kind === "crew" || viewer.kind === "admin_preview";

  // Freshly-derived flags. Empty array on the admin branch (admin authority
  // comes from `isAdmin`, NOT from a crew row — admins may have no crew row
  // for this show at all).
  let derivedFlags: RoleFlag[] = [];
  let viewerName: string | null = null;

  if (needsCrewLookup) {
    // Bind lookup to BOTH id AND show_id. The dual constraint is the
    // cross-show fail-closed (§7.2.2 step 5). A crew row with the right
    // id but the wrong show_id returns `data === null` here, which
    // becomes `LINK_NO_CREW_MATCH` below — the row's flags are NEVER
    // applied to the requested show.
    const lookup = await supabase
      .from("crew_members")
      .select("role_flags, name")
      .eq("id", viewer.crewMemberId)
      .eq("show_id", showId)
      .maybeSingle();
    if (lookup.error) {
      throw new Error(`getShowForViewer: crew lookup failed: ${lookup.error.message}`);
    }
    if (!lookup.data) {
      // §7.2.2 step 5; §12.4. Operator-facing canonical code; UI surfaces
      // route through lib/messages/lookup.ts (Task 4.14) for crew copy.
      throw new Error("LINK_NO_CREW_MATCH");
    }
    derivedFlags = (lookup.data.role_flags as RoleFlag[]) ?? [];
    viewerName = (lookup.data.name as string) ?? null;
  }

  const isLead = isAdmin || derivedFlags.includes("LEAD");

  // === Show row (always loaded) ===
  const showRes = await supabase.from("shows").select("*").eq("id", showId).maybeSingle();
  if (showRes.error) {
    throw new Error(`getShowForViewer: show fetch failed: ${showRes.error.message}`);
  }
  if (!showRes.data) {
    throw new Error("LINK_NO_CREW_MATCH");
  }
  const showRowDb = showRes.data;
  const datesValue: ShowRow["dates"] = showRowDb.dates ?? {
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
  const persistedPhases = showRowDb.event_details?.schedule_phases as
    | ShowRow["schedule_phases"]
    | undefined;
  const schedulePhases: ShowRow["schedule_phases"] =
    persistedPhases && typeof persistedPhases === "object"
      ? persistedPhases
      : deriveSchedulePhases(datesValue);
  const show: ShowRow = {
    title: showRowDb.title,
    client_label: showRowDb.client_label,
    client_contact: showRowDb.client_contact ?? null,
    template_version: showRowDb.template_version,
    venue: showRowDb.venue ?? null,
    dates: datesValue,
    schedule_phases: schedulePhases,
    event_details: showRowDb.event_details ?? {},
    agenda_links: showRowDb.agenda_links ?? [],
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
    dateRestriction:
      ((row.date_restriction as DateRestriction | null) ?? { kind: "none" }),
    stageRestriction:
      ((row.stage_restriction as StageRestriction | null) ?? { kind: "none" }),
  }));

  // === Hotel reservations ===
  // For crew / admin_preview viewers, filter to those that name the viewer.
  // Admin viewers see ALL reservations.
  const hotelRes = await supabase
    .from("hotel_reservations")
    .select("ordinal, hotel_name, hotel_address, names, confirmation_no, check_in, check_out, notes")
    .eq("show_id", showId)
    .order("ordinal", { ascending: true });
  if (hotelRes.error) {
    throw new Error(`getShowForViewer: hotel fetch failed: ${hotelRes.error.message}`);
  }
  const allHotels: HotelReservationRow[] = (hotelRes.data ?? []).map((row) => ({
    ordinal: row.ordinal as number,
    hotel_name: (row.hotel_name as string | null) ?? null,
    hotel_address: (row.hotel_address as string | null) ?? null,
    names: ((row.names as string[]) ?? []) as string[],
    confirmation_no: (row.confirmation_no as string | null) ?? null,
    check_in: (row.check_in as string | null) ?? null,
    check_out: (row.check_out as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));
  const hotelReservations: HotelReservationRow[] =
    isAdmin || viewerName === null
      ? allHotels
      : allHotels.filter((res) =>
          res.names.some((n) =>
            n.toLowerCase().includes((viewerName as string).toLowerCase()),
          ),
        );

  // === Rooms ===
  const roomRes = await supabase.from("rooms").select("*").eq("show_id", showId);
  if (roomRes.error) {
    throw new Error(`getShowForViewer: rooms fetch failed: ${roomRes.error.message}`);
  }
  const rooms: RoomRow[] = (roomRes.data ?? []).map((row) => ({
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

  // === Transportation (1:1 with show; null when no row) ===
  const transRes = await supabase
    .from("transportation")
    .select("*")
    .eq("show_id", showId)
    .maybeSingle();
  if (transRes.error) {
    throw new Error(`getShowForViewer: transportation fetch failed: ${transRes.error.message}`);
  }
  const transportation: TransportationRow | null = transRes.data
    ? {
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
          (transRes.data.schedule as Array<{
            stage: string;
            date: string | null;
            time: string | null;
            assigned_names: string[];
          }>) ?? []
        ).map((entry) => ({
          stage: entry.stage,
          date: entry.date ?? null,
          time: entry.time ?? null,
          assigned_names: Array.isArray(entry.assigned_names) ? entry.assigned_names : [],
        })),
        notes: (transRes.data.notes as string | null) ?? null,
      }
    : null;

  // === Contacts ===
  const contactsRes = await supabase.from("contacts").select("*").eq("show_id", showId);
  if (contactsRes.error) {
    throw new Error(`getShowForViewer: contacts fetch failed: ${contactsRes.error.message}`);
  }
  const contacts: ContactRow[] = (contactsRes.data ?? []).map((row) => ({
    kind: row.kind as ContactRow["kind"],
    name: (row.name as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  }));

  // === Pull sheet (JSONB on shows) ===
  const pullSheet: PullSheetCase[] | null =
    (showRowDb.pull_sheet as PullSheetCase[] | null) ?? null;

  // === Financials — JOIN shows_internal ONLY when authorized ===
  // The first-line-of-defense gate: when not LEAD, this branch is never
  // taken, so the JSONB column isn't even queried. RLS on shows_internal
  // (admin-only via is_admin()) is the second line; physical separation
  // (financials NOT on `shows`) is the third.
  let financials: FinancialsRow | undefined;
  if (isLead) {
    const internalRes = await supabase
      .from("shows_internal")
      .select("financials")
      .eq("show_id", showId)
      .maybeSingle();
    if (internalRes.error) {
      throw new Error(
        `getShowForViewer: shows_internal fetch failed: ${internalRes.error.message}`,
      );
    }
    if (internalRes.data?.financials) {
      const f = internalRes.data.financials as FinancialsRow;
      financials = {
        po: f.po ?? null,
        proposal: f.proposal ?? null,
        invoice: f.invoice ?? null,
        invoice_notes: f.invoice_notes ?? null,
      };
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
  const viewerVersionToken: string =
    typeof versionRpc.data === "string" ? versionRpc.data : "";

  return {
    show,
    crewMembers,
    hotelReservations,
    rooms,
    transportation,
    contacts,
    pullSheet,
    viewerName,
    viewerVersionToken,
    ...(financials ? { financials } : {}),
  };
}
