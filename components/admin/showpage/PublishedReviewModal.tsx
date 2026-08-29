"use client";

/**
 * components/admin/showpage/PublishedReviewModal.tsx (admin-show-modal spec §6)
 *
 * The published review surface composed inside the shared `ReviewModalShell`
 * chrome: the dashboard's `/admin?show=<slug>` modal. Header slot owns the
 * heading-safe `<h2>` title (the dialog's aria-labelledby target — ONLY the
 * title text; the sheet deep link is the separate adjacent SheetIconLink — a
 * 20px box with a 44px overlay target, the Step3ReviewModal pattern) plus the
 * close button. The control strip is NOT in
 * the header: it mounts in the shell's `subHeader` band, its own seamed row
 * below the header (modal-header-reconciliation §6.1) — identity above, live
 * controls below. `<StatusStrip>` renders no title of its own and no container
 * chrome at all (§6.5), so the panel contains exactly one title node and no h1,
 * and the band's surface, seam and `px-tile-pad` are never doubled. Body =
 * `<ShowReviewSurface layout="modal" syncHash>` with the EXACT extras
 * composition `PublishedReviewPage` builds today (Overview first, Changes
 * last, per-section warning controls, raw-unrecognized bottom slot). NO
 * footer: the publish control is the strip's inline toggle; archive lives in
 * the share hub's popover since the lifecycle move (it was the Overview archive
 * row when spec §6.1 was written).
 *
 * RSC boundary: server-only pieces arrive pre-rendered as ReactNode SLOTS
 * (`alertSlot`); every server action arrives as a DIRECT ref
 * (never an inline-wrapped closure — the RSC server-action lesson).
 * `buildSectionWarningModel` (SERVER, node:crypto) ran on the loader; this
 * shell only invokes the crypto-free `buildSectionWarningExtras` factory.
 *
 * Close: every affordance (X, scrim, Esc, drag-dismiss) funnels through
 * `handleClose` — an instant client-side hide (local `closing` state) plus
 * `useShowModalNav().close` (the current URL minus `show`/`alert_id`) catching
 * the URL up in the background.
 */

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronDown, History, LayoutDashboard } from "lucide-react";

import { ModalCloseButton } from "@/components/admin/review/ModalCloseButton";
import { SheetIconLink } from "@/components/admin/SheetIconLink";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";
import {
  ShowReviewSurface,
  type AttentionJump,
  type ExtraSection,
} from "@/components/admin/review/ShowReviewSurface";
import { AttentionBanner } from "@/components/admin/review/AttentionBanner";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import {
  canonicalCrewKey,
  type AttentionItem,
  type AttentionAnchor,
  type RoutedSectionId,
} from "@/lib/admin/attentionItems";
import {
  bucketAttention,
  jumpSectionFor,
  resolveEffectiveSection,
} from "@/lib/admin/sectionAttention";
import { anchorsForData } from "@/lib/admin/attentionAnchorAvailability";
import { applyEscapeDecision, decideEscape } from "@/lib/admin/escapeClaim";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { SectionWarningRecord } from "@/lib/admin/sectionWarningModel";
import {
  buildSectionWarningExtras,
  renderCrewUnderRowCards,
} from "@/components/admin/showpage/sectionWarningExtras";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { CREW_CAP, dateSummarySegments } from "@/components/admin/wizard/step3ReviewSections";
import { buildCrewRowResolver } from "@/lib/admin/crewRowMatch";
import { StatusStrip } from "@/components/admin/showpage/StatusStrip";
import {
  buildSectionSignatures,
  changedSectionIds,
  freshnessAnnouncement,
  SECTION_FRESHNESS_FLASH_MS,
  SECTION_FRESHNESS_MAX_CUES,
  type SectionSignatures,
} from "@/components/admin/review/sectionFreshness";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { deriveWarningAttention } from "@/lib/admin/warningAttention";
import { HEADER_ACTION_CAP } from "@/components/admin/review/headerActionCap";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import { buildPublishedSnapshot } from "@/components/admin/dev/snapshots";
import type { PickerResetCrewRow } from "@/app/admin/show/[slug]/PickerResetControl";
import { OverviewSection } from "@/components/admin/showpage/OverviewSection";
import { ChangesSection } from "@/components/admin/showpage/ChangesSection";
import type { ChangesSectionProps } from "@/components/admin/showpage/ChangesSection";
import { useShowModalNav } from "@/components/admin/useShowModalNav";
import { useRouter, useSearchParams } from "next/navigation";

type LifecycleResult = { ok: true } | { ok: false; code: string };

const TESTID_BASE = "published-show-review";

// Props = PublishedReviewPageProps verbatim + { alertId } (spec §6). Declared
// here (not imported) so Task 7's deletion of PublishedReviewPage.tsx leaves
// no orphaned type import.
export type PublishedReviewModalProps = {
  /** The published-mode content contract feeding every parsed section panel. */
  data: PublishedSectionData;
  /** Per-section warning model (server-derived, crypto-free record) for §5.3 controls. */
  bySection: SectionWarningRecord;

  // ── StatusStrip / header ──
  slug: string;
  showId: string;
  title: string | null;
  archived: boolean;
  published: boolean;
  finalizeOwned: boolean;
  setPublished: (next: boolean) => Promise<LifecycleResult>;
  isLive: boolean;
  lastSyncedAt: string | null;
  lastCheckedAt: string | null;
  lastSyncStatus: string | null;
  now: Date;
  /** Server-derived unified attention list (published-show-alerts §3.1) — the
   *  ONE source for the pill, menu, nav badges/dots, and inline banners. */
  attentionItems: AttentionItem[];
  /** fetchPerShowAlerts returned infra_error (§3.2): degraded pill state +
   *  Overview notice; hold-derived items still render. */
  alertsDegraded: boolean;

  // ── Overview ──
  openSheetHref: string | null;
  archiveAction: () => Promise<LifecycleResult>;
  unarchiveAction: (showId: string) => Promise<void>;
  /** Crew addresses for the hub's batched Email-crew rows (share-hub T4). */
  crewEmails: readonly string[];
  /** Roster rows for the hub's everyone-reset control (share-hub T4). */
  pickerCrew: PickerResetCrewRow[];

  // ── Changes ──
  feed: ChangesSectionProps["feed"];
  undoAction: ChangesSectionProps["undoAction"];
  acceptAction: ChangesSectionProps["acceptAction"];
  acceptAllAction: ChangesSectionProps["acceptAllAction"];
  approveAction: ChangesSectionProps["approveAction"];
  rejectAction: ChangesSectionProps["rejectAction"];

  /** `?alert_id` (first value) — the §3 one-shot highlight-scroll target; null → no scroll. */
  alertId: string | null;
};

export function PublishedReviewModal(props: PublishedReviewModalProps) {
  const {
    data,
    bySection,
    slug,
    showId,
    title,
    archived,
    published,
    finalizeOwned,
    setPublished,
    isLive,
    lastSyncedAt,
    lastCheckedAt,
    lastSyncStatus,
    now,
    attentionItems,
    alertsDegraded,
    openSheetHref,
    archiveAction,
    unarchiveAction,
    crewEmails,
    pickerCrew,
    feed,
    undoAction,
    acceptAction,
    acceptAllAction,
    approveAction,
    rejectAction,
    alertId,
  } = props;

  const { close } = useShowModalNav();
  // Revalidate-on-open (spec 2026-07-19-show-modal-prefetch §3.2): a prefetched
  // open serves the router cache (possibly minutes old); one background
  // router.refresh() streams fresh RSC and reconciles in place. Ref guard =
  // exactly once per mounted instance (StrictMode double-effect dedupe); a
  // REOPEN is a new instance (streams through the Suspense fallback), so it
  // refreshes again — the intended per-open cadence.
  const router = useRouter();
  const refreshFiredRef = useRef(false);
  useEffect(() => {
    if (refreshFiredRef.current) return;
    refreshFiredRef.current = true;
    router.refresh();
    // Warm the close destination while the modal is open. The open-time
    // refresh above reconciles `/admin?show=<slug>` (the CURRENT URL), NOT the
    // bare `/admin` the close navigates to — that entry is whatever the router
    // cache held when the dashboard first rendered, so an un-warmed close pays
    // a full RSC round-trip before the shell can unmount. Prefetching it means
    // the dashboard paints from cache immediately on close (measured ~700ms →
    // ~126ms local prod). Freshness is handled separately by the post-close
    // refresh in `handleClose` — prefetch is a paint optimization, not a
    // source of truth.
    // Optional-chained: `prefetch` is always present on the real Next router,
    // but several unit-test navigation mocks stub only { refresh, push }, and a
    // hard call would crash every test that mounts this modal through one of
    // them. The warm is a pure optimization, so skipping it under a partial
    // mock is harmless.
    router.prefetch?.("/admin");
  }, [router]);
  // Instant close: the close nav is a full RSC round-trip of the dashboard
  // (the modal is server-rendered off `?show`), so the shell would otherwise
  // stay mounted until the new payload lands. Hide client-side FIRST (the
  // shell's unmount cleanups restore focus/inert/scroll immediately), then let
  // `close()` catch the URL up in the background. A COMMITTED close unmounts
  // this instance (a reopen streams through the Suspense fallback — a different
  // element type), so a fresh open never inherits `closing`.
  //
  // ABORTED close (the reopen race): the close is `router.push("/admin")`, and
  // any navigation started while it is in flight supersedes it. Clicking the
  // SAME row again during that window targets `/admin?show=<slug>` — the URL
  // the browser is still on — so the aborted close commits nothing, the URL
  // never changes, and this instance is never remounted. Without a reset path
  // it would stay hidden forever and the show could not be reopened until some
  // other URL was navigated to. Running the close inside a transition gives us
  // the settle signal: once it is no longer pending and our own `?show` is
  // STILL committed, the close did not land — un-hide.
  const [closing, setClosing] = useState(false);
  const [closePending, startCloseTransition] = useTransition();
  const searchParams = useSearchParams();
  // The standalone layout harnesses (skeletonBandParity, statusStripToggleLayout)
  // render this tree with NO router context, where the hook really does hand back
  // null despite its non-nullable type — guard rather than crash them. Those
  // harnesses never navigate, so a null read simply means "no close to heal".
  const committedShow = (searchParams as URLSearchParams | null)?.get("show") ?? null;
  // Declared HERE, above every hook that closes over it, because the React
  // Compiler's immutability rule rejects modifying a value already captured by
  // an earlier hook: `handleClose` below voids a pending claim, so the ref has to
  // exist before it. The acquisition that gives this ref its meaning is the layout
  // effect further down, where the claim's own documentation lives.
  const escapeClaimRef = useRef(false);

  const handleClose = useCallback(() => {
    // A close is the operator asking to leave, so any pending Escape deferral is
    // void. Without this a claim can outlive an ABORTED close: the guarded
    // self-heal below resets `closing` while this instance and its ref survive,
    // so the first Escape after the modal comes back would be swallowed by a
    // claim left over from before. Whole-diff review round 1.
    escapeClaimRef.current = false;
    setClosing(true);
    startCloseTransition(() => {
      close();
      // Reconcile the dashboard after the close commits. The prefetched entry
      // (and any pre-existing router-cache entry for `/admin`) was captured
      // before or during this modal's lifetime, so it can be stale — e.g. a
      // lifecycle toggle here that only `revalidatePath("/admin/show/<slug>")`,
      // or an out-of-band change. `router.refresh()` re-fetches the committed
      // route; the instant paint comes from the cache, the correct data lands
      // right behind it (the #497 §3.2 prefetch-then-refresh pattern).
      router.refresh();
    });
  }, [close, router]);
  // Guarded setState-in-render (the ShowsTable idiom — react-hooks/set-state-in-effect
  // forbids the effect form). Self-heals only once: the guard is false on the
  // very next render. `committedShow !== slug` means the close DID commit and
  // this instance's unmount is imminent — resetting there would flash the modal
  // back on its way out.
  if (closing && !closePending && committedShow === slug) {
    setClosing(false);
  }
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // The consumer owns the scroll container the surface hands its scroll-spy
  // (shell contract: no body wrapper — the surface root IS the body element).
  const scrollerRef = useRef<HTMLElement | null>(null);
  const h2Id = useId();
  // §6.2 guard: the published adapter can yield an empty title — never an
  // empty accessible name.
  const displayTitle = title || slug;

  // §6.3 subline: identity's second line, derived ENTIRELY from `data` — no new
  // props (§F2). `dateSummarySegments` is imported from the wizard module in
  // place; the helper does NOT move (§6.3, Watchpoint 6) — the cross-domain
  // import is already established (`CREW_CAP` from that same module), and moving
  // the helper would drag its ten-caller `arr` dependency with it.
  const client = data.clientLabel;
  const segs = dateSummarySegments(data.dates ?? undefined);

  // §5.3 per-section warning controls: the crypto-free render factory over the
  // server-derived model. Memoized on the record identity (stable per render).
  // Canonical keys of the RENDERED crew rows (CREW_CAP slice) — shared by the extras
  // factory (crew-scoped group filtering, §5), the under-row card renderer, and the
  // alert bucketAttention below (single source, no drift).
  const renderedCrewKeys = useMemo(
    () => new Set(data.crewMembers.slice(0, CREW_CAP).map((m) => canonicalCrewKey(m.name || ""))),
    [data.crewMembers],
  );
  const renderSectionExtras = useMemo(
    () => buildSectionWarningExtras({ bySection, renderedCrewKeys }),
    [bySection, renderedCrewKeys],
  );
  // §5: crew-scoped warning cards for the rendered rows, threaded to the crew section's
  // row host (merged with alert banners into one capped stack).
  const crewUnderRowCards = useMemo(
    () =>
      renderCrewUnderRowCards({
        model: bySection.crew,
        published: {
          slug: data.slug,
          showId: data.showId,
          driveFileId: data.driveFileId,
          useRawDecisions: data.useRawDecisions,
        },
        renderedKeys: renderedCrewKeys,
      }),
    [
      bySection.crew,
      data.slug,
      data.showId,
      data.driveFileId,
      data.useRawDecisions,
      renderedCrewKeys,
    ],
  );
  // warning-surface-trim §3.2: the counts travel WITH the extras hook, because
  // the trim's gate requires both. Derived from the same model the extras render,
  // so the panel's body-empty copy can never describe a different set of rows
  // than the cards below it.
  const routedWarnings = useMemo(() => deriveRoutedWarnings(bySection), [bySection]);

  // ── Attention surface state (published-show-alerts §5/§6) ──────────────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  // The sheet's own parse warnings, indexed (spec §4.1). Registry order, then
  // per-section active order — `bySection` is the model the rail and the cards
  // already read, so the pill cannot disagree with either. ACTIVE only, so
  // ignoring a warning decrements the pill exactly as it empties the rail dot.
  const sheetWarnings = useMemo(() => {
    const defs = step3Sections(data);
    const entries = defs.flatMap((sec) =>
      (bySection[sec.id]?.active ?? []).map((it) => ({
        id: `warning:${it.reportSurfaceId}`,
        sectionId: sec.id,
        warning: it.warning,
        reportSurfaceId: it.reportSurfaceId,
      })),
    );
    return deriveWarningAttention(entries, defs);
  }, [bySection, data]);
  const k = sheetWarnings.all.length;

  const [jump, setJump] = useState<AttentionJump | null>(null);
  const jumpNonceRef = useRef(0);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  const live = useMemo(
    () => attentionItems.filter((i) => !doneIds.has(i.id)),
    [attentionItems, doneIds],
  );
  const actionable = useMemo(() => live.filter((i) => i.actionable), [live]);
  // attention-index §2.4: the badge counts TWO things, matching the panel's two
  // groups. `selfHeal` is unchanged; `needsYou` is its complement, so the
  // fail-visible default survives (an item with no clearingKind is an issue) and
  // a mistagged actionable item is counted once, in needsYou only.
  const selfHeal = useMemo(
    () => live.filter((i) => !i.actionable && i.clearingKind === "self_heal"),
    [live],
  );
  const needsYou = useMemo(
    () => live.filter((i) => !(!i.actionable && i.clearingKind === "self_heal")),
    [live],
  );
  // Interactive whenever a human might act — composite predicate, NEVER
  // `actionable` alone (spec §6/§6a: the menu can open at a needs-look-only state).
  // monitoring-badge-expand §3.1: self-heal items make the pill interactive too
  // (quiet palette); monitoring-only selects the quiet visual + copy contract.
  const interactive = needsYou.length > 0 || k > 0 || selfHeal.length > 0;
  const monitoringOnly = needsYou.length === 0 && k === 0 && selfHeal.length > 0;

  // Compound reconciliation (spec §6 outcome contract, §8 case 2): if live data
  // updates while the menu is open such that the pill is no longer interactive,
  // the trigger <button> re-renders as a <span> — without this the open
  // dropdown is orphaned and keyboard focus drops to <body>, breaking the modal
  // focus trap. Mechanism (§6a probe-ratified — the rAF-deferred close variant
  // FAILED 3 of 9 probe cells, so the unmount must be same-render):
  //   1. The menu's open state is DERIVED: it renders only while
  //      `menuOpen && interactive`, so the panel unmounts in the same render
  //      that removes the trigger — no orphan frame, no setState needed.
  //   2. The post-commit effect below then rescues focus (focus() is not
  //      setState — lint-allowed) onto the dialog root — ONE named target,
  //      never <body>; tabindex is ensured so focus() cannot silently no-op.
  //   3. Rebound safety (whole-diff review 2026-07-22): the stale flag is
  //      reconciled DURING RENDER via React's sanctioned derived-state
  //      adjustment (react.dev "adjusting state when props change") — when
  //      interactivity is lost while the flag is up, setMenuOpen(false) runs
  //      in the same render pass and React re-renders before commit. No
  //      frame ever holds a stale open flag, so a 1-frame interactivity
  //      rebound (1 → 0 → 1) has nothing to resurrect. (The earlier rAF
  //      cleanup variant left the flag up for a frame; its dep-change
  //      cleanup cancelled the pending close and the rebound remounted the
  //      menu. A ref-latch guard fixed that but read the ref during render,
  //      which the lint contract bans.)
  // State contract pinned by pillFocusReconcile + the e2e probe.
  const menuEffectivelyOpen = menuOpen && interactive;
  if (menuOpen && !interactive) {
    // Sanctioned setState-during-render: strictly narrowing (immediately
    // re-renders with menuOpen=false, making the condition false), not an
    // effect, so the set-state-in-effect lint contract does not apply.
    //
    // W1, TRANSIENT: the Escape claim deliberately SURVIVES here, and this is the
    // only dismissal that leaves it alone. Losing interactivity is not the operator
    // asking, so their next Escape was still aimed at the panel and is deferred once.
    // Every other site clears explicitly, which makes the absence here look like an
    // oversight; it is a decision (spec §4's matrix). Adding a clear would break the
    // deferral, and cases 2, 8 and 10 fail if you do, which was verified by mutant
    // rather than assumed.
    setMenuOpen(false);
  }
  // ── Escape claim (2026-08-28-published-escape-consumed-claim §3) ───────────
  // The shell closes the dialog on any Escape unless a host handles the key. The
  // panel's own capture listener can only claim a key while the panel is mounted
  // AND that listener is live, so every window in which the panel is down, or up
  // but not yet listening, would otherwise spend the operator's Escape on the
  // modal. This ref outlives the panel and CLASSIFIES those windows: a transient
  // unmount keeps the claim and the next key is deferred, an intentional dismissal
  // clears it and the next key closes the dialog.
  //
  // ACQUISITION IS A LAYOUT EFFECT, deliberately. A passive acquisition would leave
  // an ordinary post-commit window in which the panel is painted and neither the
  // claim nor the frame's own passive listener is live, which is this repair's own
  // defect reintroduced by the repair (spec §3.4). Layout runs before paint, so the
  // panel is never visible without a claim behind it.
  useLayoutEffect(() => {
    if (menuEffectivelyOpen) escapeClaimRef.current = true;
  }, [menuEffectivelyOpen]);
  /** Intentional dismissal: the operator asked for it, so the next Escape is the
   *  dialog's (spec §4's matrix, every row classified `intentional`). */
  const clearEscapeClaim = () => {
    escapeClaimRef.current = false;
  };
  /** The shell's consumed-key handler. The DECISION is a pure function
   *  (`lib/admin/escapeClaim.ts`) so it can be tested over its whole input space;
   *  this only applies the action. Whole-diff review round 2 is why: inline, the
   *  branch is reachable only in state P, jsdom cannot stage state P, and a
   *  textual guard over the branch's body was green against an early return
   *  inserted above it. */
  const handleEscapeCapture = (): boolean => {
    return applyEscapeDecision(
      decideEscape({ panelOpen: menuEffectivelyOpen, claimPending: escapeClaimRef.current }),
      {
        dismissPanel: () => setMenuOpen(false),
        clearClaim: clearEscapeClaim,
        // Focus goes back to the pill, matching what the panel's OWN Escape
        // handler does (AttentionMenu.tsx:361-362). Impeccable critique P1.
        focusPill: () => pillRef.current?.focus(),
      },
    );
  };

  const menuWasEffectivelyOpenRef = useRef(false);
  useEffect(() => {
    const was = menuWasEffectivelyOpenRef.current;
    menuWasEffectivelyOpenRef.current = menuEffectivelyOpen;
    if (menuEffectivelyOpen) {
      const dialog = document.querySelector('[role="dialog"]');
      const active = document.activeElement;
      // monitoring-badge-expand §3.3: a focused row/link unmounted while the
      // menu stayed open drops focus to <body> (probe-ratified, Chromium 147)
      // - refocus the pill trigger. Dep-less effect: runs after EVERY commit,
      // so no dependency wiring can go stale. Never steals focus that is
      // still inside the dialog.
      if (active === document.body || (dialog && !dialog.contains(active))) {
        pillRef.current?.focus();
      }
      return;
    }
    if (!was || interactive) return;
    // The menu just force-closed because interactivity was lost (NOT a user
    // close — those keep interactive=true and manage their own focus): rescue
    // focus onto the dialog root so it never drops to <body>.
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    if (dialog) {
      if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
      dialog.focus();
    }
  });

  // §3.3 anchor availability drives BOTH the bucketing (below) and the section an
  // item's banner ACTUALLY renders in. An asset/reel item whose anchor content
  // (diagram signal / non-empty opening_reel) is ABSENT falls back to an Overview
  // card (no-drop), so `sectionHasConsumer(rooms|event)` is false and its effective
  // section is Overview. The nav dot AND the deep-link/menu jump must use that
  // effective section, not the declared route — otherwise the rail highlights and
  // #hashes a section that holds no banner (Codex PR3 review P1). React Compiler
  // memoizes these plain derivations; `anchors` changes identity per render, so a
  // manual useMemo/useCallback would only capture a stale predicate.
  const anchors = anchorsForData(data);
  // Only rooms/event are fallback-eligible: they host CARDS solely through their
  // content anchor (Diagrams sub-block / opening_reel field), so an absent anchor
  // means no consumer. EVERY other section (crew, overview, warnings — and changes,
  // which holds render in) always has a consumer, so it is never remapped. This is
  // the SINGLE predicate for bucketing, the effective section, and the nav dots.
  const sectionHasConsumer = (id: RoutedSectionId): boolean =>
    id === "rooms" || id === "event" ? (anchors.get(id)?.size ?? 0) > 0 : true;
  // ONE placement-predicate pair feeds bucketAttention AND resolveEffectiveSection,
  // so the card's placement and its nav dot / jump target are computed identically.
  const placement = {
    sectionAvailable: sectionHasConsumer,
    anchorAvailable: (id: RoutedSectionId, anchor: string) =>
      anchors.get(id as "rooms" | "event")?.has(anchor as AttentionAnchor) ?? false,
  };
  const effectiveSectionId = (item: AttentionItem): RoutedSectionId =>
    resolveEffectiveSection(item, placement);

  // Registry-section amber dots (§5.3): overview/changes are extras with their
  // own badges, so they are excluded here. Keyed on the EFFECTIVE section so a
  // fallen-back asset/reel item dots Overview (where its card is), not its route.
  const attentionSections = new Set<string>(
    actionable.map((i) => effectiveSectionId(i)).filter((s) => s !== "overview" && s !== "changes"),
  );

  // ── Freshness cue (spec 2026-08-03-modal-freshness-cue §4.2) ───────────────
  //
  // A realtime broadcast, or any other in-place reconcile, swaps content under
  // the reader with no signal at all. These derive WHICH sections changed and
  // arm a one-shot cue on each.
  //
  // Memoised on prop IDENTITY so the stringify cost is paid once per RSC pass:
  // a client-state render (nav click, scroll spy, the close transition) reuses
  // the same props object and therefore the same signature, which is what makes
  // branch 1 below reachable at all.
  const attentionBySection = useMemo(() => {
    const map = new Map<string, AttentionItem[]>();
    for (const item of attentionItems) {
      const id = effectiveSectionId(item);
      const list = map.get(id);
      if (list) list.push(item);
      else map.set(id, [item]);
    }
    return map as ReadonlyMap<string, readonly AttentionItem[]>;
    // `attentionItems`, the FULL prop — the exact list `bucketAttention` renders
    // from below. Three review rounds converged here, and the last one reversed
    // the middle answer:
    //
    //   raw prop  → the audit half objected that a local resolve changed nothing
    //   `actionable` → wrong: cards render non-actionable items too, so eight
    //                  codes could appear in a card with no cue at all
    //   `live`    → wrong for the OPPOSITE reason, and round-6 review probed it:
    //               a resolved banner does NOT leave the card. It swaps to
    //               "Confirmed" in place and stays mounted until `router.refresh()`
    //               reconciles (spec §6.3, and the `bucketAttention` call below
    //               passes `attentionItems` for exactly that reason). Filtering
    //               `doneIds` out of the SIGNATURE therefore made it describe a
    //               card that is not on screen: resolving cued immediately while
    //               the banner was still visible, and the later RSC removal — the
    //               change a reader can actually see — cued nothing.
    //
    // The signature must read the same list the renderer reads. `doneIds` is
    // local UI state; it belongs to the pill and the menu, not to what the card
    // paints.
    //
    // `effectiveSectionId` is deliberately NOT a dep: it is a fresh closure every
    // render, so including it recomputed the map on every render, which made the
    // signature a new object every render and consumed the mount baseline on the
    // first one. It reads only `placement`, which is derived from the same props.
  }, [attentionItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const signature = useMemo(
    () => buildSectionSignatures({ data, bySection, attentionBySection }),
    [data, bySection, attentionBySection],
  );

  // Labels from the RENDERED registry, never a copy of it: this is the same list
  // that produces the rail chip and the section heading.
  const sectionLabelOf = useCallback(
    (id: SectionId): string | null => step3Sections(data).find((s) => s.id === id)?.label ?? null,
    [data],
  );

  type Arming = { batch: number; value: "1" | "2" };
  const EMPTY_ARMED: ReadonlyMap<SectionId, Arming> = useMemo(() => new Map(), []);
  // ONE state cell holds the last-seen signature AND whether the mount baseline
  // was taken. Both are per-COMMITTED-render facts. A ref written during render
  // is written by renders React then abandons, so a suspended payload the reader
  // never saw would consume the baseline and the first payload they DID see would
  // be armed instead: the exact stale-prefetch flash the baseline exists to stop.
  const [seen, setSeen] = useState<{ signature: SectionSignatures; baseline: boolean }>({
    signature,
    baseline: false,
  });
  const [armed, setArmed] = useState<ReadonlyMap<SectionId, Arming>>(EMPTY_ARMED);
  const [freshBatch, setFreshBatch] = useState(0);
  const [announced, setAnnounced] = useState<{ batch: number; text: string } | null>(null);
  const [bandFresh, setBandFresh] = useState<{ batch: number; value: "1" | "2" } | null>(null);

  // Written over VISIBILITY, not over any one cause, the shape ShareHub uses for
  // this same problem. A COMMITTED close unmounts this instance, but an ABORTED
  // one does not: `closing` only hides the shell while this component stays
  // mounted above it, so a live cue would otherwise survive the hide and resume
  // on reopen with whatever was left of its timer. Dropping `baseline` makes the
  // reopen re-baseline rather than flash what changed while it was hidden.
  //
  // Guarded setState-in-render, the ShowsTable idiom this file already uses a few
  // lines above for the aborted-close self-heal: `react-hooks/set-state-in-effect`
  // forbids the effect form outright, so this is not a preference. It self-heals
  // once, since the guard is false on the very next render.
  if (closing && (armed.size > 0 || announced !== null || seen.baseline)) {
    setArmed(EMPTY_ARMED);
    setAnnounced(null);
    setBandFresh(null);
    setSeen({ signature, baseline: false });
  } else if (seen.signature !== signature) {
    const changed = changedSectionIds(seen.signature, signature);
    const isBaseline = !seen.baseline;
    setSeen({ signature, baseline: true });
    // Branch 2 (baseline) and branch 3 (nothing changed) both arm nothing; a live
    // cue is deliberately left running in branch 3 rather than truncated for a
    // refresh that changed nothing. Branch 4 arms.
    if (!isBaseline && !closing && changed.length > 0) {
      const next = freshBatch + 1;
      setFreshBatch(next);
      const overCap = changed.length > SECTION_FRESHNESS_MAX_CUES;
      // Over the cap the BAND carries the cue instead of the cards. Design review
      // caught the first version inverting its own signal: the largest possible
      // change, a full re-parse, produced no visual cue at all, so a sighted
      // reader learned nothing precisely when the most had moved while a screen
      // reader still heard "Show details updated." One calm whole-surface mark is
      // the honest visual equivalent of that sentence.
      setBandFresh((prev) =>
        overCap ? { batch: next, value: prev?.value === "1" ? "2" : "1" } : null,
      );
      setArmed((prev) => {
        if (overCap) return EMPTY_ARMED;
        const map = new Map(prev);
        for (const id of changed) {
          if (!signature.has(id)) continue; // gone from the rail; nothing to paint
          // Flip PER SECTION, so a section nobody re-armed keeps its value and a
          // re-armed one changes `animation-name` and restarts.
          map.set(id, { batch: next, value: prev.get(id)?.value === "1" ? "2" : "1" });
        }
        return map;
      });
      setAnnounced({
        batch: next,
        text: freshnessAnnouncement(changed, new Set(signature.keys()), sectionLabelOf),
      });
    }
  }

  // One timer PER BATCH, and deliberately no cleanup: a cleanup keyed on the
  // batch would cancel batch N the moment batch N+1 armed, leaving batch N's
  // cards lit forever. Each batch clears only its own entries.
  const freshTimersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    if (freshBatch === 0) return;
    const b = freshBatch;
    const timers = freshTimersRef.current;
    const handle = setTimeout(() => {
      timers.delete(b);
      setArmed((prev) => {
        const map = new Map(prev);
        for (const [id, a] of map) if (a.batch === b) map.delete(id);
        return map;
      });
      // The ANNOUNCEMENT is deliberately NOT cleared here.
      //
      // Round-3 review: a `polite` live region is delivered when the screen
      // reader is next idle, which can be well after 1600ms — that number is the
      // duration of a CSS animation, and a sighted-motion deadline has no
      // business deciding when assistive tech has finished speaking. Removing
      // the child on it can retract a queued message before it is ever read,
      // and a stable region with a keyed child does not protect queued content
      // from early removal.
      //
      // Leaving it costs nothing. The region is `sr-only`, so stale text is
      // invisible; it is not re-announced, because React reconciles an equal
      // string onto the same text node and that is not a DOM mutation; and the
      // next batch replaces it wholesale. The one state that DOES clear it is
      // the modal hiding, which is a real end-of-context.
      // Batch-owned, exactly like the cards. Clearing it
      // unconditionally let an OLD batch's timer truncate a NEWER band cue: the
      // whole-diff review probed a second cue armed at 400ms disappearing at
      // 1650ms instead of its own 2000ms deadline.
      setBandFresh((prev) => (prev?.batch === b ? null : prev));
    }, SECTION_FRESHNESS_FLASH_MS);
    // Replace this batch's OWN handle if one exists, so a re-invoked effect
    // leaves one timer rather than leaking the first. Safe in a way a blanket
    // cleanup is not: it touches no other batch.
    const prior = timers.get(b);
    if (prior !== undefined) clearTimeout(prior);
    timers.set(b, handle);
  }, [freshBatch]);

  // The surface takes the VALUE only; the batch is bookkeeping this component owns.
  const freshSections = useMemo(() => {
    const map = new Map<SectionId, "1" | "2">();
    for (const [id, a] of armed) map.set(id, a.value);
    return map as ReadonlyMap<SectionId, "1" | "2">;
  }, [armed]);

  // The only cleanup, so a close mid-flash cannot orphan a timer.
  useEffect(() => {
    const timers = freshTimersRef.current;
    return () => {
      for (const handle of timers.values()) clearTimeout(handle);
      timers.clear();
    };
  }, []);

  const navigateWarning = (entry: { id: string; sectionId: SectionId }) => {
    jumpNonceRef.current += 1;
    // The anchor is on the CARD (spec §4.4), so the jump lands on the warning
    // the row named wherever that card renders — including inside a collapsed
    // crew disclosure, which the surface's effect opens before it measures.
    setJump({ itemId: entry.id, sectionId: entry.sectionId, nonce: jumpNonceRef.current });
  };

  const navigateTo = (item: AttentionItem) => {
    jumpNonceRef.current += 1;
    // jumpSectionFor is the SHARED derivation the composition test also calls —
    // see its doc comment. Do not inline `effectiveSectionId(item)` here again:
    // that is what let the jump target drift away from where the card lands
    // without any test noticing.
    setJump({
      itemId: item.id,
      sectionId: jumpSectionFor(item, placement),
      nonce: jumpNonceRef.current,
    });
  };

  // Plain function (React Compiler memoizes; a manual useCallback over doneIds
  // trips react-hooks/preserve-manual-memoization). §9 compound handled here in
  // the event handler — no self-close effect: the LAST actionable item
  // resolving closes an open menu. The ref mirrors doneIds so two resolves
  // completing in the SAME render window compose — the state closure alone is
  // stale for the second completion and would leave the menu open.
  const doneIdsRef = useRef<ReadonlySet<string>>(doneIds);
  const onResolved = (id: string) => {
    const next = new Set([...doneIdsRef.current, id]);
    doneIdsRef.current = next;
    setDoneIds(next);
    const remaining = attentionItems.filter((i) => i.actionable && !next.has(i.id));
    if (remaining.length === 0) {
      clearEscapeClaim(); // W2, intentional
      setMenuOpen(false);
    }
  };

  // Auto-open once per mount (§5.2); the guard consumes only when it DECIDES
  // (opens, or deep-link suppression) — NOT on first render, because the
  // revalidate-on-open router.refresh() above can stream actionable items
  // AFTER a prefetched empty first paint. Once fired it never re-fires, so a
  // user who closed the menu is not re-opened by later refreshes.
  const autoOpenFiredRef = useRef(false);
  useEffect(() => {
    if (autoOpenFiredRef.current) return;
    if (alertId != null) {
      autoOpenFiredRef.current = true; // deep link wins for the whole mount (§6.4)
      return;
    }
    if (menuOpen) {
      // The menu is already open (user click, or a prior auto-open) — the
      // reveal is moot, so consume the one-shot NOW. Without this, an
      // actionable-count blip (1 → 0 → 1) cancels the unconsumed rAF and the
      // rebound re-schedules it, force-REOPENING a menu the reconciliation
      // effect just closed (whole-diff review 2026-07-22, rebound race).
      autoOpenFiredRef.current = true;
      return;
    }
    if (actionable.length === 0) return;
    // rAF wrapper: the open is a paint-time reveal, and the lint contract
    // (react-hooks/set-state-in-effect) forbids the sync form. The guard is
    // consumed INSIDE the callback: a cancelled frame (dep change before
    // paint, or a StrictMode setup→cleanup→setup cycle) must leave the
    // one-shot unconsumed so the re-run can reschedule the open.
    const raf = requestAnimationFrame(() => {
      autoOpenFiredRef.current = true;
      setMenuOpen(true);
    });
    return () => cancelAnimationFrame(raf);
  }, [alertId, actionable.length, menuOpen]);

  // §6.4 one-shot alert_id deep link: a matching item jumps to its banner
  // anchor (aria-current + flash via the surface's attentionJump machinery);
  // no match → the legacy #overview center-scroll fallback. Ref guard =
  // one-shot; a rerender (even a changed alertId) never re-fires.
  const alertScrollFiredRef = useRef(false);
  useEffect(() => {
    if (alertId == null || alertScrollFiredRef.current) return;
    alertScrollFiredRef.current = true;
    const targetId = `alert:${alertId}`;
    const item = attentionItems.find((i) => i.id === targetId);
    if (item) {
      jumpNonceRef.current += 1;
      // Effective section (§3.3): a fallen-back asset/reel item's banner is in
      // Overview, so activate/hash Overview, not its declared route.
      setJump({
        itemId: item.id,
        sectionId: effectiveSectionId(item),
        nonce: jumpNonceRef.current,
      });
      return;
    }
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector("#overview");
    if (target instanceof HTMLElement && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
      return;
    }
    // Overview is no longer unconditional: a show with nothing to report drops
    // the section (and its rail item) entirely. That is EXACTLY the state a
    // no-match alert deep link lands in — a stale link whose alert has since
    // cleared — so without this the fallback would be dead precisely when it
    // fires. Top of the scroller is the honest substitute: the modal opens
    // where it would have anyway.
    if (typeof scroller.scrollTo === "function") scroller.scrollTo({ top: 0 });
    // One-shot (alertScrollFiredRef); effectiveSectionId is a render-local closure
    // over `anchors` — including it would re-fire on every render, and the ref guard
    // already blocks re-fire. Read at mount, when `anchors` is current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertId, attentionItems]);

  // ── Banner placement buckets (§5.4) ────────────────────────────────────────
  const highlightedItemId = alertId != null ? `alert:${alertId}` : null;
  // Plain per-render derivation (React Compiler memoizes; manual useMemo over
  // the unstable onResolved identity only fought the lint contract).
  // `underCrewRow` retired with the identity sub-line (show-alert-compact R6):
  // this card only renders inside the show modal, which already establishes the
  // show, so there was no longer anything for the flag to suppress.
  const bannerFor = (item: AttentionItem) => (
    <AttentionBanner
      key={item.id}
      item={item}
      slug={slug}
      now={now}
      highlighted={item.id === highlightedItemId}
      onResolved={onResolved}
    />
  );
  // Generalized bucketing (attention-alert-routing §2.5/§3.2). Under-row crew
  // placement targets only the RENDERED rows (CREW_CAP slice, §4). The FULL item
  // list is bucketed, not the doneIds-filtered one: a resolved banner swaps to
  // "✓ Confirmed" in place and stays mounted until router.refresh() reconciles
  // (spec §6.3).
  const renderedKeys = renderedCrewKeys; // single source (computed above)
  // `sectionAvailable` = "this section has a MOUNTED attention consumer", not
  // merely "this section renders". Consumers: crew (byCrewKey + sectionTop, in
  // CrewBreakdown), overview (sectionTop, the Overview slot), warnings (the notes
  // banner), and rooms/event ONLY when their content anchor (Diagrams sub-block /
  // opening_reel field) is present. `sectionHasConsumer` (defined above, over the
  // SAME `anchors` map) is the single source for this predicate, the effective
  // section, and the nav dots — so a card routed to an absent anchor falls back to
  // Overview (no drop, never a dead rooms/event sectionTop) and its dot + jump
  // agree with where it renders.
  // §6.3 id-matched crew fan-out resolver over THIS show's roster ids
  // (index-aligned with the rendered crew rows via previewRoster). The resolver
  // applies the CREW_CAP slice internally; an over-cap-blanked previewRoster (the
  // loader empties it past the roster cap) yields no matches → section-top.
  const crewRowResolver = buildCrewRowResolver((data.previewRoster ?? []).map((r) => r.id));
  const sectionAttention = bucketAttention(attentionItems, {
    renderCard: bannerFor,
    ...placement, // the SAME pair resolveEffectiveSection uses (single source)
    crewKeyRendered: (key) => renderedKeys.has(key),
    crewRowIndexesForIds: crewRowResolver,
  });
  const overviewBanners = sectionAttention.get("overview")?.sectionTop ?? [];

  // Effective section (§3.3): a fallen-back asset/reel item's card is in Overview,
  // so it counts toward Overview's badge even though its declared route is rooms/event.
  const overviewActionableCount = actionable.filter(
    (i) => effectiveSectionId(i) === "overview",
  ).length;
  const holdCount = actionable.filter((i) => i.kind === "hold").length;

  // §3.2 degraded notice (copy parity with the retired PerShowAlertSection
  // infra card) — rendered in Overview's attention slot when the alert read
  // faulted; never silently hidden.
  const degradedNotice = alertsDegraded ? (
    <div
      data-testid="attention-degraded-notice"
      className="rounded-md border border-border bg-warning-bg p-tile-pad text-sm text-warning-text"
    >
      <p className="text-base font-semibold">Could not load alerts</p>
      <p>This is usually temporary. Refresh in a moment.</p>
    </div>
  ) : null;

  // §5.1 Overview — the FIRST rail item; badge = overview-routed ACTIONABLE
  // attention count, rendered with the StatusStrip alert-badge token idiom.
  //
  // Overview earns its rail slot only when it HAS something to say. Three
  // relocations (Re-sync to the strip, the share cluster and then the
  // lifecycle control to the hub, the open-sheet link to the header) left it
  // with attention banners plus one line of sheet/sync guidance, and a healthy
  // live show has neither — the section would render an empty box behind a
  // rail item that promises content. Both the item and the panel drop out
  // together; a rail entry whose panel is blank is the worse half.
  //
  // The `#overview` deep links stay safe by construction: the strip's alert
  // badge and the §10 hash target only exist when there ARE alerts, which is
  // exactly when `hasAttention` is true.
  const hasAttention = degradedNotice !== null || overviewBanners.length > 0;
  // `hasActionableWarnings` is NOT a term here any more. It earned its place
  // when actionable warnings made Overview render the correction-loop callout;
  // that callout now lives solely in the Parse warnings panel, so warnings alone
  // give Overview nothing to draw — keeping the term would mount an EMPTY
  // section for a warned show that is neither alerting nor archived, which is
  // the exact state this gate exists to suppress.
  const overviewHasContent = hasAttention || archived;

  const overviewExtra: ExtraSection = {
    id: "overview",
    label: "Overview",
    Icon: LayoutDashboard,
    ...(overviewActionableCount > 0
      ? {
          railBadge: (
            <span
              data-testid="overview-rail-badge"
              className="ml-auto inline-flex shrink-0 items-center rounded-pill bg-warning-bg px-1.5 text-xs font-semibold tabular-nums text-warning-text"
            >
              {/* The count alone reads as a bare number to a screen reader; name
                  the unit. The separator space is its OWN visible text node — a
                  leading space inside the sr-only span is trimmed during
                  accessible-name computation ("3open alerts", memory-#470 class). */}
              {overviewActionableCount}{" "}
              <span className="sr-only">
                open {overviewActionableCount === 1 ? "alert" : "alerts"}
              </span>
            </span>
          ),
        }
      : {}),
    render: () => (
      <OverviewSection
        archived={archived}
        attentionSlot={
          hasAttention ? (
            <div className="flex flex-col gap-2">
              {degradedNotice}
              {overviewBanners}
            </div>
          ) : null
        }
      />
    ),
  };

  // §5.4 Changes — the LAST rail item; badge = pending-hold count (§5.3).
  const changesExtra: ExtraSection = {
    id: "changes",
    label: "Changes",
    Icon: History,
    ...(holdCount > 0
      ? {
          railBadge: (
            <span
              data-testid="changes-rail-badge"
              className="ml-auto inline-flex shrink-0 items-center rounded-pill bg-warning-bg px-1.5 text-xs font-semibold tabular-nums text-warning-text"
            >
              {holdCount}{" "}
              <span className="sr-only">pending {holdCount === 1 ? "change" : "changes"}</span>
            </span>
          ),
        }
      : {}),
    render: () => (
      <ChangesSection
        feed={feed}
        now={now}
        showId={showId}
        undoAction={undoAction}
        acceptAction={acceptAction}
        acceptAllAction={acceptAllAction}
        approveAction={approveAction}
        rejectAction={rejectAction}
      />
    ),
  };

  return (
    <ReviewModalShell
      open={!closing}
      onClose={handleClose}
      onEscapeCapture={handleEscapeCapture}
      // §6.5: this frame always streams in REPLACING the settled Suspense
      // skeleton (which owns the closed→open entrance) — an animated mount
      // here replays the pop-in over an already-opaque modal.
      entrance="none"
      labelledBy={h2Id}
      dataAttrPrefix="review-modal"
      testIdBase={TESTID_BASE}
      initialFocusRef={closeRef}
      header={
        // TWO children, no outer flex-column wrapper (modal-header-reconciliation
        // §6.2): the control strip has moved out to the `subHeader` band, so
        // there is no second row left inside the header for a column to space.
        // The shell's <header> is `flex items-start gap-3`, so these sit side by
        // side — the text block flexes, the actions cluster stays shrink-0.
        <>
          <div className="min-w-0 flex-1">
            {/* Heading-safe title split (Step3 pattern): the h2 holds ONLY the
                plain title (the dialog's accessible name); the deep link is the
                separate adjacent SheetIconLink. */}
            {/* min-h-tap-min + gap-2.5 + the link's mr-0.5 are the SheetIconLink
                consuming-context requirements (its header): the floor contains
                the overlay's 12px vertical reach short of the subline, the gap
                covers the 10px title-side reach, and mr-0.5 + the shell's gap-3
                give the 14px trailing reach exactly the cluster clearance. */}
            <div className="flex min-h-tap-min min-w-0 items-center gap-2.5">
              <h2 id={h2Id} data-testid={`${TESTID_BASE}-title`} className="min-w-0">
                <span className="min-w-0 wrap-break-word text-lg font-bold tracking-tight text-text-strong max-sm:line-clamp-2">
                  {displayTitle}
                </span>
              </h2>
              {/* §6.2 guard: null → omitted entirely (no dead anchor). */}
              {openSheetHref !== null ? (
                <SheetIconLink
                  href={openSheetHref}
                  subjectLabel={displayTitle}
                  testId={`${TESTID_BASE}-sheetlink`}
                  ringOffset="surface"
                  className="mr-0.5"
                />
              ) : null}
            </div>
            {/* §6.3 subline: client entry (omitted WITH its bullet when null —
                a leading separator with nothing before it is the defect) plus
                the dates entry, which ALWAYS renders so the line never
                disappears. Mirrors Step3ReviewModal.tsx's subline exactly,
                including the "Dates not detected" fallback. */}
            <div
              data-testid={`${TESTID_BASE}-subline`}
              className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-text-subtle"
            >
              {/* §9: instant — deliberate (client presence follows data, not a state transition) */}
              {client !== null ? (
                <>
                  <span className="min-w-0 wrap-break-word">{client}</span>
                  <span
                    aria-hidden="true"
                    className="size-[3px] shrink-0 rounded-pill bg-border-strong"
                  />
                </>
              ) : null}
              <span className="min-w-0 wrap-break-word">
                {segs.length > 0 ? segs.join(" · ") : "Dates not detected"}
              </span>
            </div>
          </div>
          {/* The header bound (spec 2026-08-25-review-modal-strip-dock §3.0).
              A composite alert pill reading "20 issues · 10 monitoring" widens
              this shrink-0 cluster until it starves the min-w-0 flex-1 title
              column beside it, and the title then wraps until the header alone
              is taller than the panel — measured at 587.97px against a 164.19px
              baseline at 375px, which is what put the strip out of reach. 160px
              is the largest cap that leaves every realistic load untouched: the
              sweep in §3.0 ran eight cap values against three loads, 96 changed
              the 0-load baseline and 192 still failed at load 30, and the
              2-item cluster measures 147.73 naturally, below this cap. */}
          <div className={`flex shrink-0 items-center gap-2 ${HEADER_ACTION_CAP}`}>
            {/* Attention pill (published-show-alerts §5.1) — four states from
                the ONE derived list. `before:-inset-y-3` hit-band arithmetic is
                COPIED from the prior pill: text-xs (~16px line box) + py-1
                (8px) ≈ a 24px visible pill; -inset-y-3 (12px per side) ≈ 48px
                ≥ the 44px tap floor. T-TAP probes the resolved band (§10). */}
            {interactive ? (
              /* Composite pill (attention split §3.2): segments render only when
                 their count > 0; the middot separator renders only BETWEEN two
                 present segments, never as the first glyph. The old else-branch
                 that hid the clearing count whenever action items existed is gone. */
              /* `min-w-0` (§3.0): a flex item defaults to `min-width: auto`, so
                 this wrapper's min-content width can force it WIDER than the
                 capped parent. `items-center` on that parent is cross-axis only
                 and transfers no width cap, and nothing else in the chain
                 constrains this element. */
              <div className="relative min-w-0">
                <button
                  ref={pillRef}
                  type="button"
                  data-testid={`${TESTID_BASE}-alert-pill`}
                  aria-expanded={menuOpen}
                  aria-controls={menuId}
                  onClick={() => {
                    clearEscapeClaim(); // W3, intentional
                    setMenuOpen((v) => !v);
                  }}
                  {...(monitoringOnly
                    ? {
                        title: `${selfHeal.length} monitoring, clearing on their own, no action needed`,
                      }
                    : {})}
                  className={`relative inline-flex min-w-0 shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold tabular-nums max-sm:flex-wrap max-sm:justify-end transition-colors duration-fast before:absolute before:inset-x-0 before:-inset-y-3 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface ${
                    monitoringOnly
                      ? /* border separates button-gray from the passive label-gray
                           spans; hover moves the border, never fades toward the
                           page bg (impeccable critique P1+P2, 2026-07-22) */
                        "border border-text-faint bg-surface-sunken text-text hover:border-text-subtle"
                      : /* The boundary is the emphasis this branch was missing.
                           It already had the tinted fill and the filled dot;
                           without an outline it read QUIETER than the monitoring
                           branch beside it, because `text-text` on
                           `bg-surface-sunken` is ~15:1 while `text-warning-text`
                           on `bg-warning-bg` is 8.8:1 — the pill meaning
                           "nothing to do" outranked the one meaning "you are
                           needed" (BL-REVIEW-MODAL-QUIET-PILL-OUTRANKS-URGENT,
                           design doc 2026-08-25-ui-polish-class-sweep-design.md
                           D9). The urgent branch GAINS rather than the
                           monitoring branch dimming: dimming would trade a
                           hierarchy problem for a legibility one on a pill an
                           operator has to read. `border-warning-text` is the
                           plate's own text colour, 8.79:1 light / 9.64:1 dark
                           against the fill it encloses. */
                        "border border-warning-text bg-warning-bg text-warning-text hover:bg-warning-bg/80"
                  }`}
                >
                  {/* Decorative dot — the count text carries the meaning; live
                      token (--color-status-review), never the mock hex. The
                      quiet monitoring-only pill leads with the hollow
                      positive-tone dot instead (spec §3.1). */}
                  <span
                    aria-hidden="true"
                    className={`size-2 shrink-0 rounded-pill ${
                      monitoringOnly
                        ? "border-[1.5px] border-status-positive bg-transparent"
                        : "bg-status-review"
                    }`}
                  />
                  {needsYou.length > 0 ? (
                    <>
                      {/* Capped at 99+ (§11): unbounded count in a shrink-0 group
                          beside Close squeezes the title at 375px. Exact count is
                          preserved for assistive tech past the cap only.
                          "issues" is a NOUN (§2.4) and pluralises with a plain s
                          — "N need you" would have required a subject-verb
                          agreement branch at N = 1. */}
                      {needsYou.length > 99 ? "99+" : needsYou.length}{" "}
                      {needsYou.length === 1 ? "issue" : "issues"}
                      {needsYou.length > 99 ? (
                        <>
                          {/* Separator is its OWN visible text node (accName trim
                              class, memory #470). */}{" "}
                          <span className="sr-only">({needsYou.length} issues)</span>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {/* Sheet-warnings segment (spec §4.2). ONE wrap unit exactly
                      like the monitoring segment below, for the same reason: as
                      a standalone flex item the separator could land last on
                      line 1 under `max-sm:flex-wrap` and read as a typo. Same
                      ink as the issues segment and no alpha — a warning is
                      work, not monitoring. */}
                  {k > 0 ? (
                    <>
                      <span className="inline-flex items-center gap-1.5">
                        {needsYou.length > 0 ? <span className="opacity-50">{" · "}</span> : null}
                        <span
                          data-testid="attention-pill-warnings-segment"
                          className="inline-flex items-center gap-1"
                        >
                          {k > 99 ? "99+" : k} {k === 1 ? "sheet warning" : "sheet warnings"}
                        </span>
                      </span>
                      {k > 99 ? (
                        <>
                          {" "}
                          <span className="sr-only">({k} sheet warnings)</span>
                        </>
                      ) : null}
                    </>
                  ) : null}
                  {/* Middot separators are REAL " · " text nodes (visible AND in
                      the announced string — aria-hidden middots glue segments
                      into "issues2 monitoring" for AT; #537 space-node rule). */}
                  {selfHeal.length > 0 ? (
                    <>
                      {/* Separator only BETWEEN segments — never a leading
                          glyph on the monitoring-only pill (spec §3.1).
                          The `inline-flex` pair wrapper below is load-bearing,
                          and round 4's critique (F3, P3) is why. As a STANDALONE
                          flex item the separator could land last on line 1 when
                          the pill wraps under `max-sm:flex-wrap`, so a 30-item
                          load at 375px read "● 20 issues ·" / "○ 10 monitoring"
                          — a dangling middot that scans as a typo. Binding the
                          separator to the monitoring segment inside ONE flex
                          item makes them a single wrap unit, so the middot leads
                          line 2 instead of orphaning on line 1.
                          NOT `display: contents` — that removes the wrapper from
                          layout and hands both children back to the parent as
                          separate flex items, which is exactly the orphaning
                          this fixes. The separator stays a REAL " · " text node,
                          visible and announced (#537 space-node rule); hiding it
                          below `sm` was the other option and would have taken
                          the glyph out of the announced string. */}
                      <span className="inline-flex items-center gap-1.5">
                        {needsYou.length > 0 || k > 0 ? (
                          <span className="opacity-50">{" · "}</span>
                        ) : null}
                        {/* /80 floor: /70 computes 4.01:1 over --color-warning-bg in
                          light theme (below AA 4.5:1 at text-xs); /80 is ~5.35:1
                          light, higher dark. Impeccable critique P1, 2026-07-22. */}
                        <span
                          data-testid="attention-pill-monitoring-segment"
                          className={`inline-flex items-center gap-1 font-medium ${
                            monitoringOnly ? "text-text-subtle" : "text-warning-text/80"
                          }`}
                        >
                          {/* hollow positive-tone dot (spec §3.2) — same cue as the
                            monitoring-only pill, distinct from the solid review
                            dot. Omitted on the monitoring-only pill, whose
                            LEADING dot is already the hollow cue (no double dot). */}
                          {monitoringOnly ? null : (
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
                            />
                          )}
                          {selfHeal.length > 99 ? "99+" : selfHeal.length} monitoring
                        </span>
                      </span>
                      {selfHeal.length > 99 ? (
                        <>
                          {" "}
                          <span className="sr-only">({selfHeal.length} monitoring)</span>
                        </>
                      ) : null}
                      {/* Inherited sr-only expansion (#537 mechanism): visible terse,
                          full sentence for AT; space is a real text node. */}{" "}
                      <span className="sr-only">clearing on their own, no action needed</span>
                    </>
                  ) : null}
                  {/* Lucide chevron (codebase icon idiom), not the ⌃/⌄ text
                      glyphs — ⌃ is the macOS Control symbol and its baseline
                      drifts across platform fonts. */}
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-3 shrink-0 transition-transform duration-fast ease-out-quart motion-reduce:transition-none ${
                      monitoringOnly ? "text-text-subtle" : "text-warning-text"
                    } ${menuOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div id={menuId}>
                  <AttentionMenu
                    items={live}
                    open={menuEffectivelyOpen}
                    onClose={() => {
                      clearEscapeClaim(); // W4, all five sources, intentional
                      setMenuOpen(false);
                    }}
                    onNavigate={navigateTo}
                    pillRef={pillRef}
                    {...(k > 0
                      ? {
                          warningIndex: { entries: sheetWarnings.all, onNavigate: navigateWarning },
                        }
                      : {})}
                  />
                </div>
              </div>
            ) : alertsDegraded && selfHeal.length === 0 ? (
              /* §5.1 degraded row: only when no hold carried the pill into the
                 To-confirm state; the Overview notice card is the detail. */
              <span
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-subtle"
              >
                Alerts unavailable
              </span>
            ) : (
              /* §5.1 in-sync state (S3C-1 clean-dot recipe, DESIGN.md §92).
                 `min-w-0` AND NO `shrink-0`, on both static pills. Round 2 added
                 `min-w-0` alone and round 3 showed it cannot work: `min-w-0`
                 only lowers the automatic minimum, and `flex-shrink: 0` means
                 the item never contracts regardless. The cap was unenforceable
                 on these two branches. Measured in that round: "Alerts
                 unavailable" is ~104px at 12px semibold in Inter, and with
                 padding, the 8px cluster gap and the 44px close target the row
                 reaches ~176px against a 160px cap.
                 Round 4's fresh critique (F1, P2) refuted what this comment
                 used to claim. It said `truncate` made shrinking
                 non-destructive because the label "ellipsises rather than
                 overflowing". That is false as written: `truncate` puts
                 `text-overflow: ellipsis` on this `inline-flex` container, the
                 label is an ANONYMOUS FLEX ITEM inside it, and `text-overflow`
                 does not inherit into that item. The browser clipped with no
                 ellipsis drawn — "Alerts unavailab" cut hard against the pill
                 edge below `sm`, where the capped cluster leaves ~108px and the
                 label needs ~124px.
                 `truncate` is therefore REMOVED from both static pills. Without
                 `whitespace-nowrap` the copy wraps inside the `min-w-0` box, so
                 shrinking stays non-destructive AND no copy is cut, which is
                 what spec §3.0 asks for and what the button pill at :991
                 already does with `max-sm:flex-wrap`. The in-sync branch gets
                 the same treatment even though its shorter copy fits today;
                 that it fits is a property of the string, not of the layout. */
              <span
                data-testid={`${TESTID_BASE}-alert-pill`}
                className="inline-flex min-w-0 items-center gap-1.5 rounded-pill bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-status-positive-text"
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-pill border-[1.5px] border-status-positive bg-transparent"
                />
                In sync
              </span>
            )}
            <ModalCloseButton ref={closeRef} testId={`${TESTID_BASE}-close`} />
          </div>
        </>
      }
      // The control strip is DOCKED to the panel floor (spec
      // 2026-08-25-review-modal-strip-dock §3.1). It was its own band directly
      // below the header seam — identity above, live controls below
      // (modal-header-reconciliation §6.1) — and that reading survives the move:
      // the controls are still separated from the identity block, just at the
      // other end of the column. What forced the move is that a band pinned
      // under the header rides DOWN with the header, and at 30 attention items
      // the header alone grew taller than the panel, taking the Published
      // switch out of reach entirely. A footer's distance from the panel top
      // does not depend on how tall the header is.
      footer={
        <>
          {/* Freshness announcement (spec 2026-08-03-modal-freshness-cue §4.6).
              The REGION is branch-stable and always mounted: a region that mounts
              at the same moment its text appears is unreliably announced. Its
              CHILD is keyed by batch, because React reconciles an identical string
              onto the same text node and that is not a DOM mutation, so a repeat
              cue with identical copy would otherwise be silent to a screen reader.

              In the `footer` slot, not the body slot: the shell contracts that
              its children mount directly in the panel flex column so the
              consumer's surface root IS the body element, and ShowReviewSurface
              is that sole child. This row is inside the same dialog subtree, so
              the region announces identically — the slot it lives in does not
              change that, which is why the dock is not an announcement change. */}
          <span
            key="freshness-announce"
            role="status"
            aria-live="polite"
            className="sr-only"
            data-testid={`${TESTID_BASE}-freshness-announce`}
          >
            {announced === null ? null : <span key={announced.batch}>{announced.text}</span>}
          </span>
          <div
            data-testid={`${TESTID_BASE}-freshness-band`}
            // `w-full` because the new parent is `flex flex-wrap items-center`
            // (the shell's footer wrapper) rather than a block band: without it
            // this row shrink-wraps its content and the strip's own `w-full`
            // then resolves against the wrong width.
            className="w-full"
            {...(bandFresh !== null ? { "data-section-freshness-flash": bandFresh.value } : {})}
          >
            <StatusStrip
              attentionMenuOpen={menuEffectivelyOpen}
              slug={slug}
              archived={archived}
              published={published}
              finalizeOwned={finalizeOwned}
              setPublished={setPublished}
              isLive={isLive}
              lastSyncedAt={lastSyncedAt}
              lastCheckedAt={lastCheckedAt}
              lastSyncStatus={lastSyncStatus}
              now={now}
              showId={showId}
              crewEmails={crewEmails}
              showTitle={title ?? slug}
              pickerCrew={pickerCrew}
              archiveAction={archiveAction}
              unarchiveAction={unarchiveAction}
              // Dev-capture snapshot (spec 2026-07-22 §4.3): the allowlist runs at
              // capture time over this modal's own data props; crewEmails/pickerCrew
              // and every callback never enter it.
              devCaptureSnapshot={() =>
                buildPublishedSnapshot({
                  slug,
                  showId,
                  title,
                  archived,
                  published,
                  finalizeOwned,
                  isLive,
                  lastSyncedAt,
                  lastCheckedAt,
                  lastSyncStatus,
                  alertsDegraded,
                  alertId,
                  openSheetHref,
                  attentionItems,
                  feed,
                  bySection,
                  data,
                })
              }
            />
          </div>
        </>
      }
    >
      {/* Body: the surface mounts DIRECTLY in the panel flex column (shell
          contract) — its root is the body element, its internal scroller fills
          it. syncHash explicit: the modal keeps the page's hash deep links
          (§6.4; the modal-layout default is false). */}
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="modal"
        syncHash
        extraSectionsBefore={overviewHasContent ? [overviewExtra] : []}
        extraSectionsAfter={[changesExtra]}
        renderSectionExtras={renderSectionExtras}
        routedWarnings={routedWarnings}
        attentionSections={attentionSections}
        attentionJump={jump}
        sectionAttention={sectionAttention}
        crewUnderRowCards={crewUnderRowCards}
        freshSections={freshSections}
      />
    </ReviewModalShell>
  );
}
