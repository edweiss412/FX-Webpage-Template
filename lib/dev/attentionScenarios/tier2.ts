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
  const pick = (code: string, over: Partial<Omit<ScenarioAlertRow, "code">> = {}): ScenarioAlertRow => {
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
  ];
}
