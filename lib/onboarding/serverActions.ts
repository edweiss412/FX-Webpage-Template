"use server";

import { redirect } from "next/navigation";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { purgeAndRotateOnboardingSession } from "@/lib/onboarding/sessionLifecycle";

export async function startOverServerAction(): Promise<never> {
  await requireAdminIdentity();
  await purgeAndRotateOnboardingSession();
  redirect("/admin");
}

export async function rerunSetupServerAction(): Promise<never> {
  await requireAdminIdentity();
  const result = await purgeAndRotateOnboardingSession({ suppressIfFinalizePending: true });
  if (!result.rotated && result.suppressed === "WIZARD_FINALIZE_BATCHES_PENDING") {
    redirect("/admin?show_finalize=true");
  }
  redirect("/admin");
}
