/**
 * lib/search/copy.ts — every crew-visible string the search UI renders, in one
 * place (spec §10). No em dashes; "Wi-Fi" spelled the way the redesign spells
 * it; straight apostrophes.
 *
 * The component tests type each expected string literally from spec §10 and
 * never import this module, so a constant that drifts from the spec fails them.
 */
export const SEARCH_COPY = {
  placeholder: "Find anything: Wi-Fi, dock, hotel…",
  inputName: "Search this show",
  clear: "Clear search",
  cancel: "Cancel",
  hint: "Search Wi-Fi, the dock, rooms, gear, people and more.",
} as const;
