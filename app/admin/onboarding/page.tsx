/**
 * /admin/onboarding — routable alias for the wizard.
 *
 * The onboarding wizard renders at /admin via the dispatcher
 * (app/admin/page.tsx); this route exists so links that name
 * /admin/onboarding (F3 resolved page "Back to setup", spec §5) never
 * dead-end. Admin-gated by app/admin/layout.tsx like every sibling.
 */
import { redirect } from "next/navigation";

export default function OnboardingIndexPage(): never {
  redirect("/admin");
}
