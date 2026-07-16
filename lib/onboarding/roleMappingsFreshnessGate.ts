/**
 * Publish freshness gate — wizard apply call sites
 * (spec 2026-07-16-role-vocab-staging-overlay §3.5 call site 1).
 *
 * Evaluates the SHARED SQL predicate `role_mappings_stamp_satisfied` (the single
 * implementation — no TS duplicate) against a staged parse's consumed-token stamp,
 * on the CALLER'S held-lock transaction (the FOR SHARE rows inside the predicate
 * lock for that tx — the commit-order serialization vs lockless settings mutations).
 * Evaluated UNCONDITIONALLY per row (spec R13: no skip-on-absent branch; the
 * predicate owns null/[]/entries semantics — null = legacy row, passes).
 *
 * Invariant 9: a query fault THROWS out of this helper (typed by the caller's
 * boundary) — NEVER an empty-vocabulary degrade (that would falsely refuse every
 * stamped row with the business code) and NEVER the business code itself. This is
 * deliberately the OPPOSITE posture from the staging loader's best-effort [].
 */
export type RoleMappingsFreshness =
  | { ok: true }
  | { ok: false; code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH" };

export async function assertRoleMappingsFresh(
  queryOne: <T>(sql: string, params: unknown[]) => Promise<T>,
  stamp: unknown,
): Promise<RoleMappingsFreshness> {
  // stamp == null (absent key OR explicit null — legacy rows) MUST bind SQL NULL:
  // JSON.stringify(null) would send the jsonb literal 'null', which the predicate
  // fail-closes as corrupt (non-array) — falsely refusing every legacy row.
  // Stringified TEXT + text→jsonb cast is driver-agnostic (avoids the postgres.js
  // $N::jsonb double-encode trap).
  const row = await queryOne<{ ok: boolean } | undefined>(
    `select public.role_mappings_stamp_satisfied($1::text::jsonb) as ok`,
    [stamp == null ? null : JSON.stringify(stamp)], // jsonb-text-exempt: param is TEXT ($1::text::jsonb) — single serialization, the cast parses it; raw-value bind would double-encode under postgres.js
  );
  return row?.ok === true ? { ok: true } : { ok: false, code: "ROLE_MAPPINGS_OUTDATED_AT_PUBLISH" };
}
