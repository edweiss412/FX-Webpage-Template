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

import { assertProdEquivalentTarget } from "./lib/validation-target";
import { R_COMBOS, SW_COMBOS, type Combo } from "./lib/validation-fixtures";

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

// R15 commit 35 canonical rejected-domain set — mirrors the same regex in
// scripts/lib/validation-fixtures.ts + supabase/migrations/<...>_mint.sql.
const REJECTED_DOMAIN_RX =
  /@(example\.com|example\.org|example\.net|[^@\s]+\.test|[^@\s]+\.invalid|localhost|[^@\s]+\.localhost|[^@\s]+\.local|dev\.local)$/i;

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

  // (d) project_ref matches
  if (row.seeded_supabase_project_ref !== projectRef) {
    throw new CheckSeedFailure(
      "d",
      `seeded_supabase_project_ref=${row.seeded_supabase_project_ref} != VALIDATION_SUPABASE_PROJECT_REF=${projectRef}. Re-seed against the correct project.`,
    );
  }

  // (e) alias_map storage predicate — for requested set, each R-combo has 9
  //     aliases; each SW-* has 1. For --combo all, total leaves = 96.
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo];
    if (!slice || typeof slice !== "object") {
      throw new CheckSeedFailure(
        "e",
        `alias_map missing combo key '${combo}'. Run \`pnpm validation:reseed --combo ${dispatch === "all" ? "all" : combo}\`.`,
      );
    }
    const aliasCount = Object.keys(slice).length;
    const expectedCount = (R_COMBOS as readonly string[]).includes(combo) ? 9 : 1;
    if (aliasCount !== expectedCount) {
      throw new CheckSeedFailure(
        "e",
        `alias_map[${combo}] has ${aliasCount} aliases; expected ${expectedCount} per spec §3.3 + §3.3.1.`,
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
    .select("id,drive_file_id,archived,published")
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
  };
  const shows = (showsRes.data ?? []) as ShowRow[];
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
    .select("id,show_id,name,email,claimed_via_oauth_at")
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
  };
  const crewMembers = (cmRes.data ?? []) as CrewRow[];
  const crewById = new Map(crewMembers.map((c) => [c.id, c]));
  const crewByShowId = new Map<string, CrewRow[]>();
  for (const c of crewMembers) {
    if (!crewByShowId.has(c.show_id)) crewByShowId.set(c.show_id, []);
    crewByShowId.get(c.show_id)!.push(c);
  }

  // (f) alias resolution + email-non-null + show-not-archived
  for (const combo of requestedCombos) {
    const slice = row.alias_map[combo] ?? {};
    for (const [alias, id] of Object.entries(slice)) {
      const crew = crewById.get(id);
      if (!crew) {
        throw new CheckSeedFailure(
          "f",
          `alias_map[${combo}][${alias}]=${id} but no crew_members row with that id — re-run \`pnpm validation:reseed --combo ${combo}\`.`,
        );
      }
      if (crew.email === null || crew.email.length === 0) {
        throw new CheckSeedFailure(
          "f",
          `crew_members row for ${combo}.${alias} has email IS NULL — picker eligibility broken.`,
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
  }
}

async function main(): Promise<void> {
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
