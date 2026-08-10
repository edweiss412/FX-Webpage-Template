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
 *   React 19 `<form action>` expects `(FormData) => void | Promise<void>`;
 *   Pin-2's `clearIdentity` returns `Promise<ClearIdentityResult>`. The
 *   typed result is discarded here, and that is a KNOWN GAP rather than a
 *   safe simplification. The original claim - that failures either succeed as
 *   `action: 'noop'` or are absorbed into a `code` - was disproven by probe on
 *   2026-08-10: `clearIdentity` can resolve `{ ok: false, code:
 *   'PICKER_RESOLVER_LOOKUP_FAILED' }`, and discarding it makes a failed clear
 *   look exactly like a successful one. Surfacing it needs a failure state the
 *   menu does not have; tracked by BL-IDENTITY-CLEAR-FAILURE-IS-SILENT.
 */

import { clearIdentity } from "@/lib/auth/picker/clearIdentity";
import { AvatarMenu } from "@/components/auth/AvatarMenu";

async function clearIdentityFormAction(formData: FormData): Promise<void> {
  "use server";
  // no-telemetry: thin crew form-action wrapper; delegates to lib/auth/picker clearIdentity,
  // which is the crew-picker observability surface tracked by BL-CREW-PICKER-OBSERVABILITY.
  await clearIdentity(formData);
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
