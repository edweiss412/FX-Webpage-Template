// FIXTURE — AC-11's POSITIVE CONTROL, and it lives OUTSIDE the discrimination
// corpus on purpose.
//
// Every fixture under `fixtures/sendAuth/` is authored against the `Channel` row
// with no live spelling, so that no scanner hardcoded to the live vocabulary can
// pass the corpus. This file is the opposite case by design: it belongs to the
// LIVE-TREE assertion, and it must ride the LIVE registry, so it names the live
// surface type deliberately. It is in its own directory so the discrimination
// corpus stays pure.
//
// What it proves: `scanRepo(LIVE_ROOTS)` returning `[]` means "found nothing
// wrong" rather than "looked at nothing". The only delta between that call and
// `scanRepo([...LIVE_ROOTS, CONTROL_ROOT])` is one added root, so a non-empty
// second result proves this roots configuration reaches files and runs the
// analysis.

import type { Surface } from "@/scripts/pane-compaction";

export function drain(s: Surface): void {
  s.send("p1", "/compact");
}
