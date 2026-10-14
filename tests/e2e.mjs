/* Draft21 — live multiplayer end-to-end test.
 *
 *   npm test              against a local Firestore emulator (rules enforced)
 *   npm run test:prod     against the real production Firestore
 *
 * Every participant is an independent browser context — separate storage,
 * separate device id, phone-sized viewport — all driving the real UI against
 * one shared backend:
 *
 *   host        creates the draft, picks captains, shares, starts, publishes
 *   red/white/black captains, who join from the link and pick on their turn
 *   watcher     opens the link and just watches
 *   + extra tabs/devices for the race, refresh, offline and recovery checks
 *
 * Ground truth is read straight from Firestore's REST API, never from the UI.
 * Production mode creates one game document per run (games cannot be deleted
 * from a client by design); its id is printed so it can be removed from the
 * Firebase console.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const PROD = process.argv.includes('--prod');
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS_DIR || path.join(ROOT_DIR, 'tests', 'screenshots');
const PROJECT = 'draft21-eabc3';
const API_KEY = 'AIzaSyBqz4oHoqGtnzjWqgzjWmwsUv6Kny75QpM';
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const PORT = Number(process.env.PORT || 8899);

// Production goes through whatever proxy the environment provides; automated
// browsers behind a proxy need Firestore's long-polling transport (see README).
const PROXY = PROD ? (process.env.HTTPS_PROXY || process.env.https_proxy || '') : '';
const QUERY = PROD ? (PROXY ? '?lp=1' : '') : `?emu=${EMULATOR}`;
const BASE = `http://127.0.0.1:${PORT}/index.html`;
const REST = PROD
  ? `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`
  : `http://${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents`;

// Two real-world rosters. The default is a full 21; `--roster=18` uses an
// 18-player list exactly as it came out of WhatsApp — including the invisible
// WORD JOINER (U+2060) WhatsApp puts after each list number, and a gap in the
// numbering — pasted as-is.
const ROSTER_21 = {
  text: [
    'אלון', 'יוסי', 'דני', 'משה', 'רועי', 'עידן 2', 'אבי', 'גל', 'תומר', 'ניר', 'שי',
    'עומר', 'בן', 'איתי', 'נדב', 'אורי', 'עמית', 'ליאור', 'רון', 'אסף', 'R9'
  ].map((n, i) => `${i + 1}. ${n}`).join('\n'),
  captains: { Red: 'יוסי', White: 'דני', Black: 'משה' }
};
const ROSTER_18 = {
  text: [
    '1. חייקין', '2. \u2060איטר', '3. \u2060יואב', '4. \u2060ספי', '5. \u2060איל פלג', '6. \u2060יהודה',
    '7. \u2060שניר', '8. \u2060דוד', '9. \u2060עומר', '10. \u2060גברי', '11. \u2060עדי', '12. \u2060משה ידידה',
    '13. \u2060אופיר פלד', '14. \u2060רון', '15. \u2060אופיר בוכניק', '19 רז', '20 ירדן', '21 ישי'
  ].join('\n'),
  captains: { Red: 'איטר', White: 'יואב', Black: 'ספי' }
};
const PICK = (process.argv.find(a => a.startsWith('--roster=')) || '').split('=')[1] === '18' ? ROSTER_18 : ROSTER_21;
// What a person would expect to see: names without numbering or hidden marks.
const ROSTER = PICK.text.split('\n').map(l => l.replace(/[\u2060]/g, '').replace(/^\d+\.?\s*/, '').trim());
const CAPTAINS = PICK.captains;
const PER_TEAM = ROSTER.length / 3;

/* ---------------------------------------------------------------- */
/* Reporting                                                         */
/* ---------------------------------------------------------------- */

let passed = 0;
const failures = [];
function check(name, ok, detail) {
  if (ok) passed++; else failures.push(name + (detail ? ' — ' + detail : ''));
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail && !ok ? '  (' + detail + ')' : ''}`);
  return ok;
}
function section(title) { console.log('\n' + title); }

/* ---------------------------------------------------------------- */
/* Static server for the app shell                                   */
/* ---------------------------------------------------------------- */

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpeg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = path.join(ROOT_DIR, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT_DIR)) { res.writeHead(403); res.end(); return; }
  if (url.pathname === '/') file = path.join(ROOT_DIR, 'index.html');
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

/* ---------------------------------------------------------------- */
/* Firestore ground truth                                            */
/* ---------------------------------------------------------------- */

function dec(v) {
  if (!v) return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) {
    const out = {};
    Object.entries(v.mapValue.fields || {}).forEach(([k, val]) => { out[k] = dec(val); });
    return out;
  }
  return null;
}

// Read through a browser page so production traffic uses the same network
// path (and proxy) as the app itself.
async function readGame(page, id) {
  const url = `${REST}/games/${id}${PROD ? '?key=' + API_KEY : ''}`;
  const json = PROD
    ? await page.evaluate(async u => (await fetch(u)).json(), url)
    : await (await fetch(url)).json();
  return dec({ mapValue: { fields: json.fields || {} } });
}

/* ---------------------------------------------------------------- */
/* Browser helpers                                                   */
/* ---------------------------------------------------------------- */

// Proxy via Chromium's own flags: Playwright's `proxy` option also routes
// loopback through the proxy, which would swallow the local app server.
const browser = await chromium.launch({
  args: PROXY ? ['--proxy-server=' + PROXY, '--proxy-bypass-list=127.0.0.1;localhost'] : []
});

const pageErrors = [];
const allPages = [];
async function device(label, descriptor) {
  const context = await browser.newContext({ ...descriptor, locale: 'he-IL' });
  // Toasts vanish after a few seconds; keep a log so failures can show them.
  await context.addInitScript(() => {
    window.__toasts = [];
    new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.hasAttribute('data-toast')) window.__toasts.push(n.textContent);
    }))).observe(document, { childList: true, subtree: true });
  });
  const page = await context.newPage();
  allPages.push(page);
  page.on('pageerror', e => pageErrors.push(`${label}: ${e.message}`));
  page.label = label;
  page.ctx = context;
  return page;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = PROD ? 30000 : 15000;

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: path.join(SHOTS, `${PROD ? 'prod-' : ''}${ROSTER.length}-${name}.png`) });
}

// No screen may scroll sideways on a phone.
async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

// What the live HUD says on this device: whose turn and which pick number.
async function hudState(page) {
  return page.evaluate(() => {
    const hud = document.querySelector('[data-turn-banner]');
    return hud ? { color: hud.getAttribute('data-turn-color'), pickNo: Number(hud.getAttribute('data-pick-no') || 0) } : null;
  });
}

async function waitPickNo(page, n) {
  await page.waitForFunction(n => {
    const hud = document.querySelector('[data-turn-banner]');
    return (hud && Number(hud.getAttribute('data-pick-no')) === n) || !!document.querySelector('[data-complete]');
  }, n, { timeout: T });
}

async function toastText(page) {
  return page.evaluate(() => (window.__toasts || []).join(' | '));
}

async function rostersOf(page) {
  return page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-final-team]').forEach(el => {
      out[el.getAttribute('data-final-team')] = [...el.querySelectorAll('[data-roster-player]')].map(r => r.getAttribute('data-roster-player'));
    });
    return out;
  });
}

const gameUrl = id => `${BASE}${QUERY}#${id}`;

/* ================================================================= */

console.log(`\nDraft21 live multiplayer e2e — ${ROSTER.length} players — ${PROD ? 'PRODUCTION Firestore' : 'Firestore emulator ' + EMULATOR}`);

const iphone = devices['iPhone 13'];
const pixel = devices['Pixel 7'];
const small = { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const host = await device('host', pixel);
let gameId = '';
let game2 = '';

try {
  /* ---------------- 1. Create ---------------- */
  section('1. The organizer creates the draft');
  await host.goto(BASE + QUERY);
  check('home has one action — no codes, no "join with code"',
    await host.locator('button', { hasText: /קוד/ }).count() === 0 && await host.locator('[data-new-draft]').count() === 1);
  await host.locator('[data-new-draft]').click();

  // Teams must come out equal: a list that does not split into three is
  // refused before anything is created, with the fix spelled out.
  await host.locator('#playerInput').fill(ROSTER.slice(0, ROSTER.length - 2).concat(['x1']).join('\n'));
  check('a list that cannot make equal teams is refused, with the fix spelled out',
    await host.locator('[data-create-game]').isDisabled() &&
    /כדי שהקבוצות יהיו שוות/.test(await host.locator('[data-import-problem]').first().innerText()));

  await host.locator('#playerInput').fill(PICK.text);
  await shot(host, '00-paste-list');
  const createLabel = await host.locator('[data-create-game]').innerText();
  check(`the pasted list is read as ${ROSTER.length} players`, createLabel.includes(String(ROSTER.length)), createLabel);
  await host.locator('[data-create-game]').click();
  await host.waitForSelector('.namegrid', { timeout: T });
  gameId = (await host.evaluate(() => location.hash.slice(1)));
  check('draft created and opened on captain selection', /^[a-z0-9]{6}$/.test(gameId), gameId);
  console.log(`        game id: ${gameId}`);

  for (const name of [CAPTAINS.Red, CAPTAINS.White, CAPTAINS.Black]) {
    await host.locator('.namebtn', { hasText: new RegExp('^' + name + '$') }).click();
  }
  const finalize = host.locator('[data-finalize]');
  check('three taps choose the captains — kits in tap order, review shown, "ready — share" enabled',
    await finalize.isEnabled() && /מוכן/.test(await finalize.innerText()) && await host.locator('[data-review] .assign').count() === 3);
  await shot(host, '01-host-captains');
  await finalize.click();
  await host.waitForSelector('[data-invite]', { timeout: T });
  const inviteHref = await host.locator('[data-share-invite]').getAttribute('href');
  const inviteText = decodeURIComponent((inviteHref || '').replace('https://wa.me/?text=', ''));
  check('lobby offers a one-tap WhatsApp invite carrying the link',
    inviteHref.startsWith('https://wa.me/?text=') && inviteText.includes(`/index.html#${gameId}`), inviteText);
  check('no code is shown anywhere', !(await host.locator('body').innerText()).toUpperCase().includes(gameId.toUpperCase()));
  check('the organizer is the organizer without choosing anything', await host.locator('[data-me]').innerText().then(t => t.includes('מארגן')));
  await shot(host, '02-host-lobby');

  let g = await readGame(host, gameId);
  check('backend: every name stored clean — no numbering, no hidden characters',
    JSON.stringify(g.players.map(p => p.name)) === JSON.stringify(ROSTER), JSON.stringify(g.players.map(p => p.name)));
  check('backend: status lobby with 3 teams red/white/black', g.status === 'lobby' &&
    JSON.stringify(g.teams.map(t => t.color).sort()) === JSON.stringify(['Black', 'Red', 'White']));
  const teamOf = color => g.teams.find(t => t.color === color);
  const captainIdOf = color => g.players.find(p => p.name === CAPTAINS[color]).id;
  check('backend: captains mapped to the right kits',
    ['Red', 'White', 'Black'].every(c => teamOf(c).captainId === captainIdOf(c)));

  /* ---------------- 2. Join ---------------- */
  section('2. Captains open the link and tap their team');
  const cap = {
    Red: await device('red', iphone),
    White: await device('white', small),
    Black: await device('black', iphone)
  };
  const watcher = await device('watcher', small);

  await cap.Red.goto(gameUrl(gameId));
  await cap.Red.waitForSelector('[data-team-question]', { timeout: T });
  check('the link opens on the board — three teams, captain names, players — with one question',
    (await cap.Red.locator('[data-seat]').count()) === 3 &&
    (await cap.Red.locator('.preview__name').count()) === ROSTER.length - 3 &&
    /באיזו קבוצה אתה/.test(await cap.Red.locator('[data-team-question]').innerText()));
  check('each team card names its captain',
    (await Promise.all(['Red', 'White', 'Black'].map(c => cap.Red.locator(`[data-join="${c}"]`).innerText()))).every((t, i) => t.includes(CAPTAINS[['Red', 'White', 'Black'][i]])));
  await shot(cap.Red, '03-team-question');
  check('the question fits a phone without side-scroll', await noSideScroll(cap.Red));
  await cap.Red.locator('[data-join="Red"]').click();
  await cap.Red.waitForSelector('[data-seat="Red"].slot--mine', { timeout: T });
  check('red captain is in after one tap — the question is gone', await cap.Red.locator('[data-team-question]').count() === 0);

  await watcher.goto(gameUrl(gameId));
  await watcher.waitForSelector('[data-join="Red"].role--taken', { timeout: T });
  check('a taken team says so, with "it\'s me — continue here" for a new phone',
    await watcher.locator('[data-reclaim="Red"]').count() === 1);
  await shot(watcher, '04-team-taken');

  await Promise.all(['White', 'Black'].map(async c => {
    await cap[c].goto(gameUrl(gameId));
    await cap[c].waitForSelector('[data-team-question]', { timeout: T });
    await cap[c].locator(`[data-join="${c}"]`).click();
    await cap[c].waitForSelector(`[data-seat="${c}"].slot--mine`, { timeout: T });
  }));
  check('white and black captains joined at the same time', true);

  await watcher.locator('[data-watch]').click();
  await watcher.waitForSelector('[data-waiting-start]', { timeout: T });
  check('"not a captain — just watching" hides the question and shows the board',
    await watcher.locator('[data-team-question]').count() === 0);

  await host.waitForFunction(() => /כל הקפטנים מחוברים/.test(document.querySelector('[data-lobby-count]')?.textContent || ''), null, { timeout: T });
  check('organizer sees red, white and black captains connected live',
    await host.locator('[data-seat-state="taken"]').count() === 3 && await host.locator('[data-start-draft]').isEnabled());

  g = await readGame(host, gameId);
  check('backend: exactly one claim per team', g.participants.length === 3 &&
    new Set(g.participants.map(p => p.teamId)).size === 3);

  // Remembered locally: a refresh goes straight back in.
  await cap.White.reload();
  await cap.White.waitForSelector('[data-seat="White"].slot--mine', { timeout: T });
  check('refresh keeps the team — no question, no re-joining', await cap.White.locator('[data-team-question]').count() === 0);
  await watcher.reload();
  await watcher.waitForSelector('[data-waiting-start]', { timeout: T });
  check('refresh keeps "just watching" too', true);

  /* ---------------- 3. Draft ---------------- */
  section(`3. Live draft — ${ROSTER.length - 3} picks, snake order`);
  await host.locator('[data-start-draft]').click();
  const everyone = [host, cap.Red, cap.White, cap.Black, watcher];
  await Promise.all(everyone.map(p => waitPickNo(p, 1)));
  check('everyone sees the draft start', true);
  g = await readGame(host, gameId);
  const order = g.turn.order.map(id => g.teams.find(t => t.id === id).color);
  check('draft order is red → white → black, then back', order.join() === 'Red,White,Black', order.join(' → '));

  const expectedColor = n => {
    const cycle = n % 6;
    return order[cycle < 3 ? cycle : 5 - cycle];
  };

  let raceDone = false, refreshDone = false, offlineDone = false, takeoverDone = false, wrongTurnDone = false;
  let redPage = cap.Red;
  const TOTAL = ROSTER.length - 3;

  for (let n = 0; n < TOTAL; n++) {
    const color = expectedColor(n);
    // Everyone online agrees on whose turn it is and which pick this is.
    const live = everyone.filter(p => !p.offline);
    await Promise.all(live.map(p => waitPickNo(p, n + 1)));
    const huds = await Promise.all(live.map(hudState));
    if (!check(`pick ${n + 1}: all ${live.length} devices show ${color} on the clock`,
      huds.every(h => h && h.color === color && h.pickNo === n + 1), JSON.stringify(huds))) break;

    const picker = color === 'Red' ? redPage : cap[color];

    // Only the captain on the clock gets live player cards.
    if (!wrongTurnDone) {
      const other = Object.entries(cap).find(([c]) => c !== color)[1];
      const liveCards = await other.locator('.pick--live').count();
      const disabled = await other.locator('[data-pick-player]').first().isDisabled();
      check('a captain off the clock cannot tap players', liveCards === 0 && disabled);
      check('the captain on the clock can', await picker.locator('.pick--live').count() > 0);
      wrongTurnDone = true;
    }

    // Race: the same captain in two tabs confirms two different players at
    // the same instant. Exactly one pick may land.
    if (!raceDone && n >= 2) {
      const twin = await picker.ctx.newPage();
      allPages.push(twin);
      twin.label = picker.label + '-tab2';
      twin.on('pageerror', e => pageErrors.push(`${twin.label}: ${e.message}`));
      await twin.goto(gameUrl(gameId));
      await waitPickNo(twin, n + 1);
      const [a, b] = await picker.locator('[data-pick-player]').evaluateAll(els => els.slice(0, 2).map(e => e.getAttribute('data-pick-player')));
      await picker.locator(`[data-pick-player="${a}"]`).click();
      await twin.locator(`[data-pick-player="${b}"]`).click();
      await twin.waitForSelector('[data-confirm-pick]', { timeout: T });
      // Fire both confirms at the same instant, straight into the DOM. If one
      // pick lands before the other tab's tap, that tab's sheet is withdrawn
      // (it no longer matches the board) — also a correct outcome.
      const tap = () => { const b = document.querySelector('[data-confirm-pick]'); if (!b) return false; b.click(); return true; };
      const [tappedA, tappedB] = await Promise.all([picker.evaluate(tap), twin.evaluate(tap)]);
      await Promise.all(live.map(p => waitPickNo(p, n + 2)));
      await sleep(PROD ? 2500 : 1200);
      const after = await readGame(host, gameId);
      const landed = after.picks.filter(p => p.seq === n);
      check('race: two tabs confirm at once → exactly one pick recorded',
        after.picks.length === n + 1 && landed.length === 1 && [a, b].includes(landed[0].playerId),
        `${after.picks.length} picks`);
      // The loser learns it lost when Firestore retries its transaction, after
      // a short backoff — wait for the message rather than sampling once.
      if (tappedA && tappedB) {
        const told = () => (window.__toasts || []).some(t => /לא נשמרה|כבר נבחר|לא התור/.test(t));
        await Promise.any([picker.waitForFunction(told, null, { timeout: T }), twin.waitForFunction(told, null, { timeout: T })]).catch(() => {});
      }
      const toasts = (await toastText(picker)) + (await toastText(twin));
      const sheetsLeft = (await picker.locator('[data-confirm-pick]').count()) + (await twin.locator('[data-confirm-pick]').count());
      check('race: the losing tab is told its pick did not count (or its stale sheet withdrawn)',
        tappedA && tappedB ? /לא נשמרה|כבר נבחר|לא התור/.test(toasts) : sheetsLeft === 0, toasts || `tapped ${tappedA}/${tappedB}`);
      await twin.close();
      raceDone = true;
      continue;
    }

    // Recovery: Red's phone "dies"; Red opens the link on a new phone and
    // takes the seat over with one tap. The old phone is told.
    if (!takeoverDone && n >= 6 && color !== 'Red') {
      const newRed = await device('red-new-phone', iphone);
      await newRed.goto(gameUrl(gameId));
      await newRed.waitForSelector('[data-reclaim="Red"]', { timeout: T });
      await newRed.locator('[data-reclaim="Red"]').click();
      await newRed.waitForSelector('[data-me][data-team="Red"]', { timeout: T });
      await redPage.waitForSelector('[data-team-question]', { timeout: T });
      check('new phone: one tap on "it\'s me" and it is Red; the old phone is asked again', true);
      check('the old phone is told why', /עבר לטלפון אחר/.test(await toastText(redPage)), await toastText(redPage));
      const old = redPage;
      await old.locator('[data-watch]').click();
      await old.waitForSelector('[data-turn-banner]', { timeout: T });
      everyone[everyone.indexOf(old)] = newRed;
      everyone.push(old);
      redPage = newRed;
      takeoverDone = true;
      await waitPickNo(newRed, n + 1);
    }

    // The organizer undoes a pick: it comes off every board and the same
    // captain is on the clock again.
    if (n === 4) {
      const undone = await picker.locator('[data-pick-player]').first().getAttribute('data-pick-player');
      await picker.locator(`[data-pick-player="${undone}"]`).click();
      await picker.locator('[data-confirm-pick]').click();
      await Promise.all(live.map(p => waitPickNo(p, n + 2)));
      await picker.waitForFunction(() => !document.querySelector('[data-saving]'), null, { timeout: T });
      await host.locator('button[aria-label="כלי מארגן"]').click();
      await host.locator('[data-undo]').click();
      await Promise.all(live.map(p => waitPickNo(p, n + 1)));
      const back = await Promise.all(live.map(p => p.locator(`[data-pick-player="${undone}"]`).count()));
      const huds = await Promise.all(live.map(hudState));
      check('organizer undo: the pick is back in the pool on every phone, same captain on the clock',
        back.every(c => c === 1) && huds.every(h => h && h.color === color && h.pickNo === n + 1));
    }

    // Refresh in the middle of the draft — a captain and the host.
    if (!refreshDone && n === 5) {
      await Promise.all([cap.Black.reload(), host.reload()]);
      await Promise.all([waitPickNo(cap.Black, n + 1), waitPickNo(host, n + 1)]);
      check('refresh mid-draft: same pick, same turn, role kept, nothing lost',
        (await cap.Black.locator('[data-team-question]').count()) === 0 &&
        (await cap.Black.locator('[data-roster-player]').count()) === 3 + n);
      refreshDone = true;
    }

    // A device drops off the network while others keep drafting.
    if (!offlineDone && n >= 9 && color !== 'White') {
      cap.White.offline = true;
      await cap.White.ctx.setOffline(true);
      await cap.White.waitForSelector('[data-offline-bar]', { timeout: T });
      check('offline: the disconnected phone says so clearly', true);
      const p = color === 'Red' ? redPage : cap[color];
      await p.locator('[data-pick-player]').first().click();
      await p.locator('[data-confirm-pick]').click();
      n++;
      const next = expectedColor(n);
      const nextPage = next === 'Red' ? redPage : cap[next];
      if (next !== 'White') {
        await waitPickNo(nextPage, n + 1);
        await nextPage.locator('[data-pick-player]').first().click();
        await nextPage.locator('[data-confirm-pick]').click();
        n++;
      }
      await cap.White.ctx.setOffline(false);
      cap.White.offline = false;
      await waitPickNo(cap.White, n + 1);
      await cap.White.waitForSelector('[data-offline-bar]', { state: 'detached', timeout: T });
      check('reconnect: the phone catches up on every pick it missed and the banner clears',
        (await cap.White.locator('[data-roster-player]').count()) === 3 + n);
      offlineDone = true;
      n--;
      continue;
    }

    const playerId = await picker.locator('[data-pick-player]').first().getAttribute('data-pick-player');
    await picker.locator(`[data-pick-player="${playerId}"]`).click();
    await picker.waitForSelector('[data-confirm-pick]', { timeout: T });
    if (n === 0) await shot(picker, '05-confirm-sheet');
    await picker.locator('[data-confirm-pick]').click();
    // Optimistic: the picker's own screen moves on immediately.
    if (n === 0) {
      const instant = await picker.evaluate(id => !document.querySelector(`[data-pick-player="${id}"]`), playerId);
      check('the pick shows instantly on the picking phone', instant);
      await shot(watcher, '06-watcher-live');
    }
    if (n === 3) await shot(cap.Black, '07-captain-draft');
  }

  /* ---------------- 4. Results ---------------- */
  section('4. Final teams');
  const finalDevices = everyone.filter(p => !p.isClosed());
  await Promise.all(finalDevices.map(p => p.waitForSelector('[data-complete]', { timeout: T })));
  check(`all ${finalDevices.length} devices reach the final teams`, true);

  g = await readGame(host, gameId);
  check(`backend: status complete with ${TOTAL} picks`, g.status === 'complete' && g.picks.length === TOTAL, `${g.status} ${g.picks.length}`);
  const seqOk = g.picks.every((p, i) => p.seq === i);
  const snakeOk = g.picks.every((p, i) => g.teams.find(t => t.id === p.teamId).color === expectedColor(i));
  check(`backend: picks numbered 0..${TOTAL - 1} with no gaps`, seqOk);
  check('backend: snake order exactly 1 2 3 3 2 1 …', snakeOk,
    g.picks.map(p => g.teams.find(t => t.id === p.teamId).color[0]).join(''));
  const all = [...g.teams.map(t => t.captainId), ...g.picks.map(p => p.playerId)];
  check(`backend: all ${ROSTER.length} players drafted exactly once — no duplicates`, all.length === ROSTER.length && new Set(all).size === ROSTER.length);
  const sizes = g.teams.map(t => 1 + g.picks.filter(p => p.teamId === t.id).length);
  check(`backend: every team has exactly ${PER_TEAM} players including the captain`, sizes.every(s => s === PER_TEAM), sizes.join(','));

  const truth = {};
  g.teams.forEach(t => { truth[t.color] = [t.captainId, ...g.picks.filter(p => p.teamId === t.id).map(p => p.playerId)]; });
  const views = await Promise.all(finalDevices.map(rostersOf));
  check('every device shows identical final teams, matching the backend',
    views.every(v => JSON.stringify(v, Object.keys(truth).sort()) === JSON.stringify(truth, Object.keys(truth).sort())),
    JSON.stringify(views.map(v => Object.values(v).map(a => a.length))));

  const publish = host.locator('[data-share-wa]');
  const pubText = decodeURIComponent(((await publish.getAttribute('href')) || '').replace('https://wa.me/?text=', ''));
  check(`host gets "publish to WhatsApp" with all ${ROSTER.length} names, and no hidden characters`,
    (await publish.innerText()).includes('פרסם') && ROSTER.every(n => pubText.includes(n)) && !/\u2060/.test(pubText));
  await shot(host, '08-results');
  for (const p of finalDevices) {
    if (!(await noSideScroll(p))) { check(`no sideways scroll on ${p.label}`, false); }
  }
  check('results fit every phone width without sideways scroll', true);

  /* ---------------- 5. Late arrival ---------------- */
  section('5. Opening the link after the draft');
  const late = await device('late', small);
  await late.goto(gameUrl(gameId));
  await late.waitForSelector('[data-complete]', { timeout: T });
  check('someone opening the link afterwards goes straight to the final teams',
    JSON.stringify(await rostersOf(late)) === JSON.stringify(views[0]));

  /* ---------------- 6. Missing captain ---------------- */
  section('6. A captain is missing — the draft still runs');
  const host2 = await device('host2', pixel);
  await host2.goto(BASE + QUERY);
  await host2.locator('[data-new-draft]').click();
  await host2.locator('#playerInput').fill(['אלון', 'יוסי', 'דני', 'משה', 'רועי', 'אבי', 'גל', 'תומר', 'ניר'].join('\n'));
  await host2.locator('[data-create-game]').click();
  await host2.waitForSelector('.namegrid', { timeout: T });
  game2 = await host2.evaluate(() => location.hash.slice(1));
  for (const name of ['יוסי', 'דני', 'משה']) await host2.locator('.namebtn', { hasText: new RegExp('^' + name + '$') }).click();
  await host2.locator('[data-finalize]').click();
  await host2.waitForSelector('[data-invite]', { timeout: T });

  const red2 = await device('red2', small);
  await red2.goto(gameUrl(game2));
  await red2.locator('[data-join="Red"]').click();
  await red2.waitForSelector('[data-seat="Red"].slot--mine', { timeout: T });

  check('start is held while captains are missing', await host2.locator('[data-start-draft]').isDisabled());
  await host2.locator('[data-start-anyway]').click();
  await waitPickNo(host2, 1);
  check('"start without them" works with no confirm dialog', true);

  // Play until it is the turn of a team with no captain: the host picks for it.
  let g2 = await readGame(host2, game2);
  const colorOf2 = id => g2.teams.find(t => t.id === id).color;
  const order2 = g2.turn.order.map(colorOf2);
  for (let n = 0; n < 6; n++) {
    const c = order2[n % 6 < 3 ? n % 6 : 5 - (n % 6)];
    const p = c === 'Red' ? red2 : host2;
    await waitPickNo(p, n + 1);
    if (c !== 'Red' && n === 0) {
      check('the host can pick for a team with no captain', await host2.locator('.pick--live').count() > 0);
    }
    if (n === 2) {
      // The White captain turns up mid-draft and takes their seat.
      const white2 = await device('white2', iphone);
      await white2.goto(gameUrl(game2));
      await white2.locator('[data-join="White"]').click();
      await white2.waitForSelector('[data-turn-banner]', { timeout: T });
      check('a late captain joins mid-draft with one tap', true);
      await white2.close();
    }
    const who = c === 'Red' ? red2 : host2;
    if (c === 'White' && n >= 2) break;
    await who.locator('[data-pick-player]').first().click();
    await who.locator('[data-confirm-pick]').click();
  }
  // The picking phone shows its pick before the server has it; read the
  // backend only once nothing is still saving.
  await host2.waitForFunction(() => !document.querySelector('[data-saving]'), null, { timeout: T });
  await sleep(PROD ? 2000 : 800);
  g2 = await readGame(host2, game2);
  if (process.env.DEBUG) console.log('        participants:', JSON.stringify(g2.participants), 'teams:', JSON.stringify(g2.teams), 'picks:', g2.picks.length);
  const made2 = g2.picks.length;
  check('picks by host and captain recorded in order', made2 >= 2 && g2.picks.every((p, i) => p.seq === i), String(made2));

  await host2.locator('button[aria-label="כלי מארגן"]').click();
  await host2.locator('[data-undo]').click();
  await waitPickNo(red2, made2);
  check('host undo removes the last pick for everyone', (await readGame(host2, game2)).picks.length === made2 - 1);

  // Only the organizer can wipe the draft — not a watcher, not a captain.
  const viewer2 = await device('viewer2', small);
  await viewer2.goto(gameUrl(game2));
  await viewer2.locator('[data-watch]').click();
  await viewer2.waitForSelector('[data-turn-banner]', { timeout: T });
  await viewer2.locator('button[aria-label="אפשרויות"]').click();
  await red2.locator('button[aria-label="אפשרויות"]').click();
  check('watchers and captains get no reset in their menu',
    await viewer2.locator('[data-reset]').count() === 0 && await red2.locator('[data-reset]').count() === 0);
  await red2.locator('[data-host-menu] button[aria-label="סגירה"]').click();

  // The organizer's phone is gone: one tap in the menu continues on another.
  await viewer2.locator('[data-takeover-host]').click();
  await viewer2.waitForFunction(() => /מארגן/.test(document.querySelector('[data-me]')?.textContent || ''), null, { timeout: T });
  await host2.waitForFunction(() => (window.__toasts || []).some(t => /המארגן ממשיך/.test(t)), null, { timeout: T });
  check('the organizer continues on another phone with one tap — no code — and the old phone is told', true);

  // Start the evening over from a new list, on the same link.
  await viewer2.locator('button[aria-label="כלי מארגן"]').click();
  await viewer2.locator('[data-restart-roster]').click();
  await viewer2.locator('#playerInput').fill(['אלון', 'יוסי', 'דני', 'משה', 'רועי', 'אבי'].join('\n'));
  await viewer2.locator('[data-restart-submit]').click();
  await viewer2.locator('[data-reset-confirm-yes]').click();
  await viewer2.waitForSelector('.namegrid', { timeout: T });
  await red2.waitForSelector('[data-waiting-host]', { timeout: T });
  const g3 = await readGame(viewer2, game2);
  check('restart with a new list: same link, everyone back to the start, seats cleared',
    g3.status === 'captains' && g3.players.length === 6 && g3.participants.length === 0 && g3.picks.length === 0);

  check('no JavaScript errors on any device', pageErrors.length === 0, pageErrors.join(' | '));
} catch (e) {
  check('run completed without an exception', false, e && e.message ? e.message.split('\n')[0] : String(e));
  console.log(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : '');
  if (pageErrors.length) console.log('        page errors: ' + pageErrors.join(' | '));
  for (const p of allPages) {
    try {
      if (p.isClosed()) continue;
      await shot(p, 'zz-failure-' + p.label);
      const t = await toastText(p);
      if (t) console.log(`        toasts on ${p.label}: ${t}`);
    } catch (_) {}
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (PROD && gameId) console.log(`Production test games: ${[gameId, game2].filter(Boolean).map(id => 'games/' + id).join(', ')} — delete them from the Firebase console.`);
if (failures.length) {
  console.log('\nFailures:\n  ' + failures.join('\n  '));
  process.exit(1);
}
