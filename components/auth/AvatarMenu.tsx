"use client";
/**
 * components/auth/AvatarMenu.tsx — the crew header's identity control.
 *
 * Spec: docs/superpowers/specs/2026-08-09-crew-chrome-wizard-connector.md §2.3
 * Ratified 2026-08-09 over three mockup rounds: "lets put the light/dark switch
 * in the header but hide it in a menu from the avatar there on tap", with
 * Menu A — identity header, theme item, and `Not you? Switch person` all inside.
 *
 * WHAT IT REPLACES. The header right slot rendered a text `IdentityChip`: a
 * name/role stack plus an always-visible `Not you?` button. That button is
 * ABSORBED here, which makes the recovery flow two taps instead of one — a
 * ratified UX regression-in-exchange (UI spec §4 limit 1), not an oversight.
 *
 * THE FORM BOUNDARY IS PRESERVED, and that is the load-bearing part. The person
 * row is the SAME server-action form the old control submitted — hidden `slug`,
 * `shareToken` and `showId` inputs, the typed `clearIdentity` wrapper — with the
 * submit button carrying `role="menuitem"`. It is not a click handler that calls
 * an action: a bare invocation would drop the route inputs that make the clear
 * land on the right show, and the existing IdentityChip suites pin the form
 * shape rather than a spy. The action arrives as a prop because this is a client
 * island and only a Server Component can declare it (IdentityChip does).
 *
 * ACCESSIBLE NAME, CONSTRUCTED (guard conditions, UI spec §2.3). Partial
 * identity is a real state — the picker can resolve a person with no role — so
 * the trigger's name is built by joining the non-empty parts of
 * [name-or-"Crew member", role, "account menu"] with ", ":
 *
 *   name + role   "Doug L., Lead, account menu"
 *   name only     "Doug L., account menu"
 *   role only     "Crew member, Lead, account menu"   (the fallback substitutes)
 *   both blank    "Crew member, account menu"
 *
 * No dangling punctuation can occur by construction. When BOTH are blank the
 * identity header is omitted entirely and the menu takes `aria-label="Account
 * menu"` INSTEAD of `aria-labelledby` — a labelledby pointing at a node that
 * renders nothing leaves the menu unnamed, which is worse than the fallback.
 *
 * THE THEME ROW IS A `menuitemcheckbox`, not a button with `aria-pressed`:
 * `aria-pressed` is not valid on a menu item, and a stateful toggle inside a
 * menu is exactly what `menuitemcheckbox` + `aria-checked` is for. Activating it
 * does NOT close the menu — the switch is the kind of thing people flip, look
 * at, and flip back.
 *
 * KEYBOARD (complete, and complete is the point — a partial menu contract is
 * how keyboard users get stranded): trigger click or Enter/Space/ArrowDown opens
 * with focus on the FIRST item; ArrowUp opens with focus on the LAST. Inside,
 * ArrowDown/ArrowUp cycle with wrap, Home/End jump. Focus is NOT trapped: Tab
 * and Shift+Tab close the menu and move on per the natural tab order, because a
 * menu that traps focus in a page header is a trap, not a menu. Escape closes
 * and returns focus to the avatar. An outside pointer-down closes without
 * stealing focus.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { Check, Moon, UserRoundCog } from "lucide-react";

import { deriveInitials } from "@/components/atoms/Avatar";
import { avatarColor } from "@/lib/crew/avatarColor";
import { cn } from "@/lib/ui/cn";
import { useAppliedTheme } from "@/components/layout/useAppliedTheme";
import { messageFor } from "@/lib/messages/lookup";
import type { ClearIdentityResult } from "@/lib/auth/picker/clearIdentity";

/** The name substituted for a blank one, so the trigger is never unnamed. */
export const CREW_MEMBER_FALLBACK = "Crew member";

/**
 * The trigger's accessible name. Exported because it is a CONTRACT with four
 * enumerated cases, and a test that re-derives it would only prove itself.
 */
export function buildAvatarMenuLabel(name: string, role: string): string {
  const parts = [name.trim() === "" ? CREW_MEMBER_FALLBACK : name.trim()];
  if (role.trim() !== "") parts.push(role.trim());
  parts.push("account menu");
  return parts.join(", ");
}

type AvatarMenuProps = {
  name: string;
  role: string;
  slug: string;
  shareToken: string;
  showId: string;
  /**
   * The `clearIdentity` server-action wrapper, declared by the Server Component
   * that renders this island. Passed rather than imported because a client
   * module cannot declare one. It RETURNS its typed result: discarding it is
   * what made a failed switch look like a successful one.
   */
  clearAction: (formData: FormData) => Promise<ClearIdentityResult>;
};

/** The menu's items, in DOM order — the order arrow keys traverse. */
const ITEM_COUNT = 2;

export function AvatarMenu({ name, role, slug, shareToken, showId, clearAction }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { mounted, isDark, setTheme } = useAppliedTheme();

  // THE FAILURE STATE IS LOCAL `useState`, NOT `useActionState`. React 19 gives
  // `useActionState` no reset API, and `open=false` only HIDES the popover —
  // this component stays mounted — so a `useActionState` error would survive the
  // close and reappear on the next open, showing a stale failure for a clear the
  // person has already moved on from. A plain state the menu resets when it
  // opens is the shape that matches the lifecycle.
  const [switchStatus, setSwitchStatus] = useState<"idle" | "error">("idle");
  const [switchPending, startSwitch] = useTransition();

  // React 19's form-action slot takes `void | Promise<void>`, so the returning
  // `clearAction` cannot bind to it directly. This adapter is that binding AND
  // the seam where the result finally gets read.
  const onSwitchSubmit = (formData: FormData): void => {
    // The pending item stays FOCUSABLE (aria-disabled, not native disabled), so
    // re-entry is guarded here rather than by the DOM.
    if (switchPending) return;
    setSwitchStatus("idle"); // clear a prior error before the retry
    startSwitch(async () => {
      const result = await clearAction(formData);
      // Any failure shows the same generic copy: the crew member cannot act on
      // WHICH failure it was, and a cross-origin refusal must not tell a
      // forger anything either. Success needs no branch — a cookie-only viewer
      // unmounts this whole control via revalidatePath.
      if (!result.ok) setSwitchStatus("error");
    });
  };

  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const headerId = useId();
  const hasIdentity = name.trim() !== "" || role.trim() !== "";
  const label = buildAvatarMenuLabel(name, role);

  const focusItem = useCallback((index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  }, []);

  const close = useCallback((opts: { restoreFocus: boolean }) => {
    setOpen(false);
    if (opts.restoreFocus) triggerRef.current?.focus();
  }, []);

  // Outside pointer-down closes WITHOUT restoring focus: the person is already
  // reaching for something else, and yanking focus back to the avatar would
  // fight the tap they just made.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // The items do not exist until the open render COMMITS, so the focus move
  // cannot happen in the same tick as `setOpen`. An effect is the right seam,
  // not `requestAnimationFrame`: a frame callback scheduled beside a state
  // update is a race under concurrent rendering — it can run before the commit
  // it is waiting for — and the failure mode is a menu that opens with focus
  // still on the trigger, which is exactly what a keyboard user cannot recover
  // from without knowing to press Down again.
  const pendingFocus = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const index = pendingFocus.current;
    if (index === null) return;
    pendingFocus.current = null;
    focusItem(index);
  }, [open, focusItem]);

  const openAt = (index: number): void => {
    pendingFocus.current = index;
    setActiveIndex(index);
    // EVERY open resets the failure state, and this is the ONLY place the menu
    // opens, so there is one site rather than one per entry point. Without it a
    // clear that failed while the menu was closed would surface its alert on the
    // next open, attached to a tap the person has already left behind.
    setSwitchStatus("idle");
    setOpen(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(ITEM_COUNT - 1);
    }
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close({ restoreFocus: true });
        break;
      case "ArrowDown":
        event.preventDefault();
        focusItem((activeIndex + 1) % ITEM_COUNT);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem((activeIndex - 1 + ITEM_COUNT) % ITEM_COUNT);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(ITEM_COUNT - 1);
        break;
      case "Tab":
        // NOT trapped and NOT prevented — the browser still moves focus per the
        // natural tab order. But focus is handed back to the TRIGGER first,
        // because closing unmounts the focused item and an unmounted node
        // cannot be a tab origin: focus fell to `BODY`, so the next Tab
        // restarted from the top of the document instead of continuing past the
        // menu. Restoring synchronously here means the browser tabs from the
        // trigger, which is where the user actually is.
        close({ restoreFocus: true });
        break;
      default:
        break;
    }
  };

  const itemClass = cn(
    "flex w-full min-h-tap-min items-center gap-2.5 rounded-sm px-3 text-left text-sm",
    "text-text transition-colors duration-fast hover:bg-surface-sunken",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised",
  );

  const menuNameProps = useMemo(
    () => (hasIdentity ? { "aria-labelledby": headerId } : { "aria-label": "Account menu" }),
    [hasIdentity, headerId],
  );

  return (
    // `identity-chip` is kept as the root testid ALONGSIDE `avatar-menu`. It is
    // not legacy debt: the picker e2e recipe, the role-chip meta contract and
    // two component suites all locate the identity control by that name, and a
    // rename would churn four files to say the same thing. The new testid names
    // the mechanism; the old one names the ROLE the control plays, which did not
    // change.
    <div
      ref={containerRef}
      className="relative"
      data-testid="avatar-menu"
      data-slot="identity-chip"
    >
      <button
        ref={triggerRef}
        type="button"
        data-testid="avatar-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close({ restoreFocus: false }) : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        style={{ backgroundColor: avatarColor(name) }}
        className={cn(
          "inline-flex min-h-tap-min min-w-tap-min shrink-0 items-center justify-center",
          "rounded-pill text-sm font-semibold text-white",
          "transition-shadow duration-fast",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
        )}
      >
        <span aria-hidden="true" data-testid="avatar-menu-initials">
          {deriveInitials(name)}
        </span>
      </button>

      {open ? (
        // The POPOVER is the surface; the `role="menu"` element inside it holds
        // ONLY menu items. The identity header is not a menu item, and a
        // non-item child of a `menu` role is invalid ARIA — a reader walking the
        // menu would meet something that is not one of its items. So the header
        // sits beside the menu, not inside it, and the menu is NAMED by it.
        <div
          data-testid="avatar-menu-popover"
          onKeyDown={onMenuKeyDown}
          className={cn(
            // `max-w` is load-bearing: `w-max` is `width: max-content`, which the
            // containing block does NOT clamp, so a long name plus a long role
            // (roles like "A1 / V1 / BO / GAV" are real) runs off the left edge at
            // 390px with no scroll recovery (impeccable P2).
            "absolute right-0 top-[calc(100%+8px)] z-dropdown w-max min-w-56 max-w-[calc(100vw-2rem)] origin-top-right",
            "rounded-md border border-border bg-surface-raised p-1.5 shadow-popover",
            // Enter treatment per DESIGN §5; `motion-reduce` renders it instant
            // rather than removing it, so the reduced-motion path is a real
            // alternative and not an absence.
            "motion-safe:animate-[avatar-menu-in_var(--duration-fast)_var(--ease-out-quart)]",
            "motion-reduce:animate-none",
          )}
        >
          {hasIdentity ? (
            // NOT a menu item — rendered above the item list, outside the
            // traversal order, and the menu's accessible name derives from it.
            <div
              id={headerId}
              // Focusable by script only, never in the tab order. Clicking the
              // header used to drop focus to <body>, outside the popover's
              // `onKeyDown`, so Escape stopped closing the menu (audit P3).
              tabIndex={-1}
              data-testid="avatar-menu-identity"
              data-identity-chip-identity=""
              className="px-3 pb-2 pt-1.5 text-sm"
            >
              <span className="font-semibold text-text-strong">{name}</span>
              {name.trim() !== "" && role.trim() !== "" && (
                <span data-testid="avatar-menu-sr-separator" className="sr-only">
                  {", "}
                </span>
              )}
              {name.trim() !== "" && role.trim() !== "" && (
                <span className="font-medium text-text-subtle" aria-hidden="true">
                  {" · "}
                </span>
              )}
              <span className="font-medium text-text-subtle">{role}</span>
            </div>
          ) : null}

          <div role="menu" data-testid="avatar-menu-items" {...menuNameProps}>
            <button
              // FOCUS IS THE SOURCE OF TRUTH for the roving index, not the
              // last key pressed. Tracking them separately desynchronised on
              // mixed input: open with ArrowUp (index 1), activate this row by
              // POINTER, then press ArrowDown — the index still said 1, so the
              // arrow moved from where the user was not, and the first press
              // read as broken. Anything that focuses an item now says so.
              onFocus={() => setActiveIndex(0)}
              ref={(el) => {
                itemRefs.current[0] = el;
              }}
              type="button"
              role="menuitemcheckbox"
              aria-checked={isDark}
              data-testid="avatar-menu-theme"
              tabIndex={activeIndex === 0 ? 0 : -1}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={itemClass}
            >
              {/*
                The glyph is FIXED (Moon) and the state is carried by a CHECK, not
                by swapping the icon. The standalone ThemeToggle swaps Sun/Moon
                because it is an ACTION button whose affordance is "this is what
                you'll get if you tap" — but this row is a `menuitemcheckbox`
                LABELLED "Dark mode", and a Sun beside that label reads as a
                contradiction while leaving sighted users no visible checked state
                at all (impeccable critique P1). A menu checkbox shows whether it
                IS on; an action button shows what it WILL do. This is the former,
                and `aria-checked` already said so to assistive tech.
              */}
              <Moon aria-hidden="true" className="size-4" />
              <span className="flex-1">Dark mode</span>
              <span
                aria-hidden="true"
                suppressHydrationWarning
                data-testid="avatar-menu-theme-check"
                className={cn("text-accent-on-bg", mounted && isDark ? "visible" : "invisible")}
              >
                <Check className="size-4" />
              </span>
            </button>

            {/*
            `role="none"`: a `<form>` with no accessible name maps to `generic`,
            and a generic child inside `role="menu"` violates ARIA 1.2's
            required-owned-elements (impeccable audit P2). Removing the form is
            not an option — it IS the server-action boundary carrying the route
            inputs — so its role is removed and the submit stays the menu item.
          */}
            <form action={onSwitchSubmit} role="none">
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="shareToken" value={shareToken} />
              <input type="hidden" name="showId" value={showId} />
              <button
                onFocus={() => setActiveIndex(1)}
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                type="submit"
                role="menuitem"
                data-testid="avatar-menu-switch-person"
                data-identity-chip-not-you=""
                aria-label="Switch crew member"
                tabIndex={activeIndex === 1 ? 0 : -1}
                // `aria-disabled`, NEVER the native `disabled` attribute. Native
                // disabled takes the item out of the focus order, and this menu's
                // roving tabindex calls `.focus()` on a FIXED index — so a
                // disabled switch row would swallow ArrowDown, the ArrowUp wrap,
                // End, and reopen-with-ArrowUp, stranding focus outside the menu.
                // The WAI-ARIA menu pattern keeps a disabled item focusable and
                // skips it only for activation; re-entry is guarded in
                // `onSwitchSubmit` instead.
                aria-disabled={switchPending}
                className={cn(
                  itemClass,
                  "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
                )}
              >
                <UserRoundCog aria-hidden="true" className="size-4" />
                Not you? Switch person
              </button>
            </form>
          </div>

          {/*
            OUTSIDE the `role="menu"` element, for the same reason the identity
            header is: an alert is not a menu item, and a non-item child of a
            `menu` role is invalid ARIA. It is not focusable and takes no place
            in the arrow traversal — it is a status, not a destination. The menu
            deliberately stays OPEN behind it, so the retry is one tap away
            rather than three.
          */}
          {switchStatus === "error" ? (
            <div
              role="alert"
              data-testid="avatar-menu-switch-error"
              className="mt-1 rounded-sm border border-border-strong bg-warning-bg px-3 py-2 text-xs/relaxed text-warning-text"
            >
              {messageFor("PICKER_SWITCH_FAILED").crewFacing}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
