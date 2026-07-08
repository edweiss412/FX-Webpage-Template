/**
 * app/admin/show/[slug]/crewLinkMailto.ts
 *
 * Pure client-safe builder for the "Email crew the link" affordance
 * (spec docs/superpowers/specs/2026-07-07-flow5-rotate-disclosure-mailto.md §2.2).
 *
 * Contract: every emitted href is ≤ MAX_MAILTO_HREF_CHARS, no exceptions, and
 * no recipient is ever silently dropped — either all filtered recipients are
 * batched under the cap or nothing renders ([]).
 */

export const MAX_MAILTO_HREF_CHARS = 1900;
export const MAILTO_TITLE_MAX_CHARS = 80;
// Completeness bound for the page's crew_members read: a distribution list must
// be provably complete or absent, never silently partial (spec §2.5).
export const CREW_ROSTER_READ_CAP = 500;

const MAX_EMAIL_CHARS = 254;
// Conservative practical email shape (adversarial R5). Rejects whitespace,
// control characters, commas, '?', '&', quotes, angle brackets. '%' is legal in
// the local part and is neutralized by encodeURIComponent ('%' → '%25').
const EMAIL_SHAPE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

// Unpaired surrogates (external sheet text can carry them) would make
// encodeURIComponent throw "URI malformed" — replace with U+FFFD first.
// Code-unit loop, not a lookbehind regex: this module ships in the client
// bundle and lookbehind is a hard syntax error on older mobile browsers.
function replaceUnpairedSurrogates(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s.slice(i, i + 2);
        i += 1;
      } else {
        out += "\uFFFD";
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
    } else {
      out += s[i]!;
    }
  }
  return out;
}

export type CrewLinkMailto = { href: string; batch: number; batchCount: number };

function subjectFor(title: string): string {
  return title.length > 0 ? `Crew link: ${title}` : "Crew link";
}

function bodyFor(title: string, url: string): string {
  const forFragment = title.length > 0 ? ` for ${title}` : "";
  return `Here's the link to your crew page${forFragment}:\n\n${url}\n\nOpen it and pick your name to see your schedule.`;
}

function hrefFor(encodedBcc: string, title: string, url: string): string {
  const subject = encodeURIComponent(subjectFor(title));
  const body = encodeURIComponent(bodyFor(title, url));
  return `mailto:?bcc=${encodedBcc}&subject=${subject}&body=${body}`;
}

export function buildCrewLinkMailtos({
  emails,
  url,
  showTitle,
}: {
  emails: readonly string[];
  url: string;
  showTitle: string;
}): CrewLinkMailto[] {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const raw of emails) {
    if (!raw || raw.length > MAX_EMAIL_CHARS || !EMAIL_SHAPE.test(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    recipients.push(raw);
  }
  if (recipients.length === 0) return [];

  const trimmed = replaceUnpairedSurrogates(showTitle).trim();
  // Truncate by CODE POINT, not code unit — a .slice() cutting a surrogate
  // pair would itself mint a lone surrogate and crash the encoder.
  const codePoints = Array.from(trimmed);
  const effectiveTitle =
    codePoints.length > MAILTO_TITLE_MAX_CHARS
      ? `${codePoints.slice(0, MAILTO_TITLE_MAX_CHARS).join("")}…`
      : trimmed;

  // Title ladder (adversarial R4): truncated title → blank title → [].
  // A rung is viable only if EVERY recipient fits a single-recipient href under
  // the cap — that guarantee makes the greedy packer below cap-safe per batch.
  for (const title of [effectiveTitle, ""]) {
    const worstSingle = recipients.reduce(
      (max, r) => Math.max(max, hrefFor(encodeURIComponent(r), title, url).length),
      0,
    );
    if (worstSingle > MAX_MAILTO_HREF_CHARS) {
      if (title === "") return [];
      continue;
    }
    const batches: string[][] = [];
    let current: string[] = [];
    for (const r of recipients) {
      const candidate = [...current, r];
      const href = hrefFor(candidate.map(encodeURIComponent).join(","), title, url);
      if (href.length <= MAX_MAILTO_HREF_CHARS) {
        current = candidate;
      } else {
        batches.push(current);
        current = [r];
      }
    }
    batches.push(current);
    return batches.map((batch, i) => ({
      href: hrefFor(batch.map(encodeURIComponent).join(","), title, url),
      batch: i + 1,
      batchCount: batches.length,
    }));
  }
  return [];
}
