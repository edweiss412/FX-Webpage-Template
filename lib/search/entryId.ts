import type { SectionId } from "@/lib/crew/resolveActiveSection";

/**
 * Content-addressed search entry ids (spec §3).
 *
 * `<sectionId>:<region>:<hash>`, where `hash` is a 32-bit FNV-1a of the EXACT
 * display strings `group`, `label` (empty when null) and `value`, joined by
 * U+001F, in base 36. Nothing is normalized first: a password that changes
 * case or loses a period must get a new id, so a stale reveal finds no target
 * instead of the wrong one. `region` is the line's `data-card-id`, or `none`
 * for a line outside every card.
 *
 * Byte-identical lines in one section and region share a hash; the second and
 * later get `~2`, `~3` in the order they are passed, which callers keep equal
 * to render order. `seen` is the per-index counter, keyed by the unsuffixed id.
 *
 * Pure: no module state. Imported by section components and by the server-side
 * builders, so this module must stay free of `"use client"`.
 */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;
const FIELD_JOINER = "\u001f";

const utf8 = new TextEncoder();

/** 32-bit FNV-1a over the UTF-8 octets of `text`, as an unsigned integer. */
export function fnv1a32(text: string): number {
  let hash = FNV_OFFSET_BASIS;
  for (const byte of utf8.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

export function entryId(
  section: SectionId,
  region: string,
  group: string,
  label: string | null,
  value: string,
  seen: Map<string, number>,
): string {
  const hash = fnv1a32([group, label ?? "", value].join(FIELD_JOINER)).toString(36);
  const base = `${section}:${region}:${hash}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}~${count}`;
}
