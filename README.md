# Draft21

כלי דראפט פרטי לקבוצת הכדורגל שלנו. המנהל מדביק את רשימת השחקנים של אותו שבוע
(6–21 שחקנים, ישר מוואטסאפ), מסמן 3 קפטנים, ושולח קישור אחד לקבוצה. מי שפותח את
הקישור בוחר מי הוא בלחיצה אחת — קפטן אדום / לבן / שחור, מנהל, או צופה — בלי הרשמה
ובלי סיסמה. הקפטנים בוחרים בתורות (סנייק) בזמן אמת, וכולם רואים את אותו מצב.
בסוף המנהל מפרסם את הקבוצות לוואטסאפ.

**Create → share one link → tap your role → draft live → final teams.**

A private, Hebrew-only, RTL football draft app for one group. Not a public product.

---

## Stack

No build system, no framework, no npm dependencies at runtime.

| File | Role |
| --- | --- |
| `index.html` | Shell, PWA meta, service-worker registration |
| `script.js` | The whole app — state, Firestore transactions, rendering |
| `design.css` | The whole visual system — tokens, components, motion, RTL, safe areas. Hand-written, no build step |
| `sw.js` | Service worker — caches the app shell so it opens without reception |
| `vendor/` | Vendored Firebase SDK 10.7.1 — see `vendor/README.md` |
| `firestore.rules` | Security rules |
| `verify-rules.mjs` | Verifies the deployed rules from an untrusted client |
| `tests/` | End-to-end multiplayer test — several phones, one shared Firestore (see below). Never deployed |
| `DESIGN.md` | Research, the three explored directions, and the design system |

## Firebase project

**`draft21-eabc3`** — this is the only project the app uses. It is set in two places
that must always agree:

- `script.js` → `initializeApp({ projectId: "draft21-eabc3", ... })`
- `.firebaserc` → `projects.default`

> There is also an unrelated, empty project called `draft21`. Rules were once
> deployed there by mistake, which silently left production unprotected. If a
> deploy ever appears to succeed but `verify-rules.mjs` still fails, check the
> project name in the CLI output first.

## Running locally

The app uses ES modules and a service worker, so it must be served over HTTP —
opening `index.html` from the filesystem will not work.

```bash
python3 -m http.server 8899
# then open http://localhost:8899/index.html
```

`?lp=1` forces Firestore long-polling. It is only needed inside automated or
proxied browsers, whose network stacks break the SDK's streaming-XHR probe and
leave the listener silently unconnected. Real browsers never need it.

`?emu=127.0.0.1:8080` points the app at a local Firestore emulator. It is honoured
only when the page itself is served from `localhost`/`127.0.0.1`.

## Testing the real multiplayer experience

`tests/e2e.mjs` drives the real UI in independent browser contexts at phone sizes
— a host, three captains, a watcher, plus extra tabs and phones for the edge cases
— all against one shared Firestore with the security rules enforced. It runs a
complete draft with a 21-player list and again with an 18-player list pasted
exactly as WhatsApp produces it (hidden characters and all), and checks, against
the backend itself:

- joining from the link, one-tap roles, "taken" seats, roles surviving refresh
- every device agreeing on whose turn it is at every pick, snake order exactly
  `1 2 3 3 2 1 …`, only the captain on the clock able to pick
- two tabs confirming at the same instant → exactly one pick
- refresh mid-draft, a phone going offline and catching up, a captain moving to a
  new phone, the host moving to a new phone
- a missing captain (host starts without them and picks for them), a late captain
  joining mid-draft, host undo, watchers unable to reset
- every team the same size, every player drafted once, identical final teams on
  every device, and the published WhatsApp text

```bash
cd tests
npm install            # firebase-tools + playwright; needs Java for the emulator
npm test               # both rosters against the local Firestore emulator
npm run test:prod      # one 18-player run against production Firestore
```

`test:prod` creates two game documents (ids printed at the end). Clients cannot
delete games, so remove them from the Firebase console afterwards.

## Deploying the app

The app is static files with no build step, and the game travels in the URL hash
(`…/#abc123`), so any static HTTPS host works with no rewrites: direct links,
refreshes and the WhatsApp in-app browser all load `index.html` and open the right
game. HTTPS is required (service worker).

The site is on **Vercel** (project `draft21`). If the project is connected to this
GitHub repository, merging to `main` deploys; otherwise run `npx vercel --prod`
from the repository root. No build settings are needed (framework preset "Other",
no build command, output = repository root), and `.vercelignore` keeps `tests/`
and the Firebase tooling out of the deployed site.

The Firestore rules did not change in this release, so nothing needs deploying
on the Firebase side.

After a deploy, open the site, create a game, and send yourself the link — that
is the whole smoke test.

## Deploying the Firestore rules

```bash
firebase deploy --only firestore:rules
```

Confirm the output says `=== Deploying to 'draft21-eabc3'...`, then verify from an
ordinary untrusted client:

```bash
node verify-rules.mjs
```

Expect `29/29 checks passed` and `Rules are live and correct.` The script creates
one dedicated test game of its own and touches nothing else. Because the rules
(correctly) forbid client deletion, that test game has to be removed from the
Firebase console afterwards; the script prints its id.

## When you change the code

Two manual steps are easy to forget:

1. **New CSS classes** → add them to `design.css`. There is no build step and
   no utility framework: every class in `script.js` is a named part of the
   design system. See `DESIGN.md` before inventing a new one.
2. **Any change to a shell file** (`index.html`, `script.js`, `design.css`,
   `vendor/*`) → bump `CACHE` in `sw.js`. Installed phones keep serving the
   previous version until the cache name changes.

Upgrading the Firebase SDK is documented in `vendor/README.md`.

## PWA behaviour

- **Weak or no reception:** the shell is cached, so the app still opens and shows a
  Hebrew "no connection" state instead of a blank screen. Realtime draft actions
  obviously cannot work offline, and are refused with a clear message rather than
  being queued to land later in someone else's turn.
- **Reconnect:** the banner clears itself, and the listener is re-attached on the
  browser's `online` event rather than waiting on the SDK's own backoff.
- **A new version activates on the next launch**, never mid-session — `sw.js`
  deliberately does not call `skipWaiting()`, so a phone is never reloaded during a
  live draft.
- **Reopening the app** after a finished draft lands on the home screen with a link
  back to the previous results, instead of trapping you in last week's teams. A
  shared link (which carries `#gameId`) always opens its own game.
- **Requires HTTPS** in production. Service workers do not register over plain HTTP
  except on localhost — without it there is no offline protection at all.

## How a game works

One Firestore document per game at `games/{6-char-id}`, schema `2`.

`picks` is the single source of truth: team rosters, player availability and whose
turn it is are all derived from it. Undo is therefore just removing the last pick,
and nothing can drift out of sync.

- **Players and teams are referenced by id**, never by name, so two players with
  similar names cannot corrupt picks or undo.
- **Snake order** over 3 teams: `1 2 3 3 2 1 1 2 3 …`, computed from the number of
  picks made.
- **Roles, not accounts.** Opening the link shows one question — *מי אתה?* — with
  a card per seat naming its captain ("קפטן אדום · יוסי"), the host seat, and
  "אני רק צופה". One tap and you are in. Seats are claims in `participants`
  (`{id, nick, teamId}` keyed by a per-device id in `localStorage`), so a refresh
  goes straight back in. Watching writes nothing; it is remembered locally.
- **A taken seat says so**, with "זה אני — המשך כאן" under it. That one tap moves
  the seat to this phone (new phone, cleared browser, link opened in a different
  app); the old phone is told and drops back to the role picker. Tapping your own
  chip in the top bar reopens the picker to switch seats.
- **Host** is `hostId` — whoever created the game, until someone taps "זה אני" on
  the host seat (a write that changes `hostId` alone, the only shape the rules
  allow for it). One phone may be host and a captain at once. Only the host
  selects captains, starts the draft, undoes a pick, or frees a seat.
- **Picking** is local until confirmed: tap a player, then "בחר אותו" in the sheet.
  That writes one transaction pinned to the pick number the captain was looking
  at, so a stale screen, a double tap, or two tabs of the same captain can never
  record a pick twice or in the wrong slot. The picking phone shows the pick
  instantly while it saves.
- **Resetting is open to the host and every captain** — not to watchers, who may
  be the whole WhatsApp group — from the menu in the top bar, at two depths, each
  behind its own explicit "are you sure?" sheet:
  - *אפס את כל הבחירות* — the picks go, the captains and teams stay, everyone
    lands back in the lobby.
  - *התחל מאפס — רשימה חדשה* — the evening starts over from the player list
    itself. You edit the roster (prefilled with the current names), and one write
    replaces it, clears the teams and picks, and puts everyone back on captain
    selection. Same game code and same link, so nobody has to be re-invited; and
    because captain selection is host-only, whoever restarts becomes the host.

  A draft that needed restarting while the host was out of the room used to stall
  the whole evening. Undo stays host-only: it is a quiet, surgical change, where
  a reset is loud and obvious.
- **Captains** control only their own team's turn. If a team has no captain the
  host can pick for it, so a missing captain can never stall a draft: the host
  can start without them, free a seat whose captain left, and the captain can
  take the seat back at any point.
- **Any roster size from 6 to 21** — teams come out even when the count divides
  by three (18 → 6 each). Pasting from WhatsApp is safe: list numbers, bullets
  and the invisible characters WhatsApp adds are stripped.
- `hostKey` is still generated (the rules require the field) but no longer shown;
  host recovery is the one-tap takeover above.

## Known limitations

- **No authentication, on purpose.** Identity is a per-device id in
  `localStorage`, and anyone holding the link can take a seat over with one tap —
  that is the recovery story, and the right trade for a group of friends. The
  rules make deletion impossible and keep the document's shape, and the roster can
  only change in a write that winds the game back to captain selection. Turn
  ownership is enforced inside Firestore transactions, so a group member with
  devtools could still act as someone else.
- **Not yet tested on real iOS Safari.** All mobile verification so far was
  Chromium at iPhone and Android dimensions.
- **Legacy games are frozen.** Documents created before schema 2 remain readable but
  cannot be modified or deleted by any client.
- Maximum 21 players, minimum 6. Duplicate names are rejected with an explanation
  rather than silently accepted.
