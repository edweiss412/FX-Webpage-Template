// scripts/validation-check-seed.ts — M12 Phase 0.C Task 0.C.5.
//
// Per master spec §3.3.2 — 12 predicates (a, b, b', c-g, i, k, l, m, n).
// Dispatch logic per R55 commit 94 F48:
//   * --combo all       → predicates (a, b, c, d, e, f, g, i, k, l, m, n)
//   * --combo <single>  → predicates (a, b', c, d, e, f, g, i, k, l, m, n)
// `last_seed_date` is the "all-combos completion stamp" written exclusively
// by validation_finalize_all_atomic; predicate (b) treats NULL as stale
// per R57 F49.
//
// Exit 0 with "OK: seed matches today (combos: ...)"; exit 1 to stderr with
// diagnostic naming the failed predicate.
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

import { loadValidationEnv } from "./lib/validation-env";
import {
  assertProdEquivalentTarget,
  assertSupabaseTargetMatchesProjectRef,
} from "./lib/validation-target";
import {
  EMAIL_SHAPE_RX,
  R_COMBOS,
  REJECTED_DOMAIN_RX,
  SW_COMBOS,
  VALIDATION_PULL_SHEET,
  buildFixtures,
  type Combo,
  type FixtureRow,
} from "./lib/validation-fixtures";

const USAGE = `Usage: pnpm validation:check-seed [--combo <id>|all] [--allow-local-override] [--today YYYY-MM-DD] [--help]

Per master spec §3.3.2 — evaluates the picker-fixture lockstep contract
against the live validation_state singleton + crew_members / show_share_tokens
joins. Exit 0 on PASS; exit 1 with diagnostic on first failed predicate.

Options:
  --combo <id>            Combo scope: \`all\` (predicate (b) — last_seed_date)
                          or a single combo enum (predicate (b') —
                          combos_seeded_dates[<combo>]). Defaults to \`all\`.
  --allow-local-override  Permit running against http://localhost / 127.0.0.1.
  --today YYYY-MM-DD      Override the canonical UTC \`today\` date used by
                          predicates (b/b'/i). Defaults to
                          \`new Date().toISOString().slice(0, 10)\`.
  --help                  Print this message and exit 0.

Required environment variables (§9.1.2 check-seed row):
  VALIDATION_SUPABASE_URL
  VALIDATION_SUPABASE_SECRET_KEY
  VALIDATION_SUPABASE_PROJECT_REF
  VALIDATION_J3_CLAIM_EMAIL
`;

const ALL_COMBOS: Combo[] = [...R_COMBOS, ...SW_COMBOS];

// R15 commit 35 canonical rejected-domain set — single source of truth at
// scripts/lib/validation-fixtures.ts. Imported above (REJECTED_DOMAIN_RX +
// EMAIL_SHAPE_RX). Local declaration removed to eliminate drift risk.

type ValidationStateRow = {
  key: string;
  last_seed_date: string | null;
  combos_materialized: string[];
  combos_seeded_dates: Record<string, string>;
  alias_map: Record<string, Record<string, string>>;
  seeded_by: string;
  seeded_supabase_project_ref: string;
};

type LooseSupabaseClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: unknown) => {
        maybeSingle: () => Promise<{
          data: unknown;
          error: { message?: string } | null;
        }>;
      };
    };
  };
  rpc: (
    fnName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v === undefined || v.length === 0) {
    throw new Error(
      `${name} is required — set it in .env.local per .env.local.example + spec §9.1.2.`,
    );
  }
  return v;
}

class CheckSeedFailure extends Error {
  constructor(public predicate: string, msg: string) {
    super(`predicate (${predicate}) — ${msg}`);
    this.name = "CheckSeedFailure";
  }
}

async function loadValidationState(
  supabase: LooseSupabaseClient,
): Promise<ValidationStateRow | null> {
  const { data, error } = await supabase
    .from("validation_state")
    .select(
      "key,last_seed_date,combos_materialized,combos_seeded_dates,alias_map,seeded_by,seeded_supabase_project_ref",
    )
    .eq("key", "validation_seed")
    .maybeSingle();
  if (error) {
    throw new Error(
      `validation_state read failed: ${error.message ?? JSON.stringify(error)}`,
    );
  }
  if (data === null || data === undefined) return null;
  return data as ValidationStateRow;
}

async function runChecks(
  supabase: LooseSupabaseClient,
  dispatch: "all" | { single: Combo },
  validationTodayIso: string,
  projectRef: string,
  j3ClaimEmail: string,
): Promise<void> {
  // (k) J3 claim-email guard — fires before DB read so unset env aborts early.
  if (REJECTED_DOMAIN_RX.test(j3ClaimEmail)) {
    throw new CheckSeedFailure(
      "k",
      `VALIDATION_J3_CLAIM_EMAIL='${j3ClaimEmail}' matches placeholder/dev-only reserved domain (RFC 2606 + RFC 6761 + mDNS RFC 6762 + project-conventional) — J3 leg (c) unwalkable.`,
    );
  }
  // R23-F1 — real-email-shape guard. A value like 'not-an-email' would
  // pass the rejected-domain check but fail at Google OAuth time. Mirror
  // the EMAIL_SHAPE_RX guard from fixtures.
  if (!EMAIL_SHAPE_RX.test(j3ClaimEmail)) {
    throw new CheckSeedFailure(
      "k",
      `VALIDATION_J3_CLAIM_EMAIL='${j3ClaimEmail}' is not a real-email shape (must be <local>@<domain>.<tld>). Google OAuth cannot authenticate against malformed addresses; J3 leg (c) unwalkable.`,
    );
  }

  // (a) singleton row missing
  const row = await loadValidationState(supabase);
  if (row === null) {
    throw new CheckSeedFailure(
      "a",
      "validation_state row missing (no row with key='validation_seed'). Run `pnpm validation:reseed --combo all`.",
    );
  }

  // (b) / (b') freshness
  if (dispatch === "all") {
    if (row.last_seed_date === null) {
      throw new CheckSeedFailure(
        "b",
        "validation_state.last_seed_date IS NULL — validation_finalize_all_atomic has never executed; run `pnpm validation:reseed --combo all` to perform the full all-combos reseed which calls the finalizer.",
      );
    }
    if (row.last_seed_date !== validationTodayIso) {
      throw new CheckSeedFailure(
        "b",
        `validation_state.last_seed_date = ${row.last_seed_date} != ${validationTodayIso} — re-run \`pnpm validation:reseed --combo all\` to refresh.`,
      );
    }
  } else {
    const single = dispatch.single;
    const stamp = row.combos_seeded_dates[single];
    if (stamp !== validationTodayIso) {
      throw new CheckSeedFailure(
        "b'",
        `validation_state.combos_seeded_dates['${single}'] = ${stamp ?? "<absent>"} != ${validationTodayIso} — re-run \`pnpm validation:reseed --combo ${single}\` to refresh the per-combo stamp.`,
      );
    }
  }

  // (c) combos_materialized covers the requested set
  const requestedCombos: Combo[] =
    dispatch === "all" ? ALL_COMBOS : [dispatch.single];
  const materializedSet = new Set(row.combos_materialized);
  const missingMaterialized = requestedCombos.filter(
    (c) => !materializedSet.has(c),
  );
  if (missingMaterialized.length > 0) {
    throw new CheckSeedFailure(
      "c",
      `combos_materialized missing: ${missingMaterialized.join(",")}. Expected: ${requestedCombos.join(",")}.`,
    );
  }
  // Codex Phase 0.C R9-F1 — reject STALE/UNEXPECTED top-level keys in
  // combos_materialized, alias_map, and combos_seeded_dates regardless
  // of dispatch. Stale keys from a prior matrix version don't belong in
  // any dispatch's expected state. Without this check, resolve-alias
  // would happily return stale identities while check-seed reports OK.
  const allComboSet = new Set<string>(ALL_COMBOS);
  const extraMaterialized = row.combos_materialized.filter(
    (c) => !allComboSet.has(c),
  );
  if (extraMaterialized.length > 0) {
    throw new CheckSeedFailure(
      "c",
      `combos_materialized contains stale/unknown combos: ${extraMaterialized.join(",")}. Re-run \`pnpm validation:reseed --combo all\` (the finalizer prunes stale keys).`,
    );
  }
  const extraAliasMap = Object.keys(row.alias_map).filter(
    (c) => !allComboSet.has(c),
  );
  if (extraAliasMap.length > 0) {
    throw new CheckSeedFailure(
      "c",
      `alias_map contains stale/unknown top-level combos: ${extraAliasMap.join(",")}.`,
    );
  }
  const extraSeededDates = Object.keys(row.combos_seeded_dates).filter(
    (c) => !allComboSet.has(c),
  );
  if (extraSeededDates.length > 0) {
    throw new CheckSeedFailure(
      "c",
      `combos_seeded_dates contains stale/unknown combos: ${extraSeededDates.join(",")}.`,
    );
  }

  // (d) project_ref matches
  if (row.seeded_supabase_project_ref !== projectRef) {
    throw new CheckSeedFailure(
      "d",
      `seeded_supabase_project_ref=${row.seeded_supabase_project_ref} != VALIDATION_SUPABASE_PROJECT_REF=${projectRef}. Re-seed against the correct project.`,
    );
  }

  // (e) alias_map storage predicate — Codex Phase 0.C R5 F1 tightening:
  //     compare alias_map[combo] KEYS against the canonical fixture's
  //     alias set exactly, not just leaf counts. A 9-key R-slice with
  //     the wrong alias names (e.g., alias_5a_lead replaced with
  //     alias_foo) would have passed the prior count-only check, then
  //     predicate (o) would loop expecting alias_5a_lead but the row
  //     isn't there (continue) → false-green walk gate.
  //
  //     Build canonical fixtures HERE so (e) can derive its expected
  //     alias set from the same source predicate (o) uses below. Avoids
  //     a second source-of-truth.
  const expectedFixtures = buildFixtures(validationTodayIso);
  const expectedByCombo = new Map<Combo, FixtureRow>(
    expectedFixtures.map((fx) => [fx.combo, fx]),
  );
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo];
    if (!slice || typeof slice !== "object") {
      throw new CheckSeedFailure(
        "e",
        `alias_map missing combo key '${combo}'. Run \`pnpm validation:reseed --combo ${dispatch === "all" ? "all" : combo}\`.`,
      );
    }
    const expectedFixture = expectedByCombo.get(combo);
    if (!expectedFixture) {
      throw new CheckSeedFailure(
        "e",
        `Internal: no canonical fixture for combo '${combo}' (build error).`,
      );
    }
    const expectedAliasKeys = expectedFixture.crewMembers
      .map((c) => c.alias)
      .sort();
    const liveAliasKeys = Object.keys(slice).sort();
    if (
      liveAliasKeys.length !== expectedAliasKeys.length ||
      liveAliasKeys.some((k, i) => k !== expectedAliasKeys[i])
    ) {
      throw new CheckSeedFailure(
        "e",
        `alias_map[${combo}] has aliases [${liveAliasKeys.join(",")}]; expected [${expectedAliasKeys.join(",")}] per spec §3.3 + §3.3.1. The walk-session gate requires the exact canonical alias set, not just the right count.`,
      );
    }
  }
  if (dispatch === "all") {
    const total = ALL_COMBOS.reduce(
      (sum, c) => sum + Object.keys(row.alias_map[c] ?? {}).length,
      0,
    );
    if (total !== 96) {
      throw new CheckSeedFailure(
        "e",
        `alias_map total leaves = ${total}; expected 96 (10 R × 9 + 6 SW × 1) per spec §3.3.`,
      );
    }
  }

  // (i) every combo in requested set has combos_seeded_dates[combo] = today
  for (const combo of requestedCombos) {
    const stamp = row.combos_seeded_dates[combo];
    if (stamp !== validationTodayIso) {
      throw new CheckSeedFailure(
        "i",
        `combos_seeded_dates['${combo}']=${stamp ?? "<absent>"} != ${validationTodayIso}. Partial --combo all detected (UTC-midnight crossing OR per-combo mint failed). Re-run \`pnpm validation:reseed --combo all\`.`,
      );
    }
  }

  // (f) / (l) / (m) / (n) — DB-side cross-reference queries via psql-style
  //     RPC pattern. We do the joins in SQL via a service-role
  //     execute_sql-equivalent — but supabase-js doesn't expose raw SQL by
  //     default. Use a single SECURITY DEFINER read RPC OR multiple .from()
  //     reads. For simplicity and robust read access, we batch-fetch
  //     crew_members and shows for every validation_<combo> show via
  //     filtered .from() reads.
  const showIdByCombo = new Map<Combo, string>();
  // Collect all unique crew_id UUIDs referenced from alias_map (the
  // post-reseed expectation set).
  const expectedCrewIds = new Set<string>();
  // (k) R1 alias_5a_lead.email DB-side recheck
  let r1Alias5aCrewId: string | null = null;
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo] ?? {};
    for (const [alias, id] of Object.entries(slice)) {
      expectedCrewIds.add(id);
      if (combo === "R1" && alias === "alias_5a_lead") r1Alias5aCrewId = id;
    }
  }

  // Fetch all validation shows (one round-trip).
  const showsRes = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          like: (
            col: string,
            pat: string,
          ) => Promise<{
            data: unknown;
            error: { message?: string } | null;
          }>;
        };
      };
    }
  )
    .from("shows")
    .select(
      "id,drive_file_id,archived,published,dates,title,slug,venue,pull_sheet,client_label",
    )
    .like("drive_file_id", "validation_%");
  if (showsRes.error) {
    throw new Error(
      `shows read failed: ${showsRes.error.message ?? JSON.stringify(showsRes.error)}`,
    );
  }
  type ShowRow = {
    id: string;
    drive_file_id: string;
    archived: boolean;
    published: boolean;
    dates: Record<string, unknown> | null;
    title: string;
    slug: string;
    venue: Record<string, unknown> | null;
    pull_sheet: unknown[] | null;
    client_label: string;
  };
  // Codex Phase 0.C R15-F2 + R19-F1 — fixture-ownership filter.
  //   R15-F2: literal 'validation_' prefix (the SQL `.like()` wildcard
  //     would let 'validationX123' slip through; client-side startsWith
  //     enforces the literal underscore).
  //   R19-F1: client_label === 'M12 Validation' sentinel. The prefix
  //     alone isn't durable ownership proof — a real/imported show
  //     could have a Drive file id starting 'validation_'. The mint
  //     RPC stamps client_label='M12 Validation' on every reseed
  //     (INSERT + ON CONFLICT UPDATE SET), so the sentinel proves
  //     fixture ownership. Both check-seed and the finalize prune
  //     must use the SAME ownership predicate.
  const shows = ((showsRes.data ?? []) as ShowRow[]).filter(
    (s) =>
      s.drive_file_id.startsWith("validation_") &&
      s.client_label === "M12 Validation",
  );
  for (const s of shows) {
    // R19 F18 — UPPERCASE combo enum verbatim; resolve 'validation_<C>' → <C>.
    const combo = s.drive_file_id.replace(/^validation_/, "") as Combo;
    showIdByCombo.set(combo, s.id);
  }

  // (n) every requested-set validation show has archived=false AND published=true
  for (const combo of requestedCombos) {
    const show = shows.find((s) => s.drive_file_id === `validation_${combo}`);
    if (!show) continue;
    if (show.archived || !show.published) {
      throw new CheckSeedFailure(
        "n",
        `validation show ${combo} has archived=${show.archived} published=${show.published} after reseed — mint RPC ON CONFLICT UPDATE SET clause missing baseline restore.`,
      );
    }
  }

  // Codex Phase 0.C R14-F1 — under --combo all dispatch, reject any
  // physical validation show whose suffix isn't in ALL_COMBOS. Same
  // class as R9 (validation_state stale keys) extended to the shows
  // table. The finalize RPC now DELETEs stale validation shows, but
  // this guard is defense-in-depth: if the prune ever fails to land
  // (e.g., manual intervention, partial migration), check-seed
  // surfaces it.
  if (dispatch === "all") {
    const expectedShowDriveIds = new Set(
      ALL_COMBOS.map((c) => `validation_${c}`),
    );
    const extraShows = shows.filter(
      (s) => !expectedShowDriveIds.has(s.drive_file_id),
    );
    if (extraShows.length > 0) {
      throw new CheckSeedFailure(
        "n",
        `Stale validation shows found that aren't in ALL_COMBOS: ${extraShows.map((s) => s.drive_file_id).join(", ")}. Run \`pnpm validation:reseed --combo all\` (the finalizer DELETEs stale validation_<combo> rows).`,
      );
    }
  }

  // (g) every seeded show has matching show_share_tokens row
  const sstRes = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (
            col: string,
            list: string[],
          ) => Promise<{
            data: unknown;
            error: { message?: string } | null;
          }>;
        };
      };
    }
  )
    .from("show_share_tokens")
    .select("show_id")
    .in("show_id", shows.map((s) => s.id));
  if (sstRes.error) {
    throw new Error(
      `show_share_tokens read failed: ${sstRes.error.message ?? JSON.stringify(sstRes.error)}`,
    );
  }
  const sstShowIds = new Set(
    ((sstRes.data ?? []) as Array<{ show_id: string }>).map((r) => r.show_id),
  );
  for (const combo of requestedCombos) {
    const showId = showIdByCombo.get(combo);
    if (showId && !sstShowIds.has(showId)) {
      throw new CheckSeedFailure(
        "g",
        `validation show ${combo} is missing show_share_tokens row — dual-source sentinel (trigger initial INSERT OR mint RPC R19 self-heal) failed.`,
      );
    }
  }

  // Fetch all crew_members for validation shows (batch).
  const cmRes = await (
    supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (
            col: string,
            list: string[],
          ) => Promise<{
            data: unknown;
            error: { message?: string } | null;
          }>;
        };
      };
    }
  )
    .from("crew_members")
    .select(
      "id,show_id,name,email,claimed_via_oauth_at,date_restriction,stage_restriction,role,role_flags",
    )
    .in("show_id", shows.map((s) => s.id));
  if (cmRes.error) {
    throw new Error(
      `crew_members read failed: ${cmRes.error.message ?? JSON.stringify(cmRes.error)}`,
    );
  }
  type CrewRow = {
    id: string;
    show_id: string;
    name: string;
    email: string | null;
    claimed_via_oauth_at: string | null;
    date_restriction: Record<string, unknown> | null;
    stage_restriction: Record<string, unknown> | null;
    role: string;
    role_flags: string[];
  };
  const crewMembers = (cmRes.data ?? []) as CrewRow[];
  const crewById = new Map(crewMembers.map((c) => [c.id, c]));
  const crewByShowId = new Map<string, CrewRow[]>();
  for (const c of crewMembers) {
    if (!crewByShowId.has(c.show_id)) crewByShowId.set(c.show_id, []);
    crewByShowId.get(c.show_id)!.push(c);
  }

  // F1 fail-fast (Codex Phase 0.C R1) — every requested combo must have a
  // matching validation_<combo> show. Without this, predicate (f) below
  // would silently skip the combo-binding check when showIdByCombo.get
  // returns undefined.
  for (const combo of requestedCombos) {
    const showId = showIdByCombo.get(combo);
    if (showId === undefined) {
      throw new CheckSeedFailure(
        "f",
        `validation show 'validation_${combo}' is missing — alias_map[${combo}] would resolve to crew rows from another show or none at all. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
      );
    }
  }

  // (f) alias resolution + email-non-null + show-not-archived +
  //     F1 combo-binding (Codex Phase 0.C R1): every crew row resolved
  //     from alias_map[combo] MUST live on the validation_<combo> show.
  //     Without this, a corrupted alias_map could point R2 keys at R1
  //     crew IDs and predicate (f) would PASS (the crew row exists, has
  //     an email, and the show is not archived — but it's the wrong
  //     combo's show).
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo] ?? {};
    const expectedShowId = showIdByCombo.get(combo)!;
    for (const [alias, id] of Object.entries(slice)) {
      const crew = crewById.get(id);
      if (!crew) {
        throw new CheckSeedFailure(
          "f",
          `alias_map[${combo}][${alias}]=${id} but no crew_members row with that id — re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      if (crew.show_id !== expectedShowId) {
        throw new CheckSeedFailure(
          "f",
          `alias_map[${combo}][${alias}]=${id} resolves to crew row '${crew.name}' on show ${crew.show_id} but expected show ${expectedShowId} (validation_${combo}). Cross-combo alias poisoning — re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      if (crew.email === null || crew.email.length === 0) {
        throw new CheckSeedFailure(
          "f",
          `crew_members row for ${combo}.${alias} has email IS NULL — picker eligibility broken.`,
        );
      }
      // Bind alias to the canonical fixture name `<combo>_<alias>`
      // (per FIXTURES build in scripts/lib/validation-fixtures.ts).
      // A row at the right show but with the wrong name would still
      // pass the show_id check above; this assertion closes that gap.
      const expectedName = `${combo}_${alias}`;
      if (crew.name !== expectedName) {
        throw new CheckSeedFailure(
          "f",
          `alias_map[${combo}][${alias}]=${id} resolves to crew row '${crew.name}' but expected '${expectedName}' per the canonical fixture build. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      const show = shows.find((s) => s.id === crew.show_id);
      if (show?.archived) {
        throw new CheckSeedFailure(
          "f",
          `crew_members row for ${combo}.${alias} maps to archived show ${show.drive_file_id} — picker not eligible.`,
        );
      }
    }
  }

  // (l) every baseline alias has claimed_via_oauth_at IS NULL post-reseed
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo] ?? {};
    for (const [alias, id] of Object.entries(slice)) {
      const crew = crewById.get(id);
      if (!crew) continue;
      if (crew.claimed_via_oauth_at !== null) {
        throw new CheckSeedFailure(
          "l",
          `crew_members row for ${combo}.${alias} has claimed_via_oauth_at=${crew.claimed_via_oauth_at} after reseed — mint RPC SET clause missing 'claimed_via_oauth_at = NULL'.`,
        );
      }
    }
  }

  // (m) full-replace orphan guard — every crew_members row for a validation
  //     show must be enumerated in alias_map[combo].
  for (const combo of requestedCombos) {
    const showId = showIdByCombo.get(combo);
    if (!showId) continue;
    const slice = row.alias_map[combo] ?? {};
    const expectedIds = new Set(Object.values(slice));
    const showCrew = crewByShowId.get(showId) ?? [];
    const orphans = showCrew.filter((c) => !expectedIds.has(c.id));
    if (orphans.length > 0) {
      throw new CheckSeedFailure(
        "m",
        `validation show ${combo} has orphan crew_members row(s) ${orphans.map((o) => o.name).join(", ")} not enumerated in alias_map[${combo}] — full-replace DELETE-before-UPSERT did not fire.`,
      );
    }
  }

  // (k) DB-side R1 alias_5a_lead.email recheck — must not be a placeholder.
  if (r1Alias5aCrewId !== null) {
    const r1Lead = crewById.get(r1Alias5aCrewId);
    if (r1Lead?.email && REJECTED_DOMAIN_RX.test(r1Lead.email)) {
      throw new CheckSeedFailure(
        "k",
        `crew_members row for R1.alias_5a_lead has email=${r1Lead.email} matching placeholder/dev-only reserved domain. A previous run with a bad VALIDATION_J3_CLAIM_EMAIL landed a placeholder in the DB; fix the env var and reseed --combo R1.`,
      );
    }
    // R23-F1 — DB-side real-email-shape check (mirrors env-side check above).
    if (r1Lead?.email && !EMAIL_SHAPE_RX.test(r1Lead.email)) {
      throw new CheckSeedFailure(
        "k",
        `crew_members row for R1.alias_5a_lead has email=${r1Lead.email} which is not a real-email shape. A previous run with a malformed VALIDATION_J3_CLAIM_EMAIL landed a bad value in the DB; fix the env var and reseed --combo R1.`,
      );
    }
  }

  // (o) Codex Phase 0.C R3 — fixture-content match. The walk-session
  //     gate is a Right Now state contract; check-seed must verify the
  //     live `shows.dates` + `crew_members.date_restriction/stage_restriction/email`
  //     match the canonical fixture-build (scripts/lib/validation-fixtures.ts).
  //     Without this predicate, a stale same-day seed, manual edit, or
  //     drifted FIXTURES could leave R3/R5/R7/R8/SW combos in the wrong
  //     Right Now state while all other predicates PASS.
  //
  //     The fixture build internally canonicalizes R1.alias_5a_lead's
  //     email via lib/email/canonicalize.ts, so this predicate also
  //     subsumes the R3-F2 (medium) claim-email-equality finding —
  //     comparing R1.alias_5a_lead.email between live DB + fixture
  //     proves the env email matches the seeded one.
  // expectedFixtures / expectedByCombo already built in predicate (e) above.
  // Helper — mirror the mint RPC's role derivation from role_flags:
  //   array_length(role_flags, 1) IS NULL → 'Validation Crew'
  //   else                                 → array_to_string(role_flags, ' / ')
  const expectedRoleFromFlags = (flags: readonly string[]): string =>
    flags.length === 0 ? "Validation Crew" : flags.join(" / ");

  for (const combo of requestedCombos) {
    const expected = expectedByCombo.get(combo);
    if (!expected) continue; // unknown combo — handled by (c)/(e)
    const showId = showIdByCombo.get(combo);
    if (!showId) continue; // already surfaced by (f) fail-fast
    const show = shows.find((s) => s.id === showId);
    if (!show) continue;

    // (o.1) shows.dates deep-equal expected.dates
    if (!deepEqual(show.dates, expected.dates as unknown)) {
      throw new CheckSeedFailure(
        "o",
        `validation show ${combo} shows.dates drifted from canonical fixture. live=${JSON.stringify(show.dates)} expected=${JSON.stringify(expected.dates)}. A stale same-day seed or manual edit would falsely PASS the walk-session gate without this predicate; re-run \`pnpm validation:reseed --combo ${combo}\`.`,
      );
    }
    // (o.5) shows.title — canonical fixture writes 'M12 Validation — <combo>'.
    if (show.title !== expected.showName) {
      throw new CheckSeedFailure(
        "o",
        `validation show ${combo} shows.title drifted. live='${show.title}' expected='${expected.showName}'. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
      );
    }
    // (o.6) shows.slug — canonical fixture writes 'validation-<lowercase combo with _ → ->'.
    if (show.slug !== expected.slug) {
      throw new CheckSeedFailure(
        "o",
        `validation show ${combo} shows.slug drifted. live='${show.slug}' expected='${expected.slug}'. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
      );
    }
    // (o.7) shows.venue.timezone — Codex Phase 0.C R7-F1 TZ contract.
    //   The mint RPC writes {timezone: 'UTC'} so the runtime Right Now
    //   selector resolves today via UTC (matching the script's UTC
    //   validationTodayIso). Without this pin, the runtime defaults to
    //   America/New_York and the daily UTC/local gap can desynchronize
    //   the gate from the UI by a day.
    const expectedTz = "UTC";
    const liveTz =
      show.venue && typeof show.venue === "object"
        ? (show.venue as { timezone?: string }).timezone
        : undefined;
    if (liveTz !== expectedTz) {
      throw new CheckSeedFailure(
        "o",
        `validation show ${combo} shows.venue.timezone='${liveTz ?? "<absent>"}' != '${expectedTz}'. The runtime Right Now selector falls back to America/New_York when timezone is unset, which can desync the walk-session gate from the UI by a day at the UTC/local boundary. Re-run \`pnpm validation:reseed --combo ${combo}\` to restore.`,
      );
    }
    // (o.8) shows.pull_sheet — Codex Phase 0.C R8-F2. PackListTile
    //   returns null when pull_sheet is null or empty; without this
    //   pin the spec-marked pack-list-visible combos (R2/R3/R7a/R8a)
    //   would hide the tile and the walk against stage_restriction
    //   would silently miss the visible branch. The constant
    //   VALIDATION_PULL_SHEET is mirrored in the mint RPC INSERT.
    if (!deepEqual(show.pull_sheet, VALIDATION_PULL_SHEET as unknown)) {
      throw new CheckSeedFailure(
        "o",
        `validation show ${combo} shows.pull_sheet drifted. live=${JSON.stringify(show.pull_sheet)} expected=${JSON.stringify(VALIDATION_PULL_SHEET)}. PackListTile renders null on empty/absent pull_sheet — the pack-list-visible walk would falsely skip. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
      );
    }

    // (o.2 / o.3 / o.4) per-alias date_restriction / stage_restriction /
    //                  email match the canonical fixture row keyed by name.
    for (const expectedCrew of expected.crewMembers) {
      const liveCrew = (crewByShowId.get(showId) ?? []).find(
        (c) => c.name === expectedCrew.name,
      );
      if (!liveCrew) {
        // Codex Phase 0.C R5 F1 — must NOT silently skip. Predicate (e)
        // catches non-canonical alias keys, but a manually-deleted
        // canonical crew row (alias_map intact + slice key present + but
        // the actual crew_members row missing) would fall through to
        // here. Predicate (f) catches missing rows reachable via
        // alias_map UUID, but a row whose name was changed could
        // theoretically slip if the alias_map UUID still points
        // somewhere. Belt-and-suspenders: surface the missing canonical
        // name explicitly.
        throw new CheckSeedFailure(
          "o",
          `validation show ${combo} is missing the canonical crew row named '${expectedCrew.name}' (alias ${expectedCrew.alias}). Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      // dateRestriction + stageRestriction live on the fixture-row level
      // (uniform across all crew_members per spec §3.3); compare against
      // expected.dateRestriction / expected.stageRestriction, not the
      // per-crew shape.
      if (!deepEqual(liveCrew.date_restriction, expected.dateRestriction as unknown)) {
        throw new CheckSeedFailure(
          "o",
          `crew_members row for ${combo}.${expectedCrew.alias} date_restriction drifted. live=${JSON.stringify(liveCrew.date_restriction)} expected=${JSON.stringify(expected.dateRestriction)}. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      if (!deepEqual(liveCrew.stage_restriction, expected.stageRestriction as unknown)) {
        throw new CheckSeedFailure(
          "o",
          `crew_members row for ${combo}.${expectedCrew.alias} stage_restriction drifted. live=${JSON.stringify(liveCrew.stage_restriction)} expected=${JSON.stringify(expected.stageRestriction)}. Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      // R4-F1 fold-in (Codex Phase 0.C R4) — role_flags drift catches
      // the case where a stale/manual edit turns a LEAD into [] or swaps
      // A1/V1, leaving the walk to run with the wrong permissions /
      // tile visibility while every other predicate PASSes.
      if (!deepEqual(liveCrew.role_flags, [...expectedCrew.roleFlags] as unknown)) {
        throw new CheckSeedFailure(
          "o",
          `crew_members row for ${combo}.${expectedCrew.alias} role_flags drifted. live=${JSON.stringify(liveCrew.role_flags)} expected=${JSON.stringify(expectedCrew.roleFlags)}. The Right Now state + tile visibility would walk against the wrong permissions; re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      // (o.role) shows.role is derived from role_flags per the mint RPC's
      //   CASE. Re-deriving here proves the live row's derived column is
      //   consistent with role_flags.
      const expectedRole = expectedRoleFromFlags(expectedCrew.roleFlags);
      if (liveCrew.role !== expectedRole) {
        throw new CheckSeedFailure(
          "o",
          `crew_members row for ${combo}.${expectedCrew.alias} role drifted. live='${liveCrew.role}' expected='${expectedRole}' (derived from role_flags=${JSON.stringify(expectedCrew.roleFlags)}). Re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      // R3-F2 fold-in — every alias's live email must match the canonical
      // fixture-built email (which is itself canonicalized via
      // lib/email/canonicalize.ts). This catches the case where the
      // operator seeded with one VALIDATION_J3_CLAIM_EMAIL then ran
      // check-seed with another — the R1.alias_5a_lead.email would
      // diverge between live DB and fixture.
      if (liveCrew.email !== expectedCrew.email) {
        throw new CheckSeedFailure(
          "o",
          `crew_members row for ${combo}.${expectedCrew.alias} email drifted. live=${liveCrew.email} expected=${expectedCrew.email}. ` +
            (combo === "R1" && expectedCrew.alias === "alias_5a_lead"
              ? "Likely cause: VALIDATION_J3_CLAIM_EMAIL was changed between seed time and check-seed time. Re-run `pnpm validation:reseed --combo R1` with the current env value."
              : `Re-run \`pnpm validation:reseed --combo ${combo}\`.`),
        );
      }
    }
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao).sort();
  const bk = Object.keys(bo).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
    if (!deepEqual(ao[ak[i] as string], bo[bk[i] as string])) return false;
  }
  return true;
}

async function main(): Promise<void> {
  // Codex Phase 0.C R4 F2 — auto-load .env.local (mirrors Next.js loader).
  loadValidationEnv();
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      help: { type: "boolean", default: false },
      combo: { type: "string" },
      "allow-local-override": { type: "boolean", default: false },
      today: { type: "string" },
    },
    allowPositionals: false,
  });

  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }

  assertProdEquivalentTarget(
    process.env.VALIDATION_SUPABASE_URL,
    values["allow-local-override"] ?? false,
  );

  const supabaseUrl = requireEnv("VALIDATION_SUPABASE_URL");
  const supabaseKey = requireEnv("VALIDATION_SUPABASE_SECRET_KEY");
  const projectRef = requireEnv("VALIDATION_SUPABASE_PROJECT_REF");
  // F2 wrong-project guard (Codex Phase 0.C R1).
  assertSupabaseTargetMatchesProjectRef(
    supabaseUrl,
    projectRef,
    values["allow-local-override"] ?? false,
  );
  const j3ClaimEmail = requireEnv("VALIDATION_J3_CLAIM_EMAIL");
  const validationTodayIso =
    values.today ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validationTodayIso)) {
    throw new Error(
      `--today must be ISO YYYY-MM-DD, got ${validationTodayIso}`,
    );
  }

  const requestedCombo = values.combo ?? "all";
  const dispatch: "all" | { single: Combo } =
    requestedCombo === "all"
      ? "all"
      : ALL_COMBOS.includes(requestedCombo as Combo)
      ? { single: requestedCombo as Combo }
      : (() => {
          throw new Error(
            `Unknown combo '${requestedCombo}'. Valid: 'all' or one of ${ALL_COMBOS.join(", ")}.`,
          );
        })();

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as LooseSupabaseClient;

  await runChecks(
    supabase,
    dispatch,
    validationTodayIso,
    projectRef,
    j3ClaimEmail,
  );

  const scope =
    dispatch === "all"
      ? `combos: ${ALL_COMBOS.join(",")}`
      : `combo: ${dispatch.single}`;
  process.stdout.write(`OK: seed matches today (${scope})\n`);
}

main().catch((err) => {
  if (err instanceof CheckSeedFailure) {
    process.stderr.write(`[validation-check-seed] FAIL ${err.message}\n`);
    process.exit(1);
  }
  process.stderr.write(
    `[validation-check-seed] ERROR: ${err instanceof Error ? err.message : String(err)}\n`,
  );
  process.exit(1);
});
