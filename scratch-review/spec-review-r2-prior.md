SECONDARY REGRESSION CHECKLIST — prior round-1 findings (verify fixes AND regressions, but do a fresh full-spec pass FIRST; do not limit this round to these):

R1 findings, all claimed addressed in the current spec:
1. [HIGH] Compound state: Step3ReviewModal reachable while publish running; if a blocker fires, a 2nd portaled aria-modal stacks — stacking/focus/z-index/Escape/scroll-lock undefined. → Author added §7a "Compound: review modal open while a blocker fires" (z-order via portal-last, focus ownership, Escape stopPropagation, scroll-lock composition) + component test §10.11.
2. [HIGH] Portal makes `container.textContent` invariant-5 negatives vacuous (FinalizeButton.test.tsx:478,570-571, etc.). → Author added §9 class-2 breakage + §10.12 task rescoping every container.textContent negative to the panel testid, with a non-vacuity assertion.
3. [MEDIUM] Transition inventory incomplete; scrim-fade untested. → §7 now a full 6×5 pair matrix; §10.8 transition-audit now asserts scrim fade class too.
4. [LOW] Imprecise prop citations (BlockedRowResolver.disabled?, HelpAffordance params?/route?). → §2 now cites full type defs.
5. [LOW] Stray closing tags at spec end. → removed.
</content>
