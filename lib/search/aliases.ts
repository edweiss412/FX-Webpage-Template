/**
 * Alias groups that close the wording gap between how crew ask and how Doug
 * writes (spec §5.4). Expansion happens once, at index time: when any member
 * occurs in an entry (a phrase occurs when its tokens are consecutive), the entry
 * gains the OTHER members' tokens as alias tokens.
 *
 * Every member is stored normalized (`normalize` tokens joined by one space), and
 * a term appears in at most one group, so expansion never chains. Both rules are
 * pinned by tests/search/aliases.test.ts.
 *
 * Left out on purpose: `wireless` (in AV it means wireless mics), `keynote` (a
 * session or Apple's app), `room` (event room or hotel room), `call` alone
 * (phone call or call time). This is a starting list, tuned later from the
 * recorded misses (spec §7).
 */
export const SEARCH_ALIAS_GROUPS: readonly (readonly string[])[] = [
  ["wifi", "internet", "network", "ssid"],
  ["password", "passcode", "pw"],
  ["dock", "loading dock", "freight", "loadin"],
  ["foh", "front of house"],
  ["gs", "general session", "plenary"],
  ["breakout", "break out"],
  ["mic", "mics", "microphone", "microphones", "mike"],
  ["lav", "lavs", "lavalier"],
  ["laptop", "laptops", "computer", "computers"],
  ["projector", "projectors", "projection"],
  ["led wall", "video wall"],
  ["lighting", "lights", "lx"],
  ["audio", "sound"],
  ["hotel", "hotels", "lodging", "accommodation"],
  ["confirmation", "conf", "reservation"],
  ["flight", "flights", "airline"],
  ["parking", "garage"],
  ["call time", "crew call"],
  ["strike", "load out", "loadout", "teardown", "tear down"],
  ["power", "electrical", "distro"],
  ["diagram", "diagrams", "floor plan", "stage plot", "cad"],
  ["dress code", "wardrobe", "attire"],
  ["schedule", "agenda", "run of show", "ros", "rundown"],
  ["slides", "deck", "powerpoint", "ppt"],
  ["signage", "signs"],
  ["lunch", "dinner", "breakfast", "meal", "catering"],
];
