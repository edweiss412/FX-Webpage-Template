// Tier-2 structural matrix (spec §4.2): few codes, every structural axis.
//
// Codes are classified at RUNTIME by the real predicates. INBOX_ROUTED_CODES and
// AUTO_RESOLVING_CODES are themselves derived from the message catalog, so a
// hardcoded pick would silently stop representing its axis the moment the
// catalog moved.
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving } from "@/lib/adminAlerts/audience";
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
 * Throwing is deliberate: an empty class means the catalog moved in a way this
 * matrix must be updated for, not an axis to quietly skip.
 */
function pickCode(kind: "inbox" | "auto" | "actionable"): string {
  const codes = Object.keys(ATTENTION_ROUTES)
    .filter((c) => c !== "PICKER_EPOCH_RESET" && !CONTEXT_REQUIRED.has(c))
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

/** An anchored (rooms) code, read from the routing table so it cannot disagree. */
function anchoredCode(): string {
  const found = Object.keys(ATTENTION_ROUTES).find(
    (c) => ATTENTION_ROUTES[c]?.sectionId === "rooms" && !CONTEXT_REQUIRED.has(c),
  );
  if (found === undefined) throw new Error("tier2: no context-free rooms-anchored code");
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
 * Every crew-routed code requires context (all three are identity or
 * role-change codes), so the crew axes use ROLE_FLAGS_NOTICE with the shape
 * projectIdentityContext actually reads: ctx.changes[].crew_name.
 */
function crewAlert(): ScenarioAlertRow {
  return alert("ROLE_FLAGS_NOTICE", { context: { changes: [{ crew_name: "Dana Reed" }] } });
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
    scenario(T2_OVERVIEW_ABSENT, "No section available, card is dropped", {
      alerts: [crewAlert()],
      holds: [],
      bucket: { sectionAvailable: () => false },
    }),
    scenario(T2_ANCHOR_ABSENT, "Anchor slot absent, falls back to the section top", {
      alerts: [alert(anchoredCode())],
      holds: [],
      bucket: { anchorAvailable: () => false },
    }),
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
    scenario(T2_MANY, `${MENU_CAP} items, the menu crosses its scroll threshold`, {
      alerts: Array.from({ length: MENU_CAP }, (_, i) =>
        alert(`GALLERY_FILLER_${String(i).padStart(2, "0")}`),
      ),
      holds: [],
    }),
    scenario(T2_DEGRADED, "Alert read degraded", { alerts: [], holds: [], degraded: true }),
  ];
}
