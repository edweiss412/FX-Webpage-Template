import { HOTEL_DISAMBIGUATOR_SEP } from "@/lib/overrides/hotelDisambiguator";

// §7.4 value-guard table — the (non-race) TS backstop that mirrors the RPC-side
// `_validate_override_value` (F3). Shared by the RPC-adjacent TS validation path and the
// sync transform (§7.3). Returns a discriminated result; on rejection the `code` is the
// same reason token the SQL returns: 'invalid_shape' | 'empty' | 'noop' | 'too_long' |
// 'name_conflict'.

export type OverrideField = "dates" | "venue" | "name" | "role" | "hotel_name" | "hotel_address";

export type ValidateOverrideCtx = {
  /** OTHER current parsed crew names (crew name-collision, §7.4). */
  currentParsedNames?: string[];
  /** OTHER current live crew names. */
  currentLiveNames?: string[];
  /** OTHER active crew name-overrides' output values for this show. */
  otherActiveNameOutputs?: string[];
  /** OTHER reservations' current FINAL hotel_name (R27: finals, not raw parsed). */
  otherFinalHotelNames?: string[];
  /** This override's match_key (parsed name; for hotel_name, name + §5.3 disambiguator). */
  matchKey: string;
};

export type ValidateOverrideResult = { ok: true } | { ok: false; code: string };

/** Per-field character caps (§7.4). */
const CAPS: Partial<Record<OverrideField, number>> = {
  name: 200,
  role: 120,
  hotel_name: 200,
  hotel_address: 300,
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every present known date field carries the right type; at least one is present. */
function isValidDatesShape(v: Record<string, unknown>): boolean {
  const stringOrNull = (x: unknown) => x === null || typeof x === "string";
  const knownStringKeys = ["travelIn", "set", "travelOut", "loadIn", "setupTime"] as const;
  let sawKnown = false;
  for (const k of knownStringKeys) {
    if (k in v) {
      sawKnown = true;
      if (!stringOrNull(v[k])) return false;
    }
  }
  if ("showDays" in v) {
    sawKnown = true;
    const sd = v.showDays;
    if (!Array.isArray(sd) || !sd.every((d) => typeof d === "string")) return false;
  }
  return sawKnown;
}

/** venue must carry string name + address; optional fields are string|null. */
function isValidVenueShape(v: Record<string, unknown>): boolean {
  if (typeof v.name !== "string" || typeof v.address !== "string") return false;
  const optionalStringOrNull = ["loadingDock", "googleLink", "notes", "city"] as const;
  for (const k of optionalStringOrNull) {
    if (k in v && v[k] !== null && typeof v[k] !== "string") return false;
  }
  return true;
}

export function validateOverrideValue(
  field: OverrideField,
  value: unknown,
  ctx: ValidateOverrideCtx,
): ValidateOverrideResult {
  // --- show domain: dates / venue jsonb shape ---
  if (field === "dates" || field === "venue") {
    if (!isPlainObject(value) || Object.keys(value).length === 0)
      return { ok: false, code: "invalid_shape" };
    if (field === "dates" && !isValidDatesShape(value)) return { ok: false, code: "invalid_shape" };
    if (field === "venue" && !isValidVenueShape(value)) return { ok: false, code: "invalid_shape" };
    return { ok: true };
  }

  // --- text fields: name / role / hotel_name / hotel_address ---
  // Mirrors the SQL `jsonb_typeof(p_value) <> 'string'` guard: the four text fields must
  // be JSON strings (reject number / object / bool).
  if (typeof value !== "string") return { ok: false, code: "invalid_shape" };
  const text = value;

  const trimmed = text.trim(); // canonicalize-exempt: crew display name, not an email
  if (trimmed === "") return { ok: false, code: "empty" };

  // `= match_key` no-op reject (name; hotel_name compares the name-part before the §5.3 disambiguator).
  if (field === "name" && text === ctx.matchKey) return { ok: false, code: "noop" };
  if (field === "hotel_name") {
    const sepIdx = ctx.matchKey.indexOf(HOTEL_DISAMBIGUATOR_SEP);
    const namePart = sepIdx === -1 ? ctx.matchKey : ctx.matchKey.slice(0, sepIdx);
    if (text === namePart) return { ok: false, code: "noop" };
  }

  // Caps.
  const cap = CAPS[field];
  if (cap !== undefined && text.length > cap) return { ok: false, code: "too_long" };

  // Collisions (§7.4). The ctx arrays are the OTHER members'/reservations' values
  // (the caller excludes the target itself).
  if (field === "name") {
    const others = new Set<string>([
      ...(ctx.currentParsedNames ?? []),
      ...(ctx.currentLiveNames ?? []),
      ...(ctx.otherActiveNameOutputs ?? []),
    ]);
    if (others.has(text)) return { ok: false, code: "name_conflict" };
  } else if (field === "hotel_name") {
    if (new Set(ctx.otherFinalHotelNames ?? []).has(text))
      return { ok: false, code: "name_conflict" };
  }

  return { ok: true };
}
