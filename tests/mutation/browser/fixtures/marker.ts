/**
 * The overlay probe's target module.
 *
 * Its DISK text is the string below; the wiring suite overlays it with a mutant
 * whose text differs, so a child that reads this value is reporting which of the
 * two the overlay actually served. Never imported by shipping code.
 */
export const MARKER = "DISK";
