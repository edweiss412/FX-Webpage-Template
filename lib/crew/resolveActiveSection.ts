/**
 * lib/crew/resolveActiveSection.ts: the one source for crew section ids.
 *
 * Membership (`crewSectionsFor`), the server's `?s=` resolution, every redirect
 * allow-list (through `canonicalSectionParam`), the search order and index, and
 * the loading skeleton all derive from the exports here, so no reader spells
 * its own list of ids (crew page redesign PR B plan, Task 3).
 */

/**
 * The crew sections, in nav order: the registry's order (crew page redesign PR C
 * plan, decision 2). `today` is the home, not a section, so it is not one of them.
 */
export const CREW_SECTION_IDS = [
  "venue",
  "event",
  "crew",
  "contacts",
  "schedule",
  "agenda",
  "hotels",
  "transport",
  "rooms",
  "packlist",
  "billing",
] as const;

/** A `?s=` value the page resolves: the home or a crew section. */
export type SectionId = "today" | (typeof CREW_SECTION_IDS)[number];

/**
 * Old `?s=` values a retired id leaves behind, each mapped to the id that
 * replaced it, so an old link keeps working (spec §5.1 "Legacy ids"). Applied
 * everywhere `s` is resolved: `resolveActiveSection` and every redirect
 * allow-list, through `canonicalSectionParam`.
 */
export const LEGACY_SECTION_ALIASES: Readonly<Record<string, (typeof CREW_SECTION_IDS)[number]>> = {
  // PR B plan Task 4: the lead-only money section moved to the registry's id.
  budget: "billing",
  // PR B plan Task 9: Travel split into Hotels and Transport; an old Travel link
  // opens Hotels, the section every viewer is listed (spec line 242).
  travel: "hotels",
  // PR C plan Task 8: Gear's cards left for Event details, Pack list and Rooms; an old
  // Gear link opens Rooms, the section that took its scope (spec line 242).
  gear: "rooms",
};

/**
 * The complete set of `?gate=` values the live app accepts. The crew show
 * route (`app/show/[slug]/[shareToken]/page.tsx:75`) tests `gate === "skip"`
 * and nothing else; `"skip"` is the only value ever written into a URL
 * (`_SignInOrSkipGate.tsx:115`, `lib/auth/picker/clearIdentity.ts:122`). The
 * section links re-emit `gate` ONLY when the incoming value is in this set,
 * so a hand-crafted `?gate=<anything-else>` is dropped from nav URLs rather
 * than propagated. Single source of truth for the gate allow-list (Task 12).
 */
export const ALLOWED_GATE_VALUES = ["skip"] as const;

/**
 * A raw `?s=` value as the id the page knows it by: an id stays itself, `today`
 * included; a legacy alias becomes the id that replaced it; anything else is
 * dropped. Every redirect allow-list calls this, so a redirect carries the
 * current id. Entitlement is not checked here: it is the server's, at render.
 */
export function canonicalSectionParam(raw: string | null | undefined): SectionId | undefined {
  if (typeof raw !== "string") return undefined;
  if (raw === "today") return "today";
  if (Object.hasOwn(LEGACY_SECTION_ALIASES, raw)) return LEGACY_SECTION_ALIASES[raw];
  return (CREW_SECTION_IDS as readonly string[]).includes(raw) ? (raw as SectionId) : undefined;
}

/**
 * Resolve the active crew-page section from the raw `?s=` query value: the
 * value's current id (`canonicalSectionParam`) when the viewer is entitled to
 * it, the home otherwise (spec §11, the `s` param row). `entitled` is the
 * shell's set, the same one it builds the section bodies for, so the URL and
 * the sheet the server renders open can never diverge.
 */
export function resolveActiveSection(
  raw: string | undefined,
  entitled: ReadonlySet<SectionId>,
): SectionId {
  const id = canonicalSectionParam(raw);
  return id !== undefined && entitled.has(id) ? id : "today";
}
