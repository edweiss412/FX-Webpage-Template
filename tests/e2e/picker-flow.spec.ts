/**
 * tests/e2e/picker-flow.spec.ts (M11.5 §B Playwright suite)
 *
 * End-to-end exercises for the picker pivot's five canonical flows.
 *
 * Why mostly skipped at landing time: each scenario depends on §A
 * backend wiring that has not yet shipped in the M11.5 implementation
 * chain — picker-bootstrap Route Handler (Task C6), the OAuth-callback
 * claim-stamp hook (Task C7), the admin RPCs (A3/A4) being callable
 * with seeded fixtures, and the `admin_read_share_token` RPC (Task
 * F2.5 backend / Pin-stop 3) for the rotate-token visibility loop.
 * The brief explicitly directs us to land scenarios as `.skip` with
 * TODOs citing the backend dependencies so the orchestrator can
 * sequence them after each backend pin clears.
 *
 * Each test below SHIPS the full Playwright body so the suite is
 * ready to flip from `.skip` to active once its backend pin clears.
 * The unblocked test (slug-only-URL-404) runs today — it's pinned
 * by the C1 route move (delete app/show/[slug]/page.tsx) and is
 * independent of the picker chain's later pieces.
 */
import { test, expect } from "@playwright/test";

// Slug-only URL with no share-token segment. Active today (C1).
test("slug-only show URL returns 404 (R35; relies only on C1 route move)", async ({ page }) => {
  const res = await page.goto("/show/sample-slug-with-no-token");
  expect(res?.status()).toBe(404);
});

test.skip(
  "first-contact gate -> tap 'Sign in with Google' -> OAuth happy path -> show body renders",
  async ({ page: _page }) => {
    // TODO §A coordination: requires Codex C6 (picker-bootstrap Route
    // Handler) + C7 (callback claim-stamp hook) + an OAuth fixture
    // path that mints `__Host-fxav_picker` cookie with a fresh-claim
    // entry. The seedTestShowWithCrew() helper also needs to write
    // a row to show_share_tokens (A2 already shipped) so the
    // tokenized URL resolves.
    //
    // Flow:
    //   1. seed show + roster + share-token
    //   2. visit /show/<slug>/<share-token> as a NEW browser context
    //      (no cookies, no Google session)
    //   3. assert <SignInOrSkipGate> Mode A renders (data-testid
    //      "sign-in-or-skip-gate" + sign-in CTA href to
    //      /auth/sign-in?next=<encoded URL>)
    //   4. signInAs() the OAuth fixture identity (extends
    //      helpers/signInAs.ts as the brief calls out)
    //   5. visit the tokenized URL again
    //   6. expect <ShowBody> rendered + IdentityChip carries the
    //      crew row's name + role
  },
);

test.skip(
  "Mode B shared-device: Google session matches no crew row -> 'Signed in as someone else' header",
  async ({ page: _page }) => {
    // TODO §A coordination: requires Codex's resolveShowPageAccess
    // step 4(e) implementation returning `no_auth, reason:
    // 'google_mismatch'` (P-R27 Fix-1) when a Google session is
    // present but the user's canonical email matches no crew row
    // for the target show.
    //
    // Flow:
    //   1. seed show A + roster A (Alice + Bob)
    //   2. seed show B + roster B (Carol)
    //   3. signInAs(Carol)
    //   4. visit show A's tokenized URL
    //   5. expect "Signed in as someone else" header
    //      (data-testid "sign-in-or-skip-gate-mismatch-header")
    //   6. expect primary CTA href starts with /api/auth/google/start
    //      (NOT /auth/sign-in) and includes the encoded next param
  },
);

test.skip(
  "Mode B 'Continue as guest' atomically clears the stale entry and lands on the picker",
  async ({ page: _page }) => {
    // TODO §A coordination: requires the clearIdentityAndSkip
    // Server Action's redirect path landing on the new tokenized
    // page route with ?gate=skip. The atomicity contract: between
    // the cookie-clear and the redirect-with-?gate=skip arrival,
    // the page route MUST not re-render Mode B (the cookie is
    // already gone) AND MUST honor the ?gate=skip query because
    // the resolver is now first_contact.
    //
    // Flow:
    //   1. signInAs(Carol) (Mode B premise: Google session not on
    //      target show's roster)
    //   2. visit show A's URL
    //   3. seed a stale picker cookie referencing Alice (mismatched
    //      identity)
    //   4. click "Continue as guest"
    //   5. expect navigation to /show/<slug>/<token>?gate=skip
    //   6. expect <PickerInterstitial> rendered (data-testid
    //      "picker-interstitial-root")
    //   7. assert the picker cookie no longer contains Alice's entry
    //      for this show
  },
);

test.skip(
  "Deactivated row: tapping a claimed crew member redirects through /auth/sign-in",
  async ({ page: _page }) => {
    // TODO §A coordination: requires C7 (callback claim-stamp) so
    // a crew_members row can have `claimed_via_oauth_at IS NOT NULL`.
    // The picker render then renders that row as data-claimed="true"
    // with a GET form action="/auth/sign-in?next=<encoded URL>";
    // tapping it MUST navigate to the sign-in page (NOT post to
    // selectIdentity).
    //
    // Flow:
    //   1. seed show + roster with one claimed (Alice, claimed_via_oauth_at
    //      set) + one unclaimed (Bob)
    //   2. visit show URL with ?gate=skip
    //   3. expect <PickerInterstitial> with two rows
    //   4. assert Alice's row has data-claimed="true" + lock icon
    //   5. tap Alice's row
    //   6. expect navigation to /auth/sign-in?next=<encoded tokenized URL>
    //   7. assert NO selectIdentity Server Action invocation
    //      (network log negative)
  },
);

test.skip(
  "Admin Reset + Rotate flow: changing the share-token invalidates the old URL and the new URL works",
  async ({ page: _page }) => {
    // TODO §A coordination: requires F2.5 backend RPC
    // (admin_read_share_token) to confirm the rotate landed; uses
    // resetPickerEpoch (A3) and rotateShareToken (A4) already
    // shipped in Pin-2.
    //
    // Flow:
    //   1. signInAs(ADMIN_FIXTURE)
    //   2. seed show with a known initial share-token
    //   3. visit /admin/show/<slug>
    //   4. click "Rotate share-token" -> confirm
    //   5. expect the success URL banner with the new token; copy it
    //   6. visit the OLD tokenized URL -> expect 404
    //      (show_unavailable / not_found surface via R35 path miss)
    //   7. visit the NEW tokenized URL -> expect the page resolves
    //      (404 only if seed missing; otherwise SignInOrSkipGate or
    //      picker, both acceptable)
    //   8. click "Reset picker selections" -> confirm
    //   9. expect success banner "Picker selections reset."
    //  10. (optional) re-visit with the previous picker cookie ->
    //      expect <PickerInterstitial> with the epoch-stale banner
  },
);
