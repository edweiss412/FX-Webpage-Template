/**
 * Wi-Fi display derivation (presentation-only, pure).
 *
 * Splits the raw `event_details.internet` cell into an SSID / password / notes
 * triple for the Venue section, mirroring the shipped `lib/crew/flightDisplay.ts`
 * precedent: derived per render, NO DB column, NO parser change. The cell stays
 * a raw passthrough key (`lib/parser/aliases.ts` `"event.internet"`).
 *
 * Accept-set, not denylist. The label vocabulary is EXACTLY what the full-corpus
 * probe observed (spec §4 — both fixture families plus the live sheets):
 * network labels `SSID` / `Network`, password labels `Code` / `PW` / `Passcode` /
 * `Password`, separator colon or dash. Anything outside that set returns `null`
 * and the caller renders today's raw string verbatim — handled correctly or
 * surfaced unchanged, never silently wrong. Widening the set requires a probe.
 *
 * The split is ALL-OR-NOTHING, because a PARTIALLY understood cell is the
 * dangerous case: it yields confident-looking credentials that are wrong. Three
 * signals reject the whole parse (diff review R1 F1, each probe-demonstrated):
 * unknown `Word:` vocabulary swallowed into a captured value (`SSID: Guest WPA:
 * secret` would otherwise name the network "Guest WPA: secret"); a repeated
 * network or password label, where picking the first is a coin flip presented as
 * fact (`SSID: Conference Network - 5G Password: x` — the second "Network -" is
 * part of the real SSID); and a recognized label with an empty value, where
 * dropping the bare label would silently lose text. All three render raw.
 *
 * Line-oriented, because live cells are multi-line (`\n\n` after the prose, `\n`
 * between label pairs) while the markdown fixtures flatten the same content onto
 * one line. Both shapes parse. Within a line, a label's value runs to the NEXT
 * label or the end of the line — that lookahead is what stops the Consultants
 * value (`... Network: Institutional Investor Passcode: Investor2025`) from
 * capturing `Institutional Investor Passcode: Investor2025` as the network name
 * (spec R1's corruption class).
 *
 * Labels are word-boundary anchored and must be followed by a separator, because
 * bare `code` / `pw` substrings are dangerous: `Dress Code` is a real event key,
 * and `Barcode:` must not read as a password label.
 *
 * The prose is operationally load-bearing (hardline vs Wi-Fi for streaming) and
 * is NEVER discarded — it becomes `notes`. Trailing punctuation in a password is
 * preserved verbatim (`ORDTG.`): the probe cannot tell a sentence period from a
 * password character, and showing exactly what the sheet says is the honest
 * choice. A password with no network label returns `null` rather than a half
 * pair — guessing which network a password belongs to is the corruption class.
 */
export type WifiInfo = {
  ssid: string;
  password: string | null;
  notes: string | null;
};

const NET = "SSID|Network";
const PWD = "Code|PW|Passcode|Password";
/**
 * The separator characters, and the SINGLE source for both the label matcher and
 * the leftover-syntax check below. Deriving the check from this class is the
 * whole point: the two cannot drift, and widening the accepted separators
 * automatically widens what counts as unresolved syntax.
 */
const SEP_CHARS = ":\\-";
const SEP = `\\s*[${SEP_CHARS}]\\s*`;

/** Every label occurrence on a line, in source order. */
const LABEL_RE = new RegExp(`\\b(${NET}|${PWD})${SEP}`, "gi");
/** Which half of the pair a matched label belongs to. */
const NET_ONLY_RE = new RegExp(`^(?:${NET})$`, "i");

/**
 * Leftover syntax: a separator character surviving INSIDE a captured value or a
 * prose residue. The grammar consumes every separator it understands, so one
 * that is still there belongs to a pair this splitter did not resolve, and the
 * text around it is a guess. The whole parse is rejected and the raw cell
 * renders (spec §6.1).
 *
 * **Derived, not enumerated — and that is the repair.** Three review rounds hit
 * this same vector because the check tried to RECOGNIZE unknown labels: first
 * `Word:` only, then plus accepted label words and a spaced dash. Each version
 * was bounded by numbers and character classes, and each round produced new
 * escapes from exactly those bounds — `P:` (too short), `AuthenticationCode:`
 * (too long), `WiFi_Password:` (underscore), `802.1X:` (digit-initial),
 * `Contraseña:` (non-ASCII), `WPA- secret` and `WPA -secret` (one-sided dash).
 * Asking "which unknown labels exist?" ranges over an open set and does not
 * terminate. Asking "is any separator left unconsumed?" ranges over a closed one
 * — the two characters the accept-set itself defines — so the escapes above are
 * not a longer list to chase; they are all the same answer.
 *
 * `ACCEPTED_LABEL_WORD_RE` remains because a label word can appear with NO
 * separator at all (`SSID: Guest Password is secret`), which leaves nothing for
 * the separator test to find.
 */
const LEFTOVER_SEPARATOR_RE = new RegExp(`[${SEP_CHARS}]`);
const ACCEPTED_LABEL_WORD_RE = new RegExp(`\\b(?:${NET}|${PWD})\\b`, "i");

function valueIsAGuess(value: string): boolean {
  return LEFTOVER_SEPARATOR_RE.test(value) || ACCEPTED_LABEL_WORD_RE.test(value);
}

type Label = { isNetwork: boolean; start: number; end: number };

function labelsOn(line: string): Label[] {
  const labels: Label[] = [];
  LABEL_RE.lastIndex = 0;
  let match: RegExpExecArray | null = LABEL_RE.exec(line);
  while (match !== null) {
    labels.push({
      isNetwork: NET_ONLY_RE.test(match[1] ?? ""),
      start: match.index,
      end: match.index + match[0].length,
    });
    match = LABEL_RE.exec(line);
  }
  return labels;
}

export function parseWifiValue(raw: string | null | undefined): WifiInfo | null {
  if (!raw || raw.trim().length === 0) return null;

  let ssid: string | null = null;
  let password: string | null = null;
  const residues: string[] = [];
  let networkLabels = 0;
  let passwordLabels = 0;
  // Any sign that this cell is not fully understood. The split is ALL-OR-NOTHING:
  // a partially recognized cell renders raw, because a half-understood cell
  // produces confident-looking WRONG credentials, which is the one outcome the
  // fail-soft contract exists to prevent.
  let ambiguous = false;

  for (const line of raw.split("\n")) {
    const labels = labelsOn(line);
    // Prose is whatever precedes the first label; once a pair starts, the rest
    // of the line belongs to label values.
    let proseEnd: number | null = null;

    // A password label on a line with NO network label must START that line.
    // Producers write QUALIFIED labels — `Door Code:`, `Dress Code:`, `Gate
    // Code:` — that are not the Wi-Fi password, and word-boundary anchoring
    // alone reads them as one (`Door Code: 2468` became the password, with
    // "Door" demoted to notes). The asymmetry is corpus-justified rather than
    // stylistic: prose PRECEDING a network label is an observed shape
    // (`Wifi for Polling Network: Institutional Investor ...`), so the same rule
    // cannot apply to network labels; and every observed password label is
    // either line-initial (`Code: FITS2025`, `PW: ORDTG.`) or follows a network
    // pair on the same line, which this rule still allows.
    const lineStart = line.length - line.trimStart().length;

    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i]!;
      const value = line.slice(label.end, labels[i + 1]?.start ?? line.length).trim();
      if (label.isNetwork) networkLabels += 1;
      else passwordLabels += 1;
      if (proseEnd === null) proseEnd = label.start;

      // The network label must come EARLIER on the line, not merely somewhere on
      // it: `Door Code: 2468 SSID: Guest` put one AFTER the qualified label and
      // a whole-line test read that as legitimizing it (review S6 R3, 128/128
      // escapes). What makes `Code:` a Wi-Fi password is a network name already
      // named to its left, or nothing at all to its left.
      const networkPrecedes = labels
        .slice(0, i)
        .some((candidate) => candidate.isNetwork && candidate.start < label.start);
      if (!label.isNetwork && !networkPrecedes && label.start > lineStart) {
        ambiguous = true;
      }

      // A recognized label with nothing after it: the cell says something this
      // splitter cannot represent, and dropping the bare label would lose text.
      if (value.length === 0) {
        ambiguous = true;
        continue;
      }
      // Unresolved syntax swallowed into a value — the capture is a guess.
      if (valueIsAGuess(value)) ambiguous = true;

      if (label.isNetwork) {
        if (ssid === null) ssid = value;
      } else if (password === null) {
        password = value;
      }
    }

    const residue = (proseEnd === null ? line : line.slice(0, proseEnd)).trim();
    if (residue.length > 0) {
      // Residue is prose ONLY if it looks like prose. `WPA: secret` on its own
      // line never matches a label (the vocabulary is unknown), so it used to
      // slide through as notes and the cell split with a password hiding in the
      // prose row — while spec §6.1 promises an unobserved label spelling makes
      // the WHOLE cell render raw. The same test that guards captured values
      // guards residue, so credential-shaped text can never be demoted to prose.
      if (valueIsAGuess(residue)) ambiguous = true;
      residues.push(residue);
    }
  }

  // Repeated labels mean two candidate networks or two candidate passwords, and
  // picking the first is a coin flip presented as fact.
  if (networkLabels > 1 || passwordLabels > 1) ambiguous = true;

  // A network name is required: a password-only match is ambiguous without one,
  // so the whole parse is rejected and the raw value renders.
  if (ambiguous || ssid === null) return null;

  return { ssid, password, notes: residues.length > 0 ? residues.join(" ") : null };
}
