// The catalog guard contract, as code (spec §3.6).
//
// Two review rounds reported "guards enumerated incompletely" against a prose
// table. A third prose enumeration would have failed the same way, so the rules
// live here: a malformed scenario is rejected by a test and never reaches either
// consumer. That is why §4 specifies rendering behavior rather than per-field
// malformed-input behavior - the malformed cases are unreachable by construction.
import { PARSE_FAILURE_ALLOWLIST } from "@/lib/messages/parseFailureReason";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { GROUP_ORDER } from "@/lib/dev/galleryModalTypes";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import type {
  AttentionScenario,
  ScenarioAlertRow,
  ScenarioHoldRow,
  ScenarioActionOutcomes,
} from "./types";
import { RESYNC_ERROR_CODES } from "./types";
import { buildScenarioFeed } from "@/lib/dev/deriveScenarioAttention";
import { groupIgnorableByCode } from "@/lib/dataQuality/bulkIgnoreGroups";

const ID_RE = /^[a-z0-9][a-z0-9-]{2,47}$/;
const CODE_RE = /^[A-Z][A-Z0-9_]*$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The reserved tag key materialize writes into admin_alerts.context (§5.1b). */
export const DEV_SCENARIO_TAG_KEY = "__devScenario";

const HOLD_DOMAINS = new Set(["crew_email", "crew_identity"]);
const DISPOSITIONS = new Set(["email_change", "rename", "removal"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0;
}

function parsesAsDate(v: unknown): boolean {
  return typeof v === "string" && v.length > 0 && Number.isFinite(new Date(v).getTime());
}

function validateDisposition(v: unknown, where: string, out: string[]): void {
  if (!isPlainObject(v) || typeof v.disposition !== "string" || !DISPOSITIONS.has(v.disposition)) {
    out.push(`${where}: proposed_value must be a Disposition variant`);
    return;
  }
  if (v.disposition === "removal") return;
  // email_change and rename both require a non-blank name and a string|null email.
  if (isBlank(v.name)) out.push(`${where}: ${v.disposition} requires a non-blank name`);
  if (!(typeof v.email === "string" || v.email === null)) {
    out.push(`${where}: ${v.disposition} requires email as string or null`);
  }
}

/**
 * Per-code context contracts from §3.1. A code listed here that ships with `{}`
 * renders its degenerate form while the spec promises the bound state, so the
 * catalog is rejected rather than quietly showing the wrong card.
 */
function validateCodeContext(row: ScenarioAlertRow, where: string, out: string[]): void {
  const ctx = row.context;
  switch (row.code) {
    case "TILE_PROJECTION_FETCH_FAILED": {
      const keys = ctx.failedKeys;
      if (!Array.isArray(keys) || keys.length === 0 || !keys.every((k) => typeof k === "string")) {
        out.push(`${where}: TILE_PROJECTION_FETCH_FAILED requires context.failedKeys as string[]`);
      }
      return;
    }
    case "SHOW_FIRST_PUBLISHED": {
      const gaps = ctx.data_gaps;
      if (
        !isPlainObject(gaps) ||
        typeof gaps.total !== "number" ||
        gaps.total <= 0 ||
        !isPlainObject(gaps.classes)
      ) {
        out.push(
          `${where}: SHOW_FIRST_PUBLISHED requires context.data_gaps with total greater than 0`,
        );
      }
      return;
    }
    case "PARSE_ERROR_LAST_GOOD": {
      const code = ctx.error_code;
      if (typeof code !== "string" || !PARSE_FAILURE_ALLOWLIST.has(code)) {
        out.push(`${where}: PARSE_ERROR_LAST_GOOD requires an allowlisted context.error_code`);
      }
      return;
    }
    case "ROLE_FLAGS_NOTICE": {
      // crewNameFor reads the PROJECTED context, which derives both fields from
      // ctx.changes[].crew_name (lib/adminAlerts/projectIdentityContext.ts:88-97).
      const changes = ctx.changes;
      const named =
        Array.isArray(changes) &&
        changes.filter((c) => isPlainObject(c) && !isBlank(c.crew_name)).length;
      if (!Array.isArray(changes) || changes.length !== 1 || named !== 1) {
        out.push(`${where}: ROLE_FLAGS_NOTICE requires exactly one named context.changes entry`);
      }
      return;
    }
    case "AMBIGUOUS_EMAIL_BINDING":
    case "OAUTH_IDENTITY_CLAIMED": {
      if (typeof ctx.crew_member_id !== "string" || !UUID_RE.test(ctx.crew_member_id)) {
        out.push(`${where}: ${row.code} requires a UUID context.crew_member_id`);
      }
      const identity = row.galleryIdentity;
      const crewSegs =
        identity && Array.isArray(identity.segments)
          ? identity.segments.filter((s) => s.label === "Crew")
          : [];
      if (crewSegs.length !== 1) {
        out.push(`${where}: ${row.code} requires a galleryIdentity with exactly one Crew segment`);
      }
      return;
    }
    default:
      return;
  }
}

function validateAlert(row: ScenarioAlertRow, i: number, out: string[]): void {
  const where = `alerts[${i}]`;
  if (isBlank(row.code) || !CODE_RE.test(row.code)) out.push(`${where}: malformed code`);
  if (!isPlainObject(row.context)) {
    out.push(`${where}: context must be a plain object, never null or an array`);
  } else if (DEV_SCENARIO_TAG_KEY in row.context) {
    out.push(`${where}: context must not carry the reserved ${DEV_SCENARIO_TAG_KEY} key`);
  }
  if (!parsesAsDate(row.raised_at)) out.push(`${where}: raised_at must parse as a date`);
  if (!Number.isInteger(row.occurrence_count) || row.occurrence_count < 1) {
    out.push(`${where}: occurrence_count must be an integer of at least 1`);
  }
  if (row.galleryIdentity !== undefined && row.galleryIdentity !== null) {
    if (!isPlainObject(row.galleryIdentity) || !Array.isArray(row.galleryIdentity.segments)) {
      out.push(`${where}: galleryIdentity must be null, absent, or carry a segments array`);
    }
  }
  if (isPlainObject(row.context)) validateCodeContext(row, where, out);
}

function validateHold(row: ScenarioHoldRow, i: number, out: string[]): void {
  const where = `holds[${i}]`;
  if (!HOLD_DOMAINS.has(row.domain)) out.push(`${where}: domain outside the CHECK set`);
  if (row.kind !== "mi11_pending") out.push(`${where}: kind must be mi11_pending`);
  if (isBlank(row.entity_key)) out.push(`${where}: entity_key must be non-blank`);
  if (isBlank(row.drive_file_id)) out.push(`${where}: drive_file_id must be non-blank`);
  if (!isPlainObject(row.held_value)) out.push(`${where}: held_value must be a plain object`);
  if (!parsesAsDate(row.base_modified_time)) {
    out.push(`${where}: base_modified_time must parse as a date`);
  }
  validateDisposition(row.proposed_value, where, out);
  if (row.reservation_collisions !== undefined) {
    if (
      !Array.isArray(row.reservation_collisions) ||
      !row.reservation_collisions.every(
        (c) =>
          isPlainObject(c) &&
          typeof c.name === "string" &&
          (typeof c.email === "string" || c.email === null),
      )
    ) {
      out.push(`${where}: reservation_collisions entries must be { name, email|null }`);
    }
  }
}

/** Returns one message per violation; an empty array means the scenario is valid. */
export function validateScenario(s: AttentionScenario): string[] {
  const out: string[] = [];

  if (typeof s.id !== "string" || !ID_RE.test(s.id))
    out.push("id: must match ^[a-z0-9][a-z0-9-]{2,47}$");
  if (isBlank(s.label)) out.push("label: must be non-blank");
  if (s.tier !== 1 && s.tier !== 2 && s.tier !== 3) out.push("tier: must be 1, 2, or 3");

  // bucket and degraded are tier-2 only: predicates are functions and degraded is
  // a loader fault, so neither can be reproduced from stored rows (§5.0).
  if (s.bucket !== undefined) {
    if (s.tier !== 2) out.push("bucket: tier 2 only");
    else if (!isPlainObject(s.bucket)) out.push("bucket: must be an object of predicates");
  }
  if (s.degraded !== undefined) {
    if (s.tier !== 2) out.push("degraded: tier 2 only");
    else if (typeof s.degraded !== "boolean") out.push("degraded: must be a boolean");
  }
  if (s.feedTruncated !== undefined) {
    if (s.tier !== 2) out.push("feedTruncated: tier 2 only");
    else if (typeof s.feedTruncated !== "boolean") out.push("feedTruncated: must be boolean");
  }

  if (!Array.isArray(s.alerts)) out.push("alerts: must be an array");
  else {
    s.alerts.forEach((row, i) => validateAlert(row, i, out));
    const codes = s.alerts.map((r) => r.code);
    if (new Set(codes).size !== codes.length) {
      // admin_alerts carries a partial unique index on (show_id, code) where
      // resolved_at is null, so a duplicate would fail the insert at runtime.
      out.push("alerts: duplicate code within one scenario");
    }
  }

  if (!Array.isArray(s.holds)) out.push("holds: must be an array");
  else {
    s.holds.forEach((row, i) => validateHold(row, i, out));
    const keys = s.holds.map((h) => `${h.domain}:${h.entity_key}`);
    if (new Set(keys).size !== keys.length) {
      // sync_holds carries unique (show_id, domain, entity_key).
      out.push("holds: duplicate (domain, entity_key) within one scenario");
    }
  }

  if (s.warnings !== undefined) {
    if (!Array.isArray(s.warnings)) out.push("warnings: must be an array when present");
    else {
      s.warnings.forEach((w, i) => {
        const where = `warnings[${i}]`;
        if (isBlank(w.code)) out.push(`${where}: code must be non-blank`);
        if (w.severity !== "warn") out.push(`${where}: severity must be warn`);
        if (isBlank(w.message)) out.push(`${where}: message must be non-blank`);
        // Warnings materialize VERBATIM, so a code embedded in the message
        // reaches the real modal and escapes the §1.1 exception scope.
        if (!isBlank(w.code) && !isBlank(w.message) && w.message.includes(w.code)) {
          out.push(`${where}: message must not contain its own code`);
        }
      });
    }
  }

  validateModalStateFields(s, out);

  return out;
}

// ── Modal-state-coverage fields (spec 2026-07-22 §3.0/§4) ────────────────────

const CHANGE_LOG_STATUSES = new Set(["applied", "pending", "rejected", "undone", "superseded"]);
const CHANGE_LOG_SOURCES = new Set(["auto_apply", "mi11_approve", "mi11_reject", "undo"]);
/** The production reader's page limit (readShowChangeFeed DEFAULT_LIMIT). */
const CHANGE_LOG_MAX_ROWS = 50;
const EMPTY_KEYS = new Set([
  "crew",
  "venue",
  "rooms",
  "hotels",
  "transport",
  "contacts",
  "billing",
  "agenda",
]);
/** app/admin/_showReviewModal.tsx roster cap (CREW_ROSTER_READ_CAP). */
const SHARE_EMAILS_MAX = 500;

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v > 0;
}

function validateChangeLogRow(row: unknown, i: number, out: string[]): void {
  const where = `changeLog[${i}]`;
  if (!isPlainObject(row)) {
    out.push(`${where}: must be a plain object`);
    return;
  }
  if (!parsesAsDate(row.occurred_at)) out.push(`${where}: occurred_at must parse as a date`);
  if (typeof row.status !== "string" || !CHANGE_LOG_STATUSES.has(row.status)) {
    out.push(`${where}: status outside the catalog set`);
  }
  if (isBlank(row.summary)) out.push(`${where}: summary must be non-blank`);
  if (!(typeof row.entity_ref === "string" || row.entity_ref === null)) {
    out.push(`${where}: entity_ref must be string or null`);
  }
  // Open-ended by design: no CHECK on change_kind and production also writes
  // e.g. "use_raw_stale" — only blankness is rejected.
  if (isBlank(row.change_kind)) out.push(`${where}: change_kind must be non-blank`);
  if (typeof row.individually_undoable !== "boolean") {
    out.push(`${where}: individually_undoable must be boolean`);
  }
  if (typeof row.source !== "string" || !CHANGE_LOG_SOURCES.has(row.source)) {
    out.push(`${where}: source outside the catalog set`);
  }
  if (row.acknowledged_at !== null && !parsesAsDate(row.acknowledged_at)) {
    out.push(`${where}: acknowledged_at must be null or parse as a date`);
  }
}

function validateFixtureLifecycle(fx: Record<string, unknown>, out: string[]): void {
  for (const key of [
    "archived",
    "published",
    "finalizeOwned",
    "isLive",
    "neverSynced",
    "checkedAbsent",
    "titleAbsent",
    "datesAbsent",
    "clientAbsent",
    "alertFlash",
  ]) {
    if (fx[key] !== undefined && typeof fx[key] !== "boolean") {
      out.push(`fixture.${key}: must be boolean`);
    }
  }
  if (
    fx.lastSyncStatus !== undefined &&
    fx.lastSyncStatus !== null &&
    typeof fx.lastSyncStatus !== "string"
  ) {
    out.push("fixture.lastSyncStatus: must be string or null");
  }
  // No-op knobs: base-default explicit values are rejected so "fixture present"
  // is always semantically effective (the isModalVisible carrier arm relies on it).
  const defaults: Record<string, unknown> = {
    archived: false,
    published: true,
    finalizeOwned: false,
    isLive: false,
    neverSynced: false,
    checkedAbsent: false,
    titleAbsent: false,
    datesAbsent: false,
    clientAbsent: false,
    alertFlash: false,
    lastSyncStatus: "ok",
  };
  for (const [key, def] of Object.entries(defaults)) {
    if (fx[key] !== undefined && fx[key] === def) {
      out.push(`fixture.${key}: explicit base-default value is a no-op`);
    }
  }
  // Lifecycle contradictions (production derivations, spec §4).
  if (fx.archived === true && fx.published === true) {
    out.push("fixture: archived is atomically unpublished — published: true contradicts it");
  }
  if (fx.archived === true && fx.published === undefined) {
    out.push("fixture: archived: true requires explicit published: false");
  }
  if (fx.archived === true && fx.finalizeOwned === true) {
    out.push("fixture: archived forces finalizeOwned false");
  }
  if (fx.isLive === true && (fx.published === false || fx.archived === true)) {
    out.push("fixture: isLive requires published and not archived");
  }
  if (fx.isLive === true && fx.datesAbsent === true) {
    out.push("fixture: isLive requires dates (absent dates cannot be live)");
  }
  // Sync shadow guards: a null lastSyncedAt suppresses the sync element before
  // status or check stamp is read; lastCheckedAt is consulted only on "ok".
  if (fx.neverSynced === true && fx.lastSyncStatus !== undefined) {
    out.push("fixture: neverSynced shadows lastSyncStatus (element suppressed)");
  }
  if (fx.neverSynced === true && fx.checkedAbsent === true) {
    out.push("fixture: neverSynced shadows checkedAbsent");
  }
  if (fx.checkedAbsent === true && fx.lastSyncStatus !== undefined && fx.lastSyncStatus !== "ok") {
    out.push("fixture: checkedAbsent is consulted only on the ok bucket");
  }
}

function validateFixtureVolumes(fx: Record<string, unknown>, out: string[]): void {
  const volumes = fx.volumes;
  if (volumes === undefined) return;
  if (!isPlainObject(volumes)) {
    out.push("fixture.volumes: must be an object");
    return;
  }
  if (Object.keys(volumes).length === 0) out.push("fixture.volumes: empty object is a no-op");
  // Unknown volume keys are hard errors: a typoed key ({ crews: 9 }) would be a
  // silent no-op that still counts as "fixture present" for isModalVisible
  // (whole-diff review B P1).
  const VOLUME_KEYS = new Set([
    "crew",
    "rooms",
    "hotels",
    "schedule",
    "diagramImages",
    "packlist",
    "agenda",
    "agendaLinks",
    "hotelGuests",
  ]);
  for (const key of Object.keys(volumes)) {
    if (!VOLUME_KEYS.has(key)) out.push(`fixture.volumes: unknown key ${key}`);
  }
  for (const key of ["crew", "rooms", "hotels", "diagramImages", "agendaLinks", "hotelGuests"]) {
    if (volumes[key] !== undefined && !isPositiveInt(volumes[key])) {
      out.push(`fixture.volumes.${key}: must be a positive integer`);
    }
  }
  // Volumes equal to the base fixture counts are no-ops (GALLERY_BASE_COUNTS;
  // the fixture-knobs test pins the real fixture lengths against the constant).
  const baseCounts: Record<string, number> = { crew: 6, rooms: 3, hotels: 2 };
  for (const [key, base] of Object.entries(baseCounts)) {
    if (volumes[key] === base) out.push(`fixture.volumes.${key}: equals the base count (no-op)`);
  }
  if (volumes.schedule !== undefined && volumes.schedule !== "overflow") {
    out.push('fixture.volumes.schedule: must be "overflow"');
  }
  if (volumes.agenda !== undefined && volumes.agenda !== "overflow") {
    out.push('fixture.volumes.agenda: must be "overflow"');
  }
  if (volumes.packlist !== undefined) {
    const p = volumes.packlist;
    if (!isPlainObject(p) || !isPositiveInt(p.cases) || !isPositiveInt(p.itemsPerCase)) {
      out.push("fixture.volumes.packlist: must carry positive integer cases and itemsPerCase");
    }
  }
  if (volumes.agenda !== undefined && volumes.agendaLinks !== undefined) {
    out.push("fixture.volumes: agenda and agendaLinks reshape the same array (contradictory)");
  }
}

function validateModalStateFields(s: AttentionScenario, out: string[]): void {
  const tier2Only = (present: boolean, name: string): boolean => {
    if (!present) return false;
    if (s.tier !== 2) {
      out.push(`${name}: tier 2 only`);
      return false;
    }
    return true;
  };

  if (tier2Only(s.changeLog !== undefined, "changeLog")) {
    if (!Array.isArray(s.changeLog)) out.push("changeLog: must be an array");
    else {
      s.changeLog.forEach((row, i) => validateChangeLogRow(row, i, out));
      if (s.changeLog.length > CHANGE_LOG_MAX_ROWS) {
        out.push(`changeLog: longer than the production page limit (${CHANGE_LOG_MAX_ROWS})`);
      }
    }
  }

  if (tier2Only(s.feedNull !== undefined, "feedNull")) {
    if (typeof s.feedNull !== "boolean") out.push("feedNull: must be boolean");
    else if (s.feedNull) {
      // Emptiness equals absence: only actual ENTRIES (or the truncation flag)
      // contradict a null feed.
      if (Array.isArray(s.holds) && s.holds.length > 0) {
        out.push("feedNull: holds would desync the changes-rail badge from a null feed");
      }
      if (Array.isArray(s.changeLog) && s.changeLog.length > 0) {
        out.push("feedNull: changeLog entries cannot render in a null feed");
      }
      if (s.feedTruncated === true) out.push("feedNull: feedTruncated contradicts a null feed");
    }
  }

  if (tier2Only(s.ignoreWarningIndexes !== undefined, "ignoreWarningIndexes")) {
    validateIgnoreIndexes(s, out);
  }

  if (tier2Only(s.landing !== undefined, "landing")) {
    if (typeof s.landing !== "string" || !GROUP_ORDER.includes(s.landing)) {
      out.push("landing: must be a GROUP_ORDER member");
    }
  }

  if (tier2Only(s.actionOutcomes !== undefined, "actionOutcomes")) {
    validateActionOutcomes(s, out);
  }

  if (tier2Only(s.fixture !== undefined, "fixture")) {
    const fx = s.fixture;
    if (!isPlainObject(fx)) {
      out.push("fixture: must be a plain object");
      return;
    }
    if (Object.keys(fx).length === 0) out.push("fixture: empty object is a no-op");
    // Unknown fixture keys are hard errors: { typo: true } is non-empty yet
    // changes nothing, breaking the "fixture present implies effective"
    // contract isModalVisible relies on (whole-diff review B P1).
    const FIXTURE_KEYS = new Set([
      "archived",
      "published",
      "finalizeOwned",
      "isLive",
      "lastSyncStatus",
      "neverSynced",
      "checkedAbsent",
      "titleAbsent",
      "datesAbsent",
      "clientAbsent",
      "alertFlash",
      "empty",
      "volumes",
      "share",
    ]);
    for (const key of Object.keys(fx as Record<string, unknown>)) {
      if (!FIXTURE_KEYS.has(key)) out.push(`fixture: unknown key ${key}`);
    }
    validateFixtureLifecycle(fx as Record<string, unknown>, out);

    const empty = (fx as Record<string, unknown>).empty;
    if (empty !== undefined) {
      if (!Array.isArray(empty)) out.push("fixture.empty: must be an array");
      else {
        if (empty.length === 0) out.push("fixture.empty: empty array is a no-op");
        for (const key of empty) {
          if (typeof key !== "string" || !EMPTY_KEYS.has(key)) {
            out.push(`fixture.empty: unknown key ${String(key)}`);
          }
        }
        if (new Set(empty).size !== empty.length) out.push("fixture.empty: duplicate keys");
      }
    }

    validateFixtureVolumes(fx as Record<string, unknown>, out);

    const volumes = isPlainObject((fx as Record<string, unknown>).volumes)
      ? ((fx as Record<string, unknown>).volumes as Record<string, unknown>)
      : {};
    if (Array.isArray(empty)) {
      const volumeKeyBySection: Record<string, string> = {
        crew: "crew",
        rooms: "rooms",
        hotels: "hotels",
        agenda: "agenda",
      };
      for (const [section, volKey] of Object.entries(volumeKeyBySection)) {
        if (empty.includes(section) && volumes[volKey] !== undefined) {
          out.push(`fixture: empty ${section} contradicts volumes.${volKey}`);
        }
      }
      if (empty.includes("agenda") && volumes.agendaLinks !== undefined) {
        out.push("fixture: empty agenda contradicts volumes.agendaLinks");
      }
      // hotelGuests reshapes hotel 1's guest list, which cannot exist once the
      // hotels collection is emptied (whole-diff review B P1).
      if (empty.includes("hotels") && volumes.hotelGuests !== undefined) {
        out.push("fixture: empty hotels contradicts volumes.hotelGuests");
      }
    }

    if (volumes.diagramImages !== undefined) {
      const hasDiagramsAnchor =
        Array.isArray(s.alerts) &&
        s.alerts.some((a) => ATTENTION_ROUTES[a.code]?.anchor === "diagrams");
      if (!hasDiagramsAnchor) {
        out.push("fixture.volumes.diagramImages: requires a diagrams-anchored alert");
      }
    }

    const share = (fx as Record<string, unknown>).share;
    if (share !== undefined) {
      if (!isPlainObject(share) || share.linkActive !== true) {
        out.push("fixture.share: must be an object with linkActive: true");
      } else {
        const n = share.crewEmails;
        if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > SHARE_EMAILS_MAX) {
          out.push(`fixture.share.crewEmails: must be an integer in [0, ${SHARE_EMAILS_MAX}]`);
        } else {
          if (n >= 1 && Array.isArray(empty) && empty.includes("crew")) {
            out.push("fixture.share: emails cannot come from an empty roster");
          }
          const crewVol = volumes.crew;
          if (typeof crewVol === "number") {
            if (n > crewVol) {
              out.push("fixture.share.crewEmails: exceeds the declared crew volume");
            }
            if (n >= 1 && crewVol > SHARE_EMAILS_MAX) {
              out.push(
                "fixture.share: production blanks all crew emails past the 500-row roster cap",
              );
            }
          }
        }
        if ((fx as Record<string, unknown>).published === false) {
          out.push("fixture.share: linkActive requires published");
        }
        if ((fx as Record<string, unknown>).archived === true) {
          out.push("fixture.share: linkActive requires a non-archived show");
        }
      }
    }

    if ((fx as Record<string, unknown>).datesAbsent === true && volumes.schedule !== undefined) {
      out.push("fixture: datesAbsent contradicts volumes.schedule (ros days render regardless)");
    }

    if ((fx as Record<string, unknown>).alertFlash === true) {
      // The flash must target a rendered banner: probe the REAL derivation.
      const items = deriveScenarioAttention(s);
      if (!items.some((i) => i.kind === "alert")) {
        out.push("fixture.alertFlash: no derived alert item survives the modal cut");
      }
    }
  }
}

function validateIgnoreIndexes(s: AttentionScenario, out: string[]): void {
  const idx = s.ignoreWarningIndexes;
  if (!Array.isArray(idx)) {
    out.push("ignoreWarningIndexes: must be an array");
    return;
  }
  const warnings = Array.isArray(s.warnings) ? s.warnings : [];
  if (new Set(idx).size !== idx.length) out.push("ignoreWarningIndexes: duplicate indexes");
  const ignored = new Set<number>();
  for (const i of idx) {
    if (!Number.isInteger(i) || i < 0 || i >= warnings.length) {
      out.push(`ignoreWarningIndexes: index ${String(i)} out of range`);
      continue;
    }
    ignored.add(i);
    const w = warnings[i];
    if (w === undefined || warningFingerprint(w) === null) {
      out.push(
        `ignoreWarningIndexes: warnings[${i}] needs a non-blank rawSnippet for a fingerprint`,
      );
    }
  }
  // An ignored fingerprint colliding with an ACTIVE warning's fingerprint would
  // make partitionByIgnored ignore both.
  const ignoredPrints = new Set(
    [...ignored]
      .map((i) => (warnings[i] !== undefined ? warningFingerprint(warnings[i]!) : null))
      .filter((f): f is string => f !== null),
  );
  warnings.forEach((w, i) => {
    if (ignored.has(i)) return;
    const f = warningFingerprint(w);
    if (f !== null && ignoredPrints.has(f)) {
      out.push(`ignoreWarningIndexes: active warnings[${i}] shares an ignored fingerprint`);
    }
  });
}

const ACTION_OUTCOME_KINDS: Record<string, ReadonlySet<string>> = {
  setPublished: new Set(["success", "error", "pending"]),
  archive: new Set(["success", "error", "pending", "not_found"]),
  undo: new Set(["success", "error", "pending"]),
  accept: new Set(["success", "error", "pending"]),
  acceptAll: new Set(["success", "error", "pending"]),
  approve: new Set(["success", "error", "pending"]),
  reject: new Set(["success", "error", "pending"]),
  resync: new Set(["success", "shrink_held", "error", "pending"]),
  resolve: new Set(["success", "error", "pending"]),
  bulkIgnore: new Set(["partial", "fail", "pending"]),
  crewReset: new Set(["success", "not_found", "error", "pending"]),
  rotate: new Set(["success", "error", "pending"]),
  everyoneReset: new Set(["success", "error", "pending"]),
};

/** Controls whose error arm carries a fixed internal code, not a scripted one. */
const CODELESS_ERROR_KEYS = new Set(["crewReset", "rotate", "everyoneReset"]);

function validateActionOutcomes(s: AttentionScenario, out: string[]): void {
  const ao = s.actionOutcomes;
  if (!isPlainObject(ao)) {
    out.push("actionOutcomes: must be a plain object");
    return;
  }
  const keys = Object.keys(ao);
  if (keys.length === 0) {
    out.push("actionOutcomes: empty object is a no-op");
    return;
  }
  let malformed = false;
  for (const key of keys) {
    const allowed = ACTION_OUTCOME_KINDS[key];
    if (allowed === undefined) {
      out.push(`actionOutcomes: unknown key ${key}`);
      continue;
    }
    const v = (ao as Record<string, unknown>)[key];
    if (!isPlainObject(v) || typeof v.kind !== "string" || !allowed.has(v.kind)) {
      out.push(`actionOutcomes.${key}: kind must be one of ${[...allowed].join("/")}`);
      malformed = true;
      continue;
    }
    if (v.kind === "error" && !CODELESS_ERROR_KEYS.has(key)) {
      if (typeof v.code !== "string" || v.code.trim() === "") {
        out.push(`actionOutcomes.${key}: error code must be non-blank`);
      } else if (key === "resync" && !(RESYNC_ERROR_CODES as readonly string[]).includes(v.code)) {
        out.push(`actionOutcomes.resync: code must be one of ${RESYNC_ERROR_CODES.join("/")}`);
      }
    }
    if (key === "resync" && v.kind === "shrink_held") {
      if (typeof v.detail !== "string" || v.detail.trim() === "") {
        out.push("actionOutcomes.resync: shrink_held detail must be non-blank");
      }
    }
    if (key === "resync" && v.kind === "success" && v.outcome !== undefined) {
      const OUTCOMES = ["applied", "stage", "skipped", "asset_recovery"];
      if (typeof v.outcome !== "string" || !OUTCOMES.includes(v.outcome)) {
        out.push(`actionOutcomes.resync: success outcome must be one of ${OUTCOMES.join("/")}`);
      }
    }
  }
  // A malformed payload already failed the walk; reachability reads payload
  // fields and must not dereference garbage (whole-diff R1 F3b).
  if (!malformed) validateActionOutcomeReachability(s, ao as ScenarioActionOutcomes, out);
}

function validateActionOutcomeReachability(
  s: AttentionScenario,
  ao: ScenarioActionOutcomes,
  out: string[],
): void {
  const fx = s.fixture;
  const archived = fx?.archived === true;
  // Feed arms from the REAL shaper via buildScenarioFeed - zero predicate drift.
  const feed = buildScenarioFeed(s);
  const entries = feed?.entries ?? [];
  const acceptableCount = entries.filter((e) => e.acceptable).length;
  const hasUndo = entries.some((e) => e.action === "undo");
  const holds = Array.isArray(s.holds) ? s.holds.length : 0;
  // ALERT items only: holds are actionable but never mount the resolve button
  // (lib/admin/sectionAttention.ts hold exclusion; AttentionBanner alert cards).
  const actionable = deriveScenarioAttention(s).some((it) => it.kind === "alert" && it.actionable);
  const ignored = new Set(s.ignoreWarningIndexes ?? []);
  const activeWarnings = (s.warnings ?? []).filter((_, i) => !ignored.has(i));
  const groups = groupIgnorableByCode(activeWarnings);
  const maxGroup = groups.reduce((m, g) => Math.max(m, g.items.length), 0);
  const crewReachable =
    !archived &&
    fx?.published !== false &&
    !(fx?.empty ?? []).includes("crew") &&
    fx?.volumes?.crew === undefined;
  const req = (cond: boolean, key: keyof ScenarioActionOutcomes, why: string): void => {
    if (ao[key] !== undefined && !cond) {
      out.push(`actionOutcomes.${String(key)}: unreachable - ${why}`);
    }
  };
  req(holds > 0, "approve", "needs a pending mi11 hold");
  req(holds > 0, "reject", "needs a pending mi11 hold");
  req(
    acceptableCount > 0,
    "accept",
    "needs an acceptable feed entry (auto_apply/applied/unacknowledged)",
  );
  req(acceptableCount > 0, "acceptAll", "needs an acceptable feed entry");
  req(
    hasUndo,
    "undo",
    "needs an undo-armed feed entry (applied crew-domain individually_undoable)",
  );
  req(actionable, "resolve", "needs an ACTIONABLE derived attention item");
  req(
    maxGroup >= 2,
    "bulkIgnore",
    "needs a bulk-ignorable group (>=2 distinct-content same-code active warnings)",
  );
  req(crewReachable, "crewReset", "needs published, non-archived, non-empty, non-overcap crew");
  req(fx?.share?.linkActive === true, "rotate", "needs fixture.share.linkActive");
  req(fx?.share?.linkActive === true, "everyoneReset", "needs fixture.share.linkActive");
  req(!archived, "resync", "archived shows have no re-sync control");
  req(!archived && fx?.finalizeOwned !== true, "setPublished", "toggle absent/disabled");
  req(
    !archived && fx?.finalizeOwned !== true,
    "archive",
    "archive control absent (archived, or lifecycle section omitted while finalize-owned - ShareHub.tsx:573)",
  );
  const bi = ao.bulkIgnore;
  if (
    bi !== undefined &&
    bi.kind === "partial" &&
    (!Number.isInteger(bi.okCount) || bi.okCount < 1 || bi.okCount >= maxGroup)
  ) {
    out.push(
      `actionOutcomes.bulkIgnore: okCount must be an integer in [1, ${Math.max(maxGroup - 1, 1)}]`,
    );
  }
}
