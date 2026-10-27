/**
 * lib/ui/scrollLock.ts — the one writer of `document.body.style.overflow`.
 *
 * Several dialogs can be open at once on the crew page: a section sheet with an
 * agenda viewer, a diagram lightbox or the report modal inside it (crew page
 * redesign spec §5.2). Each used to save the body's overflow on open and put it
 * back on close. Nested, that breaks whenever the two close out of order: the
 * inner dialog saved "hidden", the outer one closes first and restores the real
 * value, then the inner one closes and writes "hidden" back over a page with no
 * dialog left. Closing both at once, as Back to another route does, can leave
 * the destination page unscrollable.
 *
 * So the lock is reference-counted. The first holder saves the original value,
 * the last release restores it, and a release in any order or more than once is
 * safe. `tests/styles/_metaBodyOverflowWriters.test.ts` fails on any other file
 * that writes the property.
 */

let holders = 0;
let original = "";

/** Locks page scroll and returns this holder's release. Calling the release twice is a no-op. */
export function acquireScrollLock(): () => void {
  if (holders === 0) {
    original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) document.body.style.overflow = original;
  };
}
