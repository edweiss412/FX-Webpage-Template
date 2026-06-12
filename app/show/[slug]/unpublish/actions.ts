"use server";
// app/show/[slug]/unpublish/actions.ts — M12.13 confirm-page POST (spec §5).
//
// The action RE-validates the recipient binding from the FORM PAYLOAD before
// any token use (R9 — the GET-time check does not protect the POST; a
// revocation between render and click must deny), then consumes EXCLUSIVELY
// via the locked wrapper `unpublishShowViaEmailedLink` — which re-validates
// the binding atomically inside the transaction (spec §3 R12; the pre-check
// here exists only for cheap-fail UX, R15). Outcomes render in place:
//   success → success copy with the show title + plain admin href;
//   expired → UNPUBLISH_TOKEN_EXPIRED catalog copy (the expired branch still
//             holds a stored token, so the binding IS derivable);
//   consumed AND not_found → the NEUTRAL state (R19/R20 — CONSUMED never
//             renders on any public leg; the double-submitter already saw
//             success render in place);
//   infra (returned pre-check fault or thrown wrapper fault) → retry state,
//             never a benign state, never a silent no-op (invariant 9).
//
// not-subject-to-meta: no Supabase client here — the data path is the raw
// postgres seam (lib/sync/unpublishConfirmPage.ts + unpublishShow.ts) whose
// returned/thrown faults map to the typed "infra" status, pinned by
// tests/show/unpublishConfirmAction.test.ts.
import { unpublishShowViaEmailedLink } from "@/lib/sync/unpublishShow";
import { prevalidateUnpublishBinding } from "@/lib/sync/unpublishConfirmPage";
import { messageFor } from "@/lib/messages/lookup";
import type { ConfirmUnpublishActionState } from "./copy";

function fieldOf(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  if (typeof value !== "string" || value === "") return undefined;
  return value;
}

export async function confirmUnpublishAction(
  _prev: ConfirmUnpublishActionState,
  formData: FormData,
): Promise<ConfirmUnpublishActionState> {
  const slug = fieldOf(formData, "slug");
  const token = fieldOf(formData, "token");
  const r = fieldOf(formData, "r");
  if (!slug || !token || !r) return { status: "neutral" };

  // R9 pre-check: binding failure → neutral, token NOT consumed (the wrapper
  // is never reached).
  const precheck = await prevalidateUnpublishBinding({ slug, token, r });
  if (precheck.kind === "infra") return { status: "infra" };
  if (precheck.kind === "neutral") return { status: "neutral" };

  let result;
  try {
    result = await unpublishShowViaEmailedLink({ slug, token, r });
  } catch {
    return { status: "infra" };
  }

  switch (result.outcome) {
    case "success":
      return { status: "success", title: precheck.title };
    case "expired": {
      const entry = messageFor("UNPUBLISH_TOKEN_EXPIRED");
      return {
        status: "expired",
        title: entry.title,
        body: entry.dougFacing as string,
      };
    }
    // R20: CONSUMED never renders or returns on ANY public leg — and
    // not_found is the neutral contract already. Both collapse to neutral.
    case "consumed":
    case "not_found":
      return { status: "neutral" };
  }
}
