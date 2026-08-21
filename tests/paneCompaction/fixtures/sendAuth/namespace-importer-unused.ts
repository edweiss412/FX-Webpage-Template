// FIXTURE — the NEGATIVE pair for `namespace-importer.ts`, one variable apart: a
// namespace import of a registered module that NEVER reaches the surface type.
//
// It must stay CLEAN, and the clean verdict must be ATTRIBUTABLE rather than
// accidental. That is why the word Channel appears in this very sentence: the
// import-edge arm prefilters on the surface type NAME before parsing, so a fixture
// omitting the token entirely is skipped BEFORE the qualified-name check runs and
// its clean result would prove only that the prefilter works. With the token
// present the file is parsed, the arm looks for `registered.Channel`, finds only
// `registered.announce`, and correctly declines — which is the behaviour under
// test rather than a shortcut around it.

import * as registered from "./registered-channel";

export function announce(): void {
  registered.announce({} as never);
}
