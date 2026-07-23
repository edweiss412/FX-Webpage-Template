// Tier-2 structural matrix (spec §4.2): few codes, every structural axis.
//
// Codes are classified at RUNTIME by the real predicates. INBOX_ROUTED_CODES and
// AUTO_RESOLVING_CODES are themselves derived from the message catalog, so a
// hardcoded pick would silently stop representing its axis the moment the
// catalog moved.
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving, DOUG_EXCLUDED_CODES } from "@/lib/adminAlerts/audience";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { ALERT_ROW_OVERRIDES } from "@/lib/dev/attentionScenarios/tier1";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { AttentionScenario, ScenarioAlertRow, ScenarioHoldRow } from "./types";
import type { ParseWarning } from "@/lib/parser/types";

export const MENU_CAP = 12;
const AT = "2026-07-01T12:00:00.000Z";

export const T2_SECTION_ABSENT = "t2-section-absent";
export const T2_OVERVIEW_ABSENT = "t2-overview-absent";
export const T2_ANCHOR_ABSENT = "t2-anchor-absent";
export const T2_CREW_ROW_ABSENT = "t2-crew-row-absent";
export const T2_HOLD_ONLY = "t2-hold-only";
export const T2_INBOX_ROUTED = "t2-inbox-routed";
export const T2_AUTO_RESOLVING = "t2-auto-resolving";
export const T2_ACTIONABLE = "t2-actionable";
export const T2_OCCURRENCE_MANY = "t2-occurrence-many";
export const T2_IDENTITY_ABSENT = "t2-identity-absent";
export const T2_UNCATALOGED = "t2-uncataloged";
export const T2_EMPTY = "t2-empty";
export const T2_SINGLE = "t2-single";
export const T2_MANY = "t2-many";
export const T2_DEGRADED = "t2-degraded";
export const T2_CLASS_MIX = "t2-class-mix";
export const T2_DEGRADED_WITH_HOLDS = "t2-degraded-with-holds";
export const T2_MULTI_HOLD = "t2-multi-hold";
export const T2_FEED_TRUNCATED = "t2-feed-truncated";

export const T2_REQUIRED_IDS: readonly string[] = [
  T2_SECTION_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_ANCHOR_ABSENT,
  T2_CREW_ROW_ABSENT,
  T2_HOLD_ONLY,
  T2_INBOX_ROUTED,
  T2_AUTO_RESOLVING,
  T2_ACTIONABLE,
  T2_OCCURRENCE_MANY,
  T2_IDENTITY_ABSENT,
  T2_UNCATALOGED,
  T2_EMPTY,
  T2_SINGLE,
  T2_MANY,
  T2_DEGRADED,
  T2_CLASS_MIX,
  T2_DEGRADED_WITH_HOLDS,
  T2_MULTI_HOLD,
  T2_FEED_TRUNCATED,
  // Modal-state-coverage roster (spec 2026-07-22 §3.6).
  "t2-changelog-history",
  "t2-hold-dispositions",
  "t2-feed-infra-error",
  "t2-archived",
  "t2-unpublished",
  "t2-finalizing",
  "t2-publishing",
  "t2-live-now",
  "t2-share-link",
  "t2-share-single",
  "t2-share-batches",
  "t2-sync-drive-error",
  "t2-sync-sheet-unavailable",
  "t2-sync-parse-error",
  "t2-sync-shrink-held",
  "t2-sync-pending-review",
  "t2-sync-pending",
  "t2-sync-not-yet",
  "t2-sync-unknown",
  "t2-never-synced",
  "t2-sync-no-check",
  "t2-minimal-header",
  "t2-nothing-parsed",
  "t2-overflow-volumes",
  "t2-roster-over-cap",
  "t2-solo-hotel",
  "t2-hotel-guest-stack",
  "t2-packlist-overflow",
  "t2-agenda-overflow",
  "t2-multi-agenda",
  "t2-warning-spread",
  "t2-alert-deep-link",
  "t2-diagram-images",
  "t2-attention-extras",
  "t2-ignored-warnings",
  "t2-all-ignored",
];

/**
 * Codes whose §3.1 contract requires context. Excluded from `pickCode` so an
 * actionability axis never accidentally lands on a code that also needs a
 * context fixture - it would still validate, but the axis would then be testing
 * two things at once.
 */
const CONTEXT_REQUIRED = new Set([
  "TILE_PROJECTION_FETCH_FAILED",
  "SHOW_FIRST_PUBLISHED",
  "PARSE_ERROR_LAST_GOOD",
  "ROLE_FLAGS_NOTICE",
  "AMBIGUOUS_EMAIL_BINDING",
  "OAUTH_IDENTITY_CLAIMED",
]);

/**
 * A code that `deriveAttentionItems` removes before anything renders: the
 * PICKER_EPOCH_RESET cut, plus DOUG_EXCLUDED_CODES (info-severity UNION health)
 * which warning-surface-trim §5 took off Doug's attention surface. A structural
 * axis built on one of these renders NOTHING, so the axis would silently stop
 * testing what it names.
 */
export function isCutFromSurface(code: string): boolean {
  return code === "PICKER_EPOCH_RESET" || DOUG_EXCLUDED_CODES.includes(code);
}

/**
 * Throwing is deliberate: an empty class means the catalog moved in a way this
 * matrix must be updated for, not an axis to quietly skip.
 */
function pickCode(kind: "inbox" | "auto" | "actionable"): string {
  const codes = Object.keys(ATTENTION_ROUTES)
    .filter((c) => !isCutFromSurface(c) && !CONTEXT_REQUIRED.has(c))
    .sort();
  const found = codes.find((c) => {
    const inbox = isInboxRouted(c);
    const auto = isAutoResolving(c);
    if (kind === "inbox") return inbox;
    if (kind === "auto") return auto && !inbox;
    return !inbox && !auto;
  });
  if (found === undefined) throw new Error(`tier2: no ATTENTION_ROUTES code is ${kind}`);
  return found;
}

/**
 * Classify a candidate by the DERIVED item's pill class (spec §3.2): probe one
 * alert through the real derivation. Zero items = cut from the surface. This is
 * the pill's own actionable/clearingKind split, so isAutoResolving vs
 * isSelfHealing divergence cannot skew a pick.
 */
export function pickByDerivedClass(
  kind: "actionable" | "needs_look" | "self_heal",
  exclude: ReadonlySet<string> = new Set(),
): string {
  const codes = Object.keys(ATTENTION_ROUTES)
    .filter((c) => !CONTEXT_REQUIRED.has(c) && !exclude.has(c))
    .sort();
  const found = codes.find((c) => {
    const items = deriveScenarioAttention({
      id: "t2-probe",
      tier: 2,
      label: "probe",
      alerts: [alert(c)],
      holds: [],
    });
    const it = items[0];
    if (items.length !== 1 || it === undefined) return false;
    if (kind === "actionable") return it.actionable;
    return !it.actionable && it.clearingKind === kind;
  });
  if (found === undefined) throw new Error(`tier2: no ATTENTION_ROUTES code derives class ${kind}`);
  return found;
}

/** An anchored (rooms) code, read from the routing table so it cannot disagree. */
function anchoredCode(): string {
  const found = Object.keys(ATTENTION_ROUTES).find(
    (c) =>
      ATTENTION_ROUTES[c]?.sectionId === "rooms" &&
      !CONTEXT_REQUIRED.has(c) &&
      !isCutFromSurface(c),
  );
  if (found === undefined) throw new Error("tier2: no context-free rooms-anchored code");
  return found;
}

/** An event-anchored code, read from the routing table so it cannot disagree. */
function eventCode(): string {
  const found = Object.keys(ATTENTION_ROUTES).find(
    (c) =>
      ATTENTION_ROUTES[c]?.sectionId === "event" &&
      !CONTEXT_REQUIRED.has(c) &&
      !isCutFromSurface(c),
  );
  if (found === undefined) throw new Error("tier2: no context-free event-anchored code");
  return found;
}

function alert(code: string, over: Partial<Omit<ScenarioAlertRow, "code">> = {}): ScenarioAlertRow {
  return {
    code,
    context: over.context ?? {},
    raised_at: over.raised_at ?? AT,
    occurrence_count: over.occurrence_count ?? 1,
    ...(over.galleryIdentity !== undefined ? { galleryIdentity: over.galleryIdentity } : {}),
  };
}

/**
 * The crew axes need a crew-routed code that still REACHES the surface.
 * ATTENTION_ROUTES has three crew codes and warning-surface-trim §5 cut two of
 * them (ROLE_FLAGS_NOTICE and OAUTH_IDENTITY_CLAIMED are info-severity, so they
 * are in DOUG_EXCLUDED_CODES), leaving AMBIGUOUS_EMAIL_BINDING. Chosen at
 * RUNTIME rather than hardcoded, so if the surviving code changes again the
 * axis follows instead of silently rendering nothing.
 *
 * Its crewKey comes from the resolved identity (deriveAlertRowFields reads a
 * single "Crew" segment), not from context, so the identity is declared here.
 */
function crewCode(): string {
  const found = Object.keys(ATTENTION_ROUTES).find(
    (c) => ATTENTION_ROUTES[c]?.sectionId === "crew" && !isCutFromSurface(c),
  );
  if (found === undefined) throw new Error("tier2: no crew-routed code survives the surface cut");
  return found;
}

function crewAlert(): ScenarioAlertRow {
  return alert(crewCode(), {
    context: { crew_member_id: "3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f" },
    galleryIdentity: {
      segments: [{ label: "Crew", value: "Dana Reed" }],
      global: null,
    } as unknown as AlertIdentity,
  });
}

function hold(entityKey: string): ScenarioHoldRow {
  return {
    drive_file_id: "gallery-fixture-file",
    domain: "crew_email",
    entity_key: entityKey,
    held_value: { email: "old@example.test" },
    proposed_value: { disposition: "email_change", name: "Dana Reed", email: "new@example.test" },
    base_modified_time: AT,
    kind: "mi11_pending",
  };
}

/**
 * The realistic many-state (spec §3.3): MENU_CAP-1 DISTINCT real alerts spanning
 * rooms/event/crew plus all three pill classes, one repeat-count carrier, filled
 * from surviving context-free codes then context-required codes WITH their
 * tier-1 context fixtures. Throws if the catalog cannot field enough codes -
 * the matrix must be updated, never silently thinned.
 */
function manyAlerts(): ScenarioAlertRow[] {
  const used = new Set<string>();
  const pick = (
    code: string,
    over: Partial<Omit<ScenarioAlertRow, "code">> = {},
  ): ScenarioAlertRow => {
    used.add(code);
    return alert(code, over);
  };
  const crew = crewAlert();
  used.add(crew.code);
  const rows: ScenarioAlertRow[] = [pick(anchoredCode()), pick(eventCode()), crew];
  rows.push(pick(pickByDerivedClass("actionable", used), { occurrence_count: 7 }));
  rows.push(pick(pickByDerivedClass("needs_look", used)));
  rows.push(pick(pickByDerivedClass("self_heal", used)));
  const contextFree = Object.keys(ATTENTION_ROUTES)
    .filter((c) => !isCutFromSurface(c) && !CONTEXT_REQUIRED.has(c) && !used.has(c))
    .sort();
  for (const c of contextFree) {
    if (rows.length >= MENU_CAP - 1) break;
    rows.push(pick(c));
  }
  const backfill = Object.keys(ALERT_ROW_OVERRIDES)
    .filter((c) => !isCutFromSurface(c) && !used.has(c))
    .sort();
  for (const c of backfill) {
    if (rows.length >= MENU_CAP - 1) break;
    rows.push(pick(c, ALERT_ROW_OVERRIDES[c] ?? {}));
  }
  if (rows.length !== MENU_CAP - 1) {
    throw new Error(`tier2: only ${rows.length} surviving codes for t2-many`);
  }
  return rows;
}

function scenario(
  id: string,
  label: string,
  rest: Omit<AttentionScenario, "id" | "tier" | "label">,
): AttentionScenario {
  return { id, tier: 2, label, ...rest };
}

export function tier2Scenarios(): AttentionScenario[] {
  return [
    scenario(T2_SECTION_ABSENT, "Routed section unavailable, falls back to Overview", {
      alerts: [crewAlert()],
      holds: [],
      bucket: { sectionAvailable: (s) => s === "overview" },
    }),
    scenario(T2_OVERVIEW_ABSENT, "No section available, card still lands in Overview (no-drop)", {
      alerts: [crewAlert()],
      holds: [],
      bucket: { sectionAvailable: () => false },
    }),
    scenario(
      T2_ANCHOR_ABSENT,
      "Anchor slot absent, redirects to Overview (rooms has no section top)",
      {
        alerts: [alert(anchoredCode())],
        holds: [],
        bucket: { anchorAvailable: () => false },
      },
    ),
    scenario(T2_CREW_ROW_ABSENT, "Crew key unrendered, falls back to the crew section top", {
      alerts: [crewAlert()],
      holds: [],
      bucket: { crewKeyRendered: () => false },
    }),
    scenario(T2_HOLD_ONLY, "A pending hold and no alerts", {
      alerts: [],
      holds: [hold("dana-reed")],
    }),
    scenario(T2_INBOX_ROUTED, "Inbox-routed code, auto-clears with the inbox note", {
      alerts: [alert(pickCode("inbox"))],
      holds: [],
    }),
    scenario(T2_AUTO_RESOLVING, "Self-resolving code, auto-clears with its own note", {
      alerts: [alert(pickCode("auto"))],
      holds: [],
    }),
    scenario(T2_ACTIONABLE, "Actionable code, the manual resolve control renders", {
      alerts: [alert(pickCode("actionable"))],
      holds: [],
    }),
    scenario(T2_OCCURRENCE_MANY, "Repeat count above one", {
      alerts: [alert(pickCode("actionable"), { occurrence_count: 7 })],
      holds: [],
    }),
    scenario(T2_IDENTITY_ABSENT, "No declared identity, so no menu subtitle", {
      alerts: [alert(pickCode("actionable"), { galleryIdentity: null })],
      holds: [],
    }),
    scenario(T2_UNCATALOGED, "Uncataloged code, fallback title and Overview route", {
      alerts: [alert("GALLERY_UNCATALOGED_CODE")],
      holds: [],
    }),
    scenario(T2_EMPTY, "No attention at all", { alerts: [], holds: [] }),
    scenario(T2_SINGLE, "Exactly one item", { alerts: [alert(pickCode("actionable"))], holds: [] }),
    scenario(T2_MANY, "12 real items across sections and classes", {
      alerts: manyAlerts(),
      holds: [hold("dana-reed")],
    }),
    scenario(T2_DEGRADED, "Alert read degraded", { alerts: [], holds: [], degraded: true }),
    scenario(T2_CLASS_MIX, "One of each pill class: confirm, review, monitoring", {
      alerts: (() => {
        const a = pickByDerivedClass("actionable");
        const n = pickByDerivedClass("needs_look", new Set([a]));
        const h = pickByDerivedClass("self_heal", new Set([a, n]));
        return [alert(a), alert(n), alert(h)];
      })(),
      holds: [],
    }),
    scenario(T2_DEGRADED_WITH_HOLDS, "Alert read degraded while a hold still flows", {
      alerts: [],
      holds: [hold("dana-reed")],
      degraded: true,
    }),
    scenario(T2_MULTI_HOLD, "Three pending holds", {
      alerts: [],
      holds: [hold("dana-reed"), hold("sam-ito"), hold("kim-cho")],
    }),
    scenario(T2_FEED_TRUNCATED, "Changes feed truncated at its cap", {
      alerts: [],
      holds: [hold("dana-reed")],
      feedTruncated: true,
    }),
    ...modalStateScenarios(),
  ];
}

// ── Modal-state-coverage roster (spec 2026-07-22 §3.6; plan Task 6) ──────────
//
// 36 tier-2 scenarios making every static non-happy-path modal state reachable:
// the change-log feed compositions, lifecycle/sync postures, empty sections,
// caps/overflow volumes, ignored warnings, and the share-link states. Fixture
// knobs are gallery-render-only (validateScenario pins the tier-2 exclusivity).
import type { ScenarioChangeLogRow, ScenarioFixture } from "./types";
import type { ScenarioGroupId } from "@/lib/dev/galleryModalTypes";

const LOG_AT = "2026-07-01T1"; // hour prefix; rows stamp distinct minutes below

function logRow(
  minute: number,
  over: Partial<ScenarioChangeLogRow> = {},
): ScenarioChangeLogRow {
  return {
    occurred_at: `${LOG_AT}0:${String(minute).padStart(2, "0")}:00.000Z`,
    status: "applied",
    summary: `Change at minute ${minute}`,
    entity_ref: null,
    change_kind: "field_changed",
    individually_undoable: false,
    source: "auto_apply",
    acknowledged_at: null,
    ...over,
  };
}

/**
 * The spec §3.6 11-row matrix, exactly: every badge, the Accept/Undo/Accepted
 * compositions (incl. acceptable∧undoable and acknowledged-after-undo/supersede),
 * and the action-less plain Applied row.
 */
function changelogHistoryRows(): ScenarioChangeLogRow[] {
  return [
    // (1) Undo only: applied crew_renamed, mi11_approve (not acceptable).
    logRow(1, {
      change_kind: "crew_renamed",
      individually_undoable: true,
      source: "mi11_approve",
      summary: "Dana Reed renamed to Dana R. Reed",
    }),
    // (2)+(3) Accept buttons (auto_apply, ack null).
    logRow(2, { summary: "Venue address updated from the sheet" }),
    logRow(3, { summary: "Show dates updated from the sheet" }),
    // (4) Accept AND Undo co-rendered.
    logRow(4, {
      change_kind: "crew_added",
      individually_undoable: true,
      summary: "Riley Nax added to the crew",
    }),
    // (5) "Accepted" tag (acknowledged).
    logRow(5, {
      acknowledged_at: "2026-07-01T11:00:00.000Z",
      summary: "Hotel block updated from the sheet",
    }),
    // (6) Rejected.
    logRow(6, {
      status: "rejected",
      source: "mi11_reject",
      change_kind: "crew_email_changed",
      summary: "Email change for Avery Chen rejected",
    }),
    // (7) Undone, never acknowledged.
    logRow(7, {
      status: "undone",
      source: "undo",
      change_kind: "crew_removed",
      summary: "Crew removal undone",
    }),
    // (8) Undone WITH acknowledgement -> "Undone" badge + "Accepted" tag.
    logRow(8, {
      status: "undone",
      source: "undo",
      change_kind: "crew_renamed",
      acknowledged_at: "2026-07-01T11:05:00.000Z",
      summary: "Rename undone after review",
    }),
    // (9) Superseded, never acknowledged.
    logRow(9, { status: "superseded", summary: "Older room change superseded" }),
    // (10) PLAIN Applied: mi11_approve crew_email_changed - no action, no tag.
    logRow(10, {
      change_kind: "crew_email_changed",
      source: "mi11_approve",
      summary: "Approved email change for Blake Osei",
    }),
    // (11) Superseded WITH acknowledgement -> badge + "Accepted" together.
    logRow(11, {
      status: "superseded",
      acknowledged_at: "2026-07-01T11:10:00.000Z",
      summary: "Acknowledged change later superseded",
    }),
  ];
}

function mscHold(
  entityKey: string,
  proposed: ScenarioHoldRow["proposed_value"],
  held: Record<string, unknown> = { email: "old@example.test" },
): ScenarioHoldRow {
  return {
    drive_file_id: "gallery-fixture-file",
    domain: "crew_identity",
    entity_key: entityKey,
    held_value: held,
    proposed_value: proposed,
    base_modified_time: AT,
    kind: "mi11_pending",
  };
}

const CREW_STACK_SUBJECT = "Avery Chen";

function crewScopedWarning(code: string, detected: string, corrected: string): ParseWarning {
  return {
    severity: "warn",
    code,
    message: "Synthetic warning for gallery review.",
    rawSnippet: `${detected} ${CREW_STACK_SUBJECT}`,
    blockRef: { kind: "crew" },
    autocorrect: {
      subject: CREW_STACK_SUBJECT,
      corrections: [{ detected, corrected }],
    },
  };
}

function spreadWarning(kind: string, snippet: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_FIELD",
    message: "Synthetic warning for gallery review.",
    rawSnippet: snippet,
    blockRef: { kind },
  };
}

function ignorableWarning(snippet: string): ParseWarning {
  return {
    severity: "warn",
    code: "TYPO_NORMALIZED",
    message: "Synthetic warning for gallery review.",
    rawSnippet: snippet,
    blockRef: { kind: "rooms" },
  };
}

function fixtureScenario(
  id: string,
  label: string,
  fixture: ScenarioFixture,
  landing: ScenarioGroupId,
): AttentionScenario {
  return { id, tier: 2, label, alerts: [], holds: [], fixture, landing };
}

export function modalStateScenarios(): AttentionScenario[] {
  return [
    // ── Changes-class ────────────────────────────────────────────────────────
    scenario("t2-changelog-history", "Every change-feed badge and action composition", {
      alerts: [],
      holds: [hold("msc-dana-reed")],
      changeLog: changelogHistoryRows(),
      landing: "changes",
    }),
    scenario("t2-hold-dispositions", "All four hold renderings", {
      alerts: [],
      holds: [
        hold("msc-email-change"),
        mscHold(
          "msc-rename-plain",
          { disposition: "rename", name: "Dana R. Reed", email: "old@example.test" },
          { name: "Dana Reed", email: "old@example.test" },
        ),
        mscHold(
          "msc-rename-folded",
          { disposition: "rename", name: "Dana R. Reed", email: "moved@example.test" },
          { name: "Dana Reed", email: "old@example.test" },
        ),
        mscHold("msc-removal", { disposition: "removal" }, { name: "Casey Ruiz" }),
      ],
      landing: "changes",
    }),
    scenario("t2-feed-infra-error", "Changes feed infra failure (null feed)", {
      alerts: [],
      holds: [],
      feedNull: true,
      landing: "changes",
    }),
    // ── Lifecycle ────────────────────────────────────────────────────────────
    fixtureScenario(
      "t2-archived",
      "Archived, read-only strip with Unarchive in the hub",
      { archived: true, published: false },
      "overview",
    ),
    fixtureScenario("t2-unpublished", "Unpublished toggle and paused share link", { published: false }, "overview"),
    fixtureScenario("t2-finalizing", "Finalize chip on the ON toggle", { finalizeOwned: true }, "overview"),
    fixtureScenario(
      "t2-publishing",
      "Publishing chip: unpublished with finalize ownership",
      { published: false, finalizeOwned: true },
      "overview",
    ),
    fixtureScenario("t2-live-now", "Live-now badge with date-consistent fixture", { isLive: true }, "overview"),
    {
      id: "t2-share-link",
      tier: 2,
      label: "Active crew link with an empty roster (no email actions)",
      alerts: [],
      holds: [],
      fixture: { empty: ["crew"], share: { linkActive: true, crewEmails: 0 } },
      landing: "mixed",
    },
    fixtureScenario(
      "t2-share-single",
      "Active crew link with one email batch",
      { share: { linkActive: true, crewEmails: 3 } },
      "overview",
    ),
    fixtureScenario(
      "t2-share-batches",
      "Active crew link with multiple email batches",
      { share: { linkActive: true, crewEmails: 60 } },
      "overview",
    ),
    // ── Sync postures ────────────────────────────────────────────────────────
    fixtureScenario("t2-sync-drive-error", "Sync: couldn't reach Drive", { lastSyncStatus: "drive_error" }, "overview"),
    fixtureScenario(
      "t2-sync-sheet-unavailable",
      "Sync: sheet not in folder",
      { lastSyncStatus: "sheet_unavailable" },
      "overview",
    ),
    fixtureScenario("t2-sync-parse-error", "Sync: couldn't read the sheet", { lastSyncStatus: "parse_error" }, "overview"),
    fixtureScenario("t2-sync-shrink-held", "Sync: re-sync held (data loss)", { lastSyncStatus: "shrink_held" }, "overview"),
    fixtureScenario(
      "t2-sync-pending-review",
      "Sync: changes to review",
      { lastSyncStatus: "pending_review" },
      "overview",
    ),
    fixtureScenario("t2-sync-pending", "Sync: in progress", { lastSyncStatus: "pending" }, "overview"),
    fixtureScenario("t2-sync-not-yet", "Sync: not synced yet (null status)", { lastSyncStatus: null }, "overview"),
    fixtureScenario(
      "t2-sync-unknown",
      "Sync: defensive unknown-status bucket",
      { lastSyncStatus: "mystery_future_status" },
      "overview",
    ),
    fixtureScenario("t2-never-synced", "Sync element entirely absent", { neverSynced: true }, "overview"),
    fixtureScenario(
      "t2-sync-no-check",
      "Synced time falls back when the check stamp is absent",
      { checkedAbsent: true },
      "overview",
    ),
    // ── Header minimal + empty ───────────────────────────────────────────────
    fixtureScenario(
      "t2-minimal-header",
      "Slug-fallback title, no dates, no client",
      { titleAbsent: true, datesAbsent: true, clientAbsent: true },
      "overview",
    ),
    fixtureScenario(
      "t2-nothing-parsed",
      "Every parsed section empty",
      {
        empty: ["crew", "venue", "rooms", "hotels", "transport", "contacts", "billing", "agenda"],
        datesAbsent: true,
      },
      "mixed",
    ),
    // ── Volumes / overflow ───────────────────────────────────────────────────
    fixtureScenario(
      "t2-overflow-volumes",
      "Crew, rooms, hotels, and schedule overflow the render caps",
      { volumes: { crew: 31, rooms: 21, hotels: 13, schedule: "overflow" } },
      "mixed",
    ),
    fixtureScenario(
      "t2-roster-over-cap",
      "Roster past the 500-row cap: crew-row actions suppressed",
      { volumes: { crew: 501 } },
      "crew",
    ),
    fixtureScenario("t2-solo-hotel", "Exactly one hotel (flat solo card)", { volumes: { hotels: 1 } }, "mixed"),
    fixtureScenario(
      "t2-hotel-guest-stack",
      "Hotel guest avatar stack past the five-avatar cap",
      { volumes: { hotelGuests: 7 } },
      "mixed",
    ),
    fixtureScenario(
      "t2-packlist-overflow",
      "Pack list case and per-case item overflow",
      { volumes: { packlist: { cases: 13, itemsPerCase: 9 } } },
      "mixed",
    ),
    fixtureScenario(
      "t2-agenda-overflow",
      "Agenda schedule block with dropped sessions, days, and tracks",
      { volumes: { agenda: "overflow" } },
      "mixed",
    ),
    fixtureScenario(
      "t2-multi-agenda",
      "Multiple agenda links, badged, capped at six",
      { volumes: { agendaLinks: 7 } },
      "mixed",
    ),
    scenario("t2-warning-spread", "Warning pointer overflow past three named sections", {
      alerts: [],
      holds: [],
      warnings: [
        spreadWarning("crew", "Crew field oddity"),
        spreadWarning("hotels", "Hotel field oddity"),
        spreadWarning("rooms", "Room field oddity"),
        spreadWarning("transportation", "Transport field oddity"),
        spreadWarning("contacts", "Contact field oddity"),
      ],
    }),
    scenario("t2-alert-deep-link", "The alert_id one-shot flash deep link", {
      alerts: [alert("SHEET_UNAVAILABLE")],
      holds: [],
      fixture: { alertFlash: true },
    }),
    // ── Diagrams / attention extras / ignored ────────────────────────────────
    scenario("t2-diagram-images", "Diagram thumbnail grid, overflow note, and preview fallback", {
      alerts: [alert("EMBEDDED_ASSET_DRIFTED")],
      holds: [],
      fixture: { volumes: { diagramImages: 13 } },
    }),
    scenario("t2-attention-extras", "Failed-keys overflow and the crew under-row stack", {
      alerts: [
        alert("TILE_PROJECTION_FETCH_FAILED", {
          context: {
            failedKeys: [
              "tile:agenda",
              "tile:rooms",
              "tile:hotels",
              "tile:crew",
              "tile:venue",
              "tile:transport",
              "tile:billing",
            ],
          },
        }),
        alert("AMBIGUOUS_EMAIL_BINDING", {
          context: { crew_member_id: "3f8c1e2a-5b6d-4c7e-8f90-1a2b3c4d5e6f" },
          galleryIdentity: {
            segments: [{ label: "Crew", value: CREW_STACK_SUBJECT }],
          } as unknown as AlertIdentity,
        }),
      ],
      holds: [],
      warnings: [
        crewScopedWarning("STAGE_WORD_AUTOCORRECTED", "stge", "stage"),
        crewScopedWarning("ROLE_TOKEN_AUTOCORRECTED", "A11", "A1"),
      ],
    }),
    scenario("t2-ignored-warnings", "Active bulk pair beside an ignored pair", {
      alerts: [],
      holds: [],
      warnings: [
        ignorableWarning("Ballrom A"),
        ignorableWarning("Ballrom B"),
        ignorableWarning("Greenroom X"),
        ignorableWarning("Greenroom Y"),
      ],
      ignoreWarningIndexes: [2, 3],
      landing: "warnings",
    }),
    scenario("t2-all-ignored", "Every warning ignored: clean copy plus the disclosure", {
      alerts: [],
      holds: [],
      warnings: [ignorableWarning("Loading dck"), ignorableWarning("Foyer stge")],
      ignoreWarningIndexes: [0, 1],
      landing: "warnings",
    }),
  ];
}
