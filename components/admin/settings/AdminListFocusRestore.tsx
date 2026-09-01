"use client";

/**
 * Container-level focus restore for the administrators list.
 *
 * WHY THE CONTAINER AND NOT THE ROW. A successful revoke revalidates, and the
 * RSC payload replaces the whole section. Three attempts at owning this inside
 * `RevokeRowButton` all failed the same way in a real browser: the row's effect
 * focused the heading, the replacement then swapped that heading for a new
 * element, and focus fell to `<body>` AFTER the move. jsdom cannot observe any
 * of it, because nothing revalidates there — the row's own suite is green at
 * 19/19 while the browser says otherwise, which is why the e2e case is the
 * oracle for this branch and the jsdom suite is not.
 *
 * This is the mechanism `components/admin/showpage/ShareHub.tsx:648-668` already
 * uses for archive, ratified in the confirm-focus spec §2.3: the surface that
 * OWNS the unmount is the surface that restores focus, because it is the one
 * that survives it. `AdministratorsSection` is a server component and cannot
 * hold an effect, so the behaviour lives in this client child mounted inside it.
 *
 * The trigger is the tested predicate, not a guess: the active list re-renders
 * having lost the row that held focus.
 */
import { useEffect, useRef } from "react";

export function AdminListFocusRestore({ activeEmails }: { activeEmails: readonly string[] }) {
  // The effect keys on a PRIMITIVE, not on the array. `activeEmails` is built
  // with `active.map(...)` in the parent, so it is a fresh reference on every
  // parent render and an array dependency would run this effect body every time,
  // saved only by its own guard. The joined string changes when membership
  // does, which is exactly when this component has anything to do.
  const membership = activeEmails.join("\u0000");
  const previous = useRef<string | null>(null);
  /** The row email that held focus when the list last changed under it. */
  const focusedRowEmail = useRef<string | null>(null);

  useEffect(() => {
    const onFocusIn = () => {
      const active = document.activeElement;
      const row = active === null ? null : (active as Element).closest("[data-row-email]");
      focusedRowEmail.current = row === null ? null : row.getAttribute("data-row-email");
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    const before = previous.current;
    previous.current = membership;
    if (before === null) return;
    const beforeList = before.split("\u0000");

    const held = focusedRowEmail.current;
    if (held === null) return;
    // Only when the row that held focus is the one that went away. A list that
    // merely re-orders, or loses a row nobody was in, must not move focus.
    if (!beforeList.includes(held) || activeEmails.includes(held)) return;

    focusedRowEmail.current = null;
    const heading = document.getElementById("admin-settings-admins-heading");
    if (heading === null) return;
    // preventScroll plus an explicit nearest: the ratified behaviour is
    // nearest-only, so revoking near the top of a long list does not jump the
    // viewport (spec AC-3).
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "nearest" });
  }, [membership, activeEmails]);

  return null;
}
