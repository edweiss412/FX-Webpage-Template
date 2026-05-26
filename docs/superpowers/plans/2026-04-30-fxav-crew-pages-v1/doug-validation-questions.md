# Doug-validation questions

> **What this is:** a single living document of every assumption in the FXAV Crew Pages design that's load-bearing on Doug's actual workflow, alongside the design choice that rides on each answer. Take this to a 30–45 min conversation (or a screen-share where he walks through editing a real show sheet) and let his answers calibrate the spec.
>
> **What this is NOT:** a survey for Doug to fill out. Most of these questions are best answered by watching him work, not by asking him directly. Use the question text as your own checklist of "what to listen for."
>
> **Update protocol:** when a question is answered, move it from "Open" to "Answered" with the answer, the date, and the design follow-up (spec amendment, plan task, or "no change needed"). Don't delete answered questions — they're the audit trail for why the spec is calibrated the way it is.

---

## How to run this conversation

**Don't ask all 25 questions in order.** That's a survey, and surveys don't surface workflow truth. Instead:

1. **Open with "walk me through your current process."** Have Doug screen-share or describe how he currently builds a show sheet from scratch and gets it to crew. Listen for the answers to §1, §2, §3 below as they come up naturally.
2. **Ask follow-ups as gaps appear.** When Doug says "and then I share the link" — that's the moment to ask "do you keep editing it after that? what changes most often?" (§2.1, §2.2).
3. **Save the calibration questions for last.** §4 (edit-behavior) and §5 (notification preferences) are concrete enough that they break flow if asked early. Get them after you've seen his workflow in action.
4. **Capture answers in this doc, not in chat.** Update inline with date + answer + design follow-up.

If 30 minutes is the budget: §1 + §2 + §5 are the highest-value. §3, §4, §6, §7 can be observed asynchronously as the system runs in production.

---

## Priority — what to actually ask Doug

Every question in this doc is tagged with one of three priorities. **Build defaults assume "calibration" and "observe" answers; only the BLOCKER set truly gates implementation.**

| Tag | Meaning | Behavior |
|---|---|---|
| **[BLOCKER]** | We cannot reasonably assume the answer; getting it wrong wastes a whole milestone | Ask Doug directly before building the affected surface |
| **[CALIBRATION]** | Default is defensible; Doug's answer tunes a constant or copy choice | Ship with default, retune after observation |
| **[OBSERVE]** | Answerable from production logs / sync data once the system runs | Don't ask Doug at all — measure post-launch |

### The seven BLOCKER questions

If you only have 20 minutes with Doug, ask these. The rest can wait.

1. **§1.1 — Drive structure mental model.** Does the "watched folder" concept slot into his existing structure or fight it? *Without this answer, the entire on-ramp UX is a guess.*
2. **§1.2 — Ready-to-share moment.** Does "I shared the link" mean "this is final" or "here's a draft"? *Determines whether FIRST_SEEN_REVIEW auto-publishes or stages.*
3. **§4.1 — Email vs SMS vs other primary channel.** *Picks the channel the push milestone implements first; wrong choice = wasted milestone.*
4. **§5.1 — How does he flag issues currently?** Text? Email? In-person? *Determines whether the feedback path needs to feel like "texting Eric" or "filing a ticket."*
5. **§6.1 — How many shows simultaneously?** *Sets the scope of coalescing/batching design — 3 shows vs 50 shows is a different system.*
6. **§7.1 — Is FIRST_SEEN_REVIEW friction or value-add?** *Whole publishing-model UX rides on this; reversible but high-cost to relaunch.*
7. **§7.3 — Live-edits-visible vs publish-gate preference for ongoing edits.** *Whole continuous-sync model rides on this; could imply a v2 publish-gate that we should know about now even if we don't build it day 1.*

The remaining 18 questions inform tuning, copy, and post-launch iteration. Defaults in the spec / memo are defensible if Doug answers them in the unsurprising direction; observation post-launch will catch surprises faster than asking can.

### Why distill?

Surveys destroy signal. A 25-question conversation with Doug produces shallow agreement on most items and burns the budget for him to push back on the few that actually matter. The seven above are where his answers are load-bearing on irreversible-ish decisions; the rest are tunable knobs that the system itself will surface data on once it runs.

---

## Open

### §1 — Publishing model and folder structure

These determine whether the watched-folder + FIRST_SEEN_REVIEW design fits Doug's mental model or fights it.

**§1.1 — What does Doug's current Drive structure look like?** [BLOCKER]

- Does he have separate folders for drafts vs. ready-to-share, or one folder for everything?
- Where would the FXAV "watched folder" naturally fit? Would he need to reorganize, or does it slot into existing structure?
- **Default if unanswered:** assume he creates a top-level "FXAV Live Shows" folder and drags ready sheets into it. Validate this assumption.
- **Riding on this:** the entire watched-folder UX. If his current structure makes folder-move feel alien, we may need a different "publish" trigger (Apps Script button, cell flag, dashboard publish action).

**§1.2 — Does Doug have a "ready to share" moment, or is it a gradual ramp?** [BLOCKER]

- Eric's outside-in observation: ~1 week before the show, Doug sends a link. Validate.
- Is the moment of sharing tied to a specific event (e.g., "all confirmations in"), or a calendar countdown ("Wednesday before the show")?
- Does he ever share early (placeholder) and finalize later, or always share late (mostly-final)?
- **Riding on this:** whether FIRST_SEEN_REVIEW should auto-publish or require explicit Apply. If "I share = it's ready," auto-publish on first-seen is defensible. If "I share = here's a draft, will refine," the Apply gate stays.

**§1.3 — Currently, when he shares the link with you, what do you do with it?** [CALIBRATION]

- Do you import the data manually? Read it directly? Copy values into another tool?
- This isn't a Doug question per se, but the answer informs whether the watched-folder concept replaces an existing flow or adds a new one.
- **Riding on this:** how disruptive the new system feels to Doug's habits.

### §2 — Post-share editing patterns

These calibrate the MI staging gates and push-debounce window.

**§2.1 — After he shares with you, does he edit live or batch updates?** [CALIBRATION]

- "Live" = types changes as info arrives, expects them to propagate immediately.
- "Batch" = collects changes through the day/week, finalizes in a single sitting.
- Most operators are mixed. Listen for the proportions.
- **Riding on this:** push-debounce window calibration (4 min default). Live editor = longer debounce ok; batch editor = shorter debounce ok.

**§2.2 — Does he ever go back into "draft mode" on a published sheet?** [CALIBRATION]

- E.g., big restructure: swapping out the entire crew, redoing the schedule, replacing all hotels.
- Or are post-share edits always additive / small (call time changes, one crew swap, fix a typo)?
- **Riding on this:** MI-6 (crew shrinkage) and MI-7 (section shrinkage) thresholds. If big restructures are normal, those thresholds may be too tight; if always small, the thresholds are correctly conservative.

**§2.3 — How often does he update a sheet in the days leading up to a show?** [CALIBRATION]

- Hourly? Daily? Once on Monday, once on Thursday?
- **Riding on this:** push frequency calibration. Hourly editor + tier-1 push for MI-11 = potentially 5+ emails/day. Daily editor = 1 email max.

**§2.4 — Multiple browser tabs or multiple devices?** [OBSERVE]

- Does he edit on mobile sometimes? Phone Drive app? Desktop?
- Does he ever have the sheet open in two tabs simultaneously?
- **Riding on this:** the spec's same-revision binding contract handles multi-tab safely, but UX expectations differ. Phone editing tends to produce more transient autosave events (cell-by-cell vs. row-at-a-time on desktop).

### §3 — Edit micro-behavior (MI-8 / MI-8b / MI-9 calibration)

These calibrate the staging gates we just ratified in amendments 7 and 8.

**§3.1 — When updating a financial cell (PO#, Proposal $, Invoice), does he clear-and-retype or type-over?** [OBSERVE]

- Clear-and-retype creates a transient empty state that MI-8 would otherwise stage.
- Type-over (select-all and type new value) doesn't.
- **Riding on this:** whether the MI-8 modtime debounce (amendment 7) is solving a real problem for Doug or an imagined one.

**§3.2 — When editing crew, does he delete a row to retype it, or edit in place?** [OBSERVE]

- Delete-then-add could trip MI-12/MI-13/MI-14 rename detection on the same person.
- Edit in place doesn't.
- **Riding on this:** whether rename heuristics need to be tighter or looser. If he frequently delete-and-retypes, MI-12/13/14 will fire more often than necessary.

**§3.3 — When an email changes, does he edit in place or delete the row and re-add with the new email?** [OBSERVE]

- Edit-in-place fires MI-11 (auth-sensitive, kills active links).
- Delete-and-re-add fires MI-12/13/14 depending on name match.
- The two paths have different audit trails and reviewer surfaces.
- **Riding on this:** the MI-11 vs MI-12 reviewer-action UX. Both stage; the difference is in the diff presentation.

**§3.4 — How often do non-LEAD role flags change?** [OBSERVE]

- E.g., department reassignments: A1 → V1, additions of BO/SHOP, etc.
- Amendment 8 narrowed MI-9 to LEAD-bit only on the assumption that non-LEAD changes are routine and don't need approval. Validate.
- **Riding on this:** whether the `ROLE_FLAGS_NOTICE` info-severity admin alert is the right tier, or whether non-LEAD changes should still stage.

**§3.5 — Are LEAD toggles ever planned in advance, or do they come up unexpectedly?** [CALIBRATION]

- Planned (e.g., "I'm promoting John to LEAD next month") = staging is just confirmation.
- Unexpected = staging is a real safety check.
- **Riding on this:** whether the LEAD-toggle staging gate (amendment 8 retains this) is friction or value-add.

### §4 — Notification channels and timing

These calibrate the push-notification design memo (`notification-design-memo.md`).

**§4.1 — What's his attention surface?** [BLOCKER]

- Email (always-on)? SMS? Slack? Phone notifications? "I just text Eric"?
- If email: which client (Gmail web, Apple Mail, mobile)? Affects deliverability and whether reply-to-email feedback is realistic.
- **Riding on this:** which channel the push-notification milestone implements first. Default: email. Validate before committing.

**§4.2 — What time of day does his work day start?** [CALIBRATION]

- Determines the daily-digest send time. Default 8am ET; could be 7am, 9am, 10am.
- Does he have a "first thing in the morning, scan email" habit, or is email checked midday?
- **Riding on this:** `DIGEST_HOUR_LOCAL` constant in the design memo.

**§4.3 — Does Doug naturally hit reply on automated emails?** [OBSERVE]

- Some operators always assume "noreply" and never try replying.
- Others naturally hit reply with notes.
- **Riding on this:** whether reply-to-email feedback (memo §6, third form) is worth building. If he never replies, build only the click-through form. Behavior question — observe after launch.

**§4.4 — Would a confirmation email when a sheet auto-publishes for the first time feel useful or like spam?** [CALIBRATION]

- "I just published Show X for crew" — paper trail for him? Or noise?
- **Riding on this:** memo §5 quiet-success principle calibration.

**§4.5 — One-click Apply-from-email — which staging classes does he want this for?** [CALIBRATION]

- Default: low-stakes only (MI-6, MI-7, MI-8, MI-8b). Higher-stakes (MI-11 email change, renames) require dashboard click-through.
- Does he want even higher convenience (one-click for everything)? Or even more friction (always require dashboard for any Apply)?
- **Riding on this:** memo §6 second form, the email-action-token TTL design.

### §5 — Feedback / communication

These determine the two-way feedback design.

**§5.1 — When something looks wrong on the sheet (parser misread, missing field), how does he tell you about it currently?** [BLOCKER]

- Text? Email? In-person? Slack?
- The current dashboard "Report" button (M8) routes to GitHub Issues. Does that match how he'd naturally communicate?
- **Riding on this:** whether the email reply-to-feedback path needs to feel like "texting Eric" or like "filing a ticket."

**§5.2 — Would a structured "report a problem" form feel friction-y or natural?** [CALIBRATION]

- Some operators prefer freeform text ("hey something's off").
- Others prefer structured forms ("category: parse error / impact: high / sheet: <name>").
- **Riding on this:** the report-form UX in M8. The current spec assumes structured form; calibrate.

**§5.3 — Does he prefer to suggest changes to the system, or just report bugs?** [CALIBRATION]

- Reports = "this is wrong, fix it."
- Suggestions = "what if this worked differently?"
- The current `/api/report` pipeline handles both as GitHub Issues; the framing in the UI matters.
- **Riding on this:** whether the email push needs separate "report bug" vs "suggest change" affordances or one combined "feedback" link.

### §6 — Multi-show / scaling

These determine whether v1 can ship as-is or needs scope adjustments.

**§6.1 — How many shows does he have in flight simultaneously?** [BLOCKER]

- 1–3? 5–10? More?
- Determines whether per-show coalescing (memo §4) is sufficient or whether cross-show batching is needed from day 1.
- **Riding on this:** daily-digest design — does it consolidate across shows by default?

**§6.2 — Does he review each show separately, or in a batch session?** [CALIBRATION]

- Affects dashboard navigation patterns and whether "show X has 3 pending" notifications should aggregate or stay per-show.
- **Riding on this:** dashboard list ordering + email digest grouping.

### §7 — Things we'd otherwise assume

These are the "we already decided X, but let's double-check" questions. Often answered fastest.

**§7.1 — Is the FIRST_SEEN_REVIEW gate friction or value-add?** [BLOCKER]

- We currently REQUIRE Apply on first-seen. Is that the right default, or does Doug just want sheets to go live the moment he drags them in?
- **Riding on this:** whether FIRST_SEEN_REVIEW is a stage gate (current spec) or a notification-only event.

**§7.2 — Should the system ever auto-revoke a signed link if the underlying crew row disappears?** [CALIBRATION]

- The MI-11 email change path bumps auth floor. But what about MI-6 (crew member removed entirely)? Should their old links die immediately, or stay live until they hit the page and see "you're not on the crew list anymore"?
- **Riding on this:** the §5.2 destructive-transaction crew-removal handler — currently uses floor-revocation; could be different.

**§7.3 — How does Doug feel about crew seeing edits "live" vs after a delay?** [BLOCKER]

- Currently: edits propagate within ~5 min via cron + push.
- Some operators prefer a deliberate "publish" gate even on existing shows. Does Doug?
- **Riding on this:** the entire continuous-sync model. If he wants a "publish all pending edits" button, the design needs a staging-and-promote layer on top of the current auto-apply path.

---

## Answered

> **Note on provenance:** answers below provided by Eric (dev) based on outside-in observation of Doug's workflow, pending direct confirmation with Doug. Treat these as "high-confidence working assumptions sufficient to unblock design" rather than ratified facts. When Doug actually answers, update the entry in place — same date / answer / follow-up format. If his answer differs from Eric's, note both with timestamps and update affected design sections.

### §1.1 — Drive structure mental model — answered 2026-05-09 (Eric, pending Doug confirmation)

**Answer:** The watched-folder model is an acceptable starting point. Doug shares his sheets via Drive folder workflow already; a designated "FXAV Live Shows" folder slots into his existing structure naturally.
**Design follow-up:** No change needed. Confirms M10 onboarding wizard's folder-pointer design and M6's cron-scans-watched-folder model. The first-cut UX is correct.
**Audit trail:** Conversation 2026-05-09; commit `246beb6` and follow-up commit (this one).

### §1.2 — Ready-to-share moment — answered 2026-05-09 (Eric, pending Doug confirmation)

**Answer:** "I shared the link" means the sheet is **final**, unless new information arrives that requires editing. The folder-move is a deliberate "this is ready" act, not "here's a draft for feedback."
**Design follow-up:** Leans toward auto-publish on FIRST_SEEN_REVIEW (since Doug has already decided "this is ready" by moving it). However, §7.1 is still open and that's the canonical decision point. When §7.1 is decided, this answer informs the default direction. **Cross-link:** the related concern is "what if Doug drags the wrong file?" — caught by FIRST_SEEN_REVIEW today, would be uncaught with auto-publish. A possible compromise (auto-apply after a 4h email-delayed window with one-click cancel) preserves both the "trust the drag" UX and the "wrong-folder mistake" safety net. Capture for §7.1 deliberation.
**Audit trail:** Conversation 2026-05-09; commit forthcoming.

### §4.1 — Attention surface channel choice — answered 2026-05-09 (Eric provisional + Doug expansion same day)

**Eric's provisional answer (2026-05-09 morning):** Email primary; build SMS-ready abstraction.
**Doug's actual answer (2026-05-09 same day):** Email, SMS, AND mobile notifications are all high-reach attention surfaces — value all three.
**Reconciled answer:** Email remains v1 primary (Doug works on PC/laptop; quickest to ship). **SMS becomes the FIRST follow-on channel post-v1**, NOT a "maybe someday" — Doug values it as a high-reach surface. Mobile push notifications (PWA) are a third channel, lower priority than SMS for v1+1 scope. Channel-agnostic abstraction (`'email' | 'sms' | 'webhook'`) ships day 1.
**Design follow-up:** Update `notification-design-memo.md` to reflect that SMS is a planned v1+1 deliverable, not a vague "follow-on." For tier-1 (real-time push) events specifically, consider whether SMS is the right channel from day 1 — auth-sensitive events (MI-11, renames) may warrant SMS even in v1 for time-sensitivity. Defer this decision; flag for the push-surface milestone.
**Audit trail:** Conversation 2026-05-09; commit `c86a201` (initial Eric answer); commit forthcoming (Doug expansion).

### §5.1 — Current feedback channel — answered 2026-05-09 (Eric provisional + Doug correction same day)

**Eric's provisional answer (2026-05-09 morning):** Doug texts or emails Eric for last-minute adjustments before in-person contact.
**Doug's actual answer (2026-05-09 same day):** Doug is the **SOLE owner of his sheets currently**. He **doesn't currently tell Eric when something looks wrong — he just edits the sheet directly** (because the sheet IS the source of truth and the only place anyone reads from). There is no existing dev-feedback habit to leverage.
**Reconciled answer:** **No existing feedback channel exists between Doug and the dev.** This isn't a "match the existing habit" design problem — it's a "create a new behavior" design problem. Reply-to-email being "primary because Doug already replies to Eric" is incorrect; he doesn't have the habit yet.
**Design follow-up:** **Reorder feedback forms** (reverses the prior commit's reordering): explicit one-click "Report a problem" link becomes form 1 (most discoverable surface for a non-dev with no prior habit — clear button > implicit reply); reply-to-email becomes form 2 (lowest friction once known but requires Doug to know it works); one-click "Apply from email" stays form 3 (specific use case — low-stakes Apply convenience). Match Doug's §5.2 + §5.3 answers — natural-language description with full context — by making the Report form accept freeform text + auto-attach the show/staging context.
**Audit trail:** Conversation 2026-05-09; commit `c86a201` (Eric's incorrect provisional); commit forthcoming (Doug correction).

### §6.1 — Simultaneous show count — answered 2026-05-09 (Eric, pending Doug confirmation)

**Answer:** **10–15 shows simultaneously** is the realistic upper bound. Materially higher than the implicit ~3–5 default the spec was calibrated against.
**Design follow-up:** **Cross-show coalescing in the daily digest is mandatory, not optional** — at 15 active shows, per-show emails would be untenable even at low staging frequency. Update notification-design-memo §4 (Coalescing) to make cross-show daily digest the default, not a "could also do." Dashboard list (spec §9.1) needs **default sort by urgency** (unactioned-staging-count desc, last-edited-modtime desc) rather than alpha — at 15 shows, alpha order buries the things needing attention. Add a derived note for whichever milestone owns the dashboard polish (M9 or M10).
**Audit trail:** Conversation 2026-05-09; commit forthcoming.

### §7.3 — Live-edits-visible preference — answered 2026-05-09 (Eric, pending Doug confirmation)

**Answer:** Once a sheet is in the watched folder (= published), live edits should be visible to crew. **No publish-gate layer on top of continuous sync.** The folder-move is the only "publish" act; everything after that flows live.
**Design follow-up:** No change needed. Confirms the current continuous-sync model. Reinforces that MI staging gates (which interrupt live propagation only for suspicious changes) are the right calibration layer — a global publish-gate would over-correct.
**Audit trail:** Conversation 2026-05-09; commit forthcoming.

---

### §1.3 — Currently when Doug shares the link, what happens? — answered 2026-05-09 (Eric, observable)

**Answer:** Eric opens the shared Sheets link to view info. Has been making a copy to own Drive but easier to click Doug's link directly.
**Design follow-up:** No design impact — context-only question. Confirms watched-folder doesn't disrupt an existing import flow because there isn't one to disrupt.
**Audit trail:** Conversation 2026-05-09.

### §2.1 — Live vs batch editing — answered 2026-05-09 (Eric)

**Answer:** Probably live editing (info goes in as it arrives).
**Design follow-up:** No change — confirms PUSH_DEBOUNCE_MS = 240_000 (4 min) is well-calibrated for live editing. Live editor + 4 min debounce = transients self-clear cleanly.
**Audit trail:** Conversation 2026-05-09.

### §2.2 — Draft mode on published sheets — answered 2026-05-09 (Eric)

**Answer:** Doug doesn't go back into "draft mode" after sharing — post-share edits are additive / corrective, not big restructures.
**Design follow-up:** Confirms MI-6 (crew shrinkage) and MI-7 (section shrinkage) thresholds are appropriately conservative for Doug's workflow. A >50% section drop or crew loss > 1 IS suspicious for him, not normal. No threshold tuning needed.
**Audit trail:** Conversation 2026-05-09.

### §2.3 — Update frequency leading up to a show — answered 2026-05-09 (Eric)

**Answer:** As info comes in. No set schedule.
**Design follow-up:** No tunable affected. Daily digest still appropriate for tier-2; tier-1 still real-time. Variable cadence is what daily digest handles.
**Audit trail:** Conversation 2026-05-09.

### §2.4 — Multi-tab / multi-device — answered 2026-05-09 (Eric)

**Answer:** Doug edits on mobile sometimes; can have the sheet open in two tabs.
**Design follow-up:** Mobile editing is more autosave-event-prone than desktop (cell-by-cell autosaves); validates the push-debounce rationale further. Two-tab editing is already handled by the spec's same-revision-binding contract — no change. Multi-device implies the future SMS channel (§4.1 expansion) is meaningful — Doug has phone in hand often.
**Audit trail:** Conversation 2026-05-09.

### §3.1 / §3.2 / §3.3 — Edit micro-behavior — answered 2026-05-09 (Eric, "could be either")

**Answer:** Eric doesn't know whether Doug clears-and-retypes financial cells (§3.1), deletes-then-readds crew rows (§3.2), or edits emails in place (§3.3) — could be any of these depending on Doug's habits.
**Design follow-up:** Confirms the [OBSERVE] tag — answerable from production sync logs once the system runs, not from conversation. Push-debounce + MI staging gates handle either pattern correctly. The MI-8 modtime debounce (amendment 7) covers §3.1 transients regardless of which pattern Doug uses.
**Audit trail:** Conversation 2026-05-09.

### §3.4 — Non-LEAD role flag change frequency — answered 2026-05-09 (Eric)

**Answer:** Non-LEAD changes definitely happen, but roles are usually set up-front and stable through the show.
**Design follow-up:** Validates amendment 8 (MI-9 narrowing). Non-LEAD changes happen but aren't frequent enough to justify staging them — the info-severity `ROLE_FLAGS_NOTICE` admin alert is the right calibration. Amendment 8 stands as written.
**Audit trail:** Conversation 2026-05-09.

### §3.5 — LEAD toggle predictability — answered 2026-05-09 (Eric)

**Answer:** LEADs are usually decided when crew is determined (i.e., up-front, deliberately). Emergency upgrades are theoretically possible (e.g., a LEAD no-shows and a non-LEAD covers) but Eric can't recall it happening.
**Design follow-up:** Validates the LEAD-toggle staging gate (MI-10 / narrowed MI-9). Predictable LEAD assignment + rare emergency changes = the gate is value-add (catches the emergency case), not friction (Doug is rarely making LEAD changes anyway). Amendment 8 stands.
**Audit trail:** Conversation 2026-05-09.

### §4.2 — Doug's work-day start time — answered 2026-05-09 (Eric)

**Answer:** Doug is an early riser.
**Design follow-up:** Daily digest send time should be early — `DIGEST_HOUR_LOCAL = 7` (7am ET) rather than 8am default. Refine to a specific hour when Doug confirms his actual start time, but bias earlier than the original spec default.
**Audit trail:** Conversation 2026-05-09.

### §4.3 — Reply-to-email behavior — answered 2026-05-09 (Eric)

**Answer:** Eric doesn't know Doug's current behavior with automated emails, but reply-to-feedback could be a valuable feature.
**Design follow-up:** [OBSERVE] confirmed — measure post-launch. Per §5.1 correction (no existing feedback habit), reply-to-email is form 2 not form 1 of the feedback affordances. Worth supporting from day 1 of the push surface but don't bank on Doug discovering it organically.
**Audit trail:** Conversation 2026-05-09.

### §4.4 — Confirmation email on auto-publish — answered 2026-05-09 (Doug)

**Answer:** Yes, confirmation on publish is helpful.
**Design follow-up:** **Confirmation-on-publish is required** for first-seen auto-applies (per amendment 9 — see below). Email lands within minutes of cron picking up the sheet, contains the parse summary, and includes the **24h unpublish-undo button** (§7.1 decision). Add to notification memo's tier-1 codes: `SHOW_FIRST_PUBLISHED` (new code, info-style but tier-1 because it's tied to a deliberate publish event Doug took action to trigger).
**Audit trail:** Conversation 2026-05-09.

### §4.5 — One-click Apply scope — answered 2026-05-09 (Eric)

**Answer:** Prioritize convenience.
**Design follow-up:** Expand one-click Apply scope from "low-stakes only" (MI-6, MI-7, MI-7b, MI-8, MI-8b, MI-8c) to include moderate-stakes events too. Auth-sensitive events (MI-11 email change, MI-12/13/14 renames) STILL require dashboard click-through because Doug needs to see the diff before bumping auth floors that kill active links — but everything else can be one-click. Update notification memo §6 form 3 to reflect.
**Audit trail:** Conversation 2026-05-09.

### §5.2 — Form vs freeform feedback — answered 2026-05-09 (Doug)

**Answer:** Both. Doug is a non-dev so natural-language description is more natural for him; the system needs full context to be useful.
**Design follow-up:** Report form is **freeform text input + auto-attached structured context**. Don't ask Doug to fill out structured fields (severity, category, etc.) — just give him a textbox and stamp the show/staging/parse context onto the submission server-side. The auto-attached context becomes part of the GitHub issue body, not the user-facing form.
**Audit trail:** Conversation 2026-05-09.

### §5.3 — Reports vs suggestions — answered 2026-05-09 (Doug)

**Answer:** Both. If Doug buys into v1, he'll likely collaborate to improve it for his workflow.
**Design follow-up:** Single "feedback" affordance covers both bug reports and feature suggestions — don't split into separate routes / forms. The dev can re-categorize at triage time. Doug shouldn't have to decide "is this a bug or a suggestion?" before submitting. GitHub issue triage uses labels for the categorization, not separate intake paths.
**Audit trail:** Conversation 2026-05-09.

### §6.2 — Per-show vs batch review — answered 2026-05-09 (Eric)

**Answer:** Doug reviews each show separately.
**Design follow-up:** Daily digest groups by show (subject: "Show X: 3 items / Show Y: 1 item / Show Z: 2 items"), not by item type. Each show's section is independently reviewable. Dashboard list orders by urgency per §6.1 follow-up but per-show review remains the per-row-click action.
**Audit trail:** Conversation 2026-05-09.

### §7.1 — FIRST_SEEN_REVIEW friction or value-add — answered 2026-05-09 (Doug + Eric sub-decision)

**Answer:** Frictionless workflow if no issues. Sheets should go live the moment Doug drags them in. **The folder IS the publish gate.**
**Sub-decision (Eric, same conversation):** Immediate publish + 24h email-undo. One-click "I made a mistake — unpublish" button valid for 24h that archives the show and revokes any signed links sent in the interim.
**Design follow-up:** **Spec amendment 9** — replaces FIRST_SEEN_REVIEW staging with auto-apply on first-seen sheets that pass MI-1..MI-14. ONBOARDING_SCAN_REVIEW (wizard discovery) stays as-is — different semantic. New code `SHOW_FIRST_PUBLISHED` lands as a tier-1 confirmation event. New endpoint `POST /api/show/[slug]/unpublish?token=<signed>` handles the 24h undo. Notification memo schema sketch gains `shows.unpublish_token` + `shows.unpublish_token_expires_at` columns (per-publish-event, not per-staging — finalize at spec-write time).
**Audit trail:** Conversation 2026-05-09. Amendment 9 in `00-overview.md`.

### §7.2 — Auto-revoke on crew row removal — answered 2026-05-09 (Doug)

**Answer:** Old invalid links should lead to a "not on crew list" page.
**Design follow-up:** Confirms current spec design — crew removal triggers auth-floor revocation; old links 401/403 with "not on crew list" message via `lib/messages/lookup.ts`. No change. The §12.4 catalog already handles this via `validateLinkSession`'s 12-step validator and the standard auth-floor mechanism.
**Audit trail:** Conversation 2026-05-09.

### §7.3 — Live edits visibility on published sheets — answered 2026-05-09 (Doug, reconfirms Eric provisional)

**Answer:** Maintain current convention. Once a sheet is shared with crew (= in the watched folder), edits flow live. No publish-gate layer on top of continuous sync.
**Design follow-up:** No change. Already captured in initial answer (commit `c86a201`); Doug's reconfirmation locks it.
**Audit trail:** Conversation 2026-05-09.

---

## Open (priority subset)

All BLOCKER and CALIBRATION questions answered as of 2026-05-09. The remaining open items are [OBSERVE] questions answerable from production logs once the system runs:

- **§3.1, §3.2, §3.3** — edit micro-behavior (clear-and-retype vs type-over patterns). Measure post-launch from sync log diffs.
- **§4.3** — reply-to-email behavior. Measure post-launch from `feedback_inbox` ingestion volume.
- **§2.4** — multi-tab / multi-device frequency. Measure post-launch from sync events.

No further conversation needed before push-surface milestone is specced. The validated assumption set is sufficient.

---

## Question hygiene

- **Don't add questions here that don't have a design choice riding on them.** This doc isn't a curiosity log — every entry needs a "Riding on this" line that names the spec / plan section being calibrated.
- **Don't ask Doug things we can observe.** §3 (edit micro-behavior) is mostly observable from sync logs once production runs. Ask only if observation isn't feasible.
- **Don't ask Doug things he can't answer.** Questions like "what's the right `PUSH_DEBOUNCE_MS` constant?" are engineering judgment, not user research. Doug can answer "do you find these emails annoying?" — that's the right framing.
