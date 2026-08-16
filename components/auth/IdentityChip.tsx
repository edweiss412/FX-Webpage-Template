/**
 * components/auth/IdentityChip.tsx (M11.5 §B Task C4)
 *
 * Server Component rendered inside the show header strip when the
 * picker has resolved a crew identity. Two responsibilities:
 *   - confirm "we know who you are" — display name + role
 *   - offer a single-tap recovery via "Not you?" bound to `clearIdentity`
 *
 * The base `clearIdentity` Server Action (Pin-2 contract) revalidates
 * the page WITHOUT redirecting — after clear, the Server Component
 * re-renders into <PickerInterstitial>. This is the no-redirect path;
 * the atomic clear+skip flow lives in `clearIdentityAndSkip` and is
 * wired into <SignInOrSkipGate> Mode B (Task C5, P-R29 Fix-3).
 *
 * Why the thin wrapper around `clearIdentity`:
 *   Only a Server Component can declare a Server Action, and `AvatarMenu` is a
 *   client island — so the action is declared here and passed down as a prop.
 *   The wrapper RETURNS the typed `ClearIdentityResult` rather than discarding
 *   it. It used to return `Promise<void>`, which made a failed clear look
 *   exactly like a successful one: nothing re-rendered, the menu did not move,
 *   and the crew member read that as "switched" while still being that person
 *   (BL-IDENTITY-CLEAR-FAILURE-IS-SILENT, probed 2026-08-10). The menu now owns
 *   a failure state and needs the result to drive it; it adapts this to React
 *   19's `void | Promise<void>` form-action slot on its own side.
 */

import { clearIdentity } from "@/lib/auth/picker/clearIdentity";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";
import { AvatarMenu } from "@/components/auth/AvatarMenu";

async function clearIdentityFormAction(formData: FormData): Promise<ClearIdentityResult> {
  "use server";
  // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker clearIdentity,
  // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
  return clearIdentity(formData);
}

/**
 * The crew header's identity control.
 *
 * Since 2026-08-09 this Server Component is a THIN SEAM: it declares the
 * `clearIdentity` form action (only a Server Component can) and hands it to the
 * `AvatarMenu` client island, which owns the rendering. The name is kept because
 * two suites, the picker e2e recipe and the header contract all cite it — a
 * rename would cost more than the slightly-stale name saves.
 *
 * What used to render here — the name/role text stack plus an always-visible
 * `Not you?` button — moved INTO the menu (UI spec §2.3, Menu A). The form
 * boundary did not move: the same hidden `slug`/`shareToken`/`showId` inputs and
 * the same typed wrapper submit from inside the menu's person row.
 */
export function IdentityChip({
  name,
  role,
  slug,
  shareToken,
  showId,
}: {
  name: string;
  role: string;
  slug: string;
  shareToken: string;
  showId: string;
}) {
  return (
    <AvatarMenu
      name={name}
      role={role}
      slug={slug}
      shareToken={shareToken}
      showId={showId}
      clearAction={clearIdentityFormAction}
    />
  );
}
