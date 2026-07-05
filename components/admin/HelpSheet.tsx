"use client";

/**
 * components/admin/HelpSheet.tsx
 *
 * The wizard step-header "?" affordance. A drop-in replacement for the in-flow
 * <HelpTooltip> disclosure (same `label` / `children` / `testId` API) that
 * opens a responsive modal SHEET instead:
 *   - MOBILE  — a bottom sheet (slides up from the bottom edge).
 *   - DESKTOP — a right-anchored SIDE sheet (full-height panel on the right).
 *
 * PORTALED TO <body>. The wizard renders inside app/admin/layout.tsx's
 * <PageTransition>, whose settled inline `transform` opens a new stacking
 * context; a `position: fixed` overlay authored inside it would be sized +
 * clipped to that ancestor's box instead of the viewport. Portaling to <body>
 * lifts the sheet into the root context so `fixed inset-0` means the whole
 * viewport, and z-50 overlays the nav. Mount-gated so the portal never runs on
 * the server.
 *
 * A11y (WCAG 2.4.3 / 2.1.2): the trigger advertises `aria-haspopup="dialog"` +
 * `aria-expanded`; the sheet is `role="dialog" aria-modal` labelled by its
 * title; `useDialogFocus` traps Tab, lands initial focus on the close button,
 * and restores focus to the trigger on close; Escape, the close button, and the
 * backdrop all dismiss. `motion-reduce` disables the slide.
 *
 * The `children` are the same help copy (incl. the "Learn more →" link the
 * help-affordance deep-link walker asserts) the <HelpTooltip> rendered.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";
import { useHasMounted } from "@/lib/a11y/useHasMounted";

export type HelpSheetProps = {
  /** aria-label for the trigger, e.g. "Help: Verify your folder". The sheet's
   *  visible title strips a leading "Help: ". */
  label: string;
  /** Sheet body — the help copy, usually one <p> plus a "Learn more →" link. */
  children: ReactNode;
  /** Test id root; trigger/body/close/backdrop get derived ids. */
  testId?: string;
};

export function HelpSheet({ label, children, testId = "help-sheet" }: HelpSheetProps) {
  const [open, setOpen] = useState(false);
  const mounted = useHasMounted();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Escape dismisses whenever open (focus may be anywhere inside the sheet).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const title = label.startsWith("Help: ") ? label.slice("Help: ".length) : label;

  return (
    // Root carries the affordance testid (the deep-link walker locates + asserts
    // it visible); the portaled sheet lives OUTSIDE it, on <body>.
    <span data-testid={testId} className="inline-flex align-middle">
      <button
        type="button"
        data-testid={`${testId}-trigger`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-pill bg-surface-sunken align-middle text-sm font-semibold text-text-subtle transition-colors duration-fast hover:bg-surface hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
      >
        <span aria-hidden="true">?</span>
      </button>
      {mounted && open
        ? createPortal(
            <HelpSheetOverlay
              testId={testId}
              titleId={titleId}
              title={title}
              dialogRef={dialogRef}
              closeRef={closeRef}
              onClose={() => setOpen(false)}
            >
              {children}
            </HelpSheetOverlay>,
            document.body,
          )
        : null}
    </span>
  );
}

function HelpSheetOverlay({
  testId,
  titleId,
  title,
  dialogRef,
  closeRef,
  onClose,
  children,
}: {
  testId: string;
  titleId: string;
  title: string;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  // Trap focus + restore to the trigger on unmount. Mounted only while open, so
  // the hook's mount/unmount lifecycle matches the sheet's open/close.
  useDialogFocus(dialogRef, closeRef);

  return (
    <div data-testid={`${testId}-overlay`} className="fixed inset-0 z-50">
      <div
        data-testid={`${testId}-backdrop`}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-safe:animate-[step3-details-scrim-in_160ms_ease-out] motion-reduce:animate-none"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={`${testId}-body`}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-2xl border border-border bg-surface text-text shadow-tile motion-safe:animate-[sheet-rise_220ms_cubic-bezier(0.25,1,0.5,1)] motion-reduce:animate-none sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-2xl sm:border-l"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-tile-pad">
          <h2 id={titleId} className="text-base font-semibold text-text-strong">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            data-testid={`${testId}-close`}
            onClick={onClose}
            aria-label="Close help"
            className="-m-1 inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-text-subtle transition-colors duration-fast hover:bg-surface-sunken hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-tile-pad text-sm/relaxed text-text-subtle [&_a]:text-accent-on-bg [&_a]:underline [&_a]:underline-offset-2">
          {children}
        </div>
      </div>
    </div>
  );
}
