/**
 * Every DECODED title this arc's own fixtures use — the SINGLE SOURCE for both the
 * suites that assert them and the meta-test that proves none of them collides with a
 * real title in the live corpus.
 *
 * ── WHY THIS EXISTS AS DATA RATHER THAN A NONCE GREP ────────────────────────────
 * The strictly weaker implementation the pin-grammar suite must kill is "the seven
 * live pin titles, hardcoded" (spec §6). It passes the corpus assertion AND every
 * accept case whose title was copied from the corpus, so no accept-case title may
 * appear anywhere in the live corpus.
 *
 * The obvious cover — grep a nonce token against the enrolled suites — is **keyed on a
 * naming convention, and a check keyed on a naming convention is blind to every entry
 * that does not use it, silently and totally.** An accept title written tomorrow
 * without the nonce would never be offered to the check, which would report a
 * confident zero. Measured on this very repo the same night: a ledger reconciliation
 * keyed on a `BL-`/`DEF-` id prefix scored ZERO for all 21 `DEFERRED.md` entries,
 * which use custom ids, across two separate runs — the second of which had already
 * been widened once and looked complete.
 *
 * So the cover is keyed on the DATA instead. `_metaDeclaredLimitPins.test.ts`
 * intersects `ALL_SYNTHETIC_TITLES` with the pin set the shipped scanner discovers
 * over the enrolled suites, and a title added here is covered by construction rather
 * than by remembering to spell it a particular way. The suites assert BY REFERENCE to
 * these entries, so a fixture whose source drifts from its title fails immediately
 * instead of quietly leaving the cover pointing at a string nothing uses.
 */

export const SYNTHETIC_TITLES = {
  // ── accept set (spec §3.1) ────────────────────────────────────────────────────
  alphaLeading: "documented limit: the qplinth alpha ratchet holds",
  betaMedial: "the qplinth beta gate is a known miss under burst",
  gammaTrailing: "the qplinth gamma valve remains a declared miss",
  deltaUpper: "the qplinth delta hook is a DOCUMENTED LIMIT",
  /** Source-spelled with `\"`; this is the DECODED form the runtime name carries. */
  epsilonEscapedQuote: 'the qplinth "epsilon" shim is a known miss',
  /** Source-spelled with `\\`; decodes to exactly ONE backslash (spec §3.1 item 2). */
  zetaBackslash: "a qplinth zeta path C:\\tmp is a declared miss",
  omicronIndented: "the qplinth omicron latch is a known miss",
  alphaLineProbe: "the qplinth alpha ratchet holds as a documented limit",

  /** The live pin every decline fixture carries, so no negative is asserted as emptiness. */
  piCompanion: "the qplinth pi anchor is a documented limit",

  // ── declines the CORE decides (opener anchor, first-argument literal) ──────────
  etaDescribe: "the qplinth eta cluster is a documented limit",
  thetaEach: "the qplinth theta row is a known miss",
  iotaTemplate: "the qplinth iota bay is a documented limit",
  kappaMultilineCall: "the qplinth kappa arm is a documented limit",
  lambdaSecondArg: "plain qplinth lambda heading is a documented limit",
  muSlashComment: "the qplinth mu duct is a known miss",

  // ── spans PREPARATION decides (asserted at the core's grain, Task 7b proves them) ──
  xiBlockComment: "the qplinth xi relay is a documented limit",
  nuMultilineString: "the qplinth nu seam is a documented limit",

  // ── grain, dispositions, and a near-miss phrase ───────────────────────────────
  omegaGrain: "the qplinth omega ledger is a declared miss set",
  sigmaDispositioned: "the qplinth sigma bridge is a documented limit",
  tauLive: "the qplinth tau hinge is a known miss",
  /** A pin sitting AFTER another call on the same physical line (the second axis of
   *  the opener boundary). Declined — conservative, a missed advisory never a false one. */
  psiSecondOnLine: "the qplinth psi coupler is a documented limit",
  /** Carries NO member of the three-phrase accept set — the §8 item 6 near miss. */
  rhoNearMiss: "the qplinth rho bolt stays a limit",
} as const;

export const ALL_SYNTHETIC_TITLES: readonly string[] = Object.values(SYNTHETIC_TITLES);
