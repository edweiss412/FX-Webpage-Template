// Batched, read-only resolver (spec §3.2). Turns a batch of alert rows —
// each carrying its already-projected, sanitized `IdentityContext` (§3.1) —
// into a `Map<alertId, AlertIdentity>` by consulting `ALERT_IDENTITY_MAP`
// and issuing at most 3 batched `.select().in(...).limit(...)` reads.
//
// Design notes (see spec §3.2 for the authoritative contract):
//   - "Effective show" precedence: `row.show_id` (column) ->
//     `identityContext.resolution.show_id` -> the show resolved from
//     `identityContext.resolution.drive_file_id`. The first two forms are
//     already a UUID and are used both for the ->show/->sheet segment AND
//     the crew show-scoping check; the drive_file_id form is display-only
//     (the batched `shows(drive_file_id,title,slug)` read has no `id`
//     column, so it can never feed the scoping check) — this is fine
//     because every code in the shipped 42-code matrix that has a
//     `crewName` segment also sets `row.show_id` directly (OAUTH_IDENTITY_
//     CLAIMED, PICKER_SELECTION_RACE), so the scoping check always has a
//     UUID to compare against when a crew segment is in play.
//   - `makeSegment` is the SOLE segment constructor (Codex/§3.1 rule): it
//     always sanitizes with the resolver's own `includePii` policy, so
//     resolved DB names get the same redaction treatment as projected
//     display strings (Codex F25).
//   - Every Supabase call destructures `{ data, error }`; a returned error
//     OR a thrown error both degrade that lookup to "nothing resolved" and
//     flip the overall result to `kind: "infra_error"` — but do not stop
//     the other (independent) lookups or drop already-resolvable segments
//     for other rows (Codex F9).
import { sanitizeIdentityString } from "./sanitizeIdentityString";
import { ALERT_IDENTITY_MAP, type SegmentSpec } from "./alertIdentityMap";
import type { AlertIdentity, AlertIdentitySegment, IdentityContext } from "./identityTypes";

export type ResolverRow = {
  id: string;
  code: string;
  show_id: string | null;
  occurrence_count: number;
  identityContext: IdentityContext;
};

export type AlertIdentitiesResult = {
  kind: "ok" | "infra_error";
  identities: Map<string, AlertIdentity>;
};

// Minimal structural shape resolveAlertIdentities needs from a Supabase
// client — a `.from(table).select(cols).in(col, ids).limit(n)` builder that
// resolves to `{ data, error }`. Kept narrow (not the full SupabaseClient
// type) so tests can supply a lightweight fake.
type SupabaseLike = {
  from(table: string): {
    select(cols: string): {
      in(
        col: string,
        ids: string[],
      ): {
        limit(
          n: number,
        ): PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>;
      };
    };
  };
};

type CrewRow = { id: string; show_id: string | null; name: string | null };
type ShowRow = { id?: string; drive_file_id?: string; title: string | null; slug: string | null };

// The email segment's authoritative source is per-code (spec §3.2 "OAuth
// email — authoritative source only"): OAUTH_IDENTITY_CLAIMED reads the
// canonical OAuth `user_email`; every other `{ kind: "email" }` code (today
// only AMBIGUOUS_EMAIL_BINDING) reads the producer's own `email` field.
const EMAIL_FIELD_BY_CODE: Record<string, "user_email" | "email"> = {
  OAUTH_IDENTITY_CLAIMED: "user_email",
};

const ROLE_CHANGE_NAMES_CAP = 3;

function effectiveShowId(row: ResolverRow): string | undefined {
  return row.show_id ?? row.identityContext.resolution.show_id;
}

function resolveCrewIdForKey(row: ResolverRow, key: string): string | undefined {
  if (key === "crew_member_id") return row.identityContext.resolution.crew_member_id;
  if (key === "stale_crew_member_id") return row.identityContext.resolution.stale_crew_member_id;
  return undefined;
}

function formatContextFieldValue(
  row: ResolverRow,
  spec: Extract<SegmentSpec, { kind: "contextField" }>,
): string | undefined {
  const raw = row.identityContext.display[spec.key as keyof IdentityContext["display"]];
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    // `role_change_crew_names` — already capped to 3 by projectIdentityContext,
    // but the resolver enforces the cap defensively and appends a "+N more"
    // disclosure derived from the UNCAPPED `role_change_count` (Codex/spec
    // rule 5 — the array case must be handled explicitly here, not by the
    // map's optional string->string `format`).
    const names = raw.slice(0, ROLE_CHANGE_NAMES_CAP);
    const joined = names.join(", ");
    const total = row.identityContext.counts.role_change_count ?? names.length;
    const extra = total - names.length;
    return extra > 0 ? `${joined} +${extra} more` : joined;
  }
  if (typeof raw !== "string") return undefined;
  return spec.format ? spec.format(raw) : raw;
}

function formatCount(
  row: ResolverRow,
  spec: Extract<SegmentSpec, { kind: "count" }>,
): string | undefined {
  const n = row.identityContext.counts[spec.key as keyof IdentityContext["counts"]];
  if (typeof n !== "number") return undefined;
  return `${n} ${spec.label}${n === 1 ? "" : "s"}`;
}

function resolveEmailValue(row: ResolverRow): string | undefined {
  const field = EMAIL_FIELD_BY_CODE[row.code] ?? "email";
  return row.identityContext.display[field];
}

export async function resolveAlertIdentities(
  rows: ResolverRow[],
  supabase: SupabaseLike,
  opts: { includePii: boolean },
): Promise<AlertIdentitiesResult> {
  const includePii = opts.includePii;

  // makeSegment (spec §3.1/§3.2): the sole segment constructor. ALWAYS
  // sanitizes with the resolver's own includePii policy, regardless of the
  // segment's own `pii` tag (that tag only marks it for describeAlert's
  // later withholding decision).
  function makeSegment(
    label: string | null,
    rawValue: unknown,
    seg: { pii: boolean },
  ): AlertIdentitySegment | null {
    const value = sanitizeIdentityString(rawValue, { includePii });
    if (!value) return null;
    return seg.pii ? { label, value, pii: true } : { label, value };
  }

  // 1. Collect the bounded id sets this batch actually needs, per-code.
  const crewIds = new Set<string>();
  const showIds = new Set<string>();
  const driveFileIds = new Set<string>();

  for (const row of rows) {
    const entry = ALERT_IDENTITY_MAP[row.code];
    if (!entry || "kind" in entry) continue; // global / unknown code -> no lookups needed
    for (const seg of entry.segments) {
      if (seg.kind === "crewName") {
        const id = resolveCrewIdForKey(row, seg.key);
        if (id) crewIds.add(id);
      } else if (seg.kind === "showName" || seg.kind === "sheetName") {
        const showId = effectiveShowId(row);
        if (showId) showIds.add(showId);
        else if (row.identityContext.resolution.drive_file_id) {
          driveFileIds.add(row.identityContext.resolution.drive_file_id);
        }
      }
    }
  }

  // 2. Issue at most 3 batched, bounded reads. Each is independently
  // fault-tolerant (Codex F9): a returned/thrown error on one lookup
  // degrades only the segments that depended on it.
  let infra = false;
  const crewById = new Map<string, CrewRow>();
  const showById = new Map<string, ShowRow>();
  const showByDriveFileId = new Map<string, ShowRow>();

  if (crewIds.size > 0) {
    try {
      // not-subject-to-meta: read-only identity resolution; returns typed {kind:'infra_error'}, no mutation
      const { data, error } = await supabase
        .from("crew_members")
        .select("id,show_id,name")
        .in("id", [...crewIds])
        .limit(crewIds.size);
      if (error) infra = true;
      else for (const r of (data as CrewRow[] | null) ?? []) crewById.set(r.id, r);
    } catch {
      infra = true;
    }
  }

  if (showIds.size > 0) {
    try {
      // not-subject-to-meta: read-only identity resolution; returns typed {kind:'infra_error'}, no mutation
      const { data, error } = await supabase
        .from("shows")
        .select("id,title,slug")
        .in("id", [...showIds])
        .limit(showIds.size);
      if (error) infra = true;
      else for (const r of (data as ShowRow[] | null) ?? []) if (r.id) showById.set(r.id, r);
    } catch {
      infra = true;
    }
  }

  if (driveFileIds.size > 0) {
    try {
      // not-subject-to-meta: read-only identity resolution; returns typed {kind:'infra_error'}, no mutation
      const { data, error } = await supabase
        .from("shows")
        .select("drive_file_id,title,slug")
        .in("drive_file_id", [...driveFileIds])
        .limit(driveFileIds.size);
      if (error) infra = true;
      else
        for (const r of (data as ShowRow[] | null) ?? [])
          if (r.drive_file_id) showByDriveFileId.set(r.drive_file_id, r);
    } catch {
      infra = true;
    }
  }

  function resolveShowSegment(
    row: ResolverRow,
    label: "Show" | "Sheet",
  ): AlertIdentitySegment | null {
    const showId = effectiveShowId(row);
    if (showId) {
      const show = showById.get(showId);
      return show?.title ? makeSegment(label, show.title, { pii: false }) : null;
    }
    const driveFileId = row.identityContext.resolution.drive_file_id;
    if (driveFileId) {
      const show = showByDriveFileId.get(driveFileId);
      if (show?.title) return makeSegment(label, show.title, { pii: false });
    }
    return null;
  }

  function resolveCrewSegment(row: ResolverRow, key: string): AlertIdentitySegment | null {
    const crewId = resolveCrewIdForKey(row, key);
    if (!crewId) return null;
    const crew = crewById.get(crewId);
    if (!crew?.name) return null;
    // Show-scoped crew resolution (Codex F7 + whole-diff R1 HIGH), FAIL-CLOSED:
    // a crew name is attached ONLY when there is an effective show to scope
    // against AND the crew row belongs to it (`crew.show_id === effective show`).
    // If there is NO effective show (row.show_id null, no context show_id, no
    // resolvable drive_file_id), we CANNOT verify the crew belongs to this
    // alert's scope, so we DROP the segment rather than surface a potentially
    // cross-show identity. Today's crewName producers (OAUTH_IDENTITY_CLAIMED,
    // PICKER_SELECTION_RACE, ROLE_FLAGS_NOTICE) always set a UUID show_id, but
    // `admin_alerts.code` is unconstrained, so the resolver honors its own
    // show-scoping contract for any drifted/manual/future row.
    const showId = effectiveShowId(row);
    if (!showId || crew.show_id !== showId) return null;
    return makeSegment("Crew", crew.name, { pii: false });
  }

  // 3. Build each row's AlertIdentity from the resolved lookups + the
  // row's already-projected identityContext.
  const identities = new Map<string, AlertIdentity>();
  for (const row of rows) {
    const entry = ALERT_IDENTITY_MAP[row.code];
    if (!entry || "kind" in entry) {
      identities.set(row.id, { segments: [], global: true });
      continue;
    }

    const segments: AlertIdentitySegment[] = [];
    for (const seg of entry.segments) {
      let built: AlertIdentitySegment | null = null;
      switch (seg.kind) {
        case "showName":
          built = resolveShowSegment(row, "Show");
          break;
        case "sheetName":
          built = resolveShowSegment(row, "Sheet");
          break;
        case "crewName":
          built = resolveCrewSegment(row, seg.key);
          break;
        case "contextField": {
          const value = formatContextFieldValue(row, seg);
          built = value !== undefined ? makeSegment(seg.label, value, { pii: false }) : null;
          break;
        }
        case "count": {
          const value = formatCount(row, seg);
          built = value !== undefined ? makeSegment(null, value, { pii: false }) : null;
          break;
        }
        case "email": {
          const value = resolveEmailValue(row);
          built = value ? makeSegment(null, value, { pii: true }) : null;
          break;
        }
      }
      if (built) segments.push(built);
    }

    // Coalescing disclosure (§6.4a): only for entity-bearing, non-global
    // codes with >=1 resolved segment and occurrence_count > 1.
    if (segments.length > 0 && row.occurrence_count > 1) {
      segments.push({ label: null, value: `(most recent of ${row.occurrence_count})` });
    }

    identities.set(row.id, { segments, global: false });
  }

  return { kind: infra ? "infra_error" : "ok", identities };
}
