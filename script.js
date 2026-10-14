// The Firebase SDK is vendored under vendor/ so the app shell has no runtime
// dependency on a CDN. See vendor/README.md before upgrading.
import { initializeApp } from './vendor/firebase-app.js';
import { getFirestore, initializeFirestore, connectFirestoreEmulator, doc, onSnapshot, setDoc, runTransaction } from './vendor/firebase-firestore.js';

const app = initializeApp({
  apiKey: "AIzaSyBqz4oHoqGtnzjWqgzjWmwsUv6Kny75QpM",
  authDomain: "draft21-eabc3.firebaseapp.com",
  projectId: "draft21-eabc3",
  storageBucket: "draft21-eabc3.firebasestorage.app",
  messagingSenderId: "489648686113",
  appId: "1:489648686113:web:94d3605a0e5a871a434f60",
});

// Production always uses the SDK's own transport auto-detection — untouched.
// `?lp=1` forces long-polling and exists purely so the app can be driven
// inside automated/proxied browsers, whose network stacks break the
// streaming-XHR probe and leave the listener silently unconnected.
const db = /[?&]lp=1\b/.test(location.search)
  ? initializeFirestore(app, { experimentalForceLongPolling: true })
  : getFirestore(app);

// `?emu=127.0.0.1:8080` points the app at a local Firestore emulator, which is
// how tests/e2e.mjs drives four phones against a real, rules-enforcing backend
// without touching production. Honoured only when the page itself is served
// from localhost, so a crafted link can never redirect a real phone elsewhere.
(function () {
  const m = /[?&]emu=([\w.-]+):(\d+)/.exec(location.search);
  if (m && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) connectFirestoreEmulator(db, m[1], Number(m[2]));
})();

// Bumped whenever the game document shape changes in a non-backwards-compatible way.
const SCHEMA = 2;
const MAX_PLAYERS = 21;
const MIN_PLAYERS = 6;
const TEAM_COLORS = ['Red', 'White', 'Black'];
const TEAM_COLOR_HE = { Red: 'אדום', White: 'לבן', Black: 'שחור' };

// Jersey palettes are tuned for a near-black background: every shirt keeps a
// light outline so the black kit reads as an object rather than a hole, and
// the white kit keeps a dark trim so it does not blow out.
const TEAM_JERSEY_STYLES = {
  Red: {
    top: '#FF8080',
    base: '#FF4747',
    bottom: '#B21E1E',
    trim: '#FFE8E8',
    panel: '#8F1616',
    number: '#FFFFFF',
    seam: '#FFC2C2',
    outline: '#FFB0B0'
  },
  White: {
    top: '#FFFFFF',
    base: '#EEF3FA',
    bottom: '#B9C4D4',
    trim: '#2A3342',
    panel: '#D7DFEA',
    number: '#0A0D12',
    seam: '#94A3B8',
    outline: '#FFFFFF'
  },
  Black: {
    top: '#3B4553',
    base: '#181E27',
    bottom: '#05070A',
    trim: '#C9D4E3',
    panel: '#39424F',
    number: '#F4F7FC',
    seam: '#7C8899',
    outline: '#9AA8BB'
  }
};
let shirtSvgSeq = 0;

// Escapes for both text nodes and quoted attribute values.
function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function colorHe(color) {
  return TEAM_COLOR_HE[color] || 'ללא קבוצה';
}

function showError(msg) {
  showToast(msg, 'toast--bad');
  haptic([18, 60, 18]);
}

function showNotice(msg) {
  showToast(msg, '');
}

function showSuccess(msg) {
  showToast(msg, 'toast--good');
}

function showToast(msg, variant) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = 'toast ' + (variant || '');
  el.setAttribute('data-toast', '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 250);
  }, 4600);
}

// Screen-reader announcement for realtime changes that are otherwise only
// signalled by colour and motion (turn handover, a pick landing).
function announce(msg) {
  const host = document.getElementById('live');
  if (host) host.textContent = msg;
}

// Confirmations and turn handovers get a short buzz. Phones that do not
// support it simply ignore the call.
function haptic(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* Icons — a small inline set, so the app never waits on a font        */
/* ------------------------------------------------------------------ */

const ICONS = {
  crown: '<path d="M4 17h16l1.2-9-5.1 3.4L12 5l-4.1 6.4L2.8 8Z"/>',
  check: '<path d="M4.5 12.6l4.7 4.7L19.6 6.9" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
  x: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  undo: '<path d="M9 5L4 10l5 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 10h9a6 6 0 010 12h-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l2.8-2.8a4 4 0 10-5.7-5.7L11.6 6.7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M14 10a4 4 0 00-5.7 0l-2.8 2.8a4 4 0 105.7 5.7l1.2-1.2" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  share: '<path d="M12 15V4m0 0L8 8m4-4l4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 14v4.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 5.5H6.6A2.1 2.1 0 004.5 7.6v8.9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  fwd: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/>',
  dots: '<circle cx="5" cy="12" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="19" cy="12" r="1.9"/>',
  shuffle: '<path d="M4 7h4.2l7.6 10H20M4 17h4.2l2.6-3.4M15.8 7H20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17.6 4.6L20 7l-2.4 2.4M17.6 14.6L20 17l-2.4 2.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  refresh: '<path d="M20 12a8 8 0 11-2.6-5.9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M20 3.5V9h-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>',
  exit: '<path d="M14 4h4.5A1.5 1.5 0 0120 5.5v13a1.5 1.5 0 01-1.5 1.5H14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><path d="M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>',
  bolt: '<path d="M13.5 2L4 13.5h6L9.5 22 20 10.5h-6.4Z"/>',
  plus: '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M12 12h9m-3 0v3.5M21 12v3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>',
  list: '<path d="M9 6.5h11M9 12h11M9 17.5h11" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/><circle cx="4.6" cy="6.5" r="1.5"/><circle cx="4.6" cy="12" r="1.5"/><circle cx="4.6" cy="17.5" r="1.5"/>'
};

function icon(name, size) {
  const body = ICONS[name];
  if (!body) return '';
  const s = size || 18;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="currentColor" aria-hidden="true" focusable="false">' + body + '</svg>';
}

function renderTeamShirt(color, sizeClass = 'shirt--md', centered = false) {
  const style = TEAM_JERSEY_STYLES[color] || {
    top: '#4A5768',
    base: '#2B3340',
    bottom: '#161C25',
    trim: '#8895A8',
    panel: '#39424F',
    number: '#AEB9C9',
    seam: '#5C6879',
    outline: '#6C7688'
  };
  const alignClass = centered ? ' shirt--center' : '';
  const id = String(shirtSvgSeq++);
  const gradId = 'jersey-grad-' + id;
  const shineId = 'jersey-shine-' + id;
  return '<svg viewBox="0 0 64 64" class="shirt '+sizeClass+alignClass+'" role="img" aria-label="'+escapeHtml('חולצה '+colorHe(color))+'">'+
    '<defs>'+
      '<linearGradient id="'+gradId+'" x1="0" y1="0" x2="0" y2="1">'+
        '<stop offset="0%" stop-color="'+style.top+'"></stop>'+
        '<stop offset="45%" stop-color="'+style.base+'"></stop>'+
        '<stop offset="100%" stop-color="'+style.bottom+'"></stop>'+
      '</linearGradient>'+
      '<linearGradient id="'+shineId+'" x1="0" y1="0" x2="1" y2="1">'+
        '<stop offset="0%" stop-color="#ffffff" stop-opacity="0.35"></stop>'+
        '<stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>'+
      '</linearGradient>'+
    '</defs>'+
    '<path d="M18 12 10 18 6 30 14 34 18 28 18 56 46 56 46 28 50 34 58 30 54 18 46 12 38 16 26 16Z" fill="url(#'+gradId+')" stroke="'+style.outline+'" stroke-width="2.2" stroke-linejoin="round"></path>'+
    '<path d="M18 20 13.5 27 18 31 18 53 24 53 24 20Z" fill="'+style.panel+'" opacity="0.5"></path>'+
    '<path d="M46 20 46 53 40 53 40 20 44.5 27Z" fill="'+style.panel+'" opacity="0.5"></path>'+
    '<path d="M24 16 32 24 40 16 37 16 32 20 27 16Z" fill="'+style.trim+'"></path>'+
    '<rect x="8.4" y="28.5" width="7.2" height="3.6" rx="1.6" fill="'+style.trim+'" opacity="0.95"></rect>'+
    '<rect x="48.4" y="28.5" width="7.2" height="3.6" rx="1.6" fill="'+style.trim+'" opacity="0.95"></rect>'+
    '<rect x="20" y="25" width="24" height="5.5" rx="2" fill="'+style.panel+'" opacity="0.55"></rect>'+
    '<path d="M32 24.5V54" stroke="'+style.seam+'" stroke-width="1.8" stroke-opacity="0.45"></path>'+
    '<path d="M19 18.5H45" stroke="'+style.seam+'" stroke-width="1.2" stroke-opacity="0.45"></path>'+
    '<path d="M18 12 10 18 6 30 14 34 18 28 18 56 46 56 46 28 50 34 58 30 54 18 46 12 38 16 26 16Z" fill="url(#'+shineId+')"></path>'+
    '<text x="32" y="46" text-anchor="middle" font-size="13" font-weight="800" fill="'+style.number+'" font-family="ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto">21</text>'+
    '</svg>';
}

let state = {
  phase: 'setup', input: '',
  clientId: '', captains: [], teamAssignments: {},
  gameData: null, gameId: null, unsubscribe: null, loadError: '', loading: false,
  // Two separate connectivity signals, on purpose:
  //  netDown — the device reports no network. Hard, reliable, blocks writes.
  //  stale   — the Firestore listener is serving cache. Soft: the SDK drops and
  //            re-establishes its stream routinely, so this only drives the
  //            banner and must never block an action.
  netDown: !navigator.onLine, stale: false, offlineBanner: false, offlineTimer: null, dataSig: '',
  arrivedViaHash: false, firstSnapshot: true, lastCompleteGame: '',
  // -- presentation-only state -------------------------------------------
  // homeView: the home screen is now two decisions ("new game" / "join")
  // instead of one wall of controls; creating opens its own import step.
  homeView: 'home',
  // hostMenu: the host's destructive controls live in a sheet rather than
  // sitting under the player pool where they can be hit mid-draft.
  hostMenu: false,
  // confirmReset: resetting is open to everyone, so the guard is a second,
  // explicit tap in its own sheet — not a role check and not a native
  // confirm() dialog, which some in-app browsers swallow silently.
  // '' | 'picks' (wipe the picks) | 'roster' (start over from the player list).
  confirmReset: '',
  // watching: this device chose "just watching" for the current game. Watchers
  // write nothing to the game, so the choice lives in localStorage only.
  watching: false,
  // choosingRole: the role picker opened on purpose from the menu, by someone
  // who already has a role (switching seats, or a host who is also a captain).
  choosingRole: false,
  // myRolePrev: the role this device held on the previous snapshot, so losing
  // it to another phone ("it's me — continue here") can be explained.
  myRolePrev: '',
  // selected: the player a captain tapped, waiting for the confirm tap. Local
  // only — nothing is written until the pick is confirmed, so a phone that
  // locks halfway through can never leave the draft stuck.
  selected: null,
  // inflight: a confirmed pick on its way to Firestore. It is drawn as if it
  // had already landed, so the pick feels instant; the snapshot that carries it
  // replaces it, and a rejected write simply takes it back off the screen.
  inflight: null,
  // rosterEdit: the player list open for editing on a game that already exists,
  // i.e. the first step of a from-scratch restart. Nothing is written until the
  // confirm sheet is accepted, so backing out of here destroys nothing.
  rosterEdit: false,
  // uiPrev: what the last paint showed, so a state-change animation only
  // fires when the underlying value actually changed. Firestore emits a
  // snapshot for every metadata blip; replaying the turn animation on each
  // one would be both wrong and distracting.
  uiPrev: { turnKey: '', picks: -1, phase: '', mine: false, pending: '', hostMenu: false, confirmReset: '' }
};

function loadWatching(gameId) {
  try { return !!gameId && localStorage.getItem('d21_watch') === gameId; } catch (e) { return false; }
}

function setWatching(on) {
  state.watching = !!on;
  try {
    if (on && state.gameId) localStorage.setItem('d21_watch', state.gameId);
    else localStorage.removeItem('d21_watch');
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* Connectivity                                                        */
/* ------------------------------------------------------------------ */

function updateConnState(patch) {
  const wasDisconnected = state.netDown || state.stale;
  if ('netDown' in patch) state.netDown = patch.netDown;
  if ('stale' in patch) state.stale = patch.stale;
  const isDisconnected = state.netDown || state.stale;
  if (isDisconnected === wasDisconnected) { renderConnBar(); return; }

  if (state.offlineTimer) { clearTimeout(state.offlineTimer); state.offlineTimer = null; }
  if (isDisconnected) {
    // Wait before alarming anyone: most drops recover in well under 2s.
    state.offlineTimer = setTimeout(() => {
      state.offlineTimer = null;
      state.offlineBanner = true;
      renderConnBar();
      // The "connecting" screen carries connection copy of its own.
      if (!state.gameData) render();
    }, 3000);
  } else {
    state.offlineBanner = false;
    if (!state.gameData) render();
  }
  renderConnBar();
}

// Re-attaching the listener makes coming back online deterministic instead of
// waiting on the SDK's own backoff.
function reconnect() {
  updateConnState({ netDown: !navigator.onLine });
  if (state.gameId) subscribeToGame();
  renderConnBar();
}

function renderConnBar() {
  const bar = document.getElementById('connbar');
  if (!bar) return;
  document.body.classList.toggle('has-connbar', !!state.offlineBanner);
  if (!state.offlineBanner) { bar.innerHTML = ''; return; }
  const msg = state.netDown
    ? 'אין חיבור — הדראפט לא מתעדכן'
    : 'החיבור אבד — מתחבר מחדש';
  bar.innerHTML = '<div data-offline-bar class="connbar" role="status">'+
    '<span class="livedot" style="color:#FFB020"></span>'+
    '<span>'+msg+'</span>'+
    '<button onclick="handleReconnect()">נסה שוב</button></div>';
}

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

// A stable per-device id. Survives refresh and PWA relaunch; a cleared
// storage means a new id, which is why the host can release a stale claim.
function getClientId() {
  let id = localStorage.getItem('d21_client');
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'c' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem('d21_client', id);
  }
  return id;
}

function generateGameId() {
  return randomToken(6).toLowerCase();
}

function generateHostKey() {
  return randomToken(4);
}

function randomToken(len) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  if (window.crypto && crypto.getRandomValues) {
    const buf = new Uint8Array(len);
    crypto.getRandomValues(buf);
    for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  } else {
    for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Derived state — `picks` is the single source of truth               */
/* ------------------------------------------------------------------ */

function isHost(game) {
  return !!game && game.hostId === state.clientId;
}

function myParticipant(game) {
  if (!game || !Array.isArray(game.participants)) return null;
  return game.participants.find(p => p.id === state.clientId) || null;
}

function myTeamId(game) {
  const me = myParticipant(game);
  return me ? me.teamId || null : null;
}

// A phone's place in the draft: organizer (`hostId`, set when it created the
// draft), captain (a claim in `participants`), or neither — watching, or about
// to be asked which team it is.
function myRoleKey(game) {
  if (!game) return '';
  return (isHost(game) ? 'host' : '') + '|' + (myTeamId(game) || '');
}

// Teams in kit order (red, white, black) wherever they are offered as a
// choice, so the same seat is always in the same place on every phone.
function teamsByKit(game) {
  return (game.teams || []).slice().sort((a, b) => TEAM_COLORS.indexOf(a.color) - TEAM_COLORS.indexOf(b.color));
}

function teamById(game, teamId) {
  return (game.teams || []).find(t => t.id === teamId) || null;
}

function playerName(game, playerId) {
  const p = (game.players || []).find(pl => pl.id === playerId);
  return p ? p.name : '';
}

function claimantOf(game, teamId) {
  return (game.participants || []).find(p => p.teamId === teamId) || null;
}

// Captain first, then picks in the order they were made.
function teamRoster(game, teamId) {
  const team = teamById(game, teamId);
  if (!team) return [];
  const ids = [team.captainId];
  (game.picks || []).forEach(pick => {
    if (pick.teamId === teamId) ids.push(pick.playerId);
  });
  return ids;
}

function draftedPlayerIds(game) {
  const taken = new Set();
  (game.teams || []).forEach(t => taken.add(t.captainId));
  (game.picks || []).forEach(pk => taken.add(pk.playerId));
  return taken;
}

function availablePlayers(game) {
  const taken = draftedPlayerIds(game);
  return (game.players || []).filter(p => !taken.has(p.id));
}

function totalPicksNeeded(game) {
  return Math.max(0, (game.players || []).length - (game.teams || []).length);
}

// Snake position as a pure function of how many picks have been made.
// For 3 teams this yields 1,2,3,3,2,1,1,2,3,3,2,1,... exactly.
function snakePosition(pickCount, orderLength, snake) {
  if (!orderLength) return null;
  if (!snake) return { index: pickCount % orderLength, direction: 1 };
  const cycle = ((pickCount % (2 * orderLength)) + 2 * orderLength) % (2 * orderLength);
  return cycle < orderLength
    ? { index: cycle, direction: 1 }
    : { index: 2 * orderLength - 1 - cycle, direction: -1 };
}

// The game as this device should draw it: the latest snapshot plus a confirmed
// pick of ours that is still on its way. Everything derived from `picks` —
// rosters, the pool, whose turn — then moves the instant the captain taps.
function viewOf(game) {
  const f = state.inflight;
  if (!game || !f) return game;
  const picks = game.picks || [];
  if (game.status !== 'draft' || picks.length !== f.seq) return game;
  const pick = { playerId: f.playerId, playerName: f.playerName, teamId: f.teamId, byId: f.byId, seq: f.seq, saving: true };
  return Object.assign({}, game, { picks: picks.concat([pick]), lastPick: pick });
}

// Never trusts a stored turn index — always recomputed from picks.
function getCurrentTurn(game) {
  if (!game || !game.turn || !Array.isArray(game.turn.order) || !game.turn.order.length) return null;
  // Every pick made: nobody is on the clock, the draft is closing.
  if ((game.picks || []).length >= totalPicksNeeded(game)) return null;
  const order = game.turn.order;
  const snake = !game.settings || game.settings.snake !== false;
  const pos = snakePosition((game.picks || []).length, order.length, snake);
  if (!pos) return null;
  const teamId = order[pos.index];
  const team = teamById(game, teamId);
  if (!team) return null;
  const claimant = claimantOf(game, teamId);
  return {
    teamId,
    team,
    index: pos.index,
    direction: pos.direction,
    round: Math.floor((game.picks || []).length / order.length) + 1,
    captainName: playerName(game, team.captainId),
    claimant,
    // The claiming captain controls the turn. If nobody claimed the team the
    // host may act for it, so a missing captain can never stall the draft.
    isMine: claimant ? claimant.id === state.clientId : isHost(game),
    controlledByHost: !claimant && isHost(game),
    unclaimed: !claimant
  };
}

function turnStateFor(game, pickCount) {
  const order = (game.turn && game.turn.order) || [];
  const snake = !game.settings || game.settings.snake !== false;
  const pos = snakePosition(pickCount, order.length, snake) || { index: 0, direction: 1 };
  return { order, index: pos.index, direction: pos.direction };
}

/* ------------------------------------------------------------------ */
/* Firestore plumbing                                                  */
/* ------------------------------------------------------------------ */

function gameRef(id) {
  return doc(db, 'games', id || state.gameId);
}

function setGameId(id) {
  state.gameId = id;
  state.watching = loadWatching(id);
  window.location.hash = id;
  localStorage.setItem('d21_gameId', id);
}

function subscribeToGame() {
  if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
  if (!state.gameId) { render(); return; }
  state.loading = true;
  state.unsubscribe = onSnapshot(gameRef(), { includeMetadataChanges: true }, snap => {
    state.loading = false;
    // fromCache means the listener is serving cache — but not while one of our
    // own writes is still in flight, which also emits a cached snapshot.
    updateConnState({
      netDown: !navigator.onLine,
      stale: snap.metadata.fromCache && !snap.metadata.hasPendingWrites
    });
    if (snap.exists()) {
      const data = snap.data();
      // Metadata-only snapshots (connection state, write acks) arrive often.
      // Re-rendering on those would rebuild every button several times a
      // second, which drops taps mid-draft. Only real data changes redraw.
      const sig = JSON.stringify(data);
      if (sig === state.dataSig) { renderConnBar(); return; }
      state.dataSig = sig;
      if (data.schema !== SCHEMA) {
        state.gameData = null;
        state.phase = 'setup';
        state.loadError = 'הדראפט הזה נוצר בגרסה ישנה של Draft21 ואינו נתמך. צור דראפט חדש.';
      } else if (state.firstSnapshot && !state.arrivedViaHash && data.status === 'complete') {
        // Reopening the installed app must not trap anyone in last week's
        // finished draft. A shared link (which carries the hash) still opens it.
        state.firstSnapshot = false;
        rememberCompletedGame(state.gameId);
        leaveGame();
        render();
        return;
      } else {
        const nextPhase = data.status || 'setup';
        // Someone else may have reset (or the draft moved on) while a confirm
        // sheet was open on this device. Drop it rather than leave a stale
        // "are you sure?" over a board that already changed underneath it.
        if (nextPhase !== state.phase) { state.confirmReset = ''; state.hostMenu = false; state.choosingRole = false; }
        state.gameData = data;
        state.phase = nextPhase;
        state.loadError = '';
        settleLocalState(data);
      }
    } else {
      state.gameData = null;
      state.phase = 'setup';
      state.dataSig = '';
      state.loadError = 'הדראפט הזה לא נמצא. בדוק שהקישור שלם, או בקש מהמארגן לשלוח אותו שוב.';
    }
    state.firstSnapshot = false;
    render();
  }, err => {
    state.loading = false;
    updateConnState({ stale: true });
    state.loadError = 'שגיאת חיבור: ' + err.message;
    render();
  });
}

// Local, unsaved state has to follow the shared state it sits on top of.
function settleLocalState(data) {
  // Our in-flight pick has landed (or the draft moved on without it).
  const f = state.inflight;
  if (f && ((data.picks || []).length > f.seq || data.status !== 'draft')) state.inflight = null;

  // A tapped-but-unconfirmed player is only meaningful while it is still our
  // turn on the same pick and the player is still on the shelf.
  if (state.selected) {
    const turn = data.status === 'draft' ? getCurrentTurn(data) : null;
    const still = turn && turn.isMine && (data.picks || []).length === state.selected.seq &&
      !draftedPlayerIds(data).has(state.selected.playerId);
    if (!still) state.selected = null;
  }

  // Someone tapped "it's me — continue here" on another phone. Say so, rather
  // than silently dropping this phone back to the role picker.
  const now = myRoleKey(data);
  const prev = state.myRolePrev;
  if (prev && now !== prev) {
    const [prevHost, prevTeam] = prev.split('|');
    const [nowHost, nowTeam] = now.split('|');
    // Only a seat now held by someone else counts as "moved"; a reset or a
    // freed seat is explained by the screen itself.
    const holder = prevTeam && !nowTeam ? claimantOf(data, prevTeam) : null;
    if (holder && holder.id !== state.clientId) showNotice('התפקיד שלך עבר לטלפון אחר');
    else if (prevHost && !nowHost) showNotice('המארגן ממשיך עכשיו מטלפון אחר');
  }
  state.myRolePrev = now;
}

function rememberCompletedGame(id) {
  state.lastCompleteGame = id;
  try { localStorage.setItem('d21_lastGame', id); } catch (e) {}
}

function leaveGame() {
  if (state.unsubscribe) { state.unsubscribe(); state.unsubscribe = null; }
  state.gameData = null;
  state.gameId = null;
  state.phase = 'setup';
  state.arrivedViaHash = false;
  state.firstSnapshot = true;
  state.dataSig = '';
  state.captains = [];
  state.teamAssignments = {};
  state.homeView = 'home';
  state.hostMenu = false;
  state.confirmReset = '';
  state.rosterEdit = false;
  state.choosingRole = false;
  state.myRolePrev = '';
  state.selected = null;
  state.inflight = null;
  state.watching = false;
  state.uiPrev = { turnKey: '', picks: -1, phase: '', mine: false, pending: '', hostMenu: false, confirmReset: '' };
  localStorage.removeItem('d21_gameId');
  localStorage.removeItem('d21_caps');
  localStorage.removeItem('d21_assign');
  window.location.hash = '';
}

// All game mutations funnel through here: read fresh inside the transaction,
// validate the actor and the state, then write. The rendered UI is only a hint.
async function mutate(label, fn) {
  if (!state.gameId) return false;
  // Refuse rather than letting the write sit in a queue and land minutes later
  // in the middle of somebody else's turn. Only the hard signal blocks here —
  // a brief transport drop is left to Firestore's own retry.
  if (state.netDown) {
    showError('אין חיבור לאינטרנט — הפעולה לא בוצעה. נסה שוב כשהחיבור יחזור.');
    return false;
  }
  try {
    await runTransaction(db, async txn => {
      const ref = gameRef();
      const snap = await txn.get(ref);
      if (!snap.exists()) throw new Error('הדראפט לא נמצא');
      const game = snap.data();
      if (game.schema !== SCHEMA) throw new Error('גרסת דראפט לא נתמכת');
      const patch = fn(game, txn);
      if (patch) txn.update(ref, patch);
    });
    return true;
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'unavailable' || code === 'deadline-exceeded' || /offline|network/i.test(String(e && e.message))) {
      showError('החיבור לא זמין — הפעולה לא בוצעה. בדוק את החיבור ונסה שוב.');
    } else if (code === 'permission-denied' || /permission/i.test(String(e && e.message))) {
      // Almost always one thing: the app was deployed but firestore.rules was
      // not. Saying so beats "Missing or insufficient permissions".
      showError('הפעולה נדחתה על ידי חוקי האבטחה. אם עדכנת את האפליקציה, פרסם גם את firestore.rules.');
    } else {
      showError(label + ': ' + (e && e.message ? e.message : 'שגיאה'));
    }
    return false;
  }
}

function init() {
  state.clientId = getClientId();
  try {
    const savedCaptains = localStorage.getItem('d21_caps');
    const savedAssignments = localStorage.getItem('d21_assign');
    if (savedCaptains) state.captains = JSON.parse(savedCaptains) || [];
    if (savedAssignments) state.teamAssignments = JSON.parse(savedAssignments) || {};
  } catch (e) {
    state.captains = [];
    state.teamAssignments = {};
  }

  state.lastCompleteGame = localStorage.getItem('d21_lastGame') || '';

  window.addEventListener('online', reconnect);
  window.addEventListener('offline', () => updateConnState({ netDown: true }));

  const hashId = window.location.hash.replace('#', '').trim();
  const savedGameId = localStorage.getItem('d21_gameId');
  // A hash means the user followed a shared link and always wins.
  state.arrivedViaHash = !!hashId;
  if (hashId) {
    setGameId(hashId);
    subscribeToGame();
  } else if (savedGameId) {
    setGameId(savedGameId);
    subscribeToGame();
  } else {
    render();
  }

  window.addEventListener('hashchange', () => {
    const newId = window.location.hash.replace('#', '').trim();
    if (newId && newId !== state.gameId) {
      state.loadError = '';
      state.arrivedViaHash = true;
      state.firstSnapshot = true;
      setGameId(newId);
      subscribeToGame();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Roster parsing                                                      */
/* ------------------------------------------------------------------ */

// Strips list numbering and bullets but keeps digits that belong to the name,
// so "עידן 2" and "R9" survive while "1. עידן" and "2) R9" are cleaned.
// Invisible characters go first: WhatsApp puts a WORD JOINER (U+2060) after
// the number of every line in a numbered list, along with bidi marks, and left
// in place they would ride along inside the name — into the results text and
// past the duplicate check.
function cleanRosterLine(line) {
  let s = String(line).replace(/[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, '').trim();
  if (!s) return '';
  s = s.replace(/^[-–—•*·]+\s*/, '');
  const numbered = s.replace(/^\d{1,2}\s*[.)\]:\-–]\s*/, '');
  if (numbered !== s) {
    s = numbered;
  } else {
    const spaced = s.replace(/^\d{1,2}\s+/, '');
    if (spaced !== s && /[^\d\s]/.test(spaced)) s = spaced;
  }
  return s.replace(/\s+/g, ' ').trim();
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[\s'"״׳`.\-]/g, '');
}

function parseRoster(text) {
  const names = [];
  String(text || '').split('\n').forEach(line => {
    const name = cleanRosterLine(line);
    if (name) names.push(name);
  });

  const errors = [];
  if (!names.length) {
    errors.push('הזן לפחות שם שחקן אחד');
    return { names, errors };
  }
  if (names.length < MIN_PLAYERS) {
    errors.push('צריך לפחות ' + MIN_PLAYERS + ' שחקנים (3 קפטנים + 3 שחקנים). קיבלתי ' + names.length + '.');
  }
  if (names.length > MAX_PLAYERS) {
    errors.push('יש ' + names.length + ' שמות ברשימה, והמקסימום הוא ' + MAX_PLAYERS + '. הסר ' + (names.length - MAX_PLAYERS) + ' שמות ונסה שוב.');
  } else if (names.length >= MIN_PLAYERS && names.length % 3) {
    // Every team ends with its captain plus the same number of picks, so the
    // list has to split into three equal teams.
    const down = names.length - names.length % 3;
    const up = down + 3;
    errors.push('יש ' + names.length + ' שחקנים. כדי שהקבוצות יהיו שוות צריך ' + down + (up <= MAX_PLAYERS ? ' או ' + up : '') +
      ' — ' + (names.length % 3 === 1 ? 'הסר שם אחד' : 'הסר שני שמות') + (up <= MAX_PLAYERS ? ' או הוסף ' + (up - names.length === 1 ? 'אחד' : 'שניים') : '') + '.');
  }

  const groups = new Map();
  names.forEach(name => {
    const key = normalizeName(name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  });
  const dupes = [];
  groups.forEach(list => { if (list.length > 1) dupes.push(list[0] + ' (×' + list.length + ')'); });
  if (dupes.length) {
    errors.push('יש שמות כפולים: ' + dupes.join(', ') + '. הוסף כינוי או שם משפחה כדי להבדיל ביניהם.');
  }

  return { names, errors };
}

/* ------------------------------------------------------------------ */
/* Game lifecycle                                                      */
/* ------------------------------------------------------------------ */

async function initGame() {
  const { names, errors } = parseRoster(state.input);
  if (errors.length) { showError(errors[0]); return; }

  const players = names.map((name, index) => ({ id: 'p' + index, name }));
  const newId = generateGameId();
  const hostKey = generateHostKey();
  try {
    await setDoc(gameRef(newId), {
      schema: SCHEMA,
      hostId: state.clientId,
      hostKey,
      status: 'captains',
      players,
      teams: [],
      participants: [],
      picks: [],
      turn: { order: [], index: 0, direction: 1 },
      settings: { snake: true },
      pendingPick: null,
      lastPick: null
    });
  } catch (e) {
    showError('שגיאה ביצירת הדראפט: ' + e.message);
    return;
  }
  // Only adopt the id once the write succeeded, so a failure never leaves
  // the client pointing at a game that does not exist.
  state.captains = [];
  state.teamAssignments = {};
  localStorage.removeItem('d21_caps');
  localStorage.removeItem('d21_assign');
  state.loadError = '';
  state.arrivedViaHash = true;
  state.firstSnapshot = true;
  setGameId(newId);
  subscribeToGame();
}

function toggleCaptain(playerId) {
  const game = state.gameData;
  if (!isHost(game)) { showError('רק המארגן יכול לבחור קפטנים'); return; }
  if (!(game.players || []).some(p => p.id === playerId)) return;
  const index = state.captains.indexOf(playerId);
  if (index > -1) {
    state.captains.splice(index, 1);
    delete state.teamAssignments[playerId];
  } else if (state.captains.length < 3) {
    state.captains.push(playerId);
    // Kits are handed out in pick order — red, white, black — so three taps
    // finish the job. Tapping a shirt afterwards still swaps them.
    const used = Object.values(state.teamAssignments);
    state.teamAssignments[playerId] = TEAM_COLORS.find(c => used.indexOf(c) === -1);
  } else {
    showError('כבר נבחרו 3 קפטנים');
    return;
  }
  persistCaptainDraft();
  render();
}

function persistCaptainDraft() {
  localStorage.setItem('d21_caps', JSON.stringify(state.captains));
  localStorage.setItem('d21_assign', JSON.stringify(state.teamAssignments));
}

// Assigning a colour that another captain holds swaps the two, so two
// captains can never end up on the same colour.
function assignTeamColor(captainId, color) {
  if (!isHost(state.gameData)) { showError('רק המארגן יכול להגדיר קבוצות'); return; }
  if (!state.captains.includes(captainId) || TEAM_COLORS.indexOf(color) === -1) return;
  const previous = state.teamAssignments[captainId] || null;
  const holder = Object.keys(state.teamAssignments).find(id => state.teamAssignments[id] === color && id !== captainId);
  state.teamAssignments[captainId] = color;
  if (holder) {
    if (previous) state.teamAssignments[holder] = previous;
    else delete state.teamAssignments[holder];
  }
  persistCaptainDraft();
  render();
}

function randomizeColors() {
  if (!isHost(state.gameData)) { showError('רק המארגן יכול להגדיר קבוצות'); return; }
  if (state.captains.length !== 3) return;
  const colors = shuffle(TEAM_COLORS.slice());
  state.teamAssignments = {};
  state.captains.forEach((captainId, index) => { state.teamAssignments[captainId] = colors[index]; });
  persistCaptainDraft();
  render();
}

// Drops captain ids that are not in this game's roster, so stale local
// state from a previous game can never crash or leak into a new one.
function pruneCaptainDraft(game) {
  if (!game || !Array.isArray(game.players)) return;
  const valid = new Set(game.players.map(p => p.id));
  const before = state.captains.length;
  state.captains = state.captains.filter(id => valid.has(id));
  Object.keys(state.teamAssignments).forEach(id => {
    if (!state.captains.includes(id)) delete state.teamAssignments[id];
  });
  if (state.captains.length !== before) persistCaptainDraft();
}

async function finalizeCaptains() {
  const captainIds = state.captains.slice();
  const assignments = Object.assign({}, state.teamAssignments);
  const ok = await mutate('שגיאה בשמירת קפטנים', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המארגן יכול לסיים הגדרת קפטנים');
    if (game.status !== 'captains') throw new Error('הקפטנים כבר הוגדרו');
    if (captainIds.length !== 3) throw new Error('צריך לבחור בדיוק 3 קפטנים');
    if (new Set(captainIds).size !== 3) throw new Error('אותו שחקן נבחר יותר מפעם אחת');

    const known = new Set((game.players || []).map(p => p.id));
    captainIds.forEach(id => {
      if (!known.has(id)) throw new Error('אחד הקפטנים אינו ברשימת השחקנים. בחר מחדש.');
    });

    const colors = captainIds.map(id => assignments[id]);
    if (colors.some(c => TEAM_COLORS.indexOf(c) === -1)) throw new Error('לכל קפטן צריך להיות צבע קבוצה');
    if (new Set(colors).size !== 3) throw new Error('לא ניתן לתת את אותו צבע לשני קפטנים');

    const teams = captainIds.map((captainId, i) => ({
      id: 't' + i,
      color: assignments[captainId],
      captainId
    }));
    return { teams, status: 'lobby', picks: [], pendingPick: null, lastPick: null, turn: { order: [], index: 0, direction: 1 } };
  });
  if (ok) {
  }
}

// One tap from the role picker. A free seat is simply taken; a taken seat is
// taken over only when the tap says so ("it's me — continue on this phone"),
// which is the whole recovery story for a captain who switched phones or lost
// their browser. Inside a transaction, so two phones racing for one free seat
// get exactly one winner, and the other is told the seat just went.
async function claimRole(teamId, takeover) {
  const ok = await mutate('לא הצלחנו לשמור את התפקיד', game => {
    if (['lobby', 'draft'].indexOf(game.status) === -1) throw new Error('אי אפשר לבחור תפקיד בשלב הזה');
    const team = teamById(game, teamId);
    if (!team) throw new Error('הקבוצה לא קיימת');
    const holder = claimantOf(game, teamId);
    if (holder && holder.id === state.clientId) return null;
    if (holder && !takeover) throw new Error('הקבוצה ' + colorHe(team.color) + ' נתפסה הרגע בטלפון אחר');
    // participants holds seat claims and nothing else: keep every other seat,
    // drop this seat's previous holder and whatever seat this phone had.
    const participants = (game.participants || [])
      .filter(p => p.teamId && p.teamId !== teamId && p.id !== state.clientId)
      .map(p => Object.assign({}, p));
    participants.push({ id: state.clientId, nick: playerName(game, team.captainId), teamId, ready: true });
    return { participants };
  });
  if (ok) {
    setWatching(false);
    state.choosingRole = false;
    haptic(20);
    render();
  }
}

// Host is a single field, so taking it over is a single-field write — the
// one shape the security rules allow for hostId.
async function takeoverHost() {
  const ok = await mutate('לא הצלחנו להעביר את הניהול', game => (
    game.hostId === state.clientId ? null : { hostId: state.clientId }
  ));
  if (ok) {
    setWatching(false);
    state.choosingRole = false;
    state.hostMenu = false;
    showNotice('אתה המארגן בטלפון הזה');
    render();
  }
}

// "Just watching" writes nothing. A captain who switches to watching gives
// their seat back so someone else can take it.
async function watchOnly() {
  const game = state.gameData;
  if (game && myTeamId(game)) {
    const ok = await mutate('לא הצלחנו לפנות את המקום', g => ({
      participants: (g.participants || []).filter(p => p.id !== state.clientId).map(p => Object.assign({}, p))
    }));
    if (!ok) return;
  }
  setWatching(true);
  state.choosingRole = false;
  render();
}

// The host can free a seat whose captain is not coming, so the host can pick
// for that team instead. Not destructive — the captain can simply retake it.
async function releaseTeam(teamId) {
  await mutate('שגיאה בשחרור קבוצה', g => {
    if (g.hostId !== state.clientId) throw new Error('רק המארגן יכול לפנות קבוצה');
    const participants = (g.participants || []).filter(p => p.teamId !== teamId).map(p => Object.assign({}, p));
    if (participants.length === (g.participants || []).length) throw new Error('לקבוצה הזו אין קפטן');
    return { participants };
  });
}

// The order is fixed: red, white, black, then back — the snake. Who picks
// first is decided by which kit the organizer gives each captain.
async function startDraft(allowUnclaimed) {
  await mutate('שגיאה בהתחלת דראפט', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המארגן יכול להתחיל את הדראפט');
    if (game.status !== 'lobby') throw new Error('הדראפט כבר התחיל');
    const teams = game.teams || [];
    if (teams.length !== 3) throw new Error('צריך 3 קבוצות לפני התחלת דראפט');

    const teamIds = teams.map(t => t.id);
    const order = teamsByKit(game).map(t => t.id);

    const unclaimed = teamIds.filter(id => !(game.participants || []).some(p => p.teamId === id));
    if (unclaimed.length && !allowUnclaimed) {
      const names = unclaimed.map(id => colorHe(teamById(game, id).color)).join(', ');
      throw new Error('הקבוצות הבאות עדיין ללא קפטן: ' + names);
    }

    return {
      status: 'draft',
      picks: [],
      pendingPick: null,
      lastPick: null,
      turn: { order, index: 0, direction: 1 }
    };
  });
}

// Tapping a player only marks it on this phone; the confirm sheet writes it.
// Nothing half-done is ever stored, so a phone that locks between the two
// taps cannot leave the draft waiting on it.
function selectPlayer(playerId) {
  const game = viewOf(state.gameData);
  if (!game || state.inflight) return;
  const turn = getCurrentTurn(game);
  if (!turn || !turn.isMine || draftedPlayerIds(game).has(playerId)) return;
  state.selected = { playerId, seq: (game.picks || []).length };
  haptic(12);
  render();
}

function clearSelection() {
  state.selected = null;
  render();
}

// One transaction per pick, pinned to the pick number the captain was looking
// at. If anything moved in between — another phone picked, the host undid,
// the turn passed — the write is refused instead of landing in the wrong
// slot. That single check is what rules out duplicate picks, double taps
// (snake order gives the same team two picks in a row at every turn of the
// snake) and stale screens.
async function confirmPick() {
  const sel = state.selected;
  const game = state.gameData;
  if (!sel || !game || state.inflight) return;
  const turn = getCurrentTurn(game);
  if (!turn || !turn.isMine || (game.picks || []).length !== sel.seq) { clearSelection(); return; }

  const seq = sel.seq;
  const playerId = sel.playerId;
  state.selected = null;
  state.inflight = { playerId, playerName: playerName(game, playerId), teamId: turn.teamId, byId: state.clientId, seq };
  haptic(30);
  showConfetti('small');
  render();

  const ok = await mutate('הבחירה לא נשמרה', g => {
    if (g.status !== 'draft') throw new Error('הדראפט אינו פעיל');
    const picks = g.picks || [];
    if (picks.length !== seq) {
      // A retried commit finds its own pick already in place: done.
      const landed = picks[seq];
      if (landed && landed.playerId === playerId && landed.byId === state.clientId) return null;
      throw new Error('התור כבר עבר');
    }
    const t = turnFor(g);
    if (!t) throw new Error('לא ניתן לזהות את התור הנוכחי');
    if (!turnActorAllowed(g, t)) throw new Error('זה כבר לא התור שלך');
    if (draftedPlayerIds(g).has(playerId)) throw new Error('השחקן הזה כבר נבחר');
    if (!(g.players || []).some(p => p.id === playerId)) throw new Error('שחקן לא קיים');
    const pick = { playerId, playerName: playerName(g, playerId), teamId: t.teamId, byId: state.clientId, seq };
    const next = picks.concat([pick]);
    return {
      picks: next,
      pendingPick: null,
      lastPick: pick,
      turn: turnStateFor(g, next.length),
      status: next.length >= totalPicksNeeded(g) ? 'complete' : 'draft'
    };
  });

  if (!ok) {
    if (state.inflight && state.inflight.seq === seq) state.inflight = null;
    render();
    return;
  }
  // The snapshot carrying the pick normally clears `inflight` first. If the
  // acknowledgement beat it, give the listener a moment before letting go.
  setTimeout(() => {
    if (state.inflight && state.inflight.seq === seq) { state.inflight = null; render(); }
  }, 6000);
}

// Undo is a pop: rosters, availability and the turn are all derived from
// `picks`, so there is no separate bookkeeping that can drift.
async function undoPick() {
  await mutate('שגיאה בביטול בחירה', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המארגן יכול לבטל בחירה');
    const picks = (game.picks || []).slice();
    if (!picks.length) throw new Error('אין בחירות לבטל');
    picks.pop();
    return {
      picks,
      pendingPick: null,
      lastPick: picks.length ? picks[picks.length - 1] : null,
      turn: turnStateFor(game, picks.length),
      status: 'draft'
    };
  });
}

// The organizer's "do the picks again": captains and teams stay, the picks go.
// Behind its own confirm sheet (`confirmReset`), because it touches everyone.
async function resetDraft() {
  const ok = await mutate('שגיאה באיפוס', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המארגן יכול לאפס');
    if (!(game.teams || []).length) throw new Error('אין קבוצות לאפס');
    // Participants and their team claims are kept on purpose — wiping them
    // used to force every captain to rejoin and re-claim.
    return {
      status: 'lobby',
      picks: [],
      pendingPick: null,
      lastPick: null,
      turn: { order: [], index: 0, direction: 1 }
    };
  });
  if (ok) {
    state.confirmReset = '';
    showNotice('הדראפט אופס — חוזרים לאולם ההמתנה');
  }
}

// The deeper reset: the evening starts over from the player list itself, on the
// same link, so nobody has to be sent a new one. One write does the whole
// thing — new roster, no teams, no picks, back at captain selection — which is
// also exactly the shape the security rules require before they let `players`
// change at all.
async function restartWithRoster() {
  const parsed = parseRoster(state.input);
  if (parsed.errors.length) { showError(parsed.errors[0]); return; }
  const players = parsed.names.map((name, index) => ({ id: 'p' + index, name }));

  const ok = await mutate('שגיאה באיפוס', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המארגן יכול לאפס');
    return {
      players,
      status: 'captains',
      teams: [],
      // Every seat claim must go: the new teams get the same ids (t0..t2), and
      // a stale claim would silently hand somebody a team they never picked.
      // Captains simply tap their team again once the new teams exist.
      participants: [],
      picks: [],
      turn: { order: [], index: 0, direction: 1 },
      pendingPick: null,
      lastPick: null
    };
  });
  if (!ok) return;

  state.rosterEdit = false;
  state.confirmReset = '';
  state.input = '';
  state.captains = [];
  state.teamAssignments = {};
  localStorage.removeItem('d21_caps');
  localStorage.removeItem('d21_assign');
  // The snapshot that lands mid-write repaints while the editor is still up, so
  // leaving it is not enough to leave the screen — paint again once it is.
  render();
  showNotice('מתחילים מחדש — בחר קפטנים מהרשימה החדשה');
}

// Leaves on this phone only — the game itself is untouched and the link
// brings you straight back, so it needs no "are you sure".
function fullReset() {
  leaveGame();
  render();
}

/* ------------------------------------------------------------------ */
/* Turn authority (used inside transactions)                           */
/* ------------------------------------------------------------------ */

function turnFor(game) {
  const order = (game.turn && game.turn.order) || [];
  if (!order.length) return null;
  if ((game.picks || []).length >= totalPicksNeeded(game)) return null;
  const snake = !game.settings || game.settings.snake !== false;
  const pos = snakePosition((game.picks || []).length, order.length, snake);
  if (!pos) return null;
  const teamId = order[pos.index];
  if (!teamById(game, teamId)) return null;
  return { teamId, index: pos.index, direction: pos.direction };
}

function turnActorAllowed(game, turn) {
  const holder = (game.participants || []).find(p => p.teamId === turn.teamId);
  if (holder) return holder.id === state.clientId;
  return game.hostId === state.clientId;
}

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// Team order and the players inside each team are deliberately shuffled so
// nobody can work out who was picked first or last.
function buildWhatsAppText(game) {
  const colorEmojis = { Red: '🔴', White: '⚪', Black: '⚫' };
  let text = '⚽ *Draft21 - תוצאות הדראפט* ⚽\n\n';
  shuffle((game.teams || []).slice()).forEach(team => {
    const captain = playerName(game, team.captainId);
    text += (colorEmojis[team.color] || '⚽') + ' *' + colorHe(team.color) + '* (קפטן: ' + captain + '):\n';
    const others = shuffle(teamRoster(game, team.id)
      .filter(id => id !== team.captainId)
      .map(id => playerName(game, id)));
    others.forEach(name => { text += '• ' + name + '\n'; });
    text += '\n';
  });
  return text;
}

function copyText(text, onDone) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onDone, () => fallbackCopy(text, onDone));
  } else {
    fallbackCopy(text, onDone);
  }
}

function fallbackCopy(text, onDone) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    onDone();
  } catch (e) {
    showError('לא ניתן להעתיק במכשיר הזה');
  }
}

// Two celebration weights. A pick is a small, fast pop that must never get
// in the way of the next captain; the finished draft earns the full shower.
function showConfetti(intensity) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const big = intensity === 'big';
  const emojis = big ? ['🎉','🎊','⚽','🏆','⭐','✨'] : ['⚽','✨','⭐'];
  const count = big ? 46 : 12;
  const spread = big ? 60 : 26;
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const particle = document.createElement('div');
      particle.className = 'confetti';
      particle.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      particle.style.insetInlineStart = Math.random()*100+'%';
      particle.style.animationDuration = (1.8 + Math.random()*1.2) + 's';
      particle.style.fontSize = (big ? 18 + Math.random()*14 : 14 + Math.random()*8) + 'px';
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 3200);
    }, i*spread);
  }
}

/* ------------------------------------------------------------------ */
/* Render                                                             */
/* ------------------------------------------------------------------ */

// A realtime snapshot can land while someone is typing. Capture what the user
// is doing, replace the DOM, then put it back.
function render() {
  const active = document.activeElement;
  const focusId = active && active.id ? active.id : null;
  const caret = active && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  const scrollY = window.scrollY;

  if (state.gameData) pruneCaptainDraft(state.gameData);
  // Draw the optimistic view: a confirmed pick still in flight shows as made.
  const game = viewOf(state.gameData);

  // Work out what changed since the last paint *before* building the markup,
  // so the animation classes can be baked straight into the HTML instead of
  // being chased down afterwards.
  const anim = diffForAnimation(game);

  let html = '';
  // Editing the roster of a game that exists outranks its phase: the draft on
  // screen is exactly what this screen is about to replace.
  if (state.rosterEdit && game) html = renderImport(game, anim);
  else if (state.phase === 'captains' && game) html = renderCaptains(game);
  else if (state.phase === 'lobby' && game) html = renderLobby(game, anim);
  else if (state.phase === 'draft' && game) html = renderDraft(game, anim);
  else if (state.phase === 'complete' && game) html = renderComplete(game, anim);
  else if (state.gameId && !game && !state.loadError) html = renderConnecting();
  else html = renderHome();

  document.getElementById('app').innerHTML = html;
  renderConnBar();

  if (focusId) {
    const next = document.getElementById(focusId);
    if (next) {
      next.focus();
      if (caret !== null && typeof next.setSelectionRange === 'function') {
        try { next.setSelectionRange(caret, caret); } catch (e) {}
      }
    }
  }
  if (scrollY) window.scrollTo(0, scrollY);

  afterRender(anim);
}

// Motion is reserved for state changes. Comparing against the previous paint
// is what keeps it that way: Firestore emits snapshots constantly, and an
// animation that replays on every one stops meaning anything.
function diffForAnimation(game) {
  const prev = state.uiPrev;
  const turn = game && state.phase === 'draft' ? getCurrentTurn(game) : null;
  const picks = game ? (game.picks || []).length : -1;
  const pending = state.selected ? state.selected.playerId : '';
  const next = {
    turnKey: turn ? turn.teamId + ':' + picks : '',
    picks,
    phase: state.phase,
    mine: !!(turn && turn.isMine),
    pending,
    hostMenu: !!state.hostMenu,
    confirmReset: state.confirmReset || ''
  };
  const anim = {
    turnChanged: !!next.turnKey && next.turnKey !== prev.turnKey && prev.phase === 'draft',
    pickLanded: picks > prev.picks && prev.picks >= 0 && prev.phase === 'draft',
    becameMine: next.mine && !prev.mine && next.turnKey !== prev.turnKey,
    justFinished: next.phase === 'complete' && prev.phase === 'draft',
    justStarted: next.phase === 'draft' && prev.phase === 'lobby',
    pendingOpened: !!pending && pending !== prev.pending,
    hostMenuOpened: next.hostMenu && !prev.hostMenu,
    confirmResetOpened: !!next.confirmReset && next.confirmReset !== prev.confirmReset
  };
  state.uiPrev = next;
  return anim;
}

function afterRender(anim) {
  if (anim.becameMine) {
    haptic([26, 70, 26]);
    announce('התור שלך לבחור');
  } else if (anim.turnChanged) {
    announce('התור עבר');
  }
  if (anim.justFinished) {
    showConfetti('big');
    haptic([40, 60, 40, 60, 90]);
  }
}

/* ------------------------------------------------------------------ */
/* Shared shell pieces                                                 */
/* ------------------------------------------------------------------ */

// Every screen answers "who am I" in the same place, at the same size — and
// during the draft a captain's chip is also how they change team.
function meChip(game) {
  if (!game) return '';
  const host = isHost(game);
  const teamId = myTeamId(game);
  const team = teamId ? teamById(game, teamId) : null;
  let mark, name, role = '', cls = 'me';
  if (team) {
    mark = renderTeamShirt(team.color, 'shirt--xs');
    name = playerName(game, team.captainId);
    role = 'קפטן ' + colorHe(team.color);
    cls += ' me--volt';
  } else if (host) {
    mark = '<span class="avatar">' + icon('crown', 13) + '</span>';
    name = 'מארגן';
  } else if (state.watching) {
    mark = '<span class="avatar">' + icon('eye', 13) + '</span>';
    name = 'צופה';
  } else {
    return '';
  }
  // During the live game a captain or watcher can tap who they are to change
  // team; the organizer's chip is just a label.
  const live = !host && (state.phase === 'lobby' || state.phase === 'draft');
  const tag = live ? 'button' : 'span';
  return '<' + tag + ' class="' + cls + '" data-me data-team="' + escapeHtml(team ? team.color : '') + '"' +
    (live ? ' onclick="handleChooseRole()" aria-label="' + escapeHtml('אתה: ' + name + '. לחץ להחלפת קבוצה') + '"' : '') + '>' +
    mark +
    '<span class="stack">' +
      '<span class="me__name">' + escapeHtml(name) + '</span>' +
      (role ? '<span class="me__role">' + escapeHtml(role) + '</span>' : '') +
    '</span></' + tag + '>';
}

function appBar(game, opts) {
  const o = opts || {};
  return '<header class="appbar"><div class="wrap' + (o.wide ? ' wrap--wide' : '') + '"><div class="appbar__in">' +
    (o.back
      ? '<button class="btn btn--quiet btn--icon" onclick="' + o.back + '" aria-label="חזרה">' + icon('fwd', 20) + '</button>'
      : '<span class="brand"><span class="brand__mark">21</span><span class="brand__name">Draft21</span></span>') +
    (o.title ? '<span class="t-h2 grow">' + escapeHtml(o.title) + '</span>' : '<span class="grow"></span>') +
    (o.trailing || meChip(game)) +
    '</div></div></header>';
}

/* -- Sharing the link ---------------------------------------------- */

// The whole invitation is one link. The hash carries the game, so it works on
// any static host with no server routing, survives a refresh, and opens the
// right draft from a WhatsApp message. Nobody ever sees or types a code.
function inviteUrl() {
  return window.location.origin + window.location.pathname + '#' + (state.gameId || '');
}

function inviteText() {
  return '⚽ Draft21 — הדראפט מוכן!\nקפטנים: לחצו על הקישור ובחרו את הקבוצה שלכם.\n' + inviteUrl();
}

// A plain link rather than window.open(): in-app browsers (WhatsApp's own
// included) block scripted pop-ups but always follow a real tap on a link.
function waLink(text, label, cls, attrs) {
  return '<a class="' + cls + '" href="https://wa.me/?text=' + encodeURIComponent(text) + '" target="_blank" rel="noopener"' + (attrs || '') + '>' +
    icon('share', 18) + '<span>' + label + '</span></a>';
}

// The organizer's lobby leads with this: one link, sent once.
function inviteBlock() {
  return '<div class="card card--volt stack-12" data-invite>' +
    '<div class="stack-4">' +
      '<div class="t-h2">שלח את הקישור לקבוצה</div>' +
      '<div class="t-meta">כל קפטן לוחץ על הקישור ובוחר את הקבוצה שלו. זהו.</div>' +
    '</div>' +
    '<div class="row" style="gap:8px">' +
      waLink(inviteText(), 'שלח בוואטסאפ', 'btn btn--good btn--lg grow', ' data-share-invite') +
      '<button class="btn btn--ghost btn--lg" data-copy-btn onclick="handleCopyLink()" aria-label="העתק קישור">' + icon('link', 18) + '<span>העתק</span></button>' +
    '</div>' +
    '</div>';
}

/* -- "באיזו קבוצה אתה?" ------------------------------------------- */

// Asked of everyone who opens the link and is neither the organizer nor a
// captain yet — above the live board, not instead of it, so the fifteen
// people who are just curious see the draft straight away and the three who
// matter are one tap from their seat.
function asksTeam(game) {
  if (!game || isHost(game) || (state.phase !== 'lobby' && state.phase !== 'draft')) return false;
  if (state.choosingRole) return true;
  return !myTeamId(game) && !state.watching;
}

function teamQuestion(game) {
  const switching = state.choosingRole && !!myTeamId(game);
  let html = '<section class="ask stack-12" data-team-question>' +
    '<div class="stack-4">' +
      '<div class="t-h1">' + (switching ? 'לאיזו קבוצה לעבור?' : 'באיזו קבוצה אתה?') + '</div>' +
      '<div class="t-meta">קפטנים — לחיצה אחת ואתם בפנים. הטלפון יזכור אתכם.</div>' +
    '</div>' +
    '<div class="stack-8">';
  teamsByKit(game).forEach(team => { html += joinCard(game, team); });
  html += '</div>' +
    '<div class="t-center">' +
      (switching
        ? '<button onclick="handleCloseRolePicker()" class="linkish">ביטול</button>'
        : '<button data-watch onclick="handleWatchOnly()" class="linkish">אני לא קפטן — רק צופה</button>') +
    '</div>' +
    '</section>';
  return html;
}

// One big card per team. Free: tap to take it. Taken: says so, with the
// one-tap "it's me" for a captain who switched phones or lost their browser.
function joinCard(game, team) {
  const holder = claimantOf(game, team.id);
  const mine = !!holder && holder.id === state.clientId;
  const taken = !!holder && !mine;
  const id = escapeHtml(team.id);
  const tag = taken ? 'div' : 'button';
  const click = taken ? '' : (mine ? ' onclick="handleCloseRolePicker()"' : ' onclick="handleClaimRole(\'' + id + '\')"');
  return '<' + tag + ' class="slot role' + (mine ? ' slot--mine' : (taken ? ' role--taken' : ' slot--open')) + '" data-team="' + escapeHtml(team.color) + '" data-join="' + escapeHtml(team.color) + '"' + click + '>' +
    renderTeamShirt(team.color, 'shirt--lg') +
    '<span class="slot__body">' +
      '<span class="role__kicker team-name">' + escapeHtml(colorHe(team.color)) + '</span>' +
      '<span class="role__name">' + escapeHtml(playerName(game, team.captainId)) + '</span>' +
      (taken
        ? '<span class="slot__sub">הקפטן כבר מחובר בטלפון אחר</span>' +
          '<button class="role__takeover" data-reclaim="' + escapeHtml(team.color) + '" onclick="handleTakeoverRole(\'' + id + '\')">' +
            icon('refresh', 14) + 'זה אני — המשך כאן</button>'
        : '') +
    '</span>' +
    '<span class="slot__cta">' +
      (mine ? '<span class="chip chip--volt">' + icon('check', 12) + 'זה אתה</span>'
        : taken ? '<span class="chip">תפוס</span>'
        : '<span class="chip chip--volt">זה אני</span>') +
    '</span>' +
    '</' + tag + '>';
}

function emptyLine(text) {
  return '<div class="roster__empty">' + escapeHtml(text) + '</div>';
}

/* ------------------------------------------------------------------ */
/* Connecting                                                          */
/* ------------------------------------------------------------------ */

// Shown while the first snapshot is still on its way — including a cold start
// with no reception, where the shell loads from cache but the game cannot.
// A skeleton rather than a spinner: it shows the shape of what is coming.
function renderConnecting() {
  const offline = state.offlineBanner;
  return '<div class="scr" style="--glow:rgba(216,255,62,.12)">' +
    appBar(null) +
    '<div class="wrap page">' +
    (offline
      ? '<div class="card stack-16 t-center" data-connecting-offline>' +
          '<div class="t-display">אין חיבור</div>' +
          '<p class="t-body t-dim t-balance">האפליקציה נטענה מהזיכרון, אבל אי אפשר למשוך את הדראפט כרגע. ברגע שהחיבור יחזור הכול יסתנכרן לבד.</p>' +
          '<button onclick="handleReconnect()" class="btn btn--volt btn--block">' + icon('refresh', 18) + 'נסה שוב</button>' +
          '<button onclick="handleFullReset()" class="linkish">חזרה למסך הבית</button>' +
        '</div>'
      : '<div class="stack-12" data-connecting>' +
          '<div class="row" style="gap:8px"><span class="livedot t-volt"></span><span class="t-meta">מתחבר לדראפט…</span></div>' +
          '<div class="skeleton" style="height:132px;border-radius:22px"></div>' +
          '<div class="skeleton" style="height:58px"></div>' +
          '<div class="skeleton" style="height:58px"></div>' +
          '<div class="skeleton" style="height:58px"></div>' +
          '<div class="t-center" style="margin-block-start:8px"><button onclick="handleFullReset()" class="linkish">חזרה למסך הבית</button></div>' +
        '</div>') +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

// Home is for the organizer only: everyone else arrives by the shared link,
// which opens the draft itself. So there is one decision here — start a draft
// — and pasting the roster is its own step behind it.
function renderHome() {
  if (state.homeView === 'create') return renderImport();

  let html = '<div class="scr" style="--glow:rgba(216,255,62,.20)">' +
    appBar(null) +
    '<div class="wrap page page--fill stack-24">';

  if (state.loadError) {
    html += '<div class="problem" data-load-error>' + icon('x', 18) + '<span>' + escapeHtml(state.loadError) + '</span></div>';
  }

  // The three kits are the app's colour language. Showing them before the
  // first tap teaches it, and gives the home screen something alive on it.
  html += '<div class="stack-16 t-center anim-rise" style="margin-block-start:auto">' +
      '<div class="kits">' +
        TEAM_COLORS.map((c, i) => '<span class="kits__item anim-rise anim-rise-' + (i + 1) + '">' +
          renderTeamShirt(c, 'shirt--xl') + '</span>').join('') +
      '</div>' +
      '<div class="t-display">Draft21<br>FC Yarkon</div>' +
      '<p class="t-body t-dim t-balance">הדבק את הרשימה, בחר שלושה קפטנים ושלח קישור אחד לקבוצה. כל השאר קורה בזמן אמת.</p>' +
    '</div>' +

    '<div class="stack-12">' +
      '<button data-new-draft onclick="handleGoCreate()" class="btn btn--volt btn--lg btn--block anim-rise anim-rise-1">' + icon('plus', 20) + 'דראפט חדש</button>' +
    '</div>';

  if (state.lastCompleteGame) {
    html += '<button data-last-game onclick="handleOpenLastGame()" class="card row anim-rise anim-rise-3" style="width:100%;text-align:start">' +
      '<span class="trophy" style="width:40px;height:40px;border-radius:13px;font-size:20px">🏆</span>' +
      '<span class="grow"><span class="t-lg" style="display:block">הדראפט הקודם</span><span class="t-meta">הקבוצות עדיין שמורות — לחץ להצגה</span></span>' +
      icon('back', 18) + '</button>';
  }

  html += '<p class="t-micro t-center" style="margin-block-start:auto;padding-block-start:24px">DRAFT21 · נוצר על ידי Alon Iter</p>' +
    '</div></div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Import players                                                      */
/* ------------------------------------------------------------------ */

// Validation used to arrive as a red toast after you pressed the button.
// Now the roster is parsed on every keystroke: you see the count, the names
// the app actually understood, and any duplicate highlighted in place —
// before committing anything.
// `game` is passed only on the restart path — the same screen, but it replaces
// the roster of a game that already exists instead of creating a new one.
// "6 בכל קבוצה" — what a roster of this size means for the evening: every
// player, captains included, ends up on one of three equal teams.
function teamSizeLabel(count) {
  return (count / 3) + ' בכל קבוצה';
}

function renderImport(game, anim) {
  const restart = !!game;
  const parsed = parseRoster(state.input);
  const names = parsed.names;
  const count = names.length;
  const ready = count >= MIN_PLAYERS && count <= MAX_PLAYERS && !parsed.errors.length;
  const waitingLabel = count > MAX_PLAYERS ? 'יותר מדי שמות'
    : (count >= MIN_PLAYERS ? 'צריך מספר שמתחלק ב־3' : 'הוסף עוד שמות כדי להמשיך');

  const dupes = new Set();
  const seen = new Map();
  names.forEach(n => {
    const key = normalizeName(n);
    if (seen.has(key)) { dupes.add(key); } else { seen.set(key, n); }
  });

  let html = '<div class="scr" style="--glow:rgba(216,255,62,.14);--dock-h:96px">' +
    appBar(restart ? game : null, {
      back: restart ? 'handleCancelRosterRestart()' : 'handleGoHome()',
      title: restart ? 'רשימה חדשה' : 'רשימת השחקנים'
    }) +
    '<div class="wrap page stack-16">' +

    (restart
      ? '<div class="problem problem--warn" data-restart-notice>' + icon('refresh', 18) +
        '<span>עריכת הרשימה מאפסת את הדראפט מההתחלה. עד שתאשר, שום דבר לא נמחק — הדראפט הנוכחי ממשיך כרגיל אצל כולם.</span></div>'
      : '') +

    '<div class="row row--between">' +
      '<span class="tally' + (count > MAX_PLAYERS ? ' t-bad' : (ready ? ' t-volt' : '')) + '" data-tally>' +
        '<span class="tally__n num">' + count + '</span><span class="tally__d">' + (ready ? 'שחקנים · ' + teamSizeLabel(count) : 'שחקנים') + '</span>' +
      '</span>' +
      '<span class="t-meta"><span class="num">' + MIN_PLAYERS + '–' + MAX_PLAYERS + '</span> · שורה לכל שם</span>' +
    '</div>' +

    '<textarea id="playerInput" oninput="handlePlayerInput(this.value)" class="field field--area" ' +
      'placeholder="אלון&#10;יוסי&#10;דני&#10;…" spellcheck="false">' + escapeHtml(state.input) + '</textarea>';

  if (count) {
    html += '<div class="stack-8">' +
      '<div class="sect-title"><span class="t-micro">מה שזוהה</span></div>' +
      '<div class="preview">';
    names.forEach(n => {
      const dupe = dupes.has(normalizeName(n));
      html += '<span class="preview__name' + (dupe ? ' preview__name--dupe' : '') + '" data-preview-name>' + escapeHtml(n) + '</span>';
    });
    html += '</div></div>';
  }

  parsed.errors.forEach(err => {
    html += '<div class="problem" data-import-problem>' + icon('x', 18) + '<span>' + escapeHtml(err) + '</span></div>';
  });

  if (!count) {
    html += '<div class="problem problem--warn">' + icon('bolt', 18) +
      '<span>אפשר להדביק ישר מוואטסאפ — מספור, מקפים ובולטים בתחילת שורה מוסרים אוטומטית.</span></div>';
  }

  html += '</div>' +
    '<div class="dock"><div class="dock__in">' +
      (restart
        ? '<button data-restart-submit onclick="handleAskRosterRestart()" ' + (ready ? '' : 'disabled') + ' class="btn btn--danger btn--lg btn--block">' +
            (ready ? '<span>אפס והתחל עם <span class="num">' + count + '</span> שחקנים</span>' + icon('refresh', 20) : waitingLabel) +
          '</button>'
        : '<button data-create-game onclick="handleInitGame()" ' + (ready ? '' : 'disabled') + ' class="btn btn--volt btn--lg btn--block">' +
            (ready ? '<span>המשך עם <span class="num">' + count + '</span> שחקנים</span>' + icon('back', 20) : waitingLabel) +
          '</button>') +
    '</div></div>' +
    (restart ? resetConfirmSheet(game, anim) : '') +
    '</div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Captain selection                                                   */
/* ------------------------------------------------------------------ */

// The organizer's whole setup on one screen: tap three names, check who got
// which kit, share. Kits follow tap order — red, white, black — and red picks
// first, so the review rows are also the pick order.
function renderCaptains(game) {
  if (!isHost(game)) return renderWaitingForHost(game);

  const picked = state.captains.length;
  const assignedCount = state.captains.filter(id => TEAM_COLORS.indexOf(state.teamAssignments[id]) > -1).length;
  const ready = picked === 3 && assignedCount === 3;
  const kitOf = id => state.teamAssignments[id] || '';

  let html = '<div class="scr" style="--glow:rgba(255,197,61,.20);--dock-h:96px">' +
    appBar(game, { title: 'הכנת הדראפט' }) +
    '<div class="wrap page stack-24">' +

    '<div class="stack-8">' +
      '<div class="t-h1">👑 מי הקפטנים?</div>' +
      '<p class="t-body t-dim">לחץ על שלושה שמות: הראשון אדום, השני לבן, השלישי שחור.</p>' +
    '</div>' +

    '<div class="stack-12">' +
      '<div class="sect-title"><span class="t-micro">השחקנים</span><span class="t-micro num">' + picked + '/3</span></div>' +
      '<div class="namegrid">';
  game.players.forEach(player => {
    const selected = state.captains.includes(player.id);
    html += '<button data-player-id="' + escapeHtml(player.id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" onclick="handleToggleCaptain(\'' + escapeHtml(player.id) + '\')" class="namebtn' + (selected ? ' namebtn--on' : '') + '"' + (selected ? ' data-team="' + escapeHtml(kitOf(player.id)) + '"' : '') + '>' +
      (selected ? renderTeamShirt(kitOf(player.id), 'shirt--xs') : '') + '<span>' + escapeHtml(player.name) + '</span></button>';
  });
  html += '</div></div>';

  if (picked === 3) {
    // Review: one row per captain, in pick order, with the three kits beside
    // the name. Tapping another kit swaps the two captains.
    const rows = state.captains.slice().sort((a, b) => TEAM_COLORS.indexOf(kitOf(a)) - TEAM_COLORS.indexOf(kitOf(b)));
    html += '<div class="stack-12 anim-rise" data-review>' +
      '<div class="sect-title"><span class="t-micro">בדיקה אחרונה — אדום בוחר ראשון</span>' +
        '<button onclick="handleRandomizeColors()" class="btn btn--xs btn--ghost">' + icon('shuffle', 13) + 'ערבב</button>' +
      '</div>' +
      '<div class="stack-8">';
    rows.forEach(captainId => {
      const captain = game.players.find(p => p.id === captainId);
      if (!captain) return;
      html += '<div class="assign" data-team="' + escapeHtml(kitOf(captainId)) + '" data-assign="' + escapeHtml(captain.name) + '">' +
        '<span class="assign__name">' + icon('crown', 14) + '<span>' + escapeHtml(captain.name) + '</span></span>' +
        '<span class="assign__team team-name">' + escapeHtml(colorHe(kitOf(captainId))) + '</span>' +
        '<span class="assign__kits">';
      TEAM_COLORS.forEach(color => {
        const on = kitOf(captainId) === color;
        html += '<button data-color-btn="' + escapeHtml(captainId + ':' + color) + '" data-team="' + color + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="' + escapeHtml(captain.name + ' — ' + colorHe(color)) + '" onclick="handleAssignTeamColor(\'' + escapeHtml(captainId) + '\',\'' + color + '\')" class="kitbtn' + (on ? ' kitbtn--on' : '') + '">' +
          renderTeamShirt(color, 'shirt--sm') + '</button>';
      });
      html += '</span></div>';
    });
    html += '</div></div>';
  }

  html += '</div>' +
    '<div class="dock"><div class="dock__in">' +
      '<button data-finalize onclick="handleFinalizeCaptains()" ' + (ready ? '' : 'disabled') + ' class="btn btn--volt btn--lg btn--block">' +
        (picked < 3
          ? 'בחר עוד ' + (3 - picked) + (3 - picked === 1 ? ' קפטן' : ' קפטנים')
          : (assignedCount < 3 ? 'תן צבע לכל קפטן' : '<span>מוכן — שתף את הדראפט</span>' + icon('back', 20))) +
      '</button>' +
    '</div></div>' +
    '</div>';
  return html;
}

// Anyone who opens the link during the organizer's minute of setup.
function renderWaitingForHost(game) {
  return '<div class="scr" style="--glow:rgba(255,197,61,.16)">' +
    appBar(game) +
    '<div class="wrap page stack-16">' +
      '<div class="card stack-12 t-center">' +
        '<div class="row center" style="gap:8px"><span class="livedot t-volt"></span><span class="t-micro">מחובר</span></div>' +
        '<div class="t-h1">עוד רגע מתחילים</div>' +
        '<p class="t-body t-dim t-balance" data-waiting-host>המארגן בוחר עכשיו את שלושת הקפטנים. המסך יתעדכן לבד — אין צורך לרענן.</p>' +
        '<div class="stack-8">' +
          '<div class="skeleton" style="height:54px"></div>' +
          '<div class="skeleton" style="height:54px"></div>' +
          '<div class="skeleton" style="height:54px"></div>' +
        '</div>' +
      '</div>' +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */

// A team seat as a status line: kit, captain, and whether the captain's
// phone has joined. What the organizer watches fill up before starting.
function seatRow(game, team) {
  const claimant = claimantOf(game, team.id);
  const mine = !!claimant && claimant.id === state.clientId;
  return '<div class="slot slot--compact' + (mine ? ' slot--mine' : '') + '" data-team="' + escapeHtml(team.color) + '" data-seat="' + escapeHtml(team.color) + '" data-seat-state="' + (claimant ? 'taken' : 'free') + '">' +
    renderTeamShirt(team.color, 'shirt--sm') +
    '<span class="slot__body">' +
      '<span class="slot__title">קפטן ' + escapeHtml(colorHe(team.color)) + '</span>' +
      '<span class="slot__sub"><span class="captain-line">' + icon('crown', 13) + escapeHtml(playerName(game, team.captainId)) + '</span></span>' +
    '</span>' +
    '<span class="slot__cta">' +
      (mine ? '<span class="chip chip--volt">' + icon('check', 12) + 'אתה</span>'
        : claimant ? '<span class="chip chip--good">' + icon('check', 12) + 'מחובר</span>'
        : '<span class="chip chip--warn">ממתין</span>') +
    '</span>' +
    '</div>';
}

// The players still to be drafted, as a quiet list — before the draft starts
// it shows who is in tonight; the live pool takes over once it begins.
function playersPreview(game) {
  const pool = availablePlayers(game);
  return '<div class="stack-8">' +
    '<div class="sect-title"><span class="t-micro">השחקנים בדראפט</span><span class="t-micro num">' + pool.length + '</span></div>' +
    '<div class="preview preview--open">' +
      pool.map(p => '<span class="preview__name">' + escapeHtml(p.name) + '</span>').join('') +
    '</div></div>';
}

function renderLobby(game, anim) {
  const teams = teamsByKit(game);
  const claimed = teams.filter(t => claimantOf(game, t.id));
  const missing = teams.filter(t => !claimantOf(game, t.id));
  const host = isHost(game);
  const myTeam = myTeamId(game) ? teamById(game, myTeamId(game)) : null;
  const asking = asksTeam(game);

  let headline, sub = '';
  if (host) {
    headline = missing.length ? '<span class="num">' + claimed.length + '</span> מתוך <span class="num">3</span> קפטנים מחוברים' : 'כל הקפטנים מחוברים';
  } else if (myTeam) {
    headline = 'אתה הקפטן של ' + escapeHtml(colorHe(myTeam.color));
    sub = 'כשהמארגן יתחיל, התור שלך יידלק כאן. אין צורך לרענן.';
  } else {
    // The dock already says "waiting for the organizer"; no need to repeat it.
    headline = 'הדראפט עוד לא התחיל';
  }

  let html = '<div class="scr" style="--glow:rgba(90,150,255,.20);--dock-h:' + (host ? (missing.length ? '124px' : '96px') : '76px') + '">' +
    appBar(game, { title: 'לפני הפתיחה' }) +
    '<div class="wrap page stack-24">' +
    (asking ? teamQuestion(game) : '') +

    '<div class="stack-8">' +
      '<div class="row" style="gap:8px"><span class="livedot t-good"></span><span class="t-micro">בשידור חי</span></div>' +
      '<div class="t-h1" data-lobby-count>' + headline + '</div>' +
      (sub ? '<p class="t-body t-dim">' + sub + '</p>' : '') +
    '</div>' +

    (host ? inviteBlock() : '') +

    '<div class="stack-8">' +
      '<div class="sect-title"><span class="t-micro">הקפטנים</span><span class="t-micro">אדום בוחר ראשון</span></div>';
  teams.forEach(team => { html += seatRow(game, team); });
  html += '</div>' +
    playersPreview(game) +
    '<div class="t-center"><button onclick="handleOpenHostMenu()" class="linkish">' + escapeHtml(toolsMenuLabel(game)) + '</button></div>' +
    '</div>';

  if (host) {
    const names = missing.map(t => colorHe(t.color)).join(', ');
    html += '<div class="dock"><div class="dock__in stack-8">' +
      '<button data-start-draft onclick="handleStartDraft()" ' + (missing.length ? 'disabled' : '') + ' class="btn btn--volt btn--lg btn--block">' +
        (missing.length
          ? 'ממתין ל' + (missing.length === 1 ? 'קפטן אחד' : '־' + missing.length + ' קפטנים')
          : icon('bolt', 20) + 'התחל דראפט') +
      '</button>' +
      (missing.length
        ? '<button data-start-anyway onclick="handleStartDraftAnyway()" class="linkish" style="display:block;width:100%">להתחיל עכשיו — אני אבחר בשביל ' + escapeHtml(names) + '</button>'
        : '') +
      '</div></div>';
  } else {
    html += '<div class="dock"><div class="dock__in">' +
      '<div class="row center" style="gap:8px" data-waiting-start><span class="livedot t-good"></span><span class="t-meta">מחכים שהמארגן יתחיל</span></div>' +
      '</div></div>';
  }

  html += toolsSheets(game, anim) + '</div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Live draft — the centrepiece                                        */
/* ------------------------------------------------------------------ */

// Everything above the fold answers the four questions a draft screen has to
// answer at all times: whose turn, who am I, how far in are we, what next.
function draftHud(game, turn, anim) {
  const total = totalPicksNeeded(game);
  const made = (game.picks || []).length;
  const pct = total ? Math.round((made / total) * 100) : 0;
  const mine = !!(turn && turn.isMine);
  const animCls = (anim.becameMine ? ' anim-flash' : '') + (anim.turnChanged ? ' anim-turn' : '');

  if (!turn) {
    return '<div class="hud' + animCls + '" data-turn-banner data-turn-color=""><div class="hud__top"><div class="hud__who">' +
      '<div class="hud__eyebrow">הדראפט</div><div class="hud__name">' + (made >= total ? 'סוגר את הקבוצות…' : 'מסתנכרן…') + '</div></div></div></div>';
  }

  const eyebrow = mine
    ? '<span class="livedot"></span>התור שלך'
    : '<span class="livedot t-good"></span>על השעון';

  return '<div class="hud' + (mine ? ' hud--mine' : '') + animCls + '" data-turn-banner data-team="' + escapeHtml(turn.team.color) + '" data-turn-color="' + escapeHtml(turn.team.color) + '" data-pick-no="' + (made + 1) + '" aria-live="polite">' +
    '<div class="hud__top">' +
      renderTeamShirt(turn.team.color, 'shirt--md') +
      '<div class="hud__who">' +
        '<div class="hud__eyebrow">' + eyebrow + '</div>' +
        '<div class="hud__name">' + escapeHtml(mine ? 'בחר שחקן' : turn.captainName) + '</div>' +
        '<div class="hud__sub"><span class="team-dot"></span> <span data-turn-team class="team-name">' + escapeHtml(colorHe(turn.team.color)) + '</span></div>' +
      '</div>' +
    '</div>' +
    (turn.unclaimed
      ? '<div class="chip chip--warn" style="margin-block-start:10px" data-unclaimed-turn>' + icon('bolt', 12) +
        (isHost(game) ? 'הקפטן לא בפנים — אתה בוחר בשבילם' : 'הקפטן לא בפנים — המארגן בוחר') + '</div>'
      : '') +
    '<div class="hud__meter">' +
      '<div class="hud__bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hud__legend">' +
        '<span>סבב <span class="num">' + turn.round + '</span></span>' +
        '<span class="num">' + made + ' / ' + total + ' בחירות</span>' +
      '</div>' +
    '</div>' +
    '</div>';
}

// One strip answering "what just happened" and "who is next". Anticipation is
// most of what makes a draft watchable by people who are not drafting, and it
// costs a single line.
function pulseBar(game, turn) {
  if (!turn) return '';
  const order = (game.turn && game.turn.order) || [];
  const snake = !game.settings || game.settings.snake !== false;
  const made = (game.picks || []).length;
  const total = totalPicksNeeded(game);
  const parts = [];

  const last = game.lastPick;
  if (last) {
    const lastTeam = teamById(game, last.teamId);
    parts.push('<span class="ticker__item" data-team="' + escapeHtml(lastTeam ? lastTeam.color : '') + '" data-last-pick>' +
      '<span class="t-micro">אחרון</span><span class="team-dot"></span>' +
      '<strong>' + escapeHtml(last.playerName || playerName(game, last.playerId)) + '</strong></span>');
  }

  const next = [];
  for (let i = 1; i <= 2 && made + i < total; i++) {
    const pos = snakePosition(made + i, order.length, snake);
    if (!pos) break;
    const team = teamById(game, order[pos.index]);
    if (!team) break;
    next.push('<span class="ticker__item" data-team="' + escapeHtml(team.color) + '"><span class="team-dot"></span>' +
      escapeHtml(playerName(game, team.captainId)) + '</span>');
  }
  if (next.length) {
    parts.push('<span class="ticker__item"><span class="t-micro">הבא</span>' +
      next.join('<span class="ticker__sep">›</span>') + '</span>');
  }
  if (!parts.length) return '';
  return '<div class="ticker" data-up-next>' + parts.join('<span class="ticker__sep">•</span>') + '</div>';
}

function pickFeed(game, anim, limit) {
  const all = (game.picks || []).slice().reverse();
  const picks = limit === 0 ? all : all.slice(0, limit || 5);
  if (!picks.length) return '';
  let html = '<div class="stack-8">' +
    '<div class="sect-title"><span class="t-micro">' + (limit === 0 ? 'לוח הבחירות' : 'בחירות אחרונות') + '</span>' +
    '<span class="t-micro num">' + all.length + '</span></div><div class="feed">';
  picks.forEach((pick, i) => {
    const team = teamById(game, pick.teamId);
    html += '<div class="feed__row' + (i === 0 && anim.pickLanded ? ' anim-land' : '') + (pick.saving ? ' is-saving' : '') + '" data-team="' + escapeHtml(team ? team.color : '') + '" data-feed-pick="' + escapeHtml(pick.playerId) + '"' + (pick.saving ? ' data-saving' : '') + '>' +
      '<span class="feed__pickno num">#' + (pick.seq + 1) + '</span>' +
      '<span class="feed__name">' + escapeHtml(pick.playerName || playerName(game, pick.playerId)) + '</span>' +
      '<span class="feed__team">' + (pick.saving ? 'שומר…' : escapeHtml(team ? colorHe(team.color) : '')) + '</span>' +
      '</div>';
  });
  html += '</div></div>';
  return html;
}

// Your own team first: it is the one you check between every pick, and
// scrolling past two other rosters to find it was the most repeated bit of
// friction in the old draft screen.
function orderedTeams(game) {
  const mine = myTeamId(game);
  const teams = (game.teams || []).slice();
  if (!mine) return teams;
  return teams.sort((a, b) => (b.id === mine ? 1 : 0) - (a.id === mine ? 1 : 0));
}

function teamPanel(game, team, opts) {
  const o = opts || {};
  const claimant = claimantOf(game, team.id);
  const mine = myTeamId(game) === team.id;
  const roster = teamRoster(game, team.id);
  const cls = 'teamcard' + (mine ? ' teamcard--mine' : '') + (o.isTurn ? ' teamcard--turn' : '');

  let html = '<div class="' + cls + '" data-team="' + escapeHtml(team.color) + '" data-team-card="' + escapeHtml(team.color) + '">' +
    '<div class="teamcard__head">' +
      renderTeamShirt(team.color, 'shirt--md') +
      '<div class="teamcard__titles">' +
        '<div class="row" style="gap:6px"><span class="t-h2 team-name">' + escapeHtml(colorHe(team.color)) + '</span>' +
          (mine ? '<span class="chip chip--volt">שלך</span>' : '') +
          (o.isTurn ? '<span class="chip chip--good"><span class="livedot"></span>בוחר</span>' : '') +
        '</div>' +
        '<div class="t-meta" data-claim-status="' + escapeHtml(team.color) + '">' +
          '<span class="captain-line">' + icon('crown', 12) + escapeHtml(playerName(game, team.captainId)) + '</span>' +
          (claimant || state.phase === 'complete' ? '' : ' <span class="t-faint">· המארגן בוחר</span>') + '</div>' +
      '</div>' +
      '<span class="teamcard__count num" data-team-count>' + roster.length + '</span>' +
    '</div>';

  if (o.showRoster !== false) {
    html += '<div class="roster">';
    const saving = state.inflight ? state.inflight.playerId : '';
    roster.forEach((id, i) => {
      const isCap = id === team.captainId;
      html += '<div class="roster__item' + (isCap ? ' roster__item--captain' : '') + (id === saving ? ' is-saving' : '') + '" data-roster-player="' + escapeHtml(id) + '">' +
        (isCap ? '<span style="color:#FFDC7A;display:flex">' + icon('crown', 14) + '</span>' : '<span class="roster__n num">' + i + '</span>') +
        '<span class="grow">' + escapeHtml(playerName(game, id)) + '</span>' +
        '</div>';
    });
    if (roster.length === 1) html += emptyLine('עוד אף אחד');
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderDraft(game, anim) {
  const turn = getCurrentTurn(game);
  const myTeam = myTeamId(game);
  const canPick = !!(turn && turn.isMine && !state.inflight);
  const sel = state.selected ? state.selected.playerId : '';

  let html = '<div class="scr" style="--glow:' + (turn && turn.isMine ? 'rgba(216,255,62,.24)' : 'rgba(30,180,120,.16)') + ';--dock-h:0px">' +
    appBar(game, { trailing: '<button class="btn btn--quiet btn--icon" onclick="handleOpenHostMenu()" aria-label="' + escapeHtml(toolsMenuLabel(game)) + '">' + icon('dots', 20) + '</button>' + meChip(game) }) +
    '<div class="wrap page stack-16">' +
    draftHud(game, turn, anim) +
    pulseBar(game, turn);

  // A captain arriving mid-draft (or on a new phone) answers the same one
  // question, right under the turn banner.
  if (asksTeam(game)) html += teamQuestion(game);

  const pool = availablePlayers(game);
  let poolHtml = '<div class="stack-8">' +
    '<div class="sect-title"><span class="t-micro">' + (canPick ? 'בחר את השחקן שלך' : 'עדיין על המדף') + '</span>' +
    '<span class="t-micro num" data-pool-count>' + pool.length + '</span></div>' +
    '<div class="pool">';
  pool.forEach(player => {
    const on = player.id === sel;
    poolHtml += '<button data-pick-player="' + escapeHtml(player.id) + '" data-pick-name="' + escapeHtml(player.name) + '" ' +
      'onclick="handleSelectPlayer(\'' + escapeHtml(player.id) + '\')" ' + (canPick ? '' : 'disabled') +
      ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
      ' class="pick' + (canPick ? ' pick--live' : '') + (on ? ' pick--sel' : '') + '">' + escapeHtml(player.name) + '</button>';
  });
  poolHtml += '</div>';
  if (!pool.length) poolHtml += '<div class="pool-empty">כל השחקנים חולקו</div>';
  poolHtml += '</div>';

  // A captain always gets the pool first — that is the thing they act on, and
  // the layout must not reshuffle every time their turn ends. Everyone else
  // has nothing to tap, so they get the board first instead.
  html += myTeam || isHost(game)
    ? poolHtml + pickFeed(game, anim)
    : pickFeed(game, anim, 0) + poolHtml;

  html += '<div class="stack-12">' +
    '<div class="sect-title"><span class="t-micro">הקבוצות</span></div>';
  orderedTeams(game).forEach(team => {
    html += teamPanel(game, team, { isTurn: !!(turn && turn.teamId === team.id) });
  });
  html += '</div>';

  html += '</div>';
  if (sel && canPick) html += selectionSheet(game, turn, anim);
  html += toolsSheets(game, anim) + '</div>';
  return html;
}

// The confirm step: a sheet pinned to the thumb, so drafting is two taps and
// no scrolling. It exists only on the picking phone — nothing is written
// until "אישור", so a captain who walks away mid-choice stalls nobody.
function selectionSheet(game, turn, anim) {
  const playerId = state.selected.playerId;
  const team = turn.team;
  const enter = anim && anim.pendingOpened ? ' sheet--in' : '';
  return '<div class="sheet__scrim' + (enter ? ' sheet__scrim--in' : '') + '" onclick="handleClearSelection()"></div>' +
    '<div class="sheet' + enter + '" data-pending role="dialog" aria-modal="true"><div class="sheet__in stack-16">' +
    '<div class="sheet__grip"></div>' +
    '<div class="stack-8 t-center" data-team="' + escapeHtml(team.color) + '">' +
      renderTeamShirt(team.color, 'shirt--md', true) +
      '<div class="t-micro">' + escapeHtml(turn.controlledByHost ? 'אתה בוחר בשביל ' + colorHe(team.color) : 'לקבוצה ' + colorHe(team.color)) + '</div>' +
      '<div class="sheet__name" data-pending-name>' + escapeHtml(playerName(game, playerId)) + '</div>' +
    '</div>' +
    '<div class="row" style="gap:10px">' +
      '<button data-confirm-pick onclick="handleConfirmPick()" class="btn btn--volt btn--lg grow">' + icon('check', 20) + 'בחר אותו</button>' +
      '<button data-cancel-pending onclick="handleClearSelection()" class="btn btn--ghost btn--lg" style="flex:0 0 34%">החלף</button>' +
    '</div>' +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* Tools + reset confirmation                                          */
/* ------------------------------------------------------------------ */

// The label everyone sees for the menu, and the wording of the reset itself:
// "a new draft" once the teams are closed, "wipe the picks" mid-draft.
function toolsMenuLabel(game) { return isHost(game) ? 'כלי מארגן' : 'אפשרויות'; }
function resetActionLabel() {
  return state.phase === 'complete' ? 'דראפט חדש עם אותם קפטנים' : 'אפס את כל הבחירות';
}

// Both sheets render from one call so every screen gets them together.
function toolsSheets(game, anim) {
  return toolsSheet(game, anim) + resetConfirmSheet(game, anim);
}

// Everything that is not the next action lives behind this sheet, one
// deliberate tap away from the live draft. The organizer gets the controls;
// everyone else gets "change team" and the way back in for a lost organizer.
function toolsSheet(game, anim) {
  if (!state.hostMenu) return '';
  const host = isHost(game);
  const live = state.phase === 'lobby' || state.phase === 'draft';
  const made = (game.picks || []).length;

  const enter = anim && anim.hostMenuOpened ? ' sheet--in' : '';
  let html = '<div class="sheet__scrim' + (enter ? ' sheet__scrim--in' : '') + '" onclick="handleCloseHostMenu()"></div>' +
    '<div class="sheet' + enter + '" data-host-menu role="dialog"><div class="sheet__in stack-12">' +
    '<div class="sheet__grip"></div>' +
    '<div class="row row--between"><span class="t-h2">' + escapeHtml(toolsMenuLabel(game)) + '</span>' +
      '<button class="btn btn--quiet btn--icon" onclick="handleCloseHostMenu()" aria-label="סגירה">' + icon('x', 18) + '</button></div>';

  if (host) {
    // The organizer's few controls. Undo and freeing a seat are surgical;
    // the two resets are loud and each has its own "are you sure?".
    if (state.phase === 'draft' && made > 0) {
      html += '<button data-undo onclick="handleUndoPick()" class="btn btn--ghost btn--block">' + icon('undo', 18) + 'בטל את הבחירה האחרונה</button>';
    }
    // A captain who is not coming: free the seat and the organizer picks for
    // that team. Not destructive — the captain can simply tap it again.
    if (live) {
      teamsByKit(game).filter(t => claimantOf(game, t.id)).forEach(t => {
        html += '<button class="btn btn--ghost btn--block" data-release="' + escapeHtml(t.color) + '" onclick="handleReleaseTeam(\'' + escapeHtml(t.id) + '\')" data-team="' + escapeHtml(t.color) + '">' +
          '<span class="team-dot"></span>פנה את ' + escapeHtml(colorHe(t.color)) + ' — אני אבחר בשבילם</button>';
      });
    }
    html += '<button data-reset onclick="handleAskResetDraft()" class="btn btn--danger btn--block">' + icon('refresh', 18) +
        resetActionLabel() + '</button>' +
      '<button data-restart-roster onclick="handleOpenRosterRestart()" class="btn btn--danger btn--block">' + icon('list', 18) +
        'התחל מאפס — רשימה חדשה</button>';
  } else {
    if (live) {
      html += '<button data-change-role onclick="handleChooseRole()" class="btn btn--ghost btn--block">' + icon('refresh', 18) +
        (myTeamId(game) ? 'החלף קבוצה' : 'אני קפטן — בחר קבוצה') + '</button>';
    }
    // The organizer's phone died or they opened the link somewhere else.
    // One tap, no code; it lives here, out of everyone else's way.
    html += '<button data-takeover-host onclick="handleTakeoverHost()" class="linkish">אני המארגן — המשך בטלפון הזה</button>';
  }
  html += '<button onclick="handleFullReset()" class="linkish">יציאה מהדראפט במכשיר הזה</button>' +
    '</div></div>';
  return html;
}

// A second, explicit tap that spells out exactly what disappears. Tapping the scrim cancels, so the
// dangerous button is never the easy way out of the sheet.
function resetConfirmSheet(game, anim) {
  if (!state.confirmReset) return '';
  const roster = state.confirmReset === 'roster';
  const made = (game.picks || []).length;
  const done = state.phase === 'complete';
  const newCount = roster ? parseRoster(state.input).names.length : 0;

  const kicker = roster ? 'התחלה מאפס — רשימה חדשה' : resetActionLabel();
  const headline = roster
    ? 'לאפס את הדראפט מההתחלה?'
    : (done ? 'להתחיל דראפט חדש?' : 'לאפס את הדראפט?');
  // What actually disappears, stated in full. A reset that anyone can trigger
  // has to say out loud how far back it goes.
  const body = roster
    ? 'הרשימה הנוכחית, הקפטנים, הקבוצות' + (made ? ' וכל <span class="num">' + made + '</span> הבחירות' : '') +
      ' יימחקו, והדראפט יתחיל מחדש עם <span class="num">' + newCount + '</span> השחקנים שהזנת.'
    : (made
        ? (done ? 'הקבוצות שנסגרו יימחקו' : '<span class="num">' + made + '</span> בחירות יימחקו') + ' וכולם חוזרים לאולם ההמתנה.'
        : 'כולם חוזרים לאולם ההמתנה.') + ' הקפטנים והקבוצות יישמרו.';
  const note = roster
    ? 'אותו קישור — אין צורך לשלוח חדש. הקפטנים פשוט בוחרים שוב את הקבוצה שלהם.'
    : 'האיפוס חל על כל המשתתפים, לא רק על המכשיר שלך.';

  const enter = anim && anim.confirmResetOpened ? ' sheet--in' : '';
  return '<div class="sheet__scrim' + (enter ? ' sheet__scrim--in' : '') + '" onclick="handleCancelResetDraft()"></div>' +
    '<div class="sheet' + enter + '" data-reset-confirm role="dialog" aria-modal="true"><div class="sheet__in stack-16">' +
    '<div class="sheet__grip"></div>' +
    '<div class="stack-8 t-center">' +
      '<div class="t-micro">' + escapeHtml(kicker) + '</div>' +
      '<div class="sheet__name">' + headline + '</div>' +
      '<p class="t-body t-dim t-balance">' + body + '</p>' +
      '<div class="t-micro t-dim">' + note + '</div>' +
    '</div>' +
    '<div class="row" style="gap:10px">' +
      '<button data-reset-confirm-yes onclick="handleConfirmResetDraft()" class="btn btn--danger btn--lg grow">' + icon('refresh', 20) +
        (roster ? 'כן, אפס מההתחלה' : 'כן, אפס') + '</button>' +
      '<button data-reset-confirm-no onclick="handleCancelResetDraft()" class="btn btn--ghost" style="flex:0 0 34%">' + icon('x', 18) + 'ביטול</button>' +
    '</div>' +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* Completed teams                                                     */
/* ------------------------------------------------------------------ */

function renderComplete(game, anim) {
  const host = isHost(game);
  // The results are the one screen people crowd around. On anything wider than
  // a phone the three teams sit side by side instead of stacking.
  let html = '<div class="scr" style="--glow:rgba(255,176,32,.24);--dock-h:150px">' +
    appBar(game, { title: 'התוצאות', wide: true }) +
    '<div class="wrap wrap--wide page stack-24">' +

    '<div class="stack-12 t-center anim-rise">' +
      '<div class="trophy">🏆</div>' +
      '<div class="t-display" data-complete>הקבוצות סגורות</div>' +
      '<p class="t-body t-dim t-balance">שלוש קבוצות, <span class="num">' + (game.players || []).length + '</span> שחקנים. בהצלחה הערב.</p>' +
    '</div>' +

    '<div class="final-grid">';
  teamsByKit(game).forEach((team, i) => {
    html += '<div class="anim-rise anim-rise-' + Math.min(3, i + 1) + '" data-final-team="' + escapeHtml(team.color) + '">' +
      teamPanel(game, team, { showRoster: true }) + '</div>';
  });
  html += '</div>';

  html += '<div class="t-center"><button onclick="handleOpenHostMenu()" class="linkish">' + escapeHtml(toolsMenuLabel(game)) + '</button></div>';

  // Publishing is the host's last job, so it is the host's one big button.
  // Everyone else can still forward the same text.
  html += '</div>' +
    '<div class="dock dock--wide"><div class="dock__in stack-8">' +
      waLink(buildWhatsAppText(game), host ? 'פרסם את הקבוצות בוואטסאפ' : 'שתף בוואטסאפ', 'btn btn--good btn--lg btn--block', ' data-share-wa') +
      '<button data-copy-teams onclick="handleCopyTeams()" class="btn btn--ghost btn--block">' + icon('copy', 18) + 'העתק כטקסט</button>' +
    '</div></div>' +
    toolsSheets(game, anim) +
    '</div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

// The import screen validates as you type, so every keystroke repaints.
// Everything else that only feeds a later submit still does not.
window.handlePlayerInput = v => { state.input = v; render(); };
window.handleGoHome = () => { state.homeView = 'home'; state.loadError = ''; render(); };
window.handleGoCreate = () => { state.homeView = 'create'; state.loadError = ''; render(); };
window.handleOpenHostMenu = () => { state.hostMenu = true; render(); };
window.handleCloseHostMenu = () => { state.hostMenu = false; render(); };
// Reset is two taps: the menu hands off to the confirm sheet, and only that
// sheet's own button actually writes.
window.handleAskResetDraft = () => { state.hostMenu = false; state.confirmReset = 'picks'; haptic(20); render(); };
window.handleCancelResetDraft = () => { state.confirmReset = ''; render(); };
window.handleConfirmResetDraft = () => {
  const mode = state.confirmReset;
  state.confirmReset = '';
  render();
  return mode === 'roster' ? restartWithRoster() : resetDraft();
};
// The from-scratch restart starts by editing the list, prefilled with the names
// already in the game: most weeks it is the same crowd with two or three swaps,
// and retyping twenty-one names to change one is not a restart anyone will use.
window.handleOpenRosterRestart = () => {
  const game = state.gameData;
  state.hostMenu = false;
  state.confirmReset = '';
  state.input = ((game && game.players) || []).map(p => p.name).join('\n');
  state.rosterEdit = true;
  haptic(20);
  render();
};
window.handleAskRosterRestart = () => { state.confirmReset = 'roster'; haptic(20); render(); };
window.handleCancelRosterRestart = () => { state.rosterEdit = false; state.confirmReset = ''; state.input = ''; render(); };
window.handleInitGame = initGame;
window.handleToggleCaptain = toggleCaptain;
window.handleRandomizeColors = randomizeColors;
window.handleAssignTeamColor = assignTeamColor;
window.handleFinalizeCaptains = finalizeCaptains;
window.handleClaimRole = id => claimRole(id, false);
window.handleTakeoverRole = id => claimRole(id, true);
window.handleTakeoverHost = takeoverHost;
window.handleWatchOnly = watchOnly;
window.handleChooseRole = () => { state.hostMenu = false; state.choosingRole = true; window.scrollTo(0, 0); render(); };
window.handleCloseRolePicker = () => { state.choosingRole = false; render(); };
window.handleReleaseTeam = id => { state.hostMenu = false; return releaseTeam(id); };
window.handleStartDraft = () => startDraft(false);
// No native confirm() here: WhatsApp's in-app browser can swallow it, which
// would leave the host unable to start. The link itself says what happens.
window.handleStartDraftAnyway = () => startDraft(true);
window.handleSelectPlayer = selectPlayer;
window.handleClearSelection = clearSelection;
window.handleConfirmPick = confirmPick;
window.handleUndoPick = () => { state.hostMenu = false; return undoPick(); };
// Kept as an alias so nothing can reach the write without the confirm step.
window.handleResetDraft = () => window.handleAskResetDraft();
window.handleFullReset = () => { state.hostMenu = false; fullReset(); };
window.handleCopyTeams = () => {
  if (!state.gameData) return;
  copyText(buildWhatsAppText(state.gameData), () => showSuccess('הטקסט הועתק'));
};
window.handleReconnect = reconnect;
window.handleOpenLastGame = () => {
  if (!state.lastCompleteGame) return;
  state.loadError = '';
  state.arrivedViaHash = true;
  state.firstSnapshot = true;
  setGameId(state.lastCompleteGame);
  subscribeToGame();
};
window.handleCopyLink = () => {
  copyText(inviteUrl(), () => {
    // Confirm on the button itself rather than in a toast: the feedback
    // belongs where the finger already is.
    const label = document.querySelector('[data-copy-btn] span');
    if (!label) { showSuccess('הקישור הועתק'); return; }
    const original = label.textContent;
    label.textContent = 'הועתק!';
    setTimeout(() => { label.textContent = original; }, 1800);
  });
};

init();
