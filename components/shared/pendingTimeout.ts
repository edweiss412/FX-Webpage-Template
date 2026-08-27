/**
 * components/shared/pendingTimeout.ts
 *
 * How long a pending affordance waits before it stops treating itself as busy.
 *
 * ONE definition, two consumers, because the two rows are the same promise to
 * the person tapping them: this control is working, and it will not strand you
 * if it isn't.
 *
 * THE CLAIMED ROSTER ROW (`app/show/[slug]/[shareToken]/_ClaimedRowButton.tsx`).
 * Re-tapping WAS the recovery for a sign-in that never lands; suppressing the
 * second tap removes it, so without this a hung hop leaves the row permanently
 * inert (impeccable critique P0). A navigation that is actually going to happen
 * has replaced that document long before 8s.
 *
 * It does NOT make a duplicate submit impossible, and spec §9 says so outright:
 * if the hop really is still in flight at 8s, a second tap issues a second GET
 * to /auth/sign-in. That is an idempotent navigation which supersedes the
 * first, and it is the accepted price of not stranding the row. Ratified as R10.
 *
 * THE AVATAR MENU'S SWITCH ROW (`components/auth/AvatarMenu.tsx`). Same shape,
 * one step further from the browser: there the pending flag belongs to React's
 * `useTransition` and cannot be cleared, so the watchdog stops TREATING it as
 * busy rather than ending it. A `clearIdentity` that never settles otherwise
 * leaves "Not you? Switch person" dimmed until the page is reloaded, and the
 * re-entry guard refuses every tap that would have recovered it
 * (`BL-AVATAR-MENU-SWITCH-PENDING-WATCHDOG`, probed rather than inferred). The
 * same residual applies: past the timeout a second tap issues a second clear,
 * which lands on an already-cleared entry and an already-ended session.
 *
 * WHY IT LIVES HERE rather than in `lib/ui/` beside `COPY_FEEDBACK_RESET_MS`.
 * `scripts/scan-interaction-timings.ts` scans `app/**` + `components/**` and
 * treats `lib/**` as infrastructure, so a `lib/` home needs an explicit include
 * row in that file, and that file is an enrolled mutation surface. A timing two
 * interaction surfaces share is interaction timing in both of them; putting it
 * in a tree both already import from agrees with the scanner's model instead of
 * asking it for an exemption.
 */
export const PENDING_TIMEOUT_MS = 8_000;
