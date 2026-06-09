/**
 * Shared DB-backed test kit for the Phase-2 hold-aware apply tasks (2.4–2.9).
 *
 * Builds a focused real-postgres ApplyParseResultTx adapter: crew-touching methods run real SQL
 * (matching runScheduledCronSync.ts's PostgresPipelineTx); non-crew replace/upsert methods are
 * no-ops (tests assert crew_members + sync_holds + show_change_log only). A HoldPort wraps the
 * same txn's `unsafe`.
 */
import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { canonicalize } from "@/lib/email/canonicalize";
import type { CrewMemberRow, ParseResult } from "@/lib/parser/types";
import type {
  ApplyParseResultSnapshot,
  ApplyParseResultTx,
  PreviousCrewMember,
} from "@/lib/sync/applyParseResult";
import type { HoldPort } from "@/lib/sync/holds/holdPort";

export function holdPort(tx: Sql): HoldPort {
  return {
    async unsafe(query: string, params: unknown[]): Promise<unknown[]> {
      return (await tx.unsafe(query, params as never)) as unknown[];
    },
  };
}

export function crew(name: string, overrides: Partial<CrewMemberRow> = {}): CrewMemberRow {
  return {
    name,
    email: `${name.toLowerCase()}@example.com`,
    phone: "555-OLD",
    role: "A1",
    role_flags: ["A1"],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
    ...overrides,
  };
}

const EMPTY_SHOW: ParseResult["show"] = {
  title: "T",
  client_label: "c",
  client_contact: null,
  template_version: "v",
  venue: null,
  dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
  schedule_phases: {},
  event_details: {},
  agenda_links: [],
  coi_status: "Pending",
  po: null,
  proposal: null,
  invoice: null,
  invoice_notes: null,
};

export function parseResult(crewMembers: CrewMemberRow[]): ParseResult {
  return {
    show: EMPTY_SHOW,
    crewMembers,
    hotelReservations: [],
    rooms: [],
    transportation: null,
    contacts: [],
    pullSheet: [],
    diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
    openingReel: null,
    raw_unrecognized: [],
    warnings: [],
    hardErrors: [],
  };
}

export async function seedShow(tx: Sql): Promise<{ showId: string; driveFileId: string }> {
  const driveFileId = `drv-${randomUUID()}`;
  const slug = `sh-${randomUUID().slice(0, 8)}`;
  const [row] = await tx`
    insert into public.shows (drive_file_id, slug, title, client_label, template_version)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v')
    returning id
  `;
  return { showId: row!.id as string, driveFileId };
}

export async function seedCrew(
  tx: Sql,
  showId: string,
  member: CrewMemberRow,
  opts: { claimed?: boolean } = {},
): Promise<{ id: string; claimed_via_oauth_at: string | null }> {
  const [row] = await tx`
    insert into public.crew_members
      (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
       flight_info, claimed_via_oauth_at)
    values (${showId}, ${member.name}, ${canonicalize(member.email)}, ${member.phone}, ${member.role},
            ${member.role_flags}, ${tx.json(member.date_restriction)}, ${tx.json(member.stage_restriction)},
            ${member.flight_info}, ${opts.claimed ? tx`now()` : null})
    returning id, claimed_via_oauth_at
  `;
  return { id: row!.id as string, claimed_via_oauth_at: (row!.claimed_via_oauth_at as string | null) ?? null };
}

export async function readCrew(tx: Sql, showId: string) {
  return (await tx`
    select id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
           flight_info, claimed_via_oauth_at
      from public.crew_members where show_id = ${showId} order by name
  `) as unknown as Array<{
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    role: string;
    role_flags: string[];
    claimed_via_oauth_at: string | null;
  }>;
}

export async function readHolds(tx: Sql, showId: string) {
  return (await tx`
    select id, entity_key, kind, domain, held_value, proposed_value, base_modified_time,
           reservation_collisions
      from public.sync_holds where show_id = ${showId} order by entity_key
  `) as unknown as Array<{
    id: string;
    entity_key: string;
    kind: string;
    domain: string;
    held_value: Record<string, unknown>;
    proposed_value: Record<string, unknown> | null;
    base_modified_time: string | null;
    reservation_collisions: Array<{ name: string; email: string | null }>;
  }>;
}

export async function readChangeLog(tx: Sql, showId: string) {
  return (await tx`
    select id, source, change_kind, entity_ref, summary, before_image, after_image, status, occurred_at
      from public.show_change_log where show_id = ${showId} order by occurred_at, change_kind, entity_ref
  `) as unknown as Array<{
    id: string;
    source: string;
    change_kind: string;
    entity_ref: string | null;
    summary: string;
    before_image: Record<string, unknown> | null;
    after_image: Record<string, unknown> | null;
    status: string;
  }>;
}

/** A real-postgres ApplyParseResultTx: crew methods run SQL; non-crew methods are no-ops. */
export function applyTx(tx: Sql): ApplyParseResultTx {
  return {
    async deleteCrewMembersNotIn(showId: string, names: string[]) {
      await tx`delete from public.crew_members where show_id = ${showId} and not (name = any(${names}))`;
    },
    async upsertCrewMembers(showId: string, members: ParseResult["crewMembers"]) {
      for (const m of members) {
        await tx`
          insert into public.crew_members
            (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info)
          values (${showId}, ${m.name}, ${canonicalize(m.email)}, ${m.phone}, ${m.role}, ${m.role_flags},
                  ${tx.json(m.date_restriction)}, ${tx.json(m.stage_restriction)}, ${m.flight_info})
          on conflict (show_id, name) do update set
            email = excluded.email, phone = excluded.phone, role = excluded.role,
            role_flags = excluded.role_flags, date_restriction = excluded.date_restriction,
            stage_restriction = excluded.stage_restriction, flight_info = excluded.flight_info
        `;
      }
    },
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
    async deleteLivePendingIngestion() {},
  };
}

/**
 * A real-postgres Phase2Tx adapter for the Task 2.3 integration test. Implements applyShowSnapshot
 * (updates the show + returns the widened previousCrewMembers), the crew methods, the holdPort, and
 * stubs the diagram/reel/asset hooks (tests drive an empty-diagrams, verifyReelOnApply:false parse).
 */
export function phase2Tx(tx: Sql) {
  const base = applyTx(tx);
  return {
    ...base,
    holdPort: () => holdPort(tx),
    async applyShowSnapshot(args: {
      driveFileId: string;
      modifiedTime: string;
      parseResult: ParseResult;
    }) {
      const [show] = (await tx`select id from public.shows where drive_file_id = ${args.driveFileId} limit 1`) as Array<{
        id: string;
      }>;
      const showId = show!.id;
      const previous = (await tx`
        select id, name, email, phone, role, role_flags, date_restriction, stage_restriction,
               flight_info, claimed_via_oauth_at
          from public.crew_members where show_id = ${showId} order by name
      `) as unknown as PreviousCrewMember[];
      await tx`
        update public.shows set last_seen_modified_time = ${args.modifiedTime}::timestamptz,
               last_synced_at = now(), last_sync_status = 'ok', last_sync_error = null
         where drive_file_id = ${args.driveFileId}
      `;
      return {
        outcome: "updated" as const,
        showId,
        previousCrewNames: previous.map((p) => p.name),
        previousCrewMembers: previous.map((p) => ({
          id: p.id,
          name: p.name,
          email: p.email,
          phone: p.phone,
          role: p.role,
          role_flags: p.role_flags,
          date_restriction: p.date_restriction,
          stage_restriction: p.stage_restriction,
          flight_info: p.flight_info,
          claimed_via_oauth_at: p.claimed_via_oauth_at,
        })),
      };
    },
  };
}

export function snapshot(
  showId: string,
  previous: PreviousCrewMember[],
): ApplyParseResultSnapshot {
  return {
    showId,
    previousCrewNames: previous.map((p) => p.name),
    previousCrewMembers: previous,
  };
}

export function prevMember(
  row: { id: string; claimed_via_oauth_at: string | null },
  member: CrewMemberRow,
): PreviousCrewMember {
  return { ...member, id: row.id, claimed_via_oauth_at: row.claimed_via_oauth_at };
}
