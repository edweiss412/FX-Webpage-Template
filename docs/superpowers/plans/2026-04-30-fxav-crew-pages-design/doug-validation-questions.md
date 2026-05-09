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

## Open

### §1 — Publishing model and folder structure

These determine whether the watched-folder + FIRST_SEEN_REVIEW design fits Doug's mental model or fights it.

**§1.1 — What does Doug's current Drive structure look like?**

- Does he have separate folders for drafts vs. ready-to-share, or one folder for everything?
- Where would the FXAV "watched folder" naturally fit? Would he need to reorganize, or does it slot into existing structure?
- **Default if unanswered:** assume he creates a top-level "FXAV Live Shows" folder and drags ready sheets into it. Validate this assumption.
- **Riding on this:** the entire watched-folder UX. If his current structure makes folder-move feel alien, we may need a different "publish" trigger (Apps Script button, cell flag, dashboard publish action).

**§1.2 — Does Doug have a "ready to share" moment, or is it a gradual ramp?**

- Eric's outside-in observation: ~1 week before the show, Doug sends a link. Validate.
- Is the moment of sharing tied to a specific event (e.g., "all confirmations in"), or a calendar countdown ("Wednesday before the show")?
- Does he ever share early (placeholder) and finalize later, or always share late (mostly-final)?
- **Riding on this:** whether FIRST_SEEN_REVIEW should auto-publish or require explicit Apply. If "I share = it's ready," auto-publish on first-seen is defensible. If "I share = here's a draft, will refine," the Apply gate stays.

**§1.3 — Currently, when he shares the link with you, what do you do with it?**

- Do you import the data manually? Read it directly? Copy values into another tool?
- This isn't a Doug question per se, but the answer informs whether the watched-folder concept replaces an existing flow or adds a new one.
- **Riding on this:** how disruptive the new system feels to Doug's habits.

### §2 — Post-share editing patterns

These calibrate the MI staging gates and push-debounce window.

**§2.1 — After he shares with you, does he edit live or batch updates?**

- "Live" = types changes as info arrives, expects them to propagate immediately.
- "Batch" = collects changes through the day/week, finalizes in a single sitting.
- Most operators are mixed. Listen for the proportions.
- **Riding on this:** push-debounce window calibration (4 min default). Live editor = longer debounce ok; batch editor = shorter debounce ok.

**§2.2 — Does he ever go back into "draft mode" on a published sheet?**

- E.g., big restructure: swapping out the entire crew, redoing the schedule, replacing all hotels.
- Or are post-share edits always additive / small (call time changes, one crew swap, fix a typo)?
- **Riding on this:** MI-6 (crew shrinkage) and MI-7 (section shrinkage) thresholds. If big restructures are normal, those thresholds may be too tight; if always small, the thresholds are correctly conservative.

**§2.3 — How often does he update a sheet in the days leading up to a show?**

- Hourly? Daily? Once on Monday, once on Thursday?
- **Riding on this:** push frequency calibration. Hourly editor + tier-1 push for MI-11 = potentially 5+ emails/day. Daily editor = 1 email max.

**§2.4 — Multiple browser tabs or multiple devices?**

- Does he edit on mobile sometimes? Phone Drive app? Desktop?
- Does he ever have the sheet open in two tabs simultaneously?
- **Riding on this:** the spec's same-revision binding contract handles multi-tab safely, but UX expectations differ. Phone editing tends to produce more transient autosave events (cell-by-cell vs. row-at-a-time on desktop).

### §3 — Edit micro-behavior (MI-8 / MI-8b / MI-9 calibration)

These calibrate the staging gates we just ratified in amendments 7 and 8.

**§3.1 — When updating a financial cell (PO#, Proposal $, Invoice), does he clear-and-retype or type-over?**

- Clear-and-retype creates a transient empty state that MI-8 would otherwise stage.
- Type-over (select-all and type new value) doesn't.
- **Riding on this:** whether the MI-8 modtime debounce (amendment 7) is solving a real problem for Doug or an imagined one.

**§3.2 — When editing crew, does he delete a row to retype it, or edit in place?**

- Delete-then-add could trip MI-12/MI-13/MI-14 rename detection on the same person.
- Edit in place doesn't.
- **Riding on this:** whether rename heuristics need to be tighter or looser. If he frequently delete-and-retypes, MI-12/13/14 will fire more often than necessary.

**§3.3 — When an email changes, does he edit in place or delete the row and re-add with the new email?**

- Edit-in-place fires MI-11 (auth-sensitive, kills active links).
- Delete-and-re-add fires MI-12/13/14 depending on name match.
- The two paths have different audit trails and reviewer surfaces.
- **Riding on this:** the MI-11 vs MI-12 reviewer-action UX. Both stage; the difference is in the diff presentation.

**§3.4 — How often do non-LEAD role flags change?**

- E.g., department reassignments: A1 → V1, additions of BO/SHOP, etc.
- Amendment 8 narrowed MI-9 to LEAD-bit only on the assumption that non-LEAD changes are routine and don't need approval. Validate.
- **Riding on this:** whether the `ROLE_FLAGS_NOTICE` info-severity admin alert is the right tier, or whether non-LEAD changes should still stage.

**§3.5 — Are LEAD toggles ever planned in advance, or do they come up unexpectedly?**

- Planned (e.g., "I'm promoting John to LEAD next month") = staging is just confirmation.
- Unexpected = staging is a real safety check.
- **Riding on this:** whether the LEAD-toggle staging gate (amendment 8 retains this) is friction or value-add.

### §4 — Notification channels and timing

These calibrate the push-notification design memo (`notification-design-memo.md`).

**§4.1 — What's his attention surface?**

- Email (always-on)? SMS? Slack? Phone notifications? "I just text Eric"?
- If email: which client (Gmail web, Apple Mail, mobile)? Affects deliverability and whether reply-to-email feedback is realistic.
- **Riding on this:** which channel the push-notification milestone implements first. Default: email. Validate before committing.

**§4.2 — What time of day does his work day start?**

- Determines the daily-digest send time. Default 8am ET; could be 7am, 9am, 10am.
- Does he have a "first thing in the morning, scan email" habit, or is email checked midday?
- **Riding on this:** `DIGEST_HOUR_LOCAL` constant in the design memo.

**§4.3 — Does Doug naturally hit reply on automated emails?**

- Some operators always assume "noreply" and never try replying.
- Others naturally hit reply with notes.
- **Riding on this:** whether reply-to-email feedback (memo §6, third form) is worth building. If he never replies, build only the click-through form. Behavior question — observe after launch.

**§4.4 — Would a confirmation email when a sheet auto-publishes for the first time feel useful or like spam?**

- "I just published Show X for crew" — paper trail for him? Or noise?
- **Riding on this:** memo §5 quiet-success principle calibration.

**§4.5 — One-click Apply-from-email — which staging classes does he want this for?**

- Default: low-stakes only (MI-6, MI-7, MI-8, MI-8b). Higher-stakes (MI-11 email change, renames) require dashboard click-through.
- Does he want even higher convenience (one-click for everything)? Or even more friction (always require dashboard for any Apply)?
- **Riding on this:** memo §6 second form, the email-action-token TTL design.

### §5 — Feedback / communication

These determine the two-way feedback design.

**§5.1 — When something looks wrong on the sheet (parser misread, missing field), how does he tell you about it currently?**

- Text? Email? In-person? Slack?
- The current dashboard "Report" button (M8) routes to GitHub Issues. Does that match how he'd naturally communicate?
- **Riding on this:** whether the email reply-to-feedback path needs to feel like "texting Eric" or like "filing a ticket."

**§5.2 — Would a structured "report a problem" form feel friction-y or natural?**

- Some operators prefer freeform text ("hey something's off").
- Others prefer structured forms ("category: parse error / impact: high / sheet: <name>").
- **Riding on this:** the report-form UX in M8. The current spec assumes structured form; calibrate.

**§5.3 — Does he prefer to suggest changes to the system, or just report bugs?**

- Reports = "this is wrong, fix it."
- Suggestions = "what if this worked differently?"
- The current `/api/report` pipeline handles both as GitHub Issues; the framing in the UI matters.
- **Riding on this:** whether the email push needs separate "report bug" vs "suggest change" affordances or one combined "feedback" link.

### §6 — Multi-show / scaling

These determine whether v1 can ship as-is or needs scope adjustments.

**§6.1 — How many shows does he have in flight simultaneously?**

- 1–3? 5–10? More?
- Determines whether per-show coalescing (memo §4) is sufficient or whether cross-show batching is needed from day 1.
- **Riding on this:** daily-digest design — does it consolidate across shows by default?

**§6.2 — Does he review each show separately, or in a batch session?**

- Affects dashboard navigation patterns and whether "show X has 3 pending" notifications should aggregate or stay per-show.
- **Riding on this:** dashboard list ordering + email digest grouping.

### §7 — Things we'd otherwise assume

These are the "we already decided X, but let's double-check" questions. Often answered fastest.

**§7.1 — Is the FIRST_SEEN_REVIEW gate friction or value-add?**

- We currently REQUIRE Apply on first-seen. Is that the right default, or does Doug just want sheets to go live the moment he drags them in?
- **Riding on this:** whether FIRST_SEEN_REVIEW is a stage gate (current spec) or a notification-only event.

**§7.2 — Should the system ever auto-revoke a signed link if the underlying crew row disappears?**

- The MI-11 email change path bumps auth floor. But what about MI-6 (crew member removed entirely)? Should their old links die immediately, or stay live until they hit the page and see "you're not on the crew list anymore"?
- **Riding on this:** the §5.2 destructive-transaction crew-removal handler — currently uses floor-revocation; could be different.

**§7.3 — How does Doug feel about crew seeing edits "live" vs after a delay?**

- Currently: edits propagate within ~5 min via cron + push.
- Some operators prefer a deliberate "publish" gate even on existing shows. Does Doug?
- **Riding on this:** the entire continuous-sync model. If he wants a "publish all pending edits" button, the design needs a staging-and-promote layer on top of the current auto-apply path.

---

## Answered

_(Move questions here as they're answered. Format below.)_

### §X.Y — [Question summary] — answered YYYY-MM-DD

**Doug's answer:** [paraphrased]
**Design follow-up:** [no change needed | spec amendment N drafted | DEFERRED.md entry MX-DY | follow-up conversation needed]
**Audit trail:** [conversation notes / commit SHA / amendment reference]

---

## Question hygiene

- **Don't add questions here that don't have a design choice riding on them.** This doc isn't a curiosity log — every entry needs a "Riding on this" line that names the spec / plan section being calibrated.
- **Don't ask Doug things we can observe.** §3 (edit micro-behavior) is mostly observable from sync logs once production runs. Ask only if observation isn't feasible.
- **Don't ask Doug things he can't answer.** Questions like "what's the right `PUSH_DEBOUNCE_MS` constant?" are engineering judgment, not user research. Doug can answer "do you find these emails annoying?" — that's the right framing.
