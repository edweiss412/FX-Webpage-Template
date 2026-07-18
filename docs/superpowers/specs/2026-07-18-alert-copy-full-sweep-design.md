# Alert copy full sweep — concise inline-context copy for all 45 admin alert codes

**Status:** Ratified via AskUserQuestion 2026-07-18 (autonomous pipeline approved; spec+plan user gates waived). Follow-up to PR #469 (`docs/superpowers/specs/2026-07-17-condensed-alert-copy-design.md`), which treated ROLE_FLAGS_NOTICE fully and 12 health codes partially. User feedback: the class sweep was intended to cover **every** bell alert with the full treatment, and the show-page navigation was meant to be the **chevron**, not a text link.

## 1. Ratified decisions

1. **All 44 remaining admin bell alert codes** (45 total incl. ROLE_FLAGS_NOTICE) get the full treatment: condensed dougFacing with identity context woven inline, `helpfulContext: null`, no longform expansion anywhere.
2. **Chevron = show-page nav.** The bell caret (formerly the longform expander) becomes a link to `/admin/show/<slug>`; the "Review in show page" text link is removed. "Open in Sheet" (and other code-specific action links) stay.
3. **Longform content migrates to help pages.** Each code's old helpfulContext content is adapted into its `longExplanation` on `/help/errors`; `helpHref` anchors it.

## 2. Scope boundaries

- **In scope:** the 45 `ADMIN_ALERTS_CODES` (`tests/messages/adminAlertsRegistry.ts:9`). Catalog copy, §12.4 lockstep, BellPanel, PerShowAlertSection, help-errors page, registries/meta-tests, `deriveAlertMessageParams` extensions.
- **Out of scope:** crew-facing copy (`crewFacing`), non-alert catalog codes, HealthAlertsPanel UI (it renders no helpfulContext today — `components/admin/telemetry/HealthAlertsPanel.tsx:84-121`; only its params coverage extends), DB.
- Health-audience codes (`lib/adminAlerts/audience.ts:14`): `PerShowAlertSection.tsx:157-159` excludes them, and the NON-developer bell excludes them too (`bellAudience.ts:8-11` feeds `bellExcludedCodes`, `bellFeed.ts:219-223`; `app/admin/layout.tsx:68-70` documents it). The DEVELOPER bell is the exception (`bellAudience.test.ts:13-16`): health rows render there through the same title/dougFacing/identity-chip template with a "View in telemetry" action (`BellPanel.tsx:405-441`, :248-284). So health dougFacing/chip is live UI on the developer bell + HealthAlertsPanel; bell tests cover the developer-bell path explicitly. Their helpfulContext renders nowhere today — longform migration for them is catalog + appendix + help-page work.

## 3. Copy contract (every code)

- `dougFacing` ≤ 2 sentences. First sentence carries the fact WITH identity woven in where the identity map declares segments (`lib/adminAlerts/alertIdentityMap.ts:58-283`): show-segment codes use `<show-name>`, sheet-segment codes `<sheet-name>`, contextField codes their specific param. Global codes (15 per the live ALERT_IDENTITY_MAP body; the file's header comment claiming "18 global / 47 codes" is stale and gets corrected in this sweep) get a concision pass only — no identity token forced in.
- Optional second sentence: the one action Doug should take (or "No action needed…"). Everything else moves to `longExplanation`.
- Straight quotes U+0027. No jargon codes in copy. Human sentences (invariant 5 + PRODUCT.md voice).
- Params resolve at render time via `deriveAlertMessageParams` (priority: identity-resolved (quoted) > context-supplied > always-resolving fallback — `lib/adminAlerts/deriveMessageParams.ts:57-65`). **Identity-segment mapping extension (required):** today only labels Sheet/Show map to params (`deriveMessageParams.ts:31-39,134-144`). The sweep extends the mapping table so every segment type used by an inline template feeds its param — label "Crew" → `crew-name`, label-less email segments → `email`, count segments → their declared param (e.g. `crew-row-count`), contextField segments → their param (e.g. `failed-sheet-names` from the Sheet-labeled contextField at `alertIdentityMap.ts:138-139`). Without this, an identity-bearing row could fallback-resolve the template, suppress the chip, and HIDE real identity values (the codex R1 HIGH). A structural meta-test pins: every `<token>` in an inline_member template is either identity-mapped, context-passthrough, or a declared fallback param — and every inline_member code's identity segments that carry user-facing values have a mapping row. Every NEW placeholder introduced by the sweep MUST gain an always-resolving fallback in `deriveAlertMessageParams`; the health-template coverage meta-test (`tests/adminAlerts/_metaHealthTemplateCoverage.test.ts`) plus a NEW analogous all-admin-codes coverage meta-test pin this for every code (walk `ADMIN_ALERTS_CODES`, assert `deriveAlertMessageParams(code, null, null)` fully resolves the template).
- New fallback params this sweep introduces (finalized from the §6 copy table): `crew-row-count` ("two or more crew rows"), `failed-sheet-names` ("some sheets"), `crew-count` ("some"), `show-date` ("an upcoming date"), `email` ("an email address" — fallback only; raw email stays behind existing pii redaction), `crew-name` ("a crew member") — each gets an always-resolving fallback in `deriveAlertMessageParams`; per-contextField scalars remain covered by passthrough (`deriveMessageParams.ts:124-133`).
- `PENDING_SNAPSHOT_DELETE_STUCK` joins `INLINE_IDENTITY_CODES` (it declares a show segment but previously carried no inline token — batch C).
- §6 authority: `inline_member: yes` rows (30 total) define the final `INLINE_IDENTITY_CODES` membership; the bidirectional meta-test pins the set against the templates.
- **Titles:** every code keeps its existing title; `SHOW_FIRST_PUBLISHED` (only null title) gets `title: "Show published"`.

## 4. Surface contracts

### 4.1 BellPanel (`components/admin/BellPanel.tsx`)
- Caret (`bell-caret-{alertId}`, :412-420) is REWORKED: renders as a `<a>` link to `/admin/show/${encodeURIComponent(slug)}` when `entry.slug` non-null; hidden exactly when `entry.slug` is null — note this is a SLUG predicate, not an identity-map-kind predicate (e.g. BRANCH_PROTECTION_* are inline_member:yes with repo segments yet upsert with null show → null slug → no caret). Keeps ChevronRight glyph, gains `aria-label="Open show page"`. It is no longer gated on helpfulContext and no longer toggles anything.
- Expansion state + context box (`bell-context-{alertId}`, :431-441) DELETED. `rowHelpfulContext` helper deleted.
- Full-row toggle (`bell-entry-toggle`, :382-428) keeps its mark-read behavior but must NOT nest the caret link inside the toggle button (nested-interactive a11y violation): caret link renders as a sibling positioned in the row's top-right, outside the `<button>` — same pattern as ActionCell links.
- Identity chip suppression (`:332,442`) extends: `INLINE_IDENTITY_CODES` grows to every code whose new template carries an identity token; suppression stays conditional on `messageResolved` (fail-safe unchanged).
- `resolveAlertActions` ROLE_FLAGS_NOTICE special case (`lib/adminAlerts/alertActions.ts:151-160`) REMOVED — reverts to delegating to the singular resolver (sheet link only). The chevron now carries show-page nav for every row with a slug.

### 4.2 PerShowAlertSection (`components/admin/PerShowAlertSection.tsx`)
- Always-visible help block (`per-show-alert-help-{id}`, :348-356) DELETED (its content lives on /help/errors now).
- Identity line suppression (:400-408) extends with the grown `INLINE_IDENTITY_CODES` set, same resolved-guard.
- No chevron added — the card already lives on the show page.

### 4.3 HealthAlertsPanel
- No markup change. Params derivation gains the new fallbacks automatically via `deriveAlertMessageParams`; coverage pinned by the (extended) template-coverage meta-test.

### 4.4 Help errors page (`app/help/errors/`)
- Every one of the 45 codes becomes renderable: fill `longExplanation` (adapted from old helpfulContext; where helpfulContext was thin, adapt from dougFacing's dropped detail) and `helpHref: "/help/errors#<CODE>"` and ensure non-null title. **Exception (ratified carve-out, E-content.md R2):** WARN_/PARSE_ codes keep `helpHref: "/help/admin/parse-warnings#<CODE>"` — the dedicated parse-warnings page is the richer curated target, pinned by `_metaErrorCatalogDocs.test.ts:237`. For this sweep that means PARSE_ERROR_LAST_GOOD retains its parse-warnings anchor.
- `isRenderable` (`app/help/errors/page.tsx:23-31`) drops the `severity !== "info"` clause: renderable = dougFacing, title, longExplanation, helpHref all non-null. (Info-severity alert codes like ROLE_FLAGS_NOTICE and SHOW_FIRST_PUBLISHED carry real education content after migration.)
- `_families.ts` gains prefixes for any of the 45 codes not already covered by the 7 families, so none land in the "Other" fallback (pinned by `tests/help/errors-grouping.test.tsx`).

## 5. Registry / meta-test / generator fanout

| Surface | Change |
|---|---|
| `INLINE_IDENTITY_CODES` (`alertIdentityMap.ts:293-307`) | Grows from 13 to every code whose template carries an identity token (finalized in copy table; global codes excluded). Bidirectional meta-test (`tests/adminAlerts/_metaInlineIdentityContract.test.ts`) continues to pin set == template-token-bearing codes. |
| `catalog.test.ts:223-246` helpfulContext×dougFacing coverage | Inverted for admin codes: every `ADMIN_ALERTS_CODES` member MUST have `helpfulContext: null`; non-admin codes keep the old both-non-null rule. Per-code exemption list deleted. |
| Copy-hygiene wrapper allowlist (`catalog.test.ts:196`) | Already imports `INLINE_IDENTITY_CODES` — grows automatically. |
| `_metaErrorCatalogDocs.test.ts` predicate biconditional (:30-60) | All 45 codes become predicate entries (title+longExplanation+helpHref non-null); ROLE_FLAGS_NOTICE title exemption deleted (subsumed). |
| `_metaAdminAlertCatalog.test.ts` INTERPOLATED_DOUG_FACING_CODES | Every newly-templated code registered (read-time derivation comment); consider replacing the hand-list with an import/spread of the registry + non-inline legacy rows. |
| `scripts/extract-spec-codes.ts:85` | `INLINE_CONTEXT_CODES_WITHOUT_HELPFUL_CONTEXT` set replaced by a structural rule: admin alert codes are exempt from the appendix-helpfulContext requirement (import the registry list or match against §12.4 admin-alert marker). |
| §12.4 master spec | 45 dougFacing cell rewrites + 44 appendix helpfulContext line deletions + SHOW_FIRST_PUBLISHED title fill + longExplanation additions IF §12.4 carries them (verify: longExplanation lives in catalog only — appendix edit is helpfulContext lines only). Three-way lockstep per batch commit: prose + `pnpm gen:spec-codes` + catalog.ts. |
| `gen:internal-code-enums` | Re-run + commit if enums shift (x2 gate). |
| `_metaHealthTemplateCoverage` | Extend walk from health-audience to ALL `ADMIN_ALERTS_CODES` (rename or sibling test): every template resolves with null context/identity. |
| Bell tests | Caret/expansion contracts rewritten in ALL pinned surfaces: `bellPanelRedesign.test.tsx:220-291` (caret = nav link present iff slug; expansion tests deleted; orphan-check invariant replaced by all-admin-null contract), `bellPanelDeferrals.test.tsx:125-165`, `bellPanelActions.test.tsx:279-304`, and real-browser `tests/e2e/bell-panel-layout.spec.ts:97-107,344-346` (caret/help-context expansion assertions become chevron-nav assertions). |

## 6. Per-code copy table

The full 45-row table (old → new dougFacing, params used, INLINE_IDENTITY_CODES membership, longExplanation adapted from old helpfulContext, title fill) is authored in family batches and appended below as §6.a–§6.c. Rules of §3 bind every row; the table is the single source of truth for Task briefs.

<!-- COPY TABLE BATCHES APPENDED BELOW -->

## 6.a Copy batch a

# Alert copy batch A — 13 codes

Per docs/superpowers/specs/2026-07-18-alert-copy-full-sweep-design.md §3. Straight quotes only.

---

### AMBIGUOUS_EMAIL_BINDING

- Old dougFacing: "Two crew rows share the same email, so Google login is unsafe to resolve. The duplicate-email check normally catches this; please re-share the sheet so we can re-parse, or contact the developer."
- Old helpfulContext: "When two people on the crew list share the same email address, we can't safely tell who's logging in. The duplicate-email check should normally catch this in the parse step. If you're seeing this code, the safest fix is to look at the most recent edits to your crew block. Usually one of the two emails is a typo or a paste mistake. Once you correct the duplicate in your sheet, mark this alert resolved from the affected show's page."

- **new_dougFacing:** In <show-name>, <email> is shared by <crew-row-count>, so Google login can't safely tell who's who. Fix the duplicate in the sheet, or contact the developer if it keeps happening.
- **inline_member:** yes
- **params:** show-name → "this show" (existing); email → "an email address" (existing sweep fallback); crew-row-count → "two or more crew rows" (NEW — segment `count:crew_member_count` label "crew row")
- **new_longExplanation:** This appears when two crew rows in a show's sheet share the same email address, so the app can't safely tell which row a Google sign-in should map to. The duplicate-email check in the parser should normally catch this during a sync — seeing this alert usually means a recent edit introduced the duplicate, often a typo or a paste mistake in one of the two email cells. Look at the most recent edits to the crew block, correct the duplicate, and the next sync clears it. You can also mark the alert resolved from the show's page once it's fixed.
- **title:** Two crew rows share an email (unchanged)

---

### OAUTH_IDENTITY_CLAIMED

- Old dougFacing: "A crew identity was claimed through Google sign-in."
- Old helpfulContext: "The OAuth claim path stamped a crew row as claimed by a signed-in user. Future picker attempts for that row must route through Google sign-in."

- **new_dougFacing:** In <show-name>, <crew-name> was claimed through Google sign-in as <email>. Future picker attempts for that row will route through Google sign-in.
- **inline_member:** yes
- **params:** show-name → "this show" (existing); crew-name → "a crew member" (existing sweep fallback); email → "an email address" (existing sweep fallback)
- **new_longExplanation:** This appears when a crew row's identity gets claimed through the OAuth claim path after a Google sign-in. The claim stamps that crew row as claimed by the specific signed-in user, so on future visits picker attempts for that row route straight through Google sign-in instead of showing the picker again. No action is needed — this is a routine record of a successful claim.
- **title:** Crew identity claimed (unchanged)

---

### PICKER_BOOTSTRAP_RPC_FAILED

- Old dougFacing: "Google picker bootstrap could not claim the signed-in user's crew identity. The user saw a retry page."
- Old helpfulContext: "The picker-bootstrap route had a valid Google session but the claim_oauth_identity RPC returned an error or threw. The route returned a terminal 502 instead of redirecting in a loop."

- **new_dougFacing:** In <show-name>, Google picker bootstrap couldn't claim the signed-in user's crew identity, and they saw a retry page. If it keeps happening for the same show, contact the developer.
- **inline_member:** yes
- **params:** show-name → "this show" (existing)
- **new_longExplanation:** This appears when the picker-bootstrap route has a valid Google session but the crew-identity claim step returns an error or throws partway through. Rather than redirect the visitor in a loop, the route returns a terminal retry page so they can try again cleanly. If this keeps recurring for the same show, it may point to a deeper claim-path problem worth a developer look.
- **title:** Picker bootstrap claim failed (unchanged)

---

### PICKER_BOOTSTRAP_RESOLVE_SHOW_FAILED (global — concision only)

- Old dougFacing: "Google picker bootstrap could not resolve the show link before session validation. The user saw a retry page."
- Old helpfulContext: "The picker-bootstrap route failed while resolving the tokenized show URL before it had a user email. The alert context is intentionally email-less and excludes the bearer share token."

- **new_dougFacing:** Google picker bootstrap couldn't resolve the show link before session validation, so the visitor saw a retry page.
- **inline_member:** no
- **params:** none new
- **new_longExplanation:** This appears when the picker-bootstrap route fails while resolving the tokenized show URL, before it even has a signed-in visitor's email to work with. Because no identity is available yet at this point, the alert intentionally carries no email and excludes the bearer share token from its context. The visitor sees a retry page and can try the link again.
- **title:** Picker bootstrap show resolve failed (unchanged)

---

### CALLBACK_CLAIM_THREW (global — concision only)

- Old dougFacing: "The OAuth callback claim step threw before it could finish. The next show visit will retry through picker bootstrap."
- Old helpfulContext: "The OAuth callback encountered an unexpected exception while attempting to stamp crew identity claims. The callback does not mint picker cookies; the bootstrap route can retry the claim on the next show visit."

- **new_dougFacing:** The OAuth callback's claim step threw before it could finish. The next show visit retries automatically through picker bootstrap.
- **inline_member:** no
- **params:** none new
- **new_longExplanation:** This appears when the OAuth callback hits an unexpected exception while trying to stamp a crew identity claim. The callback itself never mints picker cookies, so nothing is left in a half-claimed state — the bootstrap route simply retries the claim automatically on the visitor's next show visit.
- **title:** OAuth claim threw (unchanged)

---

### PICKER_SELECTION_RACE

- Old dougFacing: "A stale saved picker selection was cleaned up after the show access state changed."
- Old helpfulContext: "A browser submitted cleanup for a picker cookie entry whose epoch or crew member no longer matched the current show state. The compare-and-delete path removed only the stale entry and left newer selections intact."

- **new_dougFacing:** In <show-name>, a stale picker selection for <crew-name> was cleaned up after the show's access state changed. No action needed — newer selections were left intact.
- **inline_member:** yes
- **params:** show-name → "this show" (existing); crew-name → "a crew member" (existing sweep fallback)
- **new_longExplanation:** This appears when a browser submits cleanup for a picker cookie entry whose epoch or crew member no longer matches the show's current access state — typically after an admin reset or a roster change. The compare-and-delete cleanup path removes only that one stale entry and leaves any newer, still-valid selections untouched. No action is needed.
- **title:** Stale picker selection cleaned (unchanged)

---

### PICKER_EPOCH_RESET

- Old dougFacing: "Picker selections were reset for this show. Crew will be asked to pick themselves again on their next visit."
- Old helpfulContext: "An admin reset bumped the show's picker epoch, invalidating saved per-device picker selections without changing the public share link. Existing open tabs will re-prompt on refresh or realtime invalidation."

- **new_dougFacing:** Picker selections for <show-name> were reset. Crew will be asked to pick themselves again on their next visit.
- **inline_member:** yes
- **params:** show-name → "this show" (existing)
- **new_longExplanation:** This appears after an admin reset bumps a show's picker epoch, which invalidates every saved per-device picker selection without changing the public share link itself. Crew members are asked to pick themselves again the next time they open the link. Any tabs already open re-prompt automatically on refresh or the next realtime update.
- **title:** Picker selections reset (unchanged)

---

### WIZARD_SESSION_SUPERSEDED_RACE (dougFacing already condensed in PR #469 — kept VERBATIM; longExplanation only)

- Old dougFacing (kept verbatim): "A leftover wizard action (<attempted-action>) for <file-name> was safely cancelled before it could change the new wizard's state. Continue in the active wizard tab."
- Old helpfulContext: "Setup wizards run one at a time. An action from an older wizard tab (retry, defer, ignore, or discard) raced a newer wizard that had just taken over, and we cancelled the older action before it could change the new wizard's state. Any setup-scan leftovers from the old tab are inert and cleaned up automatically — this alert exists so you know the old tab tried. Continue in the active wizard tab."

- **new_dougFacing:** unchanged (see above — do not edit)
- **inline_member:** yes (already a member)
- **params:** file-name → "this sheet" (existing, wired); attempted-action → "a setup action" (existing, wired)
- **new_longExplanation:** This appears when two setup-wizard sessions overlap — for instance, two browser tabs both mid-setup for the same sheet — and the app keeps the newer one. An action from the older tab (retry, defer, ignore, or discard) raced the newer wizard that had just taken over, so it's cancelled before it can change the new wizard's state. Any setup-scan leftovers from the old tab are inert and get cleaned up automatically; this alert exists purely so you know the old tab's attempt was seen. Continue working in the active wizard tab.
- **title:** Stale wizard action cancelled (unchanged)

---

### ONBOARDING_SHEET_UNREADABLE

- Old dougFacing: "Some sheets in your show folder couldn't be read, so they were skipped — the affected sheets are named on this alert. Fix or remove them in Drive and this alert clears on its own; you can also dismiss it now."
- Old helpfulContext: "During setup we scanned your Drive folder and found one or more files we couldn't read as a show sheet, so we skipped them — they aren't staged and won't appear on any crew page. The first few affected sheets are named on this alert. Fix the sheet's layout in Drive (most often a missing or renamed section header) or remove the file from the folder — the live sync notices on its own and this alert clears automatically. Re-running setup from Settings also works and gives a guided list. You can dismiss this alert at any time."

- **new_dougFacing:** Some sheets in your show folder couldn't be read and were skipped: <failed-sheet-names>. Fix or remove them in Drive and this clears on its own — you can also dismiss it now.
- **inline_member:** yes
- **params:** failed-sheet-names → "some sheets" (NEW — segment `contextField:failed_sheet_names` label "Sheet", capped list join per identity map comment)
- **new_longExplanation:** This appears when a setup scan of your Drive show folder finds one or more files it can't read as a show sheet, so it skips them — they're never staged and never appear on any crew page. The alert names the first few affected sheets. The usual fix is correcting the sheet's layout in Drive, most often a missing or renamed section header, or removing the file from the folder entirely; the next live sync notices the fix on its own and the alert clears automatically. Re-running setup from Settings also works and walks through a guided list. You can dismiss this alert at any time without fixing anything.
- **title:** Some sheets couldn't be read (unchanged)

---

### WATCH_CHANNEL_ORPHANED (global — concision only)

- Old dougFacing: "The instant-updates connection to Google Drive needs to reconnect. Shows still sync automatically every few minutes, so nothing is lost."
- Old helpfulContext: "The connection that makes sheet edits show up instantly couldn't be set up or renewed. Your shows still sync on the normal schedule, so nothing is lost — at worst, edits take a few minutes to appear. We retry the connection automatically every hour, and you can use Retry now to try immediately. If it keeps failing, we'll flag it for support."

- **new_dougFacing:** The instant-updates connection to Google Drive needs to reconnect. Shows still sync automatically every few minutes, so nothing is lost. (already concise — unchanged)
- **inline_member:** no
- **params:** none new
- **new_longExplanation:** This appears when the connection that makes sheet edits show up instantly can't be set up or renewed. Shows keep syncing on the normal schedule regardless, so nothing is lost — at worst, edits take a few minutes longer to appear instead of showing up instantly. The system retries the connection automatically every hour, and a Retry now action is available to try immediately. If it keeps failing, it gets flagged for support.
- **title:** Live updates need attention (unchanged)

---

### WEBHOOK_TOKEN_INVALID (global — concision only)

- Old dougFacing: "A push notification from Google Drive failed verification — possible spoofing or misconfiguration. The developer has been notified."
- Old helpfulContext: "A push notification arrived from Google Drive carrying the wrong verification token. This usually means a stale subscription is still firing or someone's spoofing the endpoint. The developer has been notified and will rotate the token if needed."

- **new_dougFacing:** A push notification from Google Drive failed verification — possible spoofing or misconfiguration. The developer has been notified. (already concise — unchanged)
- **inline_member:** no
- **params:** none new
- **new_longExplanation:** This appears when a push notification arrives from Google Drive carrying the wrong verification token. It usually means a stale subscription is still firing, or that someone is attempting to spoof the webhook endpoint. The developer is notified automatically and will rotate the token if needed.
- **title:** Drive webhook failed verification (unchanged)

---

### GITHUB_BOT_LOGIN_MISSING (global — concision only)

- Old dougFacing: "GitHub bot login is unconfigured — the report-recovery path is degraded. Set `GITHUB_BOT_LOGIN` env var to the bot's GitHub username."
- Old helpfulContext: "The bug-report recovery path needs to know the GitHub username of the bot account so it can find issues created by previous attempts. The `GITHUB_BOT_LOGIN` environment variable isn't set. Configure it on the deployment and redeploy."

- **new_dougFacing:** GitHub bot login is unconfigured, so the report-recovery path is degraded. Set the `GITHUB_BOT_LOGIN` environment variable to the bot's GitHub username and redeploy.
- **inline_member:** no
- **params:** none new
- **new_longExplanation:** This appears when the bug-report recovery path needs the bot account's GitHub username, to find issues created by previous recovery attempts, but the `GITHUB_BOT_LOGIN` environment variable isn't set on the deployment. Configure it and redeploy to restore full recovery-path coverage.
- **title:** GitHub bot login not configured (unchanged)

---

### ROLE_FLAGS_NOTICE (dougFacing already condensed in PR #469 — kept VERBATIM; longExplanation only)

- Old dougFacing (kept verbatim): "In <sheet-name>, <role-changes><lead-hint>"
- Old helpfulContext (post-#469, current): null
- Pre-#469 helpfulContext (git history, commit d53072e3b^ — source material for longExplanation since current is null and dougFacing dropped this detail): "A crew member's role flags changed and were applied automatically — a sheet edit or an admin role mapping is a deliberate action, so it applies without holding. This entry is raised when a change affects a CAPABILITY role: LEAD or FINANCIALS, which grant access to internal financials (and, for LEAD, the admin/ops surface). Those are worth a quick confirm; a durable audit record also captures each one. Department/scope flags only change which tile the crew member sees on their own page. No action needed; if a capability change was a mistake, correct it in the sheet (or the mapping)."

- **new_dougFacing:** unchanged (see above — do not edit)
- **inline_member:** yes (already a member)
- **params:** sheet-name → "this sheet" (existing, wired); role-changes / lead-hint → existing derived params (roleChangesParam / leadHintParam), no change
- **new_longExplanation:** This appears when a crew member's role flags change and get applied automatically — either from a sheet edit or an admin role mapping, both deliberate actions that apply without holding for review. It's specifically raised for changes to a CAPABILITY role, LEAD or FINANCIALS, which grant access to internal financials (and, for LEAD, the admin/ops surface); those are worth a quick confirm, and a durable audit record captures every one. Department/scope flags, by contrast, only change which tile the crew member sees on their own page and don't raise this alert. No action is needed unless a capability change turns out to be a mistake — if so, correct it in the sheet or the role mapping.
- **title:** Role change applied (unchanged)

## 6.b Copy batch b

# Copy batch B — 15 codes

All codes in this batch resolve identity via the pre-existing `sheet-name` param
(`lib/adminAlerts/deriveMessageParams.ts:134-139`, fallback `"this sheet"`), which
`deriveAlertMessageParams` sets unconditionally for every code. This applies whether
the identity-map segment kind is `sheetName` or `contextField` labeled `"Sheet"`
(`segmentValue(identity, "Sheet")` matches both). **No new fallback params proposed.**

---

### LIVE_ROW_CONFLICT

- old dougFacing: "A sheet is already being processed by the live folder sync, so we're skipping it during setup. Resolve it from the dashboard, then re-run setup if needed."
- old helpfulContext: "Setup tried to stage a parse for a sheet that the live folder sync is already processing. We skipped the wizard's stage to avoid clobbering the live row. Resolve the live row from the dashboard — either Apply or Discard it — then re-run setup if you still need to."

1. new_dougFacing: "<sheet-name> is already being processed by the live folder sync, so setup skipped it. Resolve it from the dashboard, then re-run setup if needed."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when setup tries to stage a parse for a sheet that the live folder sync is already processing. To avoid clobbering the live row, the wizard's stage is skipped. Resolve the live row from the dashboard — either Apply or Discard it — then re-run setup if you still need to."
5. title: "Live sync owns this sheet"

---

### DRIVE_FETCH_FAILED

- old dougFacing: "We couldn't fetch this sheet from Google Drive. Could be a transient network issue, or the sheet's been moved or unshared. We'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings."
- old helpfulContext: "Google Drive temporarily blocked or refused our request to read this sheet. The most common cause is a transient network or permissions hiccup; we keep retrying automatically. If this stays for more than an hour, double-check that the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder."

1. new_dougFacing: "We couldn't fetch <sheet-name> from Google Drive — likely a transient network issue, or it's been moved or unshared; we'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when Google Drive temporarily blocks or refuses a request to read this sheet, usually from a transient network or permissions hiccup. We keep retrying automatically. If this persists for more than an hour, confirm the folder is still shared with the service account email and that the sheet hasn't been moved out of the watched folder."
5. title: "Drive fetch failed"

---

### PARSE_ERROR_LAST_GOOD

- old dougFacing: "_<sheet-name>_'s latest edit didn't parse. The previous approved version is still showing to crew. See the per-show parse panel for the error detail."
- old helpfulContext: "A recent edit to the sheet introduced something the parser couldn't read, but we kept the previously approved version live so crew aren't blocked. Open the per-show parse panel to see exactly what went wrong, fix it in the sheet, and the next sync will replace the stale data."

1. new_dougFacing: "<sheet-name>'s latest edit didn't parse, so the previous approved version is still showing to crew. See the per-show parse panel for the error detail."
2. inline_member: no — `PARSE_ERROR_LAST_GOOD` is `{ kind: "global" }` (already-specific-in-copy global entry); spec §5 excludes global codes from `INLINE_IDENTITY_CODES` growth even though the template carries a pre-existing `<sheet-name>` token (resolves via context tier, not identity).
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a recent edit to the sheet introduces something the parser can't read. We keep the previously approved version live so crew aren't blocked. Open the per-show parse panel to see exactly what went wrong; fixing the sheet lets the next sync replace the stale data."
5. title: "Latest edit didn't parse"

---

### SHEET_UNAVAILABLE

- old dougFacing: "_<sheet-name>_ isn't in your folder anymore. Either you moved/unshared it, or it was deleted. Re-share it to bring the show back."
- old helpfulContext: "We expected to find this sheet in your watched folder but it's not there anymore. Either someone moved it to a different folder, the share was removed, or the file was deleted. Crew see the last good version we have on file. Re-share or move the sheet back into the folder and we'll pick it up on the next sync."

1. new_dougFacing: "<sheet-name> isn't in your folder anymore — you may have moved or unshared it, or it was deleted. Re-share it to bring the show back."
2. inline_member: no — global entry (already-specific-in-copy), same rationale as PARSE_ERROR_LAST_GOOD.
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a sheet we expected to find in the watched folder is no longer there. It may have been moved to a different folder, had its share removed, or been deleted outright. Crew keep seeing the last good version on file until you re-share or move the sheet back into the folder, which we'll pick up on the next sync."
5. title: "Sheet no longer in folder"

---

### RESYNC_SHRINK_HELD

- old dougFacing: "_<sheet-name>_'s latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync the show to apply it; otherwise fix the sheet."
- old helpfulContext: "A recent sync would have removed crew members or an entire section (rooms, hotels, contacts, or transportation) compared to the previous version. To avoid silently losing data we held the update and kept the last good version live for crew. If the reduction is intentional, re-sync the show and confirm to apply it; otherwise fix the sheet and the next sync will apply cleanly and clear this automatically."

1. new_dougFacing: "<sheet-name>'s latest version dropped crew or a whole section, so the update was held and the last good version is still live. If the change is intentional, re-sync the show to apply it; otherwise fix the sheet."
2. inline_member: no — global entry (already-specific-in-copy).
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a sync would remove crew members or an entire section — rooms, hotels, contacts, or transportation — compared to the previous version. Rather than silently lose data, we hold the update and keep the last good version live for crew. If the reduction is intentional, re-sync and confirm to apply it; otherwise fix the sheet and a clean sync clears this automatically."
5. title: "Re-sync held: sheet lost data"

---

### RESYNC_QUALITY_REGRESSED

- old dougFacing: "_<sheet-name>_'s latest edit lost some data quality — one or more fields or sections that used to read no longer do. The update is already live; open the parse panel to see what degraded and fix the sheet."
- old helpfulContext: "A recent edit to the sheet parsed and went live, but more fields or sections failed to read than before. Crew see the applied data; nothing is held. Open the per-show parse panel to see which classes degraded, fix the sheet, and the next sync clears this automatically once quality recovers."

1. new_dougFacing: "<sheet-name>'s latest edit lost some data quality — one or more fields or sections that used to read no longer do. The update is already live; open the parse panel to see what degraded and fix the sheet."
2. inline_member: no — global entry (already-specific-in-copy).
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a sync applies successfully but reads fewer fields or sections than the previous version — a data-quality regression, not a hard failure. Crew see the applied data; nothing is held back. Open the per-show parse panel to see which classes degraded, fix the sheet, and a recovered sync clears this automatically."
5. title: "Latest edit lost data quality"

---

### SYNC_STALLED

- old dougFacing: "Automatic syncing hasn't run in over an hour, so new sheet changes won't appear until it resumes. If this keeps happening, check the Drive connection or re-run setup."
- old helpfulContext: "The scheduled job that reads your show sheets from Google Drive hasn't completed a run in over an hour. New edits won't reach crew pages until it resumes. Usually transient; if it persists, the Drive connection may have lapsed or the scheduler may be down."

1. new_dougFacing: "Automatic syncing hasn't run in over an hour, so new sheet changes won't reach crew pages until it resumes. If this keeps happening, check the Drive connection or re-run setup."
2. inline_member: no — `{ kind: "global" }`, truly system-wide, no sheet/show entity at all.
3. params: none
4. new_longExplanation: "This appears when the scheduled job that reads show sheets from Google Drive hasn't completed a run in over an hour. New edits won't reach crew pages until the job resumes. This is usually transient; if it persists, the Drive connection may have lapsed or the scheduler may be down."
5. title: "Syncing has stalled"

---

### ASSET_RECOVERY_BYTES_EXCEEDED

- old dougFacing: "This show's diagram set is too large to recover automatically (more than 60 images, an image >50MB, or >3GB total). Crew see placeholders for the missing diagrams. Tell the developer if you need this raised, or trim the gallery."
- old helpfulContext: "Asset recovery stops above 60 images, above 50MB for one image, or above 3GB per run so the per-show advisory lock stays short and other syncs are not blocked behind a huge gallery recovery. Trim the gallery or ask the developer to raise the ceiling if this show truly needs more."

1. new_dougFacing: "<sheet-name>'s diagram set is too large to recover automatically (more than 60 images, an image over 50MB, or over 3GB total), so crew see placeholders for the missing diagrams. Trim the gallery, or tell the developer if you need the ceiling raised."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a show's diagram set exceeds the per-run recovery ceiling — more than 60 images, a single image over 50MB, or more than 3GB total. The ceiling keeps the per-show advisory lock short so other syncs aren't blocked behind a large recovery. Crew see placeholders for the missing diagrams; trim the gallery or ask the developer to raise the ceiling if this show truly needs more."
5. title: "Diagram set too large to recover"

---

### ASSET_RECOVERY_REVISION_DRIFT

audience: health — never renders in bell/per-show (`bellFeed`/`PerShowAlertSection.tsx` exclude health-audience codes per spec §2); this row is catalog + appendix + help-page work only, but the copy contract still applies and the template still carries the identity token.

- old dougFacing: "Diagram recovery paused because the show changed while recovery was checking files. We'll retry against the latest version on the next run."
- old helpfulContext: "Asset recovery fetched and verified diagram bytes against an older snapshot revision, but a newer Apply landed before recovery could write those bytes. The recovery run aborts so it does not attach old assets to the new approved revision."

1. new_dougFacing: "Diagram recovery for <sheet-name> paused because the show changed while recovery was checking files. We'll retry against the latest version on the next run."
2. inline_member: yes (template carries token; health-audience only affects render surface, not registry membership per §5)
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when asset recovery fetches and verifies diagram bytes against an older snapshot revision, but a newer Apply lands before recovery can write those bytes. The recovery run aborts rather than attach old assets to the new approved revision, and the next run retries automatically against the latest version."
5. title: "Diagram recovery raced an apply"

---

### ASSET_RECOVERY_DRIFT_COOLDOWN

audience: health — same render-surface caveat as ASSET_RECOVERY_REVISION_DRIFT.

- old dougFacing: "Diagram recovery is backing off briefly because this show keeps changing during recovery. We'll retry automatically after the cooldown."
- old helpfulContext: "The previous asset recovery attempt raced with a newer Apply, so recovery is briefly backing off for this snapshot revision. This bounds retry storms while the show is changing frequently."

1. new_dougFacing: "Diagram recovery for <sheet-name> is backing off briefly because this show keeps changing during recovery. We'll retry automatically after the cooldown."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when the previous asset recovery attempt raced with a newer Apply, so recovery briefly backs off for that snapshot revision. This bounds retry storms while a show is changing frequently, and normal recovery resumes automatically after the cooldown."
5. title: "Diagram recovery cooling down"

---

### EMBEDDED_RECOVERY_REQUIRES_RESTAGE

- old dougFacing: "A diagram in this sheet can't be re-downloaded automatically. Save the sheet (any edit advances the version) and crew will see the image again on the next sync."
- old helpfulContext: "A diagram in your sheet can't be re-downloaded automatically because it doesn't have a content-derived approval token. The fix is to save the sheet — any edit advances the version and lets us mint a fresh approval token on the next sync, which restores the diagram for crew."

1. new_dougFacing: "A diagram in <sheet-name> can't be re-downloaded automatically. Save the sheet — any edit advances the version — and crew will see the image again on the next sync."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when a diagram in a sheet can't be re-downloaded automatically because it lacks a content-derived approval token. Saving the sheet — any edit advances the version — lets us mint a fresh approval token on the next sync, which restores the diagram for crew."
5. title: "Diagram needs sheet re-save to recover"

---

### EMBEDDED_ASSET_DRIFTED

- old dougFacing: "An embedded diagram changed after staging. Crew see a placeholder for that image until a new sheet edit re-stages it."
- old helpfulContext: "Apply re-checks the spreadsheet revision, object id, and embedded-image fingerprint before downloading bytes. A mismatch leaves the prior approved content live and marks the image for recovery or re-stage."

1. new_dougFacing: "An embedded diagram in <sheet-name> changed after staging, so crew see a placeholder for that image. A new sheet edit re-stages it."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when Apply re-checks the spreadsheet revision, object id, and embedded-image fingerprint before downloading bytes, and finds a mismatch. The prior approved content stays live and the image is marked for recovery or re-stage; saving the sheet again re-stages the new image."
5. title: "Embedded diagram changed after staging"

---

### REEL_DRIFTED

- old dougFacing: "The opening-reel video has been edited since you reviewed this parse. Crew see the text status only until your next sheet edit re-stages the new reel."
- old helpfulContext: "The opening-reel video was replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only (e.g., 'YES') without the inline video until you save the sheet again to re-stage the new reel."

1. new_dougFacing: "The opening-reel video in <sheet-name> has been edited since you reviewed this parse, so crew see the text status only. Your next sheet edit re-stages the new reel."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when the opening-reel video is replaced or edited in Drive after the staged parse was reviewed. Crew see the text status only (for example 'YES') without the inline video, until you save the sheet again to re-stage the new reel."
5. title: "Opening reel drifted"

---

### OPENING_REEL_PERMISSION_DENIED

- old dougFacing: "The opening-reel video is no longer shared with FXAV. Crew see the text status only — re-share the video file (or replace the link) to restore inline playback."
- old helpfulContext: "Drive returned a permission-denied response when we tried to fetch the opening-reel video. The file used to be accessible (we had it pinned at a previous Apply), but the share was revoked, the file was made private, or it was moved out of a shared drive the service account can read. Crew see the text status only without inline playback. To restore: re-share the video file with the service account email, or replace the link with a video file you do share."

1. new_dougFacing: "The opening-reel video for <sheet-name> is no longer shared with FXAV, so crew see the text status only. Re-share the video file — or replace the link — to restore inline playback."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when Drive returns a permission-denied response while fetching the opening-reel video that was previously accessible. The share may have been revoked, the file made private, or it may have been moved out of a shared drive the service account can read. Crew see the text status only, without inline playback, until you re-share the video file with the service account email or replace the link with a video file you do share."
5. title: "Opening reel access revoked"

---

### OPENING_REEL_NOT_VIDEO

- old dougFacing: "The opening-reel link is not a video file. Crew see the text status only — replace the link with a video file URL to enable inline playback."
- old helpfulContext: "The opening-reel cell in your sheet contains a Drive URL, but the file behind it isn't a video — it's a Google Doc, Slides deck, image, PDF, or some other file type. Crew see the text status only (e.g., 'YES', 'BACKUP ONLY') without an inline player, because we won't try to embed a non-video file in a `<video>` element. To enable inline playback, replace the link with a video file URL (the file's MIME type must start with `video/`)."

1. new_dougFacing: "The opening-reel link in <sheet-name> is not a video file, so crew see the text status only. Replace the link with a video file URL to enable inline playback."
2. inline_member: yes
3. params: `sheet-name` → fallback "this sheet" (pre-existing)
4. new_longExplanation: "This appears when the opening-reel cell contains a Drive URL, but the file behind it isn't a video — a Google Doc, Slides deck, image, PDF, or another file type. Crew see the text status only, without an inline player, because a non-video file won't be embedded in a `<video>` element. Replacing the link with a URL whose file type starts with `video/` enables inline playback."
5. title: "Opening reel link is not a video"

## 6.c Copy batch c

# Copy batch C — 17 codes

Source-of-truth check performed against live `lib/messages/catalog.ts` and `lib/adminAlerts/alertIdentityMap.ts` before drafting (not just the inventory snapshot), since 16/17 codes already had partial treatment from PR #469 baked into catalog.ts. Notes on that are called out per code.

**Convention used for identity tokens:** bare `<token>` (no markdown emphasis) — matches the one fully-treated exemplar under this spec, `ROLE_FLAGS_NOTICE` (`lib/messages/catalog.ts`, `dougFacing: "In <sheet-name>, <role-changes><lead-hint>"`). The two TILE_* / SHOW_* codes currently carry `_<sheet-name>_` markdown-italic tokens left over from the pre-sweep copy — normalized to bare tokens below.

**Param-fallback gap found (flag for implementer):** `crew-count` and `show-date` (used only by SHOW_FIRST_PUBLISHED) have NO entry in `lib/adminAlerts/deriveMessageParams.ts` — no dedicated resolver, no fallback. They're pre-existing placeholders (not new to this sweep), but the extended all-admin-codes coverage meta-test (spec §5, `_metaHealthTemplateCoverage` walk) will now assert `deriveAlertMessageParams("SHOW_FIRST_PUBLISHED", null, null)` fully resolves — today it would leak literal `<crew-count>`/`<show-date>` placeholders since they're generic-passthrough-only. Needs two new fallback additions, same shape as the existing `sheet-name`/`show-name`/`repo` special cases at `deriveMessageParams.ts:140-153`.

---

### SHOW_FIRST_PUBLISHED

Old dougFacing (quoted): "_<sheet-name>_ is now live for crew at its share-token URL. _<crew-count>_ crew, _<show-date>_. **Made a mistake?** Flip the Published toggle off on the show's page — crew can't open the show until you turn it back on. When email is set up, the published notice also carries a 24-hour undo link."
Old helpfulContext (quoted): "We auto-published this show because the parse looked clean — all the safety checks passed. The crew page is now live at its share-token URL. If you dragged in the wrong sheet or weren't ready, flip the Published toggle off on the show's page — crew can't open the show until you turn it back on, and the same crew link works again when you do. When email is set up, the published notice also carries a 24-hour undo link that does the same thing."

**Status:** genuinely untouched in catalog.ts (title/longExplanation/helpHref all null) — the only one of my 17 needing full authoring.

1. new_dougFacing: "<sheet-name> is now live for crew at its share-token URL — <crew-count> crew, <show-date>. Flip Published off on the show's page if this was a mistake; crew can't open it again until you do."
2. inline_member: no — code is `global` in `ALERT_IDENTITY_MAP` ("already SPECIFIC (sheet/crew/date in copy)"), so it stays out of `INLINE_IDENTITY_CODES` (no identity chip exists to suppress). Tokens resolve via generic context passthrough, not identity resolution.
3. params + fallback: `sheet-name` (existing fallback "this sheet", already wired) · `crew-count` (**NEW fallback needed**, propose `"some"`) · `show-date` (**NEW fallback needed**, propose `"an upcoming date"` — producer's `showDateForAlert()` can return null)
4. new_longExplanation: "This show auto-published because the parse looked clean and all safety checks passed. If you dragged in the wrong sheet or weren't ready, flip the Published toggle off on the show's page — crew can't open the show until you turn it back on, and the same crew link works again when you do. When email is set up, the published notice also carries a 24-hour undo link that does the same thing."
5. title: "Show published" (fill per spec §3 ratified decision)

---

### SHOW_UNPUBLISHED

Old dougFacing (quoted): "_<sheet-name>_ has been unpublished. Its crew link is paused — crew who open it see a 'not available right now' page with no show details. Turn Published back on from the show's page when you're ready."
Old helpfulContext (quoted): "This show has been unpublished — from the Published toggle on its page or via the emailed undo link. Its crew link is paused: crew who open it see a 'not available right now' page with no show details. Nothing else changed — the same link works again when you republish, your sheet is unchanged and keeps syncing, and the show stays in Active shows. Turn Published back on from the show's page when you're ready."

**Status:** already has title/longExplanation/helpHref in catalog.ts (from PR #469's partial pass), but dougFacing is still 3 sentences with markdown-italic token — condensing to spec's ≤2-sentence bare-token contract.

1. new_dougFacing: "<sheet-name> has been unpublished — crew who open its link see a 'not available right now' page. Turn Published back on from the show's page when you're ready."
2. inline_member: no — `global` in `ALERT_IDENTITY_MAP` ("already SPECIFIC (sheet in copy)"); concision-only per spec §3, no chip to suppress.
3. params + fallback: `sheet-name` (existing fallback "this sheet", already wired — no change needed)
4. new_longExplanation: keep existing catalog value verbatim (already well-formed, 3 sentences, help-page register): "This show has been unpublished — from the Published toggle on its page or via the emailed undo link. Its crew link is paused: crew who open it see a 'not available right now' page with no show details. Nothing else changed — the same link works again when you republish, and the sheet keeps syncing. Turn Published back on from the show's page when you're ready."
5. title: "Show unpublished" (existing, unchanged)

---

### EMAIL_DELIVERY_FAILED

Old dougFacing (quoted): "A notification email for <show-name> couldn't be sent. We'll keep retrying automatically; if it persists, the developer will check the email provider setup."
Old helpfulContext (quoted): "An outbound notification email failed to send through the email provider. The system retries automatically a few times. If it keeps failing, the provider key or the verified sending domain may need attention."

**Already condensed in PR #469** — bare `<show-name>` token, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "A notification email for <show-name> couldn't be sent. We'll keep retrying automatically; if it persists, the developer will check the email provider setup."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "A notification email couldn't be delivered through the email provider. We retry automatically; a persistent failure usually means the provider API key or sending domain needs attention in settings."
5. title: "Couldn't send a notification email" (existing, unchanged)

---

### EMAIL_NOT_CONFIGURED

Old dougFacing (quoted): "Email notifications aren't set up yet, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. The developer configures this on the deployment."
Old helpfulContext (quoted): "Outbound email isn't fully configured, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. This needs three things set: the provider API key, a verified sending address, and the app's public site address (used to build the links in each email). In-app alerts and each show's Published toggle still work; set whichever is missing to enable email."

**Status:** already 2 sentences, no identity token needed (global, truly system-wide). Already spec-compliant — no change.

1. new_dougFacing: keep existing catalog value verbatim (already spec-compliant): "Email notifications aren't set up yet, so sync-problem alerts, the daily digest, and auto-publish undo emails won't be sent. The developer configures this on the deployment."
2. inline_member: N/A — `global` in `ALERT_IDENTITY_MAP` ("truly system-wide"), no identity anywhere.
3. params + fallback: none (no placeholders in template)
4. new_longExplanation: keep existing catalog value verbatim: "The app can't send email until three things are configured: the provider API key, the verified sending address, and the public site address used for links in the emails. Sync-problem alerts, the daily digest, and auto-publish undo emails all wait on the same three settings. You'll still see alerts in the dashboard, and each show's Published toggle keeps working."
5. title: "Email notifications not set up" (existing, unchanged)

---

### PENDING_SNAPSHOT_PROMOTE_STUCK

Old dougFacing (quoted): "A diagram snapshot promotion for <show-name> has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish."
Old helpfulContext (quoted): "A diagram snapshot promotion has been in the non-reclaimable promote-started state for more than 15 minutes. Eric needs to reconcile the temp and canonical prefixes before cleanup can continue."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "A diagram snapshot promotion for <show-name> has been stuck for more than 15 minutes. Eric needs to run the snapshot-promote repair tool before cleanup can finish."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "A diagram snapshot promotion has been in the non-reclaimable promote-started state for more than 15 minutes. Eric needs to reconcile the temp and canonical prefixes before cleanup can continue."
5. title: "Snapshot promotion stuck" (existing, unchanged)

---

### PENDING_SNAPSHOT_ROLLBACK_STUCK

Old dougFacing (quoted): "A diagram snapshot rollback for <sheet-name> stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish."
Old helpfulContext (quoted): "A diagram snapshot rollback failed midway, leaving assets split across temp and canonical prefixes. Eric needs to reconcile both prefixes and finish the rollback before cleanup can continue."

**Already condensed in PR #469** — bare `<sheet-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "A diagram snapshot rollback for <sheet-name> stalled after moving some assets. Eric needs to run the snapshot-rollback repair tool before cleanup can finish."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `sheet-name` (existing fallback "this sheet", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "A diagram snapshot rollback failed midway, leaving assets split across temp and canonical prefixes. Eric needs to reconcile both prefixes and finish the rollback before cleanup can continue."
5. title: "Snapshot rollback stalled" (existing, unchanged)

---

### PENDING_SNAPSHOT_DELETE_STUCK

Old dougFacing (quoted): "Old diagram snapshot cleanup is stuck. Crew pages are still protected, but storage cleanup needs repair."
Old helpfulContext (quoted): "A pending snapshot upload row is marked for deletion but the storage prefix has not been reclaimed."

**Status:** NOT among the 11 already condensed in PR #469, and current dougFacing carries no identity token even though `ALERT_IDENTITY_MAP` declares `segments: [{ kind: "showName" }]` — gap. Weaving `<show-name>` in now.

1. new_dougFacing: "A diagram snapshot cleanup for <show-name> is stuck — crew pages are still protected, but storage cleanup needs repair."
2. inline_member: **yes — NEW addition to `INLINE_IDENTITY_CODES`** (currently absent from the set despite having a show-segment identity declaration; this sweep should add it since the template now carries the token).
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim (already adapted, 2 sentences): "Old diagram snapshot cleanup is stuck: a pending row is marked for deletion but the storage prefix hasn't been reclaimed. Crew pages are still protected, but storage cleanup needs repair."
5. title: "Snapshot cleanup stuck" (existing, unchanged)

---

### REPORT_ORPHANED_LOST_LEASE

Old dougFacing (quoted): "A duplicate bug-report issue for <show-name> was auto-closed during a retry race. Click through to verify it closed correctly. If this recurs, increase the lease window."
Old helpfulContext (quoted): "Two retries of the same bug-report submission both succeeded in creating GitHub issues — a lease race condition. We auto-closed the duplicate. Click through to confirm; if this code keeps appearing, the developer needs to extend the lease window."

**Already condensed in PR #469** — bare `<show-name>`, already in `INLINE_IDENTITY_CODES`. (3 sentences, slightly over the ≤2 target, but brief explicitly says keep VERBATIM.)

1. new_dougFacing: VERBATIM — "A duplicate bug-report issue for <show-name> was auto-closed during a retry race. Click through to verify it closed correctly. If this recurs, increase the lease window."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "Two retries of the same bug-report submission both succeeded in creating GitHub issues (a lease race condition). We auto-closed the duplicate. Click through to confirm; if this keeps appearing, the developer needs to extend the lease window."
5. title: "Duplicate report issue auto-closed" (existing, unchanged)

---

### REPORT_LOOKUP_INCONCLUSIVE

Old dougFacing (quoted): "We couldn't confirm whether a report for <show-name> went through. Try again in a few minutes."
Old helpfulContext (quoted): "The bug-report recovery path could not conclusively list recent GitHub issues for this idempotency key, so it refused to create a duplicate issue."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "We couldn't confirm whether a report for <show-name> went through. Try again in a few minutes."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "The bug-report recovery path couldn't conclusively list recent GitHub issues for this report, so it refused to create a duplicate issue. Try again in a few minutes."
5. title: "Report lookup inconclusive" (existing, unchanged)

---

### REPORT_DUPLICATE_LIVE_MATCHES

Old dougFacing (quoted): "Multiple live GitHub issues match one report for <show-name>. Recovery is paused until Eric reviews the duplicates."
Old helpfulContext (quoted): "The recovery scan found more than one non-orphan issue with the same bug-report marker. The system fails closed instead of choosing a winner."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "Multiple live GitHub issues match one report for <show-name>. Recovery is paused until Eric reviews the duplicates."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "The bug-report recovery scan found more than one non-orphan GitHub issue with the same report marker. The system fails closed instead of choosing a winner; Eric needs to review the duplicates."
5. title: "Multiple live issues for one report" (existing, unchanged)

---

### REPORT_OPEN_ORPHAN_LABEL

Old dougFacing (quoted): "An open GitHub issue for <show-name> carries the orphan-cleanup label. Eric needs to re-close it or remove the label."
Old helpfulContext (quoted): "Orphan cleanup should close issues with state_reason=not_planned. Seeing the orphan label on an open issue indicates manual intervention or an unexpected GitHub state."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "An open GitHub issue for <show-name> carries the orphan-cleanup label. Eric needs to re-close it or remove the label."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "Orphan cleanup should close issues with the 'not planned' state. Seeing the orphan label on an open issue means manual intervention happened or GitHub returned an unexpected state. Eric needs to review and either re-close the issue or remove the label."
5. title: "Open issue carries orphan label" (existing, unchanged)

---

### REPORT_LEASE_THRASHING

Old dougFacing (quoted): "Bug-report processing is thrashing on <show-name> — retries are racing against leases. This usually means the lease window needs tuning."
Old helpfulContext (quoted): "Bug-report submissions for this show are racing against their own leases — too many retries firing inside the lease window. Usually means the lease window is shorter than the GitHub API's response time under current conditions. The developer needs to tune the window."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "Bug-report processing is thrashing on <show-name> — retries are racing against leases. This usually means the lease window needs tuning."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "Bug-report submissions for this show are racing against their own leases, with too many retries firing inside the lease window. Usually this means the lease window is shorter than the GitHub API's response time under current conditions. The developer needs to tune the window."
5. title: "Bug-report leases thrashing" (existing, unchanged)

---

### STALE_ORPHAN_REPORT

Old dougFacing (quoted): "A stale bug-report reservation for <show-name> expired before it could create a GitHub issue. No action needed unless it repeats."
Old helpfulContext (quoted): "The report reaper deleted an unresolved report row older than the 24-hour recovery horizon after its processing lease had expired."

**Already condensed in PR #469** — bare `<show-name>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "A stale bug-report reservation for <show-name> expired before it could create a GitHub issue. No action needed unless it repeats."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `show-name` (existing fallback "this show", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "A bug-report reservation aged past the 24-hour recovery horizon with its processing lease expired and was deleted by the reaper. No user action is needed unless this repeats."
5. title: "Stale bug-report reservation expired" (existing, unchanged)

---

### TILE_SERVER_RENDER_FAILED

Old dougFacing (quoted): "*<sheet-name>*: a section couldn't load on the server. The page will keep trying — refresh in a minute. Tell the developer if this keeps happening."
Old helpfulContext (quoted): "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying — refresh in a minute. If this keeps happening, click 'Report' so the developer can investigate."

**Status:** already has title/longExplanation/helpHref (PR #469 partial pass), but dougFacing is 3 sentences with markdown-emphasis token — condensing + normalizing to bare token.

1. new_dougFacing: "<sheet-name>: a section failed to load on the server and will keep retrying — refresh in a minute. Tell the developer if it persists."
2. inline_member: no — `global` in `ALERT_IDENTITY_MAP` ("already SPECIFIC (sheet in copy)"); concision-only, no chip to suppress.
3. params + fallback: `sheet-name` (existing fallback "this sheet", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "One of the page sections crashed while the server was rendering it. The rest of the page rendered normally. The page will keep retrying; refresh in a minute. If this keeps happening, click Report so the developer can investigate."
5. title: "Page section failed to render" (existing, unchanged)

---

### TILE_PROJECTION_FETCH_FAILED

Old dougFacing (quoted): "*<sheet-name>*: one or more crew-page data sources couldn't load (the failed sources are listed in the alert detail). The page rendered with the rest of the data; refresh in a minute. Tell the developer if this keeps happening."
Old helpfulContext (quoted): "The crew page loaded, but one or more of its data sources failed to fetch from the server. The page rendered with the data that did load. The specific failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click 'Report' so the developer can investigate."

**Status:** already has title/longExplanation/helpHref (PR #469 partial pass), but dougFacing is 3 sentences with markdown-emphasis token — condensing + normalizing to bare token. The "failed sources listed in alert detail" detail is dropped from dougFacing (moves to longExplanation, already present there).

1. new_dougFacing: "<sheet-name>: one or more data sources couldn't load, so the page rendered with what did load — refresh in a minute. Tell the developer if it persists."
2. inline_member: no — `global` in `ALERT_IDENTITY_MAP` ("already SPECIFIC (sheet in copy)"); concision-only, no chip to suppress.
3. params + fallback: `sheet-name` (existing fallback "this sheet", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "The crew page rendered, but one or more of its data sources failed to fetch from the server. The page shows the data that did load; the affected sections fall back. The specific failed sources are listed in the alert detail. Refresh in a minute; if this keeps happening, click Report so the developer can investigate."
5. title: "Some show data couldn't load" (existing, unchanged)

---

### BRANCH_PROTECTION_DRIFT

Old dougFacing (quoted): "Branch protection on <repo> no longer matches the X.6 contract. Restore the required checks and review settings before merging."
Old helpfulContext (quoted): "The privileged branch-protection monitor queried GitHub and found that the main-branch protection no longer matches the X.6 contract: one of the eight required checks is missing, reviews are not required, stale reviews are not dismissed, admin enforcement is off, or force pushes/deletions are allowed. Restore the branch protection settings for main so pull requests cannot merge without the full X.* audit suite."

**Already condensed in PR #469** — bare `<repo>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "Branch protection on <repo> no longer matches the X.6 contract. Restore the required checks and review settings before merging."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `repo` (existing fallback "this repository", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "The branch-protection monitor found that the main-branch protection no longer matches the X.6 contract: a required check is missing, reviews are not required, stale reviews are not dismissed, admin enforcement is off, or force pushes / deletions are allowed. Restore the settings so pull requests cannot merge without the full audit suite."
5. title: "Branch protection drift" (existing, unchanged)

---

### BRANCH_PROTECTION_MONITOR_AUTH_FAILED

Old dougFacing (quoted): "Branch-protection monitoring for <repo> cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours."
Old helpfulContext (quoted): "The privileged branch-protection monitor could not authenticate to GitHub, so it cannot prove the merge gate is still enforcing the required X.* checks. Rotate the GitHub App token or fallback PAT, then confirm the scheduled branch-protection job succeeds again; otherwise drift could go undetected until the reader check's freshness window expires."

**Already condensed in PR #469** — bare `<repo>`, 2 sentences, already in `INLINE_IDENTITY_CODES`.

1. new_dougFacing: VERBATIM — "Branch-protection monitoring for <repo> cannot authenticate with GitHub. Rotate the GH App token or PAT within 24 hours."
2. inline_member: yes (already in `INLINE_IDENTITY_CODES`)
3. params + fallback: `repo` (existing fallback "this repository", already wired — no change)
4. new_longExplanation: keep existing catalog value verbatim: "The privileged branch-protection monitor could not authenticate to GitHub, so it cannot prove the merge gate is still enforcing the required checks. Rotate the GitHub App token or fallback PAT and confirm the scheduled job succeeds again."
5. title: "Branch-protection monitor can't auth" (existing, unchanged)
