// lib/parser/roleVocabulary.ts
// Dependency-free vocabulary leaf (spec 2026-07-15-extend-role-scope-vocab §5.3).
// Single source for the role vocabulary + token canonicality. Imported by the
// parser (personalization.ts), the admin action boundary, and UI echoes —
// one-way dependency, so parser/action parity holds by construction.
import type { RoleFlag } from "./types";

// ── Role normalization map ────────────────────────────────────────────────────
// Maps cleaned token strings (trimmed uppercase) to canonical RoleFlag.
export const ROLE_NORMALIZATIONS: Record<string, RoleFlag> = {
  LEAD: "LEAD",
  A1: "A1",
  A2: "A2",
  V1: "V1",
  L1: "L1",
  GS: "GS",
  BO: "BO",
  "CAM OP": "CAM_OP",
  CAM_OP: "CAM_OP",
  PTZ: "PTZ",
  LED: "LED",
  STREAM: "STREAM",
  GAV: "GAV",
  FLOATER: "FLOATER",
  FLOOR: "FLOOR",
  "SHOW CALLER": "SHOW_CALLER",
  SHOW_CALLER: "SHOW_CALLER",
  "GREEN ROOM": "GREEN_ROOM",
  GREEN_ROOM: "GREEN_ROOM",
  OWNER: "OWNER",
  "CONTENT CREATION": "CONTENT_CREATION",
  CONTENT_CREATION: "CONTENT_CREATION",
  ONLY: "ONLY",
};

// Multi-word tokens that must be matched BEFORE splitting by / or -.
export const MULTI_WORD_TOKENS: string[] = [
  "CONTENT CREATION",
  "SHOW CALLER",
  "GREEN ROOM",
  "CAM OP",
];

/**
 * EXACTLY the tokenizer's per-token transform (split on '/'/'-' happens at the
 * call site; this is the .trim().toUpperCase() applied to each token). Internal
 * whitespace is preserved VERBATIM — collapsing it would store mapping keys the
 * parser never emits (spec §5.3, Codex R1 F3).
 */
export function canonicalRoleToken(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * True when the parser can never emit this token as UNKNOWN_ROLE_TOKEN:
 * exact map key, flexible-whitespace multi-word form (parser regex uses \s+,
 * personalization.ts multi-word extraction), or the ONLY restriction marker
 * (tokenizer `continue`s on it before lookup). Spec §8.3.
 */
export function isBuiltInRoleToken(token: string): boolean {
  if (token === "ONLY") return true;
  if (Object.hasOwn(ROLE_NORMALIZATIONS, token)) return true;
  return Object.hasOwn(ROLE_NORMALIZATIONS, token.replace(/\s+/g, " "));
}
