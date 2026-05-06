import type { AuthFailureCode } from "@/lib/auth/constants";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { isAuthSessionMissingError } from "@/lib/auth/supabaseAuthError";
import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export type GoogleSessionViewer = {
  kind: "crew";
  email: string;
  showId: string;
  crewMemberId: string;
};

export type GoogleSessionValidationContext = {
  showId: string;
};

export type GoogleSessionValidationResult =
  | { kind: "success"; viewer: GoogleSessionViewer }
  | { kind: "continue"; code?: "GOOGLE_NO_CREW_MATCH" }
  | {
      kind: "terminal_failure";
      status: 403 | 500;
      code: AuthFailureCode;
    };

type CrewMemberEmailRow = {
  id: string;
  show_id: string;
  email: string;
};

async function upsertAmbiguousEmailAlert(input: {
  showId: string;
  email: string;
  crewMemberIds: string[];
}): Promise<void> {
  await upsertAdminAlert({
    showId: input.showId,
    code: "AMBIGUOUS_EMAIL_BINDING",
    context: {
      email: input.email,
      crew_member_ids: input.crewMemberIds,
    },
  });
}

export async function validateGoogleSession(
  req: Request,
  context: GoogleSessionValidationContext,
): Promise<GoogleSessionValidationResult> {
  // Kept for the shared auth-chain signature; Supabase reads request cookies
  // via createSupabaseServerClient().
  void req;

  // R17 #4 (round-16 §A MEDIUM): wrap client construction +
  // service-role lookup in try/catch. Pre-fix createSupabaseServerClient,
  // createSupabaseServiceRoleClient, and the .from(...) await could
  // throw on missing env / cookie-store unavailable / network failure
  // — none of those were caught and would produce an uncataloged
  // framework error path instead of the terminal_failure contract
  // callers (resolveShowViewer, show-page chain) expect. Mirror the
  // top-level try/catch validateGoogleIdentity uses (R15 #4).
  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
  // Meta-discipline (M5 R18 post-fix): the awaited supabase.auth.getUser()
  // call can THROW (network, abort, JWT decode error) in addition to
  // returning { error }. The pre-fix `if (userError)` arm only handled
  // the returned-error case; a throw bypassed the discriminated union
  // entirely and surfaced as an uncataloged framework error. Wrap so
  // both shapes route to terminal_failure 500.
  let userResult: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  let userError: Awaited<ReturnType<typeof supabase.auth.getUser>>["error"];
  try {
    const r = await supabase.auth.getUser();
    userResult = r.data;
    userError = r.error;
  } catch {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
  if (userError) {
    if (isAuthSessionMissingError(userError)) {
      return { kind: "continue" };
    }
    // R16 #1 (round-15 §A HIGH): pre-R16 the route collapsed any
    // getUser() error into "continue", so a transient Supabase Auth
    // outage looked identical to "no Google credentials." Through
    // resolveShowViewer that fell to denied/no_credentials → 401,
    // recreating the exact infra-as-auth masking class R15 was meant
    // to eliminate. Surface as terminal_failure 500.
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }
  if (!userResult.user) {
    return { kind: "continue" };
  }

  const email = canonicalize(userResult.user.email);
  if (!email) {
    return { kind: "continue" };
  }

  // R17 #4: service-role client construction + .from() await can also
  // throw infra/network errors — not just return { error }. Wrap so
  // an unexpected throw maps to terminal_failure, not an uncaught
  // framework error.
  let crewRows: CrewMemberEmailRow[] | null;
  try {
    const service = createSupabaseServiceRoleClient();
    const result = (await service
      .from("crew_members")
      .select("id,show_id,email")
      .eq("show_id", context.showId)
      .eq("email", email)) as { data: CrewMemberEmailRow[] | null; error: unknown };
    if (result.error) {
      return {
        kind: "terminal_failure",
        status: 500,
        code: "ADMIN_SESSION_LOOKUP_FAILED",
      };
    }
    crewRows = result.data;
  } catch {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }

  const rows = crewRows ?? [];
  if (rows.length === 0) {
    return {
      kind: "continue",
      code: "GOOGLE_NO_CREW_MATCH",
    };
  }

  if (rows.length > 1) {
    try {
      await upsertAmbiguousEmailAlert({
        showId: context.showId,
        email,
        crewMemberIds: rows.map((row) => row.id),
      });
    } catch {
      return {
        kind: "terminal_failure",
        status: 500,
        code: "ADMIN_SESSION_LOOKUP_FAILED",
      };
    }
    return {
      kind: "terminal_failure",
      status: 500,
      code: "AMBIGUOUS_EMAIL_BINDING",
    };
  }

  const row = rows[0];
  if (!row) {
    return {
      kind: "continue",
      code: "GOOGLE_NO_CREW_MATCH",
    };
  }

  return {
    kind: "success",
    viewer: {
      kind: "crew",
      email,
      showId: row.show_id,
      crewMemberId: row.id,
    },
  };
}
