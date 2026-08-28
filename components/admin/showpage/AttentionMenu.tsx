"use client";

/**
 * components/admin/showpage/AttentionMenu.tsx
 * (published-show-alerts spec §5.2)
 *
 * The "N issues" dropdown anchored to the header attention pill. Disclosure
 * pattern, NOT role="menu" (rows are plain buttons; no arrow-key contract).
 *
 * The panel is an INDEX of a show's issues (attention-index §1): each entry
 * points at one issue, whose full card renders where it is most relevant in the
 * modal. TWO groups — "Needs you" (every row pressable, jump-only) and
 * "Monitoring" (read-only rows: title + auto-resolve note,
 * monitoring-badge-expand §3.2) — so nothing is silently dark. Row click closes
 * FIRST,
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
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useFitWithinClip } from "@/components/admin/useFitWithinClip";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import { reviewWarningTitle } from "@/lib/admin/reviewWarningTitle";
import type { WarningAttentionEntry } from "@/lib/admin/warningAttention";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ParseWarning } from "@/lib/parser/types";
import { autoResolveNote, NEEDS_LOOK_CODES, type NeedsLookCode } from "@/lib/adminAlerts/audience";
import { NEEDS_LOOK_HINTS } from "@/lib/admin/needsLookHints";
import { cn } from "@/lib/ui/cn";

/** One indexed sheet warning. `reportSurfaceId` is content-derived, so two
 *  identical warnings in a section share an `id` (spec §10) — which is why the
 *  row testid and React key carry the entry's POSITION as well. */
export type SheetWarningEntry = WarningAttentionEntry<{
  id: string;
  sectionId: SectionId;
  warning: ParseWarning;
  reportSurfaceId: string;
}>;

export type AttentionMenuProps = {
  items: AttentionItem[];
  open: boolean;
  onClose: () => void;
  onNavigate: (item: AttentionItem) => void;
  pillRef: RefObject<HTMLButtonElement | null>;
  /** ABSENT → the panel is byte-identical to the alerts-only menu (spec §4.3).
   *  Entries and their handler travel together so the type cannot express a
   *  list of rows with nothing to do when one is clicked. */
  warningIndex?: {
    entries: readonly SheetWarningEntry[];
    onNavigate: (entry: SheetWarningEntry) => void;
  };
};

const TONE_DOT: Record<AttentionItem["tone"], { dot: string; srText: string }> = {
  critical: { dot: cn("bg-status-degraded"), srText: "urgent: " },
  notice: { dot: cn("bg-status-review"), srText: "needs review: " },
};

export type AttentionMenuFrameProps = {
  /** Panel testid. The published menu and the wizard menu are distinct surfaces. */
  testId: string;
  /** Accessible name of the panel — the leading group actually present. */
  ariaLabel: string;
  /** Accessible name of the nested scrollable region. */
  scrollerLabel: string;
  pillRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  /** Rendered ABOVE the scroller, so it labels the panel while a long list
   *  scrolls under it. Omit for a panel whose leading group heading scrolls. */
  heading?: ReactNode;
  children: ReactNode;
};

export type AttentionMenuRowProps = {
  testId: string;
  /** Tailwind background class for the tone dot. */
  dotClassName: string;
  /** Second channel for the tone, read before the title (WCAG 1.4.1). */
  srText: string;
  title: string;
  secondLine: string | null;
  /** False when the second line is a fix hint, which must wrap in full. */
  truncateSecondLine: boolean;
  onSelect: () => void;
};

export function AttentionMenu({
  items,
  open,
  onClose,
  onNavigate,
  pillRef,
  warningIndex,
}: AttentionMenuProps) {
  if (!open) return null;

  // attention-index §2.1: TWO groups. `monitoring` is the former self-heal
  // filter verbatim; `needsYou` is its complement, which preserves the
  // FAIL-VISIBLE default (spec 2026-07-21 §3.4) for free — a non-actionable
  // item with no clearingKind lands in needsYou, never silently dark.
  // The `!i.actionable` guard lives inside the monitoring predicate (spec §3.3),
  // so a mistagged actionable item is counted once, in needsYou only.
  const monitoring = items.filter((i) => !i.actionable && i.clearingKind === "self_heal");
  const needsYou = items.filter((i) => !(!i.actionable && i.clearingKind === "self_heal"));
  // Ordering needs no sort: deriveAttentionItems already returns
  // [...holds, ...actionable, ...needsLook, ...selfHeal], so the merged group
  // is button-clearable-first for free (§2.1 "Ordering is unchanged").
  // A monitoring-only open must not render an empty "Needs you" section; the
  // panel takes its accessible name from the first group actually present.
  const hasNeedsYou = needsYou.length > 0;
  const sheetWarningRows = warningIndex?.entries ?? [];

  return (
    <AttentionMenuFrame
      testId="published-show-review-attention-menu"
      ariaLabel={
        hasNeedsYou ? "Needs you" : sheetWarningRows.length > 0 ? "Sheet warnings" : "Monitoring"
      }
      scrollerLabel="Attention items"
      pillRef={pillRef}
      onClose={onClose}
      heading={
        /* Heading placement is PRESERVED, not normalised (attention-index §2.1):
           this one stays OUTSIDE the scroller, so it labels the panel while a
           long needs-you list scrolls under it. The testid is on the CONTAINER
           — that is the element whose whole block unmounts on the O1<->O2
           collapse, and the transition audit targets it. */
        hasNeedsYou ? (
          <div
            data-testid="attention-needsyou-heading"
            className="border-b border-border px-4 pt-3 pb-2"
          >
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
              Needs you
            </span>
          </div>
        ) : undefined
      }
    >
      {needsYou.map((item) => {
        const tone = TONE_DOT[item.tone];
        const code = item.kind === "alert" ? item.alert.code : null;
        // Fix hint when the code has one; otherwise the item's identity text.
        // NEVER both (§2.2 second-line rule) — the hint is the more actionable
        // of the two, so it wins wherever it exists.
        const hint =
          code && NEEDS_LOOK_CODES.has(code) ? NEEDS_LOOK_HINTS[code as NeedsLookCode] : null;
        const secondLine = hint ?? item.menuSubtitle;
        return (
          <AttentionMenuRow
            key={item.id}
            testId={`attention-menu-row-${item.id}`}
            dotClassName={tone.dot}
            srText={tone.srText}
            title={item.menuTitle}
            secondLine={secondLine}
            truncateSecondLine={hint === null}
            onSelect={() => {
              onClose();
              onNavigate(item);
            }}
          />
        );
      })}
      {sheetWarningRows.length > 0 ? (
        /* Sheet warnings (spec §4.3): an index of the sheet's own parse
           warnings, between the alert rows and the monitoring rows. Same row
           component as Needs you, so the two can never drift apart visually. */
        <div data-testid="attention-sheetwarnings-group">
          <div
            data-testid="attention-sheetwarnings-heading"
            className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasNeedsYou ? "border-t border-border" : "rounded-t-md"}`}
          >
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
              Sheet warnings
            </span>
          </div>
          {sheetWarningRows.map((entry, i) => (
            <AttentionMenuRow
              key={`${entry.id}:${i}`}
              testId={`attention-menu-row-${entry.id}-${i}`}
              dotClassName={entry.tone === "judgment" ? "bg-text-faint" : "bg-status-review"}
              srText={entry.tone === "judgment" ? "judgment call: " : "needs review: "}
              title={reviewWarningTitle(entry.warning)}
              secondLine={entry.sectionLabel}
              truncateSecondLine
              onSelect={() => {
                onClose();
                warningIndex!.onNavigate(entry);
              }}
            />
          ))}
        </div>
      ) : null}
      {monitoring.length > 0 ? (
        /* Monitoring group (monitoring-badge-expand §3.2): one read-only row
           per item - title + auto-resolve note. No interactive descendants,
           no transitions (§3.4: instant; computed-style pinned in e2e). */
        <div
          data-testid="attention-monitoring-group"
          className={
            hasNeedsYou || sheetWarningRows.length > 0 ? "border-t border-border" : undefined
          }
        >
          {/* rounded-t when this group leads the panel: the sunken header must
              not bleed past the rounded border. Testid on the CONTAINER, per
              the needs-you heading above. */}
          <div
            data-testid="attention-monitoring-heading"
            className={`bg-surface-sunken px-4 pt-2.5 pb-1.5 ${hasNeedsYou || sheetWarningRows.length > 0 ? "" : "rounded-t-md"}`}
          >
            <span className="text-xs font-semibold uppercase tracking-eyebrow text-text-subtle">
              Monitoring
            </span>
          </div>
          {monitoring.map((item) => (
            <div
              key={item.id}
              data-testid={`attention-monitoring-row-${item.id}`}
              className="flex items-start gap-3 border-b border-border px-4 py-3 last:border-b-0"
            >
              <span
                aria-hidden="true"
                className="mt-1.5 size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
              />
              <span className="sr-only">monitoring, </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-text-strong">
                  {item.menuTitle}
                </span>
                <span className="block text-xs/relaxed text-text-subtle">
                  {autoResolveNote(item.kind === "alert" ? item.alert.code : "__none__")}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </AttentionMenuFrame>
  );
}

/** One pressable index row: tone dot, title, optional second line, jump chevron.
 *  Exported so the wizard's warning index renders the SAME row rather than a
 *  visual copy that drifts (spec §5). */
export function AttentionMenuRow({
  testId,
  dotClassName,
  srText,
  title,
  secondLine,
  truncateSecondLine,
  onSelect,
}: AttentionMenuRowProps) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onSelect}
      className="flex min-h-tap-min w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors duration-fast last:border-b-0 hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
    >
      <span aria-hidden="true" className={`size-2 shrink-0 rounded-pill ${dotClassName}`} />
      <span className="sr-only">{srText}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-strong">{title}</span>
        {secondLine ? (
          <span
            className={`block text-xs/relaxed text-text-subtle ${truncateSecondLine ? "truncate" : ""}`}
          >
            {secondLine}
          </span>
        ) : null}
      </span>
      <span aria-hidden="true" className="shrink-0 text-sm text-text-subtle">
        →
      </span>
    </button>
  );
}

/** Mounted only while open — the entrance state and document listeners live on
 *  the frame's own mount lifecycle (no sync setState in effects; re-subscribing
 *  the two document listeners per render is the ReviewModalShell precedent).
 *  Exported so the wizard's warning index reuses the overlay chrome, dismissal
 *  contract and clip fit rather than re-implementing them (spec §5). */
export function AttentionMenuFrame({
  testId,
  ariaLabel,
  scrollerLabel,
  pillRef,
  onClose,
  heading,
  children,
}: AttentionMenuFrameProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [entered, setEntered] = useState(false);
  // Re-apply key is the entrance flag: the scale-95 entrance distorts the
  // measured rect, and the mount measurement runs before the entrance rAF, so
  // the settled cap needs a second pass (spec §4.2).
  const fitRef = useFitWithinClip(entered);

  // Entrance flip inside the rAF callback (async — the rail-indicator idiom).
  // MOUNT-SCOPED, deliberately separate from the listener effect below (whole-diff
  // review 2026-07-25): `onClose` is a fresh closure on every parent render, so a
  // combined effect re-runs on each one — cancelling the pending entrance frame
  // and scheduling a replacement. Mid-entrance that RESTARTS the entrance, which
  // §4's compound row says must not happen, and under rapid live updates it can
  // starve the flip entirely. An empty dep list ties the frame to the panel's own
  // mount lifecycle, which is what the contract actually describes.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
      pillRef.current?.focus();
    }
    /** Inside-set (spec §3.4): the panel's descendants, and the pill. */
    const isOutside = (target: EventTarget | null) =>
      panelRef.current !== null &&
      target instanceof Node &&
      !panelRef.current.contains(target) &&
      !pillRef.current?.contains(target);
    function onPointerDown(e: PointerEvent) {
      if (isOutside(e.target)) onClose();
    }
    // Keyboard parity with click-outside (spec §3.4): tabbing out of the menu
    // should not leave a floating panel behind. focusin (not blur/focusout):
    // window blur has no in-document successor, and dismissing on it would close
    // the menu whenever the operator switched apps or focused the URL bar.
    function onFocusIn(e: FocusEvent) {
      if (isOutside(e.target)) onClose();
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [onClose, pillRef]);

  return (
    <div
      ref={panelRef}
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      className={`absolute top-[calc(100%+8px)] right-0 z-dropdown w-[min(400px,calc(100vw-32px))] origin-top-right rounded-md border border-border bg-surface-raised shadow-popover transition-[opacity,transform] duration-fast ease-out-quart motion-reduce:transition-none ${
        entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {heading ?? null}
      {/* The scroller, not the panel, is the SCROLLABLE REGION: it owns the
          scroll range, and it can overflow with zero focusable descendants (a
          monitoring-only list is entirely read-only rows), so engines cannot be
          relied on to place it in sequential focus order. tabIndex + a nameable
          role fix that. The role is load-bearing, not decorative — a bare div
          maps to `generic`, which is naming-prohibited, so aria-label alone
          would be invalid (spec §4.2). The panel above keeps its own group role
          naming the leading section; this is a second, nested region.
          `useFitWithinClip` caps max-h-96 against the review-modal panel's clip
          edge; `entered` is the re-apply key so the cap is re-measured once the
          scale-95 entrance has settled (spec §4.2). */}
      <div
        ref={fitRef}
        role="group"
        aria-label={scrollerLabel}
        tabIndex={0}
        className="max-h-96 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
      >
        {children}
      </div>
    </div>
  );
}
