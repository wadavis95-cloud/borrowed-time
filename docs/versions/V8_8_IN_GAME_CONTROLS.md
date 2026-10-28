# V8.8 local UI follow-up: in-game controls

Movement and purchases now sit over the course rather than below it. The lower left has circular left/right controls with Hop above; the lower right has compact red Boost and blue Long jump buttons. Labels, prices, active/cooldown feedback and contextual ability hints are retained. Keyboard controls remain WASD/Q/E; visible controls also work with a mouse.

The timer sits at the top center, alongside the existing standings and pause button. Transparent control containers allow taps/swipes outside the actual buttons to reach the course. The start/pause/results overlay remains above controls. Phone safe-area insets are respected. Landscape uses the full course width rather than reserving a sidebar.

No physics, prices, map placement, AI or network changes. Local only; not pushed, deployed or submitted.

Backup: `backups/pre-in-game-controls-20261028.bundle`, complete Git history at `1c25d8b`.

Verification: syntax checks; 163 passing unit tests (11 network tests skipped); browser checks at 390×844, 320×740 and 844×390. Verified movement, Hop, paid Leap, Boost, pause/resume, and layout bounds. Responsive browser testing is not a physical phone test.

## PC layout follow-up

Keyboard/mouse players now see two short rectangular ability cards side by side, with Q/E badges, and a small W-over-A/D movement guide. Touch-only players retain the thumb controls. Actual keyboard or touch input switches the presentation on hybrid devices using the existing input detector. The solo launch button is now “Solo race”.

Verified keyboard movement, Hop, Q Boost and E Long jump in the browser at 1280×800, checked a narrow PC layout, and passed all three input-mode tests. No gameplay or price changes.
