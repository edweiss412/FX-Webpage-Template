import type { AuthFailureCode } from "@/lib/auth/constants";
import { canonicalize } from "@/lib/email/canonicalize";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

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
  | { kind: "continue" }
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
  const supabase = createSupabaseServiceRoleClient();
  await supabase.from("admin_alerts").upsert({
    show_id: input.showId,
    code: "AMBIGUOUS_EMAIL_BINDING",
    severity: "critical",
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
  void req;
  const supabase = await createSupabaseServerClient();
  const { data: userResult, error: userError } = await supabase.auth.getUser();
  if (userError || !userResult.user) {
    return { kind: "continue" };
  }

  const email = canonicalize(userResult.user.email);
  if (!email) {
    return { kind: "continue" };
  }

  const service = createSupabaseServiceRoleClient();
  const { data: crewRows, error } = (await service
    .from("crew_members")
    .select("id,show_id,email")
    .eq("show_id", context.showId)
    .eq("email", email)) as { data: CrewMemberEmailRow[] | null; error: unknown };

  if (error) {
    return {
      kind: "terminal_failure",
      status: 500,
      code: "ADMIN_SESSION_LOOKUP_FAILED",
    };
  }

  const rows = crewRows ?? [];
  if (rows.length === 0) {
    return {
      kind: "terminal_failure",
      status: 403,
      code: "GOOGLE_NO_CREW_MATCH",
    };
  }

  if (rows.length > 1) {
    await upsertAmbiguousEmailAlert({
      showId: context.showId,
      email,
      crewMemberIds: rows.map((row) => row.id),
    });
    return {
      kind: "terminal_failure",
      status: 500,
      code: "AMBIGUOUS_EMAIL_BINDING",
    };
  }

  const row = rows[0];
  if (!row) {
    return {
      kind: "terminal_failure",
      status: 403,
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
