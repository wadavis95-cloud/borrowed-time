# V8.6 solo computer racers

User approved improving solo by racing computer players. Execute inline; final independent review. Local only; no deployment/submission. Backup: backups/pre-v8.6-solo-rivals-20261028.bundle, baseline73141d0.

Design: one human and three CPU characters from the selected map, distinct role identities, shared seed and shared authoritative local debris schedule. CPU uses existing normal-input demo driver at 150ms decision intervals; independent clocks, ability costs, collisions and finish times. No speed cheats, rubber-banding or injected finishes. Solo stays local with no sockets, pause/tab-hide freeze everyone, restart creates a fresh race. Results/standings use the existing shared UI with explicit CPU labels and (you); replay never waits for CPUs. Remaining CPUs can finish naturally after the human to complete standings.

- [x] Tests first: unique cast/grid/course all maps; pause/restart; private spending; shared impacts; rank/finish/DNF; normal CPU strategies finish and separate.
- [x] Implement isolated solo-race controller, reuse driver; integrate main controls/loop/renderer/opponents, live standings and result authority. Preserve online path.
- [x] Verify all suites/local release; browser real solo inputs/pause/restart, opponents, results and phone HUD. Review/fix.
- [x] Document and commit locally. Public V8.4 and unsubmitted presentation drafts remain unchanged.

Execution record: missing-controller test failed first; implemented controller and integration.153 unit pass/11 default network skips;38 network pass;68-asset local release check passed. Browser confirmed purchases, four labeled racers, paused clock2.5 unchanged, human DNF with CPUs still racing, replay immediately resets clock59.7/roster4. Phone390×844 fits. Independent review found no actionable defects. Local-only; no deployment, contest submission or update to prior presentation drafts.
