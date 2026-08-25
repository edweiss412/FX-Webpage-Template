/**
 * tests/cross-cutting/psqlStartupFiles/scan.ts
 *
 * Static discovery for PSQL-STARTUP-FILE-NO-X-CLASSWIDE. Finds every `psql`
 * invocation in tracked non-docs source and reports whether it suppresses the
 * three startup files (`$PSQLRC`, `$HOME/.psqlrc`, the compiled-in system
 * psqlrc) that psql reads BEFORE anything on stdin or `-c`. Consumed by
 * `tests/cross-cutting/psqlStartupFileSuppression.test.ts`, which is where the
 * vector is written up.
 *
 * ── What is enforced ───────────────────────────────────────────────────────
 *
 * 1. JS/TS spawn family with a LITERAL binary — `execFileSync`/`execFile`/
 *    `spawnSync`/`spawn`, bare or as a member (`child_process.spawnSync`), whose
 *    argv[0] is `"psql"` or a path ending `/psql`. Parsed with the TypeScript
 *    AST, so prettier's multi-line opener (`execFileSync(\n  "psql",`) and
 *    interleaved comments cost nothing — no regex to outrun.
 * 2. JS/TS shell strings — `execSync("psql …")` / `exec("psql …")`, and the
 *    spawn family when argv[0] is a SHELL rather than psql
 *    (`spawnSync("sh", ["-c", "psql …"])`, `/bin/bash`, …), where every argv
 *    element is read as shell text. Template literals and `+` concatenations
 *    count: `` `psql ${dsn}` ``, `"psql " + dsn` and `` `${binDir}/psql` `` are
 *    read with each runtime piece standing in as an opaque word.
 * 3. `.sh` scripts — LEXED the way the shell lexes (see `lexShellWords`), then
 *    split into commands on operators. A command is a psql invocation when some
 *    word's basename is `psql`, unless the word before it is a probe or
 *    package-manager word (`-v` — which covers `command -v psql`, the CI
 *    availability check, ~14 occurrences in `.github/workflows/` — plus
 *    `which`, `type`, `hash`, `whereis`, `install`, `apt-get`, `echo`, …). That
 *    is a DENYLIST, not an allowlist of command-position prefixes: an allowlist
 *    has to enumerate every wrapper (`docker exec "$C"`, an UNQUOTED
 *    `docker exec $C`, `sudo`, `env`, `time`, `xargs`) and silently misses the
 *    one it forgot, which is the wrong failure mode for a security guard.
 * 4. Workflow YAML — every `run:` scalar, scanned with the same shell reader.
 *    WHICH TEXT is read depends on the scalar's YAML style, and the distinction
 *    is the whole point rather than an optimisation. For a PLAIN or BLOCK scalar
 *    the raw source slice IS the shell text. For a QUOTED scalar the quoting
 *    belongs to YAML, not to the shell, so the raw slice is NOT scanned at all
 *    and the DECODED value is read instead — a double-quoted scalar can spell
 *    the command `\\x70sql` or hide it behind an escaped newline, and reading its
 *    delimiters as shell was wrong in both directions at once (a fabricated site
 *    on one spelling, silence on another). Decoded text is therefore the primary
 *    read for quoted styles, never a fallback. Both `run: |` blocks and quoted
 *    single-line `run: "psql …"`. A step `name:` that merely mentions psql is
 *    not a call site.
 *
 * The file list is a FILESYSTEM WALK from the repo root, not a hardcoded
 * roster: a psql site added in a brand-new directory fails by default. The
 * ratified `docs/**` exclusion is ROOT-relative (see ROOT_SKIP_LITERALS) —
 * reading it as a basename at every depth is what hid `tests/docs/**`, a real
 * directory of executable tests, from the scan entirely. Every OTHER root skip
 * is derived from the committed root `.gitignore` (`rootSkipNamesFromGitignore`)
 * rather than listed here, and a file the walk still reaches is either analyzed
 * or NAMED in a loud failure (`analyzeNaming`) — never silently dropped.
 *
 * ── Reading psql's option grammar ──────────────────────────────────────────
 *
 * See `argvSuppressesStartupFiles`. A membership test on the token list is
 * wrong in three directions, each confirmed against the installed binary: the
 * combined cluster `-qAtX` (which a substring match calls unprotected), an `X`
 * consumed as another option's ARGUMENT (`-FX`, `-F -X`), and a flag sitting
 * after the first positional, which `POSIXLY_CORRECT=1` discards entirely.
 *
 * ── What this guard IS, and what it is not ────────────────────────────────
 *
 * It is a REGRESSION NET for ordinary code: it makes an unprotected psql call
 * added in the normal course of work fail loudly, and it enforces the two
 * things that make `-X` actually work (a real flag, placed before the first
 * positional). It is NOT a security boundary against an author who is trying to
 * evade it — a static reader of two grammars cannot be, and pretending
 * otherwise would be the same overclaim that made earlier cuts of this file
 * wrong.
 *
 * Where it cannot read something it REFUSES TO CERTIFY rather than guessing, so
 * the failure mode is a loud message a human resolves. Ten rounds of
 * cross-model review drove that posture into the following, each verified
 * against the installed binary:
 *
 * • An expanded word is not its source spelling. `z=F; psql -${z}X` runs as
 *   `psql -FX`, where X is the field separator. Any token carrying `$`, and any
 *   argv element the AST cannot read, refuses to certify.
 * • argv position matters. Under `POSIXLY_CORRECT=1` getopt stops permuting at
 *   the first non-option, so a flag after the DSN is discarded — suppression is
 *   only credited before the first positional.
 * • psql's own option grammar decides what an `X` is: arg-taking shorts
 *   (`-FX`, `-F -X`), long options and their UNIQUE abbreviations (`--co -X`),
 *   and `--` end-of-options.
 *
 * Genuinely out of reach, with what backstops each:
 *
 * • A command word produced by EXPANSION (`$PG psql`, an alias). Lexical
 *   spellings ARE read — `p"s"ql`, `p\s\q\l`, a backslash-newline splice, a
 *   `/path/psql` — and so are `bash -c "…"`, `eval "…"`, `{ shell: true }`, and
 *   command substitutions. BACKSTOPS, one per surface: `scanBinaryIndirection`
 *   on JS, which LEXES every string literal rather than requiring it to start
 *   with psql; `scanShellIndirection` on shell/YAML, which reports a
 *   variable assigned `psql`, an `alias psql=`, and a shell function named
 *   psql; and `scanWorkflowIndirection` on YAML, which reports the bindings
 *   only a workflow can spell — `env:` at the workflow, job, or step level, a
 *   `matrix` value, and an `inputs.<name>.default`, each also through a YAML
 *   ALIAS — since those are `NAME: value`, not the `NAME=value` the shell
 *   reader looks for. A binding written through `$GITHUB_ENV` or
 *   `$GITHUB_OUTPUT` (the documented way one step hands a value to a later
 *   one) is read by the shell tripwire, which would otherwise miss it for
 *   sitting inside a quoted `echo` argument. All are TRIPWIRES — they fail
 *   loudly rather than resolving anything, and a binding needs NO flag to be
 *   reported: `env: {DB: "psql mydb"}` is the ordinary spelling.
 *   This file previously named the JS one as the backstop for both surfaces
 *   while it ran only on JS files, so `PG=psql; "$PG" …` was invisible and
 *   `alias psql="psql -F"` could turn a certified `-X` into `-F`'s value; and
 *   it claimed a backstop for the workflow surface while `env: {PSQL: psql}`
 *   plus `run: $PSQL …` produced neither a site nor a hit.
 * • Anything whose argv CARDINALITY is decided at runtime. A bare glob or brace
 *   (`-f optional/*.sql` under `nullglob`, `{a,b}.sql`) carries no `$` yet can
 *   expand to zero or many words, so `-f` may swallow the following `-X`.
 *   Suppression is refused for such a command; quoted metacharacters are inert
 *   and still certify, which is why quoting is tracked per character.
 * • A command assembled with no surviving literal at all (`execSync(build())`,
 *   a name from config or env). Nothing static can see it. BACKSTOP: none —
 *   this is the acknowledged hole, and it is why `-X` is ALSO enforced by
 *   position at every real call site rather than only by this scan.
 * • Anything outside the scanned extensions — a Makefile, a package.json
 *   script. Checked at authoring time (2026-08-03): neither exists here. A new
 *   one would be invisible; extend SCANNED_EXTENSIONS with it.
 * • A FLAGLESS psql inside a longer JS string with no commandish prefix —
 *   `execSync(cmd)` where `cmd` is `"if psql mydb; then echo ok; fi"` or
 *   `"psql mydb; echo one two three four five six seven eight"`. This is the
 *   indirection tripwire's PRECISION FLOOR, not an oversight: those strings are
 *   lexically indistinguishable from this repo's own prose — `"psql failed;
 *   retry"`, `"psql output must contain ---LOCKS--- marker"` — and every
 *   loosening tried on them turned a real string into a false positive. A
 *   flagless psql IS caught everywhere it can be read structurally (a `.sh`
 *   file, a workflow `run:` or custom `shell:` template, a short `execSync`
 *   string, an ALLOWLISTED command-string consumer); the uncovered case is
 *   specifically a long, prose-shaped literal. BACKSTOP: the site path, plus
 *   `-X` enforced by POSITION at every real call site.
 * • A command-string consumer OUTSIDE that allowlist. Knowing which argument a
 *   program executes requires knowing the program, so the reader keeps a list
 *   (`DASH_C_CONSUMERS` and its siblings) rather than a rule about `-c` — and a
 *   list is incomplete by construction. This file said "any `-c` consumer" until
 *   review demonstrated `flock -c`, `script -c`, and `tmux new-session` walking
 *   straight through it; those three are closed, and the next three are not.
 *   The claim is now the accurate one: what is on the list is read.
 * • Hypothetical gaps on surfaces this repository does NOT use, found by
 *   adversarial review rounds R28-R40 and recorded rather than closed. Each was
 *   demonstrated with a live mutant against this file; none is a miss on any
 *   call site in this tree, whose census has held 0 unprotected and 0
 *   indirections through every one of those rounds. They are the three entries in the
 *   Documented limits block below, which is their record of first resort.
 * • Deliberately adversarial spellings beyond the above. The lexer handles the
 *   ones review demonstrated, but the space is unbounded and this file does not
 *   claim to close it.
 *
 * ── Documented limits (demoted from DEFERRED.md, 2026-08-04) ───────────────
 *
 * These three were carried as `PSQL-GUARD-RECALL-RESIDUAL` in DEFERRED.md
 * until the 2026-08-04 ledger filing bar (AGENTS.md "Ledger filing bar") sent
 * them here: each is probe-backed and each worst case is conservative or
 * inert on THIS tree, which makes them documented limits of the guard rather
 * than open queue work. The archive record with the original entry body is
 * `PSQL-GUARD-RECALL-RESIDUAL` in DEFERRED-archive.md; this block is the
 * substance. Text below is the entry's, verbatim, with the live probe re-run
 * against this file on 2026-08-04 recorded beneath each.
 *
 * The `-X` class is CLOSED on this repository: this file walks the tree and
 * reports 0 unprotected psql call sites and 0 indirections, and a new site
 * fails by default. The site COUNT is deliberately not stated here: it belongs
 * to whoever last added a psql call, and three stale copies of it survived in
 * this block until 2026-08-20. Adversarial review rounds R28-R40 hardened the guard's
 * RECALL well past that — roughly 120 defects fixed, including several real
 * false safes — and closed every gap that touches a surface this repo uses.
 * Three demonstrated gaps were recorded here, all on surfaces this repo does
 * not use; item 3 has since been CLOSED (2026-08-17), leaving two live:
 *
 * 1. A cardinality-changing GLOB in the COMMAND WORD.
 *    `/opt/homebrew/Cellar/postgresql@*` + `/` + `*` + `/bin/psql -X mydb`
 *    expands to several psql paths, so the first receives another as its first
 *    positional and `-X` arrives after it — discarded under `POSIXLY_CORRECT`.
 *    Globs are refused in ARGUMENTS; the command word is not checked.
 *    PROBE 2026-08-04 (`scanSource(<that command>, "x.sh")`): one site,
 *    tokens `["-X", "mydb"]`, `suppressesStartupFiles: true`,
 *    `hasDynamicTokens: false` — certified, so the miss is live.
 * 2. A JS spawn whose `shell` option names a NON-POSIX shell.
 *    `execFileSync("psql", ["-F", "@args", "-X", "mydb"], {shell: "/opt/homebrew/bin/pwsh"})`
 *    — the both-readings check parses the joined argv as POSIX shell, while
 *    PowerShell splatting removes the empty `@args`, so `-F` consumes `-X`.
 *    PROBE 2026-08-04: one site, tokens `["-F", "@args", "-X", "mydb"]`,
 *    `suppressesStartupFiles: true` — certified under the POSIX reading.
 * 3. A QUOTED Windows path in SHELL text — CLOSED 2026-08-17. `"C:\pg\bin\
 *    psql.exe"`: inside double quotes bash keeps a backslash that precedes an
 *    ordinary character, and this lexer used to strip it (PROBE 2026-08-04:
 *    zero sites — invisible, not merely uncertified). The mixed-quoted-value
 *    repair's lexer-fidelity fix (`BL-SHELL-BINDING-MIXED-QUOTED-VALUE`, spec
 *    §3.2 fix 3) keeps the literal backslash, `basename` already splits on it,
 *    and the site now reports. Pinned by "a QUOTED backslash path in shell
 *    text is read, as of the 2026-08-17 escape-fidelity fix" in
 *    `tests/cross-cutting/psqlStartupFileSuppression.test.ts`. The JS spawn
 *    form of the same path has been read since R40.
 *
 * Why recorded rather than fixed: none is a miss on any call site in this
 * tree. The census held 0 unprotected through all thirteen
 * rounds, and each of these needs a structural change (command-word glob
 * analysis, reading the spawn options object the guard deliberately does not
 * read, and — for item 3, since carried out — a lexer change to double-quote
 * backslash handling) whose regression risk exceeded the risk it removes for a
 * Linux-only, no-container, no-Windows repository. Item 3's change arrived as
 * a by-product of the mixed-quoted-value repair, which needed bash-faithful
 * escape semantics for the assignment-binding route regardless.
 *
 * UN-DEFER TRIGGER (verbatim from the entry): this repo adding a Windows
 * runner, a container action, a non-POSIX workflow step, or any psql
 * invocation built through a glob or a `shell:` spawn option.
 *
 * ── Documented limits (mixed-quoted values, 2026-08-17) ────────────────────
 *
 * Assignment VALUES are lexer-read and immune to quote concatenation, but the
 * rule families that still read a per-line pattern are not. Each of the
 * following is a missed report, never a false certification, and each is
 * DECLARED in the deciding suite's "documented limits — quote-concatenated
 * spellings outside the assignment family" block so it cannot drift silently.
 * Design:
 * docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md.
 *
 *  - Quote-concatenated spellings of a rule KEYWORD: a mixed-quoted
 *    interpreter positional (`bash -c '$0 …' p'sql'`) and a mixed-quoted
 *    `alias`/`function` NAME. The mixed-quoted DETACHED here-string target
 *    LEFT this bullet on 2026-08-20: `lexShellWords` retains the target and
 *    `hereStringBindingLines` reads it through the same `valueBinds` the
 *    assignment family uses, so the lexer no longer drops it before words
 *    exist (BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE, closed). The ATTACHED
 *    spelling was a different family and CLOSED separately on 2026-08-21; the
 *    entry below records what remains of it. The alias case is narrower than it looks: an alias
 *    definition is an assignment-SHAPED word, so `alias p'sql'='psql -F'` IS
 *    reported through the assignment route; only an alias whose body binds
 *    another program (`alias p'sql'='pgcli -F'`) escapes.
 *  - A multiword assignment value whose psql command carries no flag-shaped
 *    token, which is the deliberate line between a command binding and prose
 *    (`MSG="psql failed to connect"`), and a quoted DIRECTORY component
 *    carrying IFS whitespace (`PG='/tmp/x y/psql'`).
 *
 *    RETIRED 2026-08-22 (`BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE`): this
 *    bullet used to cover a quoted YAML `run:` scalar too, and the reason it
 *    gave was wrong. The flag criterion never declined those — it never saw
 *    them. `scanShellIndirection` lexed the whole YAML file, so the scalar's
 *    YAML quotes were read as SHELL quotes and the body collapsed to one
 *    literal word with no assignment in it. Quoted executable scalars are now
 *    blanked out of that lex and rescanned from their decoded value, so the
 *    binding reads normally. The flag criterion is untouched.
 *  - A WRAPPER-prefixed multiword value whose psql path itself needs the
 *    word-split reading (`CMD="sudo /tmp/O'Reilly/psql -X mydb"`): the split
 *    reading requires psql at ARGV[0] and the eval reading takes the pathname
 *    quote as syntax, so both decline. Wrapper-aware splitting is out of scope
 *    in both directions.
 *  - The `${…}` operand is read for the SIX value-supplying operators in
 *    `EXPANSION_ACCEPT` (`:-` `-` `:=` `=` `:+` `+`) when the WHOLE value is one
 *    such expansion. For EVERY OTHER `${…}` interior the operand is not read at
 *    all - pattern, length, indirection, error, subscript, substring,
 *    case-modification, transformation, and any operator bash adds after this is
 *    written. Each keeps exactly today's behavior. Written as a COMPLEMENT
 *    rather than a list because spec rounds 1 and 2 each spent a finding on an
 *    operator a list had failed to name, and a list over a grammar admits one
 *    more round indefinitely.
 *    The failure direction across the complement is MIXED, and saying so is the
 *    point: substring expansion is a silent MISS (`U=xpsql; PG=${U:1}` binds
 *    `psql`, scanner 0 before and after), while `${U^}`, `${U@Q}` and `${U@U}`
 *    are conservative OVER-reports (bash binds `Psql`, `'psql'` and `PSQL`).
 *    Neither direction is changed here (BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE,
 *    closed 2026-08-20). RE-FILE TRIGGER: a live corpus instance of a psql
 *    binding through any non-value-supplying expansion operator.
 *  - A value COMPOSED inside DOUBLE QUOTES (`PG="p${U:-sql}"`) is not read: the
 *    `${…}` branch that records the candidate is unreachable inside double
 *    quotes, and that unreachability is exactly what makes `PG="p${U:-'sql'}"`
 *    CORRECT - bash binds `p'sql'` there, so the scanner's zero is right. The
 *    bare-operand case inside double quotes is therefore a declared MISS: bash
 *    binds `psql`, scanner 0 before and after. Reading it would mean deciding
 *    per-operand whether its quotes are syntax or data inside a double-quoted
 *    span, which is the boundary this design keeps structural. RE-FILE TRIGGER:
 *    a live corpus instance of a composed double-quoted expansion value.
 *  - A value that COMPOSES an accepted expansion with anything else is not read,
 *    and this is the boundary the whole-value fence buys: literal text before it
 *    (`PG=p${U:-"sql"}`), literal text after it (`PG=${U:-"p"}sql`), a nested
 *    accepted expansion supplying only PART of the value (`PG=${U:-${V:-p}sql}`),
 *    the bare-operand versions of all of those, and an accepted expansion
 *    ADJACENT TO or INSIDE a complement member (`${U#x}${V:-"psql"}`,
 *    `U=xpsql; PG=${U#${V:-'psql'}}`). Bash binds `psql` in the composition
 *    spellings and the scanner reports 0 before and after. Not a gap to close:
 *    the withdrawn substitution model DID read composition, and it substituted
 *    an accepted child inside a non-accepted parent, so `${U#${V:-'psql'}}`
 *    reported while bash binds `xpsql`. Wrongly-loud is the one direction the
 *    consequence bound does not permit, and the mechanism that reached
 *    composition is the same mechanism that produced it. RE-FILE TRIGGER: a live
 *    corpus instance of a composed expansion value, or a reading that reaches
 *    composition without substituting across a complement boundary.
 *  - The ATTACHED redirection TARGET family CLOSED on 2026-08-21
 *    (BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION). It was the sharpest
 *    limit in this list: the attached-target regex wholly CONSUMED its match,
 *    so a target containing a command SUBSTITUTION hid an executing command
 *    from BOTH scanners while bash ran it - a missed SITE, not merely a missed
 *    discovery hit. `attachedTargetEnd` delimits the target BY CONSTRUCT, the
 *    slice is handed back to this lexer so its nested bodies reach
 *    `scanShellText` exactly as every other substitution body does, and the
 *    dequoted target is retained in `targets` for the here-string reader. The
 *    two readings the filing arc REFUSED are still refused: the target's text
 *    never becomes an argv word, and the site path stays byte-identical BY
 *    CONSTRUCTION because `scanShellText` passes no `targets` array.
 *    What REMAINS a limit, and is narrower:
 *      * An UNDELIMITABLE target - a construct opened and never closed -
 *        CARRYING A SUBSTITUTION OPENER is REPORTED as an `IndirectionHit`
 *        naming it, never resolved. The report says the target is unreadable;
 *        it does not say what it would have evaluated to.
 *        Conservative-and-loud is the permitted direction.
 *      * An undelimitable target carrying NONE of the three openers stays
 *        SILENT, and that is a documented limit rather than a miss. Nothing in
 *        such a span can execute, so there is no call site to miss; and firing
 *        there would turn the live corpus's ordinary attached targets into
 *        advisories, which the consequence bound forbids in the other
 *        direction. `SUBSTITUTION_OPENER` is that firing condition. Recorded
 *        here, in the surface's own limits record, because prose narrowed
 *        elsewhere is prose a reader of this file never sees (diff round 3
 *        found the universal claim standing at seventeen sites, this one
 *        included).
 *      * That report is scoped to the surfaces production READS. Shell text
 *        embedded in a JS string is not one of them: there, `<` is a
 *        comparison, a JSX tag or a regex, and the ungated report fired on nine
 *        live template literals. RE-FILE TRIGGER: an extractor that yields the
 *        shell text out of a JS call site, which this module does not export.
 *      * A here-DOCUMENT delimiter (`<<`, `<<-`) is taken LITERALLY by bash, so
 *        its bodies are deliberately NOT collected. Measured against bash by
 *        `operator-oracle.mts`, one script per operator: those two execute
 *        nothing while the other ten expand an attached substitution.
 *  - `PG=$(x)psql`-shaped values over-report conservatively, matching the
 *    trailing-path reading of `isPsqlCommandWord`.
 *  - An ANSI-C `\U` escape ABOVE the Unicode maximum keeps its raw `\U` text
 *    rather than the byte sequence bash emits for it. The alternative is not a
 *    better reading, it is a THROW: `String.fromCodePoint` rejects the code
 *    point, and one such line would abort the walk before it inspected anything
 *    after it (diff review r1 finding 2). The same guard covers a template
 *    literal's `\u{…}` — a literal the JS engine would itself reject is simply
 *    not cookable. Neither raw reading can be psql, so both are missed reports.
 *  - A here-string overridden by a later fd-0 redirection INSIDE a substitution
 *    BODY is still reported by the line-text route:
 *    `X=$(read -r PG <<< psql < /dev/null)` reports, while bash binds the empty
 *    string. The WORD route reads that body's own redirection ledger and
 *    declines; the text route cannot, because the outer lex replaces the body
 *    with the opaque `${}` word and records no redirection within it - and that
 *    boundary is load-bearing in the other direction, since the text route
 *    exists BECAUSE it is the only reading that sees inside a body. Treating its
 *    empty ledger as "no redirection is there" would retire that contribution
 *    rather than narrow it. Conservative over-report, permitted by the bound;
 *    every FLAT spelling of the same shape declines correctly (diff review r2
 *    finding 3, class sweep). RE-FILE TRIGGER: a live corpus instance, or any
 *    arc that gives the outer lex a view of a body's redirections.
 *  - On a MULTI-COMMAND logical line the line-text route does not read
 *    redirection precedence, so `read -r PG <<< psql < /dev/null; cat x` reports
 *    though bash binds the empty string. Deliberate, and the alternative is
 *    worse: the span-wide effective redirection can belong to a DIFFERENT
 *    command there, so gating on it silences `read -r PG <<< psql; cat <<< x`,
 *    which bash really does bind. A declared over-report is permitted; an
 *    undeclared miss is not, and a narrowing that trades one for the other is
 *    the failure mode this arc measured on its own first repair. RE-FILE
 *    TRIGGER: per-command association arriving for the text route.
 *  - The four UNSET-branch spellings on an always-set special parameter -
 *    `${-:-'psql'}`, `${--'psql'}`, `${-='psql'}`, `${-:='psql'}` - report,
 *    while bash yields `$-` itself (probed `[hBc]`). Not specific to `-` and not
 *    new: it is the ratified MAY-BIND posture, identical to `${U:-psql}`
 *    reporting when `U` happens to be set, and `$`, `?` and `#` have carried it
 *    since the parameter class was widened. Reading it per-operator-per-parameter
 *    is predicate growth; the over-report arm is the permitted one (diff review
 *    r2 finding 2). RE-FILE TRIGGER: a bound that stops permitting conservative
 *    over-reports.
 *
 * The lexed-word route has exactly ONE blind spot by construction, and it is
 * closed. That sentence was FALSE from 2026-08-21 to 2026-08-25 and is true
 * again: the delimiter walk counted its own pair across other constructs, which
 * was a second blind spot by construction, and
 * `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND` closed it by making the walk
 * delegate. The one that remains is: the outer lex replaces a `$(…)`/backtick/process-substitution body
 * with the opaque `${}` word, so an assignment INSIDE such a body is invisible
 * to the outer words. `scanShellIndirection` therefore asks each nested body for
 * its own bindings and offsets them back to their physical line. The line-text
 * rules (`READ_HERE_STRING`, `githubEnvWrite`, `INTERPRETER_POSITIONAL_BINDING`,
 * `aliased`, `functionDef`) were never blind here, because the raw line carries
 * the body's characters — which is why this is a one-consumer sweep rather than
 * a family. The here-string WORD route added on 2026-08-20 is NOT a line-text
 * rule and IS blind there, for the same reason the assignment route is: the
 * outer lex retained no target for anything inside the substitution. So
 * `visitBody` passes it a `targets` array too, which is what keeps the claim
 * above true rather than letting it go stale (probe A7).
 * Left open it was a FALSE CERTIFICATION, not a miss: a body holding
 * both the binding and a literal `psql -X` certified on the literal call while
 * bash ran the expanded one first (diff review r2).
 *
 * A NON-limit worth naming, because it looked like one: a COMPOUND ARRAY value
 * (`PG=(psql)`, `PG=([0]=psql)`, `declare -a PG=(…)`) is read. `(` is the only
 * member of `OPERATOR_STARTS` that can appear INSIDE an assignment value, so the
 * lexer splits such a value into its own words, and `compoundArrayBinds` hands
 * each element back to the SAME predicate. That the retired line-text patterns
 * read these by accident — and the first cut of the lexed-word route did not —
 * is why the deciding suite pins the whole vector plus a derived cover over the
 * operator set (diff review r1 finding 1).
 *
 * ── Exemptions ─────────────────────────────────────────────────────────────
 *
 * A site may opt out with `psql-startup-files-ok: <reason>` in a comment on the
 * invocation line or the line above (`//` in JS/TS, `#` in shell/YAML). The
 * reason is mandatory — a bare marker does not exempt — and BOTH the marker and
 * its reason must sit inside an actual COMMENT. Two review probes drove that:
 * `psql … ; x="psql-startup-files-ok: unrelated value"` past an earlier cut that
 * matched the marker anywhere on the line, turning a data value into a silent
 * exemption; and a bare marker inside a CLOSED block comment, immediately
 * followed on the same line by `execFileSync("psql", …)`, past a later cut that
 * took the reason to end-of-line — letting the statement itself serve as the
 * justification. The reason is now clamped to the end of the containing comment
 * range.
 * No site in the tree uses one: `scripts/ci/supabase-local-bootstrap.sh` was the candidate (it runs psql
 * via `docker exec` inside the supabase_db container, where HOME is the
 * container's, not the runner's) and took a plain inline `-X` instead, because
 * a mounted or image-baked psqlrc is exactly as invisible there and `-X` costs
 * nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ts from "typescript";
import { parseDocument, visit, isPair, isScalar, isSeq, type Node as YamlNode } from "yaml";

export const EXEMPTION_MARKER = "psql-startup-files-ok:";

export type PsqlSiteForm = "execFileSync" | "execFile" | "spawnSync" | "spawn" | "shell";

/**
 * Stands in for an argv element the AST could not read (an identifier, a
 * spread, a call, a conditional). It is NOT dropped: `execFileSync("psql",
 * [dsn, "-X"])` recovers tokens `["-X"]` if you drop it, and the analyzer then
 * certifies a call whose `-X` sits AFTER the positional DSN — exactly the
 * POSIXLY_CORRECT defect, reintroduced through token recovery. Rendering it as
 * a positional makes the analyzer stop there, which is the conservative and
 * correct reading: the guard cannot know it is not the DSN.
 */
export const DYNAMIC_TOKEN = "<dynamic>";

export type PsqlSite = {
  /** Repo-relative, POSIX separators. */
  file: string;
  /** 1-indexed line carrying the `psql` command token. */
  line: number;
  /** Offset of the `psql` command word within the scanned text. Only meaningful
   * for shell scans, where a COMPOSED JS string has to map a position back to
   * the physical source line the characters came from — line-quantised mapping
   * put two concatenation fragments sharing one composed line on the same
   * physical line, which is not where either of them is. */
  offset: number;
  form: PsqlSiteForm;
  /** Literal argv tokens recovered; non-literal elements are dropped. */
  tokens: string[];
  /** Words before the command word in the same command (`sudo -u postgres`).
   * Lets a caller tell a real wrapper prefix from English prose. */
  precedingWords: string[];
  /** True when the site was found INSIDE a command substitution rather than at
   * the top level of the text. */
  nested: boolean;
  /** True when that substitution was spelled with BACKTICKS. Load-bearing for
   * the indirection tripwire, and only for backticks: in operator-guidance
   * prose a backtick is a markdown code span, not a shell substitution, and
   * `via \`psql "$DSN" -f <migration>\`` is documentation. `$(…)` carries no
   * such ambiguity — gating it on the outer head word hid every ordinary
   * `jq -n --arg rows "$(psql -qAt mydb)"`. */
  nestedInBacktick: boolean;
  /** True when an element could not be read statically (spread, identifier, …). */
  hasDynamicTokens: boolean;
  suppressesStartupFiles: boolean;
  exemptReason: string | null;
};

export type IndirectionHit = { file: string; line: number; text: string };

export type PsqlUsage = {
  sites: PsqlSite[];
  indirections: IndirectionHit[];
  /** Repo-relative paths the walk could not read. A non-empty list means the
   * census is INCOMPLETE and the meta-test fails — see `walk`. */
  unreadable: string[];
  filesScanned: number;
};

const SPAWN_CALLEES = new Set<PsqlSiteForm>(["execFileSync", "execFile", "spawnSync", "spawn"]);
const SHELL_CALLEES = new Set(["execSync", "exec"]);

const JS_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".mjs", ".cjs", ".js", ".jsx"];
const SHELL_EXTENSIONS = [".sh", ".bash"];
const YAML_EXTENSIONS = [".yml", ".yaml"];
const SCANNED_EXTENSIONS = [...JS_EXTENSIONS, ...SHELL_EXTENSIONS, ...YAML_EXTENSIONS];

/**
 * The guard's own two files. They hold `"psql"` literals (the binary-name
 * comparison) and dozens of psql command-line FIXTURES that are not call sites,
 * and would otherwise trip the indirection tripwire on the guard itself.
 * Excluded from indirection scanning only — both are still walked and still
 * scanned for call sites, and neither has one.
 */
const SELF = [
  "tests/cross-cutting/psqlStartupFiles/scan.ts",
  "tests/cross-cutting/psqlStartupFileSuppression.test.ts",
];

/** Directories the walk never descends into. `docs` is deliberate: spec and
 * plan prose quotes `execFileSync("psql", …)` and is not a call site. */
// `__generated__` is NOT here: `lib/admin/__generated__` and
// `lib/messages/__generated__` are TRACKED TypeScript, and the first is
// imported at runtime. Skipping them contradicted the tracked-source,
// fail-by-default contract — an unprotected call committed there was never
// read. Only genuinely untracked machinery is skipped at any depth.
const IGNORED_ANYWHERE = new Set([".git", "node_modules"]);

/**
 * Skipped only at the REPO ROOT, and DERIVED — never a hand-list.
 *
 * Matching these by basename at every depth is what hid `tests/docs/**` — five
 * real test files — from the scan entirely, and would equally hide a nested
 * `build`/`dist`/`out`. The ratified exclusion is `docs/**`, which is
 * root-relative, and it is the ONE literal that stays: it names committed prose
 * that quotes `execFileSync("psql", …)`, so no ignore file declares it.
 *
 * Everything else comes from the committed root `.gitignore` (see
 * `rootSkipNamesFromGitignore`). The hand-list version listed `.next` but not
 * the six sibling build outputs this repo's own tooling writes, so the walk fed
 * multi-MB generated bundles to the AST scan and the recursive `visit`
 * overflowed — 19 cases red, no file named, half an hour of bisect per
 * developer, and CI green throughout because a fresh checkout has no build
 * output (BL-PSQL-SCAN-NEXT-VARIANT-BUILD-DIRS). A derived cover cannot go
 * stale when a seventh build target appears; an enumeration re-opens the moment
 * someone adds one.
 */
const ROOT_SKIP_LITERALS = new Set(["docs"]);

/**
 * The root-skip names a `.gitignore` text contributes.
 *
 * ACCEPT-SET, keyed on STRUCTURE rather than spelling: a line contributes iff
 * it is a PLAIN NAME — an optional leading `/`, then one path segment carrying
 * no glob metacharacter (`*`, `?`, `[`), no `!`, no escape, no whitespace and no
 * interior `/`, then an optional trailing `/`. Comments and blank lines are
 * dropped first.
 *
 * Everything else — `*.log`, `.env.*.local`, `!keep/`, `playwright/.cache/` —
 * is REJECTED and its directory is walked exactly as before. Rejection is the
 * conservative direction by construction: the walk can only ever over-scan,
 * never silently under-scan, and an over-scanned pathological file now fails
 * LOUD with its own name (`analyzeNaming`). Widening the accept-set is a future
 * decision, not drift.
 *
 * The COMMITTED file is the only input — never `git check-ignore` — so the skip
 * set is byte-identical on every machine and in CI, and never varies with a
 * developer's global excludes.
 */
export function rootSkipNamesFromGitignore(text: string): Set<string> {
  const names = new Set<string>();
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    // Comment and blank lines need no special case: `#` is excluded from the
    // name class and the class requires at least one character, so `# comment`,
    // `#nospace` and `` all fall out of the accept-set structurally. Keeping a
    // separate comment test would be a second, drifting definition of the same
    // rule (and a local comment-handling idiom, which
    // `_metaStripCommentsSingleSource` rightly flags).
    const plainName = /^\/?([^*?[\]!/\\\s#]+)\/?$/.exec(line);
    if (plainName) names.add(plainName[1]!);
  }
  return names;
}

/**
 * `ROOT_SKIP_LITERALS` ∪ the derived set for `repoRoot`.
 *
 * An ABSENT `.gitignore` yields the empty derived set — constructed fixture
 * roots and the nested-root calls this suite makes (`tests/docs`,
 * `lib/admin/__generated__`) keep working. A PRESENT-but-unreadable one
 * propagates its error loudly: a silent fallback to a stale literal list is the
 * exact failure mode this derivation replaces.
 */
function rootSkipNames(repoRoot: string): Set<string> {
  let text: string;
  try {
    text = readFileSync(join(repoRoot, ".gitignore"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Set(ROOT_SKIP_LITERALS);
    throw error;
  }
  return new Set([...ROOT_SKIP_LITERALS, ...rootSkipNamesFromGitignore(text)]);
}

// ── flag clusters ────────────────────────────────────────────────────────

/**
 * True when `token` is a psql flag that suppresses startup-file reads: a
 * single-dash cluster containing `X` (`-X`, `-qAtX`, `-XqAt`), or the long form
 * `--no-psqlrc`.
 */
export function tokenSuppressesStartupFiles(token: string): boolean {
  if (token === "--no-psqlrc") return true;
  if (!/^-[A-Za-z]+$/.test(token)) return false;
  return token.slice(1).includes("X");
}

/** psql short options that CONSUME the next argument (`psql --help`). An `X`
 * sitting in that slot is a value, not a flag. */
const SHORT_WITH_ARG = new Set(["c", "d", "f", "v", "L", "o", "F", "P", "R", "T", "h", "p", "U"]);

/** Every long option psql accepts, so an abbreviation can be resolved. */
const ALL_LONG_OPTIONS = [
  "--command",
  "--dbname",
  "--file",
  "--list",
  "--set",
  "--variable",
  "--version",
  "--no-psqlrc",
  "--help",
  "--echo-all",
  "--echo-errors",
  "--echo-queries",
  "--echo-hidden",
  "--log-file",
  "--no-readline",
  "--output",
  "--quiet",
  "--single-step",
  "--single-line",
  "--no-align",
  "--field-separator",
  "--html",
  "--pset",
  "--record-separator",
  "--tuples-only",
  "--table-attr",
  "--expanded",
  "--field-separator-zero",
  "--record-separator-zero",
  "--host",
  "--port",
  "--username",
  "--no-password",
  "--password",
  "--csv",
];

/**
 * Resolve a long option the way getopt_long does: an exact match, or a prefix
 * that is UNAMBIGUOUS. `psql --co -X` errors "option `--co\' requires an
 * argument" and then consumes `-X` as the command — so an abbreviation that the
 * guard read as an unknown flag would certify a call that suppresses nothing.
 */
function resolveLongOption(name: string): string | null {
  if (ALL_LONG_OPTIONS.includes(name)) return name;
  const matches = ALL_LONG_OPTIONS.filter((option) => option.startsWith(name));
  return matches.length === 1 ? matches[0]! : null;
}

/** The long spellings of the same, in their separated (`--field-separator X`)
 * form. The `--opt=value` form carries its own argument and is not listed. */
const LONG_WITH_ARG = new Set([
  "--command",
  "--dbname",
  "--file",
  "--set",
  "--variable",
  "--log-file",
  "--output",
  "--field-separator",
  "--pset",
  "--record-separator",
  "--table-attr",
  "--host",
  "--port",
  "--username",
]);

/**
 * Does this argv actually suppress startup-file reads?
 *
 * A membership test on the token list is not enough — three probe-backed ways it
 * gets the answer wrong, all found in cross-model review:
 *
 * 1. **`X` consumed as another option's argument.** `psql -F` errors with
 *    "option requires an argument -- F"; `psql -FX` and `psql -F -X` both
 *    connect, because `X` IS the field separator. Neither suppresses anything.
 * 2. **`X` after `--`.** Everything past `--` is positional.
 * 3. **`-X` after the DSN, under `POSIXLY_CORRECT=1`.** GNU getopt stops
 *    permuting at the first non-option, so `psql <DSN> -X …` reads `-X` as the
 *    positional USERNAME and ignores every flag after it:
 *
 *        $ POSIXLY_CORRECT=1 psql 'postgresql://…' -X -v ON_ERROR_STOP=1 -qAt -c 'select 42'
 *        psql: warning: extra command-line argument "-v" ignored
 *        …
 *
 *    Startup files stay ENABLED. So suppression is only real when it appears
 *    before the first positional argument — which is why every call site in this
 *    repo passes its flags first and the DSN last.
 */
export function argvSuppressesStartupFiles(tokens: readonly string[]): boolean {
  /** The token an arg-taking option is about to swallow may be RUNTIME-SIZED —
   * a `...spread` that is empty at runtime is no token at all, and the option
   * then swallows whatever follows it. `["-F", ...args, "-X", "mydb"]` with an
   * empty `args` really runs `-F -X mydb`, where `-X` is the field separator.
   * Skipping over the placeholder and crediting the later `-X` was a false
   * safe, and contradicted this file's own claim that runtime-decided argv
   * cardinality is refused. */
  const swallowIsUncertain = (index: number): boolean => {
    const swallowed = tokens[index];
    return swallowed !== undefined && (swallowed === DYNAMIC_TOKEN || swallowed.includes("$"));
  };
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    // A word containing an expansion is NOT its source spelling: `-${z}X` with
    // z=F expands to `-FX`, where X is the field separator and suppresses
    // nothing (verified: `z=F; psql -${z}X --version` runs as `psql -FX`).
    // Unreadable means uncertifiable.
    if (token.includes("$") || token === DYNAMIC_TOKEN) return false;
    if (token === "--") return false; // rest is positional
    if (token.startsWith("--")) {
      const spelled = token.split("=", 1)[0]!;
      const name = resolveLongOption(spelled) ?? spelled;
      if (name === "--no-psqlrc") return true;
      if (LONG_WITH_ARG.has(name) && !token.includes("=")) {
        if (swallowIsUncertain(i + 1)) return false;
        i++; // eats the next token
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      for (const letter of token.slice(1)) {
        if (letter === "X") return true;
        if (SHORT_WITH_ARG.has(letter)) break; // rest of the cluster is its value
      }
      // A trailing arg-taking letter with nothing after it eats the next token.
      const last = token.at(-1)!;
      if (SHORT_WITH_ARG.has(last)) {
        if (swallowIsUncertain(i + 1)) return false;
        i++;
      }
      continue;
    }
    // A positional argument (DBNAME, then USERNAME). Under POSIXLY_CORRECT this
    // ends option parsing, so anything after it cannot be relied on.
    return false;
  }
  return false;
}

// ── exemption markers ────────────────────────────────────────────────────

/**
 * Where a comment starts on `line`, or -1. The marker only exempts from INSIDE a
 * comment: a review probe drove `psql … ; x="psql-startup-files-ok: unrelated
 * value"` past the guard, because a plain indexOf cannot tell a comment from a
 * string that happens to contain the marker. An exemption is a deliberate,
 * reviewable act — a data value must never grant one.
 */
/**
 * Comment-start index for EVERY line, computed with quote state carried ACROSS
 * lines. A per-line scan cannot see that a line sits inside a string opened
 * earlier, so a `#` (or `//`) on a continuation line looks like a comment and
 * grants an exemption from string data — an R3 probe did exactly that with a
 * multi-line shell string. Both grammars get the same treatment.
 */
/**
 * JS/TS comment starts, from the TypeScript SCANNER rather than a hand-rolled
 * reader. Hand-rolling repeatedly got string state wrong — a nested template
 * backtick was read as closing the outer template, and JSX text was read as
 * code, each turning `//` string data into a "comment" that granted an
 * exemption. The compiler already knows exactly where comments are; asking it
 * removes the entire class rather than the two instances review happened to
 * find.
 */
function jsCommentRangesPerLine(text: string, file: string): CommentRanges {
  const lines = text.split("\n");
  const out: CommentRanges = lines.map(() => []);
  const sourceFile = parseJs(text, file);

  const record = (pos: number, end: number): void => {
    const from = sourceFile.getLineAndCharacterOfPosition(pos);
    const to = sourceFile.getLineAndCharacterOfPosition(end);
    if (from.line === to.line) {
      out[from.line]!.push([from.character, to.character]);
      return;
    }
    out[from.line]!.push([from.character, Infinity]);
    for (let l = from.line + 1; l < to.line && l < out.length; l++) out[l]!.push([0, Infinity]);
    if (to.line < out.length) out[to.line]!.push([0, to.character]);
  };

  // Only at STATEMENT boundaries. getLeading/TrailingCommentRanges are text
  // scanners, not AST-aware: called at an arbitrary node end they will read the
  // `//` inside JSX text as a comment. Statement boundaries are genuine trivia
  // positions, and an exemption marker is by definition either on its own line
  // before a statement or trailing one.
  const seen = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (ts.isStatement(node)) {
      for (const ranges of [
        ts.getLeadingCommentRanges(text, node.getFullStart()),
        ts.getTrailingCommentRanges(text, node.getEnd()),
      ]) {
        for (const range of ranges ?? []) {
          if (seen.has(range.pos)) continue;
          seen.add(range.pos);
          record(range.pos, range.end);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

type CommentRanges = Array<Array<[number, number]>>;

function commentIndexPerLine(text: string, style: CommentStyle): CommentRanges {
  const lines = text.split("\n");
  const out: CommentRanges = [];
  let carriedQuote: string | null = null;
  let inBlockComment = false;

  for (const line of lines) {
    if (inBlockComment) {
      const close = line.indexOf("*/");
      if (close === -1) {
        out.push([[0, Infinity]]); // the whole line is inside a block comment
        continue;
      }
      inBlockComment = false;
      // Anything after the close is ordinary code; fall through and rescan it.
    }
    let quote: string | null = carriedQuote;
    let found = -1;
    for (let i = 0; i < line.length; i++) {
      const character = line[i]!;
      // JS honours a backslash escape inside single quotes; POSIX shell does not.
      if (character === "\\" && (style === "js" || quote !== "'")) {
        i++;
        continue;
      }
      if (quote !== null) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || (style === "js" && character === "`")) {
        quote = character;
        continue;
      }
      if (style === "hash") {
        if (character === "#" && (i === 0 || /\s/.test(line[i - 1]!))) {
          found = i;
          break;
        }
      } else if (character === "/" && line[i + 1] === "/") {
        found = i;
        break;
      } else if (character === "/" && line[i + 1] === "*") {
        const close = line.indexOf("*/", i + 2);
        if (close === -1) {
          found = i;
          inBlockComment = true;
          break;
        }
        // A block comment that CLOSES on this line does not make the REST of
        // the line comment-qualified; skip it and keep scanning.
        i = close + 1;
      }
    }
    // In SHELL, a single- or double-quoted string spans newlines, so the quote
    // state carries. In JS only a template literal does. Resetting shell quotes
    // at the newline let a marker in string data on the PRECEDING line grant an
    // exemption — the R3 regression test missed it by leaving a closing line in
    // between, which is why the adjacency case is now covered explicitly.
    carriedQuote = style === "hash" ? quote : quote === "`" ? "`" : null;
    out.push(found === -1 ? [] : [[found, Infinity]]);
  }
  return out;
}

type CommentStyle = "js" | "hash";

function exemptionOnLines(
  lines: readonly string[],
  lineNumber: number,
  commentAt: CommentRanges,
): string | null {
  for (const index of [lineNumber - 1, lineNumber - 2]) {
    const candidate = lines[index];
    if (candidate === undefined) continue;
    const at = candidate.indexOf(EXEMPTION_MARKER);
    if (at === -1) continue;
    // CONTAINMENT, not "after a comment started": `/* x */ const s = "// …"`
    // has a real comment on the line, and the marker is not inside it.
    const inside = (commentAt[index] ?? []).find(([from, to]) => at >= from && at < to);
    if (!inside) continue;
    // The reason must be INSIDE the comment too. Slicing to end-of-line let
    // `/* psql-startup-files-ok: */ execFileSync("psql", …)` adopt its own
    // statement as the "reason" — a bare marker exempting a live call, which is
    // exactly what requiring a reason is supposed to prevent.
    const reason = candidate
      .slice(at + EXEMPTION_MARKER.length, inside[1] === Infinity ? undefined : inside[1])
      .replace(/\*\/\s*$/, "")
      .trim();
    if (reason.length > 0) return reason;
  }
  return null;
}

// ── shell reading ────────────────────────────────────────────────────────

/**
 * ── The shell layer is a LEXER, not a line slicer ─────────────────────────
 *
 * Successive review rounds each found another way a regex over raw text
 * disagreed with what the shell actually passes to psql:
 *
 *   -F" -X"        one argv word `-F -X`, but split into two apparent options
 *   -F\ -X         same, via an escaped space
 *   -F 2>err -X    the shell REMOVES the redirection, so -F swallows -X
 *   psql -qAt \ # …   `\` + space is NOT a continuation; the next line is a
 *                     separate command that carries the -X
 *   p"s"ql, p\s\q\l   ordinary lexical spellings of the command word
 *   /opt/psql-X/bin/psql   an earlier `psql` inside the PATH
 *
 * They are one defect: the scanner was reading text where the shell reads
 * WORDS. `lexShellWords` performs the word splitting, quote removal, escape
 * processing, redirection removal and operator recognition that the shell does
 * before argv exists, and everything downstream consumes words.
 */
type ShellWord = {
  text: string;
  line: number;
  offset: number;
  /** Per character of `text`: quoted or escaped, so it cannot expand. */
  quoted: boolean[];
  /** Per character of `text`: the physical line it came from. A QUOTED word can
   * span lines, so the word's opening line is not every character's line. */
  lines: number[];
  /** Raw index in the scanned text for EACH character of `text`. Quoting and
   * escaping mean the word's characters are not contiguous with its start —
   * adding an offset measured in the quote-stripped script to the opening
   * quote's index undercounts every delimiter, which is how a `bash -c` script
   * mapped its psql onto the PRECEDING physical line and inherited an
   * exemption written for an unrelated call. */
  offsets: number[];
  operator: boolean;
  /** Arm 2. When this word's text ENDS with a `${…}` expansion drawn from the
   * six-member accept-set, the span's DEQUOTED operand and the index in `text`
   * where that span begins; `null` otherwise. A CONSUMER decides WHOLE-VALUE by
   * comparing `at` to where its own value starts, which is what keeps the
   * assignment grammar in `assignmentBindingLines` and out of the lexer, and
   * what makes composition (`PG=p${U:-"psql"}`) unreadable by construction
   * rather than by a guard. Recorded in the `${…}` branch, which is
   * structurally UNREACHABLE inside double quotes - that is the whole of why
   * `PG="${U:-'psql'}"` stays 0, where bash really does bind the literal
   * `'psql'`. */
  expandedCandidate: { operand: string; at: number } | null;
};

/** The six VALUE-SUPPLYING expansion operators, longest spelling first. This is
 * an ACCEPT-SET, and every other `${…}` interior - pattern, length,
 * indirection, error, subscript, substring, case-modification, transformation,
 * and any operator bash adds after this is written - is DEFAULT-DENIED: its
 * operand is not read at all and it keeps exactly the reading it has today.
 * Stated as a default rather than as a list on purpose. Spec rounds 1 and 2 each
 * spent a finding on an operator a list had failed to name, and a list over a
 * grammar admits one more round indefinitely; a six-member accept-set plus a
 * complement default cannot. */
const EXPANSION_ACCEPT = [":-", ":=", ":+", "-", "=", "+"];

export const OPERATOR_STARTS = new Set([";", "&", "|", "(", ")", "\n"]);

/** A file descriptor sitting in front of a redirection operator: a plain number
 * (`2>err`) or bash's dynamic form (`{fd}>err`, which assigns the fd to `fd`).
 * Neither reaches argv. */
const FD_PREFIX = /^(?:\d+|\{[A-Za-z_]\w*\})$/;

/**
 * The closing delimiter's index AND whether the span actually closed.
 *
 * The walk has always known the difference - it returns on `depth === 0` and
 * falls out of the loop otherwise - but the old return threw that away and left
 * callers to re-derive it from the character it landed on. That re-derivation is
 * wrong whenever the final character merely IS the delimiter without closing
 * anything (diff round 1, finding 1), so the fact is reported instead of inferred.
 *
 * The walk is CONSTRUCT-AWARE, and that is the newer half. It once counted only
 * its own `open`/`close` pair while tracking quotes, so a delimiter belonging to
 * a DIFFERENT construct was counted as its own: a `}` inside a nested `$()`
 * closed the enclosing `${` early, and a `)` inside a nested `${}` closed the
 * enclosing `$(` early. One direction was a SILENT MISS and the other a WRONG
 * ATTRIBUTION - the two the consequence bound forbids. It now asks each foreign
 * construct's own closer where that construct ends and resumes past it, per the
 * default-denied accept-set in `foreignConstructEnd` and `doubleQuotedEnd`.
 *
 * The quoted-`)` example below is still the right one to have in mind, and it is
 * now correct for a different reason: the quote is not special-cased here at all,
 * it is one member of that accept-set.
 * `BL-SHELL-BRACE-MATCHER-CROSS-CONSTRUCT-BLIND`.
 */
function matchBraceSpan(
  text: string,
  start: number,
  open: string,
  close: string,
): { index: number; closed: boolean } {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const character = text[i]!;
    // Escape binds tightest: the pair, whatever the next character is.
    if (character === "\\") {
      i++;
      continue;
    }
    if (character === open) {
      depth++;
      continue;
    }
    if (character === close) {
      depth--;
      if (depth === 0) return { index: i, closed: true };
      continue;
    }
    // The delegation, and the whole of the repair. A delimiter belonging to a
    // DIFFERENT construct is not ours to count: ask that construct's own closer
    // where it ends and resume past it.
    //
    // An UNCLOSED foreign construct FAILS this span rather than being skipped.
    // The permissive reading keeps counting and fabricates a call for input
    // bash refuses to parse - over-reporting a SITE is the forbidden direction,
    // and `W4k-unclosed-backtick-in-subst` is the row that catches it.
    const foreign = foreignConstructEnd(text, i);
    if (foreign !== null) {
      if (foreign === -1) return { index: text.length - 1, closed: false };
      i = foreign;
    }
  }
  return { index: text.length - 1, closed: false };
}

/**
 * The last index of the construct opening at `i`, `-1` when that construct
 * never closes, and `null` when `i` opens no construct at all.
 *
 * Context 1 of design section 3.1: the BARE alphabet, where both quote forms
 * are openers. The double-quoted alphabet is NARROWER - `'` is literal text
 * there - so it gets its own recognizer in `doubleQuotedEnd` rather than this
 * one carrying a mode flag. A flag is exactly how that difference gets lost,
 * and the sibling arc measured what it costs.
 *
 * The complement is DEFAULT-DENIED: an opener nobody listed terminates nothing
 * and is counted as ordinary text, which is precisely today's behaviour, so a
 * spelling outside the set cannot regress. That is what makes this axis
 * closable rather than an open grammar.
 *
 * Recursion terminates on length alone: every delegated span starts strictly
 * after its opener, so each level is handed a strictly shorter remainder. No
 * depth counter is needed, and one would be a bound nothing could reach.
 */
function foreignConstructEnd(text: string, i: number): number | null {
  const character = text[i]!;
  // `$$` is the PID parameter and consumes BOTH characters, so the `(` or `{`
  // after it opens NOTHING. Ahead of the `$` branches below, because the rule
  // is about the FIRST `$`. The first of THREE recognizers that need it.
  if (character === "$" && text[i + 1] === "$") return i + 1;
  // A `)` inside quotes is DATA - `$(echo ")"; psql …)` closes at the last
  // paren, not the quoted one, and treating it as the close made every later
  // invocation in the substitution invisible. POSIX single quotes carry no
  // escapes, so that span simply runs to the next `'`; an unterminated one
  // returns -1 and fails the enclosing span, which is what the declared-limit
  // pin on unclosed constructs already expects.
  if (character === "'") return text.indexOf("'", i + 1);
  if (character === '"') return doubleQuotedEnd(text, i + 1);
  if (character === "`") return closingBacktick(text, i);
  if (character === "$" && (text[i + 1] === "{" || text[i + 1] === "(")) {
    const open = text[i + 1]!;
    const span = matchBraceSpan(text, i + 1, open, open === "{" ? "}" : ")");
    return span.closed ? span.index : -1;
  }
  // PROCESS SUBSTITUTION, `<(…)` and `>(…)`. Diff review round 1 finding 1: the
  // accept-set carried `$(` and `${` and stopped there, while `lexShellWords`
  // ALREADY treats both of these as constructs that EXECUTE their body. That
  // disagreement between two lists meant to agree was a WRONG ATTRIBUTION, not
  // a missing feature: `echo ${OUT:->(echo }; psql -c 'x')}` parses, runs psql
  // once, and the walk counted the `}` inside the process substitution as the
  // enclosing `${`'s closer - reporting the call at top level with
  // `nested: false`. Probed across the R2 family, one ordinary edit from
  // `R2-bare-word`: bare-word, attached and detached all execute and all
  // mis-attributed.
  //
  // NOT parser growth. No new grammar arrives - the body is delimited by the
  // SAME `(`/`)` walk that `$(` already delegates to - and the complement stays
  // default-denied, so a spelling outside the set still cannot regress.
  //
  // Deliberately NOT added to `doubleQuotedEnd`: bash performs no process
  // substitution inside a double-quoted span, so `>(` is literal text there and
  // admitting it would import an opener the shell does not honour.
  if ((character === "<" || character === ">") && text[i + 1] === "(") {
    const span = matchBraceSpan(text, i + 1, "(", ")");
    return span.closed ? span.index : -1;
  }
  return null;
}

/**
 * The index of the quote CLOSING the double-quoted span whose body starts at
 * `from`, or `-1` when it never closes.
 *
 * Context 2 of design section 3.1, and a SEPARATE recognizer from
 * `foreignConstructEnd` on purpose. The alphabet here is narrower because
 * bash's is: `$(`, `${` and backticks stay ACTIVE inside double quotes, while
 * `'`, `$'` and `$"` are LITERAL text and open nothing. Sharing one recognizer
 * across the two contexts imports the wrong alphabet in one of them, which is
 * the defect `W2k-squote-in-dq-in-subst` exists to catch.
 */
function doubleQuotedEnd(text: string, from: number): number {
  for (let k = from; k < text.length; k++) {
    const character = text[k]!;
    if (character === "\\") {
      k++;
      continue;
    }
    if (character === '"') return k;
    if (character === "`") {
      const end = closingBacktick(text, k);
      if (end === -1) return -1;
      k = end;
      continue;
    }
    if (character === "$" && (text[k + 1] === "{" || text[k + 1] === "(")) {
      const open = text[k + 1]!;
      const span = matchBraceSpan(text, k + 1, open, open === "{" ? "}" : ")");
      if (!span.closed) return -1;
      k = span.index;
      continue;
    }
    if (character === "$" && text[k + 1] === "$") {
      k++;
      continue;
    }
  }
  return -1;
}

/** Index of the closing delimiter matching the opener at `start`. Preserved
 * verbatim for the SIX call sites that only ever wanted the index - measured by
 * `grep -n 'matchBrace(\|matchBraceEnd(' ` minus the two definitions, not
 * counted from memory; the ledger row said four and then five, and both were
 * wrong. Only `matchBraceEnd`'s single caller reads `closed`, and that asymmetry
 * is load-bearing: a repair that changed what this returns on an UNCLOSED span
 * would change six call sites' behaviour at once, and the crossing repair
 * deliberately does not. */
function matchBrace(text: string, start: number, open: string, close: string): number {
  return matchBraceSpan(text, start, open, close).index;
}

/**
 * Index of the closing delimiter for the opener at `start`, or `-1` when it
 * never closes.
 *
 * `matchBrace` answers the same question by returning the LAST index either
 * way, which cannot distinguish a span that closed on the final character from
 * one that ran out of input - and that distinction is the whole of the
 * unlexable report (design section 3, part 4). This reads the walk's OWN
 * `closed` flag rather than duplicating the brace walk or re-deriving closure
 * from the character it landed on; the latter is what diff round 1 found, and
 * it fails on every span whose last character merely IS the delimiter.
 *
 * Reading the walk's own flag is what keeps this correct now that the walk
 * DELEGATES: an unclosed foreign construct fails the enclosing span, so `closed`
 * became false on inputs where the landed-on character still equals the
 * delimiter. A re-derivation would have gone on reporting those as closed.
 */
function matchBraceEnd(text: string, start: number, open: string, close: string): number {
  const span = matchBraceSpan(text, start, open, close);
  return span.closed ? span.index : -1;
}

/**
 * Index of the backtick that CLOSES the span opened at `start`, or `-1` when it
 * never closes.
 *
 * An ESCAPED backtick does not close it. Both shipped backtick paths used a
 * bare `indexOf`, so `` `echo \` ; psql -c "x"` `` ended at the escaped
 * backtick and the remainder - including an executing psql - was attributed to
 * whatever text followed: the outcome right and the reason wrong, which is the
 * wrong-attribution direction the consequence bound forbids outright. Spec
 * section 3.1's escape-binds-tightest precedence, applied at the ONE place both
 * paths already shared a defect rather than at each of them.
 */
function closingBacktick(text: string, start: number): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text[i] === "`") return i;
  }
  return -1;
}

/** The three openers that make a span EXECUTABLE. An undelimitable attached
 *  target carrying none of them is unreadable and harmless - the live corpus
 *  holds ordinary attached targets - 58 at this HEAD, 53 at base `e5d1d723d`,
 *  derived by `corpus-family3.mts` - and not one may become an advisory, so
 *  this is the firing condition for the unlexable report, not the walk. */
const SUBSTITUTION_OPENER = /\$\(|`|\$\{/;

/** The characters that END an unquoted attached redirection target. Identical
 *  to the negated class of the character-run regex this walk replaces, so the
 *  repair changes WHERE a construct ends and never WHICH characters terminate
 *  an ordinary one. */
const ATTACHED_TARGET_TERMINATOR = /[\s;&|()<>]/;

/**
 * The end of an ATTACHED redirection target, delimited BY CONSTRUCT.
 *
 * The regex this replaces was not a target recognizer, it was a character-run
 * muncher: it neither respected construct boundaries nor reported when it could
 * not delimit one. Measured through the shipped pattern, `` >`psql -c 'x'` ``
 * consumed only ``  `psql `` and `>$(psql)` consumed only `$`, handing a
 * FRAGMENT to the outer loop which then mis-lexed it - so a repair that merely
 * re-lexed the old match would inherit both.
 *
 * Returns the index one PAST the target, and whether the walk opened a
 * construct it never closed. The accept-set is spec section 3.1's opener table,
 * keyed on STRUCTURE rather than spelling and applied RECURSIVELY at every
 * depth INCLUDING inside quotes - uniform recursion is what makes the set mean
 * inside a quoted target what it means outside one. The escape pair binds
 * TIGHTEST, ahead of every other opener. Everything outside the set terminates
 * the target by DEFAULT rather than by enumeration, so a spelling nobody listed
 * is answered already.
 */
function attachedTargetEnd(text: string, start: number): { end: number; undelimitable: boolean } {
  /** The last index of the ANSI-C span whose body starts at `from`, or -1. A
   *  `\'` does not close it. */
  const closeAnsiC = (from: number): number => {
    for (let k = from; k < text.length; k++) {
      if (text[k] === "\\") {
        k++;
        continue;
      }
      if (text[k] === "'") return k;
    }
    return -1;
  };
  /** The index of the quote closing the double-quoted span whose body starts at
   *  `from`, or -1. The accept-set again, at this depth: this is the recursion
   *  spec section 3.1 makes normative, and `${…}` is the member the shipped
   *  double-quote scanner never had. */
  const closeDoubleQuoted = (from: number): number => {
    for (let k = from; k < text.length; k++) {
      const character = text[k]!;
      if (character === "\\") {
        k++;
        continue;
      }
      if (character === '"') return k;
      const inner = substitutionOpenerEnd(k);
      if (inner === null) continue;
      if (inner === -1) return -1;
      k = inner;
    }
    return -1;
  };
  /**
   * The openers that stay ACTIVE inside a double-quoted span: command
   * substitution, parameter expansion, backticks. Nothing else.
   *
   * `'`, `$'` and `$"` are LITERAL text inside double quotes, and treating them
   * as openers made the walk run to end of chunk, call the target undelimitable
   * and then emit no advisory either - because the swallowed span carries no
   * substitution opener. Diff round 2, finding 1: a silent miss on one-edit
   * spellings, on both declared production surfaces.
   */
  const substitutionOpenerEnd = (k: number): number | null => {
    const character = text[k]!;
    // `$$` is the PID parameter and consumes BOTH characters, so the `(` or `{`
    // after it opens nothing. The head of this context, ahead of the `$`
    // branches below — the SECOND of the three recognizers that need this rule,
    // and the one spec round 3 found still missing it.
    if (character === "$" && text[k + 1] === "$") return k + 1;
    if (character === "$" && (text[k + 1] === "{" || text[k + 1] === "(")) {
      const open = text[k + 1] === "{" ? "{" : "(";
      return matchBraceEnd(text, k + 1, open, open === "{" ? "}" : ")");
    }
    if (character === "`") return closingBacktick(text, k);
    return null;
  };
  /** The last index of the construct opening at `k`; `-1` when that construct
   *  never closes; `null` when `k` opens no construct at all. Used OUTSIDE a
   *  double-quoted span, where the quote forms are openers rather than text. */
  const openerEnd = (k: number): number | null => {
    const substitution = substitutionOpenerEnd(k);
    if (substitution !== null) return substitution;
    const character = text[k]!;
    if (character === '"') return closeDoubleQuoted(k + 1);
    if (character === "$" && text[k + 1] === '"') return closeDoubleQuoted(k + 2);
    if (character === "$" && text[k + 1] === "'") return closeAnsiC(k + 2);
    if (character === "'") return text.indexOf("'", k + 1);
    return null;
  };

  let i = start;
  for (; i < text.length; i++) {
    const character = text[i]!;
    if (character === "\\") {
      // The pair, whatever the next character is - including the newline, which
      // is a CONTINUATION and keeps the target going, exactly as bash reads it.
      //
      // A dangling backslash at end of input needs NO special case here, and it
      // had one until the gate proved it dead. Consuming the pair past the end
      // leaves `end` one larger, `text.slice` clamps to the same bytes, and the
      // caller's `i = end - 1` reaches the same place - so the branch could not
      // change any observable, on any input. Probed across the whole
      // dangling-backslash-at-EOF family, every case with NO trailing newline
      // because a battery that all ends in one cannot reach this family at all:
      // identical sites and hits with the branch present, deleted, and mutated.
      // Bash keeping the backslash as a literal character of the word is real
      // and is handled where the slice is LEXED, not where it is delimited.
      i++;
      continue;
    }
    const opener = openerEnd(i);
    if (opener !== null) {
      if (opener === -1) return { end: text.length, undelimitable: true };
      i = opener;
      continue;
    }
    if (ATTACHED_TARGET_TERMINATOR.test(character)) break;
  }
  return { end: i, undelimitable: false };
}

type NestedShell = { text: string; line: number; offset: number; backtick: boolean };

/**
 * Decode one ANSI-C escape at `text[at] === "\\"` inside `$'…'`, per bash:
 * the simple table, octal \nnn (1-3 digits), hex \xHH (1-2), \uHHHH (1-4),
 * \UHHHHHHHH (1-8), control \cX. An UNKNOWN escape keeps both characters,
 * exactly as bash does.
 */
function decodeAnsiCEscape(text: string, at: number): { decoded: string; consumed: number } {
  const next = text[at + 1];
  if (next === undefined) return { decoded: "\\", consumed: 1 };
  const simple: Record<string, string> = {
    a: "\x07",
    b: "\b",
    e: "\x1b",
    E: "\x1b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    "\\": "\\",
    "'": "'",
    '"': '"',
    "?": "?",
  };
  const mapped = simple[next];
  if (mapped !== undefined) return { decoded: mapped, consumed: 2 };
  if (next >= "0" && next <= "7") {
    const octal = /^[0-7]{1,3}/.exec(text.slice(at + 1))![0];
    return { decoded: String.fromCharCode(parseInt(octal, 8) & 0xff), consumed: 1 + octal.length };
  }
  if (next === "x") {
    const hex = /^[0-9A-Fa-f]{1,2}/.exec(text.slice(at + 2));
    if (hex)
      return { decoded: String.fromCharCode(parseInt(hex[0], 16)), consumed: 2 + hex[0].length };
  }
  if (next === "u" || next === "U") {
    const width = next === "u" ? 4 : 8;
    const hex = new RegExp(`^[0-9A-Fa-f]{1,${width}}`).exec(text.slice(at + 2));
    // Only \U can exceed the Unicode maximum (\u tops out at FFFF). Bash accepts
    // such an escape and emits its own byte encoding; String.fromCodePoint
    // THROWS on it, which would abort the whole walk on one line and take every
    // later psql call in the file with it. Out of range falls through to the
    // unknown-escape return below, keeping the raw \U text - which cannot be
    // psql, so the direction is a documented limit rather than a crash.
    if (hex && parseInt(hex[0], 16) <= 0x10ffff)
      return { decoded: String.fromCodePoint(parseInt(hex[0], 16)), consumed: 2 + hex[0].length };
  }
  const control = text[at + 2];
  if (next === "c" && control !== undefined)
    return {
      decoded: String.fromCharCode(control.toUpperCase().charCodeAt(0) & 0x1f),
      consumed: 3,
    };
  return { decoded: `\\${next}`, consumed: 2 };
}

/**
 * A redirection TARGET the lexer kept, for a caller that asks for one. Targets
 * never enter the returned word array: `scanShellText` passes no array and so
 * receives a byte-identical `ShellWord[]`, which is what makes the site path
 * unchanged BY CONSTRUCTION rather than by care at each consumer. Design:
 * docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md
 * section 3.1.
 */
type RedirectionTarget = {
  /** The redirection operator this target belongs to: `<<<`, `>`, `2>`, as matched. */
  operator: string;
  /** The DEQUOTED target word: quote removal and escape processing already applied. */
  text: string;
  /** Physical line of the target, 0-based, in the text handed to this lexer. */
  line: number;
  /** Raw index of the target's first character in that text. */
  offset: number;
  /** Raw index of the REDIRECTION OPERATOR that produced this target. Position
   *  after the effective operator is necessary and NOT sufficient - a
   *  here-string on an explicit non-zero fd sits after it too - so consumers
   *  match on IDENTITY here rather than inferring ownership from ordering
   *  (diff review r3 finding 2). */
  operatorOffset: number;
  /** Arm 2, applied symmetrically at this SECOND site: the same whole-value
   * candidate an assignment value carries. Not a second mechanism - the same
   * predicate at another call site. */
  expandedCandidate: { operand: string; at: number } | null;
  /** The RAW slice when the accept-set could NOT delimit this target - a
   *  construct opened and never closed - and `null` in every other case. When
   *  it is set, `text` is meaningless and no consumer may read it: an
   *  undelimitable span is a "something here I cannot read" signal, which is
   *  what `scanShellIndirection` surfaces it as. Never set on a DETACHED
   *  target, which is built by the ordinary loop and cannot fail to delimit. */
  unlexable: string | null;
};

/**
 * A redirection the lexer CONSUMED - the attached spelling (`</dev/null`) and
 * the detached one (`< /dev/null`) alike. `targets` holds BOTH spellings now,
 * so a reading built on it sees the override an attached redirection performs;
 * this record is still what carries the operator's own fd prefix, which the
 * target does not.
 */
type Redirection = {
  /** The operator as matched, WITHOUT any fd prefix: `<<<`, `<`, `>&`. */
  operator: string;
  /** The explicit fd in front of it (`2<` -> `2`, `{v}<` -> `{v}`), else null. */
  fd: string | null;
  /** Physical line of the operator, 0-based, in the text handed to this lexer. */
  line: number;
  /** Raw index of the operator's first character in that text. */
  offset: number;
};

/** EVERY redirection operator the lexer recognises, LONGEST-FIRST: the shorter
 *  match would leave a stray `<`/`>` that reads as a second redirection and eats
 *  the following argv word. This array is the SINGLE SOURCE - the matching regex
 *  is built from it below, and the input/output partition beneath is asserted
 *  TOTAL over it - so an operator added here cannot be silently unclassified.
 *  That totality is the point: diff round 2 finding 2 was exactly a class that
 *  claimed to cover a grammar while enumerating a subset of it, and restating
 *  this list inside a test would have shipped the same shape in the repair. */
const REDIRECTION_OPERATORS = [
  "&>>",
  "&>",
  "<<<",
  "<<-",
  "<<",
  ">>",
  ">&",
  "<&",
  "<>",
  ">|",
  "<",
  ">",
] as const;

/** Built FROM the list, never restated beside it. */
const REDIRECTION_OPERATOR = new RegExp(
  `^(?:${REDIRECTION_OPERATORS.map((op) => op.replace(/[|>&<[\]{}()*+?.\\^$]/g, "\\$&")).join("|")})`,
);

/** The operators that can land on fd 0. Probed against bash, both directions:
 *  `read -r PG <<< psql > out` still binds `psql`, and
 *  `read -r PG <<< psql < /dev/null` binds the empty string. */
const INPUT_REDIRECTIONS: ReadonlySet<string> = new Set(["<", "<<", "<<-", "<<<", "<>", "<&"]);

/** The complement, DECLARED rather than inferred, so the partition can be
 *  asserted total over `REDIRECTION_OPERATORS` instead of one half being
 *  "whatever is left". A new operator classified into neither set fails the
 *  deciding suite rather than defaulting to output. */
const OUTPUT_REDIRECTIONS: ReadonlySet<string> = new Set(["&>>", "&>", ">>", ">&", ">|", ">"]);

/** The operators whose ATTACHED target bash takes LITERALLY. A here-DOCUMENT
 *  delimiter is not expanded: `cat <<"$(psql -c 'select 1')"` runs nothing and
 *  warns about an unterminated here-document, so collecting bodies out of it
 *  would be a FALSE advisory rather than a conservative one - and the
 *  consequence bound permits a conservative over-report, never a wrong one.
 *
 *  Probed against bash, all twelve operators, one script each with a fake psql
 *  on PATH: TEN execute the substitution (`&>>` `&>` `<<<` `>>` `>&` `<&` `<>`
 *  `>|` `<` `>`, including `<&`, which expands the word and only then fails the
 *  descriptor check) and exactly these two do not. DECLARED rather than
 *  inferred, so an operator added to `REDIRECTION_OPERATORS` fails the
 *  deciding suite's totality row instead of defaulting into either half. */
const LITERAL_TARGET_REDIRECTIONS: ReadonlySet<string> = new Set(["<<", "<<-"]);

export const REDIRECTION_PARTITION = {
  all: REDIRECTION_OPERATORS,
  input: INPUT_REDIRECTIONS,
  output: OUTPUT_REDIRECTIONS,
  /** The complement of the operators whose attached target is EXPANDED. */
  literalTarget: LITERAL_TARGET_REDIRECTIONS,
} as const;

/**
 * The redirection in EFFECT on stdin across the physical lines `from..to`: the
 * LAST input redirection carrying no fd prefix or an explicit `0`.
 *
 * LAST, because the shell applies redirections left to right and the final one
 * on a descriptor wins - probed in bash: `read -r PG <<< psql <<< notpsql` binds
 * `notpsql`, and `read -r PG <<< psql < /dev/null` binds the empty string. An
 * fd prefix takes it off stdin entirely: `2<` opens fd 2 and bash's dynamic
 * `{v}<` assigns a FRESH descriptor, so `read -r PG <<< psql 2< /dev/null` still
 * binds `psql`.
 *
 * The caller is responsible for the COMMAND boundary; this reads a span of
 * physical lines and nothing else.
 */
function effectiveStdin(redirections: Redirection[], from: number, to: number): Redirection | null {
  let effective: Redirection | null = null;
  for (const redirection of redirections) {
    if (redirection.line < from || redirection.line > to) continue;
    if (!INPUT_REDIRECTIONS.has(redirection.operator)) continue;
    if (redirection.fd !== null && redirection.fd !== "0") continue;
    if (effective === null || redirection.offset > effective.offset) effective = redirection;
  }
  return effective;
}

/**
 * The `<<<` the shell actually hands to `read` on the logical line `from..to`,
 * or `null` when no here-string reading may attribute a binding there.
 *
 * This is the WORD route's gate. Its two conditions are the here-string
 * family's attribution rule, and the LINE-TEXT route enforces the same two - but
 * scoped to its own command SEGMENT rather than through this function, for a
 * reason worth stating because the obvious sharing is wrong. Round 1's F2 and
 * round 2's F3 were each repaired in the word route alone, so the identical
 * mis-attributions survived in the text route - a route, not a file, and
 * therefore the "same defect, different site" the class-sweep rule refuses as a
 * deferral. Repairing the text route by calling THIS function then produced a
 * third defect: on a span carrying two commands the span-wide effective
 * redirection can belong to the OTHER command, so gating the text route on it
 * silenced `read -r PG <<< psql; cat <<< notpsql`, which bash really does bind.
 * The text route therefore bounds its own REACH to the `read`'s command segment
 * and consults precedence only where the span is one command. The two readings
 * still cannot disagree about WHICH target binds; they reach that agreement by
 * different instruments because they see different things - the lexer's operator
 * words here, where a quoted `;` is data, and raw line text there, which is the
 * only reading that sees inside a `$(…)` body.
 *
 * Two conditions, both about attribution rather than about value:
 *  - ONE COMMAND on the span, read from the LEXER's own operator words rather
 *    than from a second grammar over the text, so a quoted `;` is data here
 *    exactly as it is to the shell.
 *  - The EFFECTIVE final stdin redirection is a `<<<`. Anything else on fd 0
 *    replaces the here-string outright.
 */
function effectiveHereString(
  words: ShellWord[],
  redirections: Redirection[],
  from: number,
  to: number,
): Redirection | null {
  const separated = words.some(
    (word) => word.operator && word.text !== "\n" && word.line >= from && word.line <= to,
  );
  if (separated) return null;
  const effective = effectiveStdin(redirections, from, to);
  return effective !== null && effective.operator === "<<<" ? effective : null;
}

function lexShellWords(
  text: string,
  nested: NestedShell[] = [],
  targets: RedirectionTarget[] = [],
  redirections: Redirection[] = [],
  braceOperand = false,
): ShellWord[] {
  const words: ShellWord[] = [];
  let buffer = "";
  let bufferOffsets: number[] = [];
  /** Per character: was it quoted or escaped? A glob metacharacter only expands
   * when it is BARE, so `-c "select * from t"` must stay an ordinary token
   * while `-f optional/*.sql` must not be certified. */
  let bufferQuoted: boolean[] = [];
  let bufferLines: number[] = [];
  let started = false;
  let startLine = 0;
  let startOffset = 0;
  let line = 0;
  /** Redirections and their targets never reach argv. A DETACHED target is
   * still BUILT by the ordinary loop and is handed to `targets` at flush
   * instead of to `words`, so it carries this lexer's own quote removal,
   * ANSI-C decoding and escape handling for free - there is no second
   * dequoting path that can drift from this one, which is the defect shape the
   * 2026-08-17 arc retired when it deleted the per-delimiter pattern family.
   * Holds the matched OPERATOR while a target is pending, null otherwise. */
  let pendingTarget: string | null = null;
  let pendingTargetOffset = -1;
  /** Arm 2: the accepted `${…}` span most recently appended to `buffer`, with
   * the buffer positions it occupies. At flush it becomes the word's
   * `expandedCandidate` only if it still runs to the END of the buffer, which
   * is how literal text AFTER the span (`PG=${U:-"p"}sql`) disqualifies it. */
  let pendingCandidate: { operand: string; at: number; end: number } | null = null;

  const flush = (): void => {
    if (started) {
      const expandedCandidate =
        pendingCandidate !== null && pendingCandidate.end === buffer.length
          ? { operand: pendingCandidate.operand, at: pendingCandidate.at }
          : null;
      if (pendingTarget === null)
        words.push({
          text: buffer,
          line: startLine,
          offset: startOffset,
          offsets: bufferOffsets,
          quoted: bufferQuoted,
          lines: bufferLines,
          operator: false,
          expandedCandidate,
        });
      else
        targets.push({
          operator: pendingTarget,
          text: buffer,
          line: startLine,
          offset: startOffset,
          operatorOffset: pendingTargetOffset,
          expandedCandidate,
          unlexable: null,
        });
      pendingTarget = null;
      pendingTargetOffset = -1;
      pendingCandidate = null;
    }
    buffer = "";
    bufferOffsets = [];
    bufferQuoted = [];
    bufferLines = [];
    started = false;
  };
  const begin = (index: number): void => {
    if (!started) {
      started = true;
      startLine = line;
      startOffset = index;
      buffer = "";
      bufferOffsets = [];
      bufferQuoted = [];
      bufferLines = [];
    }
  };
  /**
   * Append a RUN of source text, advancing `line` PER CHARACTER. Every bulk
   * append goes through this: adding the newline count AFTERWARDS stamped a
   * whole multiline body with its opening line, so a psql on a later line
   * inherited a marker written above the command. One helper means no branch
   * can get it wrong — double quotes, single quotes and `${…}` alike.
   */
  const appendRun = (piece: string, at: number, quoted: boolean): void => {
    for (let k = 0; k < piece.length; k++) {
      append(piece[k]!, at + k, quoted);
      if (piece[k] === "\n") line++;
    }
  };
  /** Append to the current word, recording where each character came from and
   * whether the shell had already removed its special meaning. */
  const append = (piece: string, at: number, quoted = false): void => {
    buffer += piece;
    for (let k = 0; k < piece.length; k++) {
      bufferOffsets.push(at);
      bufferQuoted.push(quoted);
      bufferLines.push(line);
    }
  };

  for (let i = 0; i < text.length; i++) {
    const character = text[i]!;

    if (character === "\\") {
      const next = text[i + 1];
      if (next === "\n") {
        // A backslash IMMEDIATELY followed by the newline is a continuation:
        // the word (if any) keeps going. Whitespace in between is not.
        line++;
        i++;
        continue;
      }
      if (next !== undefined) {
        begin(i);
        append(next, i + 1, true); // a backslash removes the next char's meaning
        i++;
        continue;
      }
      // A dangling backslash at end of input escapes NOTHING, so bash keeps it
      // as a literal character of the word (`PG='psql'\` at EOF binds `psql\`).
      // Dropping it lexed the word as bare `psql` - a site for a command that is
      // not psql, and (post word-route) a binding the shell never makes.
      begin(i);
      append("\\", i, true);
      continue;
    }

    // `$$` is the PID parameter and consumes BOTH characters. Placed AHEAD of
    // every other `$` branch in this context, so the second `$` can never be
    // read as opening `${`, `$(`, `$((`, `$'` or `$"`. One guard rather than a
    // patch at each of those five branches: the rule is about the FIRST `$`,
    // and a per-branch fix would have to be repeated at each new branch anyone
    // adds. Spec review round 4.
    if (character === "$" && text[i + 1] === "$") {
      begin(i);
      append("$", i);
      append("$", i + 1);
      i++;
      continue;
    }
    // `$(...)`, `` `...` ``, `<(...)` and `>(...)` all EXECUTE their body, so
    // the body is scanned as shell text in its own right. `${...}` is an
    // expansion, not execution: it is consumed whole so brace-protected
    // whitespace cannot split a redirection target into a phantom argv word.
    if (character === "$" && text[i + 1] === "{") {
      begin(i);
      const close = matchBrace(text, i + 1, "{", "}");
      const slice = text.slice(i, close + 1);
      // …but the expansion's OPERAND executes: `${RESULT:-$(psql …)}` runs psql
      // whenever RESULT is unset, and the same holds for every default /
      // assign / alternate / error form (`:-` `-` `:=` `=` `:+` `+` `:?` `?`,
      // and the pattern operands of `#` `%` `/`). Consuming the expansion whole
      // made all of them invisible. Re-lex the body so nested substitutions are
      // still collected — the expansion itself stays ONE opaque word, which is
      // the property the whole-consumption exists to preserve.
      //
      // `close` is now the delimiter BASH would pick: the walk delegates to any
      // construct it crosses, so a `}` inside a nested `$()` no longer ends this
      // expansion early. The slice therefore covers the whole expansion, and the
      // re-lex below sees the operand entire rather than a prefix of it.
      const inner: NestedShell[] = [];
      lexShellWords(text.slice(i + 2, close), inner);
      for (const entry of inner)
        nested.push({
          text: entry.text,
          line: line + entry.line,
          offset: i + 2 + entry.offset,
          backtick: entry.backtick,
        });
      const spanAt = buffer.length;
      appendRun(slice, i, false);
      // Arm 2. The expansion still becomes ONE opaque word whose text is the
      // verbatim slice - resolved-scope row 4, and the property that stops
      // brace-protected whitespace from splitting a redirection target into a
      // phantom argv word. What is added is a DECISION recorded alongside it.
      // Deciding it HERE rather than over the word's text is load-bearing: this
      // branch is unreachable inside double quotes, where the operand's quote
      // characters are literal pathname data, so E5 needs no guard clause.
      const operand = acceptedExpansionOperand(slice);
      pendingCandidate = operand === null ? null : { operand, at: spanAt, end: buffer.length };
      i = close;
      continue;
    }
    // `$((` is ARITHMETIC and is NOT a command substitution - matching the `$(`
    // prefix reported a resolved site for a command bash never runs (diff round
    // 3). It contributes no body of its OWN, but its interior stays a LIVE
    // lexing context, because bash really does execute a substitution nested
    // inside arithmetic: suppressing the whole span would swap a false site for
    // a silent miss.
    if (character === "$" && text[i + 1] === "(" && text[i + 2] === "(") {
      const close = matchBrace(text, i + 1, "(", ")");
      const inner: NestedShell[] = [];
      lexShellWords(text.slice(i + 3, Math.max(i + 3, close - 1)), inner);
      for (const entry of inner)
        nested.push({
          text: entry.text,
          line: line + entry.line,
          offset: i + 3 + entry.offset,
          backtick: entry.backtick,
        });
      line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
      append("${}", i);
      i = close;
      continue;
    }
    if (
      (character === "$" && text[i + 1] === "(") ||
      character === "`" ||
      ((character === "<" || character === ">") && text[i + 1] === "(")
    ) {
      const isBacktick = character === "`";
      const open = isBacktick ? i : i + 1;
      // ESCAPE-AWARE, through the one shared closer: `\`` is a literal backtick
      // inside a substitution and does not end it, so a bare `indexOf` ended
      // the span early and handed the remainder to top-level text.
      const backtickClose = isBacktick ? closingBacktick(text, i) : -1;
      const close = isBacktick
        ? backtickClose === -1
          ? text.length
          : backtickClose
        : matchBrace(text, open, "(", ")");
      nested.push({
        text: text.slice(open + 1, close),
        line,
        offset: open + 1,
        backtick: isBacktick,
      });
      line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
      // The substitution stands in as an opaque word so surrounding argv is
      // still read correctly.
      begin(i);
      append("${}", i);
      i = close;
      continue;
    }

    // ANSI-C quoting `$'…'` DECODES its escapes (\n, \163, \x70, …) and `\'`
    // does NOT close the string; feeding it through the plain single-quote
    // branch read the raw escape text, so $'p\163ql' was never psql. Locale
    // quoting `$"…"` keeps double-quote semantics: skip the `$`, let the
    // double-quote branch run.
    if (character === "$" && text[i + 1] === "'") {
      // Find the closing quote FIRST, honoring \' escapes. An UNTERMINATED
      // ANSI-C string is a shell syntax error that runs nothing (spec 6.4), so
      // it keeps the old undecoded reading instead of decoding a fragment.
      let close = -1;
      for (let k = i + 2; k < text.length; k++) {
        if (text[k] === "\\") {
          k++;
          continue;
        }
        if (text[k] === "'") {
          close = k;
          break;
        }
      }
      begin(i);
      if (close === -1) {
        appendRun(text.slice(i + 2), i + 2, true);
        i = text.length;
        continue;
      }
      let k = i + 2;
      while (k < close) {
        if (text[k] === "\\") {
          const { decoded, consumed } = decodeAnsiCEscape(text, k);
          // append, NOT appendRun: a DECODED "\n" is data, not a physical line -
          // appendRun's per-character line counting is for source text only.
          append(decoded, k, true);
          k += consumed;
          continue;
        }
        appendRun(text[k]!, k, true); // physical chars (incl. a literal newline) count lines
        k++;
      }
      i = close;
      continue;
    }
    if (character === "$" && text[i + 1] === '"') {
      continue; // the quote itself is handled on the next iteration
    }

    if (character === "'") {
      begin(i);
      const close = text.indexOf("'", i + 1);
      const body = close === -1 ? text.slice(i + 1) : text.slice(i + 1, close);
      appendRun(body, i + 1, true);
      i = close === -1 ? text.length : close;
      continue;
    }

    if (character === '"') {
      begin(i);
      i++;
      for (; i < text.length && text[i] !== '"'; i++) {
        if (text[i] === "\\" && text[i + 1] !== undefined) {
          const escaped = text[i + 1]!;
          if (escaped === "\n") {
            // Bash REMOVES a backslash-newline pair inside double quotes
            // outright (line continuation), so `"/opt/pg/\` + newline + `psql"`
            // is the single word /opt/pg/psql. Appending the newline split the
            // value the shell glues together.
            line++;
            i++;
            continue;
          }
          if (escaped === "$" || escaped === "`" || escaped === '"' || escaped === "\\") {
            append(escaped, i + 1, true); // the backslash removes its meaning
            i++;
            continue;
          }
          // Before any other character the backslash is LITERAL and both
          // survive: "p\sql" is p-backslash-sql, never psql.
          append("\\", i, true);
          continue;
        }
        // `$$` binds first inside double quotes too, for the same reason.
        if (text[i] === "$" && text[i + 1] === "$") {
          append("$", i, true);
          append("$", i + 1, true);
          i++;
          continue;
        }
        // Arithmetic first, for the reason above: `$((` only PREFIXES `$(`.
        if (text[i] === "$" && text[i + 1] === "(" && text[i + 2] === "(") {
          const close = matchBrace(text, i + 1, "(", ")");
          const inner: NestedShell[] = [];
          lexShellWords(text.slice(i + 3, Math.max(i + 3, close - 1)), inner);
          for (const entry of inner)
            nested.push({
              text: entry.text,
              line: line + entry.line,
              offset: i + 3 + entry.offset,
              backtick: entry.backtick,
            });
          line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
          append("${}", i);
          i = close;
          continue;
        }
        // `"$(psql …)"` and "`psql …`" still EXECUTE inside double quotes.
        if (text[i] === "$" && text[i + 1] === "(") {
          const close = matchBrace(text, i + 1, "(", ")");
          nested.push({ text: text.slice(i + 2, close), line, offset: i + 2, backtick: false });
          // A MULTILINE substitution consumes physical lines; not counting them
          // reported later invocations one line early, which let them inherit a
          // marker comment written for something else.
          line += (text.slice(i, close + 1).match(/\n/g) ?? []).length;
          append("${}", i);
          i = close;
          continue;
        }
        if (text[i] === "`") {
          const close = closingBacktick(text, i);
          const end = close === -1 ? text.length : close;
          nested.push({ text: text.slice(i + 1, end), line, offset: i + 1, backtick: true });
          line += (text.slice(i, end + 1).match(/\n/g) ?? []).length;
          append("${}", i);
          i = end;
          continue;
        }
        // Append with the CURRENT line, then advance: the newline belongs to
        // the line it ends, and the next character starts the new one.
        append(text[i]!, i, true); // inside double quotes, globs do not expand
        if (text[i] === "\n") line++;
      }
      continue;
    }

    if (character === "#" && !started) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end - 1;
      continue;
    }

    if (character === "\n") {
      flush();
      words.push({
        text: "\n",
        line,
        offset: i,
        offsets: [i],
        quoted: [true],
        lines: [line],
        operator: true,
        expandedCandidate: null,
      });
      line++;
      continue;
    }

    if (/\s/.test(character)) {
      // Inside a `${…}` OPERAND bash performs no word splitting and no operator
      // parsing, so whitespace there is ordinary literal text. Keeping it means
      // a multiword operand keeps its OWN separators - `${U:-'psql' -X}` yields
      // the candidate `psql -X`, not a normalized join - so `valueBinds` reaches
      // its multiword branch with the string bash would really bind.
      if (braceOperand) {
        begin(i);
        append(character, i);
        if (character === "\n") line++;
        continue;
      }
      flush();
      continue;
    }

    // Redirections: an optional fd, the operator, and an optionally ATTACHED
    // target. The shell strips all of it, so neither reaches argv.
    //
    // `<` and `>` are METACHARACTERS: they terminate whatever word is being
    // accumulated, they do not join it. Gating this branch on "no word in
    // progress" made `psql -F>/dev/null -X mydb` read as the single token
    // `-F>/dev/null` followed by a standalone `-X` — a FALSE SAFE, since bash
    // removes the redirection and psql really receives `-F -X mydb`, where
    // `-X` is the field separator.
    if (
      !braceOperand &&
      (!started || FD_PREFIX.test(buffer) || character === "<" || character === ">")
    ) {
      // Longest-first ordering lives in `REDIRECTION_OPERATORS`, which this
      // pattern is BUILT from rather than restating.
      const redirection = REDIRECTION_OPERATOR.exec(text.slice(i));
      if (redirection && (character === "<" || character === ">" || character === "&")) {
        const isBackgroundAmp = character === "&" && text[i + 1] !== ">";
        if (!isBackgroundAmp) {
          // A pending FD buffer belongs to this redirection (`2>err`, and
          // bash's dynamic `{fd}>err`), not to argv — discard it rather than
          // emitting it as a token. Missing `{fd}` was a FALSE SAFE: bash
          // removes the whole redirection, so `psql -F {fd}>/dev/null -X mydb`
          // really runs as `-F -X mydb`, where `-X` is the field separator and
          // suppresses nothing — while the scanner consumed the phantom word as
          // `-F`'s value and certified the `-X` behind it.
          // Recorded BEFORE the buffer is cleared, because the fd prefix is
          // the buffer. Both spellings are recorded here, and both now emit a
          // target as well - the attached one through `attachedTargetEnd`. This
          // ledger is still what carries the fd PREFIX, which the target does
          // not, and a reading that cannot see it reports a binding the shell
          // has already overridden.
          redirections.push({
            operator: redirection[0],
            fd: FD_PREFIX.test(buffer) ? buffer : null,
            line,
            offset: i,
          });
          if (!FD_PREFIX.test(buffer)) flush();
          buffer = "";
          bufferOffsets = [];
          started = false;
          i += redirection[0].length - 1;
          // An attached target follows immediately; otherwise the next word is
          // the target and is built by the ordinary loop.
          //
          // The attached spelling is DELIMITED BY CONSTRUCT (design section 3),
          // then handed to this same lexer so that dequoting, ANSI-C decoding,
          // escape handling and nested-body collection all come from ONE
          // implementation rather than a second grammar beside it. The bodies
          // are re-anchored into the OUTER array exactly as the `${…}` branch
          // does; the target's own text goes to `targets` and never to `words`,
          // which is what keeps the site path byte-identical BY CONSTRUCTION -
          // `scanShellText` passes no `targets` array and so cannot see it,
          // while `scanShellIndirection` does. Ledger:
          // BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION.
          const targetStart = i + 1;
          const { end, undelimitable } = attachedTargetEnd(text, targetStart);
          if (end > targetStart) {
            const slice = text.slice(targetStart, end);
            const operatorOffset = targetStart - redirection[0].length;
            if (undelimitable) {
              // A construct opened and never closed. Bash reads the rest of the
              // input as part of that word and then fails on the unexpected
              // EOF, so nothing in it runs and collecting bodies from it would
              // report a command the shell never executes. The slice is
              // RETAINED for the surfaced report and nothing else.
              targets.push({
                operator: redirection[0],
                text: "",
                line,
                offset: targetStart,
                operatorOffset,
                expandedCandidate: null,
                unlexable: slice,
              });
            } else {
              const inner: NestedShell[] = [];
              const innerWords = lexShellWords(slice, inner);
              // A here-DOCUMENT delimiter is not expanded, so its bodies go
              // nowhere: reporting them would be the wrong direction, not the
              // conservative one. Narrowed over a DECLARED closed set rather
              // than by a per-operator predicate.
              if (!LITERAL_TARGET_REDIRECTIONS.has(redirection[0]))
                for (const entry of inner)
                  nested.push({
                    text: entry.text,
                    line: line + entry.line,
                    offset: targetStart + entry.offset,
                    backtick: entry.backtick,
                  });
              targets.push({
                operator: redirection[0],
                text: innerWords.map((word) => word.text).join(""),
                line,
                offset: targetStart,
                operatorOffset,
                // Only a target that lexed to exactly ONE word can carry a
                // whole-value candidate; anything else is a composition and
                // `expandedCandidate` is a claim about a whole value.
                expandedCandidate:
                  innerWords.length === 1 ? (innerWords[0]?.expandedCandidate ?? null) : null,
                unlexable: null,
              });
            }
            line += (slice.match(/\n/g) ?? []).length;
            i = end - 1;
          } else {
            pendingTarget = redirection[0];
            pendingTargetOffset = i - (redirection[0].length - 1);
          }
          continue;
        }
      }
    }

    if (OPERATOR_STARTS.has(character) && !braceOperand) {
      flush();
      const two = text.slice(i, i + 2);
      const operator = two === "&&" || two === "||" ? two : character;
      words.push({
        text: operator,
        line,
        offset: i,
        offsets: [...operator].map((_, k) => i + k),
        quoted: [...operator].map(() => true),
        lines: [...operator].map(() => line),
        operator: true,
        expandedCandidate: null,
      });
      i += operator.length - 1;
      continue;
    }

    begin(i);
    append(character, i);
  }
  flush();
  return words;
}

/**
 * The DEQUOTED default operand of a `${…}` span that is, in its ENTIRETY, one
 * expansion drawn from `EXPANSION_ACCEPT` - and `null` for every other interior,
 * by default rather than by enumeration. Arm 2 of
 * docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md
 * (ledger BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE).
 *
 * The operand is dequoted by `lexShellWords` ITSELF, in brace-operand mode, so
 * mixed quoting, ANSI-C `$'…'`, escapes and a nested accepted `${…}` all come
 * free: there is no second grammar to keep in step with the first.
 *
 * WHOLE-VALUE ONLY, and the narrowness is the point. A wider substitution model
 * was tried and withdrawn because it read an accepted child inside a
 * NON-accepted parent - `U=xpsql; PG=${U#${V:-'psql'}}` yielded the candidate
 * `${U#psql}` and REPORTED, while bash binds `xpsql`. Conservative-and-silent is
 * a documented limit; wrongly-loud is not, and refusing to look inside a
 * complement member removes the mechanism that generated it rather than adding
 * care around it.
 */
function acceptedExpansionOperand(span: string): string | null {
  if (!span.startsWith("${") || !span.endsWith("}")) return null;
  // An UNTERMINATED expansion is a shell syntax error, so the file runs nothing
  // and binds nothing. `matchBrace` returns the LAST index when it finds no
  // close, so the boundary is checked here rather than assumed.
  if (matchBrace(span, 1, "{", "}") !== span.length - 1) return null;
  const interior = span.slice(2, span.length - 1);
  // The PARAMETER, not just an identifier. A positional (`${1:-word}`) and the
  // special parameters take the same value-supplying operators an identifier
  // does, and bash binds their operands identically, so an identifier-only
  // reading default-denied spellings the accept-set had already promised.
  // Widening the NAME does not widen the accept-set: `${#psql}` and `${!psql}`
  // still find no accepted operator after the name and are still default-denied.
  // The class is bash's special parameters IN FULL. Omitting `-` was a defect
  // INSIDE the accept-set rather than a narrower promise: it default-denied all
  // six operators on that one spelling, at both consumers, and `${-:+'psql'}`
  // and `${-+'psql'}` really do yield `psql` (probed). The four unset-branch
  // spellings yield `$-` itself, and reading their operand is the same
  // ratified MAY-BIND over-report `${U:-psql}` already carries when `U` is set
  // (spec §7.4) - so `-` needs no operator-by-operator treatment, which is the
  // predicate growth the standing repair direction forbids. `0` and `_` were
  // never missing: `\d+` and `[A-Za-z_]\w*` already spell them.
  const name = /^(?:[A-Za-z_]\w*(?:\[[^\]]*\])?|\d+|[@*#?$!-])/.exec(interior);
  if (!name) return null;
  const rest = interior.slice(name[0].length);
  const operator = EXPANSION_ACCEPT.find((accepted) => rest.startsWith(accepted));
  if (operator === undefined) return null;
  // Trimmed on the DEFAULT-IFS edges, exactly as `assignmentBindingLines`
  // already trims an assignment value, and for the same shell reason: an
  // unquoted expansion word-splits at its use site, so `PG=${U:- psql -X}` runs
  // psql there. It is also LOAD-BEARING for an equivalence claim in the
  // mutation ledger. Every other caller of `valueBinds` trims, and the split
  // reading depends on it: with a leading empty part at argv[0] the reading
  // silently declines a wrapper-quoted psql the EVAL reading cannot see either.
  // Probed on this branch: without this trim,
  // `PG=${U:-" /tmp/O'Reilly/psql -X"}` reports 1 while the
  // `filter(part => part.length > 0)` mutant reports 0 - a separating input, so
  // the candidate route had broken an argument that held before it existed.
  const rawOperand = rest.slice(operator.length);
  const operand = (lexShellWords(rawOperand, [], [], [], true)[0]?.text ?? "").replace(
    /^[ \t\n]+|[ \t\n]+$/g,
    "",
  );
  // A NESTED accepted expansion resolves through the SAME whole-value rule, and
  // it is decided on the RAW operand rather than on the dequoted result. Quote
  // removal turns `'${V:-psql}'` into text that LOOKS like an expansion and is
  // not one - bash binds that literal string - so recursing on the dequoted text
  // reinterprets DATA as SYNTAX. That is the same defect the withdrawn
  // substitution model had, one level down, and reading the raw slice removes
  // the mechanism rather than guarding its output.
  // The recursion needs no depth counter: an operand is the text INSIDE its own
  // braces minus the name and the operator, so it is strictly shorter than the
  // span it came from and the descent terminates on length alone. A counter
  // here would be a bound nothing can reach, which is a mutation site that
  // earns nothing and a number a later reader would have to justify.
  return acceptedExpansionOperand(rawOperand.replace(/^[ \t\n]+|[ \t\n]+$/g, "")) ?? operand;
}

/**
 * A word's expansion candidate, but only when the accepted span covers the WHOLE
 * of the value beginning at `valueAt` - nothing but IFS whitespace before it,
 * and, by construction of `expandedCandidate`, nothing at all after it.
 *
 * Keeping the whole-value TEST here rather than in the lexer is what lets the
 * lexer stay ignorant of the assignment grammar while `PG=p${U:-"psql"}` is
 * still unreadable: the span is recorded, and the consumer sees it does not
 * start where its value starts.
 */
function wholeValueCandidate(
  word: { text: string; expandedCandidate: { operand: string; at: number } | null },
  valueAt: number,
): string | null {
  const span = word.expandedCandidate;
  if (span === null || span.at < valueAt) return null;
  return /^[ \t\n]*$/.test(word.text.slice(valueAt, span.at)) ? span.operand : null;
}

/** The command word, with any directory prefix removed. */
function basename(word: string): string {
  // A BACKSLASH separates a Windows path, and splitting on `/` alone made
  // `C:\pg\bin\psql.exe` invisible to every recognizer built on this helper.
  // In shell text a backslash is also an escape, but a word that has already
  // been quote-stripped carries the literal separator, and `p\s\q\l` — the
  // escaped spelling this file has read since R3 — has no separator character
  // between its parts, so taking the last of either is safe for both.
  const at = Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\"));
  return word.slice(at + 1);
}

/**
 * True when a word IS the psql command: the plain name, a path ending `/psql`,
 * or an EXPANSION carrying the directory — `"${PSQL_DIR}psql"` is the ordinary
 * trailing-slash pattern and runs psql, but its basename is the whole word, so
 * an exact-name test missed it and neither tripwire fired. The boundary before
 * `psql` must be a separator (`/`, `}`, `)`) so `$HOME/notpsql` stays out.
 */
/** `psql`, `psql.exe`, `PSQL.EXE`, `Psql` — Windows filenames are
 * case-insensitive and carry an extension. Ordinary names, not adversarial
 * spellings, and `notpsql` / `psqlodbc` / `mypsql.exe` still are not psql. */
function isPsqlName(name: string): boolean {
  return /^psql(?:\.exe)?$/i.test(name);
}

function isPsqlCommandWord(word: string): boolean {
  if (isPsqlName(basename(word))) return true;
  // `"${PSQL_DIR}psql"` — an expansion carrying the directory.
  if (word.includes("$") && /(?:\}|\))psql(?:\.exe)?$/i.test(word)) return true;
  // `"${PSQL:-psql}"` used DIRECTLY as the command word: the whole word is one
  // expansion whose default supplies the command name.
  return /^\$\{[^}]*\bpsql\b[^}]*\}$/i.test(word);
}

/** argv[0] values whose FLAGS may also deny (`command -v psql`). */
const PROBE_COMMANDS = new Set(["command", "which", "type", "hash", "whereis", "apt-get", "apt"]);

/** Preceding words that make `psql` an argument rather than the command:
 * availability probes and package tooling. Only honored at command position —
 * see the call site. */
const NOT_AN_INVOCATION = new Set([
  "-v",
  "-V",
  // NOT `-p`: `command -p psql …` RUNS psql with the default PATH; it does not
  // inspect it. `command -v psql` remains denied, which is the CI probe.
  "which",
  "type",
  "whereis",
  "hash",
  "install",
  "apt-get",
  "apt",
  "yum",
  "dnf",
  "apk",
  "brew",
  "echo",
  "printf",
]);

/**
 * Index of the `#` that starts a comment, ignoring `#` inside quotes, or -1.
 * Backslash escapes are honored inside double quotes (and unquoted), because a
 * review probe used `\"` to close a string the scanner still thought was open,
 * which made the rest of the line look like a comment and granted an exemption
 * from a data value. Single quotes take no escapes, per POSIX.
 */
/**
 * Scan shell text (a `.sh` file, or the raw slice of a workflow `run:` scalar).
 * `lineOffset` is added to the 0-indexed line within `text`.
 */
/**
 * Find every psql invocation in shell text. Word-level throughout: the text is
 * lexed the way the shell lexes it, split into commands on operators, and each
 * command's argv is what psql would actually receive.
 */
/**
 * Re-anchor a site found inside part of a WORD back to that word's coordinates.
 *
 * `sliceStart` is where the scanned text begins within `word.text`. When the
 * scanned text is a faithful SLICE, the per-character maps the lexer recorded
 * give an exact offset and line. When it was TRANSLATED — env's split-string
 * grammar rewrites `\_` to a space, so lengths no longer line up — the mapping
 * cannot be exact: the site keeps the word's own start and LOSES its exemption,
 * because an inexact line must never inherit a marker written for a neighbour.
 */
function reanchor(
  site: PsqlSite,
  word: ShellWord,
  sliceStart: number,
  exact: boolean,
  lineOffset: number,
): PsqlSite {
  // `lineOffset` is where the scanned TEXT begins in its enclosing file. Every
  // other site path adds it; these four did not, so a psql physically on line 9
  // of a workflow `run:` block was reported on line 4. A wrong line is a false
  // safe in its own right — `exemptionOnLines` is line-scoped, so a site placed
  // on someone else's line can inherit a marker written for them.
  if (!exact)
    return { ...site, offset: word.offset, line: lineOffset + word.line + 1, exemptReason: null };
  const at = sliceStart + site.offset;
  return {
    ...site,
    offset: word.offsets[at] ?? word.offset,
    line: lineOffset + (word.lines[at] ?? word.line) + 1,
  };
}

function scanShellText(text: string, file: string, lineOffset: number): PsqlSite[] {
  const rawLines = text.split("\n");
  const commentAt = commentIndexPerLine(text, "hash");
  const sites: PsqlSite[] = [];

  const nestedBodies: NestedShell[] = [];
  const words = lexShellWords(text, nestedBodies);
  for (const inner of nestedBodies) {
    for (const site of scanShellText(inner.text, file, lineOffset + inner.line))
      sites.push({
        ...site,
        // `inner.text` is a raw SLICE of this text, so its indices are simply
        // shifted; no quote stripping happened between them.
        offset: inner.offset + site.offset,
        nested: true,
        // Backtick-ness is inherited: a `$(…)` inside a backtick span is still
        // inside the markdown-ambiguous region.
        nestedInBacktick: inner.backtick || site.nestedInBacktick,
      });
  }
  let command: ShellWord[] = [];
  const commands: ShellWord[][] = [];
  /** The operator that FOLLOWED each command, so a PIPELINE stays visible. */
  const followedBy: string[] = [];
  for (const word of words) {
    if (word.operator) {
      if (command.length > 0) {
        commands.push(command);
        followedBy.push(word.text);
      }
      command = [];
      continue;
    }
    command.push(word);
  }
  if (command.length > 0) {
    commands.push(command);
    followedBy.push("");
  }

  // `printf 'psql …\n' | bash` feeds a literal command to a shell through
  // STDIN, so the psql text is an argument to printf and no allowlisted `-c`
  // consumer is involved. When a pipeline's next stage is a BARE shell (no
  // `-c`), this stage's arguments ARE the script it will run.
  for (const [position, argv] of commands.entries()) {
    if (followedBy[position] !== "|") continue;
    const next = commands[position + 1];
    if (next === undefined) continue;
    const nextHead = next[0];
    if (nextHead === undefined || !SHELL_BINARIES.has(basename(nextHead.text))) continue;
    if (next.slice(1).some((word) => /^-[a-z]*c[a-z]*$/.test(word.text))) continue; // has -c
    for (const word of argv.slice(1)) {
      if (!/\bpsql\b/.test(word.text)) continue;
      for (const site of scanShellText(word.text, file, lineOffset + word.line))
        sites.push({ ...site, offset: word.offsets[site.offset] ?? word.offset });
    }
  }

  for (const argv of commands) {
    /** Set when a JOINING consumer has handled this argv; its words are that
     * consumer's command string, not a command in their own right. */
    let joinedHandled = false;
    // `bash -c "psql …"`, `sh -lc "…"`, `docker exec … sh -c "…"`, `eval "…"`,
    // and the other ordinary command-STRING consumers: `su - postgres -c "…"`,
    // `runuser -u postgres -c "…"`, `env -S "…"`, `ssh host "…"`, `watch "…"`.
    // The quoted script EXECUTES; scanning it is not optional. This list is an
    // ALLOWLIST by necessity — knowing WHICH argument is a script requires
    // knowing the program — and is therefore inherently incomplete; the
    // indirection tripwire is the backstop on the JS side.
    for (const [position, word] of argv.entries()) {
      const name = basename(word.text);
      const isInterpreter = SHELL_BINARIES.has(name) || DASH_C_CONSUMERS.has(name);
      const isEval = name === "eval";
      const isDashS = name === "env";
      // The long-option branch below also fires for `su`/`runuser`, which are in
      // DASH_C_CONSUMERS, and for `env` via isDashS.
      // `ssh host "psql …"` and `watch "psql …"` name no flag: the script is
      // simply a later word that is itself a command line.
      const isTrailing = TRAILING_SCRIPT_CONSUMERS.has(name);
      if (FIRST_ARG_SCRIPT_CONSUMERS.has(name)) {
        for (let i = position + 1; i < argv.length; i++) {
          const candidate = argv[i]!;
          if (candidate.text === "--" || candidate.text.startsWith("-")) continue;
          for (const site of scanShellText(candidate.text, file, lineOffset + candidate.line))
            sites.push({ ...site, offset: candidate.offsets[site.offset] ?? candidate.offset });
          break;
        }
        joinedHandled = true;
        break;
      }
      if (!isInterpreter && !isEval && !isDashS && !isTrailing) continue;
      if (isTrailing || isEval) {
        // These consumers APPEND their remaining arguments into ONE command
        // string, separated by spaces, and the receiving shell re-parses it.
        // ssh(1): "the arguments will be appended to the command, separated by
        // spaces, before it is sent to the server to be executed." So
        // `ssh host psql -c "VACUUM;" -X mydb` really runs
        // `psql -c VACUUM; -X mydb` — the `;` terminates psql and the `-X`
        // becomes a separate command. Reading the words directly certified it.
        const remaining = [];
        // ssh takes a HOST before the command and tmux takes a SUBCOMMAND; both
        // are the FIRST non-option word — not a fixed position, since options
        // may precede it.
        let hostPending = LEAD_WORD_CONSUMERS.has(name);
        for (let i = position + 1; i < argv.length; i++) {
          const candidate = argv[i]!;
          if (remaining.length === 0) {
            if (candidate.text.startsWith("-")) continue; // an option
            if (SSH_ARG_FLAGS.test(argv[i - 1]?.text ?? "")) continue; // its value
            if (hostPending && !/\s/.test(candidate.text)) {
              hostPending = false;
              continue;
            }
          }
          remaining.push(candidate);
        }
        if (remaining.length > 0) {
          const anchor = remaining[0]!;
          // Map EVERY character of the joined string back to the raw offset and
          // the physical line it came from. Mapping through the first argument
          // alone gave a psql in a later fragment the anchor's line, and
          // `exemptionOnLines` then read a marker written for something else.
          let joined = "";
          const joinedOffsets: number[] = [];
          const joinedLines: number[] = [];
          for (const [k, word] of remaining.entries()) {
            if (k > 0) {
              joined += " ";
              joinedOffsets.push(word.offset);
              joinedLines.push(word.lines[0] ?? word.line);
            }
            for (let c = 0; c < word.text.length; c++) {
              joined += word.text[c];
              joinedOffsets.push(word.offsets[c] ?? word.offset);
              // PER CHARACTER: a quoted word can span physical lines, so the
              // word's opening line is not every character's line.
              joinedLines.push(word.lines[c] ?? word.line);
            }
          }
          for (const site of scanShellText(joined, file, 0))
            sites.push({
              ...site,
              offset: joinedOffsets[site.offset] ?? anchor.offset,
              line: lineOffset + (joinedLines[site.offset] ?? anchor.line) + 1,
              exemptReason: exemptionOnLines(
                rawLines,
                (joinedLines[site.offset] ?? anchor.line) + 1,
                commentAt,
              ),
            });
        }
        joinedHandled = true;
        break;
      }
      for (let i = position + 1; i < argv.length; i++) {
        const candidate = argv[i]!;
        // `sh -ce`, `-cu`, `-cv`, `-cx` all execute the next word; requiring `c`
        // to be LAST missed every cluster with an option after it.
        // Long spellings are documented options, not exotica:
        // `su --command=…` / `--session-command=…`, `runuser` likewise, and
        // `env --split-string=…`. Both `=value` and separate-word forms.
        const longScript = /^--(?:command|session-command|split-string)(=|$)/.exec(candidate.text);
        if (longScript) {
          const translate = name === "env" ? envSplitStringToShell : (t: string) => t;
          if (longScript[1] === "=") {
            const sliceStart = candidate.text.indexOf("=") + 1;
            const attached = candidate.text.slice(sliceStart);
            const translated = translate(attached);
            for (const site of scanShellText(translated, file, lineOffset))
              sites.push(
                reanchor(site, candidate, sliceStart, translated === attached, lineOffset),
              );
            // NOT for `env`: it PREPENDS its split-string to the remaining argv
            // rather than replacing it, so `env -S '-u PSQLRC' psql …` runs env's
            // own option and then the TRAILING psql. Marking the argv handled hid
            // that command entirely. A shell is the opposite — its trailing words
            // are the script's positionals — which is why this is conditional
            // rather than removed.
            joinedHandled = !isDashS;
            // GNU env keeps parsing options AFTER a split-string, so a second
            // `-S` is ordinary and `env -S '-u X' -S 'psql …'` runs psql. Every
            // branch stopped at the first one. For env the loop CONTINUES; for
            // the single-script consumers it still stops, because they have
            // exactly one script.
            if (isDashS) continue;
            break;
          }
          const next = argv[i + 1];
          if (next !== undefined) {
            const translatedNext = translate(next.text);
            for (const site of scanShellText(translatedNext, file, lineOffset))
              sites.push(reanchor(site, next, 0, translatedNext === next.text, lineOffset));
          }
          joinedHandled = !isDashS;
          if (isDashS) {
            i += 1; // step past the operand so it is not re-read as a flag
            continue;
          }
          break;
        }
        if (isInterpreter && !/^-[a-z]*c[a-z]*$/.test(candidate.text)) continue;
        if (isDashS && !/^-[a-zA-Z]*S/.test(candidate.text)) continue;
        // `bash -c -- 'psql …'` is valid: `--` ends option parsing and the
        // script is the NEXT word. Taking `--` as the script scanned nothing.
        let scriptIndex = isEval ? i : i + 1;
        // `env -S'psql …'` attaches the script to the flag itself.
        if (isDashS && candidate.text.length > 2 && /^-[a-zA-Z]*S[\s\S]/.test(candidate.text)) {
          const sliceStart = candidate.text.indexOf("S") + 1;
          const attached = candidate.text.slice(sliceStart);
          const translated = envSplitStringToShell(attached);
          for (const site of scanShellText(translated, file, lineOffset))
            sites.push(reanchor(site, candidate, sliceStart, translated === attached, lineOffset));
          joinedHandled = !isDashS;
          if (isDashS) continue;
          break;
        }
        if (argv[scriptIndex]?.text === "--") scriptIndex++;
        const script = argv[scriptIndex];
        // An interpreter's remaining POSITIONALS are `$0`, `$1`, … of the
        // script it was handed — they are NOT a command in their own right.
        // `bash -c '$0 -qAt mydb' psql -X` assigns psql to `$0` and `-X` to
        // `$1`, so psql runs UNSUPPRESSED; falling through to the generic argv
        // search read that `$0` VALUE as the command word and credited the
        // trailing `-X` to it. A false safe on all six recognized shells.
        joinedHandled = !isDashS;
        if (script === undefined) break;
        // The script word was QUOTE-STRIPPED, so its characters are not
        // contiguous with its start; the per-character maps re-anchor it.
        const scriptText = isDashS ? envSplitStringToShell(script.text) : script.text;
        for (const site of scanShellText(scriptText, file, lineOffset))
          sites.push(reanchor(site, script, 0, scriptText === script.text, lineOffset));
        if (isDashS) {
          i = scriptIndex; // the operand is consumed; keep parsing env's options
          continue;
        }
        break;
      }
    }

    if (joinedHandled) continue;
    const index = argv.findIndex((word) => isPsqlCommandWord(word.text));
    if (index === -1) continue;
    // The denylist decides whether psql is the COMMAND or an argument to a
    // probe, so it may only fire when the deny word is itself argv[0] (`which
    // psql`) or is a flag of an argv[0] probe (`command -v psql`). Matching any
    // preceding word discarded real invocations under a wrapper -- `env -u echo
    // psql …` runs psql, and so does `xargs -I -v psql …`.
    const previous = argv[index - 1];
    const head = argv[0];
    // …and, for the argv[0]-probe form, the deny word must be the probe's OWN
    // first argument. `command env -u echo psql` has `echo` three words in,
    // under a DIFFERENT program that `command` merely executes — treating it as
    // `command`'s probe flag hid an invocation the header already documents as
    // caught (`env -u echo psql` runs psql).
    const denied =
      previous !== undefined &&
      NOT_AN_INVOCATION.has(previous.text) &&
      (previous === head ||
        (head !== undefined && PROBE_COMMANDS.has(basename(head.text)) && index === 2));
    if (denied) continue;

    // An expansion in COMMAND POSITION can supply psql's real argv[0], which
    // makes this literal `psql` a POSITIONAL: `PG=psql; $PG psql -X mydb` runs
    // `psql psql -X mydb`, where `-X` follows a positional and is discarded
    // under POSIXLY_CORRECT. Suppression then cannot be credited.
    //
    // Only the command word matters, not every preceding word: `NAME=value`
    // prefixes are environment rather than argv, and an expansion that is a
    // WRAPPER's argument is consumed by that wrapper — `docker exec
    // "$DB_CONTAINER" psql -X …` is a real site in this repo and must still
    // certify.
    const commandWord = argv.slice(0, index).find((word) => !/^[A-Za-z_]\w*=/.test(word.text));
    const expandedPrefix = commandWord !== undefined && commandWord.text.includes("$");
    const rest = argv.slice(index + 1);
    const tokens = rest.map((word) => word.text);
    // A BARE glob or brace changes argv CARDINALITY without carrying a `$`:
    // under `nullglob` an unmatched `-f optional/*.sql` vanishes entirely and
    // `-f` swallows the following `-X`; a matching one supplies many words; and
    // `{a,b}.sql` always supplies two. The lexical spelling therefore cannot
    // certify. Quoted metacharacters are inert, which is why the lexer records
    // quoting per character — `-c "select * from t"` stays an ordinary token.
    const expandable = rest.some((word) =>
      [...word.text].some((character, k) => !word.quoted[k] && "*?[{".includes(character)),
    );
    const hit = argv[index]!;
    sites.push({
      file,
      line: hit.line + lineOffset + 1,
      offset: hit.offset,
      form: "shell",
      tokens,
      precedingWords: argv.slice(0, index).map((word) => word.text),
      nested: false,
      nestedInBacktick: false,
      hasDynamicTokens: tokens.some((token) => token.includes("$")) || expandable || expandedPrefix,
      suppressesStartupFiles: !expandable && !expandedPrefix && argvSuppressesStartupFiles(tokens),
      exemptReason: exemptionOnLines(rawLines, hit.line + 1, commentAt),
    });
  }
  return sites;
}

/** True when a JS/TS string literal is itself a shell command line running psql. */
function shellStringSites(
  composed: Composed,
  file: string,
  lines: string[],
  commentAt: CommentRanges,
): PsqlSite[] {
  // The psql word's own OFFSET in the composed value maps back to the physical
  // line its characters came from. Deriving the line arithmetically from the
  // expression's opening line plus its span was wrong in all three directions
  // review probed — a later concatenation fragment, an interpolation in a
  // multi-line template, and a cooked `\n` in a literal that spans physical
  // lines — and mapping by composed LINE is still wrong, because two fragments
  // on different physical lines can share one composed line.
  return scanShellText(composed.text, file, 0).map((site) => {
    const actualLine = (composed.lineAt[site.offset] ?? composed.lineAt[0] ?? 0) + 1;
    return {
      ...site,
      line: actualLine,
      // An INEXACT map may point at a line whose comment belongs to something
      // else, so no exemption is granted at all. Failing closed here is the
      // whole reason the flag exists: the alternative is a site silently
      // exempted by a marker written for its neighbour.
      exemptReason: composed.exact ? exemptionOnLines(lines, actualLine, commentAt) : null,
    };
  });
}

// ── JS/TS ────────────────────────────────────────────────────────────────

function calleeName(node: ts.CallExpression): string | null {
  if (ts.isIdentifier(node.expression)) return node.expression.text;
  if (ts.isPropertyAccessExpression(node.expression)) return node.expression.name.text;
  return null;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

/**
 * The text of a string-ish expression, with every runtime piece replaced by a
 * placeholder word. Covers `` `psql ${dsn}` ``, `"psql " + dsn` and
 * `` `${binDir}/psql` `` — all three of which a literal-only reader saw as
 * nothing at all, while the header claimed the indirection tripwire caught
 * them. It did not: the literal is `psql ` or a template head, never exactly
 * `"psql"`.
 */
/**
 * A composed string plus a PER-CHARACTER physical line map. Deriving the line
 * from the expression's opening line plus its total span was wrong in all three
 * directions review probed: a later concatenation fragment, an interpolation in
 * a multi-line template, and a cooked `\n` inside a literal that itself spans
 * physical lines. A wrong line is not cosmetic — `exemptionOnLines` reads the
 * reported line, so it could match a marker written for a different statement.
 */
type Composed = {
  text: string;
  lineAt: number[];
  /** False when some fragment's raw source could not be walked through JS's
   * escape grammar. The reported line is then a best effort, and exemption
   * lookup is SKIPPED so an unrelated marker cannot exempt this site. */
  exact: boolean;
};

/**
 * The physical line each character of `cooked` came from, by walking `raw`
 * through JS's string-escape grammar. `raw` includes its delimiters.
 * Returns null when the walk does not reproduce `cooked` exactly, which is the
 * signal to stop trusting the mapping rather than to guess one.
 */
function mapRawToLines(raw: string, cooked: string, startLine: number): number[] | null {
  const lines: number[] = [];
  let produced = "";
  let line = startLine;
  // Skip the opening delimiter: `"`, `'`, a backtick, or a template middle/tail
  // opener (`}`); template heads end with `${`, which the caller's slice keeps.
  let i = raw.length > 0 && /["'`}]/.test(raw[0]!) ? 1 : 0;
  const end = raw.length > i && /["'`]/.test(raw.at(-1)!) ? raw.length - 1 : raw.length;
  const emit = (piece: string): void => {
    produced += piece;
    for (let k = 0; k < piece.length; k++) lines.push(line);
  };
  while (i < end) {
    const character = raw[i]!;
    if (character === "\\") {
      const next = raw[i + 1];
      if (next === undefined) return null;
      // A line continuation produces NOTHING and consumes a physical line.
      if (next === "\n" || next === "\u2028" || next === "\u2029") {
        line++;
        i += 2;
        continue;
      }
      if (next === "\r") {
        line++;
        i += raw[i + 2] === "\n" ? 3 : 2;
        continue;
      }
      const simple: Record<string, string> = {
        n: "\n",
        t: "\t",
        r: "\r",
        b: "\b",
        f: "\f",
        v: "\v",
        "0": "\0",
      };
      if (next === "x") {
        const hex = raw.slice(i + 2, i + 4);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
        emit(String.fromCharCode(parseInt(hex, 16)));
        i += 4;
        continue;
      }
      if (next === "u") {
        if (raw[i + 2] === "{") {
          const close = raw.indexOf("}", i + 3);
          if (close === -1) return null;
          const hex = raw.slice(i + 3, close);
          if (!/^[0-9a-fA-F]+$/.test(hex)) return null;
          // Same class as the ANSI-C \U guard above: an unbounded run of hex
          // digits can exceed the Unicode maximum (or parse to Infinity), where
          // String.fromCodePoint throws and would abort the walk. A literal the
          // JS engine itself would reject is not cookable, which is exactly what
          // this function's null return means.
          if (parseInt(hex, 16) > 0x10ffff) return null;
          emit(String.fromCodePoint(parseInt(hex, 16)));
          i = close + 1;
          continue;
        }
        const hex = raw.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
        emit(String.fromCharCode(parseInt(hex, 16)));
        i += 6;
        continue;
      }
      emit(simple[next] ?? next);
      i += 2;
      continue;
    }
    // A REAL newline inside a template literal is both a cooked `\n` and a
    // physical line. CRLF cooks to a single `\n`.
    if (character === "\r") {
      emit("\n");
      line++;
      i += raw[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    if (character === "\n") {
      emit("\n");
      line++;
      i++;
      continue;
    }
    emit(character);
    i++;
  }
  return produced === cooked ? lines : null;
}

function composedText(node: ts.Node, sourceFile: ts.SourceFile): Composed | null {
  const out: Composed = { text: "", lineAt: [], exact: true };

  /** Append a literal fragment, mapping each character to its physical line. */
  const fragment = (cooked: string, pos: number, end: number): void => {
    const startLine = sourceFile.getLineAndCharacterOfPosition(pos).line;
    // Walk the RAW source through JS's escape grammar so each cooked character
    // gets the physical line it actually came from. Counting newlines on both
    // sides and calling them "aligned" was not enough: a backslash-newline
    // CONTINUATION consumes a physical line while producing no cooked
    // character, so the counts disagreed, the whole fragment pinned to its
    // opening line, and an unprotected psql one line down inherited an
    // exemption written for an unrelated call above it.
    const mapped = mapRawToLines(sourceFile.text.slice(pos, end), cooked, startLine);
    if (mapped === null) {
      // Refuse to certify a mapping that could not be derived. The line is
      // still the fragment's own, and `exact: false` skips exemption lookup so
      // an unrelated marker can never apply.
      out.exact = false;
      for (const character of cooked) {
        out.text += character;
        out.lineAt.push(startLine);
      }
      return;
    }
    out.text += cooked;
    // One at a time: spreading a long literal's map overflows the argument
    // limit.
    for (const mappedLine of mapped) out.lineAt.push(mappedLine);
  };

  /** Append the opaque stand-in for a runtime piece, at its own line. */
  const placeholder = (at: ts.Node): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(at.getStart(sourceFile)).line;
    out.text += "${}";
    out.lineAt.push(line, line, line);
  };

  const walk = (current: ts.Node): boolean => {
    const literal = literalText(current);
    if (literal !== null) {
      fragment(literal, current.getStart(sourceFile), current.getEnd());
      return true;
    }
    if (ts.isTemplateExpression(current)) {
      fragment(current.head.text, current.head.getStart(sourceFile), current.head.getEnd());
      for (const span of current.templateSpans) {
        placeholder(span.expression);
        fragment(span.literal.text, span.literal.getStart(sourceFile), span.literal.getEnd());
      }
      return true;
    }
    if (ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = walk(current.left);
      const right = walk(current.right);
      if (!left && !right) return false;
      return true;
    }
    placeholder(current);
    return false;
  };

  return walk(node) ? out : null;
}

function isPsqlBinary(text: string): boolean {
  if (isPsqlName(text) || isPsqlName(basename(text))) return true;
  // `execFileSync(`${binDir}psql`, …)` — the same trailing-slash pattern.
  return text.includes("$") && /(?:\}|\))psql(?:\.exe)?$/i.test(text);
}

/**
 * A string that IS a psql command line, not merely the binary name. The
 * tripwire has to see these: `const cmd = "psql -qAt $DSN"; execSync(cmd)` is
 * ordinary code, and reading only argv[0]-shaped literals let it through with
 * zero sites AND zero indirections.
 */
function looksLikePsqlCommandLine(text: string): boolean {
  // LEX it; do not pattern-match the head. An earlier cut required the string
  // to START with psql, and the header claimed that sufficed to backstop
  // runtime-assembled commands. Review disproved the claim with five ORDINARY
  // shapes at once — `sudo -u postgres psql …`, `PGHOST=… psql …`,
  // `echo ready\npsql …`, `true && psql …`, `cat dump.sql | psql …`. The shell
  // reader already knows where a command word is, so ask it.
  const sites = scanShellText(text, "<literal>", 0);
  if (sites.length === 0) return false;
  // Bounded so PROSE that quotes a command does not become a hit. Every clause
  // has a named counterexample from this repo's own strings:
  //   • short           — a 12-word cap; long sentences mention flags too.
  //   • carries a flag  — "psql output must contain ---LOCKS--- marker".
  //   • argument-shaped follower — `psql failed: …` (a word ending in `:`).
  //   • wrapper-only prefix — "parses pipe-separated psql -qAt rows", where
  //     the words before psql are English, not `sudo` / `PGHOST=` / a flag.
  const WRAPPERS =
    /^(?:sudo|doas|su|runuser|env|command|exec|time|timeout|nice|ionice|nohup|stdbuf|xargs|flock|setsid|chroot|ssh|docker|docker-compose|compose|kubectl|podman|nerdctl|cat|true|false|echo|printf|sh|bash|zsh)$/;
  // Shell CONTROL syntax, which precedes a command without being a wrapper:
  // `! psql …`, `if psql …; then`, `while psql …; do`, `{ psql …; }`,
  // `coproc psql …`. These are WEAK: they let a flagged command through, but on
  // their own they do not vouch for a FLAGLESS one, because "if psql fails" is
  // also a sentence.
  const CONTROL = /^(?:!|\{|if|then|elif|else|while|until|do|coproc)$/;
  const isStrongPrefixWord = (word: string, index: number, before: readonly string[]): boolean =>
    /^[A-Za-z_]\w*=/.test(word) ||
    /^-/.test(word) ||
    WRAPPERS.test(basename(word)) ||
    word === "--" ||
    /^-/.test(before[index - 1] ?? "") ||
    /^-/.test(before[index - 2] ?? "") ||
    (index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ""))) ||
    (index > 1 && WRAPPERS.test(basename(before[index - 2] ?? "")));
  const prefixIsCommandish = (before: readonly string[]): boolean =>
    before.every(
      (word, index) =>
        CONTROL.test(word) ||
        /^[A-Za-z_]\w*=/.test(word) ||
        /^-/.test(word) ||
        WRAPPERS.test(basename(word)) ||
        // a wrapper's own argument: `timeout 30 psql …`, `sudo -u postgres psql …`
        word === "--" ||
        /^-/.test(before[index - 1] ?? "") ||
        // …including the argument AFTER a flag's value:
        // `ssh -o StrictHostKeyChecking=no database psql …` puts the remote host
        // two words past the `-o`, and requiring the immediate predecessor to be
        // the flag rejected an entirely ordinary command.
        /^-/.test(before[index - 2] ?? "") ||
        (index > 0 && WRAPPERS.test(basename(before[index - 1] ?? ""))) ||
        (index > 1 && WRAPPERS.test(basename(before[index - 2] ?? ""))),
    );
  return sites.some((site) => {
    const words = text.trim().split(/\s+/).length;
    // A BACKTICK in operator-guidance PROSE is a markdown code span, not a
    // shell substitution: `' to validation via \`psql "$T" -f <m>\`'` is
    // documentation. The signal is the OUTER text's head word, NOT its length —
    // capping length wrongly rejected `echo one two … $(psql …)`. This applies
    // ONLY to backticks: `$(…)` has no markdown reading, and gating it on the
    // head word hid every ordinary `jq -n --arg rows "$(psql -qAt mydb)"` or
    // `curl -d "$(psql …)"` behind a program not in WRAPPERS.
    if (site.nestedInBacktick) {
      const before = text.slice(0, site.offset).trim().split(/\s+/).filter(Boolean);
      const head = (before[0] ?? "").replace(/^["']/, "");
      // `jq -n --arg rows \`psql -qAt mydb\`` is a command whichever program
      // runs it; `' to validation via \`psql "$T" -f <m>\`'` is documentation.
      // Flags alone do not separate them — PROSE ABOUT COMMANDS quotes flags
      // too (`\`supabase db query --linked\` or …` is a real string in this
      // repo). What does separate them is the string STARTING with a bare
      // program name that then takes a flag. A wrapper or assignment head still
      // qualifies on its own.
      const commandShaped =
        /^[A-Za-z_]\w*=/.test(head) ||
        WRAPPERS.test(basename(head)) ||
        (/^[A-Za-z_][\w./-]*$/.test(head) &&
          before.slice(1).some((word) => /^-{1,2}[A-Za-z0-9]/.test(word)));
      if (!commandShaped) return false;
    }
    const hasFlag = site.tokens.some(
      (t) => /^-{1,2}[A-Za-z0-9]/.test(t) || t.startsWith("service="),
    );
    // The main precision carrier: every word before the command must look like a
    // wrapper, an assignment, or a flag — not English. That is what keeps
    // "parses pipe-separated psql -qAt rows" out.
    const commandishPrefix = prefixIsCommandish(site.precedingWords);
    // psql needs no flags at all — `psql mydb`, `psql "$DSN"`,
    // `sudo -u postgres psql mydb`, `psql <dump.sql` (the shell eats the
    // redirection before argv exists). Three bounds keep prose out, each with a
    // named counterexample from this repo's own strings:
    //   argv length  — "psql output must contain ---LOCKS--- marker"
    //   string length — a STANDING_ALLOWLIST reason, whose command stops after
    //     two words only because a `(` splits it
    //   no `word:`   — `psql invocation failed: …`, `psql exit ${code}: …`
    // The string-length bound is lifted only by a STRONG prefix word. Charging
    // a validated wrapper's own words against the command hid
    // `docker compose -f … exec -T postgres psql mydb`, which is nine words of
    // which seven are the prefix that already vouched for it — but shell
    // CONTROL syntax vouches for nothing on its own, since "if psql fails" is a
    // sentence and `if psql mydb; then` is not.
    const hasStrongPrefix = site.precedingWords.some((word, index) =>
      isStrongPrefixWord(word, index, site.precedingWords),
    );
    const isTerseCommand =
      site.tokens.length <= 3 &&
      !site.tokens.some((t) => /:$/.test(t)) &&
      (site.precedingWords.length === 0 ? words <= 8 : hasStrongPrefix);
    if (!hasFlag && !isTerseCommand) return false;
    if (/:$/.test(site.tokens[0] ?? "")) return false;
    return commandishPrefix;
  });
}

const SHELL_BINARIES = new Set(["sh", "bash", "zsh", "dash", "ash", "ksh"]);

/**
 * Programs whose `-c` argument is a command STRING the shell then runs.
 *
 * `flock` and `script` are here because review demonstrated both escaping:
 * `flock /tmp/db.lock -c "psql -qAt mydb"` and `script -q -c "psql -qAt mydb"
 * /dev/null` each execute their quoted argument, and neither produced a site.
 * NOT every program with a `-c` belongs here — `screen -c file` names an INIT
 * FILE, not a command — which is exactly why this stays an allowlist keyed to
 * each program's documented grammar rather than to the spelling `-c`.
 */
const DASH_C_CONSUMERS = new Set(["su", "runuser", "chroot", "doas", "flock", "script"]);

/** Programs whose FIRST non-option argument is a command string the shell runs
 * later: `trap 'psql …' EXIT`. */
const FIRST_ARG_SCRIPT_CONSUMERS = new Set(["trap"]);

/** Programs whose command string is simply a later word (`ssh host "psql …"`,
 * `watch "psql …"`, `tmux new-session "psql …"`), with no flag naming it. */
const TRAILING_SCRIPT_CONSUMERS = new Set(["ssh", "watch", "tmux"]);

/**
 * Consumers whose command string is preceded by ONE ordinary word that is not
 * an option: ssh's HOST, and tmux's SUBCOMMAND (`new-session`, `run-shell`,
 * `split-window`, …). Counting that word as part of the command line put
 * `new-session` in command position and psql behind it, where the prose bounds
 * then discarded the whole thing.
 */
const LEAD_WORD_CONSUMERS = new Set(["ssh", "tmux"]);

/**
 * `env -S` does NOT use shell quoting: it has its own split-string grammar in
 * which `\_` is an ARGUMENT SEPARATOR. `env -S 'psql -F\_ -X mydb'` therefore
 * passes `-F -X mydb`, where `-X` is `-F`'s value — reading the string as shell
 * text saw the single token `-F_` and certified the `-X` behind it. Translate
 * env's escapes into the shell text the rest of the reader expects.
 */
function envSplitStringToShell(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\\") {
      out += text[i];
      continue;
    }
    const next = text[++i];
    if (next === undefined) break;
    if (next === "_")
      out += " "; // the argument separator
    else if (next === "c")
      break; // end of the string
    else if (next === "t") out += "\t";
    else if (next === "n") out += "\n";
    else if (next === "v") out += "\v";
    else if (next === "f") out += "\f";
    else if (next === "r") out += "\r";
    else out += next; // `\\`, `\#`, `\$` … the character itself
  }
  return out;
}

/** ssh options that take a SEPARATE value, so the following word is that value
 * rather than the host or the remote command. */
const SSH_ARG_FLAGS = /^-[bcDEeFIiJLlmOopQRSWw]$/;

/** argv[0] is a shell, so its argv carries a command LINE rather than psql. */
function isShellBinary(text: string): boolean {
  return SHELL_BINARIES.has(text.slice(text.lastIndexOf("/") + 1));
}

/** JSX only parses as JSX when the ScriptKind says so — otherwise `<span>` is
 * read as a type assertion and the `//` in its TEXT looks like a comment. */
function scriptKindFor(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.(mjs|cjs|js)$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function parseJs(source: string, file: string): ts.SourceFile {
  return ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKindFor(file));
}

function lineOf(sourceFile: ts.SourceFile, pos: number): number {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

/**
 * Suppression that holds under BOTH readings of a spawn-family argv: as literal
 * argv, and as the command line the shell would re-parse under `{ shell: true }`.
 *
 * Node joins argv with spaces when `shell` is truthy, so the shell then removes
 * redirections and re-splits words. `execFileSync("psql", ["-F", "2>/dev/null",
 * "-X", "mydb"], { shell: true })` really runs `psql -F -X mydb`, where `-X` is
 * the field separator and suppresses nothing — while a literal reading saw a
 * standalone `-X` and certified it. Requiring BOTH readings avoids inspecting
 * the options object at all, which is deliberate: a reader that recognized only
 * an unquoted `shell:` key missed `{ "shell": true }`, `{ ["shell"]: true }`,
 * `{ shell }` shorthand and an external identifier.
 */
function argvSuppressesUnderBothReadings(tokens: readonly string[]): boolean {
  if (!argvSuppressesStartupFiles(tokens)) return false;
  // `<dynamic>` carries `<` and `>`, which the shell would read as redirections;
  // stand it in with the same opaque word the lexer uses elsewhere.
  const asCommand = ["psql", ...tokens.map((t) => (t === DYNAMIC_TOKEN ? "${}" : t))].join(" ");
  const reparsed = scanShellText(asCommand, "<argv>", 0)[0];
  return reparsed === undefined || argvSuppressesStartupFiles(reparsed.tokens);
}

export function scanJsSource(source: string, file: string): PsqlSite[] {
  const sourceFile = parseJs(source, file);
  const lines = source.split("\n");
  const commentAt = jsCommentRangesPerLine(source, file);
  const sites: PsqlSite[] = [];

  const visitNode = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const first = node.arguments[0];
      const firstComposed = first ? composedText(first, sourceFile) : null;
      const firstText = firstComposed?.text ?? null;

      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        firstText &&
        isPsqlBinary(firstText)
      ) {
        const tokens: string[] = [];
        let hasDynamicTokens = false;
        const argv = node.arguments[1];
        if (argv && ts.isArrayLiteralExpression(argv)) {
          for (const element of argv.elements) {
            const text = literalText(element);
            if (text === null) {
              hasDynamicTokens = true;
              tokens.push(DYNAMIC_TOKEN);
            } else tokens.push(text);
          }
        } else if (argv !== undefined) {
          hasDynamicTokens = true;
        }
        const line = lineOf(sourceFile, first!.getStart(sourceFile));
        sites.push({
          file,
          line,
          form: callee as PsqlSiteForm,
          tokens,
          precedingWords: [],
          offset: 0,
          nested: false,
          nestedInBacktick: false,
          hasDynamicTokens,
          suppressesStartupFiles: argvSuppressesUnderBothReadings(tokens),
          exemptReason: exemptionOnLines(lines, line, commentAt),
        });
      }

      // Literal shell strings handed to execSync("psql …") / exec("psql …").
      if (callee && SHELL_CALLEES.has(callee)) {
        for (const argument of node.arguments) {
          const text = composedText(argument, sourceFile);
          if (text === null) continue;
          sites.push(...shellStringSites(text, file, lines, commentAt));
        }
      }

      // A spawn-family argv[0] that is a literal COMMAND LINE rather than a
      // bare binary is only meaningful with a shell, so scan it as shell text
      // and never mind how the option was spelled. Reading the option object
      // was the bug: `{ "shell": true }`, `{ ["shell"]: true }`, `{ shell }`
      // shorthand and an external `options` identifier are all ordinary, and a
      // reader that recognized only an unquoted `shell:` key saw none of them.
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        first &&
        firstComposed !== null &&
        !isPsqlBinary(firstComposed.text) &&
        !isShellBinary(firstComposed.text)
      ) {
        sites.push(...shellStringSites(firstComposed, file, lines, commentAt));
      }

      // A shell binary run through the spawn family — spawnSync("sh", ["-c",
      // "psql …"]). argv[0] is not psql, so the branch above never sees it;
      // every literal element of the argv array is read as shell text instead.
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        firstText &&
        isShellBinary(firstText)
      ) {
        const argv = node.arguments[1];
        if (argv && ts.isArrayLiteralExpression(argv)) {
          for (const element of argv.elements) {
            const text = composedText(element, sourceFile);
            if (text === null) continue;
            sites.push(...shellStringSites(text, file, lines, commentAt));
          }
        }
      }
    }
    ts.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
  return sites;
}

/**
 * Hard tripwire for the one thing the AST match cannot see: the binary name
 * bound to an identifier, or a shell command assembled at runtime. Reports any
 * `"psql"`-valued string literal that is NOT argv[0] of a recognized call.
 */
/**
 * Shell-side indirection: a command word that will only BE `psql` at runtime, or
 * an alias/function that rewrites psql's argv. A word-level reader cannot follow
 * either, so both are reported rather than silently mis-read.
 */
/**
 * COMPILED ONCE, at module scope. Building these per line inside the scan
 * turned the ~2950-file walk from ~10s into ~75s — past the guard's own 60s
 * test timeout, which is a CI failure rather than a slow test.
 */
const PSQL_VALUE = "[^\\s\"';|&]*\\bpsql\\b[^\\s\"';|&]*";
/** The `read` grammar up to and including the `<<<` operator. ONE source string
 * for both readings below, so the line-text rule and the word route cannot
 * drift into two different ideas of what a here-string read looks like. Which
 * command words and flag shapes constitute a here-string read is RATIFIED
 * unchanged by this arc (design section 1.1 row 2); only the VALUE reading moved.
 *
 * Two bounded changes to the reach, and they are ONE decision. The middle no
 * longer crosses `;`, `&` or `|`, so the match covers the `read`'s OWN command
 * segment; and the lookahead pins it to the LAST `<<<` WITHIN that segment,
 * which is the one the shell hands to this `read`.
 *
 * Each without the other is a defect, which is why they land together:
 *  - Without the segment bound, `[^\n]*` BACKTRACKS across a separator. On
 *    `read -r PG <<< notpsql; cat <<< psql` the engine walks to the SECOND
 *    command's target and reports, while bash binds `notpsql`.
 *  - Without the lookahead it backtracks WITHIN the command. On
 *    `read -r PG <<< psql <<< notpsql` it reads the first target and reports,
 *    while bash binds `notpsql`.
 *  - With the lookahead but NOT the segment bound - the shape shipped mid-repair
 *    and caught before commit - the last `<<<` on the LINE can belong to another
 *    command, so `read -r PG <<< psql; cat <<< notpsql` reads `notpsql` and goes
 *    SILENT on a binding bash really makes. That is a narrowing that manufactured
 *    a MISS while removing a false positive, which is the one trade the
 *    consequence bound does not allow either half of.
 *
 * Segment reach is textual and therefore quote-naive: a `;` inside a quoted
 * target cuts the segment. That direction is a missed report, and the WORD route
 * - which reads the LEXER's operator words, where a quoted `;` is data - covers
 * it, which is what the union is for. */
const READ_HERE_STRING_PREFIX_SOURCE =
  "(?:^|[\\s;&|(])read\\s+(?:-\\w+\\s+)*[A-Za-z_]\\w*\\b(?:(?![;&|])[^\\n])*<<<" +
  "(?!(?:(?![;&|])[^\\n])*<<<)";
/** `read -r PG <<< psql` binds the name from a here-string. */
const READ_HERE_STRING = new RegExp(`${READ_HERE_STRING_PREFIX_SOURCE}\\s*["']?${PSQL_VALUE}`);
/** The IDENTICAL grammar with the VALUE portion removed. The word route decides
 * the value from the lexer's retained target rather than from the line text, so
 * it needs the prefix only. */
const READ_HERE_STRING_PREFIX = new RegExp(READ_HERE_STRING_PREFIX_SOURCE);

/**
 * Assignment bindings are read from LEXED WORDS, not from raw line text. The
 * lexer already performs the quote removal, escape processing and word
 * assembly the shell does, so `PG=psql`, `export "PG=psql"`, `PG=p'sql'`,
 * `PG=p\sql` and `PG=$'psql'` are all the same word once lexed - the regex
 * family this replaces admitted exactly one delimiter form per pattern and
 * needed a new spelling per review round (BL-SHELL-BINDING-MIXED-QUOTED-VALUE;
 * design: docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md).
 */
const ASSIGNMENT_WORD = /^[A-Za-z_]\w*(?:\[[^\]]*\])?\+?=([\s\S]*)$/;

/**
 * Opening line indexes (0-based) of words that BIND the psql command name.
 * Position-independent on purpose: `env PG=psql cmd` binds at argument
 * position, and the retired patterns fired anywhere after a separator too.
 * A `$(…)`/backtick value lexes to the opaque `${}` and stays the discovery
 * walk's jurisdiction; a `${…}` expansion is kept verbatim, so the
 * parameter-default forms still report here.
 *
 * The declaration keywords need no grammar: `export`, `readonly`, `declare -x`,
 * `local`, `typeset` and their flags are SEPARATE words, and whole-argument
 * quoting (`export "PG=psql"`, `export 'PG=p'sql`) dequotes to the same
 * candidate word — which is why the `DECLARE_KEYWORD` alternation disappeared
 * rather than being ported.
 */
function assignmentBindingLines(words: ShellWord[], file: string): Set<number> {
  const found = new Set<number>();
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!;
    if (word.operator) continue;
    const match = ASSIGNMENT_WORD.exec(word.text);
    if (!match) continue;
    // Trim default-IFS edges (space, tab, newline): an unquoted expansion
    // word-splits, so `PG=' psql'` and `PG=$'psql\n'` both run psql at their
    // use sites (spec 3.1; probe supplement g3/g6).
    const value = match[1]!.replace(/^[ \t\n]+|[ \t\n]+$/g, "");
    // A COMPOUND ARRAY value (`PG=(psql)`, `PG=([0]=psql)`, `declare -a PG=(…)`)
    // is not one word: `(` is the ONLY member of OPERATOR_STARTS that can appear
    // INSIDE an assignment value, so the lexer splits the value into its own
    // words exactly where bash's grammar does. Each element is read through the
    // SAME predicate as a single-word value rather than through a second grammar
    // (diff review r1 finding 1 — a REGRESSION against the retired line-text
    // patterns, which saw the raw text and never had to know this).
    if (value.length === 0 && words[index + 1]?.operator && words[index + 1]!.text === "(") {
      if (compoundArrayBinds(words, index + 2, file)) found.add(word.line);
      continue;
    }
    if (value.length === 0) continue;
    if (valueBinds(value, file, wholeValueCandidate(word, word.text.length - match[1]!.length)))
      found.add(word.line);
  }
  return found;
}

/**
 * Does a compound-array assignment's ELEMENT list bind the psql command name?
 * `from` is the index of the word after the opening `(`.
 *
 * An UNTERMINATED list is a bash syntax error, so the file runs nothing and
 * nothing is bound - which is also what keeps one stray paren from reporting
 * every psql word in the rest of the file against the assignment's line.
 */
function compoundArrayBinds(words: ShellWord[], from: number, file: string): boolean {
  let close = -1;
  for (let k = from; k < words.length; k++) {
    const word = words[k]!;
    if (!word.operator) continue;
    // A NEWLINE is ordinary whitespace inside a compound value, so a multi-line
    // array is one assignment. Every other operator is a syntax error there.
    if (word.text === "\n") continue;
    if (word.text === ")") close = k;
    break;
  }
  if (close === -1) return false;
  for (let k = from; k < close; k++) {
    const word = words[k]!;
    if (word.operator) continue;
    // An element is either a bare value or `[key]=value` / `[key]+=value`.
    const keyed = /^\[[^\]]*\]\+?=([\s\S]*)$/.exec(word.text);
    const value = (keyed ? keyed[1]! : word.text).replace(/^[ \t\n]+|[ \t\n]+$/g, "");
    const valueAt = keyed ? word.text.length - keyed[1]!.length : 0;
    if (value.length > 0 && valueBinds(value, file, wholeValueCandidate(word, valueAt)))
      return true;
  }
  return false;
}

/**
 * Does one DEQUOTED assignment value bind the psql command name? Shared by the
 * single-word case and by every element of a compound array, so the two cannot
 * drift into two different readings of the same string.
 */
function valueBinds(value: string, file: string, candidate: string | null = null): boolean {
  // Arm 2: the candidate is an ADDITIONAL string tested by this SAME predicate,
  // never a replacement for the verbatim reading below. That is why every
  // existing verdict is bit-for-bit what it was - the bare-operand hit, and
  // every conservative complement over-report alike - and why precision holds
  // where it held: `${U:-'psql;x'}` yields the candidate `psql;x` and is
  // rejected on the separator, `${U:-'psql\'}` on the trailing backslash, and
  // `${M:-'psql failed to connect'}` reaches the multiword branch and is
  // declined for carrying no flag-shaped token.
  if (candidate !== null && valueBinds(candidate, file)) return true;
  if (/\s/.test(value)) {
    // A MULTIWORD value binds a command LINE (`CMD='psql -qAt mydb'; eval
    // "$CMD"`): re-lex the dequoted value and require a psql site carrying a
    // flag-shaped token - the same criterion the retired quotedValue path
    // used, which keeps prose (`MSG="psql failed to connect"`) out. The
    // cheap skip below is NOT the forbidden R4 prefilter: it runs on the
    // already-DEQUOTED value, and any spelling of psql the literal test
    // misses must still carry a quote or backslash character, which the
    // second alternative admits.
    if (!/\bpsql\b/.test(value) && !/["'\\]/.test(value)) return false;
    // TWO consumer grammars decide a multiword value, each read by ITS OWN
    // rules (plan round-3 finding 3; round-5 finding 1):
    //  - `eval "$CMD"`: the value is shell SOURCE - quotes are syntax,
    //    newlines separate commands. Read with scanShellText, as before.
    //  - unquoted `$CMD`: the value is DATA word-split on IFS whitespace -
    //    quotes are literal pathname characters and newlines are ordinary
    //    separators, so re-lexing it as shell turned `/tmp/O'Reilly/psql -X`
    //    into the wrong words. Read with a plain split: psql-shaped argv[0]
    //    plus a flag-shaped later token, the same flag criterion. The split
    //    reading decides psql at ARGV[0] and nothing deeper - a wrapper-
    //    prefixed value whose psql path needs it (`CMD="sudo
    //    /tmp/O'Reilly/psql -X mydb"`) is a declared limit, spec §6 item 6.
    // Report if EITHER reading yields a flagged psql invocation.
    const evalBound = scanShellText(value, file, 0).some((site) =>
      site.tokens.some((token) => /^-{1,2}[A-Za-z0-9]/.test(token)),
    );
    const parts = value.split(/[ \t\n]+/).filter((part) => part.length > 0);
    const splitBound =
      parts.length > 1 &&
      isPsqlCommandWord(parts[0]!) &&
      parts.slice(1).some((token) => /^-{1,2}[A-Za-z0-9]/.test(token));
    return evalBound || splitBound;
  }
  // The PSQL_VALUE core, decided on the DEQUOTED value: psql with word
  // boundaries, no surviving quote or separator DATA characters (a quoted
  // `;` binds `psql;x`, which is not the psql command), and no trailing
  // literal backslash - the expanded word's basename would be empty, the
  // same shell fact the ratified trailing-backslash contract test pins.
  // A separator character in a DIRECTORY component changes nothing about
  // what runs: `/tmp/O'Reilly/psql` has basename psql (plan round-4
  // finding 1). The basename alternative reuses the module's own word
  // semantics (basename + isPsqlName), so it is exact, not a widening:
  // `psql;x`, `psqlx` and a trailing-backslash value all fail it.
  if (isPsqlName(basename(value))) return true;
  if (!/\bpsql\b/.test(value)) return false;
  if (/["';|&]/.test(value)) return false;
  if (value.endsWith("\\")) return false;
  return true;
}

/**
 * An interpreter's trailing POSITIONALS become `$0`, `$1`, … of the script it
 * was handed, so `bash -c '$0 -qAt mydb' psql -X` runs psql UNSUPPRESSED — the
 * `-X` is the shell's `$1`, never an argument of psql. The command word exists
 * only after expansion, which is precisely what this tripwire is for. The
 * script must be QUOTED (the ordinary spelling) and a psql-shaped word must
 * follow it, so an ordinary `bash -c 'psql -X …'` with no positionals stays
 * quiet — that one is a SITE, and is read as one.
 */
const INTERPRETER_POSITIONAL_BINDING = new RegExp(
  `(?:^|[\\s;&|(])(?:\\S*/)?(?:${[
    "sh",
    "bash",
    "zsh",
    "dash",
    "ash",
    "ksh",
    "su",
    "runuser",
    "chroot",
    "doas",
    "flock",
    "script",
  ].join(
    "|",
  )})\\b[^\\n]*?\\s-{1,2}[A-Za-z-]*c[A-Za-z-]*(?:\\s+--)?\\s+(?:'[^']*'|"[^"]*")\\s+[^\\n]*?\\bpsql\\b`,
);

/**
 * The shell REMOVES a backslash-newline outright - no space in its place - so
 * `"/opt/postgresql/17/bin/\` + newline + `psql"` is the single word
 * `/opt/postgresql/17/bin/psql`. A space-joined view splits the very word the
 * shell is gluing together, so every binding rule read two halves and neither
 * contained a psql-shaped value. `first` is the line's own text with any
 * comment already removed.
 *
 * Returns the joined text AND the LAST physical line it consumed, because the
 * here-string WORD route has to know which physical lines a logical line covers:
 * a `RedirectionTarget.line` is the PHYSICAL line its target starts on, and a
 * continuation either before `<<<` or between `<<<` and its target puts that
 * target on a later line than the `read` (probes N1 and N2). ONE implementation
 * for both callers, so they cannot disagree about the span.
 */
function splicedAt(first: string, lines: string[], index: number): { spliced: string; to: number } {
  let spliced = first;
  let to = index;
  for (let k = index; /\\$/.test(spliced) && k + 1 < lines.length; k++) {
    spliced = `${spliced.replace(/\\$/, "")}${(lines[k + 1] ?? "").replace(/^\s+/, "")}`;
    to = k + 1;
  }
  return { spliced, to };
}

/**
 * Logical-line indexes (0-based) where a `read` binds the psql command name from
 * a DETACHED here-string TARGET, decided from the LEXER'S RETAINED WORD rather
 * than from the line text. Arm 1 of
 * docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md
 * (ledger BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE).
 *
 * The target's text has already been through the lexer's quote removal, ANSI-C
 * decoding and escape handling, and it is decided by `valueBinds` - the SAME
 * predicate the assignment family uses - so neither the dequoting nor the
 * binding criterion can drift into a second reading of one string.
 *
 * Association is by LOGICAL line, never physical. Requiring the target to sit on
 * the `read`'s own physical line fails for BOTH ordinary continuation positions,
 * and announcing the here-string family closed while a continuation still hid
 * one would leave a FALSE CERTIFICATION behind. This route is a UNION MEMBER,
 * not a replacement: `READ_HERE_STRING` still reads the spliced line, because
 * that is the only reading that sees inside a `$(...)` body and it is
 * stricter-in-reverse on prose (`read -r MSG <<< 'psql failed to connect'`
 * reports today and must keep reporting, while `valueBinds` alone would decline
 * it for carrying no flag-shaped token).
 *
 * The ATTACHED spelling (`<<<p'sql'`) IS read as of 2026-08-21
 * (BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION): `attachedTargetEnd`
 * delimits it by construct and the dequoted target is retained here alongside
 * the detached one, so both spellings reach `valueBinds` through one reading.
 * A target the accept-set could NOT delimit is skipped here and surfaced as an
 * `IndirectionHit` instead - bash fails on the unexpected EOF and binds
 * nothing, so there is no binding for this function to find.
 */
function hereStringBindingLines(
  source: string,
  targets: RedirectionTarget[],
  words: ShellWord[],
  redirections: Redirection[],
  file: string,
): Set<number> {
  const found = new Set<number>();
  if (targets.length === 0) return found;
  const lines = source.split("\n");
  const commentAt = commentIndexPerLine(source, "hash");
  for (let index = 0; index < lines.length; index++) {
    const comment = commentAt[index]?.[0]?.[0];
    const line = lines[index] ?? "";
    const code = comment === undefined ? line : line.slice(0, comment);
    const { spliced, to } = splicedAt(code, lines, index);
    if (!READ_HERE_STRING_PREFIX.test(spliced)) continue;
    // Attribution - which command, and which redirection - is decided by the
    // shared gate. Round 1's F2 took the COMMAND boundary; this route now also
    // declines when the shell has already replaced the here-string on fd 0:
    // `read -r PG <<< p'sql' < /dev/null` reported while bash binds the empty
    // string, and `read -r PG <<< p'sql' <<< notpsql` reported while bash binds
    // `notpsql`. That is a MIS-READ of precedence the shell decides ON THE PAGE,
    // which §7.4 separates from the ratified may-bind posture: may-bind covers
    // what a static reader CANNOT know - whether `U` is set when `${U:-psql}`
    // expands - and never excuses misreading what is written down. Narrowing,
    // per the standing repair direction: the rule DECLINES over a closed
    // operator set rather than growing a per-operator predicate.
    const effective = effectiveHereString(words, redirections, index, to);
    if (effective === null) continue;
    for (const target of targets) {
      // A target the accept-set could not delimit carries no readable text -
      // bash fails on the unexpected EOF and binds nothing - so it is skipped
      // here and surfaced by `scanShellIndirection` instead.
      if (target.unlexable !== null) continue;
      // The operator is load-bearing, not decoration: with `<` the shell hands
      // `read` the FILE'S CONTENT, so an operator-blind reading reports a
      // binding bash does not make.
      if (target.operator !== "<<<") continue;
      if (target.line < index || target.line > to) continue;
      // The target must belong to the EFFECTIVE redirection itself, matched by
      // the operator offset the lexer recorded on it. Ordering alone is not
      // enough: `read -r PG <<< notpsql 2<<< psql` puts a here-string target
      // AFTER the effective stdin operator, on fd 2, and bash binds `notpsql`
      // (diff review r3 finding 2). Identity cannot make that mistake.
      if (target.operatorOffset !== effective.offset) continue;
      // `read NAME` binds the FIRST LINE of its input, with default-IFS edges
      // stripped - not the whole here-string. Passing the entire target both
      // MISSED bindings bash makes (`$'psql\\nignored'` and `$'\\tpsql '` bind
      // psql) and REPORTED one it does not (`$'other\\npsql -X'` binds `other`).
      // The candidate is offered only when nothing was truncated, so a
      // multi-line target cannot be read through a span that spills past the
      // line bash actually binds.
      // `read NAME` binds the first line with default-IFS edges stripped, and
      // that applies to the EXPANSION candidate exactly as it applies to the
      // target's own text. Reading only the raw span was wrong in both
      // directions: `${U:-$'psql\nignored'}` is a single RAW line, so the
      // not-truncated guard passed while the DECODED operand still carried its
      // newline, and `${U:-$'other\npsql -X'}` reported though bash binds
      // `other` (diff review r3 finding 1). One helper, applied to whichever
      // string is about to be read, so the two cannot drift apart.
      const firstLine = (value: string): string =>
        (value.split("\n")[0] ?? "").replace(/^[ \t]+|[ \t]+$/g, "");
      const bound = firstLine(target.text);
      const operand = wholeValueCandidate(target, 0);
      // The operand's OWN first line, not the operand whole and not a decline.
      // `read` receives the EXPANDED string, so it truncates the operand exactly
      // as it truncates a literal target: `${U:-$'psql\nignored'}` binds `psql`
      // and was MISSED, while `${U:-$'other\npsql -X'}` binds `other` and was
      // REPORTED (diff review r3 finding 1). The candidate is an ADDITIONAL
      // string tested by the same predicate rather than a replacement for the
      // verbatim reading - arm 2's ratified contract - so an EMPTY first line
      // yields no candidate rather than forcing a verdict.
      const candidate = operand === null ? null : firstLine(operand) || null;
      if (bound.length === 0 && candidate === null) continue;
      if (valueBinds(bound, file, candidate)) {
        found.add(index);
        break;
      }
    }
  }
  return found;
}

/**
 * A QUOTED executable scalar, located in the ORIGINAL source coordinates.
 *
 * WHY THIS TYPE EXISTS, in the past tense because the behaviour is retired.
 * `scanShellIndirection` lexed the WHOLE YAML file as one shell text and did
 * NOT parse YAML, so a quoted executable scalar's YAML delimiters reached the
 * shell lexer as SHELL quotes: the body collapsed to one literal word, the `$(`
 * inside it was quoted rather than opening a substitution, and the
 * unlexable-target report never fired. HEAD parses the file through
 * `quotedExecutableScalars` and blanks those scalars out of the lexed view, so
 * the raw pass no longer reaches them. Probed at base, all four executable keys
 * behave identically — the PLAIN spelling reports one advisory and both quoted
 * spellings report none — so the quoted spellings are silently unreadable in a
 * channel whose entire job is to say "something here I cannot read".
 *
 * Both key families are collected, and the reason is that this channel lexes
 * the whole FILE: a `with.args` scalar's YAML delimiters reach the lexer
 * exactly as a `run:` scalar's do, so the defect does not distinguish them even
 * though the SITE channel does. The sequence spelling of `args:` is collected
 * for the same reason — probed at base, a block-sequence item reports when
 * plain and goes silent when quoted, which is the same defect in a different
 * spelling rather than a new one.
 */
type QuotedExecutableScalar = {
  /** Byte range in the ORIGINAL source. */
  range: [number, number];
  /** The scalar's DECODED value: the shell text it actually carries. */
  value: string;
  /** 1-based line a finding from this scalar is pinned to. */
  line: number;
};

/**
 * Where a finding from a quoted scalar is ANCHORED.
 *
 * A decoded line number is an offset into the decoded value and does not
 * correspond to a physical line — an escaped `\n` consumes none — so it cannot
 * be reported. For a MAPPING VALUE the anchor is the key's line, which is the
 * contract the site channel's decoded pass already states. For a SEQUENCE ITEM
 * there is no key of its own, and anchoring to the containing `args:` key would
 * put the quoted spelling on a different line from the plain spelling of the
 * same item; the item's own starting line is where both agree.
 */
function quotedExecutableScalars(source: string): QuotedExecutableScalar[] {
  let document;
  try {
    document = parseDocument(source, { keepSourceTokens: true });
  } catch {
    return [];
  }
  const found: QuotedExecutableScalar[] = [];
  const lineAt = (offset: number): number => source.slice(0, offset).split("\n").length;
  const QUOTED_STYLES = new Set(["QUOTE_SINGLE", "QUOTE_DOUBLE"]);
  // A SEQUENCE is expanded at most once. `args: &c [ …, *c ]` aliases its own
  // sequence, so resolving the alias yields the sequence that contains it and
  // the walk re-enters forever — `Maximum call stack size exceeded`, thrown out
  // of a function the census walk calls PER FILE, which loses every other
  // file's findings on the way out rather than just this one's.
  //
  // Scoped to sequences on purpose. Scalars do not recurse, and the same scalar
  // legitimately reached through two different aliases must still be collected
  // twice — once per anchor line — so a node-wide dedupe would silently drop
  // the second report.
  const expandedSeqs = new Set<unknown>();
  // An ALIAS resolves to a scalar defined elsewhere; resolving is required
  // rather than generous, because workflow reuse via anchors is documented.
  const resolve = (node: unknown): unknown => {
    const asAlias = node as { resolve?: unknown };
    return asAlias && typeof asAlias.resolve === "function"
      ? ((asAlias as { resolve: (d: unknown) => unknown }).resolve(document) ?? node)
      : node;
  };
  const take = (node: unknown, anchorLine: number | null): void => {
    const value = resolve(node);
    if (isSeq(value as never)) {
      if (expandedSeqs.has(value)) return;
      expandedSeqs.add(value);
      for (const item of (value as { items?: unknown[] }).items ?? []) {
        const itemRange = (resolve(item) as { range?: [number, number, number] }).range;
        take(item, itemRange ? lineAt(itemRange[0]) : anchorLine);
      }
      return;
    }
    if (!isScalar(value as never)) return;
    const style = (value as { type?: string }).type;
    if (style === undefined || !QUOTED_STYLES.has(style)) return;
    const range = (value as { range?: [number, number, number] }).range;
    const decoded = (value as { value?: unknown }).value;
    if (!range || typeof decoded !== "string") return;
    found.push({
      range: [range[0], range[1]],
      value: decoded,
      line: anchorLine ?? lineAt(range[0]),
    });
  };
  visit(document, {
    Pair(_key: unknown, pair: unknown) {
      if (!isPair(pair as YamlNode as never)) return;
      const node = pair as { key?: unknown; value?: unknown };
      const name = (node.key as { value?: unknown } | undefined)?.value as string;
      if (!EXECUTABLE_WORKFLOW_KEYS.has(name) && !CONTAINER_ARGV_KEYS.has(name)) return;
      const keyRange = (node.key as { range?: [number, number, number] } | undefined)?.range;
      take(node.value, keyRange ? lineAt(keyRange[0]) : null);
    },
  });
  return found;
}

/**
 * Blank every range to spaces, PRESERVING newlines.
 *
 * Byte count and line count both survive, so every offset and every line number
 * downstream still names the same position it did in the original source. That is
 * what lets the blanked text stand in for the original everywhere downstream: every
 * reader now takes `shellText`, the one view carrying the blanked ranges. An earlier
 * version of this comment said the untouched `source` was still handed to the arms
 * reading it directly, which described the shape before quoted scalars were blanked
 * out of a single shared view.
 */
function blankRanges(source: string, ranges: Array<[number, number]>): string {
  if (ranges.length === 0) return source;
  const out = source.split("");
  for (const [start, end] of ranges) {
    // No clamp against `out.length`: every range here comes from the YAML parser
    // reading the SAME string this blanks, and `split("")` preserves length, so
    // `end <= out.length` holds and `at < end` already bounds the write. The clamp
    // that stood here was dead in shipped code and existed only as a mutation site.
    //
    // FALSIFIER: a caller passing ranges derived from a DIFFERENT string than the
    // one it blanks. That is the only shape that leaves `end` unbounded.
    //
    // Flush (`end === out.length`) IS reachable — a quoted scalar ending a file with
    // no trailing newline. Measured there, a one-past-the-end bound appends and
    // returns 42 characters for a 41-character source, breaching the byte count this
    // function documents. No FINDING moves on that input, though, so the deciding
    // case for that bound is the flow-mapping fixture in the suite, not this one.
    for (let at = start; at < end; at++) {
      if (out[at] !== "\n") out[at] = " ";
    }
  }
  return out.join("");
}

export function scanShellIndirection(source: string, file: string): IndirectionHit[] {
  return scanShellIndirectionIn(source, file, true);
}

/**
 * `yamlAware` is false for ONE caller: the rescan of a quoted executable
 * scalar's DECODED value, below.
 *
 * That value is post-YAML text — the parser has already removed the delimiters,
 * applied the escape grammar, and joined the continuations — so re-running the
 * YAML pre-processing over it would decode an already-decoded string. Turning
 * the flag off also terminates the recursion by construction rather than by a
 * depth counter: with no YAML pass there are no quoted scalars to collect, so
 * the rescan can never rescan.
 *
 * `file` stays the REAL path in both modes. Every other reading in this
 * function keys on it — whether a backtick is markdown or a substitution, how a
 * binding value is judged — and those readings are about the file the text came
 * from, which does not change just because one pre-processing step is skipped.
 */
function scanShellIndirectionIn(
  source: string,
  file: string,
  yamlAware: boolean,
): IndirectionHit[] {
  const hits: IndirectionHit[] = [];
  const isYaml = yamlAware && YAML_EXTENSIONS.includes(extensionOf(file));
  // A QUOTED executable scalar's delimiters belong to YAML, not to the shell,
  // so the scalar is blanked out of the text this function reads AS SHELL and
  // rescanned below from its DECODED value instead.
  //
  // ONE BLANKED VIEW, FEEDING EVERY READING. This function reads the file's
  // text three ways — the lexer, the per-LINE routes (`githubEnvWrite`, the
  // here-string text route, interpreter positionals), and the here-string
  // binding pass — and blanking only the lexer's input was not enough. The line
  // routes went on reading the raw quoted scalar, so a scalar the rescan
  // already reported was reported a SECOND time by a line route: same line,
  // same scalar, two hits, where the plain spelling of the identical body
  // yields one. Loud rather than silent, so not the dangerous direction, but a
  // duplicate is still a finding a reader must reconcile, and `line` and `text`
  // are both fields the AC-5 digest covers.
  //
  // Blanking preserves byte count AND line count, so `shellText` is coordinate
  // identical to `source`: every offset and every line index still names the
  // same position, which is what lets one view serve all three readings.
  const quotedExecutables = isYaml ? quotedExecutableScalars(source) : [];
  const shellText = isYaml
    ? blankRanges(
        source,
        quotedExecutables.map((scalar) => scalar.range),
      )
    : source;
  const lines = shellText.split("\n");
  const commentAt = commentIndexPerLine(shellText, "hash");

  // STRUCTURAL, not spelling-by-spelling. A command SUBSTITUTION whose body
  // mentions psql but yields no psql SITE is executable discovery — the reader
  // deliberately treats `command -v psql` / `which psql` as probes, so the
  // resulting path never surfaces as a call site and the expanded invocation
  // carries no literal command word. Working from the lexer's nested bodies
  // rather than a line regex covers every spelling at once: quoted or bare
  // (`PSQL="$(…)"`), `$( )` or backticks, wrapped across lines, used directly
  // as the command word, and inside a quoted workflow `run:` scalar. An
  // earlier line-regex cut matched only the unquoted single-line assignment.
  const nested: NestedShell[] = [];
  // A YAML block scalar is DEDENTED before the shell ever sees it, so a
  // backslash-newline continuation inside a `run:` body glues WITHOUT the
  // block's indentation: `PSQL="/opt/pg/\` + newline + ten spaces + `psql"` is
  // the single word `/opt/pg/psql`. The lexer is bash-faithful and keeps
  // whatever follows the continuation, which is right for a `.sh` file and
  // wrong for the raw YAML this function is handed — the walk feeds it the
  // FILE, not the resolved `run:` body. The retired `spliced` view stripped
  // that leading whitespace for EVERY file type; this keeps the strip only
  // where it is the document's own semantics. Newlines are preserved, so every
  // word's `line` still names its physical line.
  // ORDERING IS LOAD-BEARING: the blank above happens in SOURCE coordinates,
  // and the continuation transform here REMOVES BYTES. Blank after it and the
  // blanking overruns by exactly the bytes it removed, straight into the
  // following line — on a flow scalar carrying one physical continuation the
  // next step's `- run:` key is destroyed, so that step stops being a run
  // scalar and its finding is silently erased, in the very channel this repair
  // exists to un-silence.
  const lexedSource = isYaml ? shellText.replace(/\\\n[ \t]+/g, "\\\n") : shellText;
  const targets: RedirectionTarget[] = [];
  const redirections: Redirection[] = [];
  const words = lexShellWords(lexedSource, nested, targets, redirections);
  const seenBodies = new Set<string>();
  // In a JS string literal a BACKTICK span is markdown, not shell: prose like
  // "wrap with `command -v psql >/dev/null || (...)`" is documentation. Same
  // reasoning as `nestedInBacktick` on the site side. In a .sh or .yml file a
  // backtick IS a substitution, so it still counts there.
  const backticksAreMarkdown = JS_EXTENSIONS.includes(extensionOf(file));
  // An ATTACHED target the accept-set could not delimit is REPORTED rather than
  // discarded: correct or signaled, never silently wrong. The channel is the
  // one that already means "something here I cannot read" - it adds no type and
  // no result shape, does not throw, and emits no `PsqlSite`, because the
  // report names an unreadable target and does not claim what it would have
  // evaluated to. It fires ONLY on a span carrying a substitution opener; an
  // ordinary attached target stays quiet whether or not it closes. Ledger:
  // BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION.
  //
  // Scoped to the execution surfaces production actually READS - whole-file
  // shell and workflow `run:` scalars - which is the design's own PROBE DOMAIN
  // rather than an exclusion invented here. In a JS file the text handed to
  // this lexer is a COMPOSED STRING, where `<` is a comparison, a JSX tag or a
  // regex and not a redirection: measured on the live tree, the ungated report
  // fired on NINE template literals, `` `<h2[^>]*\bid=["']${ref.fragment}["']`
  // `` among them, every one a false advisory - the direction the consequence
  // bound refuses even though it is the loud one. Shell text embedded in JS is
  // documented limit 1 of the design and reaching it needs extractors this
  // module does not export. The SAME predicate the backtick reading already
  // makes, taken from that reading rather than copied beside it.
  if (!backticksAreMarkdown)
    for (const target of targets) {
      if (target.unlexable === null) continue;
      if (!SUBSTITUTION_OPENER.test(target.unlexable)) continue;
      // The target's OPENING line, which for an attached target is the
      // operator's. Not the line the scan ran out on: for a span that never
      // closes those coincide unless it crosses lines, and then only the
      // opening line names where the target is.
      hits.push({ file, line: target.line + 1, text: target.unlexable.trim() });
    }
  // Each blanked scalar, rescanned from its DECODED value — the shell text it
  // actually carries — through THIS WHOLE FUNCTION rather than through one of
  // its arms.
  //
  // Re-entering is the point, and a partial rescan is what it replaced. The
  // first cut re-lexed each scalar and re-applied only the unlexable-target
  // predicate, which fixed the advisory this repair is named for and silently
  // broke a different arm: blanking removes the scalar from the whole-file lex
  // for EVERY reading, so the executable-DISCOVERY arm stopped seeing
  // `run: "PSQL=$(command -v psql); $PSQL -qAt mydb"` at all. The deciding
  // suite caught it as a hard red rather than a review round. Re-entry cannot
  // develop that gap, because there is no second list of arms to keep in step.
  //
  // Every hit is re-anchored: a line inside the decoded value is an offset into
  // a string, not a physical line — an escaped `\n` consumes none — so it names
  // nothing a reader could open. The anchor is the key's line, which is the
  // contract the site channel's decoded pass already states.
  for (const scalar of quotedExecutables)
    for (const hit of scanShellIndirectionIn(scalar.value, file, false))
      hits.push({ ...hit, line: scalar.line });
  const bindingLines = assignmentBindingLines(words, file);
  // Arm 1's word route, kept as its OWN set rather than merged into
  // `bindingLines`, so the two routes stay distinguishable to a reader and to a
  // mutant even though both collapse to the same emission below.
  const hereStringLines = hereStringBindingLines(shellText, targets, words, redirections, file);
  const visitBody = (body: NestedShell): void => {
    if (body.backtick && backticksAreMarkdown) return;
    const inner: NestedShell[] = [];
    const innerTargets: RedirectionTarget[] = [];
    const innerRedirections: Redirection[] = [];
    const innerWords = lexShellWords(body.text, inner, innerTargets, innerRedirections);
    // A NESTED body's assignments are invisible to the outer lex, which replaced
    // the whole substitution with the opaque `${}` word — so they are read from
    // the body's OWN words, offset back to their physical line. Without this the
    // guard silently CERTIFIES `X=$(PG=psql; "$PG" -qAt mydb; psql -X -qAt mydb)`
    // on the literal call's own -X, while bash runs the expanded one first
    // without it (diff review r2). The collection sits ahead of the dedupe and
    // the psql-text test below, both of which exist for the HIT this function
    // pushes: a body that already produces a site returns early, and that is
    // exactly the shape the false certification hid behind.
    for (const bound of assignmentBindingLines(innerWords, file)) {
      bindingLines.add(body.line + bound);
    }
    // A nested body has its OWN targets, and an undelimitable one among them was
    // never read - so it surfaced only as the enclosing body's hit, at the BODY's
    // line and carrying the whole body as its text. The channel fired, which is
    // why no silence test caught it; it fired pointing at the wrong place, and
    // line is a field AC-5's digest covers. Same predicate and same shape as the
    // top-level loop above, offset back to the physical line (diff round 3 at the
    // settled base).
    for (const innerTarget of innerTargets) {
      if (innerTarget.unlexable === null) continue;
      if (!SUBSTITUTION_OPENER.test(innerTarget.unlexable)) continue;
      hits.push({
        file,
        line: body.line + innerTarget.line + 1,
        text: innerTarget.unlexable.trim(),
      });
    }
    // The same treatment for the here-string word route, and for the same
    // reason: the outer lex replaced the whole substitution with the opaque
    // `${}` word and so retained no target for anything inside it, which is why
    // `X=$(read -r PG <<< p'sql')` was invisible to both readings (probe A7).
    for (const bound of hereStringBindingLines(
      body.text,
      innerTargets,
      innerWords,
      innerRedirections,
      file,
    )) {
      hereStringLines.add(body.line + bound);
    }
    for (const deeper of inner) visitBody({ ...deeper, line: body.line + deeper.line });
    if (seenBodies.has(body.text)) return;
    seenBodies.add(body.text);
    if (!/\bpsql\b/.test(body.text)) return;
    // A substitution that DOES produce a site is already handled as one.
    if (scanShellText(body.text, file, 0).length > 0) return;
    hits.push({ file, line: body.line + 1, text: body.text.trim() });
  };
  for (const body of nested) visitBody(body);
  for (const [index, line] of lines.entries()) {
    const comment = commentAt[index]?.[0]?.[0];
    // A backslash-newline CONTINUATION makes one logical line: the quoted
    // multiline binding `CMD='psql -qAt mydb \\` + newline + `-c "select 1"'`
    // is one assignment, and a per-line view saw only its first half. Joined
    // ONLY for `INTERPRETER_POSITIONAL_BINDING` below — the other line-local
    // rules stay line-local, since joining them wholesale produced five false
    // positives on this tree. (The assignment family no longer reads either
    // joined view: it reads the LEXED words, which the lexer joins itself.)
    const rawCode = comment === undefined ? line : line.slice(0, comment);
    const code = rawCode;
    let logical = rawCode;
    for (let k = index; /\\$/.test(logical) && k + 1 < lines.length; k++) {
      logical = `${logical.replace(/\\$/, " ")}${lines[k + 1] ?? ""}`;
    }
    // `logical` joins with a SPACE, which is right for separating WORDS but
    // splits the very word the shell is gluing together. `spliced` is the
    // shell's own reading of the same continuation, built by `splicedAt` — one
    // implementation, shared with the here-string word route, which needs the
    // identical logical-line span. Its consumers are `READ_HERE_STRING` and
    // `githubEnvWrite`; the assignment family reads lexed words now, where the
    // lexer performs the same splice.
    const { spliced, to: splicedTo } = splicedAt(rawCode, lines, index);
    // The text route obeys the SAME attribution gate as the word route - one
    // command on the span, and the effective fd-0 redirection is the `<<<` -
    // because both are union members of one rule and rounds 1 and 2 each
    // repaired only the word half (F3 class sweep).
    //
    // Applied ONLY where the lexer positively SAW an fd-0 input redirection on
    // the span. That is not a fail-open convenience, it is the boundary between
    // the two readings: the text route exists because it is the only one that
    // sees inside a `$(…)` body, and the outer lex replaces such a body with an
    // opaque word, so it records no redirection for anything within. Gating on
    // an EMPTY ledger would read "the lexer saw nothing" as "nothing is there"
    // and silently retire that contribution. An override INSIDE a substitution
    // body is therefore unread by this route and is a DOCUMENTED LIMIT (the
    // word route reads the body's own ledger and does decline there); the five
    // zero rows of the F3 sweep case are the same gate firing where it can see.
    const spanEffective = effectiveStdin(redirections, index, splicedTo);
    const spanIsOneCommand = !words.some(
      (word) => word.operator && word.text !== "\n" && word.line >= index && word.line <= splicedTo,
    );
    const textRouteBlocked =
      spanIsOneCommand && spanEffective !== null && spanEffective.operator !== "<<<";
    // Any assignment whose VALUE binds the psql command name: `PG=psql`,
    // `PSQL="/usr/bin/psql"`, `PG=p'sql'`, and the parameter-default forms
    // `PSQL="${PSQL:-psql}"` (and `-` `:=` `=` `:+` `+`), where the lexer
    // replaces the whole expansion with an opaque word and the command name
    // only exists at runtime. Decided by `assignmentBindingLines` over the
    // LEXED words above — see its comment for why the declaration-keyword and
    // quoting-position alternations are gone. The here-string family is a UNION
    // of two readings: `READ_HERE_STRING` against the spliced line, which is the
    // only reading that sees inside a `$(…)` body and is stricter-in-reverse on
    // prose, and the WORD route in `hereStringBindingLines`, which reads the
    // lexer's RETAINED redirection target and is therefore immune to quote
    // concatenation (ledger BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE, closed
    // 2026-08-20).
    // No literal prefilter here, deliberately, even though both readers
    // require a `psql` inside the text they match. A per-line substring guard
    // would be equivalent TODAY and is worth ~6s on the walk, but it is the
    // exact shape the R4 meta-test forbids module-wide — that prefilter shipped
    // once and silently disabled every decoding fix — and a guard is not worth
    // weakening for six seconds. The patterns are compiled once at module
    // scope, which is where the real cost was.
    const assigned =
      bindingLines.has(index) || hereStringLines.has(index)
        ? ["", ""]
        : textRouteBlocked
          ? null
          : READ_HERE_STRING.exec(spliced);
    // `alias psql=…`, including the whole-argument quotings `alias 'psql=…'`
    // and `alias "psql=…"`, plus a shell FUNCTION named psql.
    const aliased = /(?:^|\s)alias\s+(?:-\w+\s+)*["']?psql=/.exec(code);
    const functionDef = /(?:^|\s)(?:function\s+psql\b|psql\s*\(\s*\)\s*\{)/.exec(code);
    // `$GITHUB_ENV` and `$GITHUB_OUTPUT` are THE documented way one step hands
    // a value to a later one, so `echo "PSQL=psql" >> "$GITHUB_ENV"` binds a
    // command name exactly as `PSQL=psql` does — and was invisible, because the
    // assignment sits INSIDE a quoted argument where the assignment rule (which
    // requires whitespace or line start before the name) cannot see it. Gated
    // on the destination file so relaxing the boundary costs no precision
    // anywhere else: a line that writes neither is read exactly as before.
    // The destination is matched as a NAME, not as `$GITHUB_ENV`: PowerShell
    // spells it `$env:GITHUB_ENV`, where the `$` sits before `env:` and a
    // `\$\{?GITHUB_` pattern matches nothing.
    const githubEnvWrite =
      /\bGITHUB_(?:ENV|OUTPUT)\b/.test(spliced) &&
      /(?:^|[\s"'])[A-Za-z_]\w*=["']?[^\s"';|&]*\bpsql\b/.test(spliced)
        ? ["", ""]
        : null;
    // Tested against the LOGICAL line, not the physical one. A backslash-
    // newline continuation is ordinary formatting, and the site scanner has
    // always read logical commands — reading this rule per PHYSICAL line let
    // `bash -c '$0 …' \` + newline + `psql -X` put the interpreter and its
    // positional on different lines, where the rule could not see either. Same
    // `logical` join the bound-command rule uses, for the same reason.
    const positionalBinding = INTERPRETER_POSITIONAL_BINDING.test(logical) ? ["", ""] : null;
    const hit = assigned ?? aliased ?? functionDef ?? githubEnvWrite ?? positionalBinding;
    if (hit) hits.push({ file, line: index + 1, text: code.trim() });
  }
  return hits;
}

export function scanBinaryIndirection(source: string, file: string): IndirectionHit[] {
  const sourceFile = parseJs(source, file);
  const recognized = new Set<number>();
  const hits: IndirectionHit[] = [];
  // NESTED nodes produce overlapping composed texts, so the shell rules ran
  // over the same string many times per file — the dominant cost of the walk
  // once those rules grew. Memoised per call, which changes no verdict: the
  // rules are pure in `text` (and `file`, fixed here).
  const shellBoundCache = new Map<string, boolean>();
  const isShellBound = (text: string): boolean => {
    const cached = shellBoundCache.get(text);
    if (cached !== undefined) return cached;
    const bound = scanShellIndirection(text, file).length > 0;
    shellBoundCache.set(text, bound);
    return bound;
  };

  const mark = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node);
      const first = node.arguments[0];
      if (
        callee &&
        SPAWN_CALLEES.has(callee as PsqlSiteForm) &&
        first &&
        literalText(first) !== null
      )
        recognized.add(first.getStart(sourceFile));
    }
    ts.forEachChild(node, mark);
  };
  mark(sourceFile);

  const visitNode = (node: ts.Node): void => {
    const composed = composedText(node, sourceFile);
    const text = composed?.text ?? null;
    // A JS shell STRING can carry the same runtime binding a `.sh` file can:
    // `execSync('PG=psql; "$PG" -qAt mydb')` has a surviving literal `psql`,
    // executes an unprotected call, and yields no site — the command word only
    // exists after expansion. The header named this exact example as covered;
    // it was not, because the shell rules ran only on `.sh` and `.yml`.
    const shellBound = text !== null && isShellBound(text);
    const suspicious =
      text !== null && (isPsqlBinary(text) || looksLikePsqlCommandLine(text) || shellBound);
    // A shell-BOUND string is reported even when the node is a recognized
    // argv[0]: being scanned as shell text does not help when the command word
    // only exists after expansion, which is exactly what the site path misses.
    if (suspicious && (shellBound || !recognized.has(node.getStart(sourceFile)))) {
      hits.push({
        file,
        line: lineOf(sourceFile, node.getStart(sourceFile)),
        text: node.getText(sourceFile),
      });
    }
    ts.forEachChild(node, visitNode);
  };
  visitNode(sourceFile);
  return hits;
}

// ── workflow YAML ────────────────────────────────────────────────────────

/**
 * Workflow keys whose scalar value is TEXT THAT RUNS. `run:` is the obvious
 * one; the other three were each invisible until review demonstrated them (a
 * custom `shell:` template) or the sweep for that same shape found them (a
 * container action's `entrypoint`/`args`). Every other key in the schema names
 * data, a label, or a reference.
 */
const EXECUTABLE_WORKFLOW_KEYS = new Set(["run", "shell"]);

/**
 * `entrypoint` and `args` are deliberately NOT in that set: they are not two
 * independent scalars, they are ONE argv, and reading them apart is a false
 * safe. `entrypoint: env` + `args: ['-S', 'psql -F\_ -X mydb']` runs
 * `psql -F -X mydb` — env's split-string grammar makes `\_` an argument
 * separator, so `-X` is `-F`'s VALUE — while an item read as ordinary shell
 * text lexed one token `-F_` and certified the `-X` behind it. They are
 * composed into a command line by `composeContainerArgv` instead, which puts
 * every consumer grammar the reader already knows back in play.
 */
const CONTAINER_ARGV_KEYS = new Set(["entrypoint", "args"]);

/** Quote a word so the lexer re-splits it exactly as this argv element. */
function shellQuoteWord(word: string): string {
  return `'${word.split("'").join(`'\\''`)}'`;
}

/**
 * YAML keys under which a scalar BINDS A COMMAND NAME for later expansion.
 * `env` and `matrix` reach a `run:` as `$PSQL` / `${{ matrix.bin }}`; a
 * reusable workflow's or composite action's `inputs.<name>.default` reaches it
 * as `${{ inputs.bin }}`. None is statically resolvable, so all three are
 * tripwires rather than sites.
 */
const BINDING_WORKFLOW_KEYS = new Set(["env", "matrix", "inputs"]);

/**
 * A non-POSIX `run:` body is PYTHON or POWERSHELL source, not shell text, and
 * the reader does not parse either language.
 *
 * R36 tried: it pulled the body's literals out and lexed each as a command
 * line. That reader could CERTIFY, and certifying a language you do not parse
 * is the wrong shape — Python's `subprocess.run([...], shell=True)` uses only
 * the FIRST element as the command, so `["psql", "-X", "mydb"]` runs `psql`
 * with `-X` as the SHELL's `$0`, reaching psql never, and the reader called it
 * safe. Four more defects followed from the same design.
 *
 * So it does the one thing that cannot be wrong in the certifying direction: a
 * non-POSIX body that mentions psql is REPORTED, and no site is ever produced
 * from one. That is the same posture the whole file takes toward anything it
 * cannot read — refuse to certify, fail loudly, let a human resolve it.
 */
function nonPosixBodyMentionsPsql(body: string): boolean {
  return /\bpsql(?:\.exe)?\b/i.test(body);
}

/**
 * The shells whose `run:` body IS POSIX shell text. Deliberately a proof, not a
 * denylist.
 *
 * R37 enumerated the non-POSIX interpreters, and R38 showed that to be an OPEN
 * SET: `python3.12 -u {0}`, `pwsh.exe -File {0}`, `env python {0}` and
 * `${{ matrix.shell }}` each name an interpreter no list holds, and every one
 * of them was then read as shell. Inverting it closes the class by
 * construction: a body is lexed as shell only when its shell is PROVABLY bash
 * or sh, and everything else — including anything the reader cannot resolve at
 * all, such as an expression — is reported instead.
 */
const POSIX_SHELLS = new Set(["bash", "sh"]);

/** Stands in for "no `shell:` and no proof of the platform". It is deliberately
 * a value `shellIsPosix` rejects, so an unresolved runner fails closed. */
const UNPROVED_SHELL = "<unproved>";

/** Stands in for a `runs-on` that is PRESENT but not readable as a label — the
 * legal `{group: …}` / `{labels: …}` map forms. Distinct from absent, which is
 * a fragment rather than a platform claim. */
const UNREADABLE_RUNNER = "<unreadable-runner>";

/** GitHub's default shell is bash everywhere EXCEPT Windows, where it is
 * PowerShell Core. A label this reader cannot resolve — an expression, a
 * matrix value, a self-hosted tag — proves nothing either way, so only an
 * explicitly non-Windows runner counts. */
function platformIsProvablyNonWindows(runsOn: string | null): boolean {
  // ABSENT is not the same as UNRESOLVABLE. `runs-on` is required on a real
  // job, so a fragment without one is not a Windows job — it is a fragment,
  // and the ordinary default applies. What proves nothing is a label the
  // reader cannot read: an expression, a matrix value, a self-hosted tag.
  if (runsOn === null || runsOn.trim() === "") return true;
  if (runsOn.includes("$") || runsOn === UNREADABLE_RUNNER) return false;
  const labels = runsOn.toLowerCase().split(/\s+/).filter(Boolean);
  // A KNOWN GitHub-hosted image, matched at the START of the label rather than
  // anywhere in it. A substring test accepted `custom-linux-runner`, a
  // self-hosted tag that names no platform at all — the header already said a
  // self-hosted tag proves nothing, and the test did not enforce it.
  return labels.some((label) => /^(?:ubuntu|macos)(?:-|$)/.test(label));
}

/**
 * A `shell:` value names a POSIX shell — as a bare KEYWORD (`bash`), or as a
 * custom TEMPLATE whose command word is one (`bash -e {0}`, `/bin/bash {0}`).
 * An unset shell is GitHub's default, which is bash; that is the caller's job
 * to supply, since "unset" and "unreadable" must not be the same answer.
 */
function shellIsPosix(shell: string): boolean {
  const words = shell.trim().split(/\s+/).filter(Boolean);
  const head = words[0] ?? "";
  if (head === "" || head.includes("$")) return false; // an expression proves nothing
  if (!POSIX_SHELLS.has(head.slice(head.lastIndexOf("/") + 1))) return false;
  // Beginning with `bash` proves nothing about the BODY: a template may hand
  // `{0}` to another interpreter — `bash -c "python3 {0}"` runs Python. The
  // proof is that `{0}` is a DIRECT ARGUMENT of the shell, so every word
  // before it must be a dash-flag, and none of them may be a `-c`-family flag
  // whose operand is a command string rather than a script path.
  const rest = words.slice(1);
  const placeholder = rest.findIndex((word) => word.includes("{0}"));
  const leading = placeholder === -1 ? rest : rest.slice(0, placeholder);
  if (leading.some((word) => !word.startsWith("-"))) return false;
  if (leading.some((word) => /^-[a-z]*c/.test(word))) return false;
  // A template with no `{0}` at all is a bare keyword (`bash`), which is fine;
  // one WITH it must carry it as a whole word, not embedded in a quoted
  // command string.
  if (placeholder !== -1 && !/^["']?\{0\}["']?$/.test(rest[placeholder] ?? "")) return false;
  return true;
}

/**
 * Which SHELL each `run:` body is written in — the step's own `shell:`, else
 * the nearest enclosing `defaults.run.shell`, with YAML aliases resolved.
 *
 * SCOPED by construction: the walk descends from the document root and each
 * subtree inherits its parent's default and overrides only itself. One
 * document-wide variable let a job-level `bash` default overwrite the
 * workflow-level `python` default for UNRELATED jobs, so their python bodies
 * were read as shell and their psql calls vanished.
 *
 * Shared by both workflow scanners so they can never disagree about what
 * language a body is in.
 */
function resolveRunShells(document: ReturnType<typeof parseDocument>): Map<unknown, string> {
  // A pair may resolve to MORE THAN ONE effective shell: an anchored step list
  // reused under two job defaults is ONE pair node in two contexts. Storing a
  // single shell kept whichever context was walked first, and a visited-set
  // keyed on the node alone skipped the second entirely — so the python
  // reading of a shared step vanished behind its bash reading. Every context is
  // recorded, and a pair that is non-POSIX in ANY of them is treated as
  // non-POSIX: the guard may not certify a body it cannot prove is shell.
  const allShells = new Map<unknown, Set<string>>();
  const runShell = new Map<unknown, string>();
  const resolveNode = (n: unknown): unknown => {
    let node = n;
    for (let depth = 0; depth < 32; depth++) {
      const asAlias = node as { resolve?: unknown };
      if (typeof asAlias?.resolve !== "function") return node;
      node = (asAlias as { resolve: (d: unknown) => unknown }).resolve(document);
    }
    return node;
  };
  const scalarOf = (n: unknown): string | null => {
    const node = resolveNode(n);
    const text = (node as { value?: unknown } | undefined)?.value;
    return typeof text === "string" ? text : null;
  };
  const pairIn = (mapNode: unknown, name: string): { value?: unknown } | undefined => {
    const items = (resolveNode(mapNode) as { items?: unknown[] } | undefined)?.items;
    if (!Array.isArray(items)) return undefined;
    return items.find(
      (item) =>
        isPair(item as YamlNode as never) &&
        (item as { key?: { value?: unknown } }).key?.value === name,
    ) as { value?: unknown } | undefined;
  };
  const descend = (
    node: unknown,
    inherited: string | null,
    seen: Map<unknown, Set<string>>,
    inheritedPlatform: string | null,
  ): void => {
    const resolved = resolveNode(node);
    if (resolved === null || resolved === undefined) return;
    // Keyed by (node, inherited default): a shared anchor reached under two
    // different defaults is two different readings, not a repeat visit.
    const contexts = seen.get(resolved) ?? new Set<string>();
    const context = `${inherited ?? ""}\u0000${inheritedPlatform ?? ""}`;
    if (contexts.has(context)) return;
    contexts.add(context);
    seen.set(resolved, contexts);
    const items = (resolved as { items?: unknown[] } | undefined)?.items;
    if (!Array.isArray(items)) return;
    const defaultsRun = pairIn(pairIn(resolved, "defaults")?.value, "run");
    // `runs-on` decides what an UNSET shell means: GitHub documents bash on
    // every platform EXCEPT Windows, where it is PowerShell Core. A Windows
    // job's body was read as POSIX shell and CERTIFIED — and PowerShell
    // splatting removes an empty array, so `psql -F @opts -X mydb` really runs
    // `psql -F -X mydb`, where `-X` is `-F`'s value and suppresses nothing.
    // A runner this reader cannot resolve (an expression, a matrix value) is
    // not proof of anything, so it is treated as unproved too.
    const runsOnNode = pairIn(resolved, "runs-on")?.value;
    const runsOnScalar = scalarOf(runsOnNode);
    const runsOnSeq = ((resolveNode(runsOnNode) as { items?: unknown[] } | undefined)?.items ?? [])
      .map((item) => scalarOf(item))
      .filter((label): label is string => label !== null)
      .join(" ");
    // `runs-on` also has legal MAP forms (`{group: …}`, `{labels: …}`), which
    // read as neither a scalar nor a sequence of scalars. PRESENT-but-unreadable
    // is not the same as ABSENT: collapsing it to "" made it absent, and an
    // unset shell was then assumed bash on a Windows runner. Unreadable fails
    // closed.
    const runsOnPresent = runsOnNode !== undefined && runsOnNode !== null;
    const runsOn =
      runsOnScalar ?? (runsOnSeq !== "" ? runsOnSeq : runsOnPresent ? UNREADABLE_RUNNER : null);
    const platform = runsOn === null ? inheritedPlatform : runsOn;
    const scoped = scalarOf(pairIn(defaultsRun?.value, "shell")?.value) ?? inherited;
    const ownShell = scalarOf(pairIn(resolved, "shell")?.value);
    const runPair = pairIn(resolved, "run");
    if (runPair !== undefined) {
      // An unset shell is only PROVABLY bash on a runner proved non-Windows.
      const effective =
        ownShell ?? scoped ?? (platformIsProvablyNonWindows(platform) ? "bash" : UNPROVED_SHELL);
      if (effective !== null) {
        const seenShells = allShells.get(runPair) ?? new Set<string>();
        seenShells.add(effective);
        allShells.set(runPair, seenShells);
      }
    }
    for (const item of items) {
      if (isPair(item as YamlNode as never)) {
        descend((item as { value?: unknown }).value, scoped, seen, platform);
        continue;
      }
      descend(item, scoped, seen, platform);
    }
  };
  descend(document.contents, null, new Map(), null);
  for (const [pair, shells] of allShells) {
    // Prefer a non-POSIX reading when the contexts disagree — that is the
    // fail-loud direction, and the only one that cannot certify wrongly.
    const nonPosix = [...shells].find((shell) => !shellIsPosix(shell));
    runShell.set(pair, nonPosix ?? [...shells][0]!);
  }
  return runShell;
}

/**
 * The scalar styles whose RAW SOURCE SLICE is the shell text itself.
 *
 * A PLAIN scalar carries no delimiters, and a BLOCK scalar's delimiters are its
 * header line, which the reader blanks below. For those three, slicing the
 * source and handing it to the shell lexer is correct.
 *
 * The two QUOTED styles are deliberately absent, and that absence is the whole
 * of BL-SHELL-YAML-RUN-SCALAR-QUOTING-DECODE. Their delimiters belong to YAML,
 * and feeding them to the shell lexer is wrong in both forbidden directions at
 * once. A double-quoted `run: "echo >$(psql -qAt mydb"` opens a SHELL
 * double-quoted span on the YAML delimiter, and the `$(` inside it then
 * consumes the YAML CLOSING quote, so the lexer recovers a psql command word
 * out of a substitution body that exists only because two YAML delimiters were
 * read as shell — bash runs no psql there, and the site is fabricated. The
 * single-quoted spelling collapses to one literal word and goes silent instead.
 * Neither raw reading tells the truth about the command.
 *
 * The repair is a SUBTRACTION, not a second decoder: the decoded pass further
 * down already scans the scalar's VALUE, which is exactly the shell text a
 * quoted scalar carries, so declining the raw pass leaves the decoded one as
 * the only pass and every verdict stays intact. The escape-spelled command word
 * (`"\\x70sql -qAt mydb"`) is reachable ONLY that way and is pinned as such.
 *
 * A NAMED constant rather than an inline disjunction, so the accept-set is one
 * declaration a reader, a reviewer, and a mutant can each find, and so the
 * partition pin in the deciding suite has a single thing to assert against.
 */
export const RAW_IS_SHELL_TEXT_STYLES: ReadonlySet<string> = new Set([
  "PLAIN",
  "BLOCK_LITERAL",
  "BLOCK_FOLDED",
]);

export function scanWorkflowSource(source: string, file: string): PsqlSite[] {
  const sites: PsqlSite[] = [];
  let document;
  try {
    document = parseDocument(source, { keepSourceTokens: true });
  } catch {
    return sites;
  }
  const lineStartOf = (offset: number): number => source.slice(0, offset).split("\n").length - 1;

  const runShell = resolveRunShells(document);

  visit(document, {
    /**
     * A container action's command is `entrypoint` PLUS `args`, one argv. Read
     * apart they are two unrelated scalars and every consumer grammar is lost;
     * composed, `entrypoint: env` gets env's split-string rules, `sh` gets
     * `-c`, and so on. Each SEQUENCE item is one argv element and is quoted so
     * the lexer re-splits it identically; a SCALAR `args` is a command line
     * GitHub itself splits, so it goes in as written.
     */
    Map(_key: unknown, mapNode: unknown) {
      const items = (mapNode as { items?: unknown[] }).items;
      if (!Array.isArray(items)) return;
      const valueOf = (name: string): unknown =>
        items.find(
          (item) =>
            isPair(item as YamlNode as never) &&
            (item as { key?: { value?: unknown } }).key?.value === name,
        );
      const entrypointPair = valueOf("entrypoint") as { value?: unknown } | undefined;
      const argsPair = valueOf("args") as { value?: unknown } | undefined;
      if (!entrypointPair && !argsPair) return;
      const words: string[] = [];
      // An ALIAS is not a Scalar and not a Seq, so every alias spelling — an
      // aliased entrypoint, an aliased whole `args` sequence, an aliased ITEM
      // inside one — composed to nothing. The site path has resolved aliases
      // since R11 and the binding path since R29; this is the same contract.
      const resolved = (n: unknown): unknown => {
        let node = n;
        for (let depth = 0; depth < 32; depth++) {
          const asAlias = node as { resolve?: unknown };
          if (typeof asAlias?.resolve !== "function") return node;
          node = (asAlias as { resolve: (d: unknown) => unknown }).resolve(document);
        }
        return node;
      };
      const scalarText = (n: unknown): string | null => {
        const node = resolved(n);
        if (!isScalar(node as YamlNode as never)) return null;
        const text = (node as { value?: unknown }).value;
        return typeof text === "string" ? text : null;
      };
      const entrypoint = scalarText(entrypointPair?.value);
      if (entrypoint !== null) words.push(shellQuoteWord(entrypoint));
      if (argsPair) {
        const argsValue = resolved(argsPair.value);
        const argsItems = (argsValue as { items?: unknown[] } | undefined)?.items;
        if (Array.isArray(argsItems)) {
          for (const item of argsItems) {
            const text = scalarText(item);
            if (text !== null) words.push(shellQuoteWord(text));
          }
        } else {
          const inline = scalarText(argsValue);
          if (inline !== null) words.push(inline);
        }
      }
      if (words.length === 0) return;
      const anchor = (
        (entrypointPair ?? argsPair) as { key?: { range?: [number, number, number] } }
      ).key?.range;
      sites.push(...scanShellText(words.join(" "), file, anchor ? lineStartOf(anchor[0]) : 0));
    },
    Pair(_key: unknown, pair: unknown) {
      const node = pair as { key?: unknown; value?: unknown };
      if (!isPair(pair as YamlNode as never)) return;
      const key = node.key as { value?: unknown } | undefined;
      // Handled as one argv by the Map visitor above, never as scalars here.
      if (CONTAINER_ARGV_KEYS.has(key?.value as string)) return;
      // `run:` is the obvious executable scalar. `shell:` is the other one: a
      // CUSTOM shell is a documented TEMPLATE — GitHub substitutes the path of
      // the temporary script at `{0}` and runs the result — so
      // `shell: psql -f {0}` executes psql and reads startup files. It applies
      // at the step, and through `defaults.run.shell` at the job and workflow
      // level; all three are the same pair, so keying on the name covers them.
      // Requiring `{0}` is what keeps the STANDARD shells out: `shell: bash`,
      // `pwsh`, `python` are keywords GitHub maps to its own command lines, not
      // text it runs, and they name no psql in any case.
      // A container action (`uses: docker://…`) takes its command from
      // `with.entrypoint` and `with.args`, which GitHub passes to the container
      // as its command line. Same shape as `shell:`: a key other than `run:`
      // whose value is executable text. Scoped to those two names because the
      // rest of `with:` is ordinary action INPUT DATA — `node-version: 20`, a
      // summary string — and scanning all of it would report prose.
      if (!key || !EXECUTABLE_WORKFLOW_KEYS.has(key.value as string)) return;
      const isShellKey = key.value === "shell";
      if (key.value === "run") {
        const effective = runShell.get(pair);
        // A body in a language this reader does not parse produces NO site —
        // never a certified one — and is reported instead.
        if (effective !== undefined && !shellIsPosix(effective)) {
          return;
        }
      }
      // A `run: *cmd` ALIAS is not a scalar node. Anchors/aliases are
      // documented GitHub Actions reuse, so resolving is required, not
      // generous.
      const raw0 = node.value as { source?: unknown; resolve?: unknown };
      const value =
        raw0 && typeof (raw0 as { resolve?: unknown }).resolve === "function"
          ? ((raw0 as { resolve: (d: unknown) => unknown }).resolve(document) ?? node.value)
          : node.value;
      if (!isScalar(value as never)) return;
      const range = (value as { range?: [number, number, number] }).range;
      if (!range) return;
      const rawSlice = source.slice(range[0], range[1]);
      // A `shell:` value is only executable text when it is a CUSTOM TEMPLATE,
      // which GitHub identifies by the `{0}` placeholder it substitutes the
      // temporary script path into. Without one the value is a keyword
      // (`bash`, `pwsh`, `python`) naming a shell GitHub itself invokes.
      if (isShellKey && !rawSlice.includes("{0}")) return;
      // GitHub substitutes the script PATH for `{0}` before any shell runs, so
      // by the time the command line exists the placeholder is an ordinary
      // word. Leaving it in place read it as a shell BRACE, whose cardinality
      // is undecidable, and the reader then refused to certify a
      // `shell: psql -X -f {0}` that is in fact protected. The stand-in is
      // exactly three characters wide so every downstream offset — the ones
      // that map a site back to its physical line — still lines up.
      const substituteScriptPath = (text: string): string =>
        isShellKey ? text.split("{0}").join("_0_") : text;
      // A BLOCK scalar's first line is its HEADER (`|` or `>`, with optional
      // chomping/indent indicators and a trailing comment), not shell text. A
      // bare `>` was lexed as a redirection whose target swallowed the `psql`
      // command word, so the raw pass found nothing and the decoded fallback
      // pinned the site to the `run:` key instead of the physical line. Blank
      // the header rather than dropping it, so line numbers still line up.
      const raw = /^[|>][0-9+-]{0,2}\s*(?:#.*)?$/.test(rawSlice.split("\n", 1)[0] ?? "")
        ? rawSlice.replace(/^[^\n]*/, "")
        : rawSlice;
      // Anchor the line to the `run:` KEY. An alias resolves to a node defined
      // elsewhere (whose line is not where the command runs), and a decoded
      // escape can land on a physical line that is blank.
      const keyRange = (node.key as { range?: [number, number, number] } | undefined)?.range;
      const offset = lineStartOf(keyRange ? keyRange[0] : range[0]);
      // An ALIAS (`run: *cmd`) resolves to a scalar defined ELSEWHERE, so its
      // internal line offsets belong to the anchor, not to this step. Adding
      // them to the `run:` key's line invents a position: an eight-line
      // workflow reported its site on line 10. Pin every site from an alias to
      // the key itself, which is the documented anchoring contract.
      const aliased = range[0] < (keyRange?.[0] ?? 0);
      // The raw pass runs only where the raw slice IS shell text. For a QUOTED
      // scalar the delimiters are YAML's, and lexing them as shell fabricates a
      // site on one spelling and goes silent on the other; the decoded pass
      // below is then the only pass, which is the correct one for that style.
      const style = (value as { type?: string }).type;
      const rawIsShellText = style !== undefined && RAW_IS_SHELL_TEXT_STYLES.has(style);
      const found = rawIsShellText
        ? scanShellText(substituteScriptPath(raw), file, offset).map((site) =>
            aliased ? { ...site, line: offset + 1 } : site,
          )
        : [];
      // A double-quoted scalar can DECODE to a psql command whose raw slice
      // holds no recognizable word (`\\x70sql`, `\\u0070sql`, an escaped
      // newline). Scan the decoded value too and keep whatever the raw pass
      // missed; the decoded pass reports the scalar's own line.
      const decoded = (value as { value?: unknown }).value;
      // Scan the decoded scalar TOO, not only when the raw pass came up empty:
      // `run: "$(psql -X DSN)\npsql -qAt DSN"` has a raw-visible protected
      // substitution AND a decoded-only unprotected command, and "raw wins"
      // hid the second one entirely. Dedupe on the argv, not the line.
      // On the argv AND on every other field that DECIDES the verdict. Deduping
      // on argv alone threw away a decoded site that differed from the raw one
      // in exactly the field that matters, and it was a false safe in both
      // directions: a FOLDED scalar joins its lines with SPACES, so `run: >`
      // over `$PG` and `psql -X mydb` really runs `psql psql -X mydb` — `-X`
      // behind a positional, discarded under POSIXLY_CORRECT — while the raw
      // pass read the newline as a command SEPARATOR and certified a bare
      // `psql -X mydb`. The exemption side is the same defect: an exempt raw
      // site absorbed an identical-argv UNPROTECTED decoded one, lending it a
      // marker written for the first.
      const verdictIdentity = (site: PsqlSite): string =>
        [
          site.tokens.join("\u0000"),
          site.precedingWords.join("\u0000"),
          String(site.suppressesStartupFiles),
          site.exemptReason ?? "",
          String(site.hasDynamicTokens),
        ].join("\u0001");
      if (typeof decoded === "string" && decoded !== rawSlice) {
        const seen = new Set(found.map(verdictIdentity));
        for (const site of scanShellText(substituteScriptPath(decoded), file, offset)) {
          // A DECODED line number is an offset into the decoded value, which
          // does not correspond to a physical line (an escaped `\n` consumes
          // none). Pin these to the `run:` key rather than inventing a line
          // that may be blank or absent.
          if (!seen.has(verdictIdentity(site))) found.push({ ...site, line: offset + 1 });
        }
      }
      sites.push(...found);
    },
  });
  return sites;
}

/**
 * The workflow twin of `scanShellIndirection`.
 *
 * A workflow binds a command name the same way a `.sh` file does, but spells it
 * `NAME: value` rather than `NAME=value`, so the shell tripwire — which reads
 * an assignment — saw none of it. GitHub documents `env:` at the WORKFLOW, JOB,
 * and STEP level, and a `matrix` value is substituted into `run:` before the
 * shell ever sees it; `env: {PSQL: psql}` + `run: $PSQL -qAt mydb` and
 * `matrix: {bin: [psql]}` + `run: ${{ matrix.bin }} …` therefore each executed
 * an unprotected psql while producing neither a site nor a hit.
 *
 * Like every other tripwire here it RESOLVES NOTHING — the expansion only
 * exists at runtime. It reports, and a human decides.
 *
 * Scoped to `env`/`matrix` deliberately. Every workflow in this tree carries
 * `name: Install psql (…)` and a `run: command -v psql …` probe; a rule that
 * fired on any psql-shaped scalar anywhere would report all of them, and a
 * tripwire that is always on is a tripwire nobody reads.
 */
export function scanWorkflowIndirection(source: string, file: string): IndirectionHit[] {
  const hits: IndirectionHit[] = [];
  let document;
  try {
    document = parseDocument(source, { keepSourceTokens: true });
  } catch {
    return hits;
  }
  const lineStartOf = (offset: number): number => source.slice(0, offset).split("\n").length - 1;

  /** A scalar that BINDS the command name: one word that is psql or a path to
   * it (`psql`, `/usr/bin/psql`), or a multiword value that LEXES to a psql
   * invocation. It deliberately does NOT require a flag: psql needs none —
   * `env: {DB: "psql mydb"}` is the ordinary spelling, and requiring one made
   * every binding context silent for it while the header promised a loud
   * backstop. Ordinary values stay quiet because they contain no psql at all
   * (`postgres://…`, `pg_dump mydb`, a retry sentence). A psql-shaped SENTENCE
   * under a binding key is reported, which is the fail-loud direction this file
   * takes everywhere else: a human reads one message. */
  const bindsPsql = (text: string): boolean => {
    // Case-INSENSITIVE, with an optional `.exe`, matching `isPsqlName`: the
    // command recognizers were made Windows-aware in R39 while this one was
    // left behind, so `env: {PG: PSQL.EXE}` bound the command name silently.
    if (!/\bpsql(?:\.exe)?\b/i.test(text)) return false;
    if (!/\s/.test(text.trim())) return true;
    return scanShellText(text, file, 0).length > 0;
  };

  /**
   * Walked by hand rather than through `visit`, because an ALIAS is not a
   * Scalar and `visit` never resolves one. `PSQL: *bin`, `env: *db-env`, a
   * matrix alias and an input-default alias are all documented configuration
   * REUSE — GitHub resolves them before the workflow runs — and every one of
   * them was silent while the site path had resolved aliases since R11.
   *
   * `followed` bounds a self-referential anchor; YAML permits the cycle and a
   * naive resolver would not return. It tracks ALIASES ONLY. Tracking every
   * visited node instead made the anchor's DEFINITION — visited first, usually
   * under a key that binds nothing — poison its own alias: the alias resolved
   * to an already-seen node and returned before the binding check ran, so all
   * four alias spellings still reported nothing.
   */
  const followed = new Set<unknown>();
  const walkNode = (node: unknown, underBinding: boolean, aliasRange?: number): void => {
    if (node === null || node === undefined) return;
    const asAlias = node as { resolve?: unknown; range?: [number, number, number] };
    if (typeof asAlias.resolve === "function") {
      if (followed.has(node)) return;
      followed.add(node);
      // Report at the alias's USE, not at the anchor's definition: the use is
      // where the binding takes effect, and the definition may sit under a key
      // that binds nothing.
      walkNode(
        (asAlias as { resolve: (d: unknown) => unknown }).resolve(document),
        underBinding,
        asAlias.range?.[0] ?? aliasRange,
      );
      return;
    }
    const items = (node as { items?: unknown[] }).items;
    if (Array.isArray(items)) {
      for (const item of items) {
        if (isPair(item as YamlNode as never)) {
          const pair = item as { key?: { value?: unknown }; value?: unknown };
          const childBinds = underBinding || BINDING_WORKFLOW_KEYS.has(pair.key?.value as string);
          walkNode(pair.value, childBinds, aliasRange);
          continue;
        }
        // A sequence item — `matrix: {bin: [psql]}`.
        walkNode(item, underBinding, aliasRange);
      }
      return;
    }
    if (!underBinding) return;
    const value = (node as { value?: unknown }).value;
    if (typeof value !== "string" || !bindsPsql(value)) return;
    const at = aliasRange ?? (node as { range?: [number, number, number] }).range?.[0];
    hits.push({
      file,
      line: at === undefined ? 1 : lineStartOf(at) + 1,
      text: value.trim(),
    });
  };
  walkNode(document.contents, false);

  /**
   * An environment-file write is a binding whose NAME and VALUE need not share
   * a physical line. GitHub documents a multiline DELIMITER form —
   * `echo 'PSQL<<EOF'`, the value, `echo 'EOF'`, redirected to `$GITHUB_ENV` —
   * and PowerShell writes through `$env:GITHUB_ENV`. A line-scoped rule saw
   * neither. Scoped to the `run:` SCALAR, which is the unit that actually runs:
   * a step that writes an environment file and mentions psql anywhere in the
   * same script is binding one, and reporting it is the fail-loud direction.
   * Checked against this tree at authoring time (2026-08-03): zero `run:`
   * blocks pair an environment-file write with any psql mention, so this costs
   * no precision here — the `command -v psql` availability probe writes no
   * environment file.
   */
  const runShellFor = resolveRunShells(document);
  visit(document, {
    Pair(_key: unknown, pair: unknown) {
      if (!isPair(pair as YamlNode as never)) return;
      const node = pair as { key?: { value?: unknown }; value?: unknown };
      if (node.key?.value !== "run") return;
      // A body in a language this reader does not parse is REPORTED rather
      // than read. `scanWorkflowSource` produces no site from one, so without
      // this it would be silent — and silence is the one outcome a guard may
      // never give a command it cannot read.
      const effectiveShell = runShellFor.get(pair);
      if (effectiveShell !== undefined && !shellIsPosix(effectiveShell)) {
        // `run: *py` is an ALIAS node, which has no `.value` of its own —
        // reading it directly gave an empty body and the tripwire stayed
        // silent on documented configuration reuse.
        const bodyNode = node.value as { resolve?: unknown; value?: unknown } | undefined;
        const body = (
          typeof bodyNode?.resolve === "function"
            ? ((bodyNode as { resolve: (d: unknown) => unknown }).resolve(document) as
                | {
                    value?: unknown;
                  }
                | undefined)
            : bodyNode
        )?.value;
        if (typeof body === "string" && nonPosixBodyMentionsPsql(body)) {
          const at = (node.key as { range?: [number, number, number] } | undefined)?.range;
          hits.push({
            file,
            line: at ? lineStartOf(at[0]) + 1 : 1,
            text: `${effectiveShell.trim()} body mentions psql`,
          });
          return;
        }
      }
      const text = (node.value as { value?: unknown } | undefined)?.value;
      if (typeof text !== "string") return;
      if (!/\bGITHUB_(?:ENV|OUTPUT)\b/.test(text) || !/\bpsql\b/.test(text)) return;
      const keyRange = (node.key as { range?: [number, number, number] } | undefined)?.range;
      hits.push({
        file,
        line: keyRange ? lineStartOf(keyRange[0]) + 1 : 1,
        text: text.trim().split("\n")[0] ?? text.trim(),
      });
    },
  });
  return hits;
}

// ── dispatch + walk ──────────────────────────────────────────────────────

function extensionOf(file: string): string {
  const at = file.lastIndexOf(".");
  return at === -1 ? "" : file.slice(at);
}

/**
 * An exemption marker covers ONE invocation. `exemptionOnLines` is line-scoped —
 * it answers "is there a marker on this line or the one above" — which let a
 * single marker bleed across sites: two calls on adjacent lines both claimed a
 * marker written for the first, and `psql a; psql b # marker` exempted both.
 * A marker claimed by more than one site therefore exempts NONE of them, which
 * is the fail-closed direction and produces a loud message rather than a silent
 * pass. (No site in the tree uses an exemption, so this costs nothing today; it
 * exists so the first one cannot quietly cover its neighbour.)
 */
function dropSharedExemptions(sites: PsqlSite[]): PsqlSite[] {
  const claims = new Map<string, number>();
  for (const site of sites) {
    if (site.exemptReason === null) continue;
    const key = `${site.exemptReason}\u0000${site.line}`;
    claims.set(key, (claims.get(key) ?? 0) + 1);
  }
  // A reason claimed on two DIFFERENT lines is the adjacent-line bleed; the same
  // reason twice on ONE line is the same-line bleed. Count by reason overall.
  const byReason = new Map<string, number>();
  for (const site of sites) {
    if (site.exemptReason === null) continue;
    byReason.set(site.exemptReason, (byReason.get(site.exemptReason) ?? 0) + 1);
  }
  return sites.map((site) =>
    site.exemptReason !== null && (byReason.get(site.exemptReason) ?? 0) > 1
      ? { ...site, exemptReason: null }
      : site,
  );
}

export function scanSource(source: string, file: string): PsqlSite[] {
  const extension = extensionOf(file);
  if (YAML_EXTENSIONS.includes(extension))
    return dropSharedExemptions(scanWorkflowSource(source, file));
  if (SHELL_EXTENSIONS.includes(extension))
    return dropSharedExemptions(scanShellText(source, file, 0));
  return dropSharedExemptions(scanJsSource(source, file));
}

/**
 * A path the walk could not read. RECORDED, never swallowed: an earlier cut
 * returned early on `readdirSync` failure with a comment claiming that could not
 * hide a call site. A review probe disproved it — `chmod 000 scripts/ci` dropped
 * the census from 73 to 71 and the guard still passed, which is precisely the
 * silent under-count this whole file exists to prevent. Unreadable now fails the
 * meta-test.
 */
function walk(
  directory: string,
  out: string[],
  unreadable: string[],
  skipAtRoot: Set<string>,
  depth = 0,
): void {
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    unreadable.push(directory);
    return;
  }
  for (const entry of entries) {
    if (IGNORED_ANYWHERE.has(entry)) continue;
    if (depth === 0 && skipAtRoot.has(entry)) continue;
    const full = join(directory, entry);
    let stats;
    try {
      stats = statSync(full);
    } catch {
      unreadable.push(full);
      continue;
    }
    if (stats.isDirectory()) walk(full, out, unreadable, skipAtRoot, depth + 1);
    else if (SCANNED_EXTENSIONS.includes(extensionOf(entry))) out.push(full);
  }
}

/**
 * Run one per-file analyzer, and NAME THE FILE if it throws.
 *
 * A scan error is rethrown, never caught-and-continued: a swallowed one is a
 * silent under-count, the exact class the walk's `unreadable` ledger exists to
 * prevent. What this adds is the path. The `.gitignore` gap that shipped this
 * guard's worst local failure surfaced as a bare `RangeError: Maximum call
 * stack size exceeded` from inside `visit`, naming nothing, so finding the file
 * took a bisect. The next unknown pathological file names itself instead.
 *
 * Applied to EVERY per-file analyzer call in `collectPsqlUsage` — the scan,
 * indirection and workflow passes alike, not only the path a fixture happens to
 * exercise. The deciding suite pins that structurally.
 */
export function analyzeNaming<T>(relPath: string, analyze: () => T): T {
  try {
    return analyze();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`psql startup-file scan failed on ${relPath}: ${reason}`, { cause: error });
  }
}

export function collectPsqlUsage(repoRoot: string): PsqlUsage {
  const files: string[] = [];
  const unreadableAbsolute: string[] = [];
  walk(repoRoot, files, unreadableAbsolute, rootSkipNames(repoRoot));
  files.sort();

  const sites: PsqlSite[] = [];
  const indirections: IndirectionHit[] = [];
  const unreadable = unreadableAbsolute.map((p) => relative(repoRoot, p).split(sep).join("/"));
  for (const full of files) {
    let source: string;
    try {
      source = readFileSync(full, "utf8");
    } catch {
      unreadable.push(relative(repoRoot, full).split(sep).join("/"));
      continue;
    }
    // NO `source.includes("psql")` prefilter. It looks free and it silently
    // undid every decoding fix in this file: `p"s"ql`, `p\s\q\l`, a
    // backslash-newline splice, YAML `\x70sql`, and `"ps" + "ql"` all invoke
    // psql while containing no literal `psql`, so the prefiltered walk never
    // handed them to the scanner that knows how to read them.
    const rel = relative(repoRoot, full).split(sep).join("/");
    sites.push(...analyzeNaming(rel, () => scanSource(source, rel)));
    if (JS_EXTENSIONS.includes(extensionOf(full)) && !SELF.includes(rel))
      indirections.push(...analyzeNaming(rel, () => scanBinaryIndirection(source, rel)));
    // The SHELL side needs its own tripwire. The header used to name
    // `scanBinaryIndirection` as the backstop for an expanded command word, but
    // that function only ever ran on JS files, so `PG=psql; "$PG" -qAt mydb`
    // was invisible and `alias psql="psql -F"` could turn a certified `-X` into
    // `-F`'s value. Neither is statically resolvable; both are now LOUD.
    if (!JS_EXTENSIONS.includes(extensionOf(full)) && !SELF.includes(rel))
      indirections.push(...analyzeNaming(rel, () => scanShellIndirection(source, rel)));
    // YAML needs BOTH: the shell rules still apply to the shell text inside a
    // `run:` scalar, and the workflow rules cover the bindings only YAML can
    // spell (`env:`, `matrix`), which no `NAME=value` reader can see.
    if (YAML_EXTENSIONS.includes(extensionOf(full)) && !SELF.includes(rel))
      indirections.push(...analyzeNaming(rel, () => scanWorkflowIndirection(source, rel)));
  }
  return { sites, indirections, unreadable, filesScanned: files.length };
}
