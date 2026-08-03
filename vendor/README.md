# vendor/

These files are vendored so Draft21's app shell has **no runtime CDN
dependency** — it must open at the pitch on a weak or dead connection.

## Contents

| File | Source |
| --- | --- |
| `firebase-app.js` | `https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js` — byte-for-byte copy |
| `firebase-firestore.js` | `https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js` — **one line modified** |

`firebase-firestore.js` ships with an absolute import of its dependency:

```js
from"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js"
```

That single specifier is rewritten to `"./firebase-app.js"`. Without the
rewrite the browser would still reach out to the CDN for `firebase-app.js`,
which defeats the whole point of vendoring. Nothing else is changed.

## Upgrading the Firebase SDK

```bash
V=10.7.1  # set to the version you want
curl -s -o vendor/firebase-app.js "https://www.gstatic.com/firebasejs/$V/firebase-app.js"
curl -s "https://www.gstatic.com/firebasejs/$V/firebase-firestore.js" \
  | sed "s|https://www.gstatic.com/firebasejs/$V/firebase-app.js|./firebase-app.js|g" \
  > vendor/firebase-firestore.js
grep -c gstatic.com vendor/firebase-firestore.js   # must print 0
```

Then bump `CACHE` in `sw.js` so installed phones pick up the new files.
