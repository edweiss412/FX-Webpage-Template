import {
  MESSAGE_CATALOG,
  type MessageCode,
  type MessageCatalogEntry,
} from "@/lib/messages/catalog";
import { stripEmphasis } from "@/lib/messages/collapsedSummary";

export { MESSAGE_CATALOG, type MessageCode, type MessageCatalogEntry };

export type MessageParams = Record<string, string | number | boolean | null | undefined>;

const PLACEHOLDER_RE = /<([a-zA-Z_][a-zA-Z0-9_-]*)>/g;

/**
 * Exported for components/messages/renderEmphasis.tsx, which must
 * interpolate per TEXT NODE after parsing emphasis on the raw template
 * (param values are opaque text, never markup — Codex R1). Same function
 * messageFor uses; the two cannot drift.
 */
export function interpolate(
  template: string | null,
  params: MessageParams | undefined,
): string | null {
  if (template === null) return null;
  if (!params) return template;
  return template.replace(PLACEHOLDER_RE, (match, key) => {
    // Normalize hyphen ↔ underscore so admin_alerts.context written by
    // producers with snake_case keys (sheet_name, crew_count) can satisfy
    // catalog placeholders written with hyphenated keys (<sheet-name>,
    // <crew-count>). Producers don't have to know which form the spec
    // chose; the renderer accepts either.
    const value = params[key] ?? params[key.replace(/-/g, "_")] ?? params[key.replace(/_/g, "-")];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Plaintext analog of `renderCatalogEmphasis` (components/messages/renderEmphasis):
 * strip the catalog's Markdown emphasis markers off the TEMPLATE, then
 * interpolate params into the marker-free template. Use for surfaces that have
 * no JSX to carry <em>/<strong> and no Markdown renderer — email bodies and the
 * needs-attention inbox copy string — so the markers are removed rather than
 * shown literally (crew/Doug would otherwise see "_Sheet_" or "*Sheet*").
 *
 * Param-safe (Codex R1): markers are stripped BEFORE interpolation, and the
 * catalog placeholders (`<sheet-name>`) contain no marker characters, so a
 * param value that itself contains `*` or `_` (a sheet literally named
 * "Foo *draft*") is inserted as opaque text and survives byte-for-byte.
 */
export function plainCatalogText(template: string, params?: MessageParams): string {
  return interpolate(stripEmphasis(template), params) ?? "";
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
