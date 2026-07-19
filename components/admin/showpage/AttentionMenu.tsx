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
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Stable handler refs so the document listeners never re-subscribe per render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return;
    }
    const raf = requestAnimationFrame(() => setEntered(true));
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onCloseRef.current();
      pillRef.current?.focus();
    }
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current &&
        e.target instanceof Node &&
        !panelRef.current.contains(e.target) &&
        !pillRef.current?.contains(e.target)
      ) {
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, pillRef]);

  if (!open) return null;

  const actionable = items.filter((i) => i.actionable);
  const clearingCount = items.length - actionable.length;

  return (
    <div
      ref={panelRef}
      data-testid="published-show-review-attention-menu"
      aria-label="Needs your confirmation"
      className={`absolute top-[calc(100%+8px)] right-0 z-20 w-[min(400px,calc(100vw-32px))] origin-top-right rounded-md border border-border bg-surface-raised shadow-lg transition-[opacity,transform] duration-fast ease-out-quart motion-reduce:transition-none ${
        entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      <div className="border-b border-border px-4 pt-3 pb-2">
        <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
          Needs your confirmation
        </span>
      </div>
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
      </div>
      {clearingCount > 0 ? (
        <div className="flex items-center gap-2 border-t border-border bg-surface-sunken px-4 py-2.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
          />
          <span className="text-xs text-text-subtle">
            {clearingCount} more clearing on their own — no action needed
          </span>
        </div>
      ) : null}
    </div>
  );
}
