"use client";

/**
 * components/admin/wizard/step3ReviewSections.tsx (Task 3 — spec §6.1/§8/§3.10/§13)
 *
 * The Step-3 review SECTION MODULE: every breakdown body (moved out of
 * Step3SheetCard.tsx, restyled per spec §8's Variant-B grammar) plus the
 * section REGISTRY (`step3Sections` + `STEP3_SECTION_GROUPS`, spec §6.1) the
 * new review modal renders from. Dependency direction is one-way: the card
 * imports from this module; this module never imports the card (no cycle).
 *
 * Restyle contract (spec §8): presentation only. Every existing cap,
 * overflow note, disclosure, empty-state copy string, `hasContent` guard,
 * `partialAttendanceLabel` / `labelFromRawSnippet` behavior, and every
 * `-breakdown-*` testid is preserved verbatim — existing suites pin them.
 *
 * Warning-title hardening (spec §8, invariant 5): `reviewWarningTitle` is the
 * single title derivation for the warnings panel. Persisted warnings exist
 * whose `message` IS the raw code (`reelWarning`, lib/sync/phase2.ts —
 * e.g. OPENING_REEL_UNREADABLE); the guard clauses below keep any machine
 * token out of the UI.
 *
 * Tokens only (DESIGN.md §10): no hardcoded hex / ms / px outside the
 * spec-pinned grid track sizes (7.5rem / 5rem / 1.25rem, spec §8 table).
 */
import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  BedDouble,
  CalendarDays,
  Check,
  ChevronRight,
  ExternalLink,
  FileText,
  ImageOff,
  Images,
  Info,
  LayoutGrid,
  Lightbulb,
  Mail,
  MapPin,
  MessageSquareWarning,
  Minus,
  Package,
  Phone,
  Receipt,
  Sparkles,
  Theater,
  Truck,
  Users,
  Video,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import type {
  AgendaEntry,
  ArchivedPullSheetTab,
  ClientContact,
  ContactRow,
  CrewMemberRow,
  HotelReservationRow,
  ParseResult,
  ParseWarning,
  PullSheetCase,
  PullSheetItem,
  RoomRow,
  RunOfShow,
  ShowRow,
  TransportationRow,
} from "@/lib/parser/types";
import { useRouter } from "next/navigation";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import { SECTION_REGION_MAP, type SectionId } from "@/lib/admin/step3SectionStatus";
import { buildRawUnrecognizedView } from "@/lib/admin/rawUnrecognized";
import { isMessageCode, messageFor } from "@/lib/messages/lookup";
import {
  hasStagedPreviewSource,
  isRenderableDiagramStub,
  trustedDriveFolderHref,
} from "@/lib/admin/stagedDiagramGuards";
import type { MessageCode } from "@/lib/messages/catalog";
import { humanizeDate, humanizeDayRange } from "@/lib/dates/humanize";
import { formatIsoDate } from "@/lib/format/date";
import { avatarColor } from "@/lib/crew/avatarColor";
import { deriveInitials } from "@/components/atoms/Avatar";
import { renderEmphasis } from "@/components/messages/renderEmphasis";
import { buildSheetDeepLink, type SourceAnchor } from "@/lib/sheet-links/buildSheetDeepLink";
import { stripOpeningReelText } from "@/lib/visibility/openingReelText";
import { EVENT_DETAILS_LABELS } from "@/lib/crew/eventDetailsSpecs";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";
import {
  resolveOptionalField,
  formatScheduleWindow,
  aggregateDays,
  showStartDisplayEntry,
  type SchedulePhase,
} from "@/lib/crew/agendaDisplay";
import { shouldHideGenericOptional } from "@/lib/visibility/emptyState";
import { labelFromRawSnippet } from "@/lib/parser/rawSnippet";
import { Avatar } from "@/components/atoms/Avatar";
import { AgendaScheduleBlock } from "@/components/crew/AgendaScheduleBlock";
import type { AdminAgendaItem } from "@/lib/agenda/agendaAdminPreview";
import { VenueMapTile } from "@/components/admin/wizard/VenueMapTile";
import { isParseableUrl } from "@/lib/url/isParseableUrl";
import {
  AGENDA_CLIENT_CONCURRENCY,
  AGENDA_CLIENT_POLL_BUDGET_MS,
  AGENDA_CLIENT_QUEUE_BUDGET_MS,
} from "@/lib/agenda/constants";

// ── §4.3 caps (single source of truth — values unchanged, spec §13) ──
export const CREW_CAP = 30;
export const ROOMS_CAP = 20;
export const HOTELS_CAP = 12;
// Pack-list cases shown in the review breakdown; mirrors the crew GearSection
// CASE_CAP (12) so the operator sees the same ceiling the crew page applies.
export const PACK_LIST_CASES_CAP = 12;
// Items shown per expanded case before a "+K more items" tail. Bounds the
// expanded height so one fat case (e.g. a 31-item distro case) can't dominate
// the breakdown column; deep verification continues on the source sheet.
export const PACK_LIST_ITEMS_CAP = 8;
export const SCHEDULE_DAYS_CAP = 14;
export const SCHEDULE_ENTRIES_CAP = 6;

// Per-room equipment-scope disciplines shown under each room in the review
// breakdown so the operator can VERIFY parsed gear (GEAR-tab + INFO A/V/L)
// before publishing. Parsed values render AS-PARSED (sentinels like "TBD"/"-"
// included) — this is a parse-review surface, not the crew page (which
// sentinel-hides), so the operator sees exactly what landed. All five rows
// ALWAYS render (rooms-scope-cards redesign, 2026-07-04): an unparsed
// discipline reads a muted "Not specified", stating fact rather than asserting
// an intentional call. Order + glyphs mirror the crew GearSection
// (A→V→L→Scenic→Other). `color` is a single mid-lightness OKLCH per discipline
// (mock parity) — readable on the sunken icon chip in both light and dark.
const ROOM_SCOPE: ReadonlyArray<{
  label: string;
  key: keyof RoomRow;
  Icon: LucideIcon;
  color: string;
}> = [
  { label: "Audio", key: "audio", Icon: Volume2, color: "oklch(0.60 0.12 25)" },
  { label: "Video", key: "video", Icon: Video, color: "oklch(0.57 0.11 255)" },
  { label: "Lighting", key: "lighting", Icon: Lightbulb, color: "oklch(0.63 0.11 75)" },
  { label: "Scenic", key: "scenic", Icon: Theater, color: "oklch(0.55 0.10 155)" },
  { label: "Other", key: "other", Icon: Package, color: "oklch(0.55 0.10 300)" },
];

// Copy shown for a discipline that did not parse. Deliberately NOT the mock's
// literal "Not needed" (which asserts an intentional decision) — on a
// parse-review surface a blank cell may simply be a gap. (owner decision,
// 2026-07-04; PRODUCT.md "missing data is a human sentence".)
const ROOM_SCOPE_UNSPECIFIED = "Not specified";

// A discipline whose gear is effectively empty — either unparsed (null → renders
// "Not specified") or an explicit "N/A" / "Not specified" sentinel from the
// sheet. These sort BELOW disciplines that carry real gear (owner decision,
// 2026-07-05) so the operator sees what's actually scoped first. Matched
// case-insensitively; leading/trailing whitespace tolerated.
function isEmptyScopeValue(value: string | null): boolean {
  if (value === null) return true;
  return /^\s*(n\/?a|not\s*specified)\s*$/i.test(value);
}

// Humanized room-kind labels for the header pill (replaces the raw enum the
// legacy flat list rendered). RoomKind is a closed 3-value union, so the map is
// exhaustive — a new kind is a compile error here.
const ROOM_KIND_LABEL: Record<RoomRow["kind"], string> = {
  gs: "General session",
  breakout: "Breakout",
  additional: "Additional",
};

/** A string field that actually parsed to content (non-null, non-whitespace). */
export function hasContent(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * A room "counts" for the Rooms & scope tally only when at least one of its five
 * A/V disciplines (audio/video/lighting/scenic/other) carries real gear. A room
 * whose every discipline is unparsed OR an explicit "N/A" / "Not specified"
 * sentinel — e.g. an "additional rooms" placeholder that only holds a setup note
 * — is not an A/V scope, so it is excluded from the count (owner decision,
 * 2026-07-06). The room still RENDERS in the breakdown; only the header/rail
 * count changes. Mirrors the per-discipline emptiness test used for scope sort.
 */
export function roomHasScope(r: RoomRow): boolean {
  return ROOM_SCOPE.some((scope) => {
    const value = hasContent(r[scope.key]) ? (r[scope.key] as string) : null;
    return !isEmptyScopeValue(value);
  });
}

/**
 * Build {label,value} rows from [label, rawValue] pairs, keeping only as-parsed
 * content (hasContent — non-null, non-whitespace string). Used by the operator
 * review-modal field-group sections (Venue / Ops / Transport / Contacts).
 */
export function contentRows(
  pairs: ReadonlyArray<readonly [string, unknown]>,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  // Coerce-then-keep (String().trim(), length > 0) — matches the EventDetails +
  // RoomsDetail modal sections (#195/#197): a non-string JSONB value still shows
  // as text, sentinels (TBD/N/A) show as-parsed, empty/whitespace is omitted.
  for (const [label, val] of pairs) {
    const value = String(val ?? "").trim();
    if (value.length > 0) out.push({ label, value });
  }
  return out;
}

// Defensive coercion for the untyped-on-the-wire JSONB (§4.3/§4.6): anything
// that isn't an array becomes [].
export function arr<T>(value: T[] | undefined | null): T[] {
  return Array.isArray(value) ? value : [];
}

// ── Summary date rendering (§4.2 / plan Task 3; moved here in Task 4 so the
// review modal's header subline reuses it without importing the card — the
// dependency direction stays one-way: card → this module ← modal). Each
// present role becomes a "Label <date>" segment; show-days collapse into a
// single humanized range. `set` is dropped when it equals `travelIn` (the
// common "travel-and-set same day" case) so the line doesn't read the date
// twice. Empty/malformed values omit their segment; no dates at all → [].
// humanizeDate falls back to the raw ISO if a value is somehow unparseable so
// a present date is never silently dropped. */
export function dateSummarySegments(dates: ParseResult["show"]["dates"] | undefined): string[] {
  if (!dates) return [];
  const segs: string[] = [];
  if (dates.travelIn) segs.push(`Travel in ${humanizeDate(dates.travelIn) ?? dates.travelIn}`);
  if (dates.set && dates.set !== dates.travelIn) {
    segs.push(`Set ${humanizeDate(dates.set) ?? dates.set}`);
  }
  const showDays = arr(dates.showDays);
  if (showDays.length > 0) {
    // Fall back to the raw first–last ISO if humanizing fails, mirroring the
    // `humanizeDate(...) ?? raw` guard used for travelIn/set/travelOut — a
    // present show-day is never silently dropped (whole-diff review MEDIUM).
    const range =
      humanizeDayRange(showDays) ??
      (showDays.length === 1
        ? (showDays[0] ?? "")
        : `${showDays[0] ?? ""} – ${showDays[showDays.length - 1] ?? ""}`);
    if (range) segs.push(`Show ${range}`);
  }
  if (dates.travelOut) segs.push(`Travel out ${humanizeDate(dates.travelOut) ?? dates.travelOut}`);
  return segs;
}

/** A "+K more" tail line, or null when nothing is truncated. */
export function overflowNote(total: number, cap: number, noun: string): string | null {
  const extra = total - cap;
  return extra > 0 ? `…and ${extra} more ${noun}` : null;
}

/** The shared eyebrow-key style (spec §8 field-list grammar). */
const EYEBROW_CLASS = "text-xs font-semibold uppercase text-text-subtle";
const EYEBROW_STYLE = { letterSpacing: "var(--tracking-eyebrow)" } as const;

/**
 * Vertical label:value list shared by the review-modal field-group sections.
 * Restyled to the mock's `fieldlist` grammar (spec §8): each row a
 * `7.5rem + minmax(0,1fr)` grid, eyebrow key, hairline row separators. The
 * trailing colon on the key is PRESERVED copy ("Venue:", "COI:") — existing
 * suites pin the `Label:` textContent.
 */
export function FieldRowList({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li
          key={r.label}
          className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-b border-border py-2 last:border-0"
        >
          <span className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
            {r.label}:
          </span>
          <span className="wrap-break-word text-sm text-text">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Small identity chip shared by the redesigned Hotels (guest stack) and
 * Transport (driver / load-out) cards. Reuses the crew identity palette
 * (`avatarColor`) + `deriveInitials` so a person's swatch is stable across
 * every surface (DESIGN.md §1.4 identity-avatar exception). `aria-hidden`
 * because the decorated name is always rendered as live text beside it.
 * `sizeClass` carries the diameter + text size; callers add stacking margins.
 */
function MiniAvatar({
  name,
  sizeClass,
  testId,
}: {
  name: string;
  sizeClass: string;
  testId?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid={testId}
      style={{ backgroundColor: avatarColor(name) }}
      className={`grid shrink-0 place-items-center rounded-pill border-2 border-surface font-semibold text-white ${sizeClass}`}
    >
      {deriveInitials(name)}
    </span>
  );
}

/**
 * Nights between an ISO check-in and check-out (both `YYYY-MM-DD`). Returns
 * null when either is missing, unparseable (a sentinel like `TBD`), or the
 * span is non-positive — so the "N nights" pill only appears for a real stay.
 * UTC-pinned (same day-boundary discipline as `formatIsoDate`).
 */
export function nightsBetween(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const a = new Date(`${checkIn}T00:00:00Z`);
  const b = new Date(`${checkOut}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const nights = Math.round((b.getTime() - a.getTime()) / 86_400_000);
  return nights > 0 ? nights : null;
}

/**
 * Event-details grouping (spec "3a Grouped"). The flat 20-field wall clusters
 * under five eyebrow headers; every key in the closed-vocab `EVENT_DETAILS_LABELS`
 * appears in exactly one group so a newly-added spec key can never silently
 * vanish from the review surface (pinned by a completeness test). The four
 * `EVENT_DETAIL_BOOLEAN_KEYS` render as neutral Yes/No state chips; `dress_code`
 * renders as a sunken free-text block; everything else is a label:value row.
 */
export const EVENT_DETAIL_GROUPS: {
  title: string;
  keys: (keyof typeof EVENT_DETAILS_LABELS)[];
}[] = [
  { title: "Stage & scenic", keys: ["stage_size", "podium_type", "led", "scenic", "gooseneck"] },
  {
    title: "Display & content",
    keys: ["test_pattern", "digital_signage", "opening_reel", "fonts"],
  },
  { title: "Production", keys: ["polling", "record", "virtual_speaker", "virtual_audience"] },
  {
    title: "Site & logistics",
    keys: ["equipment_storage", "staff_office_room", "internet", "power"],
  },
  { title: "Wardrobe & key moments", keys: ["keynote_requirements", "dress_code", "notes"] },
];

const EVENT_DETAIL_BOOLEAN_KEYS = new Set<string>([
  "polling",
  "record",
  "virtual_speaker",
  "virtual_audience",
]);

/**
 * Classify a boolean-field value as affirmative / negative for the state chip.
 * Returns null for anything that is neither (a sentinel like `TBD`, or richer
 * free text) so the review surface shows the raw parsed token muted rather than
 * coercing an ambiguous value into a false "No".
 */
function interpretBooleanValue(value: string): "yes" | "no" | null {
  const v = value.trim().toLowerCase();
  if (/^(y|yes|true|yep|yeah)\b/.test(v)) return "yes";
  if (/^(n|no|none|false|nope)\b/.test(v)) return "no";
  return null;
}

/** Uppercase eyebrow label for the redesigned spec cells / group headers. */
const CELL_EYEBROW_CLASS = "text-[10px] font-semibold uppercase tracking-eyebrow text-text-faint";

/**
 * Modal section chrome (Task 5 — spec §6.4/§5.2). The review modal wraps each
 * registry body in this provider; `BreakdownSection` (and `AgendaBreakdown`)
 * then render the §6.4 heading row — icon chip + `<h3>` registry label + the
 * body's EXISTING count + "Needs a look" chip when flagged — plus the §5.2
 * panel card, INSTEAD of the legacy card-context `<h4>` eyebrow. Reusing the
 * body's own `count` keeps the heading count from ever drifting from the body
 * (§6.1 preamble: "every section HEADING keeps its existing count"). Outside
 * the provider (standalone/test mounts — the modal registry is the only
 * production consumer since Task 8 retired Step3DetailsDialog) rendering is
 * byte-identical to before — existing card suites stay green.
 *
 * The heading is `<h3>` so the modal outline stays h2 (title) → h3 (§15); no
 * `id` attributes are emitted anywhere here (§9.4 twin-nav DOM-identity rule).
 */
export type Step3SectionChrome = {
  /** Registry glyph (§6.1) — the rail, chips, and heading row share it. */
  Icon: LucideIcon;
  /** Registry label (§6.1) — ditto (NOT the body's legacy h4 label). */
  label: string;
  /** §7 flagged-set membership (drives icon-chip tone, chip, panel border). */
  flagged: boolean;
  /**
   * Heading level for the §6.4 heading row. Top-level sections use `3` (the
   * default → `<h3>`, keeping the modal outline h2→h3). A section rendered as a
   * SUB-block of another (the Diagrams block folded under Rooms & scope) passes
   * `4` → a smaller, subordinate `<h4>` so it reads as part of its parent
   * section, not a co-equal sibling. Optional/ABSENT elsewhere
   * (exactOptionalPropertyTypes): absent, never `undefined`.
   */
  headingLevel?: 3 | 4;
  /**
   * Follow-ups spec §D3a: stable-identity reader for the modal's shared
   * `active` nav section, consumed by `ReportIssueSection` AT SUBMIT TIME for
   * a stale-free `viewerVisibleSection`. Optional — existing provider mounts
   * stay valid; exactOptionalPropertyTypes: present or ABSENT, never
   * `undefined`. NOT a render-stability contract (the provider keeps passing
   * a fresh inline object each render).
   */
  getActiveSection?: () => SectionId;
  /**
   * Follow-ups spec §E3: the section's warn-severity warning entries from
   * `warningsBySection` (index = position in the FULL warnings array — the
   * jump-target key). Passed by the modal for every flagged section EXCEPT
   * `warnings` (its body IS the warning list — a callout would be circular).
   * Optional/ABSENT everywhere else (exactOptionalPropertyTypes).
   */
  calloutEntries?: readonly { warning: ParseWarning; index: number }[];
  /**
   * Follow-ups spec §E4: jump callback — a full-array warning index scrolls
   * to that row + flashes it; `null` is the "+N more" section-top jump
   * (plain §A2 nav-click semantics, no highlight).
   */
  onJumpToWarning?: (index: number | null) => void;
  /** Testid parts for the §E3 callout (`-section-${id}-flag-callout`) — the
   *  modal (sole provider) always passes both; optional so existing provider
   *  mounts in section tests stay valid. */
  dfid?: string;
  sectionId?: SectionId;
  /**
   * Bug #316 item 3: the staged row's per-region source-sheet anchors
   * (`Step3Row.sourceAnchors`). The modal (sole provider) passes `row.sourceAnchors
   * ?? {}`; each section's heading link resolves its region via SECTION_REGION_MAP.
   * Optional/ABSENT in section-test provider mounts (exactOptionalPropertyTypes) →
   * lookup yields undefined → buildSheetDeepLink #gid=0 fallback.
   */
  sourceAnchors?: Record<string, SourceAnchor>;
};
export const Step3SectionChromeContext = createContext<Step3SectionChrome | null>(null);

// §E3 callout row cap (spec §2 named constant): at most this many warning
// titles render inline; the remainder collapses to "+N more in Parse warnings".
export const CALLOUT_MAX_ENTRIES = 3;

/**
 * §E3 inline flag callout: a compact warning-tone block at the top of a
 * flagged section's panel card linking each mapped warning to its row in the
 * Parse-warnings section. Titles go through `reviewWarningTitle` — the §8
 * hardening (invariant 5, no raw machine tokens) applies transitively.
 */
function SectionFlagCallout({
  dfid,
  sectionId,
  entries,
  onJump,
}: {
  dfid: string;
  sectionId: SectionId;
  entries: readonly { warning: ParseWarning; index: number }[];
  onJump: (index: number | null) => void;
}) {
  const shown = entries.slice(0, CALLOUT_MAX_ENTRIES);
  const extra = entries.length - shown.length;
  return (
    <div
      data-testid={`wizard-step3-card-${dfid}-section-${sectionId}-flag-callout`}
      className="flex flex-col gap-1 rounded-md border border-border-strong bg-warning-bg px-3 py-2 text-xs text-warning-text"
    >
      {shown.map(({ warning, index }) => {
        const title = reviewWarningTitle(warning); // §8 hardening applies transitively
        return (
          <div key={index} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <AlertTriangle aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 wrap-break-word font-medium">{title}</span>
            <button
              type="button"
              onClick={() => onJump(index)}
              className="inline-flex min-h-tap-min items-center font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              View details<span className="sr-only"> for {title}</span>
            </button>
          </div>
        );
      })}
      {/* §H N2: instant — deliberate (overflow line follows the entry count; static with section render) */}
      {extra > 0 ? (
        <button
          type="button"
          onClick={() => onJump(null)}
          className="inline-flex min-h-tap-min items-center self-start font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          +{extra} more in Parse warnings
        </button>
      ) : null}
    </div>
  );
}

/**
 * Sections whose §6.4 heading shows a count (owner decision, 2026-07-05): only
 * Crew, Contacts, Rooms & scope, and Parse warnings carry a count in the review
 * modal. Every other section drops the parenthetical — the count added noise
 * where the body already reads as a scannable list. This gates the MODAL chrome
 * path only; the legacy (no-chrome) BreakdownSection fallback keeps its count.
 * The nav-rail counterpart is the per-section `railCount` in `step3Sections`
 * (null for the same excluded set) — keep the two in lockstep.
 */
const COUNT_SECTIONS = new Set<SectionId>(["crew", "contacts", "rooms", "warnings"]);

/** §6.4 heading row + §5.2 panel card (shared by BreakdownSection + agenda). */
function ModalSectionChrome({
  chrome,
  count,
  children,
}: {
  chrome: Step3SectionChrome;
  /** The body's existing BreakdownSection count; null → no count (agenda). */
  count: number | null;
  children: React.ReactNode;
}) {
  const { Icon, label, flagged, headingLevel = 3 } = chrome;
  // Level 4 = a SUB-block heading (Diagrams under Rooms & scope): smaller chip +
  // text so it reads as subordinate to its parent section, not a peer.
  const sub = headingLevel === 4;
  const Heading = sub ? "h4" : "h3";
  // Count shows only for the counted subset (COUNT_SECTIONS). A sub-block
  // (Diagrams, no sectionId) never shows one.
  const showCount =
    count !== null && chrome.sectionId !== undefined && COUNT_SECTIONS.has(chrome.sectionId);
  // Per-section "In sheet" deep link (bug #316 item 3): resolve the section's
  // parser region via SECTION_REGION_MAP and pass its persisted source_anchors
  // range to buildSheetDeepLink, so the link opens the sheet AT that section's
  // cells instead of INFO!A1. Absent anchor / null region / missing key →
  // buildSheetDeepLink falls back to `#gid=0` (whole first tab). Excluded: the
  // Diagrams sub-block (no dfid) and the "Report an issue" section (not a region).
  const sheetRegion = chrome.sectionId !== undefined ? SECTION_REGION_MAP[chrome.sectionId] : null;
  const sheetAnchor = sheetRegion ? chrome.sourceAnchors?.[sheetRegion] : undefined;
  const sheetHref =
    chrome.dfid && chrome.sectionId !== undefined && chrome.sectionId !== "report"
      ? buildSheetDeepLink(chrome.dfid, sheetAnchor)
      : null;
  return (
    <>
      <div className={`${sub ? "mb-2" : "mb-3"} flex items-center gap-2.5`}>
        <span
          aria-hidden="true"
          className={`grid ${sub ? "size-6" : "size-7"} shrink-0 place-items-center rounded-sm ${
            flagged ? "bg-warning-bg text-warning-text" : "bg-surface-sunken text-text-subtle"
          }`}
        >
          <Icon className={sub ? "size-3.5" : "size-4"} />
        </span>
        <Heading
          className={`min-w-0 wrap-break-word font-semibold text-text-strong ${
            sub ? "text-sm" : "text-base"
          }`}
        >
          {label}
        </Heading>
        {showCount ? (
          <span className={`shrink-0 tabular-nums text-text-subtle ${sub ? "text-xs" : "text-sm"}`}>
            ({count})
          </span>
        ) : null}
        <span className="flex-1" />
        {flagged ? (
          <span className="shrink-0 rounded-pill border border-border-strong bg-warning-bg px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-warning-text">
            Needs a look
          </span>
        ) : null}
        {/* §11: instant — deliberate (link presence follows data, not a state transition) */}
        {sheetHref ? (
          <a
            data-testid={`wizard-step3-card-${chrome.dfid}-section-${chrome.sectionId}-sheetlink`}
            href={sheetHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the source sheet for ${label}`}
            className="inline-flex min-h-tap-min shrink-0 items-center gap-1 rounded-sm text-xs font-medium whitespace-nowrap text-text-subtle transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            In sheet
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : null}
      </div>
      <div
        className={`flex min-w-0 flex-col gap-1.5 rounded-md border bg-surface p-tile-pad shadow-(--shadow-tile) ${
          flagged ? "border-border-strong" : "border-border"
        }`}
      >
        {/* §H N2: instant — deliberate (callout presence is static with the
            section render — no mount animation; spec §E3 first child) */}
        {chrome.calloutEntries &&
        chrome.calloutEntries.length > 0 &&
        chrome.onJumpToWarning &&
        chrome.dfid !== undefined &&
        chrome.sectionId !== undefined ? (
          <SectionFlagCallout
            dfid={chrome.dfid}
            sectionId={chrome.sectionId}
            entries={chrome.calloutEntries}
            onJump={chrome.onJumpToWarning}
          />
        ) : null}
        {children}
      </div>
    </>
  );
}

/** A labeled breakdown section (varying content shape per §4.3 — never an
 * identical sub-card grid). Inside the review modal's chrome provider it
 * renders the §6.4 heading row + §5.2 panel card instead (see above). */
export function BreakdownSection({
  testId,
  label,
  count,
  children,
}: {
  testId: string;
  label: string;
  /** null → no count (non-list-shaped bodies, e.g. report — Task 7). */
  count: number | null;
  children: React.ReactNode;
}) {
  const chrome = useContext(Step3SectionChromeContext);
  if (chrome) {
    return (
      <section data-testid={testId} className="flex min-w-0 flex-col">
        <ModalSectionChrome chrome={chrome} count={count}>
          {children}
        </ModalSectionChrome>
      </section>
    );
  }
  return (
    <section data-testid={testId} className="flex flex-col gap-1.5">
      <h4 className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
        {label}{" "}
        {count !== null ? <span className="tabular-nums text-text-subtle">({count})</span> : null}
      </h4>
      {children}
    </section>
  );
}

/**
 * The contact "blocks" the contacts body renders (client primary + optional
 * secondary + venue / in-house-AV rows). Extracted so the §6.1 rail count and
 * the body derive the SAME number (count={blocks.length}, the existing
 * contract) without duplicating the shaping logic.
 */
export function contactBlocks(
  clientContact: ClientContact | null,
  contacts: ContactRow[],
): Array<{ key: string; kind: string; name: string; rows: { label: string; value: string }[] }> {
  // Client people: primary + optional secondary (null-safe). Each a "Client
  // contact" (the second flagged "(secondary)" so the operator can tell the lead
  // client rep from the backup). Index keys avoid same-name React key collisions.
  const clientPeople = [clientContact, clientContact?.secondary].filter(Boolean) as {
    name: string;
    phone: string | null;
    email: string | null;
    officePhone?: string | null;
  }[];
  return [
    ...clientPeople.map((p, i) => ({
      key: `client-${i}`,
      kind: i === 0 ? "Client contact" : "Client contact (secondary)",
      name: p.name,
      rows: contentRows([
        ["Phone", p.phone],
        ["Email", p.email],
        ["Office", p.officePhone],
      ]),
    })),
    ...contacts.map((c, i) => ({
      key: `contact-${i}`,
      kind: c.kind === "in_house_av" ? "In-house AV" : "Venue contact",
      name: c.name ?? "",
      rows: contentRows([
        ["Phone", c.phone],
        ["Email", c.email],
      ]),
    })),
  ].filter((b) => hasContent(b.name) || b.rows.length > 0);
}

export function ContactsBreakdown({
  dfid,
  clientContact,
  contacts,
}: {
  dfid: string;
  clientContact: ClientContact | null;
  contacts: ContactRow[];
}) {
  const blocks = contactBlocks(clientContact, contacts);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-contacts`}
      label="Contacts"
      count={blocks.length}
    >
      {blocks.length === 0 ? (
        <p className="text-sm text-text-subtle">No contacts parsed.</p>
      ) : (
        // Crew-row layout (owner decision 2026-07-06): avatar left, name +
        // contact-kind subline, and the phone/email as right-aligned icon-only
        // action buttons — the SAME anchor DOM the CrewBreakdown rows use
        // (size-tap-min hit box wrapping a 32px bordered square). The raw number/
        // address moves into the button's aria-label rather than showing as text.
        <ul className="flex flex-col">
          {blocks.map((b) => {
            const displayName = hasContent(b.name) ? b.name : b.kind;
            return (
              <li key={b.key} className="flex items-center gap-3 py-1">
                <Avatar name={hasContent(b.name) ? b.name : null} />
                <span className="min-w-0 flex-1">
                  <span className="block wrap-break-word text-sm font-medium text-text-strong">
                    {displayName}
                  </span>
                  {hasContent(b.name) ? (
                    <span className="block wrap-break-word text-xs text-text-subtle">{b.kind}</span>
                  ) : null}
                </span>
                {b.rows.length > 0 ? (
                  // Adjacent anchors sit flush (no gap) so the 44×44 hit areas
                  // never overlap; the centered 32px visuals leave a natural gutter.
                  <span className="flex shrink-0 items-center">
                    {b.rows.map((r) => {
                      const isEmail = r.label === "Email";
                      const href = isEmail ? `mailto:${r.value}` : `tel:${r.value}`;
                      const Icon = isEmail ? Mail : Phone;
                      // Distinguish a second (office) phone in the accessible name
                      // so two Call buttons on one contact stay tellable apart.
                      const action = isEmail
                        ? "Email"
                        : r.label === "Office"
                          ? "Call the office for"
                          : "Call";
                      return (
                        <a
                          key={r.label}
                          href={href}
                          data-testid={`wizard-step3-card-${dfid}-contact-${b.key}-${
                            isEmail ? "email" : r.label.toLowerCase()
                          }`}
                          aria-label={`${action} ${displayName}`}
                          className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                        >
                          <span className="grid size-8 place-items-center rounded-sm border border-border text-text-subtle">
                            <Icon aria-hidden="true" className="size-4" />
                          </span>
                        </a>
                      );
                    })}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </BreakdownSection>
  );
}

export function VenueBreakdown({ dfid, venue }: { dfid: string; venue: ShowRow["venue"] }) {
  const rows = venue
    ? contentRows([
        ["Venue", venue.name],
        ["Address", venue.address],
        ["City", venue.city],
        ["Loading dock", venue.loadingDock],
        ["Maps link", venue.googleLink],
      ])
    : [];

  const name = venue?.name?.trim() ?? "";
  const address = venue?.address?.trim() ?? "";
  const city = venue?.city?.trim() ?? "";
  const dock = venue?.loadingDock?.trim() ?? "";
  const mapHref = isParseableUrl(venue?.googleLink) ? venue!.googleLink!.trim() : null;
  // Geocodable query mirrors geocodeQuery (lib/geocoding/client.ts:44). Empty →
  // the parent collapses the map region (never mounts VenueMapTile).
  const query = [name, address].filter(Boolean).join(", ");

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-venue`}
      label="Venue"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No venue details parsed.</p>
      ) : (
        // Full-bleed body: cancel the panel p-tile-pad and clip to its radius so
        // the map divider + dock band reach the card edges (one card, no nesting).
        <div data-testid="venue-body" className="-m-tile-pad overflow-hidden rounded-md">
          {/* Region A: two-column (stacks below sm) */}
          <div className="flex flex-col sm:flex-row sm:items-stretch">
            <div
              data-testid="venue-text-col"
              className="flex min-w-0 flex-1 flex-col gap-1 p-tile-pad"
            >
              <span
                className="text-[10px] font-semibold text-text-faint uppercase"
                style={{ letterSpacing: "var(--tracking-eyebrow)" }}
              >
                Venue
              </span>
              {name ? (
                <span className="text-lg leading-tight font-bold wrap-break-word text-text-strong">
                  {name}
                </span>
              ) : null}
              {address || city ? (
                <span className="mt-1 text-sm/snug text-text-subtle">
                  {address ? <span className="block wrap-break-word">{address}</span> : null}
                  {city ? <span className="block wrap-break-word">{city}</span> : null}
                </span>
              ) : null}
            </div>
            {query ? (
              <div
                data-testid="venue-map-region"
                className="h-40 w-full self-stretch border-t border-border sm:h-auto sm:w-[172px] sm:shrink-0 sm:border-t-0 sm:border-l"
              >
                <VenueMapTile query={query} mapHref={mapHref} />
              </div>
            ) : null}
          </div>
          {/* Region B: loading-dock footer — only when present */}
          {dock ? (
            <div
              data-testid="venue-dock"
              className="flex items-start gap-2.5 border-t border-border bg-surface-sunken p-tile-pad"
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-sm border border-border bg-surface text-accent-on-bg"
              >
                <Truck className="size-3.5" />
              </span>
              <div className="min-w-0">
                <span
                  className="text-[10px] font-semibold text-text-faint uppercase"
                  style={{ letterSpacing: "var(--tracking-eyebrow)" }}
                >
                  Loading dock
                </span>
                <p className="mt-0.5 text-sm/snug wrap-break-word text-text">{dock}</p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </BreakdownSection>
  );
}

export function TransportBreakdown({
  dfid,
  transportation,
}: {
  dfid: string;
  transportation: TransportationRow | null;
}) {
  const t = transportation;
  const fieldRows = t
    ? contentRows([
        ["Driver", t.driver_name],
        ["Driver phone", t.driver_phone],
        ["Driver email", t.driver_email],
        ["Load out", t.loadout_name],
        ["Load out phone", t.loadout_phone],
        ["Load out email", t.loadout_email],
        ["Vehicle", t.vehicle],
        ["License plate", t.license_plate],
        ["Color", t.color],
        ["Parking", t.parking],
        ["Notes", t.notes],
      ])
    : [];
  // Route nodes: each schedule leg with a real stage becomes a route dot with
  // its humanized when-line and any assigned passengers (review completeness).
  const routeLegs = (t ? arr(t.schedule) : [])
    .filter((leg) => hasContent(leg.stage))
    .map((leg) => ({
      stage: leg.stage as string,
      when: [leg.date, leg.time].filter((x) => hasContent(x)).join(" "),
      names: arr(leg.assigned_names).filter((n) => hasContent(n)),
    }));
  const count = fieldRows.length + routeLegs.length;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-transport`}
      label="Transport"
      count={count}
    >
      {count === 0 || !t ? (
        <p className="text-sm text-text-subtle">No transportation parsed.</p>
      ) : (
        <TransportBody t={t} routeLegs={routeLegs} />
      )}
    </BreakdownSection>
  );
}

/** One sunken spec cell in the compact transport strip: eyebrow + stacked lines. */
function TransportCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1.5 rounded-md bg-surface-sunken px-3 py-2.5 text-center">
      <span className={CELL_EYEBROW_CLASS}>{label}</span>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

/** Driver / Load-out contact cell — avatar + name, tel + mailto, as-parsed. */
function ContactCell({
  label,
  name,
  phone,
  email,
}: {
  label: string;
  name: string | null;
  phone: string | null;
  email: string | null;
}) {
  return (
    <TransportCell label={label}>
      {hasContent(name) ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <MiniAvatar name={name} sizeClass="size-5 text-[8px]" />
          <span className="min-w-0 wrap-break-word text-xs font-medium text-text">{name}</span>
        </span>
      ) : null}
      {hasContent(phone) ? (
        <a
          href={`tel:${phone.replace(/[^\d+]/g, "")}`}
          className="flex items-center gap-1 text-[11px] tabular-nums text-text-subtle hover:text-text"
        >
          <Phone className="size-3 shrink-0" aria-hidden="true" />
          {phone}
        </a>
      ) : null}
      {hasContent(email) ? (
        <a
          href={`mailto:${email}`}
          className="flex min-w-0 items-center gap-1 text-[11px] text-text-subtle hover:text-text"
        >
          <Mail className="size-3 shrink-0" aria-hidden="true" />
          <span className="min-w-0 wrap-break-word">{email}</span>
        </a>
      ) : null}
    </TransportCell>
  );
}

/**
 * Compact transport body (spec "1b Compact"): a responsive spec strip of
 * Driver / Load-out / Vehicle / Parking cells (each present only when it has
 * real content) above a horizontal Route timeline of the schedule legs, with
 * the free-text transport notes last. `t` is non-null (the caller renders the
 * empty state when count is 0).
 */
function TransportBody({
  t,
  routeLegs,
}: {
  t: TransportationRow;
  routeLegs: { stage: string; when: string; names: string[] }[];
}) {
  const hasDriver =
    hasContent(t.driver_name) || hasContent(t.driver_phone) || hasContent(t.driver_email);
  const hasLoadout =
    hasContent(t.loadout_name) || hasContent(t.loadout_phone) || hasContent(t.loadout_email);
  const vehicleSubs = [t.license_plate, t.color].filter((x) => hasContent(x)) as string[];
  const hasVehicle = hasContent(t.vehicle) || vehicleSubs.length > 0;
  const hasParking = hasContent(t.parking);
  const cellCount = [hasDriver, hasLoadout, hasVehicle, hasParking].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-4">
      {cellCount > 0 ? (
        <div className="grid grid-cols-2 gap-2 min-[560px]:grid-cols-3">
          {hasDriver ? (
            <ContactCell
              label="Driver"
              name={t.driver_name}
              phone={t.driver_phone}
              email={t.driver_email}
            />
          ) : null}
          {hasLoadout ? (
            <ContactCell
              label="Load out"
              name={t.loadout_name}
              phone={t.loadout_phone}
              email={t.loadout_email}
            />
          ) : null}
          {hasVehicle ? (
            <TransportCell label="Vehicle">
              {hasContent(t.vehicle) ? (
                <span className="wrap-break-word text-xs font-medium text-text">{t.vehicle}</span>
              ) : null}
              {vehicleSubs.map((s, i) => (
                <span
                  key={i}
                  className={`wrap-break-word text-[11px] ${
                    shouldHideGenericOptional(s) ? "text-text-faint" : "text-text-subtle"
                  }`}
                >
                  {s}
                </span>
              ))}
            </TransportCell>
          ) : null}
          {hasParking ? (
            <TransportCell label="Parking">
              <span className="wrap-break-word text-xs font-medium text-text">{t.parking}</span>
            </TransportCell>
          ) : null}
        </div>
      ) : null}

      {routeLegs.length > 0 ? (
        <div>
          <p className={`${CELL_EYEBROW_CLASS} mb-3`}>Route</p>
          <ol className="relative flex justify-between gap-2">
            <span aria-hidden="true" className="absolute inset-x-[8%] top-[6px] h-0.5 bg-border" />
            {routeLegs.map((leg, i) => (
              <li
                key={`${leg.stage}-${i}`}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-2 text-center"
              >
                <span
                  aria-hidden="true"
                  className={`box-border size-3.5 rounded-pill ring-2 ring-surface ${
                    i % 2 === 0 ? "bg-accent-on-bg" : "border-2 border-border-strong bg-surface"
                  }`}
                />
                <span className="min-w-0">
                  <span className="block wrap-break-word text-xs font-semibold text-text-strong">
                    {leg.stage}
                  </span>
                  {leg.when ? (
                    <span className="mt-0.5 block text-[11px] tabular-nums text-text-subtle">
                      {leg.when}
                    </span>
                  ) : null}
                  {leg.names.length > 0 ? (
                    <span className="mt-0.5 block wrap-break-word text-[11px] text-text-faint">
                      {leg.names.join(", ")}
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {hasContent(t.notes) ? (
        <p className="wrap-break-word text-sm text-text-subtle">{t.notes}</p>
      ) : null}
    </div>
  );
}

export function OpsBreakdown({ dfid, show }: { dfid: string; show: ShowRow }) {
  const rows = contentRows([
    ["COI", show.coi_status],
    ["Proposal", show.proposal],
    ["PO#", show.po],
    ["Invoice", show.invoice],
    ["Invoice notes", show.invoice_notes],
  ]);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-ops`}
      label="Billing & docs"
      count={rows.length}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No billing details parsed.</p>
      ) : (
        <FieldRowList rows={rows} />
      )}
    </BreakdownSection>
  );
}

export function CrewBreakdown({ dfid, members }: { dfid: string; members: CrewMemberRow[] }) {
  const shown = members.slice(0, CREW_CAP);
  const note = overflowNote(members.length, CREW_CAP, "people");
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-crew`}
      label="Crew"
      count={members.length}
    >
      {members.length === 0 ? (
        <p className="text-sm text-text-subtle">No crew parsed.</p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((m, i) => {
            const partial = partialAttendanceLabel(m.date_restriction, { humanize: false });
            const name = m.name || "Unnamed";
            const subline = [m.role, partial].filter((x): x is string => hasContent(x)).join(" · ");
            return (
              <li key={`${m.name}-${i}`} className="flex items-center gap-3 py-1">
                <Avatar name={m.name || null} />
                <span className="min-w-0 flex-1">
                  <span className="block wrap-break-word text-sm font-medium text-text-strong">
                    {name}
                  </span>
                  {subline ? (
                    <span className="block wrap-break-word text-xs text-text-subtle">
                      {subline}
                    </span>
                  ) : null}
                </span>
                {/* §8 exact anchor DOM: the INTERACTIVE <a> is the 44×44
                    border box (`size-tap-min`); the bordered 32px square is a
                    nested NON-interactive visual. Adjacent anchors sit flush
                    (no gap, no negative margins) so hit areas never overlap;
                    the centered visuals leave a natural 12px gutter. */}
                <span className="flex shrink-0 items-center">
                  {hasContent(m.phone) ? (
                    <a
                      href={`tel:${m.phone}`}
                      aria-label={`Call ${name}`}
                      className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <span className="grid size-8 place-items-center rounded-sm border border-border text-text-subtle">
                        <Phone aria-hidden="true" className="size-4" />
                      </span>
                    </a>
                  ) : null}
                  {hasContent(m.email) ? (
                    <a
                      href={`mailto:${m.email}`}
                      aria-label={`Email ${name}`}
                      className="inline-flex size-tap-min items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                    >
                      <span className="grid size-8 place-items-center rounded-sm border border-border text-text-subtle">
                        <Mail aria-hidden="true" className="size-4" />
                      </span>
                    </a>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

/**
 * One day's run-of-show (plan Task 2). The day's entries render as a SINGLE
 * 2-track grid so times and titles each align to one column.
 *
 * Dimensional invariant (Tailwind v4 does NOT default `align-items: stretch`):
 *   - The grid is `grid-cols-[auto_1fr]`. The `auto` track sizes to the WIDEST
 *     time across this day's entries, so ALL time cells share one left edge.
 *   - The `1fr` track's left edge is constant, so ALL title cells share one
 *     left edge regardless of time width. (`tabular-nums` only equalizes digit
 *     glyphs; it does NOT align variable-length times like "9:00 AM" vs
 *     "11:00 AM" — the shared `auto` track is what guarantees the column.)
 *   - `items-baseline` aligns each row's time/title on the text baseline.
 *
 * Truncation is replaced by in-place disclosure: the first SCHEDULE_ENTRIES_CAP
 * entries show; a "Show all M times" button reveals the rest for THIS day only
 * (local state). No silent "…+N" tail. (Spec §8: schedule grid unchanged.)
 */
export function ScheduleDayRow({
  dfid,
  iso,
  entries,
  showStart = null,
  window: dayWindow = null,
  showEnd = null,
  phase = null,
  label = null,
}: {
  dfid: string;
  iso: string;
  entries: AgendaEntry[];
  showStart?: string | null;
  window?: { start: string; end: string } | null;
  showEnd?: string | null;
  // Structural aggregate phase — gates the synthesized "Show Start" entry to Show
  // days only (a Set/travel date colliding with a show date must not be relabeled).
  // null for an off-schedule ros-only day.
  phase?: SchedulePhase | null;
  // Aggregate-day display label ("Travel In"/"Set"/"Show Day N"/"Travel Out"); null
  // for an off-schedule ros-only day (no natural phase). #316 item 1 (surface all
  // days) + item 2 ("Show Day N" numbering — the string is precomputed by
  // aggregateDays; the row just renders it).
  label?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  // Cap-exemption partition (spec §9.4): cap ONLY the agenda group at
  // SCHEDULE_ENTRIES_CAP; ALWAYS render the synthetic group (strike/load-out)
  // after it. The "Show all M times" toggle + overflow count are agenda-only —
  // a same-day load-out is never hidden behind the cap.
  const agenda = entries.filter((e) => e.kind !== "strike" && e.kind !== "loadout");
  const synthetic = entries.filter((e) => e.kind === "strike" || e.kind === "loadout");
  const visibleAgenda = showAll ? agenda : agenda.slice(0, SCHEDULE_ENTRIES_CAP);
  const hidden = agenda.length - SCHEDULE_ENTRIES_CAP;
  // Bare-showStart SHOW day → render the call time as a "Show Start" run-of-show
  // entry instead of a label-less meta line. Renderer-only; gates on phase==="Show"
  // and raw entries.length===0 (see showStartDisplayEntry).
  const showStartRow = showStartDisplayEntry({ showStart, window: dayWindow, entries }, phase);
  // Synthetic rows always follow the (capped) agenda rows in the SAME 2-track
  // grid, so their time/title cells share the agenda rows' column edges.
  const rows = showStartRow != null ? [showStartRow] : [...visibleAgenda, ...synthetic];

  // Fragment-day meta (§#307 Fix 1): a day with no titled entries AND no synthesized
  // Show-Start row surfaces its window / start / end — mirrors the crew ScheduleSection.
  // Sentinel-guarded (resolveOptionalField hides TBD/N/A), so it never renders "Ends TBD".
  // A Show-phase bare showStart becomes showStartRow above (timeMeta skipped); every
  // other case — window, end-only, or a non-Show collision-edge showStart — keeps the
  // original `win ?? start ?? Ends` meta byte-for-byte.
  let timeMeta: string | null = null;
  if (entries.length === 0 && showStartRow == null) {
    const win = dayWindow != null ? formatScheduleWindow(dayWindow) : null;
    const start = resolveOptionalField(showStart ?? undefined) ?? null;
    const end = resolveOptionalField(showEnd ?? undefined) ?? null;
    timeMeta = win ?? start ?? (end != null ? `Ends ${end}` : null);
  }

  return (
    <li className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0">
      {/* Date + phase on ONE line: "May 11 — Travel In" (owner decision
          2026-07-06). The label is APPENDED to the humanized date after an em-dash
          separator rather than sitting on its own uppercase eyebrow line. It keeps
          its per-date testid + AA-normal contrast (text-text-subtle), just inline
          and title-cased as-parsed ("Show Day 2"), not the old uppercase eyebrow. */}
      <span className="text-xs font-medium tabular-nums text-text-strong">
        {humanizeDate(iso) ?? iso}
        {label != null ? (
          <>
            <span aria-hidden="true" className="px-1.5 font-normal text-text-faint">
              —
            </span>
            <span
              data-testid={`wizard-step3-card-${dfid}-sched-phase-${iso}`}
              className="font-normal text-text-subtle"
            >
              {label}
            </span>
          </>
        ) : null}
      </span>
      {timeMeta ? (
        <span
          data-testid={`wizard-step3-card-${dfid}-sched-meta`}
          className="text-sm tabular-nums text-text-subtle"
        >
          {timeMeta}
        </span>
      ) : null}
      <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-0.5">
        {rows.map((e, i) => {
          const isSynthetic = e.kind === "strike" || e.kind === "loadout";
          return (
            <Fragment key={`${iso}-${i}`}>
              <span
                data-testid={`wizard-step3-card-${dfid}-sched-time`}
                className="whitespace-nowrap text-sm tabular-nums text-text-subtle"
              >
                {e.start}
              </span>
              {/* Title cell = the 1fr track. A synthetic entry (strike/load-out)
                  carries a MUTED tone + a leading hairline rule INSIDE this cell
                  (§9.3 "muted-title" option — no kind-word badge that would repeat
                  the title's own leading word), so the two-track alignment holds. */}
              <span
                data-testid={`wizard-step3-card-${dfid}-sched-title`}
                data-entry-kind={isSynthetic ? e.kind : undefined}
                className={`text-sm ${
                  isSynthetic ? "border-l border-border pl-2 text-text-subtle" : "text-text"
                }`}
              >
                {e.title || ""}
              </span>
            </Fragment>
          );
        })}
      </div>
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          data-testid={`wizard-step3-card-${dfid}-sched-expand-${iso}`}
          onClick={() => setShowAll(true)}
          className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          {`Show all ${agenda.length} times`}
        </button>
      ) : null}
    </li>
  );
}

const EMPTY_DATES: ShowRow["dates"] = { travelIn: null, set: null, showDays: [], travelOut: null };

export function ScheduleBreakdown({
  dfid,
  ros,
  dates = EMPTY_DATES,
}: {
  dfid: string;
  ros: RunOfShow;
  dates?: ShowRow["dates"];
}) {
  // Merged day domain (bug #316 item 1) = the full schedule aggregate
  // (travelIn/set/showDays/travelOut, phase-labeled) UNION any ros-only day the
  // parser placed OFF-schedule (strike / load-out / off-schedule agenda —
  // deriveScheduleBookends warns via strikeDateOffSchedule but still emits them;
  // dropping them would regress this review surface). Sorted ASC by ISO. Previously
  // this iterated Object.keys(ros), so bookend/travel days with no run-of-show entry
  // were silently omitted from the wizard preview while the crew page showed them.
  // `label` carries the display text ("Show Day N" for show days — #316 item 2);
  // `phase` stays the structural tag driving the cap-exemption below.
  const aggregate: { date: string; phase: SchedulePhase | null; label: string | null }[] =
    aggregateDays(dates);
  const aggregateDates = new Set(aggregate.map((d) => d.date));
  const rosOnly: { date: string; phase: SchedulePhase | null; label: string | null }[] =
    Object.keys(ros)
      .filter((iso) => !aggregateDates.has(iso))
      .map((iso) => ({ date: iso, phase: null, label: null }));
  const mergedDays = [...aggregate, ...rosOnly].sort((a, b) => a.date.localeCompare(b.date));

  // Day cap: always-show = synthetic-bearing (strike/load-out — a malformed/long
  // sheet could push the admin-only synthetic day past the cap) OR a non-Show
  // aggregate bookend ("Travel In"/"Set"/"Travel Out" — the ≤3 days Doug reported
  // missing; they must never be hidden by the cap). Show days + non-synthetic
  // off-schedule ros days remain cap-subject; the "…and N more days" note counts
  // only those dropped, non-exempt days.
  const isSyntheticDay = (iso: string): boolean =>
    arr(ros[iso]?.entries).some((e) => e.kind === "strike" || e.kind === "loadout");
  const alwaysShown = (d: { date: string; phase: SchedulePhase | null }): boolean =>
    isSyntheticDay(d.date) || (d.phase != null && d.phase !== "Show");
  const shownDays = mergedDays.filter((d, idx) => idx < SCHEDULE_DAYS_CAP || alwaysShown(d));
  const droppedNonExempt = mergedDays.filter(
    (d, idx) => idx >= SCHEDULE_DAYS_CAP && !alwaysShown(d),
  ).length;
  const daysNote = droppedNonExempt > 0 ? `…and ${droppedNonExempt} more days` : null;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-schedule`}
      label="Crew Schedule"
      count={mergedDays.length}
    >
      {mergedDays.length === 0 ? (
        <p className="text-sm text-text-subtle">No run-of-show parsed.</p>
      ) : (
        // Hairline dividers between days (owner decision 2026-07-06); each
        // ScheduleDayRow <li> carries the py-3 + first:/last: reset that pairs
        // with divide-y so the rules sit evenly between days, none at the edges.
        <ul className="flex flex-col divide-y divide-border">
          {shownDays.map((d) => (
            <ScheduleDayRow
              key={d.date}
              dfid={dfid}
              iso={d.date}
              entries={arr(ros[d.date]?.entries)}
              showStart={ros[d.date]?.showStart ?? null}
              window={ros[d.date]?.window ?? null}
              showEnd={ros[d.date]?.showEnd ?? null}
              phase={d.phase}
              label={d.label}
            />
          ))}
        </ul>
      )}
      {daysNote ? <p className="text-xs text-text-subtle">{daysNote}</p> : null}
    </BreakdownSection>
  );
}

export function RoomsBreakdown({ dfid, rooms }: { dfid: string; rooms: RoomRow[] }) {
  const shown = rooms.slice(0, ROOMS_CAP);
  const note = overflowNote(rooms.length, ROOMS_CAP, "rooms");
  // Count only rooms that actually carry A/V scope — a no-A/V placeholder room
  // still renders below but does not inflate the header/rail count (§ owner
  // decision 2026-07-06; see roomHasScope). All rooms still render (shown).
  const scopedCount = rooms.filter(roomHasScope).length;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-rooms`}
      label="Rooms"
      count={scopedCount}
    >
      {rooms.length === 0 ? (
        <p className="text-sm text-text-subtle">No rooms parsed.</p>
      ) : (
        <ul className="flex flex-col gap-3.5">
          {shown.map((r, i) => {
            // Header schedule meta — Set/Show/Strike; keep only parsed values so
            // the row (and its dividers) omit entirely when nothing parsed.
            const times = (
              [
                { label: "Set", value: r.set_time, emphasized: false },
                { label: "Show", value: r.show_time, emphasized: true },
                { label: "Strike", value: r.strike_time, emphasized: false },
              ] as const
            ).filter((t) => hasContent(t.value));
            const setup = hasContent(r.setup) ? r.setup : null;
            const dimensions = hasContent(r.dimensions) ? r.dimensions : null;
            const floor = hasContent(r.floor) ? r.floor : null;
            const hasHeaderBody = times.length > 0 || setup !== null || dimensions !== null;
            return (
              <li
                key={`${r.name}-${i}`}
                data-room-nav={i}
                className="overflow-hidden rounded-md border border-border bg-surface shadow-tile"
              >
                {/* Header — accent-tinted panel (mock --accent-tint). */}
                <div
                  data-testid={`wizard-step3-card-${dfid}-room-${i}-header`}
                  className="flex flex-col gap-2 bg-accent/6 px-3.5 py-3"
                >
                  {/* name + humanized kind pill + floor */}
                  <div
                    className={
                      "flex flex-wrap items-center gap-x-2 gap-y-1" +
                      (hasHeaderBody ? " border-b border-border pb-2.5" : "")
                    }
                  >
                    <span className="wrap-break-word text-sm font-semibold text-text-strong">
                      {r.name || "Room"}
                    </span>
                    <span
                      className="rounded-pill bg-accent/10 px-2 py-0.5 text-[0.625rem] font-semibold uppercase text-accent-on-bg"
                      style={{ letterSpacing: "0.07em" }}
                    >
                      {ROOM_KIND_LABEL[r.kind]}
                    </span>
                    {floor !== null ? (
                      <span className="ml-auto text-xs text-text-subtle">{floor}</span>
                    ) : null}
                  </div>
                  {/* Set · Show · Strike (Show emphasized) — spread full-width,
                      hairline divider below (no border-l side-stripe). */}
                  {times.length > 0 ? (
                    <div
                      data-testid={`wizard-step3-card-${dfid}-room-${i}-times`}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-2.5"
                    >
                      {times.map((t) => (
                        <span key={t.label} className="flex items-baseline">
                          <span
                            className="text-xs font-semibold uppercase text-text-subtle"
                            style={EYEBROW_STYLE}
                          >
                            {t.label}
                          </span>
                          <span
                            className={
                              "ml-1.5 text-xs tabular-nums " +
                              (t.emphasized ? "font-semibold text-accent-on-bg" : "text-text")
                            }
                          >
                            {t.value}
                          </span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {setup !== null ? (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="shrink-0 text-xs font-semibold uppercase text-text-subtle"
                        style={EYEBROW_STYLE}
                      >
                        Setup
                      </span>
                      <span className="wrap-break-word text-xs text-text-subtle">{setup}</span>
                    </div>
                  ) : null}
                  {dimensions !== null ? (
                    <div className="flex items-baseline gap-2">
                      <span
                        className="shrink-0 text-xs font-semibold uppercase text-text-subtle"
                        style={EYEBROW_STYLE}
                      >
                        Room Dimensions
                      </span>
                      <span className="wrap-break-word text-xs tabular-nums text-text">
                        {dimensions}
                      </span>
                    </div>
                  ) : null}
                </div>
                {/* Scope — ALL five disciplines; unparsed reads "Not specified".
                    Disciplines with real gear sort to the top; "N/A" / "Not
                    specified" gear sinks to the bottom (owner decision,
                    2026-07-05). Stable sort → original A→V→L→Scenic→Other order
                    is preserved within each group. */}
                <ul
                  data-testid={`wizard-step3-card-${dfid}-room-${i}-scope`}
                  className="flex flex-col px-3.5 py-1"
                >
                  {ROOM_SCOPE.map((scope) => ({
                    ...scope,
                    value: hasContent(r[scope.key]) ? (r[scope.key] as string) : null,
                  }))
                    .sort(
                      (a, b) =>
                        Number(isEmptyScopeValue(a.value)) - Number(isEmptyScopeValue(b.value)),
                    )
                    .map(({ label, Icon, color, value }) => {
                      return (
                        // Icon chip / eyebrow key / value tracks.
                        <li
                          key={label}
                          className="grid grid-cols-[1.5rem_5rem_minmax(0,1fr)] items-start gap-x-2.5 border-b border-border py-2 last:border-0"
                        >
                          <span
                            className="grid size-6 place-items-center rounded-md bg-surface-sunken"
                            style={value ? { color } : undefined}
                          >
                            <Icon
                              aria-hidden="true"
                              className={"size-3.5" + (value ? "" : " text-text-faint opacity-60")}
                            />
                          </span>
                          <span
                            data-testid="room-scope-key"
                            className="pt-1 text-xs font-semibold uppercase text-text-subtle"
                            style={EYEBROW_STYLE}
                          >
                            {label}
                          </span>
                          <span
                            className={
                              value
                                ? "wrap-break-word pt-0.5 text-xs text-text"
                                : "pt-0.5 text-xs italic text-text-subtle"
                            }
                          >
                            {value ?? ROOM_SCOPE_UNSPECIFIED}
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </BreakdownSection>
  );
}

// Show-level event-detail fields the crew GearSection surfaces — keynote + opening
// reel — so the operator can verify them at the publish gate. opening_reel is
// URL-stripped (stripOpeningReelText) for a clean line; values shown as-parsed.
export function EventDetailsBreakdown({
  dfid,
  eventDetails,
}: {
  dfid: string;
  eventDetails: Record<string, string> | undefined;
}) {
  const ed = eventDetails ?? {};
  // Render every known TEXT spec (closed-vocab EVENT_DETAILS_LABELS; `diagrams`
  // is excluded there — folder link) so the operator sees the full picture
  // pre-publish (BL-EVENT-DETAILS-UNRENDERED). This is a REVIEW surface, so
  // sentinels are shown AS-PARSED (a 'TBD'/'N/A' tells the operator the cell
  // parsed-but-unfilled) — deliberately NOT sentinel-hidden like the crew card.
  // This asymmetry is the existing, tested contract (Step3Review.test.tsx
  // "shown as-parsed (review surface, not sentinel-hidden like the crew page)").
  //
  // Spec "3a Grouped": the flat field wall clusters under five eyebrow headers
  // (EVENT_DETAIL_GROUPS, which covers every label key). Coerce FIRST (String()
  // is null/non-string-safe); `opening_reel` keeps its URL-strip cleanup; trim
  // prevents whitespace from inflating `count`.
  const valueFor = (key: string): string => {
    const text = String(ed[key] ?? "").trim();
    return key === "opening_reel" ? stripOpeningReelText(text).trim() : text;
  };
  const groups = EVENT_DETAIL_GROUPS.map((g) => ({
    title: g.title,
    fields: g.keys
      .map((key) => ({ key, label: EVENT_DETAILS_LABELS[key], value: valueFor(key) }))
      .filter((f) => f.value.length > 0),
  })).filter((g) => g.fields.length > 0);
  const count = groups.reduce((n, g) => n + g.fields.length, 0);
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-event-details`}
      label="Event details"
      count={count}
    >
      {count === 0 ? (
        <p className="text-sm text-text-subtle">No event details parsed.</p>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.title} className="flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <span className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
                  {g.title}
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              </div>
              <EventDetailGroupBody fields={g.fields} />
            </div>
          ))}
        </div>
      )}
    </BreakdownSection>
  );
}

/** One label:value row inside an event-details group; sentinels render muted. */
function EventDetailRow({ label, value }: { label: string; value: string }) {
  const muted = shouldHideGenericOptional(value);
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-4">
      <span className="wrap-break-word text-xs font-medium text-text-subtle">{label}</span>
      <span className={`wrap-break-word text-sm ${muted ? "text-text-faint" : "text-text"}`}>
        {value}
      </span>
    </div>
  );
}

/** A neutral Yes/No state chip (no green/red — Yes is filled, No is outlined). */
function BooleanChip({ label, value }: { label: string; value: string }) {
  const state = interpretBooleanValue(value);
  return (
    <div className="flex items-center justify-between gap-2 rounded-md bg-surface-sunken px-3 py-2">
      <span className="wrap-break-word text-xs font-medium text-text-subtle">{label}</span>
      {state === "yes" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border-strong bg-surface px-2.5 py-0.5 text-xs font-semibold text-text-strong">
          <Check className="size-3" aria-hidden="true" />
          Yes
        </span>
      ) : state === "no" ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border px-2.5 py-0.5 text-xs font-semibold text-text-faint">
          <Minus className="size-3" aria-hidden="true" />
          No
        </span>
      ) : (
        // Neither yes nor no (sentinel / richer text) → raw parsed token, muted.
        <span className="wrap-break-word text-xs font-medium text-text-faint">{value}</span>
      )}
    </div>
  );
}

/**
 * Renders a group's fields: booleans as a Yes/No chip grid, `dress_code` as a
 * sunken free-text block (multi-line preserved), everything else as label:value
 * rows. Rows render before chips so the Production group (all-boolean) reads as
 * a clean chip grid and mixed groups keep their text rows on top.
 */
function EventDetailGroupBody({
  fields,
}: {
  fields: { key: string; label: string; value: string }[];
}) {
  const chips = fields.filter((f) => EVENT_DETAIL_BOOLEAN_KEYS.has(f.key));
  const rows = fields.filter((f) => !EVENT_DETAIL_BOOLEAN_KEYS.has(f.key));
  return (
    <>
      {rows.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {rows.map((f) =>
            f.key === "dress_code" ? (
              <div
                key={f.key}
                className="grid grid-cols-[8rem_minmax(0,1fr)] items-baseline gap-x-4"
              >
                <span className="wrap-break-word text-xs font-medium text-text-subtle">
                  {f.label}
                </span>
                <div className="rounded-md border border-border bg-surface-sunken px-3 py-2 text-sm/relaxed whitespace-pre-line text-text wrap-break-word">
                  {f.value}
                </div>
              </div>
            ) : (
              <EventDetailRow key={f.key} label={f.label} value={f.value} />
            ),
          )}
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {chips.map((f) => (
            <BooleanChip key={f.key} label={f.label} value={f.value} />
          ))}
        </div>
      ) : null}
    </>
  );
}

// One parsed PULL-sheet item rendered as the crew GearSection renders it
// (GearSection.tsx:339-345): `qty × item (cat / subCat)`, with the decorative
// cat/subCat taxonomy sentinel-guarded (hidden when TBD/N/A/empty) and the qty
// prefix dropped when null. The item NAME itself is shown as-parsed — this is a
// review surface, so a garbled name must be visible, not hidden.
export function packItemLabel(item: PullSheetItem): string {
  const cat = shouldHideGenericOptional(item.cat) ? null : item.cat;
  const subCat = shouldHideGenericOptional(item.subCat) ? null : item.subCat;
  const taxonomy = [cat, subCat].filter(Boolean).join(" / ");
  const qtyPart = item.qty !== null && item.qty !== undefined ? `${item.qty} × ` : "";
  // Defensive (§4.6, untyped-on-wire JSONB): the type says `item: string`, but a
  // malformed row must never render the literal "undefined". A nameless item is
  // itself a parse signal worth seeing on a review surface, so label it.
  const name = hasContent(item.item) ? item.item : "(unnamed item)";
  return `${qtyPart}${name}${taxonomy ? ` (${taxonomy})` : ""}`;
}

/** The §8 pack-case count pill ("N items", singular-aware — copy preserved). */
function PackCountPill({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-pill border border-border bg-surface-sunken px-2 py-0.5 text-xs font-medium text-text-subtle">
      <span className="tabular-nums">{count}</span> {count === 1 ? "item" : "items"}
    </span>
  );
}

// The parsed PULL-tab pack list (`pr.pullSheet`) — the same data the crew
// GearSection renders, surfaced here so the operator can verify it parsed at the
// publish gate. Each case is a native <details>: the COLLAPSED summary is the
// case label (or "Case N" fallback) + item count; EXPANDING reveals the parsed
// items (qty × item (cat/subCat)), capped at PACK_LIST_ITEMS_CAP, so the default
// view stays compact while full crew parity is one click away. Cases are capped
// at PACK_LIST_CASES_CAP (the crew CASE_CAP). UNGATED — unlike the crew page
// (which date-gates pack-list visibility via isPackListVisibleToday), a review
// surface always shows what parsed. A case with zero items renders as a plain
// non-expandable line.
export function PackListBreakdown({
  dfid,
  wizardSessionId,
  cases,
  archivedPullSheetTabs,
  overrideActive,
}: {
  dfid: string;
  wizardSessionId: string;
  cases: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  overrideActive: boolean;
}) {
  // §5.6 state machine. The included tab (override applied) carries the revoke
  // note (S3); every non-included archived tab is an offer/re-confirm card (S2/S4,
  // §6 renders all, no cap). When an override is active we suppress the offers —
  // only one override at a time (the RPC enforces it).
  const includedTab = archivedPullSheetTabs.find((t) => t.included) ?? null;
  const offers = overrideActive ? [] : archivedPullSheetTabs.filter((t) => !t.included);
  const hasCases = cases.length > 0;
  // S1: nothing parsed AND nothing to offer. A pending offer (S2/S4) or an active
  // override (S3) suppresses the empty state.
  const isEmpty = !hasCases && archivedPullSheetTabs.length === 0;
  // Dismissing an offer unmounts its whole card (incl. the focused button). Inside
  // the focus-trapped review modal that would strand focus on <body> (WCAG 2.4.3),
  // so the section wrapper is a `tabIndex={-1}` focus fallback the offer targets
  // BEFORE it unmounts (impeccable audit P2).
  const sectionRef = useRef<HTMLDivElement>(null);
  const focusSection = () => sectionRef.current?.focus();

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-pack-list`}
      label="Pack list"
      count={cases.length}
    >
      <div
        ref={sectionRef}
        tabIndex={-1}
        data-section="pack-list"
        className="flex flex-col gap-3 outline-none"
      >
        {isEmpty ? <p className="text-sm text-text-subtle">No pack list parsed.</p> : null}
        {hasCases ? <PackListCases dfid={dfid} cases={cases} /> : null}
        {overrideActive && includedTab ? (
          <ArchivedTabIncludedNote
            dfid={dfid}
            wizardSessionId={wizardSessionId}
            tab={includedTab}
          />
        ) : null}
        {offers.map((tab, i) => (
          <ArchivedTabOffer
            key={`${tab.tabName}-${i}`}
            dfid={dfid}
            wizardSessionId={wizardSessionId}
            tab={tab}
            onDismissFocus={focusSection}
          />
        ))}
      </div>
    </BreakdownSection>
  );
}

/** An expanded case's item list. Shows PACK_LIST_ITEMS_CAP items by default;
 *  the overflow tail is a toggle (Show all / Show fewer) so the full parsed
 *  list is one click away without letting a fat case dominate the column. The
 *  caller guarantees items.length > 0. */
function PackCaseItems({ items }: { items: PullSheetItem[] }) {
  const [showAll, setShowAll] = useState(false);
  const overflow = items.length - PACK_LIST_ITEMS_CAP;
  const visible = showAll ? items : items.slice(0, PACK_LIST_ITEMS_CAP);
  return (
    <ul className="mb-2 flex flex-col gap-0.5 pl-6 text-xs text-text-subtle">
      {visible.map((item, j) => (
        <li key={`${item.item}-${j}`} className="wrap-break-word">
          {packItemLabel(item)}
        </li>
      ))}
      {overflow > 0 ? (
        <li>
          {/* Instant — deliberate (in-place list length change, no animation). */}
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-expanded={showAll}
            className="rounded-sm font-medium text-text-subtle underline-offset-2 hover:text-text hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            {showAll ? "Show fewer items" : `Show all ${items.length} items`}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

/** The parsed PULL-tab case list — the disclosure body shared by the normal
 *  pack list and the S3/S4-mixed states (current gear renders even when an
 *  archived-tab offer or included note is also present). */
function PackListCases({ dfid, cases }: { dfid: string; cases: PullSheetCase[] }) {
  const shown = cases.slice(0, PACK_LIST_CASES_CAP);
  const note = overflowNote(cases.length, PACK_LIST_CASES_CAP, "cases");
  return (
    <>
      <ul className="flex flex-col">
        {shown.map((c, i) => {
          const items = arr(c.items);
          const label = c.caseLabel || `Case ${i + 1}`;
          // No items → nothing to expand; render a plain line (the count still
          // tells the operator the case parsed but is empty).
          if (items.length === 0) {
            return (
              <li
                key={`${label}-${i}`}
                className="flex min-h-tap-min items-center gap-2 border-b border-border text-sm text-text last:border-0"
              >
                <span aria-hidden="true" className="size-4 shrink-0" />
                <span className="wrap-break-word flex-1 font-medium text-text-strong">{label}</span>
                <PackCountPill count={items.length} />
              </li>
            );
          }
          return (
            <li
              key={`${label}-${i}`}
              className="border-b border-border text-sm text-text last:border-0"
            >
              <details className="group" data-testid={`wizard-step3-card-${dfid}-pack-case-${i}`}>
                {/* §8 summary row: ≥44px tap target, chevron rotate on open
                    (transform only), count pill. Native marker hidden — the
                    chevron IS the disclosure affordance. */}
                <summary className="flex min-h-tap-min cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-text-subtle transition-transform duration-fast group-open:rotate-90"
                  />
                  <span className="wrap-break-word flex-1 font-medium text-text-strong">
                    {label}
                  </span>
                  <PackCountPill count={items.length} />
                </summary>
                <PackCaseItems items={items} />
              </details>
            </li>
          );
        })}
      </ul>
      {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
    </>
  );
}

// The archived-tab CTA grammar. The load-bearing action (accept / revoke) is the
// bordered button that mirrors RescanSheetButton; the dismiss ("Keep skipped") is
// a quieter ghost so a glancing operator reads the primary action first (impeccable
// critique P2 — hierarchy WITHIN the neutral palette, never spending the ≤10% orange).
const ARCHIVED_TAB_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-border-strong bg-bg px-4 text-sm font-medium text-text-strong transition-colors duration-fast hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
// Resting color is text-text (NOT text-subtle — DESIGN.md:27 bars subtle on action
// targets); the border-transparent + no-fill is what makes it read as secondary.
const ARCHIVED_TAB_GHOST_BTN =
  "inline-flex min-h-tap-min items-center justify-center rounded-sm border border-transparent px-4 text-sm font-medium text-text transition-colors duration-fast hover:text-text-strong disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

async function postPullSheetOverride(body: unknown): Promise<{ ok: boolean; refresh: boolean }> {
  const response = await fetch("/api/admin/onboarding/pull-sheet-override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // On success OR a 409 stale-review (the server re-scanned to the new
  // fingerprint), re-fetch the preview so the re-rendered card carries the fresh
  // state instead of a bespoke error (plan-R1-3). Any other status is a real
  // failure surfaced as an inline line (no raw code — invariant 5).
  return { ok: response.ok, refresh: response.ok || response.status === 409 };
}

// Generic client-side transport-failure chrome (accept/revoke POST failed with no server code to
// route through messageFor(); success + 409 both re-fetch the preview). No raw code (invariant 5).
// not-subject:M5-D8 — friendly fallback copy, not a §12.4-coded message.
const ARCHIVED_TAB_ERROR =
  "That didn’t go through. Refresh and try again, or contact the developer if it keeps happening.";

/** S2 offer / S4 re-confirm: a warning card offering to fold one archived-tab
 *  pull sheet into this show's gear. Accept POSTs the row-state-CAS body (no
 *  active override → expectedOverrideSnapshot null). "Keep skipped" is a local
 *  dismiss — the default state is already skipped, so nothing is written. */
function ArchivedTabOffer({
  dfid,
  wizardSessionId,
  tab,
  onDismissFocus,
}: {
  dfid: string;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
  /** Focus a persistent sibling before this card unmounts on dismiss (WCAG 2.4.3). */
  onDismissFocus: () => void;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (dismissed) return null;

  async function accept() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: tab.tabName,
        expectedFingerprint: tab.fingerprint,
        expectedOverrideSnapshot: null,
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  // S4 (content changed after acceptance) is a genuine "act before it publishes"
  // state → warm warning tone. S2 (first discovery) is neutral information, not a
  // problem → the quieter info tone (impeccable critique P3).
  const changed = tab.contentChangedSinceAccept;
  const cardTone = changed
    ? "border-border-strong bg-warning-bg text-warning-text"
    : "border-border bg-info-bg text-text-strong";

  return (
    <div
      data-testid={`pack-list-archived-offer-${dfid}-${tab.tabName}`}
      className={`flex flex-col gap-2 rounded-sm border p-3 text-sm ${cardTone}`}
    >
      <p className="font-medium">
        {changed
          ? `The archived tab ‘${tab.tabName}’ changed. Re-confirm before it publishes.`
          : `Found a pull sheet on archived tab ‘${tab.tabName}’.`}
      </p>
      <ul className="flex flex-col gap-0.5 text-xs">
        {tab.headerPreviews.map((preview, i) => (
          <li key={`${tab.tabName}-preview-${i}`} className="wrap-break-word">
            Case {i + 1} header reads ‘{preview.trim() ? preview : "(no header text)"}’.
          </li>
        ))}
      </ul>
      <p>If this is this show’s gear, include it; otherwise leave it skipped.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={pending}
          aria-busy={pending}
          className={ARCHIVED_TAB_BTN}
        >
          {pending ? "Including…" : "Use this show’s gear"}
        </button>
        <button
          type="button"
          onClick={() => {
            // Move focus to the persistent section BEFORE the card (and this
            // button) unmount, so focus never drops to <body> in the trapped modal.
            onDismissFocus();
            setDismissed(true);
          }}
          disabled={pending}
          className={ARCHIVED_TAB_GHOST_BTN}
        >
          Keep skipped
        </button>
      </div>
      {error ? (
        <p role="status" aria-live="polite">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** S3: the subtle "this pack list came from an archived tab" note + Revoke.
 *  Revoke POSTs tabName:null with the active override's snapshot as the row-state
 *  CAS baseline (spec §5.4). */
function ArchivedTabIncludedNote({
  dfid,
  wizardSessionId,
  tab,
}: {
  dfid: string;
  wizardSessionId: string;
  tab: ArchivedPullSheetTab;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const { refresh } = await postPullSheetOverride({
        driveFileId: dfid,
        wizardSessionId,
        tabName: null,
        expectedOverrideSnapshot: { tabName: tab.tabName, fingerprint: tab.fingerprint },
      });
      if (refresh) {
        router.refresh();
        return;
      }
      setError(ARCHIVED_TAB_ERROR);
    } catch {
      setError(ARCHIVED_TAB_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-border bg-info-bg px-3 py-2 text-sm text-text-strong">
      <p className="wrap-break-word min-w-0 flex-1">Included from archived tab ‘{tab.tabName}’.</p>
      <button
        type="button"
        onClick={revoke}
        disabled={pending}
        aria-busy={pending}
        className={ARCHIVED_TAB_BTN}
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error ? (
        <p role="status" aria-live="polite" className="basis-full">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function HotelsBreakdown({ dfid, hotels }: { dfid: string; hotels: HotelReservationRow[] }) {
  const chrome = useContext(Step3SectionChromeContext);
  const shown = hotels.slice(0, HOTELS_CAP);
  const note = overflowNote(hotels.length, HOTELS_CAP, "hotels");
  // A single reservation inside the modal's section chrome would otherwise be a
  // card-within-a-card (chrome card + HotelCard border). Flatten the lone card so
  // the chrome IS the single card; nest sub-cards only when there are 2+ rows.
  // Gated on chrome presence so the non-chrome path (no outer card) keeps a card.
  const flatSolo = chrome !== null && hotels.length === 1;
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-hotels`}
      label="Hotels"
      count={hotels.length}
    >
      {hotels.length === 0 ? (
        <p className="text-sm text-text-subtle">No hotels parsed.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((h, i) => (
            <HotelCard key={`${h.hotel_name ?? "hotel"}-${i}`} h={h} flat={flatSolo} />
          ))}
          {note ? <p className="text-xs text-text-subtle">{note}</p> : null}
        </div>
      )}
    </BreakdownSection>
  );
}

/**
 * One reservation as a structured sub-card (spec "1a Structured"): bed chip +
 * hotel name + map-pin address + a "N nights" pill, a sunken humanized
 * check-in → check-out strip, and a guest-avatar stack. `confirmation_no` is
 * NEVER rendered (it stays private, matching the existing review contract);
 * dates are shown as-parsed (a non-ISO sentinel echoes verbatim).
 */
function HotelCard({ h, flat = false }: { h: HotelReservationRow; flat?: boolean }) {
  const address = hasContent(h.hotel_address) ? h.hotel_address : null;
  const names = arr(h.names).filter((n) => hasContent(n));
  const nights = nightsBetween(h.check_in, h.check_out);
  const checkIn = h.check_in ? formatIsoDate(h.check_in, "weekday-short") : null;
  const checkOut = h.check_out ? formatIsoDate(h.check_out, "weekday-short") : null;
  return (
    <div
      data-testid="wizard-step3-hotel-card"
      className={
        flat ? "flex flex-col gap-3" : "flex flex-col gap-3 rounded-md border border-border p-4"
      }
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-subtle"
        >
          <BedDouble className="size-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="wrap-break-word text-base font-semibold text-text-strong">
            {h.hotel_name || "Hotel"}
          </p>
          {address ? (
            <p className="mt-0.5 flex items-start gap-1.5 text-sm text-text-subtle">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 wrap-break-word">{address}</span>
            </p>
          ) : null}
        </div>
        {nights !== null ? (
          <span className="shrink-0 rounded-pill border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold tabular-nums text-text-subtle">
            {nights} {nights === 1 ? "night" : "nights"}
          </span>
        ) : null}
      </div>

      {checkIn || checkOut ? (
        <div className="flex items-center gap-3 rounded-md bg-surface-sunken px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className={CELL_EYEBROW_CLASS}>Check in</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-strong">
              {checkIn ?? "—"}
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 text-text-faint" aria-hidden="true" />
          <div className="min-w-0 flex-1 text-right">
            <p className={CELL_EYEBROW_CLASS}>Check out</p>
            <p className="mt-0.5 text-sm font-semibold tabular-nums text-text-strong">
              {checkOut ?? "—"}
            </p>
          </div>
        </div>
      ) : null}

      {names.length > 0 ? (
        <div className="flex items-center gap-2.5">
          <div className="flex shrink-0">
            {names.slice(0, 5).map((n, idx) => (
              <MiniAvatar
                key={`${n}-${idx}`}
                name={n}
                testId="hotel-guest-avatar"
                sizeClass={`size-6 text-[10px] ${idx > 0 ? "-ml-2" : ""}`}
              />
            ))}
          </div>
          <span className="min-w-0 wrap-break-word text-xs text-text-subtle">
            {names.join(", ")}
          </span>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Hardened warning-title derivation (spec §8, invariant 5). Order:
 *   1. Cataloged code with a non-null catalog title → that title.
 *   2. `w.message` ONLY when, after trim, it is non-empty AND does not
 *      contain the raw code token (case-insensitive — catches exact
 *      equality, embedded codes, whitespace and case variants) AND is not
 *      itself machine-token-shaped (`/^[A-Z0-9_]{2,}$/`).
 *   3. Otherwise the generic human fallback.
 *
 * Rationale: persisted warnings exist whose `message` IS the raw code
 * (`reelWarning`, lib/sync/phase2.ts — e.g. OPENING_REEL_UNREADABLE); the
 * per-show page already pins the no-raw-code rule. A cataloged code with a
 * NULL title (some §12.4 rows are title-less) falls through to the same
 * message guards rather than rendering an empty title.
 */
export function reviewWarningTitle(w: ParseWarning): string {
  if (isMessageCode(w.code)) {
    const title = messageFor(w.code as MessageCode).title;
    if (title) return title;
  }
  const msg = (w.message ?? "").trim();
  if (
    msg.length > 0 &&
    !msg.toLowerCase().includes(w.code.toLowerCase()) &&
    !/^[A-Z0-9_]{2,}$/.test(msg)
  ) {
    return msg;
  }
  return "A parse issue was recorded for this sheet.";
}

/**
 * Parse-warnings breakdown (plan Task 4; Task 3 restyle + hardening). The full
 * `parseResult.warnings` list is surfaced here. Each warning's TITLE goes
 * through `reviewWarningTitle` (hardened, spec §8); cataloged codes also show
 * their `helpfulContext`. The bare `code` is NEVER rendered (invariant 5).
 *
 * One explicit line states that warnings are informational and do NOT block
 * publishing, so the count badge stops reading as an error. Severity is shown
 * as an icon chip (warn/info) + a small dot + label. Zero warnings render the
 * AFFIRMATIVE empty state (spec §3.10) — the all-clean state is a sentence,
 * not an absent panel. No publish-gate logic changes here.
 */
export function WarningsBreakdown({ dfid, warnings }: { dfid: string; warnings: ParseWarning[] }) {
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-breakdown-warnings`}
      label="Warnings"
      count={warnings.length}
    >
      {warnings.length === 0 ? (
        <p
          data-testid={`wizard-step3-card-${dfid}-warnings-empty`}
          className="text-sm text-text-subtle"
        >
          No parse warnings for this sheet.
        </p>
      ) : (
        <>
          <p
            data-testid={`wizard-step3-card-${dfid}-warnings-nonblocking`}
            className="text-xs text-text-subtle"
          >
            These are informational and don&rsquo;t block publishing.
          </p>
          <ul className="flex flex-col gap-3">
            {warnings.map((w, i) => {
              const title = reviewWarningTitle(w);
              const context = isMessageCode(w.code)
                ? (messageFor(w.code as MessageCode).helpfulContext ?? null)
                : null;
              const isWarn = w.severity === "warn";
              return (
                <li
                  key={`${w.code}-${i}`}
                  data-testid={`wizard-step3-card-${dfid}-warning-${i}`}
                  // §E4 jump-target key: same FULL-array index as the testid —
                  // the modal's container-scoped query hook (no `id`s, §9.4).
                  data-warning-index={i}
                  className="flex gap-3"
                >
                  {/* §8 severity icon chip: warn = warm chip, info = neutral. */}
                  <span
                    aria-hidden="true"
                    className={`grid size-7 shrink-0 place-items-center rounded-sm ${
                      isWarn ? "bg-warning-bg text-warning-text" : "bg-info-bg text-text-subtle"
                    }`}
                  >
                    {isWarn ? <AlertTriangle className="size-4" /> : <Info className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-text">
                      <span
                        aria-hidden="true"
                        className={`size-1.5 shrink-0 self-center rounded-pill ${
                          isWarn ? "bg-warning-text" : "bg-text-faint"
                        }`}
                      />
                      <span className="wrap-break-word font-medium text-text-strong">
                        {renderEmphasis(title)}
                      </span>
                      <span className="text-xs uppercase text-text-subtle">
                        {isWarn ? "warn" : "info"}
                      </span>
                    </span>
                    {(() => {
                      // The offending row label (from rawSnippet "<label> | <value>"): the
                      // catalog title is generic ("Unrecognized row in sheet"), so this is
                      // the only per-row discriminator — makes otherwise-identical entries
                      // scannable and identifies the row when the deep link is absent.
                      const rowLabel = labelFromRawSnippet(w.rawSnippet);
                      return rowLabel ? (
                        <span
                          data-testid={`wizard-step3-card-${dfid}-warning-${i}-label`}
                          className="wrap-break-word text-xs text-text-subtle"
                        >
                          {rowLabel}
                        </span>
                      ) : null;
                    })()}
                    {context ? (
                      <p className="text-xs text-text-subtle">{renderEmphasis(context)}</p>
                    ) : null}
                    {(() => {
                      // Exact-cell deep link: when the scan captured the offending
                      // source cell, offer a one-click jump to it in the Sheet. Falls
                      // back to the base sheet URL for a non-allowlisted tab (still
                      // useful); omitted when no anchor or no driveFileId.
                      const href = w.sourceCell ? buildSheetDeepLink(dfid, w.sourceCell) : null;
                      return href ? (
                        <a
                          data-testid={`wizard-step3-card-${dfid}-warning-${i}-open`}
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
                        >
                          Open in Sheet <span aria-hidden="true">↗</span>
                        </a>
                      ) : null;
                    })()}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </BreakdownSection>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Agenda PDF schedule — live-fill card + 5-state machine (spec §5.3).
 *
 * The card renders the server-built `AdminAgendaItem[]` (note-only baseline at
 * first paint), POSTs to the extract endpoint, polls while "Parsing agenda…",
 * then fills in the schedule blocks (with the server-validated Open-PDF anchors)
 * when the extraction is ready. It NEVER computes an href itself — it renders
 * `item.href` only when the server supplied one AND the state is `ready`.
 *
 * States (keyed on `stateKey` = the row's `agendaStateKey`):
 *   idle → loading → { ready | stale | error }
 * A NEW `stateKey` resets to loading, clears the upgraded items back to the
 * baseline, and re-fires the POST.
 *
 *   - loading: baseline note-only items + "Parsing agenda… (N PDFs)" eyebrow,
 *     NO Open-PDF anchor.
 *   - ready (200): `agenda-schedule` blocks (via AgendaScheduleBlock) + overflow
 *     notes, WITH the server-validated anchors.
 *   - error (network / 5xx / 504 timeout / 500): note-only, NO anchor, + a
 *     source-sheet link.
 *   - stale (409): sanitized note, NO anchor, NO block.
 *   - Anchors render ONLY in `ready` (loading/error/stale all have zero).
 *
 * Late-response suppression (plan round-24): the effect captures the current
 * `stateKey` into a const + creates an `AbortController`; cleanup `abort()`s the
 * in-flight fetch on key change, and EVERY resolution checks `capturedKey ===
 * currentKeyRef.current` before any `setState` — so a late 200/409 from an old
 * generation is DROPPED and never sets `ready`/`stale` for the new generation.
 * ────────────────────────────────────────────────────────────────────────── */

type AgendaState = "idle" | "loading" | "ready" | "stale" | "error";

// ── Module-level POST throttle: at most AGENDA_CLIENT_CONCURRENCY in-flight
// extraction POSTs across every mounted card (spec §5.3). A FIFO of pending
// grants drains as slots are released. ──
let agendaActiveSlots = 0;
const agendaSlotWaiters: Array<() => void> = [];

function acquireAgendaSlot(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const grant = () => {
      agendaActiveSlots++;
      let released = false;
      resolve(() => {
        if (released) return;
        released = true;
        agendaActiveSlots--;
        const next = agendaSlotWaiters.shift();
        if (next) next();
      });
    };
    if (agendaActiveSlots < AGENDA_CLIENT_CONCURRENCY) grant();
    else agendaSlotWaiters.push(grant);
  });
}

/** Test-only seam: reset the module-level POST throttle between test cases. */
export function __resetAgendaThrottleForTests(): void {
  agendaActiveSlots = 0;
  agendaSlotWaiters.length = 0;
}

/** Retry-After is delta-seconds (the endpoint sends "10"); fall back to 5s. */
function parseRetryAfterMs(header: string | null): number {
  if (!header) return 5_000;
  const secs = Number.parseInt(header, 10);
  return Number.isFinite(secs) && secs >= 0 ? secs * 1_000 : 5_000;
}

/** An abortable delay; resolves immediately if already aborted. */
function agendaSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

function agendaOverflowNotes(block: NonNullable<AdminAgendaItem["block"]>): string[] {
  const notes: string[] = [];
  if (block.droppedSessions > 0) notes.push(`…and ${block.droppedSessions} more sessions`);
  if (block.droppedDays > 0) notes.push(`…and ${block.droppedDays} more days`);
  if (block.droppedTracks > 0) notes.push(`…and ${block.droppedTracks} more tracks`);
  return notes;
}

/** The per-state note line for a note-only item (never a raw error/status code —
 * invariant 5). */
function agendaItemNote(state: AgendaState): string {
  switch (state) {
    case "error":
      return "We couldn’t read this agenda’s schedule.";
    case "stale":
      return "This agenda changed since the last scan. Re-scan to refresh.";
    case "ready":
      return "No schedule detected in this PDF.";
    default:
      return "Reading the schedule…";
  }
}

function AgendaItemRow({
  item,
  state,
  index,
}: {
  item: AdminAgendaItem;
  state: AgendaState;
  index: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const showBlock = state === "ready" && item.block !== null;
  // Anchors render ONLY in `ready`, and ONLY when the server validated an href.
  const showAnchor = state === "ready" && !!item.href;
  const block = item.block;
  const droppedTotal = block ? block.droppedSessions + block.droppedDays + block.droppedTracks : 0;
  // Truncated rows become expandable in place (owner decision, 2026-07-05) —
  // ONLY when the uncapped extraction was threaded through AND something was
  // actually dropped. Absent the full payload, the static overflow note stays
  // the sole affordance (backward-compatible with note-only fixtures).
  const canExpand = showBlock && !!block?.fullExtraction && droppedTotal > 0;
  const expanded = canExpand && showAll;
  return (
    <li data-testid="agenda-item" className="flex min-w-0 flex-col gap-1.5">
      {item.badge ? (
        <span className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
          {item.badge}
        </span>
      ) : null}
      {showBlock && block ? (
        <>
          <AgendaScheduleBlock
            extraction={expanded && block.fullExtraction ? block.fullExtraction : block.extraction}
            label={null}
          />
          {/* Overflow notes describe what's hidden — shown only while collapsed;
              expanding renders every session/day/track in place. */}
          {!expanded
            ? agendaOverflowNotes(block).map((note) => (
                <p key={note} className="text-xs text-text-subtle">
                  {note}
                </p>
              ))
            : null}
          {canExpand ? (
            <button
              type="button"
              data-testid="agenda-show-all"
              aria-expanded={expanded}
              onClick={() => setShowAll((v) => !v)}
              className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
            >
              {expanded ? "Show less" : "Show all"}
            </button>
          ) : null}
        </>
      ) : (
        <p
          role="status"
          aria-live="polite"
          data-testid="agenda-note"
          className={state === "error" ? "text-sm text-warning-text" : "text-sm text-text-subtle"}
        >
          {agendaItemNote(state)}
        </p>
      )}
      {showAnchor && item.href ? (
        <a
          data-testid="agenda-open-pdf"
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open PDF <span aria-hidden="true">↗</span>
        </a>
      ) : (
        // Keep the index referenced so the key is stable + lint-clean.
        <span hidden data-agenda-index={index} />
      )}
    </li>
  );
}

export function AgendaBreakdown({
  driveFileId,
  wizardSessionId,
  baseline,
  stateKey,
  onLiveKeyLayout,
}: {
  driveFileId: string;
  wizardSessionId: string;
  baseline: AdminAgendaItem[];
  stateKey: string;
  /**
   * Test-only observability seam (production never passes it): receives
   * `currentKeyRef.current` in the LAYOUT-effect phase — after commit, before
   * passive effects — which is the only window that reflects ONLY the
   * render-time live-key write (the generation-race fix) and not the later
   * passive-effect write. Per-instance (no shared module state).
   */
  onLiveKeyLayout?: (liveKey: string) => void;
}) {
  // Modal chrome (Task 5): inside the review modal the §6.4 heading row
  // replaces the card-context "Agenda" eyebrow (no double label).
  const chrome = useContext(Step3SectionChromeContext);
  const [state, setState] = useState<AgendaState>(() => (baseline.length > 0 ? "loading" : "idle"));
  const [items, setItems] = useState<AdminAgendaItem[]>(baseline);
  // A ref tracking the LIVE generation key — every late resolution checks the
  // captured key against this before any setState (round-24 suppression).
  const currentKeyRef = useRef<string>(stateKey);
  // The latest baseline read inside the keyed effect WITHOUT making the effect
  // re-run on every parent render (the parent rebuilds the array each render).
  // Updated in its own effect so the keyed effect (declared after) sees the
  // current generation's baseline; the generation itself is keyed on `stateKey`.
  const baselineRef = useRef<AdminAgendaItem[]>(baseline);
  useEffect(() => {
    baselineRef.current = baseline;
  }, [baseline]);

  // Generation reset — adjust state during render when `stateKey` changes (the
  // React "reset state on prop change" pattern). Clears any prior `ready` items
  // back to the baseline note-only and returns to loading; the keyed effect
  // below then re-fires the POST for the new generation.
  const [trackedKey, setTrackedKey] = useState<string>(stateKey);
  if (stateKey !== trackedKey) {
    setTrackedKey(stateKey);
    setState(baseline.length > 0 ? "loading" : "idle");
    setItems(baseline);
    // Intentional render-time ref update (react-hooks/refs disable below):
    // the effect also sets this, but passive-effect flush is too late for the
    // live() guard in a concurrent generation window.
    // eslint-disable-next-line react-hooks/refs
    currentKeyRef.current = stateKey;
  }

  useEffect(() => {
    if (baselineRef.current.length === 0) return;

    const capturedKey = stateKey;
    currentKeyRef.current = stateKey;
    const controller = new AbortController();
    let cancelled = false;
    const live = () => !cancelled && capturedKey === currentKeyRef.current;

    void (async () => {
      const release = await acquireAgendaSlot();
      try {
        if (!live()) return;
        const startedAt = Date.now();
        let admittedAt: number | null = null;

        // Poll loop — 200 ready / 409 stale / 202 retry / everything else error.
        for (;;) {
          if (!live()) return;
          let res: Response;
          try {
            res = await fetch(
              `/api/admin/onboarding/extract-agenda/${wizardSessionId}/${driveFileId}`,
              { method: "POST", signal: controller.signal },
            );
          } catch {
            if (!live()) return;
            setState("error");
            return;
          }
          if (!live()) return;

          if (res.status === 200) {
            let body: { items?: AdminAgendaItem[] } = {};
            try {
              body = (await res.json()) as { items?: AdminAgendaItem[] };
            } catch {
              /* malformed 200 → fall back to baseline note-only */
            }
            if (!live()) return;
            setItems(Array.isArray(body.items) ? body.items : baselineRef.current);
            setState("ready");
            return;
          }

          if (res.status === 409) {
            if (!live()) return;
            setState("stale");
            return;
          }

          if (res.status === 202) {
            let body: { reason?: "in_progress" | "queued" } = {};
            try {
              body = (await res.json()) as { reason?: "in_progress" | "queued" };
            } catch {
              /* default to in_progress budget below */
            }
            if (!live()) return;
            const reason = body.reason === "queued" ? "queued" : "in_progress";
            const now = Date.now();
            // Reason-aware budgets: in_progress window starts at admission; the
            // queued window starts when the first poll was issued.
            let deadline: number;
            if (reason === "in_progress") {
              if (admittedAt === null) admittedAt = now;
              deadline = admittedAt + AGENDA_CLIENT_POLL_BUDGET_MS;
            } else {
              deadline = startedAt + AGENDA_CLIENT_QUEUE_BUDGET_MS;
            }
            if (now >= deadline) {
              setState("error");
              return;
            }
            await agendaSleep(parseRetryAfterMs(res.headers.get("Retry-After")), controller.signal);
            continue;
          }

          // 504 timeout, 500, 403, and any other non-2xx → error.
          if (!live()) return;
          setState("error");
          return;
        }
      } finally {
        release();
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [stateKey, driveFileId, wizardSessionId]);

  // Test-only observability (no-op in production — `onLiveKeyLayout` is never
  // passed): report the live generation key in the layout phase so the g3
  // regression can observe the render-time fix without reading the ref during
  // render. Layout effects fire after DOM mutations but before passive effects,
  // the only window that distinguishes the render-time live-key write from the
  // passive-effect write.
  useLayoutEffect(() => {
    onLiveKeyLayout?.(currentKeyRef.current);
  });

  // §4.6 guard: no agenda links → no breakdown at all (and the effect above
  // never POSTs).
  if (baseline.length === 0) return null;

  const sourceHref = buildSheetDeepLink(driveFileId);

  const body = (
    <>
      {state === "loading" ? (
        <p
          role="status"
          aria-live="polite"
          data-testid={`wizard-step3-card-${driveFileId}-agenda-parsing`}
          className="text-xs text-text-subtle"
        >
          {`Parsing agenda… (${items.length} ${items.length === 1 ? "PDF" : "PDFs"})`}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {items.map((item, i) => (
          <AgendaItemRow key={`${item.label}-${i}`} item={item} state={state} index={i} />
        ))}
      </ul>
      {state === "error" && sourceHref ? (
        <a
          data-testid="agenda-source-link"
          href={sourceHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-tap-min items-center self-start text-xs font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2"
        >
          Open the source sheet <span aria-hidden="true">↗</span>
        </a>
      ) : null}
    </>
  );

  if (chrome) {
    return (
      <section
        data-testid={`wizard-step3-card-${driveFileId}-agenda`}
        className="flex min-w-0 flex-col"
      >
        {/* No count: agenda has no BreakdownSection count today (§6.1). The
            inner AgendaScheduleBlock <h3> day labels sit at the same level as
            the section heading — sibling h3s, no skipped level (§15). */}
        <ModalSectionChrome chrome={chrome} count={null}>
          {body}
        </ModalSectionChrome>
      </section>
    );
  }

  return (
    <section
      data-testid={`wizard-step3-card-${driveFileId}-agenda`}
      className="flex flex-col gap-2"
    >
      {/* Non-heading eyebrow label: the reused AgendaScheduleBlock emits its own
          <h3> day labels, so a real <h4> here would invert the heading order
          (h4 > h3). Rendering the section label as a styled <p> keeps the inner
          <h3> from nesting under a higher-level heading. */}
      <p className={EYEBROW_CLASS} style={EYEBROW_STYLE}>
        Agenda
      </p>
      {body}
    </section>
  );
}

/**
 * audit idx39/#180: the minimal "needs attention — not publishable" indicator for a
 * row demoted by a NON-RESCAN finalize failure code (DRIVE_FETCH_FAILED,
 * STAGED_PARSE_SOURCE_OUT_OF_SCOPE, WIZARD_SESSION_SUPERSEDED, …). The publish
 * checkbox/button is suppressed for these (matching Step3Review.selectableRows + the
 * server /approve refusal), so this note replaces it and tells the operator the row
 * can't be published as-is. Plain-English only (invariant 5 — never the raw §12.4
 * code). Shares the warm warning treatment (warning-bg + strong border + icon) with
 * RescanReviewBanner; no reapply link, since recovery for these codes flows through
 * the next scan, not a per-item reapply choice.
 *
 * Shared export (spec §C2): rendered by Step3SheetCard (default testid — card
 * output byte-identical) AND by the Step3ReviewModal footer's demoted branch
 * (modal-scoped `testId`).
 */
export function NotPublishableNote({ dfid, testId }: { dfid: string; testId?: string }) {
  return (
    <div
      data-testid={testId ?? `wizard-step3-card-${dfid}-not-publishable`}
      className="flex items-start gap-2 rounded-md border border-border-strong bg-warning-bg p-tile-pad text-warning-text"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="text-sm font-medium">This sheet needs attention before it can be published.</p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Section registry (spec §6.1) — the single source of truth the review modal
 * (Task 4+) renders: rail items, chip rail, content-pane sections.
 * ────────────────────────────────────────────────────────────────────────── */

/** Everything a section body needs, assembled once by the caller. */
export type SectionData = {
  pr: ParseResult;
  row: Step3Row;
  dfid: string;
  wizardSessionId: string;
  crewMembers: CrewMemberRow[];
  rooms: RoomRow[];
  hotels: HotelReservationRow[];
  pullSheet: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  ros: RunOfShow;
  warnings: ParseWarning[];
  agendaBaseline: AdminAgendaItem[];
};

export type Step3SectionDef = {
  id: SectionId;
  label: string;
  group: string;
  /** Lucide glyph per the §6.1 table. */
  Icon: LucideIcon;
  /** Rail count for the list-shaped subset (§6.1); null → no rail count. */
  railCount: ((d: SectionData) => number) | null;
  /**
   * Follow-ups spec §D2: present-`true` ONLY on `report` — BOTH navs (desktop
   * rail + mobile chips) render no status dot for it. exactOptionalPropertyTypes:
   * present-`true` or ABSENT, never `hideDot: undefined`.
   */
  hideDot?: true;
  /** The restyled section body. */
  render: (d: SectionData) => React.ReactNode;
};

/** Rail group order (spec §6.1). */
export const STEP3_SECTION_GROUPS: readonly string[] = [
  "The show",
  "People",
  "Schedule",
  "Logistics",
  "Gear",
  "Money",
  "Checks",
];

/** Thumbnail-grid cap (spec §B3): overflow renders the quiet "+N more" note. */
export const DIAGRAM_TILE_CAP = 12;

/** One thumbnail tile — raw <img> + onError placeholder, mirroring the crew
 *  Gallery pattern (components/diagrams/Gallery.tsx:130-144; raw <img> is a
 *  documented revert — next/image drops cookies). */
function DiagramTile({
  src,
  alt,
  testId,
  hasPreviewSource,
}: {
  src: string;
  alt: string;
  testId: string;
  hasPreviewSource: boolean;
}) {
  const [failed, setFailed] = useState(!hasPreviewSource);
  if (failed) {
    return (
      <span
        data-testid={testId}
        className="grid aspect-4/3 w-full place-items-center gap-1 rounded-md border border-border bg-surface-sunken text-center"
      >
        <ImageOff aria-hidden="true" className="size-4 text-text-subtle" />
        <span className="text-xs text-text-subtle">Preview unavailable</span>
      </span>
    );
  }
  return (
    /* aria-label mirrors the img alt (impeccable audit P2): the anchor's
       accessible name must never be empty even if the alt computation ever
       regresses to "" (nameless-link guard, WCAG 2.4.4/4.1.2). */
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      aria-label={alt}
      data-testid={testId}
      className="block"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- staged-diagram
          preview route is admin-cookie-authed; next/image drops cookies (same
          documented revert as components/diagrams/Gallery.tsx). */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="aspect-4/3 w-full rounded-md border border-border bg-surface-sunken object-cover"
      />
    </a>
  );
}

/**
 * Diagrams section body (follow-ups spec §B3): count summary (zero parts
 * omitted), capped thumbnail grid, and the revalidated folder row.
 * Element-level guard mirrors the preview route (§B1): the SAME shared
 * predicate filters the untrusted persisted JSONB BEFORE any dereference —
 * invalid elements are excluded from tiles, counts, and cap math.
 */
export function DiagramsBreakdown({
  dfid,
  wizardSessionId,
  diagrams,
}: {
  dfid: string;
  wizardSessionId: string;
  diagrams: ParseResult["diagrams"] | null | undefined;
}) {
  const stubs = arr(diagrams?.embeddedImages).filter(isRenderableDiagramStub);
  const folderItems = arr(diagrams?.linkedFolderItems);
  const folderHref = diagrams?.linkedFolder
    ? trustedDriveFolderHref((diagrams.linkedFolder as { driveFolderUrl?: unknown }).driveFolderUrl)
    : null;
  const hasFolder = diagrams?.linkedFolder != null;
  const shown = stubs.slice(0, DIAGRAM_TILE_CAP);
  const extra = stubs.length - shown.length;
  const summaryParts: string[] = [];
  if (stubs.length > 0) {
    summaryParts.push(`${stubs.length} embedded image${stubs.length === 1 ? "" : "s"}`);
  }
  if (folderItems.length > 0) {
    summaryParts.push(`${folderItems.length} folder file${folderItems.length === 1 ? "" : "s"}`);
  }
  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-section-diagrams`}
      label="Diagrams"
      count={stubs.length + folderItems.length}
    >
      {summaryParts.length > 0 ? (
        <p className="text-xs text-text-subtle">{summaryParts.join(" · ")}</p>
      ) : null}
      {shown.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {shown.map((stub, i) => (
            <DiagramTile
              key={`${stub.objectId}-${i}`}
              testId={`wizard-step3-card-${dfid}-diagram-tile-${i}`}
              src={`/api/admin/onboarding/staged-diagram/${wizardSessionId}/${dfid}/${encodeURIComponent(stub.objectId)}`}
              // `?? ` only catches null/undefined — a persisted `alt: ""`
              // rendered a nameless link (impeccable audit P2); blank/space
              // alts fall back to the generic sheet-tab string too.
              alt={stub.alt?.trim() || `Diagram from ${stub.sheetTab}`}
              // Shared servability predicate (spec §A4): the tile and the
              // preview route can never disagree on what's fetchable —
              // trusted legacy contentUrl OR fingerprint-addressable media.
              hasPreviewSource={hasStagedPreviewSource(stub)}
            />
          ))}
        </div>
      ) : null}
      {extra > 0 ? (
        <p className="text-xs text-text-subtle">
          +{extra} more — all images are snapshotted when the show publishes.
        </p>
      ) : null}
      {hasFolder ? (
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-text">
          {folderHref !== null ? (
            <a
              data-testid={`wizard-step3-card-${dfid}-diagram-folder-link`}
              href={folderHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-tap-min items-center gap-1 font-medium text-text-strong underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Open diagrams folder in Drive <ExternalLink aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
          {folderItems.length > 0 ? (
            <span className="text-text-subtle">{folderItems.length} files</span>
          ) : null}
        </p>
      ) : null}
    </BreakdownSection>
  );
}

/** Report message textarea cap (spec §D3). */
export const REPORT_MESSAGE_MAX_CHARS = 2000;
/** Payload parse-warnings cap (spec §D3). */
export const REPORT_PARSE_WARNINGS_CAP = 50;
/** Rendered whenever a failure code resolves to no usable dougFacing copy —
 *  the status line is never empty and never a raw code (invariant 5).
 *  Spec §D3 sanctions this exported generic fallback for codes whose catalog
 *  entry has dougFacing: null (e.g. ADMIN_SESSION_LOOKUP_FAILED). */
// not-subject:M5-D8 — spec-§D3-sanctioned generic fallback constant, not an inline callsite literal.
export const REPORT_GENERIC_ERROR_COPY = "Couldn’t send the report. Try again in a moment.";

type ReportSectionStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "success" }
  | { kind: "error"; copy: string };

function reportAttemptStorageKey(wizardSessionId: string, driveFileId: string): string {
  // Scoped to wizard session AND drive file (spec §D3): a later wizard session
  // for the same file is a DIFFERENT report and must not be swallowed as a
  // duplicate of a stale attempt (mirrors ReportModal's surfaceId-validated
  // reuse, components/shared/ReportModal.tsx:110-133; rotate-on-success :327).
  return `fxav-report-attempt-wizard-${wizardSessionId}-${driveFileId}`;
}

function mintOrReuseAttemptKey(storageKey: string): string {
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const minted = crypto.randomUUID();
    window.sessionStorage.setItem(storageKey, minted);
    return minted;
  } catch {
    return crypto.randomUUID(); // storage unavailable — still send, just unlinkable
  }
}

function rotateAttemptKey(storageKey: string): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    /* storage unavailable — nothing persisted to rotate */
  }
}

/** Single resolution rule for EVERY failure (spec §D3): cataloged dougFacing
 *  if non-null/non-empty after trim, else the exported generic fallback. */
function reportErrorCopy(code: string | null): string {
  if (code !== null && isMessageCode(code)) {
    const copy = messageFor(code as MessageCode).dougFacing;
    if (copy != null && copy.trim().length > 0) return copy;
  }
  return REPORT_GENERIC_ERROR_COPY;
}

/**
 * Report-an-issue section body (follow-ups spec §D3): explainer + labeled
 * textarea + idempotent submit to `POST /api/report` + copy-only status line.
 * `viewerVisibleSection` is read from the chrome context's `getActiveSection`
 * AT SUBMIT TIME (§D3a); outside the chrome context the field is omitted.
 * Modal unmount mid-flight is fire-and-forget by construction — the persisted
 * key makes a retry after reopen a duplicate → success (§D3 guards). Draft
 * persistence is mount-local only (spec-accepted).
 *
 * Follow-ups-b2 §D: the form is collapsed by default behind a disclosure
 * trigger. `draft`/`status`/`handleSubmit` live HERE (component level), NOT in
 * the conditional subtree, so collapsing unmounts the form DOM but preserves
 * the draft, the last status line, and any in-flight POST (fire-and-forget —
 * same posture as modal unmount above).
 */
/**
 * "Content we couldn't read" callout (spec 2026-07-07 §C). Surfaces the parser's
 * `raw_unrecognized` rows — content that was in the sheet but matched no known
 * field — so Doug can see it in the wizard instead of only on /admin/dev. All
 * dynamic text is a React child (auto-escaped); never dangerouslySetInnerHTML.
 * Collapsed by default; instant disclosure (matches ReportIssueSection §D2).
 * Reset-to-collapsed on modal reopen is inherited from the modal remounting.
 */
export function RawUnrecognizedCallout({ raw }: { raw: unknown }) {
  const view = buildRawUnrecognizedView(raw);
  const [expanded, setExpanded] = useState(false);
  // Collapse whenever the underlying content changes, so a modal that swaps rows
  // WITHOUT remounting never opens the next sheet's callout already-expanded.
  // React's adjust-state-during-render pattern (not an effect) avoids a stale
  // open frame and the set-state-in-effect lint.
  const [prevRaw, setPrevRaw] = useState(raw);
  if (raw !== prevRaw) {
    setPrevRaw(raw);
    setExpanded(false);
  }
  if (view.total === 0) return null;
  return (
    // Neutral/informational treatment, NOT warning: this content is not
    // published and needs no urgent action, so it must not compete visually with
    // the blocking "needs your attention" signal (impeccable critique MEDIUM).
    <section className="flex flex-col gap-1 rounded-md border border-border bg-surface-sunken px-3 py-2">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-tap-min items-center justify-between gap-2 text-left text-sm font-semibold text-text-strong"
      >
        <span>{`Content we couldn't read (${view.total})`}</span>
        <span aria-hidden>{expanded ? "−" : "+"}</span>
      </button>
      <p className="text-xs text-text-subtle">
        These rows were in your sheet but didn&rsquo;t match anything we know how to read. They
        aren&rsquo;t published, so check whether they matter.
      </p>
      {/* Instant disclosure, deliberate (collapsed to expanded), matches §D2. */}
      {expanded ? (
        <div className="mt-1 flex flex-col gap-2">
          {view.groups.map((g) => (
            <div key={g.block} className="flex flex-col gap-0.5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
                {g.block}
              </h4>
              <ul className="flex flex-col gap-0.5">
                {g.rows.map((r, i) => (
                  <li key={i} className="font-mono text-xs wrap-break-word text-text-subtle">
                    {r.key}
                    {" | "}
                    {r.value === "" ? "(blank)" : r.value}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {view.hiddenCount > 0 ? (
            <p className="text-xs text-text-subtle">{`+${view.hiddenCount} more not shown`}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function ReportIssueSection({ data }: { data: SectionData }) {
  const { dfid, wizardSessionId, row, warnings } = data;
  const chrome = useContext(Step3SectionChromeContext);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<ReportSectionStatus>({ kind: "idle" });
  const [expanded, setExpanded] = useState(false);
  const textareaId = useId();
  const formId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // §D1: on expand, focus moves to the textarea (async focus contract — tests
  // poll via waitFor). Effect-on-flip: mount starts collapsed so this never
  // fires on initial render, and collapse leaves focus on the trigger.
  useEffect(() => {
    if (expanded) textareaRef.current?.focus();
  }, [expanded]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (message.length === 0 || status.kind === "pending") return;
    setStatus({ kind: "pending" });
    const storageKey = reportAttemptStorageKey(wizardSessionId, dfid);
    const idempotency_key = mintOrReuseAttemptKey(storageKey);
    const payload = {
      surface: "admin",
      show_id: null,
      showTitle: row.stagedShowTitle ?? row.driveFileName ?? null,
      showSlug: null,
      idempotency_key,
      message,
      reporterUrl: window.location.href,
      ...(chrome?.getActiveSection ? { viewerVisibleSection: chrome.getActiveSection() } : {}),
      userAgent: navigator.userAgent,
      parseWarnings: warnings.slice(0, REPORT_PARSE_WARNINGS_CAP),
      fieldRef: {
        kind: "wizard-step3",
        driveFileId: dfid,
        wizardSessionId,
        driveFileName: row.driveFileName ?? null,
        stagedShowTitle: row.stagedShowTitle ?? null,
      },
    };
    try {
      // not-subject-to-meta: internal Next API fetch, not a Supabase client call
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      let parsed: { ok?: boolean; code?: string } = {};
      try {
        parsed = (await res.json()) as typeof parsed;
      } catch {
        parsed = {};
      }
      if (res.ok && parsed.ok === true) {
        // created / duplicate / recovered all count as success (spec §D3).
        rotateAttemptKey(storageKey);
        setDraft("");
        setStatus({ kind: "success" });
        return;
      }
      if (res.status === 410 && parsed.code === "REPORT_HORIZON_EXPIRED") {
        rotateAttemptKey(storageKey); // terminal — a retry is a NEW report
        setStatus({ kind: "error", copy: reportErrorCopy("REPORT_HORIZON_EXPIRED") });
        return;
      }
      const code = parsed.code ?? (res.status >= 500 ? "REPORT_PIPELINE_FAILED" : null);
      setStatus({ kind: "error", copy: reportErrorCopy(code) });
    } catch {
      setStatus({ kind: "error", copy: reportErrorCopy("NETWORK_UNREACHABLE") });
    }
  }

  return (
    <BreakdownSection
      testId={`wizard-step3-card-${dfid}-section-report`}
      label="Report an issue"
      count={null}
    >
      <p className="text-sm text-text-subtle">
        Spotted something wrong or missing that the checks above didn&rsquo;t flag? Send it to the
        developer.
      </p>
      <button
        type="button"
        data-testid={`wizard-step3-card-${dfid}-report-toggle`}
        aria-expanded={expanded}
        aria-controls={formId}
        onClick={() => setExpanded((v) => !v)}
        /* §D1 disclosure trigger — same quiet secondary recipe as the submit
           button below (never the accent CTA; that belongs to Publish). */
        className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        Write a report
      </button>
      {/* §D2: instant — deliberate (collapsed↔expanded; the status swaps inside are §D2 instant too) */}
      {expanded ? (
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-2">
          <label htmlFor={textareaId} className="text-sm font-medium text-text-strong">
            What&rsquo;s wrong or missing?
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            data-testid={`wizard-step3-card-${dfid}-report-textarea`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={REPORT_MESSAGE_MAX_CHARS}
            rows={3}
            /* border-border on bg-bg was 1.22:1 — far under the 3:1 non-text
               minimum (impeccable audit P2, WCAG 1.4.11). border-strong + the
               surface fill together make the field read as a field. */
            className="w-full rounded-sm border border-border-strong bg-surface p-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
          />
          <div className="flex items-center gap-3">
            <button
              type="submit"
              data-testid={`wizard-step3-card-${dfid}-report-submit`}
              disabled={draft.trim().length === 0 || status.kind === "pending"}
              aria-busy={status.kind === "pending" || undefined}
              /* Quiet secondary treatment (impeccable critique P2): the report
                 path must not compete with the footer's accent Publish CTA —
                 same border/surface recipe as the footer Unpublish button.
                 ring-offset-bg matches the content pane surface. */
              className="inline-flex min-h-tap-min items-center justify-center self-start rounded-sm border border-border-strong bg-surface px-4 text-sm font-semibold text-text transition-colors duration-fast hover:bg-surface-sunken disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              Send report
            </button>
            <span
              data-testid={`wizard-step3-card-${dfid}-report-status`}
              role="status"
              aria-live="polite"
              className={`min-w-0 text-sm ${status.kind === "error" ? "font-medium text-warning-text" : "text-text-subtle"}`}
            >
              {/* §D3 status line — instant text swaps (spec §H N7) */}
              {status.kind === "pending"
                ? "Sending…"
                : status.kind === "success"
                  ? "Sent — thanks. The developer will take a look."
                  : status.kind === "error"
                    ? status.copy
                    : ""}
            </span>
          </div>
        </form>
      ) : null}
    </BreakdownSection>
  );
}

/**
 * §B2 diagrams-signal gate: the untrusted-JSONB `diagrams` object carries
 * something renderable — a folder link, embedded images, or pinned folder
 * items. Mirrors the card's `hasDiagrams` badge gate so badge and the Diagrams
 * sub-block agree. Diagrams are no longer their own section; this gates the
 * sub-block rendered BELOW the rooms inside the Rooms & scope section.
 */
export function hasDiagramSignal(diagrams: ParseResult["diagrams"] | null | undefined): boolean {
  const count = arr(diagrams?.embeddedImages).length + arr(diagrams?.linkedFolderItems).length;
  return diagrams != null && (diagrams.linkedFolder != null || count > 0);
}

/**
 * The §6.1 registry (+ follow-ups §D2). 12 defs base; `agenda` (rail entry AND
 * section, only when the baseline is non-empty — the same gate the card uses
 * today) is conditional → 12/13. Diagrams are consolidated INTO the `rooms`
 * section (rendered below the rooms), so they are NOT a separate registry def.
 * Every other section always renders (empty states preserved); `warnings`
 * always renders (§3.10); `report` is unconditional and ALWAYS last (§D2).
 */
export function step3Sections(d: SectionData): Step3SectionDef[] {
  const defs: Step3SectionDef[] = [
    {
      id: "venue",
      label: "Venue",
      group: "The show",
      Icon: MapPin,
      railCount: null,
      render: (s) => <VenueBreakdown dfid={s.dfid} venue={s.pr.show.venue} />,
    },
    {
      id: "event",
      label: "Event details",
      group: "The show",
      Icon: Sparkles,
      railCount: null,
      render: (s) => <EventDetailsBreakdown dfid={s.dfid} eventDetails={s.pr.show.event_details} />,
    },
    {
      id: "crew",
      label: "Crew",
      group: "People",
      Icon: Users,
      railCount: (s) => s.crewMembers.length,
      render: (s) => <CrewBreakdown dfid={s.dfid} members={s.crewMembers} />,
    },
    {
      id: "contacts",
      label: "Contacts",
      group: "People",
      Icon: Phone,
      // Contact-BLOCK count, exactly as the body renders it today
      // (count={blocks.length}) — shared shaping via contactBlocks.
      railCount: (s) => contactBlocks(s.pr.show.client_contact, arr(s.pr.contacts)).length,
      render: (s) => (
        <ContactsBreakdown
          dfid={s.dfid}
          clientContact={s.pr.show.client_contact}
          contacts={arr(s.pr.contacts)}
        />
      ),
    },
    {
      id: "schedule",
      label: "Crew schedule",
      group: "Schedule",
      Icon: CalendarDays,
      // No rail count (owner decision, 2026-07-05): only Crew, Contacts, Rooms,
      // and Parse warnings show a count. Keep in lockstep with COUNT_SECTIONS.
      railCount: null,
      render: (s) => <ScheduleBreakdown dfid={s.dfid} ros={s.ros} dates={s.pr.show.dates} />,
    },
  ];
  if (d.agendaBaseline.length > 0) {
    defs.push({
      id: "agenda",
      label: "Agenda",
      group: "Schedule",
      Icon: FileText,
      railCount: null,
      render: (s) => (
        <AgendaBreakdown
          driveFileId={s.dfid}
          wizardSessionId={s.wizardSessionId}
          baseline={s.agendaBaseline}
          stateKey={s.row.agendaStateKey ?? s.dfid}
        />
      ),
    });
  }
  defs.push(
    {
      id: "hotels",
      label: "Hotels",
      group: "Logistics",
      Icon: BedDouble,
      // No rail count (owner decision, 2026-07-05) — see COUNT_SECTIONS.
      railCount: null,
      render: (s) => <HotelsBreakdown dfid={s.dfid} hotels={s.hotels} />,
    },
    {
      id: "transport",
      label: "Transport",
      group: "Logistics",
      Icon: Truck,
      railCount: null,
      render: (s) => <TransportBreakdown dfid={s.dfid} transportation={s.pr.transportation} />,
    },
    {
      id: "rooms",
      label: "Rooms & scope",
      group: "Gear",
      Icon: LayoutGrid,
      // Rail count mirrors the body header: only A/V-scoped rooms are tallied
      // (roomHasScope) — a no-A/V placeholder room renders but is not counted.
      railCount: (s) => s.rooms.filter(roomHasScope).length,
      // Diagrams are consolidated INTO this section, BELOW the rooms — they ARE
      // the rooms' floor plans (Doug's own sheet links its "Room Diagram" cell
      // to the DIAGRAMS tab). No separate nav entry. The Diagrams sub-block
      // renders only when the untrusted-JSONB diagrams object carries a signal
      // (folder link / embedded images / pinned folder items — the same
      // `hasDiagramSignal` gate the card's badge uses), wrapped in its OWN
      // chrome provider so it keeps the "Diagrams" heading (icon + count),
      // never inheriting the outer "Rooms & scope" chrome.
      render: (s) => (
        <div className="flex min-w-0 flex-col gap-4">
          <RoomsBreakdown dfid={s.dfid} rooms={s.rooms} />
          {hasDiagramSignal(s.pr.diagrams) ? (
            // headingLevel 4 → subordinate "Diagrams" sub-heading (h4, smaller)
            // so it reads as part of Rooms & scope, not a co-equal section.
            <Step3SectionChromeContext.Provider
              value={{ Icon: Images, label: "Diagrams", flagged: false, headingLevel: 4 }}
            >
              <DiagramsBreakdown
                dfid={s.dfid}
                wizardSessionId={s.wizardSessionId}
                diagrams={s.pr.diagrams}
              />
            </Step3SectionChromeContext.Provider>
          ) : null}
        </div>
      ),
    },
  );
  defs.push(
    {
      id: "packlist",
      label: "Pack list",
      group: "Gear",
      Icon: Package,
      // No rail count (owner decision, 2026-07-05) — see COUNT_SECTIONS.
      railCount: null,
      render: (s) => (
        <PackListBreakdown
          dfid={s.dfid}
          wizardSessionId={s.wizardSessionId}
          cases={s.pullSheet}
          archivedPullSheetTabs={s.archivedPullSheetTabs}
          overrideActive={s.archivedPullSheetTabs.some((t) => t.included)}
        />
      ),
    },
    {
      id: "billing",
      label: "Billing & docs",
      group: "Money",
      Icon: Receipt,
      railCount: null,
      render: (s) => <OpsBreakdown dfid={s.dfid} show={s.pr.show} />,
    },
    {
      id: "warnings",
      label: "Parse warnings",
      group: "Checks",
      Icon: AlertTriangle,
      // Both severities — the rail count counts list rows (§3.3).
      railCount: (s) => s.warnings.length,
      render: (s) => <WarningsBreakdown dfid={s.dfid} warnings={s.warnings} />,
    },
    {
      id: "report",
      label: "Report an issue",
      group: "Checks",
      Icon: MessageSquareWarning, // design-stage-tunable (spec §L)
      railCount: null,
      hideDot: true, // spec §D2 — the only section without a status dot
      render: (s) => <ReportIssueSection data={s} />,
    },
  );
  return defs;
}
