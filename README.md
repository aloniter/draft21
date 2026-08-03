# Draft21

כלי דראפט פרטי לקבוצת הכדורגל שלנו. המנהל מדביק את רשימת השחקנים של אותו שבוע,
בוחר 3 קפטנים, וכל הקפטנים בוחרים שחקנים בתורות בזמן אמת. כולם יכולים לעקוב.
בסוף הדראפט האפליקציה מייצרת את שלוש הקבוצות ומאפשרת לשתף אותן לוואטסאפ.

A private, Hebrew-only, RTL football draft app for one group. Not a public product.

---

## Stack

No build system, no framework, no npm dependencies at runtime.

| File | Role |
| --- | --- |
| `index.html` | Shell, PWA meta, service-worker registration |
| `script.js` | The whole app — state, Firestore transactions, rendering |
| `tailwind.css` | **Prebuilt** Tailwind (from `tailwind.src.css`) — no CDN at runtime |
| `styles.css` | Animations plus iOS safe-area / `dvh` overrides. **Must load after `tailwind.css`** |
| `sw.js` | Service worker — caches the app shell so it opens without reception |
| `vendor/` | Vendored Firebase SDK 10.7.1 — see `vendor/README.md` |
| `firestore.rules` | Security rules |
| `verify-rules.mjs` | Verifies the deployed rules from an untrusted client |

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

1. **New Tailwind classes** → rebuild the stylesheet, or they will have no styling:
   ```bash
   npx tailwindcss@3 -i tailwind.src.css -o tailwind.css --content "./index.html,./script.js" --minify
   ```
2. **Any change to a shell file** (`index.html`, `script.js`, `tailwind.css`,
   `styles.css`, `vendor/*`) → bump `CACHE` in `sw.js`. Installed phones keep
   serving the previous version until the cache name changes.

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
- **Host** is whoever created the game (`hostId`). Only the host selects captains,
  starts the draft, undoes a pick, resets, or releases a team.
- **Captains** control only their own team's turn. If a team has no captain
  connected the host can pick for it, so a missing captain can never stall a draft.
- **Host key** — a 4-character code shown only to the host. It moves host control to
  another device if the host's phone or local storage is lost. Worth saving.

## Known limitations

- **No authentication.** Identity is a per-device id in `localStorage`. The rules
  make deletion and roster/host tampering impossible, but "only the captain whose
  turn it is may pick" is enforced inside Firestore transactions — a group member
  with devtools can still act as someone else. Acceptable for a private group.
- **Not yet tested on real iOS Safari.** All mobile verification so far was
  emulated Chromium at iPhone dimensions.
- **Legacy games are frozen.** Documents created before schema 2 remain readable but
  cannot be modified or deleted by any client.
- Maximum 21 players, minimum 6. Duplicate names are rejected with an explanation
  rather than silently accepted.
