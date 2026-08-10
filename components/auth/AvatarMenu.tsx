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
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Moon, Sun, UserRoundCog } from "lucide-react";

import { deriveInitials } from "@/components/atoms/Avatar";
import { avatarColor } from "@/lib/crew/avatarColor";
import { cn } from "@/lib/ui/cn";
import { useAppliedTheme } from "@/components/layout/useAppliedTheme";

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
   * module cannot declare one.
   */
  clearAction: (formData: FormData) => void | Promise<void>;
};

/** The menu's items, in DOM order — the order arrow keys traverse. */
const ITEM_COUNT = 2;

export function AvatarMenu({ name, role, slug, shareToken, showId, clearAction }: AvatarMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const { mounted, isDark, setTheme } = useAppliedTheme();

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
        // NOT trapped, and not prevented: the menu closes and the browser moves
        // focus per the natural tab order.
        close({ restoreFocus: false });
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
            "absolute right-0 top-[calc(100%+8px)] z-20 w-max min-w-56 origin-top-right",
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
              <span aria-hidden="true" suppressHydrationWarning className="inline-flex">
                {mounted && isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </span>
              Dark mode
            </button>

            <form action={clearAction}>
              <input type="hidden" name="slug" value={slug} />
              <input type="hidden" name="shareToken" value={shareToken} />
              <input type="hidden" name="showId" value={showId} />
              <button
                ref={(el) => {
                  itemRefs.current[1] = el;
                }}
                type="submit"
                role="menuitem"
                data-testid="avatar-menu-switch-person"
                data-identity-chip-not-you=""
                aria-label="Switch crew member"
                tabIndex={activeIndex === 1 ? 0 : -1}
                className={itemClass}
              >
                <UserRoundCog aria-hidden="true" className="size-4" />
                Not you? Switch person
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
