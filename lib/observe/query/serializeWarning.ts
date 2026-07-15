//
// §5.1 single chokepoint: the ONLY way a ParseWarning jsonb element reaches any
// CLI output path. Allowlist + per-field runtime validation — jsonb is untrusted
// (Codex R1 F1, R2 F2, R3 F1, R7 F1). §5.0 class-D validator for code-valued
// unconstrained columns (Codex R5 F3, R6 F1).
import { sanitizeIdentityString } from "@/lib/adminAlerts/sanitizeIdentityString";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { isMessageCode } from "@/lib/messages/lookup";

export type SerializedWarning = {
  severity: string;
  code: string;
  message: string;
  iso?: string;
  field?: string;
};

// iso: fixed 10-char date shape; field: max 23 chars — both strictly below the
// sanitizer's 24-char TOKEN floor, so a passing value cannot be token-shaped.
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_RE = /^[a-z][a-zA-Z0-9_.-]{0,22}$/;

// Object.hasOwn + shape guard: `code in INTERNAL_CODE_ENUMS` would treat
// inherited names ("toString", "constructor") as members, and unguarded
// `.source.includes` could throw on a non-conforming value (Codex plan-R1 F1).
function isParseWarningCode(code: string): boolean {
  if (!Object.hasOwn(INTERNAL_CODE_ENUMS, code)) return false;
  const entry = (INTERNAL_CODE_ENUMS as Record<string, { source?: unknown }>)[code];
  return typeof entry?.source === "string" && entry.source.includes("parse_warnings.code");
}

export function serializeParseWarning(
  raw: unknown,
  opts: { includePii: boolean },
): SerializedWarning {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { severity: "", code: "", message: "" };
  }
  const r = raw as Record<string, unknown>;
  const severity = r.severity === "info" || r.severity === "warn" ? r.severity : "";
  const code = typeof r.code === "string" && isParseWarningCode(r.code) ? r.code : "";
  const message = sanitizeIdentityString(r.message, opts);
  const out: SerializedWarning = { severity, code, message };
  if (typeof r.iso === "string" && ISO_RE.test(r.iso)) out.iso = r.iso;
  if (typeof r.field === "string" && FIELD_RE.test(r.field)) out.field = r.field;
  return out;
}

export function serializeWarningArray(
  raw: unknown,
  opts: { includePii: boolean },
): SerializedWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((w) => serializeParseWarning(w, opts));
}

// §5.0 class D: code-valued but unconstrained in DDL. Raw emission only on
// membership in INTERNAL_CODE_ENUMS ∪ the §12.4 message catalog — both finite
// generated/curated sets (union: real finalize codes like RESCAN_REVIEW_REQUIRED
// are catalog-only).
export function emitClassDCode(raw: unknown): { code: string; unrecognized: boolean } {
  if (typeof raw === "string" && (Object.hasOwn(INTERNAL_CODE_ENUMS, raw) || isMessageCode(raw))) {
    return { code: raw, unrecognized: false };
  }
  return { code: "", unrecognized: true };
}
