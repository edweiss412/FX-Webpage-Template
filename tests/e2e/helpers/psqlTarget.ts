/**
 * tests/e2e/helpers/psqlTarget.ts — the ONE resolver every e2e fixture psql
 * write goes through.
 *
 * Spec: docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md §2.6
 * Entry: BL-LOCKED-FIXTURE-HELPER-TARGETS-REMOTE-DB
 *
 * THE DEFECT. `lockedCrewRestriction.ts` captured its psql target at MODULE
 * LOAD from `TEST_DATABASE_URL ?? DATABASE_URL ?? local default`, while the
 * same suites' PostgREST admin client reads the loopback `SUPABASE_URL`. The
 * canonical `.env.local` points `TEST_DATABASE_URL` at the validation pooler
 * (`scripts/preflight-env.mjs`), so a local e2e run resolved the crew id
 * locally and sent the UPDATE to the SHARED validation project — order
 * dependently, because module-load capture makes import order decide the
 * target. The symptom it produced ("run `pnpm db:seed`?") named the wrong
 * cause entirely.
 *
 * THREE PARTS, and parts 2 and 3 exist because part 1 alone is not enough:
 * inspecting a URL does NOT constrain the target libpq actually dials.
 *
 *   1. CALL-TIME RESOLUTION. The DSN is resolved inside the execution path,
 *      never at module top level, so import order stops deciding anything.
 *
 *   2. AN ACCEPT-SET, NOT A DENYLIST. `devCaptureStaged`'s original check was a
 *      seven-name denylist, and a denylist accepts whatever it did not model.
 *      Here the query-parameter contract is a true allowlist: exactly
 *      `connect_timeout`, `application_name` and `sslmode` are accepted and
 *      EVERY other parameter is refused by name — the known steering channels
 *      (`host`/`hostaddr`/`service`/`port`/`dbname`/`user`/`password`, each one
 *      a live probe drove past an earlier guard) and any channel a future libpq
 *      adds alike. The cost is stated as a documented limit (spec §4 limit 8):
 *      a legitimate new tuning parameter fails loud with its name in the error
 *      until someone adds it here. That is the consequence bound this guard
 *      commits to — conservative refusal plus a named signal, never a silent
 *      wrong target.
 *
 *   3. A SCRUBBED CHILD ENVIRONMENT WITH THE SERVICE FILE NEUTRALIZED. Every
 *      `PG*` variable is removed (a live probe retargeted a loopback-accepted
 *      DSN to 192.0.2.2 with `PGHOSTADDR`), and then `PGSERVICEFILE` is set to
 *      a path that does not exist. The second half is not redundant: stripping
 *      `PGSERVICEFILE` leaves `HOME` in place and libpq falls back to the user
 *      service file `~/.pg_service.conf`, which a second probe used to steer a
 *      loopback authority to 192.0.2.3. Stripping the variable REOPENS that
 *      fallback; setting it closes it.
 *
 * THREAT MODEL (stated so the scope cannot ratchet): accidental
 * misconfiguration by an ordinary contributor — a stale `.env.local`, an
 * inherited shell variable, a copied DSN. An operator who writes a malicious
 * libpq service file AND passes the explicit opt-in is outside it (spec §4
 * limit 7). This is a fixture-safety guard, not a sandbox.
 *
 * PROFILES, because the two callers refuse DIFFERENT things and migrating them
 * onto one resolver must not turn anything either currently REFUSES into an
 * acceptance:
 *
 *   - `lockedCrewRestriction` reads `TEST_DATABASE_URL` first (that is the
 *     variable whose non-loopback value caused the defect, so it must be SEEN
 *     and refused rather than ignored), and honors the opt-in.
 *   - `devCaptureStaged`'s state gallery deliberately IGNORES
 *     `TEST_DATABASE_URL`, additionally pins the local Supabase port, database
 *     and inline credentials, and does NOT honor the opt-in — its constraints
 *     are about a SPLIT TARGET between the SQL transport and `supabaseAdmin`,
 *     which a remote opt-in would not make safe.
 */
import { URL } from "node:url";

/** The local Supabase database, used when no environment variable supplies one. */
export const LOCAL_SUPABASE_DSN = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/** The local Supabase database port (`supabase/config.toml`). */
export const LOCAL_SUPABASE_DB_PORT = "54322";

/** The database every other fixture consumer reads through `supabaseAdmin`. */
export const LOCAL_SUPABASE_DB_NAME = "postgres";

export const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/**
 * The ONLY query parameters a fixture DSN may carry.
 *
 * Every one of these tunes the connection without moving its target, its
 * database, or its role. Anything else — modeled steering channel or not — is
 * refused by name.
 */
export const PSQL_QUERY_PARAM_ACCEPT_SET: readonly string[] = [
  "application_name",
  "connect_timeout",
  "sslmode",
];

/**
 * The subset of refusals that are KNOWN steering channels, named separately in
 * the error so a contributor who hits one learns why it is not merely unlisted.
 */
const KNOWN_STEERING_PARAMS = new Set([
  "host",
  "hostaddr",
  "service",
  "port",
  "dbname",
  "user",
  "password",
]);

/** The deliberate escape hatch, aligned with the observe CLI's `--env` guardrail posture. */
export const REMOTE_OPT_IN_ENV = "LOCKED_FIXTURE_ALLOW_REMOTE";

/**
 * A path that does not exist, pointed at deliberately.
 *
 * libpq only reads a service file when a service is requested, and `service`
 * is refused above while `PGSERVICE` is stripped below — so this is the third
 * lock on a door already bolted twice. It is here because the SECOND lock has a
 * gap: removing `PGSERVICEFILE` does not disable the service file, it restores
 * the `~/.pg_service.conf` default.
 */
export const NEUTRALIZED_PG_SERVICE_FILE = "/nonexistent/fxav-locked-fixture-no-pg-service.conf";

export interface PsqlTargetOptions {
  /** Names the refusing helper in every error. */
  caller: string;
  /** An explicit DSN argument. Validated exactly like an env-supplied one. */
  dsn?: string | undefined;
  /** Environment to read. Injectable so the unit suite never mutates the process. */
  source?: NodeJS.ProcessEnv;
  /** Environment variable names, in precedence order. */
  envVars?: readonly string[];
  /** Also pin the local Supabase port, database name, and inline credentials. */
  requireLocalSupabase?: boolean;
  /** Whether `LOCKED_FIXTURE_ALLOW_REMOTE=1` relaxes the loopback refusal. */
  honorRemoteOptIn?: boolean;
}

function remoteOptInActive(source: NodeJS.ProcessEnv, honor: boolean): boolean {
  return honor && source[REMOTE_OPT_IN_ENV] === "1";
}

/**
 * The resolved DSN, or a throw naming the target, the channel that supplied it,
 * and the escape hatch.
 *
 * Called for its value at the moment of the spawn — never cached in a module
 * constant, which is the defect this replaces.
 */
export function resolvePsqlTarget(options: PsqlTargetOptions): string {
  const source = options.source ?? process.env;
  const caller = options.caller;
  const envVars = options.envVars ?? [];

  // ABSENT and EMPTY are different, and conflating them is a LOOSENING (cross-model
  // review R1, probed). The resolution this replaced used nullish `??`, so
  // `DATABASE_URL=""` reached `new URL("")` and REFUSED; treating "" as absent
  // would have made the same input silently select the local default instead —
  // turning a refusal into an acceptance, which the migration is not allowed to
  // do. So: undefined falls through to the next channel; a channel that is
  // PRESENT and empty is an explicit instruction that cannot be honored, and is
  // refused by name.
  let url = options.dsn;
  let channel = "the explicit dsn argument";
  if (url === undefined) {
    for (const name of envVars) {
      const candidate = source[name];
      if (candidate !== undefined) {
        url = candidate;
        channel = `$${name}`;
        break;
      }
    }
  }
  if (url === undefined) {
    url = LOCAL_SUPABASE_DSN;
    channel = "the built-in local default";
  }
  if (url === "") {
    throw new Error(
      `${caller}: the psql target from ${channel} is EMPTY. An empty value is not the same as an ` +
        `unset one — unset falls through to the next channel and then to ${LOCAL_SUPABASE_DSN}, ` +
        `while an empty one is an explicit instruction that cannot be honored. Unset it, or give ` +
        `it a real postgresql:// URI.`,
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `${caller}: the psql target from ${channel} is not a parseable URL. ` +
        `Supply a postgresql:// URI, or unset it to use ${LOCAL_SUPABASE_DSN}.`,
    );
  }

  // ── Accept-set, before anything that reads the authority ────────────────────
  // Ordered first deliberately: a steering parameter means the authority every
  // check below inspects is NOT the connection psql makes, so those checks would
  // be reporting on the wrong thing.
  const refused = [...parsed.searchParams.keys()].filter(
    (name) => !PSQL_QUERY_PARAM_ACCEPT_SET.includes(name),
  );
  if (refused.length > 0) {
    const steering = refused.filter((name) => KNOWN_STEERING_PARAMS.has(name));
    throw new Error(
      `${caller}: refusing DSN query parameter(s) outside the accept-set: ${refused.join(", ")}. ` +
        `Supplied by ${channel} (target ${parsed.protocol}//${parsed.host}${parsed.pathname}). ` +
        `The accept-set is exactly ${PSQL_QUERY_PARAM_ACCEPT_SET.join(", ")}; every other ` +
        `parameter is refused BY NAME so an unmodeled libpq channel fails loud rather than ` +
        `passing silent.` +
        (steering.length > 0
          ? ` ${steering.join(", ")} ${steering.length === 1 ? "is a" : "are"} known libpq ` +
            `authority-override parameter(s) — libpq resolves them OVER the URI's own ` +
            `authority (host, port, database or role), so the connection would not be the one ` +
            `this URL describes.`
          : ` If this parameter is legitimate, add it to PSQL_QUERY_PARAM_ACCEPT_SET.`),
    );
  }

  // ── Loopback ────────────────────────────────────────────────────────────────
  if (
    !LOOPBACK_HOSTS.has(parsed.hostname) &&
    !remoteOptInActive(source, options.honorRemoteOptIn ?? false)
  ) {
    throw new Error(
      `${caller}: refusing a non-loopback database host (${parsed.hostname}), supplied by ` +
        `${channel}. A fixture write here would land in the SHARED remote database while the ` +
        `suite's PostgREST client reads the loopback stack, so the two would disagree about ` +
        `what exists. Point it at the local Supabase instance, unset it to use ` +
        `${LOCAL_SUPABASE_DSN}, or set ${REMOTE_OPT_IN_ENV}=1 to target it deliberately.`,
    );
  }

  if (options.requireLocalSupabase === true) {
    if (parsed.port !== LOCAL_SUPABASE_DB_PORT) {
      throw new Error(
        `${caller}: refuses a loopback database on port ${parsed.port || "(default)"}; it must ` +
          `be the local Supabase database on ${LOCAL_SUPABASE_DB_PORT}. Seeding another local ` +
          `Postgres would split the fixture: the rows land there while the wizard session, the ` +
          `readback, and the rendered page stay on Supabase.`,
      );
    }
    const database = parsed.pathname.replace(/^\//, "");
    if (database !== LOCAL_SUPABASE_DB_NAME) {
      throw new Error(
        `${caller}: refuses database "${database || "(none)"}"; it must be ` +
          `"${LOCAL_SUPABASE_DB_NAME}", the database every other consumer reads.`,
      );
    }
    if (parsed.username === "" || parsed.password === "") {
      throw new Error(
        `${caller}: requires a DSN carrying BOTH a user and a password. The child runs with ` +
          `every PG* variable stripped (PGPASSWORD included), so an ambient-credential DSN ` +
          `would be accepted here and then fail to authenticate far from this guard. Use ` +
          `${LOCAL_SUPABASE_DSN}, or supply credentials inline.`,
      );
    }
  }

  return url;
}

/**
 * The environment a fixture `psql` runs under.
 *
 * Not detection — NON-INHERITANCE. Every `PG*` name is stripped by PREFIX
 * rather than by a denylist, so variables future libpq versions invent are
 * closed on arrival; then `PGSERVICEFILE` is re-added, pointed at a path that
 * does not exist, because stripping it restores the `~/.pg_service.conf`
 * default rather than disabling it.
 *
 * Under the remote opt-in the ambient environment is returned VERBATIM: an
 * operator who has deliberately said "target that database" is also the
 * operator whose `PGPASSWORD` or service entry is how they reach it. Profiles
 * that do not honor the opt-in never take this path.
 */
export function psqlChildEnv(
  options: { source?: NodeJS.ProcessEnv; honorRemoteOptIn?: boolean } = {},
): NodeJS.ProcessEnv {
  const source = options.source ?? process.env;
  if (remoteOptInActive(source, options.honorRemoteOptIn ?? false)) return { ...source };
  const env: NodeJS.ProcessEnv = { ...source };
  for (const key of Object.keys(env)) {
    if (key.toUpperCase().startsWith("PG")) delete env[key];
  }
  env["PGSERVICEFILE"] = NEUTRALIZED_PG_SERVICE_FILE;
  return env;
}
