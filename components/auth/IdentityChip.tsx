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
 *   typed result is informational; failure modes either succeed
 *   (`action: 'noop'`) or are absorbed into a `code` field, both
 *   harmless to discard at the form boundary.
 */

import { clearIdentity } from "@/lib/auth/picker/clearIdentity";

async function clearIdentityFormAction(formData: FormData): Promise<void> {
  "use server";
  await clearIdentity(formData);
}

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
    <div
      data-testid="identity-chip"
      className="flex flex-col items-end gap-0.5 text-right"
    >
      <span className="text-sm font-semibold text-text-strong">
        {name}
        <span className="text-text-subtle font-medium" aria-hidden="true">
          {" · "}
        </span>
        <span className="font-medium text-text-subtle">{role}</span>
      </span>
      <form action={clearIdentityFormAction}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="shareToken" value={shareToken} />
        <input type="hidden" name="showId" value={showId} />
        <button
          type="submit"
          data-testid="identity-chip-not-you"
          className="min-h-tap-min text-xs text-accent-on-bg underline underline-offset-2 hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Not you?
        </button>
      </form>
    </div>
  );
}
