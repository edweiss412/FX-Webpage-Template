import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

// alert-resolve-truthing §6.1. GITHUB_BOT_LOGIN_MISSING is a NON_UPSERT admin-alert
// producer (raw INSERT in lib/reports/submit.ts) excluded from AdminAlertCode, so it
// is resolved via raw backend writes gated on this explicit env-presence read — NOT
// through the typed resolveAdminAlert helper. "Submit succeeded" does not prove the
// env is configured (the env is only read on the expired-lease recovery path), so
// resolution ALWAYS re-checks the env here.
//
// The reports infra-contract meta-test (tests/reports/_metaInfraContract.test.ts) scans this
// file (it is listed in META_SOURCE_FILES). Its structural test enumerates every `export` and
// requires each to be in REGISTERED_INFRA_EXPORTS OR carry a `// not-subject-to-meta: <reason>`
// comment IMMEDIATELY above the export line. `botLoginConfigured` is a pure env predicate:
// not-subject-to-meta: pure env-presence predicate, no Supabase/DB boundary
export function botLoginConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.GITHUB_BOT_LOGIN;
  return typeof v === "string" && v.trim() !== "";
}

/** Typed infra fault for a failed bot-login alert resolve — invariant 9 discriminable class,
 *  not a bare Error. The cron catch-logs it; callers can `instanceof`-narrow. */
// not-subject-to-meta: typed error class, holds no Supabase/DB call of its own
export class BotLoginResolveInfraError extends Error {
  override readonly cause: unknown;
  constructor(cause: unknown) {
    super(
      `bot-login alert resolve failed: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "BotLoginResolveInfraError";
    this.cause = cause;
  }
}

// alert-resolve-truthing §6.2: resolve the global GITHUB_BOT_LOGIN_MISSING row when the env is
// configured. Direct admin_alerts UPDATE (the code is a NON_UPSERT producer, not in AdminAlertCode).
// Invariant-9: destructure { error }; a returned error throws the typed BotLoginResolveInfraError
// (the CRON invocation catch-logs it — see runNotify — so a failed resolve degrades to a logged
// no-op for THIS cycle instead of collapsing the whole maintenance run). The env is checked BEFORE
// the client is constructed, so an unset deployment makes zero Supabase calls.
export async function resolveBotLoginAlertRow(
  makeClient: () => ReturnType<
    typeof createSupabaseServiceRoleClient
  > = createSupabaseServiceRoleClient,
): Promise<void> {
  if (!botLoginConfigured()) return;
  const supabase = makeClient();
  const { error } = await supabase
    .from("admin_alerts")
    .update({ resolved_at: new Date().toISOString() })
    .eq("code", "GITHUB_BOT_LOGIN_MISSING")
    .is("show_id", null)
    .is("resolved_at", null)
    .select("id");
  if (error) {
    throw new BotLoginResolveInfraError(error);
  }
}
