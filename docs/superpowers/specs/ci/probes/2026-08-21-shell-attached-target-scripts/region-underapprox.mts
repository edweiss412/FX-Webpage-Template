// Adversarial: does the census's attachedRegion UNDER-approximate anywhere?
// An under-approximation would end a target region too early and let a
// substitution-bearing target escape the count, making the zero false.
const OPS = ["&>>","&>","<<<","<<-","<<",">>",">&","<&","<>",">|","<",">"];
function attachedRegion(line: string, idx: number, op: string): string | null {
  let i = idx + op.length;
  if (i >= line.length || /\s/.test(line[i]!)) return null;
  const out: string[] = []; let quote: string | null = null;
  for (; i < line.length; i++) {
    const c = line[i]!;
    if (quote) { out.push(c);
      if (c === "\\" && quote === '"') { if (i + 1 < line.length) out.push(line[++i]!); continue; }
      if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; out.push(c); continue; }
    if (c === "\\") { out.push(c); if (i + 1 < line.length) out.push(line[++i]!); continue; }
    if (/\s/.test(c) || c === ";" || c === "|" || c === "&") break;
    out.push(c);
  }
  return out.join("");
}
const SUBST = /\$\(|`|\$\{/;
function scan(text: string) {
  for (const op of OPS) { let at = 0;
    for (;;) { const idx = text.indexOf(op, at); if (idx === -1) break; at = idx + 1;
      const r = attachedRegion(text, idx, op);
      if (r === null || r === "") continue;
      if (SUBST.test(r)) return { op, region: r };
    } }
  return null;
}
const CASES: Array<[string,string,boolean]> = [
  ["plain $( ) with a SPACE inside", 'cat >$(psql -c "x")', true],
  ["backtick with a space inside", "cat >`psql -c 'x'`", true],
  ["brace with a space inside", "cat >${OUT:-$(psql -c 'x')}", true],
  ["substitution AFTER an unquoted space (detached-ish tail)", "cat >out $(psql)", false],
  ["single-quoted target containing $(", "cat >'$(psql)'", true],
  ["escaped space then substitution", "cat >a\\ $(psql)", true],
  ["semicolon terminates before substitution", "cat >out; $(psql)", false],
  ["pipe terminates before substitution", "cat >out| $(psql)", false],
  ["nested quotes with substitution deep inside", 'cat >"a\'b$(psql)"', true],
  ["substitution split across an unquoted space", 'cat >$(psql -c "a b")', true],
  ["fd-prefixed attached substitution", "cmd 2>$(psql)", true],
  ["here-string attached substitution", "read -r P <<<$(psql)", true],
  ["plain path, must NOT fire", "cat >/dev/null", false],
  // MULTILINE. Round 3 finding 1: every case above is single-line, and so was
  // the census's own control set - which is precisely why neither could see a
  // continuation inside a quoted target. A probe that varies payloads without
  // varying the SCAFFOLDING dimension inherits the blindness it exists to find.
  ["MULTILINE continuation inside a quoted target", 'cat >"/dev/null\\\n$(psql)"', true],
  ["MULTILINE substitution after a newline inside quotes", 'cat >"\n$(psql)"', true],
  ["MULTILINE single-quoted target spanning a newline", "cat >'a\n$(psql)'", true],
  ["an UNQUOTED newline ENDS the region", "cat >out\n$(psql)\n", false],
  ["continuation OUTSIDE quotes still continues", "cat >a\\\n$(psql)", true],
];
let bad = 0;
for (const [id, line, want] of CASES) {
  const got = scan(line) !== null;
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "MISS"}  want=${String(want).padEnd(5)} got=${String(got).padEnd(5)} ${id}`);
}
console.log(`\n${CASES.length - bad}/${CASES.length} correct`);
if (bad > 0) {
  // Counting misses and exiting 0 makes this a printer. Blinding the reader
  // in a mirror copy produced 5/18 and exit 0, which would have read as a
  // clean run to anything checking the status.
  console.error(`FAIL: ${bad} case(s) disagree with the region reader.`);
  process.exit(1);
}
console.log("PASS: every adversarial case agrees with the region reader.");
