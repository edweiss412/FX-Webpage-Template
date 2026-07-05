"use client";

import { useSyncExternalStore } from "react";

/**
 * lib/a11y/useHasMounted.ts
 *
 * `false` on the server + during hydration, `true` from the first committed
 * client render onward. The idiomatic `useSyncExternalStore` form of the
 * mount-gate (no `setState` inside an effect — react-hooks/set-state-in-effect),
 * mirroring lib/a11y/usePrefersReducedMotion.ts.
 *
 * Used to gate client-only work that must not run during SSR — notably
 * `createPortal(..., document.body)` in <WizardFooter> and <HelpSheet>, where
 * `document` does not exist on the server. Consumers render null until mounted,
 * then portal on the client. Because the value is identical (`false`) for the
 * server render and the hydration snapshot, there is no hydration mismatch.
 */
const emptySubscribe = () => () => {};

export function useHasMounted(): boolean {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
