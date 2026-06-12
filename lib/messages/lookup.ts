import {
  MESSAGE_CATALOG,
  type MessageCode,
  type MessageCatalogEntry,
} from "@/lib/messages/catalog";

export { MESSAGE_CATALOG, type MessageCode, type MessageCatalogEntry };

export type MessageParams = Record<string, string | number | boolean | null | undefined>;

const PLACEHOLDER_RE = /<([a-zA-Z_][a-zA-Z0-9_-]*)>/g;

function interpolate(template: string | null, params: MessageParams | undefined): string | null {
  if (template === null) return null;
  if (!params) return template;
  return template.replace(PLACEHOLDER_RE, (match, key) => {
    // Normalize hyphen ↔ underscore so admin_alerts.context written by
    // producers with snake_case keys (sheet_name, crew_count) can satisfy
    // catalog placeholders written with hyphenated keys (<sheet-name>,
    // <crew-count>). Producers don't have to know which form the spec
    // chose; the renderer accepts either.
    const value =
      params[key] ??
      params[key.replace(/-/g, "_")] ??
      params[key.replace(/_/g, "-")];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Unknown-code guard: `MessageCode` protects compile-time call sites, but
 * codes read back from the DB (pending_ingestions.last_error_code,
 * admin_alerts.code, sync_log) are unconstrained runtime strings — a
 * retired/typo'd code makes `MESSAGE_CATALOG[code]` undefined and the
 * `{ ...entry }` spread would throw (the class AlertBanner.tsx's GUARD
 * comment works around at its call site). Contract: return a fallback entry
 * with ALL copy fields null — consumers already degrade on null (ErrorExplainer
 * renders nothing; resolveIngestionCopy falls back to generic copy) — and no
 * raw code in any user-visible copy field (invariant 5). `code` is carried
 * for identity/logging only. `getRequiredDougFacing` consequently still
 * throws on unknown codes (null dougFacing), which is the pinned behavior
 * for the explicit "required" variant.
 */
function fallbackEntryFor(code: string): MessageCatalogEntry {
  return {
    code,
    dougFacing: null,
    crewFacing: null,
    followUp: null,
    helpfulContext: null,
    title: null,
    longExplanation: null,
    helpHref: null,
  };
}

/**
 * Catalog-membership guard — the ONLY correct "is this a known code?"
 * predicate now that `messageFor()` always returns an entry (the all-null
 * fallback above makes its result truthy for ANY string, so result
 * truthiness can no longer distinguish cataloged from unknown codes).
 * `hasOwnProperty.call` (not `in`) so prototype-chain keys like
 * "toString" don't false-positive. User-defined type guard so callers
 * narrow `string` → `MessageCode` without a cast.
 */
export function isMessageCode(code: string): code is MessageCode {
  return Object.prototype.hasOwnProperty.call(MESSAGE_CATALOG, code);
}

export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry {
  const entry: MessageCatalogEntry | undefined = Object.prototype.hasOwnProperty.call(
    MESSAGE_CATALOG,
    code,
  )
    ? MESSAGE_CATALOG[code]
    : undefined;
  if (!entry) return fallbackEntryFor(code);
  if (!params) return entry;
  return {
    ...entry,
    dougFacing: interpolate(entry.dougFacing, params),
    crewFacing: interpolate(entry.crewFacing, params),
    helpfulContext: interpolate(entry.helpfulContext, params),
  };
}

export function getDougFacing(code: MessageCode, params?: MessageParams): string | null {
  return messageFor(code, params).dougFacing;
}

export function getCrewFacing(code: MessageCode, params?: MessageParams): string | null {
  return messageFor(code, params).crewFacing;
}

export function lookupHelpfulContext(code: MessageCode, params?: MessageParams): string | null {
  return messageFor(code, params).helpfulContext;
}

export function getRequiredDougFacing(code: MessageCode, params?: MessageParams): string {
  const value = getDougFacing(code, params);
  if (value === null) {
    throw new Error(`getRequiredDougFacing: code ${code} has no Doug-facing copy`);
  }
  return value;
}
