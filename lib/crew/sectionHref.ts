/**
 * lib/crew/sectionHref.ts — single source of truth for the crew sub-nav section
 * URL.
 *
 * Builds the FRESH-params URL the crew page navigates to when a section is
 * activated (R13-MEDIUM-1 discipline): carry ONLY `s=<id>` plus an allow-listed
 * `gate`, and DROP every other current param (a stale `evil`, a leaked `token`,
 * etc.) so nothing un-vetted rides into history.
 *
 * Both navigation surfaces build the href here so they can never diverge:
 *   - `CrewSubNav` (imperative `router.push`) — the tab row + bottom bar.
 *   - `SectionChipLink` (declarative `next/link`) — in-body shortcut chips
 *     (e.g. the Today "Run of show" → full agenda chip).
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
