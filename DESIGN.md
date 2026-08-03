# Draft21 — Design

The visual and interaction system behind the app. `design.css` is the single
source of truth for style; this file is the reasoning behind it.

---

## 1. Research

Fifteen products were studied for *patterns*, not for looks. What follows is
what was taken and, more importantly, why it works.

### Draft rooms — Sleeper, ESPN Fantasy, Yahoo Fantasy, Underdog

| Pattern | Why it works |
| --- | --- |
| A permanently visible "on the clock" header carrying team, round and pick number | A draft has exactly one piece of state that matters at any moment. If a user ever has to scroll to find whose turn it is, the screen has failed. |
| Colour used only for identity (team / position), everything else neutral | A draft board is dense. When only meaningful things are saturated, the eye is pulled to meaning instead of to decoration. |
| A confirm step anchored to the bottom of the screen, not inline in the list | With 20+ names on screen the inline confirm is hundreds of pixels away by the time you reach the bottom of the list. |
| An "up next" ticker | Anticipation is most of what makes a draft watchable for the people who are not currently drafting. It costs one line. |
| Roster and pool never live on separate tabs you have to switch between | Every tab switch is a lost second and a lost mental thread. |

### Live scores — Sofascore, FotMob, Flashscore, OneFootball

| Pattern | Why it works |
| --- | --- |
| A 6–8px pulsing dot as the "live" signal | It reads instantly at any size and never competes with a name or a number for attention. A "LIVE" badge does both jobs worse. |
| Strong column rhythm in list rows (crest → name → number) | Consistent horizontal anchoring is what makes a long list scannable rather than readable. |
| A thin coloured rail on the leading edge of a row to encode state | Encodes a category without spending any horizontal space or any text. |
| Tabular figures for every number | Numbers that change (score, pick count) must not make the layout twitch. |
| Empty states that name the next action | "No data" is a dead end; "waiting for the host to start" is a status. |

### Games — Clash Royale, Brawl Stars, EA FC Companion

| Pattern | Why it works |
| --- | --- |
| Lobby as a presence board: who is here, which slots are open, one obvious button | Turns waiting — normally dead time — into part of the event. |
| Celebration moments kept to 400–800ms and never blocking | Long enough to feel rewarding, short enough that the next player is not waiting on an animation. |
| The team/squad presented as an object you are proud of, not a bulleted list | The roster is the artefact people screenshot and paste into WhatsApp. It should look like something. |
| Chunky press states with real scale feedback | On a phone with no hover, the press state *is* the affordance. |

### 2025–26 mobile craft

Safe-area-aware fixed action rails; springy but short and interruptible
transitions; skeletons instead of spinners (they show the shape of what is
coming); `prefers-reduced-motion` respected; haptics on state changes that
matter; dark-first with true near-black for OLED.

### The six rules extracted

1. **One question per zone.** Header = "what is happening". Body = "what can I
   do". Dock = "the one next action".
2. **Colour is data.** Saturation is reserved for team identity and for "live".
3. **Motion only for state change.** Decorative loops compete with the live
   signal and make it mean less.
4. **Density for lists, generosity for decisions.** The player pool is dense;
   the confirm sheet is huge.
5. **The primary action never moves.** A button that drifts is a button that
   gets mis-tapped.
6. **Never make the actor wait for the interface.**

---

## 2. Three directions

### A — "Floodlight" *(chosen)*

- **Personality** — Thursday night under stadium lights. Broadcast graphics.
- **Type** — System stack, display weights 800–850, tight negative tracking,
  tabular numerals.
- **Colour** — Near-black pitch (`#06080B`); team red / white / black are the
  only identity colours; one electric lime (`#D8FF3E`) means *live / your turn /
  primary action* and nothing else is ever allowed to be it.
- **Spacing** — 4px base, generous 16–24px block rhythm, edge-to-edge panels.
- **Components** — Rounded panels with hairline borders, glass sticky header,
  bright high-contrast player chips, bottom sheets.
- **Motion** — Directional and fast (110–340ms). A light sweep across the HUD
  when it is your turn; cards land rather than fade.
- **Hierarchy** — Turn HUD (sticky) → pulse bar → player pool → board → teams.

### B — "Matchday Ticket" *(rejected)*

- **Personality** — Calm, editorial, a well-set newspaper sports page.
- **Type** — Serif display (Frank Ruhl Libre) over a neutral UI sans.
- **Colour** — Warm off-white paper, charcoal ink, team colour as a small chip.
- **Spacing** — Wide margins, thin rules, lots of air.
- **Components** — Flat cards, numbered rows, horizontal rules.
- **Motion** — Crossfades only.
- **Hierarchy** — Typographic: everything is a heading level.

**Critique.** The most legible of the three and the one that would age best.
It also has no pulse. A draft night with friends is an *event*, and this
direction turns it into a table of results. Its fatal flaw is specific: the
live draft screen could not become the centrepiece, because nothing in the
system can express urgency without breaking the system. Its typographic
discipline and row rhythm were kept.

### C — "Arena" *(rejected)*

- **Personality** — Arcade game lobby. Gold trim, extruded buttons, mascots.
- **Type** — Heavy rounded display with outlines.
- **Colour** — Saturated everywhere: violet, gold, cyan, plus team colours.
- **Spacing** — Tight and busy; badges and ribbons filling gaps.
- **Components** — Bevelled 3D buttons, glows, sparkles.
- **Motion** — Bouncy springs, screen shake on a pick, long confetti.
- **Hierarchy** — Everything shouts.

**Critique.** Genuinely fun for about one draft. Then two problems become
permanent. First, saturating everything destroys colour-as-data: gold and cyan
chrome compete with team red/white/black, and "whose turn is it" stops being
answerable at a glance — which is the one thing the product must do. Second,
its motion language is celebratory rather than informative, and celebration
that fires on every pick makes an 18-pick draft slower and noisier. Its button
depth, its lobby presence energy and its celebration *timing* were kept.

### Why A won

Near-black gives team colour maximum contrast, is right for a night-time
context, and is kind to OLED phones. A single accent makes "your turn"
unambiguous with zero reading. Broadcast motion is directional, so it
communicates a state change in under 400ms instead of decorating one.

**The one real tradeoff — dark UI and outdoor visibility.** Light backgrounds
genuinely beat dark ones in direct sun. Three things answer it: the app is used
on a Thursday evening; every load-bearing string is ≥15px at ≥650 weight and
≥7:1 contrast (`--ink-3` is decoration only and never carries meaning); and
critically, **the player pool — the one surface you scan under pressure — is
the brightest thing on screen** (`#F3F7FC` cards, near-black text). Brightness
doubles as the affordance: the pool is bright exactly when you may tap it.

---

## 3. Design system

### Tokens (`design.css` §1)

**Surface** `--pitch-950 → --pitch-600` (#06080B → #232B38), plus `--line` /
`--line-2` hairlines. Dark UI gets depth from light, so the inset top hairline
matters more than the drop shadow.

**Ink** `--ink` #FFFFFF · `--ink-2` #AEB9C9 (8.1:1) · `--ink-label` #8E9AAD
(11px caps) · `--ink-3` #717D90 — *decoration only, never load-bearing*.

**Accent** `--volt` #D8FF3E on `--volt-ink` #0A0F02. Used for: it is your turn,
the live dot, the single primary button on a screen. Nothing else.

**Identity** `--team-red` #FF4747 · `--team-white` #EEF3FA · `--team-black`
#39424F, each with a matching glow. Any element adopts a team by carrying
`data-team="Red|White|Black"`; one attribute, one source of truth.

**Bright** `--bright` #F3F7FC / `--bright-ink` #0A0D12 — the actionable pool.

**Type scale** display `clamp(30–38px)/800` · h1 25/800 · h2 19/750 · lg 17/650
· body 15/500 · meta 13/600 · micro 11/800 tracked. Negative tracking on
everything above 17px. `.num` and `.code` force LTR + `unicode-bidi: isolate` +
tabular figures.

**Radii** 14 chip · 16 button · 22 card · 30 sheet · 999 pill.

**Motion** `--d-fast` 110ms · `--d` 190ms · `--d-slow` 340ms, with
`--ease` / `--ease-out` / `--ease-spring`.

### Components

`appbar` · `me` (identity chip) · `btn` (+ `--volt` `--good` `--ghost`
`--quiet` `--danger`, sizes `--lg` `--sm` `--xs` `--icon`) · `card` · `field` ·
`chip` · `livedot` · `shirt` · `team-dot` · `teamcard` + `roster` · `hud` +
`hud__meter` · `ticker` · `pool` / `pick` · `feed` · `dock` · `sheet` ·
`slot` (+ `--compact`) · `people` / `person` / `avatar` · `namegrid` /
`namebtn` / `shirtpick` · `tally` / `preview` / `problem` · `trophy` ·
`toast` · `connbar` · `skeleton`.

### RTL

Authored right-to-left, not mirrored. Every box uses logical properties
(`padding-inline`, `inset-inline-start`, `margin-block`). Only genuinely
directional glyphs flip. Numbers and game codes are bidi-isolated so a code
never reorders next to a Hebrew word.

> One RTL trap worth recording: `margin-inline-start: auto` resolves against
> the **child's own** `direction`, so an auto margin on a `.num` span (which is
> forced to `ltr`) lands on the wrong side. Section headers use
> `justify-content: space-between`, which is direction-agnostic.

---

## 4. Animation decisions

Motion is reserved for state changes, and the render layer enforces it. A
realtime app repaints on every Firestore snapshot — including metadata-only
ones — so `diffForAnimation()` compares the new paint against the previous one
and only then bakes an animation class into the markup.

| Moment | Motion | Why |
| --- | --- | --- |
| Turn handover | `anim-turn` — 420ms spring drop on the HUD | The single most important state change in the product. |
| Your turn begins | `anim-flash` volt ring + `[26,70,26]` haptic + `aria-live` | Must be noticeable when the phone is face-down on a table. |
| A pick lands | `anim-land` on the newest board row | Shows *what* changed rather than redrawing the whole list. |
| Pick confirmed | 12-particle pop, ~350ms | Reward without making the next captain wait. |
| Draft finished | 46-particle shower + a longer haptic pattern | The one moment that has earned a real celebration. |
| Your turn, ongoing | 3.2s light sweep across the HUD | Broadcast ambience. Slow enough to read as atmosphere, not as a demand. |
| Sheet appears | 26px rise + fade, 340ms | Deliberately short travel — a full-height slide can strand the confirm button off-screen if the animation is ever throttled. |
| Screen entry | `anim-rise` staggered 60/120/180ms | Gives a screen an order to be read in. |

`prefers-reduced-motion` collapses every duration to 1ms, disables the HUD
sweep and suppresses confetti entirely.

---

## 5. UX decisions

| Decision | Before | Why |
| --- | --- | --- |
| Home is two choices; pasting the roster is its own step | Home led with a 21-line textarea | Exactly one person per week creates a game. Everyone else joins. |
| Roster parsed live with a name preview and duplicates highlighted in place | Validation arrived as a red toast after pressing the button | You can see the typo before you commit 21 names. |
| Team slot *is* the claim control | The lobby listed the teams, then listed them again as a separate "pick your team" grid | Same information twice, one extra decision, one extra tap. |
| Turn HUD is sticky | Whose turn it is scrolled off the top | The one thing that must always be answerable. |
| Identity chip in every app bar | Never shown at all | On a shared or borrowed phone there was no way to tell if you were a captain or a spectator. |
| Confirm is a bottom sheet | An inline card several hundred pixels above you by the time you picked the 19th name | Two taps, zero scrolling, primary action in the thumb zone. |
| Primary action leads (right) in the confirm row | — | RTL convention *and* right-hand thumb reach. |
| Scrim only for the captain confirming | — | A spectator is not making a decision; dimming the draft for them hides the thing they came to watch. |
| Your team is listed first | Teams in document order | The roster you check between every pick was two scrolls away. |
| Spectators get the full board above the pool; captains get the pool first | Spectators saw only rosters — no chronology at all | Ordered by role, not by turn, so the layout never reshuffles mid-draft. |
| Pool brightness = "you may act" | Same colour either way | Readable from across the room, and the bright state survives sunlight. |
| Host tools behind a sheet | Undo / reset sat inline under the player pool | One mis-tap from destroying a live draft. |
| Disabled primary buttons drop their accent | Stayed volt at 38% opacity | A coloured disabled button reads as "tap me" and gets tapped. |
| App bar hides under the connectivity alert | Alert overlaid it, leaving a peeking strip | Keeps the existing (correct) no-reflow behaviour without leaving invisible tap targets. |

### Deliberate non-goals

- **No pick clock.** Every draft-room product has one, and it would need
  server timestamps the document schema does not carry. Adding it would mean
  changing proven backend architecture, which was explicitly out of scope — and
  a countdown is the wrong pressure for a friendly game.
- **No light theme.** Three phones showing three palettes made "whose turn is
  it" harder to call across a table. Contrast is carried by size and weight.

---

## 6. Implementation notes

- `design.css` replaced `tailwind.css` + `tailwind.src.css` + `styles.css`.
  There is now **no CSS build step**: adding a class means writing it. The
  previous setup silently produced unstyled markup whenever a new utility was
  used without rebuilding.
- Nothing in the game logic changed. `picks` is still the single source of
  truth, transactions still re-validate the actor, snake order is still derived,
  the rules file is untouched, and the WhatsApp export still shuffles both team
  order and player order.
- `?lp=1` forces Firestore long-polling. It exists only so the app can be
  driven inside automated browsers whose network stacks break the SDK's
  streaming-XHR probe; production is unaffected.
