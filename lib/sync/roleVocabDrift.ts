import postgres from "postgres";

import { databaseUrl } from "@/lib/sync/_databaseUrl";

/**
 * Drift-eligibility pre-pass (spec 2026-07-16-role-vocab-mapping-convergence §3.1/§3.2).
 *
 * Read-only; published + non-archived shows only (the §3.1 ownership bound). Content-based — no
 * timestamps, deliberately NOT a watermark (spec §7 noGlobalCursor note; `role_token_mappings.updated_at`
 * is unused). A show is eligible when either direction holds:
 *   (a) stamp drift — a consumed-token entry in `applied_role_mappings` whose token has no current
 *       `role_token_mappings` row, or whose stamped grants differ from the current row's grants as a
 *       SET (exact-match via mutual containment — narrow AND broaden; NOT the publish gate's
 *       containment predicate). A malformed stamp (non-array, or an entry that is not
 *       `{token: string, grants: array}`) is eligible → a re-sync self-heals the corruption.
 *   (b) new-mapping catch — an `UNKNOWN_ROLE_TOKEN` warning in `parse_warnings` whose `roleToken`
 *       now has a `role_token_mappings` row. Legacy warnings without a `roleToken` field never match.
 *
 * Failure posture is owned by the caller (tick pre-pass): this throws on a query fault; the caller
 * logs the forensic code and degrades to an empty set.
 */
export async function listRoleVocabDriftEligibleFileIds(): Promise<Set<string>> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    const rows = (await sql.unsafe(`
      with vocab as (select token, grants from public.role_token_mappings)
      select s.drive_file_id
        from public.shows s
        join public.shows_internal si on si.show_id = s.id
       where s.archived = false
         and s.published = true
         and s.drive_file_id is not null
         and (
           (si.applied_role_mappings is not null
             and jsonb_typeof(si.applied_role_mappings) <> 'array')
           or exists (
             select 1
               from jsonb_array_elements(
                      case when jsonb_typeof(si.applied_role_mappings) = 'array'
                           then si.applied_role_mappings else '[]'::jsonb end) e
              cross join lateral (
                select case when jsonb_typeof(e->'grants') = 'array'
                       then (select coalesce(array_agg(t), '{}'::text[])
                               from jsonb_array_elements_text(e->'grants') t)
                       end as entry_grants
              ) g
               left join vocab v
                 on jsonb_typeof(e->'token') = 'string' and v.token = e->>'token'
              where jsonb_typeof(e) <> 'object'
                 or jsonb_typeof(e->'token') <> 'string'
                 or g.entry_grants is null
                 or v.token is null
                 or not (v.grants @> g.entry_grants and g.entry_grants @> v.grants)
           )
           or exists (
             select 1
               from jsonb_array_elements(
                      case when jsonb_typeof(si.parse_warnings) = 'array'
                           then si.parse_warnings else '[]'::jsonb end) w
               join vocab v on v.token = w->>'roleToken'
              where w->>'code' = 'UNKNOWN_ROLE_TOKEN'
                and jsonb_typeof(w->'roleToken') = 'string'
           )
         )
    `)) as Array<{ drive_file_id: string }>;
    return new Set(rows.map((r) => r.drive_file_id));
  } finally {
    await sql.end({ timeout: 5 });
  }
}
