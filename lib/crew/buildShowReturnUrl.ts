/**
 * lib/crew/buildShowReturnUrl.ts (Task 12, R4-HIGH-1)
 *
 * The single builder for a crew show-page return URL that carries the `?s=`
 * section deep-link and/or `?gate=` through every redirect path (picker
 * clear/select, sign-in recovery, page.tsx bootstrap + gate=skip honor, the
 * SignInOrSkip gate CTA, the picker hidden inputs).
 *
 * Allow-lists are the single source of truth in resolveActiveSection.ts:
 *   - `s` is appended IFF `canonicalSectionParam` admits it, written as the
 *     id it returns (a legacy alias becomes the id that replaced it).
 *   - `gate` is appended IFF it is in ALLOWED_GATE_VALUES.
 * Anything else is DROPPED — an arbitrary `s`/`gate` must never reach the
 * URL (param-smuggling / open-redirect defense; this builder mirrors the
 * allow-list re-attached at the validateNextParam boundary).
 *
 * Order is stable: `?s=...` first, then `&gate=...`, so the same inputs
 * always produce a byte-identical URL (revalidatePath / dedupe stability).
 */
import { ALLOWED_GATE_VALUES, canonicalSectionParam } from "@/lib/crew/resolveActiveSection";

const ALLOWED_GATE_SET: ReadonlySet<string> = new Set<string>(ALLOWED_GATE_VALUES);

export type ShowReturnUrlOptions = {
  s?: string | undefined;
  gate?: string | undefined;
};

export function buildShowReturnUrl(
  slug: string,
  shareToken: string,
  { s, gate }: ShowReturnUrlOptions,
): string {
  const params: string[] = [];
  const section = canonicalSectionParam(s);
  if (section !== undefined) {
    params.push(`s=${section}`);
  }
  if (typeof gate === "string" && ALLOWED_GATE_SET.has(gate)) {
    params.push(`gate=${gate}`);
  }
  const base = `/show/${slug}/${shareToken}`;
  return params.length > 0 ? `${base}?${params.join("&")}` : base;
}
