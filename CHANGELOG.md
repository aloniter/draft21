# Changelog

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
