/**
 * lib/crew/sectionHref.ts — single source of truth for the crew section
 * URL.
 *
 * Builds the FRESH-params URL the crew page navigates to when a section is
 * activated (R13-MEDIUM-1 discipline): carry ONLY `s=<id>` plus an allow-listed
 * `gate`, and DROP every other current param (a stale `evil`, a leaked `token`,
 * etc.) so nothing un-vetted rides into history.
 *
 * Every surface that opens a section builds the href here so they can never
 * diverge: the compact "All sections" rows, the wide nav, the section
 * controller's history calls (`components/crew/CrewSections.tsx`), and
 * `SectionChipLink`'s in-body shortcut chips. `buildHomeHref` is the same URL
 * without `s`: the home (compact) or the top of the page (wide).
 */
import { ALLOWED_GATE_VALUES, type SectionId } from "@/lib/crew/resolveActiveSection";

const ALLOWED_GATE_SET = new Set<string>(ALLOWED_GATE_VALUES);

/** Minimal read surface satisfied by both `URLSearchParams` and Next's
 *  `ReadonlyURLSearchParams` (from `useSearchParams()`). */
type ParamReader = { get(name: string): string | null };

/**
 * `pathname`/`searchParams` are `string`/`ReadonlyURLSearchParams` inside the
 * app router, but `null` outside an `AppRouterContext` (e.g. a jsdom unit render
 * with no provider). The null guards keep the builder a pure function in either
 * case: a missing pathname yields a relative `?s=…` href (resolves against the
 * current URL), and a missing param bag simply omits the gate.
 */
export function buildSectionHref(
  pathname: string | null | undefined,
  searchParams: ParamReader | null | undefined,
  id: SectionId,
): string {
  const next = new URLSearchParams();
  next.set("s", id);
  const gate = searchParams?.get("gate") ?? null;
  if (gate !== null && ALLOWED_GATE_SET.has(gate)) {
    next.set("gate", gate);
  }
  return `${pathname ?? ""}?${next.toString()}`;
}

/**
 * The crew page with no section open: the current path plus the allow-listed
 * `gate` and nothing else, the URL a closed sheet leaves behind (spec §5.2).
 */
export function buildHomeHref(
  pathname: string | null | undefined,
  searchParams: ParamReader | null | undefined,
): string {
  const gate = searchParams?.get("gate") ?? null;
  if (gate !== null && ALLOWED_GATE_SET.has(gate)) {
    return `${pathname ?? ""}?${new URLSearchParams({ gate }).toString()}`;
  }
  return pathname ?? "";
}
