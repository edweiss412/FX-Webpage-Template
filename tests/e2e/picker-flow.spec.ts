/**
 * tests/e2e/picker-flow.spec.ts (M11.5 §B Playwright suite)
 *
 * End-to-end exercises for the picker pivot's five canonical flows.
 *
 * Status @ §B continuation (post-Pin-stop 3): all §A backend surfaces these
 * scenarios drive have landed (picker-bootstrap Route Handler / C6, OAuth
 * callback claim-stamp / C7, admin_read_share_token / F2.5 backend, and the
 * pre-existing Pin-2 admin RPCs A3/A4). What's still missing is the
 * **picker-shaped e2e helper infrastructure**: the M9.5 helpers
 * (tests/e2e/helpers/supabaseAdmin.ts, cookies.ts, seedLinkSession.ts) were
 * deleted by §A G-series cleanup; equivalents for the new picker envelope
 * (seedTestShowWithCrew that writes show_share_tokens, a __Host-fxav_picker
 * cookie seeder, an "OAuth-claim-stamp" fixture-claim helper) have not been
 * written yet. Each scenario below ships its full Playwright body so the
 * suite is ready to flip from `.skip` to active as soon as the helper layer
 * lands; until then, every scenario stays `.skip` with the refreshed TODO
 * naming its specific helper dependency.
 *
 * The unblocked test (slug-only-URL-404) runs today — it's pinned by the C1
 * route move (delete app/show/[slug]/page.tsx) and is helper-independent.
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
    // TODO (§A e2e helpers): all backend surfaces are present at HEAD
    //   - C6 picker-bootstrap Route Handler (landed pre-Pin-3)
    //   - C7 callback claim-stamp hook (landed pre-Pin-3)
    //   - show_share_tokens table (Pin-2 A2)
    // Missing: an e2e helper that seeds a show + roster + writes a row to
    // `show_share_tokens` so the tokenized URL resolves; plus a sign-in
    // fixture that mints `__Host-fxav_picker` with a fresh-claim entry
    // (the prior signInAs helper minted the M9.5 link cookie, which is
    // gone).
    //
    // Flow:
    //   1. seed show + roster + share-token (via the new e2e helper)
    //   2. visit /show/<slug>/<share-token> as a NEW browser context
    //      (no cookies, no Google session)
    //   3. assert <SignInOrSkipGate> Mode A renders (data-testid
    //      "sign-in-or-skip-gate" + sign-in CTA href to
    //      /auth/sign-in?next=<encoded URL>)
    //   4. signInAs() the OAuth fixture identity (post-§A signInAs
    //      contract that drives the picker envelope)
    //   5. visit the tokenized URL again
    //   6. expect <ShowBody> rendered + IdentityChip carries the
    //      crew row's name + role
  },
);

test.skip(
  "Mode B shared-device: Google session matches no crew row -> 'Signed in as someone else' header",
  async ({ page: _page }) => {
    // TODO (§A e2e helpers): resolveShowPageAccess step 4(e) landed
    // with C7 — when a Google session is present but the canonical email
    // matches no crew row for the target show, the helper returns
    // `no_auth, reason: 'google_mismatch'` (P-R27 Fix-1). Missing: an
    // e2e signInAs path that establishes a Google session under the new
    // picker contract (the old signInAs imported deleted helpers).
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
    // TODO (§A e2e helpers): the clearIdentityAndSkip Server Action
    // (Pin-2 wiring) routes the user to `?gate=skip` after stripping the
    // stale entry, and `resolveShowPageAccess` honors ?gate=skip ONLY for
    // reason: 'first_contact' (P-R29 Fix-3). Missing: an e2e helper that
    // seeds a `__Host-fxav_picker` cookie with a known stale entry so
    // the test can observe the clear.
    //
    // Flow:
    //   1. signInAs(Carol) (Mode B premise: Google session not on
    //      target show's roster)
    //   2. visit show A's URL
    //   3. seed a stale picker cookie referencing Alice (mismatched
    //      identity) — needs the post-§A picker-cookie seeder
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
    // TODO (§A e2e helpers): C7's callback claim-stamp landed, so a
    // `crew_members` row can have `claimed_via_oauth_at IS NOT NULL`.
    // <PickerInterstitial> renders such rows with data-claimed="true"
    // and a GET form action="/auth/sign-in?next=<encoded URL>". Missing:
    // an e2e seed helper that writes the claim timestamp directly (so the
    // test does not depend on first running the OAuth callback chain).
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
    // TODO (§A e2e helpers): F2.5 backend (admin_read_share_token)
    // landed at Pin-3 and CurrentShareLinkPanel landed alongside; the
    // Reset (A3) + Rotate (A4) admin Server Actions shipped at Pin-2.
    // Missing: an admin signInAs helper for the new picker-aware admin
    // session (the prior helper imported deleted modules) and a show-seed
    // helper that writes show_share_tokens.
    //
    // Flow:
    //   1. signInAs(ADMIN_FIXTURE)
    //   2. seed show with a known initial share-token
    //   3. visit /admin/show/<slug>
    //   4. expect <CurrentShareLinkPanel> displays the initial URL
    //   5. click "Rotate share-token" -> confirm
    //   6. expect the success URL banner with the new token; copy it
    //   7. expect <CurrentShareLinkPanel> reflects the new token (driven
    //      by router.refresh() on the Rotate success path)
    //   8. visit the OLD tokenized URL -> expect 404
    //      (show_unavailable / not_found surface via R35 path miss)
    //   9. visit the NEW tokenized URL -> expect the page resolves
    //      (404 only if seed missing; otherwise SignInOrSkipGate or
    //      picker, both acceptable)
    //  10. click "Reset picker selections" -> confirm
    //  11. expect success banner "Picker selections reset."
    //  12. (optional) re-visit with the previous picker cookie ->
    //      expect <PickerInterstitial> with the epoch-stale banner
  },
);
