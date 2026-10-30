"use client";

/**
 * components/admin/review/unsavedReadings.tsx (warning-card-fixes spec §6.5, R15)
 *
 * A picked reading is a local draft until Save (§6.3). This module keeps one registry
 * per review surface (one per `ReviewModalShell`) that counts the rows holding an
 * unsaved draft, and a `guard` that every control which unmounts the review or replaces
 * its warnings runs its action through:
 *   - `N === 0`: the action runs in the same event and no state is written, so every
 *     guarded control behaves exactly as it did before this module existed;
 *   - `N > 0`: the action waits behind an in-page prompt ("Go back" / "Discard and
 *     continue").
 * While `N > 0` the surface also registers `beforeunload`, so the browser asks before a
 * reload or tab close drops the drafts.
 *
 * The prompt follows `FinalizeBlockerDialog` (components/admin/FinalizeButton.tsx), the
 * one existing dialog that stacks over a review modal: its own portal node, every other
 * body child inert while open (focus snapshot taken BEFORE inerting), the shared
 * `useDialogFocus` trap, and a capture-phase Escape so the review shell never sees it.
 */

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { useDialogFocus } from "@/lib/a11y/dialogFocus";

/** Runs `action` now, or holds it behind the prompt while a reading is unsaved.
 *  `trigger` is the control the operator pressed; focus returns to it. */
export type UnsavedGuard = (action: () => void, trigger: HTMLElement | null) => void;

type Registry = {
  register: (key: object, discard: () => void) => void;
  unregister: (key: object) => void;
  guard: UnsavedGuard;
  /** Synchronous read for paths that must decide inside one event (the drag release). */
  hasUnsaved: () => boolean;
};

const UnsavedReadingsContext = createContext<Registry | null>(null);

/** The body follows N like the title (UI gate P3): one pick, or several. */
export function unsavedPromptBody(n: number): string {
  return n === 1
    ? "Your pick is not saved until you press Save."
    : "Your picks are not saved until you press Save.";
}

export function unsavedPromptTitle(n: number): string {
  return n === 1 ? "You have 1 unsaved reading change" : `You have ${n} unsaved reading changes`;
}

const runNow: UnsavedGuard = (action) => action();

/** The guard for a control inside a review surface; outside one, the action runs. */
export function useUnsavedReadingsGuard(): UnsavedGuard {
  return useContext(UnsavedReadingsContext)?.guard ?? runNow;
}

/** A row provider counts itself while `dirty`; `discard` clears its draft. */
export function useRegisterUnsavedReading(dirty: boolean, discard: () => void): void {
  const registry = useContext(UnsavedReadingsContext);
  const discardRef = useRef(discard);
  useEffect(() => {
    discardRef.current = discard;
  });
  useEffect(() => {
    if (!dirty || registry === null) return;
    const key = {};
    registry.register(key, () => discardRef.current());
    return () => registry.unregister(key);
  }, [dirty, registry]);
}

type Pending = { action: () => void; trigger: HTMLElement | null };

/** The shell's half: the registry it provides, and the prompt it renders. */
export function useUnsavedReadingsRegistry(): {
  registry: Registry;
  prompt: ReactElement | null;
} {
  const entriesRef = useRef(new Map<object, () => void>());
  const [count, setCount] = useState(0);
  const [pending, setPending] = useState<Pending | null>(null);

  const registry = useMemo<Registry>(
    () => ({
      register: (key, discard) => {
        entriesRef.current.set(key, discard);
        setCount(entriesRef.current.size);
      },
      unregister: (key) => {
        entriesRef.current.delete(key);
        setCount(entriesRef.current.size);
      },
      guard: (action, trigger) => {
        if (entriesRef.current.size === 0) {
          action();
          return;
        }
        setPending({ action, trigger });
      },
      hasUnsaved: () => entriesRef.current.size > 0,
    }),
    [],
  );

  // §6.5: `N` reaching 0 while the prompt is open closes it as Go back would; the held
  // action does not run (the operator never confirmed it). Adjusted during render.
  if (pending !== null && count === 0) setPending(null);

  const anyUnsaved = count > 0;
  useEffect(() => {
    if (!anyUnsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Chrome before 119 needs a set returnValue to show its prompt.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [anyUnsaved]);

  const prompt =
    pending !== null && count > 0 ? (
      <UnsavedReadingsPrompt
        count={count}
        trigger={pending.trigger}
        onGoBack={() => setPending(null)}
        onDiscard={() => {
          const held = pending;
          // Unmount the prompt first, so focus returns and the review is no longer
          // inert before an action that may close it starts (§6.5 "Focus return").
          flushSync(() => setPending(null));
          for (const discard of [...entriesRef.current.values()]) discard();
          held.action();
        }}
      />
    ) : null;

  return { registry, prompt };
}

export function UnsavedReadingsScope({
  registry,
  children,
}: {
  registry: Registry;
  children: ReactNode;
}): ReactElement {
  return (
    <UnsavedReadingsContext.Provider value={registry}>{children}</UnsavedReadingsContext.Provider>
  );
}

function UnsavedReadingsPrompt({
  count,
  trigger,
  onGoBack,
  onDiscard,
}: {
  count: number;
  trigger: HTMLElement | null;
  onGoBack: () => void;
  onDiscard: () => void;
}): ReactElement | null {
  const titleId = useId();
  const bodyId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const goBackRef = useRef<HTMLButtonElement>(null);
  // Own portal node (lazy state, as FinalizeBlockerDialog) so the inert pass below can
  // exclude it by identity.
  const [portalEl] = useState<HTMLDivElement | null>(() =>
    typeof document !== "undefined" ? document.createElement("div") : null,
  );
  useEffect(() => {
    if (!portalEl) return;
    document.body.appendChild(portalEl);
    return () => {
      portalEl.remove();
    };
  }, [portalEl]);

  const triggerRef = useRef(trigger);
  useEffect(() => {
    triggerRef.current = trigger;
  }, [trigger]);
  /** Where focus returns on close (§6.5 "Focus return"), handed to useDialogFocus as its
   *  `restoreTargetRef`: the trigger, or, when the trigger has left the document, the
   *  element focused when the prompt opened. Set by the inert cleanup below. */
  const restoreRef = useRef<HTMLElement | null>(null);

  // Background inert. Declared BEFORE useDialogFocus: cleanups run in declaration order,
  // so the background is focusable again (and `restoreRef` points at the right target)
  // before the helper's own restore focuses it. The helper owns the one focus call; a
  // second one here would be overridden by it (UI gate P2).
  useEffect(() => {
    const openedFrom = document.activeElement as HTMLElement | null;
    const changed: { el: Element; hadInert: boolean; priorAriaHidden: string | null }[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === portalEl) continue;
      changed.push({
        el,
        hadInert: el.hasAttribute("inert"),
        priorAriaHidden: el.getAttribute("aria-hidden"),
      });
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
    return () => {
      for (const { el, hadInert, priorAriaHidden } of changed) {
        if (!hadInert) el.removeAttribute("inert");
        if (priorAriaHidden === null) el.removeAttribute("aria-hidden");
        else el.setAttribute("aria-hidden", priorAriaHidden);
      }
      const trigger = triggerRef.current;
      restoreRef.current = trigger && trigger.isConnected ? trigger : openedFrom;
    };
  }, [portalEl]);

  useDialogFocus(panelRef, goBackRef, undefined, { restoreTargetRef: restoreRef });

  // Escape is Go back. Capture phase + stopImmediatePropagation: the review shell's own
  // document Escape listener (bubble phase) must never close the review underneath.
  const goBackLatest = useRef(onGoBack);
  useEffect(() => {
    goBackLatest.current = onGoBack;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      goBackLatest.current();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);

  if (portalEl === null) return null;
  return createPortal(
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-testid="unsaved-readings-prompt"
      className="fixed inset-0 z-overlay flex items-end justify-center sm:items-center sm:p-6"
    >
      {/* Non-interactive scrim: an alertdialog asks for a choice, so a tap outside
          does nothing (FinalizeBlockerDialog's blocking-state backdrop). */}
      <div aria-hidden="true" className="absolute inset-0 bg-overlay-scrim" />
      <div
        ref={panelRef}
        data-testid="unsaved-readings-prompt-panel"
        className="relative flex max-h-[85vh] w-full max-w-md flex-col items-stretch gap-3 overflow-y-auto rounded-t-md bg-bg p-tile-pad text-text shadow-tile sm:rounded-md"
      >
        <h2
          id={titleId}
          data-testid="unsaved-readings-prompt-title"
          className="text-sm font-semibold text-text-strong"
        >
          {unsavedPromptTitle(count)}
        </h2>
        <p id={bodyId} className="text-sm text-text">
          {unsavedPromptBody(count)}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            ref={goBackRef}
            type="button"
            data-testid="unsaved-readings-prompt-go-back"
            onClick={onGoBack}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm bg-accent px-4 text-sm font-semibold whitespace-nowrap text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Go back
          </button>
          <button
            type="button"
            data-testid="unsaved-readings-prompt-discard"
            onClick={onDiscard}
            className="inline-flex min-h-tap-min items-center justify-center rounded-sm border border-text-faint bg-surface px-4 text-sm font-semibold whitespace-nowrap text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Discard and continue
          </button>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
