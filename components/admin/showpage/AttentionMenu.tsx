"use client";

/**
 * components/admin/showpage/AttentionMenu.tsx
 * (published-show-alerts spec §5.2)
 *
 * The "N to confirm" dropdown anchored to the header attention pill. Disclosure
 * pattern, NOT role="menu" (rows are plain buttons; no arrow-key contract).
 * One row per ACTIONABLE item in derivation order; footer names the
 * auto-clearing count so nothing is silently dark. Row click closes FIRST,
 * then navigates (the jump owns the scroll; no exit animation competes with
 * the glide — spec §9).
 *
 * Escape: ReviewModalShell closes the whole dialog on a document-level
 * BUBBLE-phase Escape listener (ReviewModalShell.tsx:238-250). While the menu
 * is open, a document-level CAPTURE-phase handler here claims Escape with
 * preventDefault + stopPropagation — capture at `document` runs before the
 * shell's bubble listener on the same node, and stopping propagation in the
 * capture phase prevents the bubble-phase dispatch — so the first Esc closes
 * only the menu (focus returns to the pill); the second closes the modal.
 *
 * Open motion (spec §9): motion-safe fade+scale via the rail-indicator
 * mount-frame idiom — pre-frame opacity-0 scale-95, flipped on the next rAF;
 * reduced-motion renders instant. Close is instant (unmount).
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { NEEDS_LOOK_CODES, type NeedsLookCode } from "@/lib/adminAlerts/audience";
import { NEEDS_LOOK_HINTS } from "@/lib/admin/needsLookHints";

export type AttentionMenuProps = {
  items: AttentionItem[];
  open: boolean;
  onClose: () => void;
  onNavigate: (item: AttentionItem) => void;
  pillRef: RefObject<HTMLButtonElement | null>;
};

const TONE_DOT: Record<AttentionItem["tone"], { dot: string; srText: string }> = {
  critical: { dot: "bg-status-degraded", srText: "urgent — " },
  notice: { dot: "bg-status-review", srText: "needs review — " },
};

export function AttentionMenu({ items, open, onClose, onNavigate, pillRef }: AttentionMenuProps) {
  if (!open) return null;
  return (
    <AttentionMenuPanel items={items} onClose={onClose} onNavigate={onNavigate} pillRef={pillRef} />
  );
}

/** Mounted only while open — the entrance state and document listeners live on
 *  the panel's own mount lifecycle (no sync setState in effects; re-subscribing
 *  the two document listeners per render is the ReviewModalShell precedent). */
function AttentionMenuPanel({
  items,
  onClose,
  onNavigate,
  pillRef,
}: Omit<AttentionMenuProps, "open">) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    // Entrance flip inside the rAF callback (async — the rail-indicator idiom).
    const raf = requestAnimationFrame(() => setEntered(true));
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
      pillRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current &&
        e.target instanceof Node &&
        !panelRef.current.contains(e.target) &&
        !pillRef.current?.contains(e.target)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, pillRef]);

  const actionable = items.filter((i) => i.actionable);
  // Attention split (spec 2026-07-21 §3.4): needs-look defaults FAIL-VISIBLE —
  // a non-actionable item without clearingKind renders as needs-a-look, never
  // silently dark. Only explicit self_heal items collapse to the summary row.
  const needsLook = items.filter((i) => !i.actionable && i.clearingKind !== "self_heal");
  // `!i.actionable` guard (spec §3.3): a mistagged actionable item renders as an
  // actionable row only — never double-counted into the monitoring summary.
  const selfHealCount = items.filter((i) => !i.actionable && i.clearingKind === "self_heal").length;
  // A needs-look-only open (interactive pill without actionable rows) must not
  // render an empty "Needs your confirmation" section; the panel takes its
  // accessible name from the first group actually present.
  const hasActionable = actionable.length > 0;

  return (
    <div
      ref={panelRef}
      data-testid="published-show-review-attention-menu"
      role="group"
      aria-label={hasActionable ? "Needs your confirmation" : "Needs a look"}
      className={`absolute top-[calc(100%+8px)] right-0 z-20 w-[min(400px,calc(100vw-32px))] origin-top-right rounded-md border border-border bg-surface-raised shadow-lg transition-[opacity,transform] duration-fast ease-out-quart motion-reduce:transition-none ${
        entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {hasActionable ? (
        <div className="border-b border-border px-4 pt-3 pb-2">
          <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
            Needs your confirmation
          </span>
        </div>
      ) : null}
      <div className="max-h-96 overflow-y-auto">
        {actionable.map((item) => {
          const tone = TONE_DOT[item.tone];
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`attention-menu-row-${item.id}`}
              onClick={() => {
                onClose();
                onNavigate(item);
              }}
              className="flex min-h-tap-min w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-fast last:border-b-0 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
            >
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-pill ${tone.dot}`} />
              <span className="sr-only">{tone.srText}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-strong">
                  {item.menuTitle}
                </span>
                {item.menuSubtitle ? (
                  <span className="block truncate text-xs text-text-subtle">
                    {item.menuSubtitle}
                  </span>
                ) : null}
              </span>
              <span aria-hidden="true" className="shrink-0 text-sm text-text-subtle">
                →
              </span>
            </button>
          );
        })}
        {/* The scroll boundary wraps ALL groups (whole-diff review 2026-07-22):
            12 needs-look rows are producible; links below the fold must scroll
            into reach, not extend past the viewport. */}
        {needsLook.length > 0 ? (
          /* Needs-a-look group (spec §3.4.2): read-only rows — the ONLY interactive
           descendant is the action <a> (when the action resolved). No row-level
           onNavigate, no nested popover (the menu is itself a floating layer). */
          <div className={hasActionable ? "border-t border-border" : undefined}>
            {/* rounded-t when this group leads the panel (no confirmation section
              above): the sunken header must not bleed past the rounded border. */}
            <div
              className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasActionable ? "" : "rounded-t-md"}`}
            >
              <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                Needs a look
              </span>
            </div>
            {needsLook.map((item) => {
              const code = item.kind === "alert" ? item.alert.code : null;
              const hint =
                code && NEEDS_LOOK_CODES.has(code) ? NEEDS_LOOK_HINTS[code as NeedsLookCode] : null;
              const action = item.kind === "alert" ? item.alert.action : null;
              return (
                <div
                  key={item.id}
                  data-testid={`attention-needslook-row-${item.id}`}
                  className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-2 shrink-0 rounded-pill border-[1.5px] border-status-review bg-transparent"
                  />
                  {/* sr-only tone text mirrors the dot (spec §3.4.2), same string
                    the actionable rows use for the notice tone. */}
                  <span className="sr-only">{TONE_DOT.notice.srText}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-strong">
                      {item.menuTitle}
                    </span>
                    {hint ? (
                      <span className="block text-xs/relaxed text-text-subtle">{hint}</span>
                    ) : null}
                    {action ? (
                      /* Menu-close on activation (spec §3.4): a same-route hash link
                       activated inside the open dropdown would scroll its target
                       behind the menu; external links close too, for consistency. */
                      <a
                        href={action.href}
                        onClick={() => onClose()}
                        {...(action.external
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="mt-1 inline-flex min-h-tap-min min-w-0 items-center truncate text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised focus-visible:outline-none"
                      >
                        {action.label}
                        {action.external ? <span aria-hidden="true"> ↗</span> : null}
                      </a>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : null}
        {selfHealCount > 0 ? (
          /* Monitoring group (spec §3.4.3): quiet subheading + one summary row,
           items not enumerated — genuinely self-healing, nothing to act on.
           Copy is TRUE for this subset. */
          <div className="border-t border-border">
            <div className="bg-surface-sunken px-4 pt-2.5 pb-1.5">
              <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
                Monitoring
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-b-md bg-surface-sunken px-4 pb-2.5">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
              />
              <span className="text-xs text-text-subtle">
                {selfHealCount} clearing on their own, no action needed
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
