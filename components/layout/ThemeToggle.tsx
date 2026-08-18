"use client";

/**
 * components/layout/ThemeToggle.tsx — the only `'use client'` boundary in
 * the page-chrome footer (impeccable v3 critique Finding 4 wire-up).
 *
 * Why a client island:
 *
 *   The toggle reads `<html data-theme>` (set pre-hydration by the
 *   no-FOUC inline script in `app/layout.tsx`), localStorage, and
 *   `prefers-color-scheme` to render the icon for the OPPOSITE theme
 *   (affordance: "this is what you'll get if you tap"). Click flips
 *   `<html data-theme>` and writes localStorage. None of that is
 *   server-renderable.
 *
 * No-FOUC handshake:
 *
 *   The inline script in `app/layout.tsx` runs synchronously before
 *   React hydrates and stamps `<html data-theme="…">` from localStorage
 *   when present. This component reads that dataset attribute on mount
 *   so the rendered icon agrees with the already-applied theme — no
 *   visual flash, no hydration mismatch. That read lives in
 *   `useAppliedTheme` now, shared with the header avatar menu: we render
 *   an SSR-stable Moon placeholder and the hook swaps to the correct icon
 *   on the first client tick; `aria-label` and `aria-pressed` are the
 *   source of truth for the accessibility tree.
 *
 * Hydration mismatch handling:
 *
 *   The button markup is stable across SSR + CSR (same role, same
 *   onClick, same aria-pressed=false initial). The icon swap inside is
 *   suppressed via `suppressHydrationWarning` on the icon-bearing span
 *   so React doesn't warn when an OS dark-mode user lands and the post-
 *   mount icon differs from the SSR fallback.
 *
 * DESIGN.md compliance:
 *
 *   • Tap target ≥44×44px via `min-h-tap-min min-w-tap-min`
 *     (DESIGN.md §3 spacing-tap-min token,
 *     globals.css line 75).
 *   • All colors via tokens — `border-text-faint`, `bg-surface`,
 *     `text-text`, `hover:bg-surface-raised`, `hover:text-text-strong`.
 *     No hex literals.
 *   • Focus ring via `--color-focus-ring` token.
 *   • Sun/Moon glyphs via lucide-react (ratified at distill;
 *     package.json:lucide-react ^1.14.0). `aria-hidden="true"` keeps
 *     them out of the AT tree — `aria-label` carries the meaning.
 */

import { Moon, Sun } from "lucide-react";

import { readAppliedTheme, THEME_PERSIST_FAILED_NOTE, useAppliedTheme } from "./useAppliedTheme";

/**
 * The standalone theme control.
 *
 * Since 2026-08-09 this is the IDENTITY-LESS form: crew pages with a resolved
 * identity carry the switch inside the header avatar menu instead (UI spec
 * §2.3), and admin surfaces keep their own instance. The dataset/localStorage
 * handshake it used to own now lives in `useAppliedTheme` so the two controls
 * cannot drift apart on what "dark" means.
 */
export function ThemeToggle() {
  const { mounted, theme, isDark, persistFailed, setTheme } = useAppliedTheme();
  void theme;

  function flip() {
    // READ THE DOM AT CLICK TIME when the mount effect has not run yet. Round 1
    // stopped this control from CLAIMING a state pre-mount; review R3 found it
    // still ACTING on one. The placeholder is `light`, so on an OS-dark first
    // paint a tap landing between hydration and the effect called
    // `setTheme("dark")` on a page that was already dark: nothing changed, and
    // nothing was said. `readAppliedTheme()` is the same resolver the effect
    // uses, and the `data-theme` it reads is written pre-hydration by the
    // no-FOUC script, so it is authoritative at every instant this can run.
    const current = mounted ? (isDark ? "dark" : "light") : readAppliedTheme();
    setTheme(current === "dark" ? "light" : "dark");
  }

  return (
    /*
      WRAPPER, and its in-flow box is exactly the button's box. The note has to
      appear beside a control that lives in three differently-engineered rows —
      the identity-less crew header, the admin nav's width-engineered 320px
      action cluster, and the help header, where a trailing "Back to admin" link
      sits to the toggle's right. In-flow side text would displace all three, so
      the note is an ANCHORED BUBBLE out of the flow entirely (spec §2.2) and no
      consumer's row grows, wraps, or overflows.
    */
    <span className="relative inline-flex">
      <button
        type="button"
        data-testid="theme-toggle"
        /*
        PRE-HYDRATION THIS CONTROL DOES NOT CLAIM A STATE. The SSR-stable
        placeholder is `light`, but the no-FOUC script has already painted the
        palette from the OS — so on an OS-dark first paint the page rendered
        dark while this button announced "Switch to dark theme" with
        `aria-pressed="false"`, offering to do what it had already done
        (measured: stored=null, os=dark, page dark, control said pressed=false).

        Until mounted the label names the control rather than a transition, and
        `aria-pressed` is omitted rather than sent as `false`: absent is honest
        about a state we do not yet know, whereas `false` is a wrong claim. One
        React tick later the real state arrives.
      */
        /*
        ONE SEMANTIC MODEL, not two. This carried a NEXT-ACTION name ("Switch to
        light theme") together with `aria-pressed` reporting CURRENT state, so a
        screen reader in dark mode announced "Switch to light theme, pressed" —
        the name says the button will make it light, the state says light is
        already on. Review R4 probed it: `name="Switch to light theme"
        pressed=true`.

        Resolved toward the toggle model, matching the sibling control: the
        avatar menu's theme row is a `menuitemcheckbox` with a stable label and
        a checked state, so the two now speak the same way about the same thing.
        The name is the THING being toggled; `aria-pressed` is whether it is on.
        Pre-mount the state is unknown, so `aria-pressed` is still omitted
        rather than guessed.
      */
        aria-label="Dark mode"
        {...(mounted ? { "aria-pressed": isDark } : {})}
        onClick={flip}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-text-faint bg-surface text-text transition-colors duration-fast hover:bg-surface-raised hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        {/*
          Show the icon for the OTHER theme — affordance is "this is
          what you'll get if you tap." Pre-mount we render Moon as the
          SSR-stable placeholder; post-mount we swap based on the
          actually-applied theme. suppressHydrationWarning silences the
          expected SSR/CSR icon divergence for OS-dark-mode visitors.
        */}
        <span aria-hidden="true" suppressHydrationWarning>
          {mounted && isDark ? (
            <Sun className="size-4" aria-hidden="true" />
          ) : (
            <Moon className="size-4" aria-hidden="true" />
          )}
        </span>
      </button>
      {/*
        ALWAYS MOUNTED, text conditional — never inserted at failure time. A
        `role="status"` node that arrives WITH its message announces nothing;
        this repo measured exactly that on an inserted status card
        (components/admin/ReSyncButton.tsx:147), and the always-mounted shape is
        the one that works (FinalizeAnnouncer, components/admin/FinalizeButton.tsx:549).

        The container carries POSITIONING ONLY, so an empty region paints
        nothing on every page that renders the toggle; the chrome rides on the
        inner span that exists only when there is something to say. `max-w-36`
        is derived, not chosen: in the help header at 320px the toggle is not
        the rightmost element, so a right-anchored bubble must stay under about
        161px to keep its left edge inside the page padding.
      */}
      <span
        role="status"
        data-testid="theme-persist-note"
        className="absolute right-0 top-full mt-1 w-max max-w-36 wrap-break-word z-dropdown"
      >
        {persistFailed ? (
          <span className="block rounded-sm border border-border bg-surface-raised px-2.5 py-1.5 text-right text-xs/relaxed text-text-subtle shadow-tile">
            {THEME_PERSIST_FAILED_NOTE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
