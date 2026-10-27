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
  chipsNav: "Filter results by section",
  allChip: "All",
  showAll: (count: number, section: string) => `Show all ${count} in ${section}`,
  sectionCapNote: "Showing the first 50. Add a word to narrow it.",
  aliasNote: (span: string) => `Matched "${span}"`,
  copyButton: {
    network: "Copy Wi-Fi network",
    password: "Copy Wi-Fi password",
    hotelConfirmation: "Copy hotel confirmation",
    flightConfirmation: "Copy flight confirmation",
  },
  copied: {
    network: "Network name copied",
    password: "Password copied",
    hotelConfirmation: "Confirmation copied",
    flightConfirmation: "Confirmation copied",
  },
  copyFailed: "Couldn't copy. Tap the line, then press and hold the text.",
  noMatch: "No matches. Try dock, hotel, or a name.",
  reportTitle: "Not what you need?",
  reportBody: "Tell Doug what's missing from the sheet.",
  reportButton: "Report",
  resultCount: (total: number) =>
    total === 0 ? "No matches" : total === 1 ? "1 result" : `${total} results`,
  searchedFor: (query: string) => `Searched for "${query}"`,
} as const;
