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

export function messageFor(code: MessageCode, params?: MessageParams): MessageCatalogEntry {
  const entry = MESSAGE_CATALOG[code];
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
