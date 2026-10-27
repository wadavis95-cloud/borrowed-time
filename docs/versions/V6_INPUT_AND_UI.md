# V6 randomized runs and adaptive controls

## Platform requirement

Handshake's official mission describes a public multiplayer URL replayable from any phone or laptop, without accounts or app installation: https://joinhandshake.com/learn/create-a-multiplayer-game-8d7d59b5/ (checked October 27, 2026). Both keyboard and touch input therefore matter.

## Random runs

Solo Play, New run and Restart now choose a fresh Web Crypto seed. An immediate seed repeat is avoided, including unsigned wraparound. The shared generator randomizes lane patterns, obstacle types, spacing and roof-debris placements while preserving its viable route constraints. Explicit seeds still reproduce courses for debugging and tests. Multiplayer rooms and rematches already generate fresh server-owned seeds; every racer in a room continues to receive the same course.

## Controls

- Keyboard: A/D or left/right arrows switch lanes; W or up arrow hops; Q boosts; E buys long jump. 1/2 remain ability aliases. Space no longer hops.
- Touch: swipes and large movement buttons; tap the ability buttons. Keyboard badges and the key legend are hidden.
- Layout uses pointer capabilities rather than viewport width or user-agent guessing. A narrow laptop retains keyboard controls. Touch-only devices start with touch controls. Hybrid devices follow actual touch/pen, mouse or gameplay keyboard input, and respond to capability changes.
- The same input mode updates the brief start hint and How to play instructions. On-screen controls stay available to touch devices at desktop widths. Clicking a movement button with a mouse does not hide it before its click can fire.

`src/input.js` handles mode selection and switching. `src/main.js` applies it to labels, guides and real input. CSS selects the appropriate controls from the document's `data-input` attribute.

## Less screen text and stronger abilities

Removed repeated headings, clock-budget reminders, purchase notes, lengthy room messages and repeated default button descriptions. One pre-race sentence explains the time cost. Detailed instructions remain in How to play. During a solo run the setup form and title are hidden. Active/cooldown/unavailable feedback still appears when relevant, and ability purchases report their price beside the clock.

Boost uses vivid lime, long jump vivid purple, with dark text, visible costs and keyboard badges. Active states retain a colored border. Names and labels distinguish abilities independently of color.

## Verification

107 standard tests passed; all 29 network tests passed separately. Coverage includes immediate seed repeats, changed ground/roof layouts, phone/PC capability defaults, hybrid transitions and hardware-change listeners. Existing shared-course and 128-course route checks pass. Browser checks exercised Q/E purchases and W/A/D input, verified the keyboard layout hides touch buttons, and checked a narrow viewport for overflow. This does not replace physical-phone testing.

Changes are local; public deployment is unchanged. Previous versions remain in Git history.
