// Sanitized identity projection (spec §3.1). Pure function that turns a raw
// `admin_alerts.context` jsonb into the curated, scalar-only `IdentityContext`
// shape. This is the identity map's ONLY input contract: no raw/composite
// field from `context` ever reaches a renderer or the CLI directly.
//
// Three groups, three different treatments:
//   (A) resolution — shape-VALIDATED, NEVER sanitized (Codex F23): the token
//       redactor inside `sanitizeIdentityString` would corrupt a real
//       base64-like `drive_file_id` or a hex-run inside a UUID.
//   (B) display    — every string (and every `role_change_crew_names`
//       element) passes through `sanitizeIdentityString`.
//   (C) counts     — plain numbers, no sanitization needed.
import { sanitizeIdentityString } from "./sanitizeIdentityString";
import type { IdentityContext } from "./identityTypes";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;

// The `WizardSessionSupersededRollbackError.attemptedAction` value set
// (`lib/sync/wizardSessionRollback.ts:2`). `attempted_action` is dropped if
// it is not one of these — this field can never carry free-form text.
const WIZARD_ACTION_ENUM = new Set([
  "defer_until_modified",
  "permanent_ignore",
  "discard",
  "retry",
  "apply",
]);

const ROLE_CHANGE_NAMES_CAP = 3;
const FAILED_SHEET_NAMES_CAP = 3;

function isPlainString(v: unknown): v is string {
  return typeof v === "string";
}

function validateShape(v: unknown, re: RegExp): string | undefined {
  return isPlainString(v) && re.test(v) ? v : undefined;
}

export function projectIdentityContext(
  rawContext: Record<string, unknown> | null,
  opts: { includePii: boolean },
): IdentityContext {
  const ctx = rawContext ?? {};
  const out: IdentityContext = { resolution: {}, display: {}, counts: {} };

  // (A) resolution IDs — shape-validated, never sanitized.
  const crewMemberId = validateShape(ctx.crew_member_id, UUID_RE);
  if (crewMemberId) out.resolution.crew_member_id = crewMemberId;

  const staleCrewMemberId = validateShape(ctx.stale_crew_member_id, UUID_RE);
  if (staleCrewMemberId) out.resolution.stale_crew_member_id = staleCrewMemberId;

  const showId = validateShape(ctx.show_id, UUID_RE);
  if (showId) out.resolution.show_id = showId;

  const driveFileId = validateShape(ctx.drive_file_id, DRIVE_ID_RE);
  if (driveFileId) out.resolution.drive_file_id = driveFileId;

  // (B) display strings — sanitized.
  if (isPlainString(ctx.file_name)) {
    out.display.file_name = sanitizeIdentityString(ctx.file_name, opts);
  }
  if (isPlainString(ctx.sheet_name)) {
    out.display.sheet_name = sanitizeIdentityString(ctx.sheet_name, opts);
  }
  if (isPlainString(ctx.repo)) {
    out.display.repo = sanitizeIdentityString(ctx.repo, opts);
  }
  if (isPlainString(ctx.attempted_action) && WIZARD_ACTION_ENUM.has(ctx.attempted_action)) {
    // Enum-gated, but still route through the sanitizer so EVERY group-(B)
    // display string goes through the single chokepoint (spec §3.1) — a no-op
    // on the clean fixed enum values, but keeps the §8.3 meta-test invariant
    // that no display field bypasses sanitizeIdentityString.
    out.display.attempted_action = sanitizeIdentityString(ctx.attempted_action, opts);
  }
  if (opts.includePii) {
    if (isPlainString(ctx.email)) out.display.email = sanitizeIdentityString(ctx.email, opts);
    if (isPlainString(ctx.user_email)) {
      out.display.user_email = sanitizeIdentityString(ctx.user_email, opts);
    }
  }

  // Composite -> sanitized scalars. `changes` never leaves this function as
  // an array of objects; only sanitized crew_name strings (capped at 3) plus
  // a total count. `prior_flags`/`new_flags` are NEVER emitted.
  if (Array.isArray(ctx.changes)) {
    const names = ctx.changes
      .map((c) =>
        c && typeof c === "object" ? (c as Record<string, unknown>).crew_name : undefined,
      )
      .filter(isPlainString)
      .slice(0, ROLE_CHANGE_NAMES_CAP)
      .map((n) => sanitizeIdentityString(n, opts));
    if (names.length > 0) out.display.role_change_crew_names = names;
    out.counts.role_change_count = ctx.changes.length;
  }

  if (Array.isArray(ctx.crew_member_ids)) {
    out.counts.crew_member_count = ctx.crew_member_ids.length;
  }

  // ONBOARDING_SHEET_UNREADABLE — the failed onboarding sheet titles. Cap the
  // displayed names at 3 (sanitized); the count is the full (filtered) length
  // so the resolver can append a "+N more" disclosure.
  if (Array.isArray(ctx.failed_sheet_names)) {
    const names = ctx.failed_sheet_names.filter(isPlainString);
    const capped = names
      .slice(0, FAILED_SHEET_NAMES_CAP)
      .map((n) => sanitizeIdentityString(n, opts));
    if (capped.length > 0) out.display.failed_sheet_names = capped;
    out.counts.failed_sheet_names_count = names.length;
  }

  return out;
}
