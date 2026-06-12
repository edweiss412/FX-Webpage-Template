// lib/sync/unpublishConfirmPage.ts — M12.13 confirm-page GET state machine +
// POST binding pre-check (spec §5).
//
// EXACT NON-CONSUMING EVALUATION ORDER (R11 — the binding's HMAC inputs come
// from the show row, so the row fetch necessarily precedes binding
// validation; the TOKEN comparison stays last so binding failures never leak
// token validity):
//   (1) absent token or r → neutral, NOTHING fetched;
//   (2) service-role show fetch (id, title, stored token for in-memory mintId
//       derivation, expiry) — fault → retry state; show missing or no live
//       token → neutral (token columns NULL means the mint is gone and r is
//       underivable — CONSUMED never surfaces publicly, R19);
//   (3) binding validation against unrevoked admin_emails via the §4.3 tuple
//       HMAC — fault → retry; no match → neutral with the SUBMITTED token
//       never compared;
//   (4) constant-time token compare LAST → confirm / neutral / expired.
//
// Nothing here mutates: pure SELECTs (the prefetch pin — GET-no-mutation is
// pinned by tests/show/unpublishConfirmGetNoMutation.test.ts). The POST
// pre-check (steps 1-3 only) exists for cheap-fail UX; the locked wrapper
// `unpublishShowViaEmailedLink` re-validates the binding atomically inside
// the transaction (spec §3 R12/R15).
//
// Invariant 9: this is a raw-postgres seam (no Supabase client — same
// direct-DATABASE_URL pattern as lib/sync/unpublishShow.ts), so the
// Supabase-call registry rows don't apply; returned/thrown reader faults map
// to the discriminable "infra" state, never a benign neutral/expired —
// pinned by tests/show/unpublishConfirmState.test.ts.
// not-subject-to-meta: raw postgres seam (no Supabase client construction);
// faults surface as the typed "infra" state per the tests above.
import postgres from "postgres";
import { timingSafeEqual } from "node:crypto";
import { bindingMatchesActiveAdmin, mintIdFor } from "@/lib/sync/unpublishBinding";

export type UnpublishConfirmShowRow = {
  id: string;
  title: string;
  unpublishToken: string | null;
  unpublishTokenExpiresAt: string | null;
};

export type UnpublishConfirmDeps = {
  readShowForConfirm(slug: string): Promise<UnpublishConfirmShowRow | null>;
  readActiveAdminEmails(): Promise<Array<{ email: string }>>;
  /** Constant-time comparison seam — injectable so tests can pin that binding
   *  failures NEVER reach the token compare (the R11 order assertion). */
  compareTokens(submitted: string, stored: string): boolean;
  now(): Date;
};

export type UnpublishConfirmGetState =
  | { state: "neutral" }
  | { state: "infra" }
  | { state: "expired" }
  | { state: "confirm"; title: string };

export type UnpublishBindingPrecheck =
  | { kind: "ok"; title: string }
  | { kind: "neutral" }
  | { kind: "infra" };

export type UnpublishConfirmArgs = {
  slug: string;
  token: string | undefined;
  r: string | undefined;
};

// Mirrors lib/sync/unpublishShow.ts databaseUrl() (module-private there) —
// the confirm page reads through the same direct service-role connection.
function databaseUrl(): string {
  const configured = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("unpublishConfirmPage requires DATABASE_URL in production");
  }
  return "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
}

async function withSql<T>(fn: (sql: ReturnType<typeof postgres>) => Promise<T>): Promise<T> {
  const sql = postgres(databaseUrl(), { max: 1, idle_timeout: 1, prepare: false });
  try {
    return await fn(sql);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function readShowForConfirmFromDb(slug: string): Promise<UnpublishConfirmShowRow | null> {
  return withSql(async (sql) => {
    const rows = (await sql.unsafe(
      `
        select id, title,
               unpublish_token::text as unpublish_token,
               unpublish_token_expires_at
          from public.shows
         where slug = $1
         limit 1
      `,
      [slug],
    )) as Array<{
      id: string;
      title: string;
      unpublish_token: string | null;
      unpublish_token_expires_at: string | null;
    }>;
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      unpublishToken: row.unpublish_token,
      unpublishTokenExpiresAt: row.unpublish_token_expires_at,
    };
  });
}

// Plain read (no FOR SHARE): this is the render-time / cheap-fail pre-check.
// The serializing FOR-SHARE read lives inside the locked wrapper's
// transaction (lib/sync/unpublishShow.ts readActiveAdminEmailsForShare).
async function readActiveAdminEmailsFromDb(): Promise<Array<{ email: string }>> {
  return withSql(async (sql) => {
    return (await sql.unsafe(
      "select email from public.admin_emails where revoked_at is null",
    )) as Array<{ email: string }>;
  });
}

/** Constant-time token comparison (step 4 — runs LAST, only after the
 *  recipient binding validated). Length is not secret; equal-length inputs
 *  compare in constant time. */
function constantTimeTokenEquals(submitted: string, stored: string): boolean {
  const a = Buffer.from(submitted, "utf8");
  const b = Buffer.from(stored, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

const DEFAULT_DEPS: UnpublishConfirmDeps = {
  readShowForConfirm: readShowForConfirmFromDb,
  readActiveAdminEmails: readActiveAdminEmailsFromDb,
  compareTokens: constantTimeTokenEquals,
  now: () => new Date(),
};

type BindingContext =
  | { kind: "neutral" }
  | { kind: "infra" }
  | {
      kind: "ok";
      show: UnpublishConfirmShowRow & {
        unpublishToken: string;
        unpublishTokenExpiresAt: string;
      };
    };

// Steps 1-3 of the §5 order. Shared by the GET evaluator (which adds the
// step-4 compare) and the POST pre-check (which stops here — the wrapper
// owns the token-state branches).
async function resolveBindingContext(
  args: UnpublishConfirmArgs,
  deps: UnpublishConfirmDeps,
): Promise<BindingContext> {
  // Step 1: absent/empty token or r → neutral with NOTHING fetched.
  if (!args.token || !args.r) return { kind: "neutral" };

  // Step 2: show fetch — fault → retry; missing/no live token → neutral.
  let show: UnpublishConfirmShowRow | null;
  try {
    show = await deps.readShowForConfirm(args.slug);
  } catch {
    return { kind: "infra" };
  }
  if (!show) return { kind: "neutral" };
  if (show.unpublishToken === null || show.unpublishTokenExpiresAt === null) {
    // Token columns NULL: the current mint does not exist, so r is
    // underivable — neutral, never CONSUMED on a public leg (R19).
    return { kind: "neutral" };
  }

  // Step 3: binding validation. mintId derives in memory from the STORED
  // token; the submitted token is not touched here.
  const mintId = mintIdFor(show.unpublishToken);
  let admins: Array<{ email: string }>;
  try {
    admins = await deps.readActiveAdminEmails();
  } catch {
    return { kind: "infra" };
  }
  if (!bindingMatchesActiveAdmin(admins, args.r, show.id, mintId)) {
    // No match → neutral; the submitted token was NEVER compared and nothing
    // distinguishes binding-fail from not-found (no revocation oracle).
    return { kind: "neutral" };
  }

  return {
    kind: "ok",
    show: show as UnpublishConfirmShowRow & {
      unpublishToken: string;
      unpublishTokenExpiresAt: string;
    },
  };
}

function isExpired(expiresAt: string, now: Date): boolean {
  const expiresMs = Date.parse(expiresAt);
  if (!Number.isFinite(expiresMs)) return true;
  return expiresMs < now.getTime();
}

export async function evaluateUnpublishConfirmGet(
  args: UnpublishConfirmArgs,
  deps?: Partial<UnpublishConfirmDeps>,
): Promise<UnpublishConfirmGetState> {
  const d: UnpublishConfirmDeps = { ...DEFAULT_DEPS, ...deps };
  const ctx = await resolveBindingContext(args, d);
  if (ctx.kind === "neutral") return { state: "neutral" };
  if (ctx.kind === "infra") return { state: "infra" };

  // Step 4: only after the binding validates, compare the submitted token to
  // the stored token (constant time) — LAST, so binding failures never
  // learned anything about the token.
  if (!d.compareTokens(args.token as string, ctx.show.unpublishToken)) {
    return { state: "neutral" };
  }
  if (isExpired(ctx.show.unpublishTokenExpiresAt, d.now())) {
    return { state: "expired" };
  }
  return { state: "confirm", title: ctx.show.title };
}

/** POST pre-check (spec §5 R9 — re-validate the binding from the form payload
 *  BEFORE any token use; cheap-fail UX only — the locked wrapper re-validates
 *  atomically inside the transaction). Steps 1-3 of the §5 order; the
 *  submitted token is never compared here. */
export async function prevalidateUnpublishBinding(
  args: UnpublishConfirmArgs,
  deps?: Partial<UnpublishConfirmDeps>,
): Promise<UnpublishBindingPrecheck> {
  const d: UnpublishConfirmDeps = { ...DEFAULT_DEPS, ...deps };
  const ctx = await resolveBindingContext(args, d);
  if (ctx.kind === "neutral") return { kind: "neutral" };
  if (ctx.kind === "infra") return { kind: "infra" };
  return { kind: "ok", title: ctx.show.title };
}
