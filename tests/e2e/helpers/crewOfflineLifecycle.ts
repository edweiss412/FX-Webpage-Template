/**
 * tests/e2e/helpers/crewOfflineLifecycle.ts: the show lifecycle changes the
 * crew offline e2e makes while a saved copy exists (spec §7): archive,
 * unpublish, and share-token rotation, plus a read of the current token.
 *
 * Each function is ONE `psql` call that becomes an admin (role `authenticated`
 * with the admin claims, so `is_admin()` holds) and calls the same SECURITY
 * DEFINER RPC the admin UI calls. The RPC takes the per-show advisory lock
 * itself and publishes the realtime invalidation itself, so this helper takes
 * no lock (invariant 2, single holder: the RPC layer is the one holder) and
 * the open crew page sees exactly what an admin action would cause.
 *
 *   archive_show            supabase/migrations/20260801000000_lifecycle_rpc_performed_discriminator.sql:21
 *   unpublish_show          supabase/migrations/20260801000000_lifecycle_rpc_performed_discriminator.sql:96
 *   rotate_show_share_token supabase/migrations/20260601000001_b2_def1_lifecycle_guard.sql:8
 *   admin_read_share_token  supabase/migrations/20260714000000_admin_read_share_token_with_epoch.sql:15
 *
 * `archive_show` has no published precondition, so an unpublished show can be
 * archived. `rotate_show_share_token` refuses an unpublished or archived show
 * (SHOW_NOT_PUBLISHED, SHOW_ARCHIVED_IMMUTABLE); `ON_ERROR_STOP` turns that
 * into a thrown error naming the RPC.
 *
 * Target: the local Supabase database, always. The DSN comes from
 * `resolvePsqlTarget` with no environment variables named, so it falls through
 * to the built-in loopback default and an ambient `TEST_DATABASE_URL` (which
 * the canonical .env.local points at the shared validation project) is never
 * read. This is the `seedShowWithCrew` profile, for the same reason: the
 * production server under test reads the loopback Supabase stack, so a write
 * anywhere else would change a show the page never sees. The child env is
 * scrubbed of every PG* variable and never honors the remote opt-in.
 */
import { execFile } from "node:child_process";

import { psqlChildEnv, resolvePsqlTarget } from "./psqlTarget";

/**
 * The admin claims `tests/db/_holdsHelpers.ts:41` uses. `is_admin()` reads
 * `app_metadata.role`; the email satisfies `auth_email_canonical()`. Copied,
 * not imported: that module opens a database pool when it is loaded.
 */
const ADMIN_CLAIMS = JSON.stringify({
  sub: "00000000-0000-0000-0000-000000000020",
  email: "dlarson@fxav.net",
  app_metadata: { role: "admin" },
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ShareToken = { shareToken: string; epoch: number };

/**
 * Runs `rpcSelect` as the admin inside one transaction. The show id and the
 * claims reach psql as variables (`:'show_id'`, `:'claims'`), so nothing is
 * spliced into the SQL text.
 */
function asAdmin(rpc: string, showId: string, rpcSelect: string): Promise<string> {
  if (!UUID.test(showId)) {
    return Promise.reject(new Error(`crewOfflineLifecycle.${rpc}: not a show id: ${showId}`));
  }
  const dsn = resolvePsqlTarget({ caller: `crewOfflineLifecycle.${rpc}` });
  const sql = [
    "begin;",
    "set local role authenticated;",
    `set local "request.jwt.claims" = :'claims';`,
    rpcSelect,
    "commit;",
  ].join("\n");
  return new Promise((resolve, reject) => {
    const child = execFile(
      "psql",
      [
        "-X",
        "-q",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        `show_id=${showId}`,
        "-v",
        `claims=${ADMIN_CLAIMS}`,
        dsn,
      ],
      { encoding: "utf8", env: psqlChildEnv({ honorRemoteOptIn: false }), timeout: 30_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `crewOfflineLifecycle.${rpc}(${showId}) failed: ${stderr.trim() || error.message}`,
            ),
          );
        } else {
          resolve(stdout.trim());
        }
      },
    );
    child.stdin?.end(sql);
  });
}

function parseBoolean(rpc: string, out: string): boolean {
  if (out === "t") return true;
  if (out === "f") return false;
  throw new Error(`crewOfflineLifecycle.${rpc}: unexpected output ${JSON.stringify(out)}`);
}

function parseToken(rpc: string, out: string): ShareToken {
  const [shareToken = "", epoch = ""] = out.split("|");
  // An empty token is what admin_read_share_token returns when is_admin() is
  // false, so it means the claims did not take, never "no token".
  if (out.split("\n").length !== 1 || shareToken === "" || !/^\d+$/.test(epoch)) {
    throw new Error(`crewOfflineLifecycle.${rpc}: unexpected output ${JSON.stringify(out)}`);
  }
  return { shareToken, epoch: Number(epoch) };
}

/** Archives the show. True when this call archived it, false when it already was. */
export async function archiveShow(showId: string): Promise<boolean> {
  const out = await asAdmin("archiveShow", showId, "select public.archive_show(:'show_id'::uuid);");
  return parseBoolean("archiveShow", out);
}

/** Unpublishes the show. True when this call unpublished it, false when it already was. */
export async function unpublishShow(showId: string): Promise<boolean> {
  const out = await asAdmin(
    "unpublishShow",
    showId,
    "select public.unpublish_show(:'show_id'::uuid);",
  );
  return parseBoolean("unpublishShow", out);
}

/** Rotates the share token (the admin "reset" of the crew link) and bumps the picker epoch. */
export async function rotateShareToken(showId: string): Promise<ShareToken> {
  const out = await asAdmin(
    "rotateShareToken",
    showId,
    "select new_share_token, new_epoch from public.rotate_show_share_token(:'show_id'::uuid);",
  );
  return parseToken("rotateShareToken", out);
}

/** The show's current share token and picker epoch, read the way the admin page reads them. */
export async function readShareToken(showId: string): Promise<ShareToken> {
  const out = await asAdmin(
    "readShareToken",
    showId,
    "select share_token, picker_epoch from public.admin_read_share_token(:'show_id'::uuid);",
  );
  return parseToken("readShareToken", out);
}
