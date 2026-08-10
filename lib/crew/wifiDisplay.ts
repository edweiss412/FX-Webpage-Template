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
const SEP = "\\s*[:\\-]\\s*";

/** Every label occurrence on a line, in source order. */
const LABEL_RE = new RegExp(`\\b(${NET}|${PWD})${SEP}`, "gi");
/** Which half of the pair a matched label belongs to. */
const NET_ONLY_RE = new RegExp(`^(?:${NET})$`, "i");

/**
 * Signals that a captured value is a GUESS rather than a reading. Any hit means
 * the cell carries more syntax than this splitter resolved, so the whole parse
 * is rejected and the raw cell renders instead (diff review R2 F1 probed every
 * one of these against the shipped module):
 *
 *   - `Word:` that is not an accepted label — `SSID: Guest WPA: secret` would
 *     otherwise name the network "Guest WPA: secret". Letter-initial, so a time
 *     (`9:00`) is not label-shaped.
 *   - An accepted label word sitting in the value with something other than a
 *     separator after it — `SSID: Guest Password is secret`, `SSID: Guest
 *     Network is Corporate`. The label was not matched as a pair, so its text
 *     was absorbed into a neighbouring value.
 *   - A spaced dash, which is one of the two accepted separators. Seeing one
 *     INSIDE a value means a pair was formed on the other separator and this
 *     one was not resolved — `SSID: Guest WPA - secret`.
 */
const LABEL_SHAPED_RE = /\b[A-Za-z][A-Za-z0-9]{1,15}\s*:/;
const ACCEPTED_LABEL_WORD_RE = new RegExp(`\\b(?:${NET}|${PWD})\\b`, "i");
const SPACED_DASH_RE = /\s-\s/;

function valueIsAGuess(value: string): boolean {
  return (
    LABEL_SHAPED_RE.test(value) || ACCEPTED_LABEL_WORD_RE.test(value) || SPACED_DASH_RE.test(value)
  );
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

    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i]!;
      const value = line.slice(label.end, labels[i + 1]?.start ?? line.length).trim();
      if (label.isNetwork) networkLabels += 1;
      else passwordLabels += 1;
      if (proseEnd === null) proseEnd = label.start;

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
    if (residue.length > 0) residues.push(residue);
  }

  // Repeated labels mean two candidate networks or two candidate passwords, and
  // picking the first is a coin flip presented as fact.
  if (networkLabels > 1 || passwordLabels > 1) ambiguous = true;

  // A network name is required: a password-only match is ambiguous without one,
  // so the whole parse is rejected and the raw value renders.
  if (ambiguous || ssid === null) return null;

  return { ssid, password, notes: residues.length > 0 ? residues.join(" ") : null };
}
