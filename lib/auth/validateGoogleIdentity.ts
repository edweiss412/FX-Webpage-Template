import { canonicalize } from "@/lib/email/canonicalize";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type GoogleIdentityViewer = {
  kind: "crew";
  email: string;
  /**
   * Cross-show identity token from Supabase Auth (`user.id`), not a
   * show-bound `crew_members.id`. `/me` resolves per-show crew row IDs in
   * `listShowsForCrew`.
   */
  authUserId: string;
};

export type GoogleIdentityValidationResult =
  | { kind: "success"; viewer: GoogleIdentityViewer }
  | { kind: "continue" };

/**
 * Deliberately separate from validateGoogleSession. `/me` has no show id,
 * so this function must not perform a show-bound crew_members lookup.
 */
export async function validateGoogleIdentity(
  req: Request,
): Promise<GoogleIdentityValidationResult> {
  void req;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return { kind: "continue" };
    }

    const email = canonicalize(data.user.email);
    if (!email) {
      return { kind: "continue" };
    }

    return {
      kind: "success",
      viewer: {
        kind: "crew",
        email,
        authUserId: data.user.id,
      },
    };
  } catch {
    return { kind: "continue" };
  }
}
