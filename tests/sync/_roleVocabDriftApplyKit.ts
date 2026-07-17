/**
 * Shared builders for the role-vocab drift-resync END-TO-END apply tests (Task 7,
 * spec 2026-07-16-role-vocab-mapping-convergence §3.3/§3.4/§6 item 6).
 *
 * These drive the PRODUCTION runPhase2 over `makeSyncPipelineTx(rawTx)` — the same real
 * PostgresPipelineTx the cron pipeline uses (applyShowSnapshot with the real stale CAS,
 * applyParseResult with the real role overlay, upsertShowsInternal with the real stamp write).
 * The `_holdAwareTestkit` `phase2Tx` double is deliberately NOT used: its applyShowSnapshot
 * ignores `staleGuard` (always updates) and its upsertShowsInternal is a no-op, so it can prove
 * neither the equal-watermark CAS nor the shows_internal rewrite this task is about.
 *
 * The parse carries ONE crew member plus an UNKNOWN_ROLE_TOKEN warning anchored to it; the overlay
 * (applyRoleTokenMappings) consumes the warning, unions `grants` onto role_flags, and the apply
 * persists the consumed-token stamp. Expected role_flags / stamp are ALWAYS derived from the
 * `grants` fixture below — never hardcoded (anti-tautology).
 */
import { randomUUID } from "node:crypto";

import type { Sql } from "postgres";

import { canonicalize } from "@/lib/email/canonicalize";
import type { ParseResult } from "@/lib/parser/types";
import type { Phase2Args } from "@/lib/sync/phase2";

import { crew, parseResult } from "./_holdAwareTestkit";

export const DRIFT_DECIDED_BY = "doug@fxav.com";
export const DRIFT_DECIDED_AT = "2026-07-16T00:00:00.000Z";

/** Union of the crew member's base flags with the mapping grants, in role_flags-set order. */
export function expectedRoleFlags(baseFlags: string[], grants: string[]): string[] {
  const set = new Set([...baseFlags, ...grants]);
  return [...set];
}

/**
 * A ParseResult with a single crew member (`crewName`, base `baseFlags`) and one
 * UNKNOWN_ROLE_TOKEN warning anchored to crew index 0 so the overlay can consume it.
 */
export function driftParse(crewName: string, baseFlags: string[], token: string): ParseResult {
  const pr = parseResult([crew(crewName, { role: "A1", role_flags: [...baseFlags] as never })]);
  pr.warnings = [
    {
      severity: "warn",
      code: "UNKNOWN_ROLE_TOKEN",
      message: `Unknown role token: '${token}'`,
      roleToken: token,
      blockRef: { kind: "crew", index: 0, name: crewName },
    },
  ];
  return pr;
}

/**
 * Phase2Args for a cron apply. `driftResync` toggles the stale-guard relaxation under test;
 * `grants` is threaded verbatim into `roleTokenMappings` (the overlay input) so the expected
 * role_flags / stamp derive from the same fixture value the apply consumes. `notableItems` is
 * intentionally omitted so runPhase2 skips the auto-apply change-log writer (out of scope here).
 */
export function driftArgs(
  driveFileId: string,
  modifiedTime: string,
  opts: { driftResync: boolean; token: string; grants: string[]; parse: ParseResult },
): Phase2Args {
  return {
    driveFileId,
    mode: "cron",
    fileMeta: {
      driveFileId,
      name: "Sheet",
      mimeType: "application/vnd.google-apps.spreadsheet",
      modifiedTime,
      parents: ["folder-1"],
    },
    parseResult: opts.parse,
    binding: { bindingToken: "tok", modifiedTime },
    verifyReelOnApply: false,
    roleTokenMappings: [
      {
        token: opts.token,
        grants: opts.grants as never,
        decidedBy: DRIFT_DECIDED_BY,
        decidedAt: DRIFT_DECIDED_AT,
      },
    ],
    ...(opts.driftResync ? { driftResync: true } : {}),
  };
}

export type SeededDriftShow = { showId: string; driveFileId: string; crewName: string };

/**
 * Seed a PUBLISHED, non-archived show + one crew member + a shows_internal row pinned to a PRIOR
 * (pre-convergence) state — role_flags WITHOUT the grant, applied_role_mappings null, and a stale
 * UNKNOWN_ROLE_TOKEN warning. The pinned prior state is the anti-tautology precondition: a NO-OP
 * apply cannot satisfy the post-assertions (role_flags gained the grant, stamp non-null, warning
 * gone). `storedModifiedTime` sets shows.last_seen_modified_time so the equal-/advanced-watermark
 * CAS cases are exact.
 */
export async function seedDriftShow(
  tx: Sql,
  opts: {
    storedModifiedTime: string;
    crewName: string;
    baseFlags: string[];
    token: string;
  },
): Promise<SeededDriftShow> {
  const driveFileId = `drv-rvd-${randomUUID()}`;
  const slug = `sh-rvd-${randomUUID().slice(0, 8)}`;
  const [show] = await tx`
    insert into public.shows
      (drive_file_id, slug, title, client_label, template_version, published, archived,
       last_seen_modified_time)
    values (${driveFileId}, ${slug}, 'T', 'c', 'v', true, false,
            ${opts.storedModifiedTime}::timestamptz)
    returning id`;
  const showId = show!.id as string;
  await tx`
    insert into public.crew_members
      (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info)
    values (${showId}, ${opts.crewName}, ${canonicalize(`${opts.crewName}@x.example`)}, null, 'A1',
            ${opts.baseFlags}, ${tx.json({ kind: "none" })}, ${tx.json({ kind: "none" })}, null)`;
  await tx`
    insert into public.shows_internal (show_id, applied_role_mappings, parse_warnings)
    values (${showId}, null,
            ${JSON.stringify([
              {
                severity: "warn",
                code: "UNKNOWN_ROLE_TOKEN",
                message: `Unknown role token: '${opts.token}'`,
                roleToken: opts.token,
                blockRef: { kind: "crew", index: 0, name: opts.crewName },
              },
            ])}::text::jsonb)`;
  return { showId, driveFileId, crewName: opts.crewName };
}

/** Read the crew member's persisted role_flags. */
export async function readRoleFlags(tx: Sql, showId: string, name: string): Promise<string[]> {
  const [row] = await tx`
    select role_flags from public.crew_members where show_id = ${showId} and name = ${name}`;
  return (row?.role_flags ?? []) as string[];
}

/** Read shows_internal.applied_role_mappings (the consumed-token stamp) + parse_warnings. */
export async function readInternal(
  tx: Sql,
  showId: string,
): Promise<{
  applied_role_mappings: Array<{ token: string; grants: string[] }> | null;
  parse_warnings: Array<Record<string, unknown>> | null;
}> {
  const [row] = await tx`
    select applied_role_mappings, parse_warnings
      from public.shows_internal where show_id = ${showId}`;
  return {
    applied_role_mappings:
      (row?.applied_role_mappings as Array<{ token: string; grants: string[] }> | null) ?? null,
    parse_warnings: (row?.parse_warnings as Array<Record<string, unknown>> | null) ?? null,
  };
}
