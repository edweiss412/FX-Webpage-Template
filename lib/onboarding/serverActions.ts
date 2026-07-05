"use server";

import { redirect } from "next/navigation";
import { requireAdminIdentity } from "@/lib/auth/requireAdmin";
import { purgeAndRotateOnboardingSession } from "@/lib/onboarding/sessionLifecycle";
import { logAdminOutcome } from "@/lib/log/logAdminOutcome";

export async function startOverServerAction(): Promise<never> {
  const { email } = await requireAdminIdentity();
  await purgeAndRotateOnboardingSession();
  // Durable forensic telemetry: after the purge resolves, BEFORE the redirect()
  // throw (invariant 10, §5.2). logAdminOutcome is internally try/catch-wrapped
  // so this await can never itself throw over the committed purge.
  await logAdminOutcome({
    code: "ONBOARDING_STARTED_OVER",
    source: "admin.onboarding.startOver",
    actorEmail: email,
  });
  redirect("/admin");
}

export async function rerunSetupServerAction(): Promise<never> {
  const { email } = await requireAdminIdentity();
  const result = await purgeAndRotateOnboardingSession({ suppressIfFinalizePending: true });
  // Durable forensic telemetry: fires unconditionally once the purge resolves,
  // BEFORE either redirect() throw below — both the normal and the
  // finalize-pending-suppressed branch redirect, so both are a real "rerun
  // setup" outcome (invariant 10, §5.2).
  await logAdminOutcome({
    code: "ONBOARDING_SETUP_RERUN",
    source: "admin.onboarding.rerunSetup",
    actorEmail: email,
    result: "suppressed" in result ? result.suppressed : "rotated",
  });
  if (!result.rotated && result.suppressed === "WIZARD_FINALIZE_BATCHES_PENDING") {
    redirect("/admin?show_finalize=true");
  }
  redirect("/admin");
}
