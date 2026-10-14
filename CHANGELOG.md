# Changelog

## Anyone can reset, from every screen, behind a confirm — 2026-10-14

- **Reset is everyone's again** — organizer, captain or watcher — and the ⋯ menu
  is now in the top bar of every screen of a draft, including captain setup and
  the waiting screen (which had no way to reset at all).
- Both depths — *אפס את כל הבחירות* and *התחל מאפס — רשימה חדשה* — go through the
  "בטוח?" sheet: *כן, אפס* or *ביטול*. Tapping outside cancels.
- Starting over with a new list makes whoever did it the organizer of the new
  draft (picking captains needs one); the sheet says so before they confirm.
- Undo and freeing a seat stay with the organizer.

Verified: emulator 75/75 (21 players) and 72/72 (18); production 72/72 (18).

## One organizer, three captains, one link — 2026-10-14

A second pass that strips the flow down to exactly what an evening needs.

- **No codes anywhere.** The home screen has one button, *דראפט חדש*; "join with
  code" is gone, and the game id appears only inside the link.
- **The organizer is whoever created the draft** — remembered on that phone, never
  chosen. The host card and host role are gone from what everyone else sees; the
  one-tap "אני המארגן — המשך בטלפון הזה" fallback lives in the ⋯ menu only.
- **Setup in under a minute:** paste → tap three captains (red, white, black in tap
  order) → a review row per captain with the three kits beside the name → *מוכן —
  שתף את הדראפט* → *שלח בוואטסאפ*.
- **Captains join from the board, not a gate.** The link opens the live lobby or
  draft — teams, captains, players, status — with *באיזו קבוצה אתה?* above it and
  a large card per team. One tap. Taken teams say so with "זה אני — המשך כאן".
  "אני לא קפטן — רק צופה" folds the question away for everyone else. Replaces the
  full-screen role picker.
- **Organizer lobby** lists *קפטן אדום · …* with *מחובר* / *ממתין*; *התחל דראפט*
  unlocks at three of three (start-without-them stays as a small link).
- **Fixed snake order: red → white → black → black → white → red.** The random /
  manual order controls are gone; the kit a captain gets decides when they pick.
- **Equal teams only.** The list must split into three equal teams (6, 9, 12, 15,
  18 or 21); anything else is refused on the paste screen with the fix spelled out.
- Reset was briefly the organizer's alone (reverted — see above).
- Organizer wording throughout (*מארגן*); no schema or rules change.

Verified: emulator 21 players 72/72 and the 18-player WhatsApp list 69/69;
production Firestore 18 players 69/69 — including organizer undo on all phones,
two tabs racing for one pick, refresh, offline/reconnect, a captain and the
organizer each moving to a new phone, and the publish link.

## One link, one tap — live multiplayer pass — 2026-10-14

The whole evening is now: create → send one link → everyone taps who they are →
draft live → publish the teams. No names to type, no codes to keep.

### Joining

- **Role picker as the front door.** Opening the link asks one question, *מי אתה?*,
  with a big card per seat naming its captain ("קפטן אדום · יוסי"), the host seat,
  and "אני רק צופה". One tap and you are in the live lobby or draft. Replaces the
  nickname form plus the separate team-claim step. Watchers write nothing.
- **Remembered on the phone.** A refresh, a locked screen or reopening the link
  goes straight back in — the seat is keyed by the device id already kept in
  `localStorage`, and "just watching" is remembered locally.
- **Taken seats are obvious, and recoverable in one tap.** A claimed seat shows
  "תפוס" with "זה אני — המשך כאן" under it, which moves the seat to this phone.
  The old phone is told ("התפקיד שלך עבר לטלפון אחר") and drops back to the
  picker. The same tap on the host seat moves the host — replacing the 4-character
  host key, which is no longer shown anywhere.
- Tapping your own chip in the top bar reopens the picker to switch seats.

### Drafting

- **One write per pick, pinned to the pick number.** Tapping a player now only
  selects it on your phone; "בחר אותו" in the sheet writes the pick in a single
  transaction that is refused unless the board is still on that exact pick. This
  rules out duplicate picks, double taps (snake order gives one team two picks in
  a row at every turn), two tabs of the same captain, and stale screens — and a
  phone that locks between the two taps no longer leaves a pending pick stalling
  the draft, because nothing half-done is ever stored.
- **Instant on the picking phone.** The confirmed pick is drawn immediately
  (gently pulsing, "שומר…") and replaced by the server's copy a moment later; a
  rejected pick is taken back with a clear reason.
- **No native `confirm()` anywhere.** "Start without all captains", "free a seat"
  and "leave on this device" used `confirm()`, which WhatsApp's in-app browser can
  swallow — leaving the host unable to start. They are now direct, clearly labelled
  actions (all non-destructive).
- **Reset is limited to the host and the captains.** Watchers no longer need to
  register, so the reset menu is no longer open to everyone in the WhatsApp group.

### Host

- **Captains in three taps.** Kits are assigned in tap order (red, white, black);
  tapping a shirt still swaps them.
- **Big "שלח בוואטסאפ" invite** on the lobby, with copy-link next to it. Links are
  real `<a>` elements, which in-app browsers follow even where they block
  scripted pop-ups.
- Start is held until all three captains are in, with "להתחיל עכשיו — אני אבחר
  בשביל …" beside it. The host can free a seat from the menu and pick for that team.
- **"פרסם את הקבוצות בוואטסאפ"** is the host's button on the results screen.

### Rosters of any size

- 18-player evenings (or anything from 6 to 21) work end to end; the paste screen
  shows what the count means ("18 שחקנים · 6 בכל קבוצה").
- **WhatsApp's invisible characters are stripped.** A numbered list copied out of
  WhatsApp carries a WORD JOINER (U+2060) after each number; it used to ride along
  inside 14 of the 18 names — into the published text and past the duplicate-name
  check.

### Infrastructure

- No schema or rules change: the new client works against the rules already
  deployed to `draft21-eabc3`, and existing games keep working.
- `tests/e2e.mjs`: a repeatable multi-phone end-to-end test against the Firestore
  emulator (or production with `npm run test:prod`) — see the README. Kept in its
  own `tests/package.json` so the static deploy never installs it; `.vercelignore`
  keeps it off the site.
- `?emu=host:port` connects to a local emulator (localhost pages only).
- Manifest colours match the app (the launch splash flashed blue), and the page
  has a description and Open Graph title for the WhatsApp link preview.

### Verified

- Emulator: complete drafts with 21 players (66/66 checks) and with the 18-player
  WhatsApp list (64/64), repeatedly.
- Production Firestore: the 18-player run, 63/63 — host, three captains and a
  watcher on separate phone-sized browsers, plus the race, refresh,
  offline/reconnect, seat and host takeover, and missing-captain scenarios.

## Reset all the way back to the player list — 2026-08-13

- **A second, deeper reset: "התחל מאפס — רשימה חדשה".** The picks-only reset kept
  the roster and the captains, which is wrong for the common case — a new evening
  with whoever actually turned up. The new option starts from the player list
  itself: it opens the roster editor prefilled with the current names, and on
  confirmation one write replaces `players`, empties the teams and picks, and puts
  everyone back on captain selection.
- **Same game code and same link.** Nobody has to be re-invited — every device
  follows to the new captain-selection screen in realtime. Nicknames are kept so
  people do not introduce themselves again; team claims are cleared, because the
  new teams reuse the ids `t0..t2` and a stale claim would silently hand somebody
  a team they never picked.
- **Whoever restarts becomes the host**, in a separate write. Captain selection is
  host-only, so without this a restart by anyone else would land the whole group
  on a screen nobody present could act on.
- **Nothing is destroyed until the confirm sheet is accepted.** Opening and editing
  the list writes nothing, and the editor says so; the live draft carries on for
  everyone until the final tap.
- **`firestore.rules`: `players` is no longer frozen for the life of a game** — it
  may change only in a write that also sets status `captains` with no teams, no
  picks and no pending pick. The roster still cannot be edited under a live or
  finished draft, which is the property that mattered; rewriting it as part of
  "start the evening over" cannot corrupt anything because nothing is left to
  corrupt. `verify-rules.mjs` gained the allowed restart plus three denied
  variants (roster rewritten while the draft runs / with picks kept / with teams
  kept). **This needs deploying — `firebase deploy --only firestore:rules`.**
- A rejected write now says so in plain Hebrew and names the likely cause (rules
  not deployed) instead of surfacing "Missing or insufficient permissions".

## Reset for everyone — 2026-08-13

- **Anyone in the game can reset the draft**, not just the host. Waiting for
  whoever happens to be holding the host device was the most common way an
  evening stalled. Both the client gate and the transaction's host check are
  gone; the Firestore rules already allowed the write (they cannot identify an
  actor at all), so nothing changed there.
- **The guard is a confirmation sheet, not a role.** Tapping reset opens a
  dedicated "בטוח שלאפס?" sheet stating how many picks disappear and that it
  applies to everyone, with a danger button and a cancel. Tapping the scrim
  cancels, so the destructive button is never the easy way out. It replaces the
  native `confirm()`, which some in-app browsers swallow silently.
- **The tools menu is reachable by everyone** — the dots button in the draft top
  bar, and the menu link in the lobby and results screens, are no longer
  host-only. It is titled "כלי מנהל" for the host and "אפשרויות" for everyone
  else, and non-hosts see only reset and leave-on-this-device. Undo and release
  stay host-only: they are quiet, surgical changes, where a reset is loud.
- An open confirm sheet is dismissed if the phase changes underneath it, so a
  reset by someone else cannot leave a stale prompt over a changed board.

## Design phase — 2026-08-03

A complete product and visual redesign. No game logic, transaction, security-rule
or realtime behaviour was changed — this pass is presentation and interaction
only. See `DESIGN.md` for the research, the three explored directions and the
system itself.

### Visual system

- New "Floodlight" design system in `design.css`: a near-black broadcast surface
  where team red / white / black are the only identity colours and a single
  electric lime means *live, your turn, primary action* — and nothing else.
- Replaced Tailwind (`tailwind.css`, `tailwind.src.css`) and `styles.css` with
  one hand-written stylesheet. **There is no CSS build step any more.** The old
  setup silently produced unstyled markup whenever a class was added without
  rebuilding the utility sheet.
- Full token set: surfaces, ink (with an explicit "decoration only" tier), team
  identity via a single `data-team` attribute, type scale, radii, elevation,
  motion curves and safe-area variables.
- RTL is authored, not mirrored: logical properties throughout, bidi-isolated
  numbers and game codes, and only genuinely directional glyphs flipped.

### Screens

- **Home** — two decisions (new game / join) instead of a 21-line textarea, with
  the three kits as the app's opening statement.
- **Import players** — the roster is parsed on every keystroke: live count,
  a chip preview of the names actually understood, and duplicates highlighted in
  place. Problems are visible before anything is created, not as a toast after.
- **Captain selection** — three-column name grid, a colour picker per captain,
  and a dock that always states what is still missing.
- **Lobby** — the team slot *is* the claim control. The old screen listed the
  teams and then listed them again as a separate "pick your team" grid.
- **Live draft** — the centrepiece. A sticky turn HUD (team, captain, round,
  progress) that changes material entirely when it is your turn; a pulse bar
  carrying the last pick and the next two; a bright, high-contrast player pool
  whose brightness *is* the "you may act" affordance; the pick board; and the
  three rosters with your own first.
- **Pending pick** — a bottom sheet pinned to the thumb. Two taps to draft and
  no scrolling; previously the confirm button could be hundreds of pixels above
  you by the time you reached the bottom of the list.
- **Spectator** — the full pick board above the pool, ordered by role so the
  layout never reshuffles mid-draft.
- **Completed teams** — each roster presented as an object worth screenshotting,
  with the share actions on a fixed dock.
- **Host tools** — undo, release and reset moved out of the draft screen into a
  deliberate sheet. They used to sit inline under the player pool, one mis-tap
  from a live draft.

### Interaction and accessibility

- An identity chip in every app bar answers "who am I" — the old build never
  showed it, so on a borrowed phone there was no way to tell captain from
  spectator.
- Haptics on turn handover and on confirming a pick; `aria-live` announcements
  for the same events.
- Motion fires only on real state changes: the render layer diffs each paint
  against the previous one, so a metadata-only Firestore snapshot can no longer
  replay the turn animation. `prefers-reduced-motion` is fully respected.
- Disabled primary buttons drop their accent colour instead of staying bright at
  low opacity.
- The connectivity alert still overlays the header rather than reflowing the page
  mid-tap, but the header is now hidden underneath it rather than left peeking
  and invisibly tappable.

### Unchanged on purpose

Firestore rules, transaction-side permission checks, the snake order, realtime
listening and reconnect, offline shell caching, host-key recovery, and the
WhatsApp export's shuffling of both team order and player order.

### Dev-only addition

`?lp=1` forces Firestore long-polling, so the app can be driven inside automated
browsers whose network stacks break the SDK's streaming-XHR transport probe.
Production behaviour is untouched.

## Engineering phase — 2026-08-03

A reliability and infrastructure pass over the existing app. No new product
features and no visual redesign; the UI looks the same except where something was
actually broken.

### Data model (breaking)

Game documents are now schema `2`. Games created by earlier versions are refused
with a clear message instead of rendering incorrectly.

- `picks` is the single source of truth. Team rosters, player availability and the
  current turn are all derived from it, so nothing can drift out of sync and undo
  is simply removing the last pick.
- Players and teams are referenced by stable ids, never by name. Previously a
  duplicate or similar name could corrupt a pick or remove the wrong player on undo.
- Teams carry `{id, color, captainId}`; participants are keyed by a persistent
  per-device id rather than a nickname.

### Firestore rules and security hardening

- Rewrote `firestore.rules` for schema 2 and deployed to `draft21-eabc3`.
  Previously the repository's rules had never been deployed: **any client holding
  the public API key could delete or overwrite any game.**
- Deletion from a client is now denied. The player roster, `hostKey` and `schema`
  are immutable for the life of a game. `hostId` may only change on its own, for
  host-key recovery. Documents must keep a valid v2 shape with no extra or missing
  fields. Nothing outside `/games` is reachable.
- Deliberately not encoded in rules: how `picks`, `turn` and `status` may evolve —
  undo shrinks `picks` and reset empties it, so encoding transitions would risk
  rejecting a legitimate mid-draft action for no security gain. Turn ownership is
  enforced inside transactions, which is the only place it can be without auth.
- Added `verify-rules.mjs`, which checks the deployed rules from an untrusted
  client and creates only its own dedicated test game.
- Fixed `.firebaserc`, which pointed at an unrelated empty project named `draft21`
  and had caused a deploy to silently leave production unprotected.

### Permissions and multi-user draft correctness

- Every mutation now re-reads the document inside a Firestore transaction and
  validates the actor before writing. The rendered UI is only a hint.
- Captain selection, starting the draft, undo, reset and releasing a team are
  host-only. Spectators cannot modify a draft. Captains can act only on their own
  team's turn.
- A draft can no longer become permanently stuck: starting requires all three
  teams claimed (with an explicit host override), captains can claim mid-draft, the
  host can pick for a team with no captain connected, and the host can release a
  claim so a captain who changed device can take it back.
- Two captains can no longer be assigned the same colour — assigning a taken colour
  swaps them, and uniqueness is revalidated on finalize.
- Simultaneous claims of the same team resolve to exactly one winner; a
  double-tapped confirm records exactly one pick.
- Reset keeps captains attached instead of wiping every participant and forcing
  everyone to rejoin.
- Stale captain ids from a previous game are pruned and rejected instead of
  throwing.

### Realtime stability

- A snapshot arriving mid-keystroke no longer wipes what you are typing; input
  value, focus, caret and scroll position all survive a re-render.
- Metadata-only snapshots no longer trigger a full re-render. Previously every
  button in the DOM was destroyed and recreated several times a second, which drops
  taps during a live draft. Measured: 1 rebuild in 10s idle, versus continuous churn.
- The connectivity banner overlays the page instead of reflowing it — a flapping
  connection used to move every button mid-tap.

### Offline and reconnect

- Two separate connectivity signals: the device's network state (hard — blocks
  writes) and the Firestore listener serving cache (soft — banner only). Gating
  actions on the soft signal wrongly refused legitimate operations.
- Actions while offline are refused with a clear Hebrew message rather than queued,
  so a stale write cannot land minutes later in someone else's turn.
- The banner clears itself on reconnect, and the listener is re-attached on the
  `online` event instead of waiting on the SDK's backoff.
- Fixed the `offline` event handler, which threw on every disconnection.

### PWA

- Removed the runtime CDN dependencies. Tailwind is prebuilt to `tailwind.css`
  (19.5 KB, down from a ~100 KB runtime compiler) and the Firebase SDK is vendored
  under `vendor/`. The app now loads with **zero external requests**, verified.
- Added `sw.js`, which caches the app shell stale-while-revalidate so the app opens
  on a weak or dead connection and shows its own offline state. Firestore traffic is
  never intercepted. A new version activates on next launch, never mid-draft.
- Reopening the installed app after a finished draft lands on the home screen with a
  link back to the previous results, instead of trapping the user in last week's
  teams. Shared links always open their own game.
- iPhone: `viewport-fit=cover` with `env(safe-area-inset-*)`, `100dvh` alongside
  `100vh`, and toasts and the connectivity bar kept clear of the notch.
- The pending-pick confirm bar is sticky. Picking the last name in a 21-player list
  used to leave the confirm button 580 px above the viewport.
- Manifest: relative `start_url` and `scope` so the app works on a subpath, and the
  unpadded icon no longer declares `maskable`.

### Input handling

- WhatsApp list parsing keeps digits that belong to a name (`עידן 2`, `R9`) and
  strips only list numbering and bullets. Previously all digits were removed, which
  silently merged two players into one name.
- Duplicate names are reported by name; a roster over 21 says how many to remove
  instead of silently truncating.
- Hebrew team names throughout (אדום / לבן / שחור). Unknown game codes show a clear
  error instead of failing silently. Clipboard has a fallback.
- The WhatsApp message keeps its intentional randomisation of team order and of
  players within each team, upgraded to an unbiased shuffle so it leaks no ordering
  information.

### Validation

- 54/54 Firestore rules unit tests against the emulator — 20 legitimate operations
  allowed, 34 illegitimate denied.
- 52/52 for the full app driven against the emulator with the new rules enforced.
- 52/52 in production: five isolated sessions (host, three captains, spectator) at
  iPhone dimensions completing a real 21-player draft — snake order exactly
  `123321123321123321`, 7 players per team, all 21 assigned once, plus refresh
  mid-draft, offline/reconnect, undo, cancel, team release and reclaim, completion
  and WhatsApp share.
- 29/29 production rules verification: arbitrary deletion denied, protected state
  immutable, all legitimate operations working.
- Removed the `window.__d21` debug hook; the test suite drives the real DOM and
  reads ground truth from the Firestore REST API instead.
