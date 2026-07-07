/** True iff `value` parses as an http(s) URL. Shared by the admin venue card
 * (mirrors the private crew copy at components/crew/sections/VenueSection.tsx:79,
 * intentionally left untouched — crew is out of scope for the venue redesign). */
export function isParseableUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
