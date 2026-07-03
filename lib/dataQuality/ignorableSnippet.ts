import type { ParseWarning } from "@/lib/parser/types";

export function normalizeSnippet(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** Pure string predicate — SAFE to import in a "use client" component (no node:*). */
export function hasIgnorableSnippet(w: Pick<ParseWarning, "rawSnippet">): boolean {
  return typeof w.rawSnippet === "string" && normalizeSnippet(w.rawSnippet).length > 0;
}
