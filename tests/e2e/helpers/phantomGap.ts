/**
 * tests/e2e/helpers/phantomGap.ts — the zero-extent-flex-item probe, extracted
 * so it can be pointed at any rendered tree (BL-PHANTOM-GAP-PROBE-OTHER-SURFACES).
 *
 * THE BUG CLASS. A wrapper that ALWAYS renders but whose entire content is
 * state-gated becomes a ZERO-EXTENT flex/grid item when the gate is false. A
 * zero-extent item is invisible, but it is still an item: its parent's `gap` is
 * charged for it, so the surface shows a seam no element accounts for. Reported
 * against the published modal's Overview section (`overview-sheet-sync`, a full
 * 32px on every non-archived show); the same run also surfaced `ScheduleDayRow`'s
 * time grid at 4px per entry-less day, which the bug report never mentioned. Both
 * are now fixed with the `empty:hidden` idiom (DESIGN.md §7a).
 *
 * WHY A REAL BROWSER. jsdom computes no layout, so the empty wrapper has no box
 * and no gap either way; a class-presence assertion would only restate the fix.
 * A static source sweep is not a substitute either: the `{items.map(...)}` form
 * leaves no textual trace when the array is empty, and that is exactly the shape
 * the ScheduleDayRow instance took.
 *
 * WHAT IT IS AND IS NOT. A REGRESSION DETECTOR for one bug class in one tree, not
 * a general proof that no gap is ever mischarged. Zero item extent is a PROXY for
 * "this item contributes nothing but is charged a gap," and the proxy has
 * documented limits, listed so a green run is not read as more than it is:
 *   - GENERATED BOXES. `::before` / `::after` can be flex/grid items and can
 *     charge gaps, and `el.children` cannot enumerate them. Out of reach for this
 *     mechanism entirely.
 *   - GRID TRACKS vs GRID ITEMS. Grid gaps sit between TRACKS. An empty item
 *     stretched across a non-zero track has a positive rect while its unwanted
 *     track and adjacent gaps remain — a false green this probe cannot see.
 *     Catching it needs computed track sizes, which is a different tool.
 *   - LINE MEMBERSHIP IN A WRAPPED CONTAINER, on BOTH axes. Admission counts the
 *     container's items, but a wrapped container's gaps are realized per LINE.
 *     Cross axis: the probe cannot tell whether a zero-extent item sits alone on
 *     its own line (where it does collapse a line and charge a gap) or shares one
 *     with siblings (where it does not). Main axis: an item that wrapped onto a
 *     line BY ITSELF has no neighbor on that line, so no main-axis gap is charged
 *     for it, yet the container-wide item count still admits the axis. Both are
 *     false-RED directions — it reports and lets the reader judge. Staying silent
 *     on wrapped containers is how the ScheduleDayRow instance would have been
 *     missed, and a false red is loud while a false green is not.
 *   - ANONYMOUS TEXT ITEMS CANNOT BE OFFENDERS. Non-whitespace text directly
 *     inside a flex/grid container generates an anonymous item, which is COUNTED
 *     toward admission but has no element to measure. A zero-size one (e.g. under
 *     `font-size: 0`) charges a gap the probe cannot attribute — the same shape as
 *     the generated-box limit, and out of reach for the same reason.
 *   - COLLAPSED `auto-fit` TRACKS. Gutters adjoining an empty `repeat(auto-fit,…)`
 *     track collapse with it, but the used track list still reports those tracks,
 *     so a grid axis can be admitted where no gap is realized — a false red. Left
 *     as-is deliberately: filtering zero-width tracks out would also drop
 *     legitimately zero-sized EXPLICIT tracks, whose gutters do NOT collapse,
 *     turning a loud false red into a silent false green. No `auto-fit` /
 *     `auto-fill` exists in this codebase today.
 *   - TRANSFORMED SVG / MathML. Those elements have no `offset*` metric, so a
 *     zero rect is reported only when NO transform of any kind is set (see
 *     `vanishes`). A genuinely zero-size one carrying any `transform` / `scale` /
 *     `rotate` / `translate` therefore goes unreported — a false green, accepted
 *     because the alternative (decomposing the matrix) is defeated by individual
 *     transform properties, `matrix3d`, and rotations of degenerate boxes.
 *   - CYCLIC PERCENTAGE GAPS. A percentage gap resolves against the container's
 *     own content box on that axis, and when that size depends on the content
 *     (an auto-height column flex with `row-gap: 10%`) the used gap is ZERO. The
 *     helper reads the POST-layout box, so it would derive a positive gap there
 *     and could report a zero-extent child that charges nothing. Detecting the
 *     cycle needs the specified size, not the used one. No percentage gap exists
 *     in this codebase; the branch-coverage spec pins the non-cyclic cases.
 *   - THE LIGHT DOM, NOT THE FLAT TREE. The walk uses `parentElement` and
 *     `querySelectorAll`, so it does not cross shadow boundaries: a hidden shadow
 *     HOST above the root is invisible to the suppression walks, descendant
 *     shadow trees are never entered, and slot ASSIGNED nodes are not measured
 *     (only fallback children). This codebase has no shadow DOM — `attachShadow`
 *     appears nowhere under `app/`, `components/`, or `lib/`.
 *
 * DESIGN DECISIONS, each answering a specific way the naive version was wrong:
 *   - AXIS SELECTION follows the container. A flex column charges `row-gap`
 *     against zero HEIGHT; a flex row charges `column-gap` against zero WIDTH
 *     (`startsWith("column")` handles `column-reverse` and `row-reverse`).
 *     WRAPPED containers charge BOTH: a full-width zero-height item on its own
 *     line in a wrapped row collapses that line and still pays `row-gap`. Grid
 *     charges both unconditionally.
 *   - AXIS ADMISSION IS PER LAYOUT MODE. A gapped FLEX container holding ONE item
 *     realizes no gap, so its lone zero-size child is not an offender. A GRID is
 *     admitted on TRACK count alone, never on item count: grid gaps sit strictly
 *     between tracks, so one item can realize several gaps and — the direction
 *     that actually bit — many items can realize NONE. Admitting a grid axis on
 *     `itemCount >= 2` reported the admin dashboard's `shows-table-header` (7
 *     items, 7 column tracks, `rows=[44px]` — a SINGLE row track) as charging its
 *     16px row-gap for the trailing spacer span. It charges nothing; there is no
 *     second row for a gap to sit before. Chrome reports the USED track list,
 *     implicit tracks included, so the count is trustworthy for both axes.
 *   - `display:contents` IS FLATTENED, not skipped. The wrapper is correctly not
 *     an item, but its descendant boxes are PROMOTED into this container's
 *     formatting context and become items themselves. Skipping the wrapper without
 *     recursing let a promoted zero-extent item hide.
 *   - EXTENT NEEDS BOTH RECT AND OFFSET TO BE ZERO. `getBoundingClientRect()`
 *     returns the TRANSFORMED visual rect, so a `scale(0)` element reads 0 while
 *     still occupying its full layout box and charging nothing extra. `offset*` is
 *     the untransformed layout box. Requiring both to vanish keeps transforms out
 *     of the offender list without giving up sub-pixel sanity.
 *   - HIDDEN-ANCESTOR DETECTION WALKS `display` EXPLICITLY rather than calling
 *     `checkVisibility()`. Both resolve the ancestor chain (needed: descendants of
 *     a `display:none` ancestor report 0×0 rects while their own computed display
 *     is untouched — on the published modal the `lg:hidden` chip rail alone
 *     contributed 25 false positives). But `checkVisibility()` ALSO returns false
 *     under `content-visibility: hidden`, and `app/globals.css` does transition
 *     `content-visibility` — an element skipped for that reason can still hold a
 *     box and charge its parent's gap, so the two are tracked separately.
 *     `visibility:hidden` and `opacity:0` are deliberately still counted as items:
 *     they occupy space, so they pay.
 *
 * MOUNTING IT ON A NEW SURFACE. Three things are the caller's job, not the
 * helper's, because each is surface-specific:
 *   1. The ROOT. Pass the tightest locator that contains the surface under test.
 *      A root wider than the surface drags in chrome nobody is asserting about.
 *   2. NON-VACUITY ANCHORS. Assert against `visited` that the walk actually
 *      reached named containers deep in the surface. A bare offender-count
 *      assertion passes just as green when the walk found nothing to examine.
 *      Anchor on names, never on a magic container count — a count floor is
 *      satisfiable by unrelated controls and breaks on legitimate refactors.
 *   3. The LEDGER. Known, deferred instances go in a scoped+counted row list and
 *      through `reconcilePhantomLedger`; see its own doc comment.
 */
import type { Locator } from "@playwright/test";

/** One zero-extent item, labelled by its own testid or its nearest testid'd ancestor. */
export type PhantomOffender = {
  parent: string;
  child: string;
  axis: "row-gap" | "column-gap";
  gap: number;
};

export type PhantomScan = {
  offenders: PhantomOffender[];
  /** Labels of every gapped container the walk actually examined. Non-vacuity evidence. */
  visited: string[];
  /**
   * Gaps whose USED value could not be read — a mixed `calc(10% + 5px)`, `min()`,
   * `max()`, or `clamp()` serializes as the math expression rather than a length.
   * The axis is skipped, so a caller MUST assert this is empty; otherwise the
   * skip is indistinguishable from a clean surface.
   */
  unresolved: string[];
  itemsExamined: number;
};

/**
 * A KNOWN, DEFERRED instance — a debt ledger row, not a mute switch.
 *
 * SCOPED AND COUNTED, deliberately. An earlier version matched with `some()` on
 * the `parent`/`child`/`axis` triple alone, which was unsound in four ways at
 * once: labels are derived from an element's own testid OR its nearest testid'd
 * ANCESTOR, so the triple is NOT unique; one row therefore suppressed EVERY
 * occurrence of that triple, a NEW offender added beside the known one, and the
 * same triple on any other page or viewport. It also could not tell a live debt
 * from a stale row whose instance had since been fixed.
 *
 * So each row pins the exact surface, viewport width, and OCCURRENCE COUNT it
 * accounts for. Matching is one-to-one: exactly `count` occurrences are consumed,
 * a surplus stays in the offender list and fails, and a shortfall fails separately
 * as a stale row that must be deleted.
 *
 * `surface` and `width` are the scoping keys, and `reconcilePhantomLedger` does
 * the filtering itself — pass it the WHOLE ledger plus the scope of the run in
 * hand. Pre-filtering still type-checks but defeats the whole-ledger validation
 * pass, so a malformed row in another scope would go unreported.
 */
export type PhantomLedgerRow = {
  surface: string;
  width: number;
  parent: string;
  child: string;
  axis: PhantomOffender["axis"];
  /**
   * The gap the deferred instance charges, in px, matched within 0.5px.
   *
   * REQUIRED, because the debt is the MAGNITUDE and not merely the existence of
   * a phantom item: a ledgered 2px eyebrow whose stack later moves to `gap-8`
   * would still be consumed as accounted-for while the visible seam grew 16×.
   */
  gap: number;
  count: number;
  /** Why it is deferred, and the BL- id carrying it. */
  why: string;
};

/**
 * Walk `root` and report every in-flow flex/grid item with zero extent on an axis
 * its parent charges a gap on.
 *
 * The whole walk runs in ONE `evaluate` — a per-element round trip over a tree
 * this size is minutes of IPC, and the measurements would interleave with any
 * layout the page does between calls.
 */
export async function scanForPhantomGaps(root: Locator): Promise<PhantomScan> {
  return root.evaluate((rootEl) => {
    const offenders: { parent: string; child: string; axis: string; gap: number }[] = [];
    const visited: string[] = [];
    const unresolved: string[] = [];
    let itemsExamined = 0;
    const label = (el: Element): string => {
      const own = el.getAttribute("data-testid");
      if (own !== null) return own;
      const near = el.closest("[data-testid]")?.getAttribute("data-testid") ?? "?";
      return `<${el.tagName.toLowerCase()} in ${near}>`;
    };
    /**
     * `display:none` ANYWHERE above the element removes the whole subtree.
     *
     * Walks past `rootEl` to the document root, deliberately. The original
     * inline version stopped at the modal because the modal was known-visible;
     * a shared helper has no such guarantee — a caller can hand it a root inside
     * a `hidden` tab panel or a closed disclosure, where every descendant
     * reports 0x0 while its own computed display is untouched. Stopping at the
     * root would report that entire surface as offenders.
     */
    const hidden = (el: Element): boolean => {
      let node: Element | null = el;
      while (node !== null) {
        if (getComputedStyle(node).display === "none") return true;
        node = node.parentElement;
      }
      return false;
    };
    /**
     * `content-visibility: hidden` skips the SUBTREE'S OWN layout, so gaps inside
     * it are not rendered and zero-size descendants charge nothing.
     *
     * Starts at the element ITSELF, not its parent: a gapped container that
     * carries the property has its own children's layout skipped, so measuring its
     * items is exactly as false-red as measuring a descendant's. The boundary
     * element remains an item of ITS parent and is measured there, which is why
     * `hidden()` (display) and this check are separate.
     */
    const contentHiddenInside = (el: Element): boolean => {
      let node: Element | null = el;
      while (node !== null) {
        if (getComputedStyle(node).contentVisibility === "hidden") return true;
        node = node.parentElement;
      }
      return false;
    };
    /**
     * The container's real items, with `display:contents` flattened away.
     *
     * ORDER MATTERS: the `contents` test comes BEFORE the out-of-flow test. A
     * `display:contents` element generates no box at all, so `position` on it is
     * inert — its non-positioned descendants are promoted and remain real items of
     * this container. Discarding such a wrapper for being `position:absolute` hid
     * every descendant it promoted and undercounted the container.
     */
    const itemsOf = (container: Element): Element[] => {
      const out: Element[] = [];
      for (const child of Array.from(container.children)) {
        const ccs = getComputedStyle(child);
        if (ccs.display === "none") continue;
        if (ccs.display === "contents") {
          out.push(...itemsOf(child));
          continue;
        }
        if (ccs.position === "absolute" || ccs.position === "fixed") continue;
        out.push(child);
      }
      return out;
    };
    /**
     * Non-whitespace TEXT directly inside a flex/grid container generates an
     * ANONYMOUS item. It has no element, so it can never be an offender — but it
     * absolutely counts toward "does this container realize a gap at all", and
     * missing it made a container of {visible text, one empty element} look like a
     * single-item container and get skipped.
     */
    const anonymousItems = (container: Element): number => {
      let n = 0;
      for (const node of Array.from(container.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim() !== "") n += 1;
        else if (
          node.nodeType === Node.ELEMENT_NODE &&
          getComputedStyle(node as Element).display === "contents"
        ) {
          n += anonymousItems(node as Element);
        }
      }
      return n;
    };
    /**
     * Zero on BOTH the visual rect and the untransformed layout box.
     *
     * `getBoundingClientRect()` is the TRANSFORMED rect, so `scale(0)` reads zero
     * while the element still occupies its full layout box and charges nothing
     * extra. `offset*` is the layout box — but it exists only on HTMLElement. For
     * SVG and MathML items there is no offset metric, and treating its absence as
     * zero reported a positive-size `scale(0)` SVG as an offender. For those, fall
     * back to "no transform is in play": a genuinely zero-size SVG still reports, a
     * transformed one does not.
     */
    const vanishes = (el: Element, dim: "height" | "width"): boolean => {
      const rect = el.getBoundingClientRect();
      if ((dim === "height" ? rect.height : rect.width) !== 0) return false;
      const offset =
        dim === "height" ? (el as HTMLElement).offsetHeight : (el as HTMLElement).offsetWidth;
      if (typeof offset === "number") return offset === 0;
      // SVG / MathML: no offset metric, so the only question left is whether the
      // zero rect could be TRANSFORM-induced. Answered conservatively — report
      // only when no transform of any kind is in play.
      //
      // Deliberately NOT a matrix decomposition. Three separate things defeat
      // one: the INDIVIDUAL `scale` / `rotate` / `translate` properties are
      // distinct inputs to the current transformation matrix and never appear in
      // `transform` (verified: a `scale: 0` element reports `transform: "none"`,
      // and Tailwind v4's `scale-*` utilities compile to exactly that property);
      // `matrix3d` is not decomposable by term inspection; and a rotation of a
      // degenerate box (100×0 turned 90°) collapses a physical dimension the
      // scale terms alone do not describe. The cost is a documented false GREEN —
      // a genuinely zero-size SVG carrying any transform goes unreported.
      const cs2 = getComputedStyle(el);
      return (
        cs2.transform === "none" &&
        cs2.scale === "none" &&
        cs2.rotate === "none" &&
        cs2.translate === "none"
      );
    };
    /**
     * Realized track count on one axis. For a grid container the computed
     * `grid-template-*` is the USED value — a space-separated list of pixel sizes —
     * so its length is the track count. `minmax()` and `repeat()` are already
     * resolved away, but LINE NAMES are not: Chrome reports `[full-start] 100px
     * [full-end]`, and counting those brackets as tracks would overstate the count
     * and pull single-track grids into examination.
     */
    const trackCount = (tpl: string): number => {
      if (tpl === "none" || tpl.startsWith("subgrid") || tpl.trim() === "") return 0;
      return tpl
        .replace(/\[[^\]]*\]/g, " ")
        .trim()
        .split(/\s+/)
        .filter((t) => t !== "").length;
    };
    /**
     * A gap in used PIXELS.
     *
     * The resolved value of `row-gap` / `column-gap` keeps percentages as
     * percentages, so `parseFloat("10%")` silently yields `10` — both a wrong
     * reported magnitude and, when the percentage resolves against a zero-size
     * content box, a gap that is actually 0 being treated as chargeable.
     * Percentages resolve against the container's own content box on that axis,
     * and `cs.width` / `cs.height` are used values in px, so the resolution is
     * direct.
     */
    const gapPx = (
      raw: string,
      el: Element,
      cs: CSSStyleDeclaration,
      dim: "height" | "width",
    ): number | null => {
      const t = raw.trim();
      // `normal` is the INITIAL value of both gap properties and is what the vast
      // majority of containers report. For flex and grid it computes to zero.
      // (Only multi-column layout gives `normal` a non-zero meaning, and a
      // multicol container is not a flex/grid container, so it never reaches
      // here.) Treating it as unresolved put every ordinary container in the
      // `unresolved` list — which is how this was caught.
      if (t === "normal") return 0;
      if (t.endsWith("px")) return parseFloat(t);
      if (t.endsWith("%")) {
        const pct = parseFloat(t);
        if (!Number.isFinite(pct)) return null;
        // CONTENT box, computed from `clientWidth/Height` minus padding.
        // `cs.width` is NOT the basis: under `box-sizing: border-box` Chrome
        // resolves it to the BORDER-box used value (verified — a
        // `width:40px; padding-inline:20px` border-box element reports `40px`
        // while its content box is 0), so a percentage gap that actually
        // resolves to 0 would be treated as chargeable.
        const box =
          dim === "width"
            ? (el as HTMLElement).clientWidth -
              parseFloat(cs.paddingLeft) -
              parseFloat(cs.paddingRight)
            : (el as HTMLElement).clientHeight -
              parseFloat(cs.paddingTop) -
              parseFloat(cs.paddingBottom);
        return Number.isFinite(box) ? (pct / 100) * Math.max(0, box) : null;
      }
      // `calc(10% + 5px)`, `min()`, `max()`, `clamp()` — a mixed
      // length-percentage serializes as the math expression itself, so there is
      // no used value to read. `parseFloat` yields NaN, which silently became
      // "no gap" and dropped the axis from examination. Returning null routes it
      // to `unresolved`, where the caller can fail on it instead.
      return null;
    };

    for (const el of [rootEl, ...Array.from(rootEl.querySelectorAll("*"))]) {
      if (hidden(el)) continue;
      // Inside a `content-visibility:hidden` subtree the browser skips the
      // subtree's own layout, so its internal gaps are not rendered and a
      // zero-size descendant charges nothing. Measuring in there is a false red.
      // (The boundary element remains an item of its own parent.)
      if (contentHiddenInside(el)) continue;
      const cs = getComputedStyle(el);
      const isFlex = cs.display === "flex" || cs.display === "inline-flex";
      const isGrid = cs.display === "grid" || cs.display === "inline-grid";
      if (!isFlex && !isGrid) continue;
      // `row-gap` / `column-gap` are LOGICAL: which physical dimension each one
      // separates follows `writing-mode`. Under `vertical-rl` / `vertical-lr`
      // rows stack horizontally, so `row-gap` is measured against WIDTH and
      // `column-gap` against HEIGHT — the exact inverse of the horizontal case.
      // Hardcoding the physical dims reported every item on the wrong axis in a
      // vertical tree: silent false greens on one axis, false reds on the other.
      // `sideways-rl` / `sideways-lr` are vertical writing modes too and do NOT
      // start with "vertical" — matching only the `vertical-*` prefix measured
      // both logical gaps against the wrong physical dimension there.
      const vertical = /^(vertical|sideways)/.test(cs.writingMode);
      const rowDim = vertical ? ("width" as const) : ("height" as const);
      const colDim = vertical ? ("height" as const) : ("width" as const);
      const rowGapPx = gapPx(cs.rowGap, el, cs, rowDim);
      const colGapPx = gapPx(cs.columnGap, el, cs, colDim);
      const rowGap = rowGapPx ?? 0;
      const colGap = colGapPx ?? 0;
      const isColumn = cs.flexDirection.startsWith("column");
      const wraps = isFlex && cs.flexWrap !== "nowrap";
      // Grid charges both axes; flex charges its main axis always and its cross
      // axis only when it can produce more than one line.
      const chargesRowGap = isGrid || isColumn || wraps;
      const chargesColGap = isGrid || !isColumn || wraps;
      const axes = [
        ...(chargesRowGap && rowGap > 0
          ? [{ axis: "row-gap", gap: rowGap, dim: rowDim, tpl: cs.gridTemplateRows }]
          : []),
        ...(chargesColGap && colGap > 0
          ? [{ axis: "column-gap", gap: colGap, dim: colDim, tpl: cs.gridTemplateColumns }]
          : []),
      ];
      // An axis whose gap could not be READ still has to reach the unresolved
      // report below, and it contributes no entry to `axes` (a null gap is not
      // `> 0`). Bailing on an empty `axes` alone therefore silently dropped the
      // one case the report exists for.
      const unreadable =
        (rowGapPx === null && chargesRowGap) || (colGapPx === null && chargesColGap);
      if (axes.length === 0 && !unreadable) continue;
      const items = itemsOf(el);
      // ITEM COUNT INCLUDES ANONYMOUS TEXT ITEMS — {visible text, one empty
      // element} really is two items and really does realize a gap.
      const itemCount = items.length + anonymousItems(el);
      /**
       * Does this axis realize a gutter at all?
       *
       * "Fewer than two items realizes no gap" holds for FLEX only. A GRID's gaps
       * sit between TRACKS, and track count is independent of item count in BOTH
       * directions: one item can span several tracks, and seven items can share a
       * single one. So a grid axis is admitted on its realized track count alone.
       *
       * SUBGRID resolves as `subgrid` followed by ONE bracketed line-name set per
       * used line (`subgrid [] [] []`), so the used LINE count is readable even
       * though the track SIZES live on the parent — n lines means n-1 tracks. An
       * `=== "subgrid"` test never matched that serialization, and `trackCount`
       * then stripped the brackets and counted the bare token as one track, so
       * every subgrid axis was silently rejected. The `itemCount` fallback was
       * wrong in its own right too: a one-item subgrid spanning two parent tracks
       * realizes the gutter between them.
       */
      const admits = (tpl: string): boolean => {
        if (!isGrid) return itemCount >= 2;
        if (tpl.startsWith("subgrid")) {
          const lines = tpl.match(/\[[^\]]*\]/g)?.length ?? 0;
          return lines > 0 ? lines - 1 >= 2 : itemCount >= 2;
        }
        return trackCount(tpl) >= 2;
      };
      // Reported only for an axis this container would ACTUALLY have examined.
      // Recording it before the charge + admission filters false-red'd on a
      // `nowrap` row flex whose unreadable ROW gap can never be realized (one
      // line, no row gutter), and on any container failing item/track admission.
      for (const [gapValue, axisName, raw, tpl, charges] of [
        [rowGapPx, "row-gap", cs.rowGap, cs.gridTemplateRows, chargesRowGap],
        [colGapPx, "column-gap", cs.columnGap, cs.gridTemplateColumns, chargesColGap],
      ] as const) {
        if (gapValue === null && charges && admits(tpl)) {
          unresolved.push(`${label(el)} ${axisName}: ${raw}`);
        }
      }
      const chargeableAxes = axes.filter(({ tpl }) => admits(tpl));
      if (chargeableAxes.length === 0) continue;
      visited.push(label(el));
      for (const item of items) {
        itemsExamined += 1;
        for (const { axis, gap, dim } of chargeableAxes) {
          if (vanishes(item, dim)) {
            offenders.push({ parent: label(el), child: label(item), axis, gap });
          }
        }
      }
    }
    return { offenders, visited, unresolved, itemsExamined };
  }) as Promise<PhantomScan>;
}

/**
 * Reconcile a scan against the debt ledger, ONE-TO-ONE.
 *
 * Each row consumes exactly `count` occurrences of its triple. A surplus survives
 * into `remaining` and must fail as a new offender; a shortfall lands in `stale`
 * and must fail as a row whose debt was repaid — a row kept past its debt masks a
 * later offender carrying the same label triple.
 *
 * SCOPING HAPPENS HERE, not at the call site. The caller passes the WHOLE ledger
 * plus the `scope` of the run in hand, and this function filters. An earlier
 * signature took pre-filtered rows and then ignored their `surface`/`width`
 * fields entirely — which meant a caller that forgot the filter got rows from
 * every other page and width silently consuming this run's offenders, with the
 * type system perfectly happy. A footgun that only misfires when someone forgets
 * is a footgun; taking the scope makes forgetting impossible.
 *
 * KNOWN LIMIT — replacement is invisible. Matching is on the label triple, so a
 * row whose original instance was fixed while a DIFFERENT element produced the
 * same triple consumes the newcomer and reports neither `stale` nor `remaining`.
 * Distinguishing them needs an identity the DOM does not offer here.
 */
export function reconcilePhantomLedger(
  offenders: readonly PhantomOffender[],
  ledger: readonly PhantomLedgerRow[],
  scope: { surface: string; width: number },
): { remaining: PhantomOffender[]; stale: string[] } {
  const remaining = [...offenders];
  const stale: string[] = [];
  // Validation runs over the WHOLE ledger, before any scope filtering. A row that
  // can never be satisfied would otherwise sit there looking like accounted-for
  // debt — `count: 0` consumes nothing AND never reports stale — and validating
  // only the in-scope rows meant a malformed row stayed invisible until some
  // later run happened to reconcile at its width.
  for (const row of ledger) {
    if (!Number.isInteger(row.count) || row.count < 1) {
      throw new Error(
        `phantom ledger row has a non-positive-integer count (${row.count}): ` +
          `${row.parent} → ${row.child} (${row.axis}) on ${row.surface} @ ${row.width}`,
      );
    }
  }
  for (const row of ledger) {
    if (row.surface !== scope.surface || row.width !== scope.width) continue;
    let consumed = 0;
    for (let i = remaining.length - 1; i >= 0 && consumed < row.count; i -= 1) {
      const o = remaining[i]!;
      if (
        o.parent === row.parent &&
        o.child === row.child &&
        o.axis === row.axis &&
        Math.abs(o.gap - row.gap) <= 0.5
      ) {
        remaining.splice(i, 1);
        consumed += 1;
      }
    }
    if (consumed < row.count) {
      stale.push(
        `${row.parent} → ${row.child} (${row.axis} @ ${row.gap}px): ledger expects ${row.count},` +
          ` found ${consumed}`,
      );
    }
  }
  return { remaining, stale };
}
