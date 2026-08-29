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
import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { PopoverHostContext } from "@/components/admin/HoverHelp";
import { placeWithinVisibleViewport } from "@/lib/popover/place";
import { withNaturalSize } from "@/lib/popover/naturalSize";
import { createRafCoalescer } from "@/lib/popover/rafCoalescer";
import { isVisualViewportEngine } from "@/lib/popover/viewport";
import type { Rect } from "@/lib/popover/position";
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
  /** ESCAPE-TRANSPARENT until the user engages with the panel.
   *
   *  Ratified amendment 2026-08-28 (bl-orch), SCOPING spec §3.5 rather than
   *  negating it. "First Esc closes the menu" presumes a menu the user OPENED;
   *  an auto-opened panel nobody asked for must not spend the user's first
   *  Escape, which is what broke the pre-existing exit-window contract
   *  (`step3-review-modal.interactions.spec.ts`: the modal never closed).
   *  Once the user hovers, focuses, or clicks inside, §3.5 applies as written.
   *  Absent or false → the panel claims Escape immediately, which is correct
   *  for a menu the user opened by pressing the pill. */
  escTransparentUntilEngaged?: boolean;
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
              /* Judgment is HOLLOW, not merely a fainter fill. DESIGN.md's
                 colour-blind floor says a state signal never rides on hue
                 alone, and `sr-only` text is AT-only — on this surface the two
                 tones share a group (spec §4.3 ratifies no split here), so
                 shape has to carry it. The hollow ring is this menu's own
                 existing idiom, already used by the monitoring dot below. */
              dotClassName={
                entry.tone === "judgment"
                  ? "border-[1.5px] border-text-faint bg-transparent"
                  : "bg-status-review"
              }
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
  escTransparentUntilEngaged = false,
  children,
}: AttentionMenuFrameProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Engagement is a REF, not state: it must not re-render the panel, and the
  // listener below reads it at event time rather than closing over a snapshot.
  const engagedRef = useRef(!escTransparentUntilEngaged);
  const [entered, setEntered] = useState(false);
  // The clipping ReviewModalShell panel, which is also the portal target.
  // `ReviewModalShell` provides its own `panelRef` here, so the host rect IS the
  // clip the e2e suites measure. Null host (no provider) degenerates to the body
  // and to viewport bounds, which is the right answer where nothing clips.
  const hostRef = useContext(PopoverHostContext);

  const toRect = (r: DOMRect): Rect => ({
    left: r.left,
    top: r.top,
    right: r.right,
    bottom: r.bottom,
    width: r.width,
    height: r.height,
  });

  // BL-ATTENTION-PANEL-LEFT-OVERFLOW-NARROW. The panel used to size itself with
  // `w-[min(400px,calc(100vw-32px))]` and anchor with `right-0`, i.e. against the
  // VIEWPORT while anchored inside a clip. At phone widths it grew leftwards past
  // the clip's edge (measured -36 on both review modals, at rest). The shared
  // placement core clamps x into the bounds it is given
  // (`lib/popover/position.ts:138-139`), which is the repair; the width cap it
  // also returns is inert here and is written for correctness outside the probe
  // domain rather than because it fires.
  const measureAndApply = useCallback(() => {
    const panel = panelRef.current;
    if (panel === null) return;
    // The ANCHOR is the panel's own offset parent — the pill's wrapper — not the
    // pill. That is what `right-0 top-[calc(100%+8px)]` anchored to before this
    // migration, and reproducing it is the difference between refining the
    // existing geometry and moving it.
    //
    // Anchoring to `pillRef` was tried and is wrong on the VERTICAL axis: the
    // wrapper is taller than the pill (it carries the title block), so a panel
    // hung off the pill's bottom edge sits higher than one hung off the
    // wrapper's, and it then overlays the status strip beneath. Measured: the
    // published toggle became unclickable, with a monitoring row intercepting
    // its pointer events. `pillRef` remains the dismissal inside-set; it is not
    // the placement anchor.
    const anchor = panel.offsetParent;
    if (anchor === null) return;
    const host = hostRef?.current ?? document.body;
    const hostRaw = host === document.body ? null : host.getBoundingClientRect();
    const triggerRect = anchor.getBoundingClientRect();
    if (triggerRect.width <= 0 || triggerRect.height <= 0) return;

    // `withNaturalSize` is handed the PANEL because the panel is what carries the
    // fitted caps. It preserves the scroll offsets of the element it is given, and
    // the element that actually scrolls here is the panel's CHILD — so the child's
    // offset is captured and restored around the measurement explicitly. Clearing
    // the panel's cap reflows the child, and a reflow can clamp a scrolled child to
    // a range that no longer reaches its old position; the helper cannot know that
    // for a descendant.
    const scroller = panel.querySelector<HTMLElement>('[role="group"][tabindex="0"]');
    const heldScrollTop = scroller?.scrollTop ?? 0;
    const placement = withNaturalSize(panel, (probe) => {
      const natural = panel.getBoundingClientRect();
      if (natural.width <= 0 || natural.height <= 0) return null;
      return placeWithinVisibleViewport(window, {
        hostRect: hostRaw === null ? null : toRect(hostRaw),
        trigger: toRect(triggerRect),
        naturalSize: { width: natural.width, height: natural.height },
        wrappedHeightAt: probe.heightAtWidth,
        preferredSide: "bottom",
        align: "right",
        warnKey: panel,
      });
    });
    if (scroller !== null && heldScrollTop !== 0 && scroller.scrollTop !== heldScrollTop) {
      scroller.scrollTop = heldScrollTop;
    }
    if (placement === null) return;
    if (placement.kind === "hidden") {
      panel.style.visibility = "hidden";
      return;
    }
    panel.style.visibility = "";
    // The panel stays IN PLACE in the DOM, so its coordinates are relative to its
    // own offset parent — the pill wrapper — not to the host. The host supplies
    // the BOUNDS and nothing else.
    //
    // It is deliberately NOT portaled into the host, unlike the other consumers
    // of this stack. They portal to escape a clip they would otherwise overhang;
    // this panel no longer overhangs anything, because the placement core clamps
    // it into the host's bounds. Portaling it anyway was tried and REGRESSES
    // KEYBOARD ORDER: the panel becomes a late child of the modal, so Tab from
    // the pill lands on the modal's close button instead of the menu, which the
    // suite pins as an accessibility contract. Sequential focus order follows DOM
    // order, and the focus TRAP being preserved (which portaling into the host
    // does preserve) is a different property from the order within it.
    // The anchor IS the offset parent, so viewport coordinates convert by
    // subtracting its rect.
    const left = placement.viewport.x - triggerRect.left;
    const top = placement.viewport.y - triggerRect.top;
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
    if (placement.maxWidth !== null) panel.style.maxWidth = `${placement.maxWidth}px`;
    else panel.style.removeProperty("max-width");
    if (placement.maxHeight !== null) panel.style.maxHeight = `${placement.maxHeight}px`;
    else panel.style.removeProperty("max-height");
  }, [hostRef]);

  // `entered` is the ONLY re-place signal, and one is enough. The entrance
  // distorts the measured rect — the mount measurement runs before the entrance
  // rAF — so the settled placement needs a second pass. It used to be the
  // `useFitWithinClip` re-apply key and it does the same job here.
  //
  // Deliberately NOT a `transitionend` listener: Tailwind v4 compiles `scale-*`
  // to the INDIVIDUAL `scale` property, which is absent from this panel's
  // `transition-property` (`opacity, transform`), so the geometry change is
  // instant in BOTH motion modes and no transition event for it is ever
  // dispatched. A listener filtered to `transform` would never fire, and under
  // `motion-reduce:transition-none` nothing fires at all.
  useLayoutEffect(() => {
    measureAndApply();
  }, [measureAndApply, entered]);

  useEffect(() => {
    const coalescer = createRafCoalescer(measureAndApply);
    const schedule = () => coalescer.schedule();
    // SELF-ORIGIN FILTER. A capture-phase window scroll listener also hears the
    // panel's own scroller, and every measurement can emit a scroll event from it
    // (clearing the cap reflows the child). Without this the pair feeds itself a
    // re-measure per frame while the operator is scrolling the list. The shared
    // measurement helper documents exactly this hazard and requires the two
    // scroll-listening surfaces to carry the filter.
    const onScrollCapture = (e: Event) => {
      const target = e.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      schedule();
    };
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScrollCapture, { capture: true, passive: true });
    // The visual viewport is a distinct signal from the layout viewport: pinch-zoom
    // and the mobile keyboard move it without firing a window resize. Every other
    // consumer of this stack subscribes to both, and Doug is on a phone.
    const vv = isVisualViewportEngine(window) ? window.visualViewport : null;
    vv?.addEventListener("scroll", schedule);
    vv?.addEventListener("resize", schedule);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const host = hostRef?.current ?? null;
    if (ro !== null) {
      const panelNow = panelRef.current;
      if (panelNow !== null) ro.observe(panelNow);
      if (host !== null) ro.observe(host);
      // THE ANCHOR TOO. Placement is computed against `panel.offsetParent`, so a
      // wrapper that resizes or reflows — a live attention count changing its own
      // width, the title block rewrapping — moves the anchor without resizing
      // either the panel or the host. Observing only those two leaves the written
      // coordinates stale in exactly the case this surface updates live.
      const anchorNow = panelNow?.offsetParent ?? null;
      if (anchorNow !== null && anchorNow !== host && anchorNow !== panelNow) {
        ro.observe(anchorNow);
      }
    }
    return () => {
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", onScrollCapture, { capture: true });
      vv?.removeEventListener("scroll", schedule);
      vv?.removeEventListener("resize", schedule);
      ro?.disconnect();
      coalescer.cancel();
    };
  }, [measureAndApply, hostRef]);

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
      // Not yet engaged: let the key travel to the shell, which closes the
      // modal. The panel goes with it, so nothing is orphaned.
      if (!engagedRef.current) return;
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

  const panel = (
    <div
      ref={panelRef}
      data-testid={testId}
      role="group"
      aria-label={ariaLabel}
      onPointerEnter={() => {
        engagedRef.current = true;
      }}
      onPointerDownCapture={() => {
        engagedRef.current = true;
      }}
      onFocusCapture={() => {
        engagedRef.current = true;
      }}
      // Position is REFINED, not declared. `left`/`top` and the fitted
      // `max-width`/`max-height` are written inline by the placement effect; the
      // `top-[calc(100%+8px)] right-0` here is the CSS FALLBACK that holds until
      // the first placement lands, and it is load-bearing rather than vestigial:
      // a panel whose placement returns early (a zero-area natural measurement
      // before layout settles) would otherwise be `absolute` with no offsets at
      // all, sprawl at its static position, and swallow pointer events over the
      // controls beneath it. Measured: without it, the published toggle became
      // unclickable because a monitoring row sat on top of it.
      //
      // What is GONE is `w-[min(400px,calc(100vw-32px))]`, which sized the panel
      // against the VIEWPORT while it was anchored inside a clip. That is the
      // overhang this arc closes.
      //
      // The 400px NATURAL width is declared and nothing else is: the placement
      // core caps it to the clip's inset bounds when they are narrower, which is
      // the measurement the old `calc(100vw-32px)` was approximating badly. At
      // 375 that yields 359 (the clip's 375 less the 8px inset per side), not the
      // 343 the viewport formula produced — 16px MORE usable width, still fully
      // contained.
      //
      // DIMENSIONAL INVARIANTS. The fitted cap lands on this panel, so the panel
      // must clip and must let its scrolling child shrink: `flex flex-col` to
      // stack heading and scroller, `overflow-hidden` so nothing paints past the
      // cap, and — on the scroller below — `flex-1 min-h-0`, without which a flex
      // item's default `min-height: auto` refuses to shrink below its content and
      // the cap silently does nothing.
      className={`absolute top-[calc(100%+8px)] right-0 z-dropdown flex flex-col overflow-hidden rounded-md border border-border bg-surface-raised shadow-popover origin-top-right transition-[opacity,transform] duration-fast ease-out-quart motion-reduce:transition-none w-[400px] ${
        entered ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      {heading === undefined || heading === null ? null : (
        <div className="shrink-0">{heading}</div>
      )}
      {/* The scroller, not the panel, is the SCROLLABLE REGION: it owns the
          scroll range, and it can overflow with zero focusable descendants (a
          monitoring-only list is entirely read-only rows), so engines cannot be
          relied on to place it in sequential focus order. tabIndex + a nameable
          role fix that. The role is load-bearing, not decorative — a bare div
          maps to `generic`, which is naming-prohibited, so aria-label alone
          would be invalid (spec §4.2). The panel above keeps its own group role
          naming the leading section; this is a second, nested region.

          `max-h-96` stays as the DECLARED cap. The FITTED cap now lands on the
          panel and reaches this element through `flex-1 min-h-0`; whichever of
          the two binds first wins. */}
      <div
        role="group"
        aria-label={scrollerLabel}
        tabIndex={0}
        className="max-h-96 min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-inset"
      >
        {children}
      </div>
    </div>
  );

  // Rendered IN PLACE. `PopoverHostContext` is read for the clip BOUNDS only —
  // see the placement effect for why this consumer does not portal.
  return panel;
}
