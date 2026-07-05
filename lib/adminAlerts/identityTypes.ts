// Shared types for the "at-a-glance identity" feature (spec §3.1).
//
// IdentityContext is the internal projection output of `projectIdentityContext`
// (Task 2): a curated, scalar-only shape carved out of an alert's raw
// producer `context` jsonb. It has three groups:
//   (A) resolution  — shape-validated lookup IDs, NEVER sanitized, NEVER
//                      rendered or serialized (server-side only).
//   (B) display     — strings that pass through `sanitizeIdentityString`
//                      before they can render or serialize.
//   (C) counts      — plain numbers, no sanitization needed.
//
// IdentityContext itself never leaves the server (resolves Codex F24) — the
// read-core/CLI serialize the distinct `SerializedAlertIdentity` shape below,
// which structurally excludes `resolution` and any id-shaped key.
export interface IdentityContext {
  resolution: {
    crew_member_id?: string;
    stale_crew_member_id?: string;
    show_id?: string;
    drive_file_id?: string;
  };
  display: {
    file_name?: string;
    sheet_name?: string;
    repo?: string;
    attempted_action?: string;
    /** Derived from `changes[].crew_name` (cap 3) — never the raw `changes` array. */
    role_change_crew_names?: string[];
    /** PII — present ONLY when `includePii` is true. */
    email?: string;
    /** PII — present ONLY when `includePii` is true. */
    user_email?: string;
  };
  counts: {
    role_change_count?: number;
    crew_member_count?: number;
  };
}

/**
 * One rendered piece of an alert's identity line — e.g. `{ label: "Show",
 * value: "East Coast" }` or a disclosure segment `{ label: null, value:
 * "(most recent of 3)" }`. `pii` marks segments whose value is withheld
 * unless the caller's `includePii` policy is true.
 */
export interface AlertIdentitySegment {
  label: string | null;
  value: string;
  pii?: boolean;
}

/**
 * The resolved, render-ready identity for one alert row. `global: true`
 * means the code has an explicit "no per-entity identity" declaration
 * (§3.1) — a first-class value, not an omission.
 */
export interface AlertIdentity {
  segments: AlertIdentitySegment[];
  global: boolean;
}

/**
 * Display-only wire shape serialized to the web UI and the CLI's `--json`
 * output. Structurally identical to `AlertIdentity` but declared as a
 * separate type (resolves Codex F24): it has NO `resolution` field and NO
 * id-shaped keys, so an implementation cannot satisfy the §8.3 meta-test
 * guard while accidentally leaking `identityContext.resolution.*`.
 */
export interface SerializedAlertIdentity {
  segments: AlertIdentitySegment[];
  global: boolean;
}
