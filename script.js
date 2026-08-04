// The Firebase SDK is vendored under vendor/ so the app shell has no runtime
// dependency on a CDN. See vendor/README.md before upgrading.
import { initializeApp } from './vendor/firebase-app.js';
import { getFirestore, initializeFirestore, doc, onSnapshot, setDoc, runTransaction } from './vendor/firebase-firestore.js';

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
  key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2.1"/><path d="M12 12h9m-3 0v3.5M21 12v3" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"/>'
};

function icon(name, size) {
  const body = ICONS[name];
  if (!body) return '';
  const s = size || 18;
  return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="currentColor" aria-hidden="true" focusable="false">' + body + '</svg>';
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0].charAt(0) + parts[1].charAt(0);
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
  phase: 'setup', input: '', nickname: '', joinCode: '', hostKeyInput: '',
  clientId: '', captains: [], teamAssignments: {}, draftOrder: [], manualOrder: false,
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
  // uiPrev: what the last paint showed, so a state-change animation only
  // fires when the underlying value actually changed. Firestore emits a
  // snapshot for every metadata blip; replaying the turn animation on each
  // one would be both wrong and distracting.
  uiPrev: { turnKey: '', picks: -1, phase: '', mine: false, pending: '', hostMenu: false }
};

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

// Never trusts a stored turn index — always recomputed from picks.
function getCurrentTurn(game) {
  if (!game || !game.turn || !Array.isArray(game.turn.order) || !game.turn.order.length) return null;
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
        state.loadError = 'המשחק הזה נוצר בגרסה ישנה של Draft21 ואינו נתמך. צור משחק חדש.';
      } else if (state.firstSnapshot && !state.arrivedViaHash && data.status === 'complete') {
        // Reopening the installed app must not trap anyone in last week's
        // finished draft. A shared link (which carries the hash) still opens it.
        state.firstSnapshot = false;
        rememberCompletedGame(state.gameId);
        leaveGame();
        render();
        return;
      } else {
        state.gameData = data;
        state.phase = data.status || 'setup';
        state.loadError = '';
      }
    } else {
      state.gameData = null;
      state.phase = 'setup';
      state.dataSig = '';
      state.loadError = 'לא נמצא משחק עם הקוד "' + state.gameId + '".';
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
  state.draftOrder = [];
  state.manualOrder = false;
  state.homeView = 'home';
  state.hostMenu = false;
  state.uiPrev = { turnKey: '', picks: -1, phase: '', mine: false, pending: '', hostMenu: false };
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
      if (!snap.exists()) throw new Error('המשחק לא נמצא');
      const game = snap.data();
      if (game.schema !== SCHEMA) throw new Error('גרסת משחק לא נתמכת');
      const patch = fn(game, txn);
      if (patch) txn.update(ref, patch);
    });
    return true;
  } catch (e) {
    const code = (e && e.code) || '';
    if (code === 'unavailable' || code === 'deadline-exceeded' || /offline|network/i.test(String(e && e.message))) {
      showError('החיבור לא זמין — הפעולה לא בוצעה. בדוק את החיבור ונסה שוב.');
    } else {
      showError(label + ': ' + (e && e.message ? e.message : 'שגיאה'));
    }
    return false;
  }
}

function init() {
  state.clientId = getClientId();
  const savedNick = localStorage.getItem('d21_nick');
  if (savedNick) state.nickname = savedNick;
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
function cleanRosterLine(line) {
  let s = String(line).replace(/[‎‏‪-‮⁦-⁩]/g, '').trim();
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
    showError('שגיאה ביצירת משחק: ' + e.message);
    return;
  }
  // Only adopt the id once the write succeeded, so a failure never leaves
  // the client pointing at a game that does not exist.
  state.captains = [];
  state.teamAssignments = {};
  state.draftOrder = [];
  state.manualOrder = false;
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
  if (!isHost(game)) { showError('רק המנהל יכול לבחור קפטנים'); return; }
  if (!(game.players || []).some(p => p.id === playerId)) return;
  const index = state.captains.indexOf(playerId);
  if (index > -1) {
    state.captains.splice(index, 1);
    delete state.teamAssignments[playerId];
  } else if (state.captains.length < 3) {
    state.captains.push(playerId);
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
  if (!isHost(state.gameData)) { showError('רק המנהל יכול להגדיר קבוצות'); return; }
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
  if (!isHost(state.gameData)) { showError('רק המנהל יכול להגדיר קבוצות'); return; }
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
    if (game.hostId !== state.clientId) throw new Error('רק המנהל יכול לסיים הגדרת קפטנים');
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
    state.draftOrder = [];
    state.manualOrder = false;
  }
}

async function joinGame() {
  const nick = state.nickname.trim();
  if (!nick) { showError('הזן כינוי'); return; }
  localStorage.setItem('d21_nick', nick);
  await mutate('שגיאה בהצטרפות', game => {
    if (['lobby', 'draft', 'complete'].indexOf(game.status) === -1) throw new Error('לא ניתן להצטרף בשלב הזה');
    const participants = (game.participants || []).map(p => Object.assign({}, p));
    const existing = participants.find(p => p.id === state.clientId);
    if (existing) {
      existing.nick = nick;
    } else {
      participants.push({ id: state.clientId, nick, teamId: null, ready: false });
    }
    return { participants };
  });
}

// Claiming is validated against a fresh read inside the transaction, so two
// captains tapping the same team at the same moment cannot both succeed:
// Firestore retries the loser, it re-reads, and it fails with a clear error.
async function claimTeam(teamId) {
  await mutate('שגיאה בבחירת קבוצה', game => {
    if (['lobby', 'draft'].indexOf(game.status) === -1) throw new Error('לא ניתן לבחור קבוצה בשלב הזה');
    if (!teamById(game, teamId)) throw new Error('קבוצה לא קיימת');
    const participants = (game.participants || []).map(p => Object.assign({}, p));
    const me = participants.find(p => p.id === state.clientId);
    if (!me) throw new Error('הצטרף עם כינוי לפני בחירת קבוצה');
    const holder = participants.find(p => p.teamId === teamId);
    if (holder && holder.id !== state.clientId) {
      throw new Error('הקבוצה ' + colorHe(teamById(game, teamId).color) + ' כבר תפוסה על ידי ' + holder.nick);
    }
    if (me.teamId && me.teamId !== teamId) throw new Error('אתה כבר משויך לקבוצה אחרת');
    me.teamId = teamId;
    me.ready = true;
    return { participants };
  });
}

// Recovery path: the host can free a team whose captain vanished (new device,
// cleared storage), letting them — or anyone else — claim it again.
async function releaseTeam(teamId) {
  const game = state.gameData;
  const team = game ? teamById(game, teamId) : null;
  if (!team) return;
  const holder = claimantOf(game, teamId);
  const label = holder ? holder.nick : '';
  if (!confirm('לשחרר את הקבוצה ' + colorHe(team.color) + (label ? ' מ' + label : '') + '?')) return;
  await mutate('שגיאה בשחרור קבוצה', g => {
    if (g.hostId !== state.clientId) throw new Error('רק המנהל יכול לשחרר קבוצה');
    const participants = (g.participants || []).map(p => Object.assign({}, p));
    const target = participants.find(p => p.teamId === teamId);
    if (!target) throw new Error('לקבוצה הזו אין קפטן משויך');
    target.teamId = null;
    target.ready = false;
    const patch = { participants };
    // A pending pick made by the released captain is no longer valid.
    if (g.pendingPick && g.pendingPick.teamId === teamId) patch.pendingPick = null;
    return patch;
  });
}

function toggleManualOrder() {
  if (!isHost(state.gameData)) return;
  state.manualOrder = !state.manualOrder;
  if (state.manualOrder && state.gameData) {
    const ids = (state.gameData.teams || []).map(t => t.id);
    const kept = state.draftOrder.filter(id => ids.indexOf(id) > -1);
    ids.forEach(id => { if (kept.indexOf(id) === -1) kept.push(id); });
    state.draftOrder = kept;
  }
  render();
}

function moveDraftOrder(teamId, direction) {
  const index = state.draftOrder.indexOf(teamId);
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= state.draftOrder.length) return;
  const swap = state.draftOrder[newIndex];
  state.draftOrder[newIndex] = state.draftOrder[index];
  state.draftOrder[index] = swap;
  render();
}

function randomizeDraftOrder() {
  state.draftOrder = shuffle(state.draftOrder.slice());
  render();
}

async function startDraft(allowUnclaimed) {
  const manual = state.manualOrder ? state.draftOrder.slice() : null;
  await mutate('שגיאה בהתחלת דראפט', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המנהל יכול להתחיל את הדראפט');
    if (game.status !== 'lobby') throw new Error('הדראפט כבר התחיל');
    const teams = game.teams || [];
    if (teams.length !== 3) throw new Error('צריך 3 קבוצות לפני התחלת דראפט');

    const teamIds = teams.map(t => t.id);
    let order;
    if (manual && manual.length === teamIds.length && teamIds.every(id => manual.indexOf(id) > -1)) {
      order = manual;
    } else {
      order = shuffle(teamIds.slice());
    }

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

async function makePick(playerId) {
  await mutate('שגיאה בבחירה', game => {
    if (game.status !== 'draft') throw new Error('הדראפט אינו פעיל');
    if (game.pendingPick) throw new Error('יש כבר בחירה שממתינה לאישור');
    const turn = turnFor(game);
    if (!turn) throw new Error('לא ניתן לזהות את התור הנוכחי');
    if (!turnActorAllowed(game, turn)) throw new Error('זה לא התור שלך');
    if (draftedPlayerIds(game).has(playerId)) throw new Error('השחקן הזה כבר נבחר');
    if (!(game.players || []).some(p => p.id === playerId)) throw new Error('שחקן לא קיים');
    return {
      pendingPick: {
        playerId,
        playerName: playerName(game, playerId),
        teamId: turn.teamId,
        byId: state.clientId
      }
    };
  });
}

async function confirmPick() {
  const ok = await mutate('שגיאה באישור בחירה', game => {
    if (game.status !== 'draft') throw new Error('הדראפט אינו פעיל');
    const pending = game.pendingPick;
    if (!pending) throw new Error('אין בחירה שממתינה לאישור');
    const turn = turnFor(game);
    if (!turn) throw new Error('לא ניתן לזהות את התור הנוכחי');
    if (!turnActorAllowed(game, turn)) throw new Error('זה לא התור שלך');
    // The pending pick must still belong to the team whose turn it is.
    if (pending.teamId !== turn.teamId) throw new Error('הבחירה שממתינה שייכת לתור אחר');
    if (draftedPlayerIds(game).has(pending.playerId)) throw new Error('השחקן הזה כבר נבחר');

    const pick = {
      playerId: pending.playerId,
      playerName: playerName(game, pending.playerId),
      teamId: pending.teamId,
      byId: pending.byId || state.clientId,
      seq: (game.picks || []).length
    };
    const picks = (game.picks || []).concat([pick]);
    const done = picks.length >= totalPicksNeeded(game);
    return {
      picks,
      pendingPick: null,
      lastPick: pick,
      turn: turnStateFor(game, picks.length),
      status: done ? 'complete' : 'draft'
    };
  });
  if (ok) { showConfetti('small'); haptic(30); }
}

async function cancelPendingPick() {
  await mutate('שגיאה בביטול הבחירה', game => {
    const pending = game.pendingPick;
    if (!pending) throw new Error('אין בחירה לבטל');
    const isOwner = pending.byId === state.clientId;
    const turn = turnFor(game);
    const controlsTurn = turn && turnActorAllowed(game, turn) && pending.teamId === turn.teamId;
    if (!isOwner && !controlsTurn && game.hostId !== state.clientId) {
      throw new Error('רק הקפטן שבחר או המנהל יכולים לבטל');
    }
    return { pendingPick: null };
  });
}

// Undo is a pop: rosters, availability and the turn are all derived from
// `picks`, so there is no separate bookkeeping that can drift.
async function undoPick() {
  await mutate('שגיאה בביטול בחירה', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המנהל יכול לבטל בחירה');
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

async function resetDraft() {
  if (!isHost(state.gameData)) { showError('רק המנהל יכול לאפס את הדראפט'); return; }
  if (!confirm('לאפס את הדראפט? כל הבחירות יימחקו (הקפטנים והקבוצות יישמרו)')) return;
  await mutate('שגיאה באיפוס', game => {
    if (game.hostId !== state.clientId) throw new Error('רק המנהל יכול לאפס את הדראפט');
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
}

function fullReset() {
  if (!confirm('לצאת מהמשחק הזה ולהתחיל מחדש במכשיר הזה? (המשחק עצמו לא נמחק)')) return;
  leaveGame();
  render();
}

async function recoverHost() {
  const key = state.hostKeyInput.trim().toUpperCase();
  if (!key) { showError('הזן את קוד המנהל'); return; }
  const ok = await mutate('שגיאה בשחזור הרשאות', game => {
    if (game.hostId === state.clientId) throw new Error('אתה כבר המנהל');
    if (!game.hostKey || game.hostKey.toUpperCase() !== key) throw new Error('קוד מנהל שגוי');
    return { hostId: state.clientId };
  });
  if (ok) {
    state.hostKeyInput = '';
    showNotice('הרשאות המנהל הועברו למכשיר הזה');
  }
}

/* ------------------------------------------------------------------ */
/* Turn authority (used inside transactions)                           */
/* ------------------------------------------------------------------ */

function turnFor(game) {
  const order = (game.turn && game.turn.order) || [];
  if (!order.length) return null;
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

function shareWhatsApp() {
  const game = state.gameData;
  if (!game) return;
  window.open('https://wa.me/?text=' + encodeURIComponent(buildWhatsAppText(game)), '_blank');
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

  const game = state.gameData;
  if (game) pruneCaptainDraft(game);

  // Work out what changed since the last paint *before* building the markup,
  // so the animation classes can be baked straight into the HTML instead of
  // being chased down afterwards.
  const anim = diffForAnimation(game);

  let html = '';
  if (state.phase === 'captains' && game) html = renderCaptains(game);
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
  const pending = game && game.pendingPick ? game.pendingPick.playerId : '';
  const next = {
    turnKey: turn ? turn.teamId + ':' + picks : '',
    picks,
    phase: state.phase,
    mine: !!(turn && turn.isMine),
    pending,
    hostMenu: !!state.hostMenu
  };
  const anim = {
    turnChanged: !!next.turnKey && next.turnKey !== prev.turnKey && prev.phase === 'draft',
    pickLanded: picks > prev.picks && prev.picks >= 0 && prev.phase === 'draft',
    becameMine: next.mine && !prev.mine && next.turnKey !== prev.turnKey,
    justFinished: next.phase === 'complete' && prev.phase === 'draft',
    justStarted: next.phase === 'draft' && prev.phase === 'lobby',
    pendingOpened: !!pending && pending !== prev.pending,
    hostMenuOpened: next.hostMenu && !prev.hostMenu
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

// Every screen answers "who am I" in the same place, at the same size.
// The old build never showed it at all, so on a borrowed phone mid-draft
// there was no way to tell whether you were a captain or a spectator.
function meChip(game) {
  if (!game) return '';
  const me = myParticipant(game);
  const host = isHost(game);
  if (!me && !host) return '';
  const team = me && me.teamId ? teamById(game, me.teamId) : null;
  // A host who has not entered a nickname yet is just "the host" — showing
  // that word twice, once as a name and once as a role, said nothing.
  if (!me) {
    return '<span class="me" data-me><span class="avatar">' + icon('crown', 13) + '</span>' +
      '<span class="me__name">מנהל</span></span>';
  }
  const role = team ? 'קפטן ' + colorHe(team.color) : (host ? 'מנהל' : 'צופה');
  return '<span class="me' + (team ? ' me--volt' : '') + '" data-me data-team="' + escapeHtml(team ? team.color : '') + '">' +
    (team
      ? renderTeamShirt(team.color, 'shirt--xs')
      : '<span class="avatar">' + escapeHtml(initials(me.nick)) + '</span>') +
    '<span class="stack">' +
      '<span class="me__name">' + escapeHtml(me.nick) + '</span>' +
      '<span class="me__role">' + escapeHtml(role) + '</span>' +
    '</span></span>';
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

// The game code is what gets pasted into WhatsApp, so copying the link is
// the action and the code itself is the receipt — not the other way round.
function codeRow(game) {
  let html = '<div class="row row--wrap" style="gap:8px">' +
    '<button class="btn btn--sm btn--ghost" data-copy-btn onclick="handleCopyLink()">' + icon('link', 16) + '<span>העתק קישור הזמנה</span></button>' +
    '<span class="chip">קוד<span class="code num">' + escapeHtml(state.gameId || '') + '</span></span>';
  if (isHost(game) && game && game.hostKey) {
    html += '<span class="chip" title="שמור אותו — הוא מעביר הרשאות מנהל למכשיר אחר">' +
      icon('key', 13) + '<span class="chip__label">קוד מנהל</span><span class="code num">' + escapeHtml(game.hostKey) + '</span></span>';
  }
  html += '</div>';
  return html;
}

function hostRecoveryBlock() {
  const game = state.gameData;
  if (!game || isHost(game)) return '';
  return '<details class="details"><summary>אני המנהל — שחזור הרשאות</summary>' +
    '<div class="row" style="gap:8px;margin-block-start:8px">' +
    '<input id="hostKeyInput" type="text" inputmode="latin" autocapitalize="characters" value="' + escapeHtml(state.hostKeyInput) + '" oninput="handleHostKeyInput(this.value)" class="field field--code grow" placeholder="קוד מנהל">' +
    '<button onclick="handleRecoverHost()" class="btn btn--ghost">אישור</button>' +
    '</div></details>';
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
          '<p class="t-body t-dim t-balance">האפליקציה נטענה מהזיכרון, אבל אי אפשר למשוך את המשחק כרגע. ברגע שהחיבור יחזור הכול יסתנכרן לבד.</p>' +
          '<button onclick="handleReconnect()" class="btn btn--volt btn--block">' + icon('refresh', 18) + 'נסה שוב</button>' +
          '<button onclick="handleFullReset()" class="linkish">חזרה למסך הבית</button>' +
        '</div>'
      : '<div class="stack-12" data-connecting>' +
          '<div class="row" style="gap:8px"><span class="livedot t-volt"></span><span class="t-meta">מתחבר למשחק <span class="code num">' + escapeHtml(state.gameId || '') + '</span></span></div>' +
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

// The old home screen led with a 21-line textarea, which is the one thing
// exactly one person in the group ever needs. Home is now the two decisions
// that actually exist — start one, or join one — and pasting the roster is
// its own step behind "משחק חדש".
function renderHome() {
  if (state.homeView === 'create') return renderImport();
  if (state.homeView === 'join') return renderJoinByCode();

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
      '<p class="t-body t-dim t-balance">הדבק את הרשימה, בחר קפטנים, וכולם עוקבים אחרי הבחירות בזמן אמת.</p>' +
    '</div>' +

    '<div class="stack-12">' +
      '<button onclick="handleGoCreate()" class="btn btn--volt btn--lg btn--block anim-rise anim-rise-1">' + icon('plus', 20) + 'משחק חדש</button>' +
      '<button onclick="handleGoJoin()" class="btn btn--ghost btn--lg btn--block anim-rise anim-rise-2">הצטרפות עם קוד</button>' +
    '</div>';

  if (state.lastCompleteGame) {
    html += '<button data-last-game onclick="handleOpenLastGame()" class="card row anim-rise anim-rise-3" style="width:100%;text-align:start">' +
      '<span class="trophy" style="width:40px;height:40px;border-radius:13px;font-size:20px">🏆</span>' +
      '<span class="grow"><span class="t-lg" style="display:block">הדראפט הקודם</span><span class="t-meta">הקבוצות עדיין שמורות — לחץ להצגה</span></span>' +
      icon('back', 18) + '</button>';
  }

  html += '<p class="t-micro t-center" style="margin-block-start:auto;padding-block-start:24px">DRAFT21 · לקבוצה שלנו בלבד · נוצר על ידי Alon Iter</p>' +
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
function renderImport() {
  const parsed = parseRoster(state.input);
  const names = parsed.names;
  const count = names.length;
  const ready = count >= MIN_PLAYERS && count <= MAX_PLAYERS && !parsed.errors.length;

  const dupes = new Set();
  const seen = new Map();
  names.forEach(n => {
    const key = normalizeName(n);
    if (seen.has(key)) { dupes.add(key); } else { seen.set(key, n); }
  });

  let html = '<div class="scr" style="--glow:rgba(216,255,62,.14);--dock-h:96px">' +
    appBar(null, { back: 'handleGoHome()', title: 'רשימת השחקנים' }) +
    '<div class="wrap page stack-16">' +

    '<div class="row row--between">' +
      '<span class="tally' + (count > MAX_PLAYERS ? ' t-bad' : (ready ? ' t-volt' : '')) + '">' +
        '<span class="tally__n num">' + count + '</span><span class="tally__d num">מתוך ' + MAX_PLAYERS + '</span>' +
      '</span>' +
      '<span class="t-meta">מינימום <span class="num">' + MIN_PLAYERS + '</span> · שורה לכל שם</span>' +
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
      '<button data-create-game onclick="handleInitGame()" ' + (ready ? '' : 'disabled') + ' class="btn btn--volt btn--lg btn--block">' +
        (ready ? '<span>צור משחק עם <span class="num">' + count + '</span> שחקנים</span>' + icon('back', 20) : 'הוסף עוד שמות כדי להמשיך') +
      '</button>' +
    '</div></div>' +
    '</div>';
  return html;
}

function renderJoinByCode() {
  return '<div class="scr" style="--glow:rgba(216,255,62,.14);--dock-h:88px">' +
    appBar(null, { back: 'handleGoHome()', title: 'הצטרפות למשחק' }) +
    '<div class="wrap page stack-16">' +
      '<p class="t-body t-dim t-balance">בדרך כלל פשוט לוחצים על הקישור בקבוצה. אם יש לך רק את הקוד — הוא כאן.</p>' +
      '<div>' +
        '<label class="field-label" for="joinCode">קוד משחק</label>' +
        '<input id="joinCode" type="text" inputmode="latin" autocapitalize="none" autocomplete="off" value="' + escapeHtml(state.joinCode) + '" oninput="handleJoinCodeInput(this.value)" class="field field--code" placeholder="ABC123">' +
      '</div>' +
      (state.loadError ? '<div class="problem" data-load-error>' + icon('x', 18) + '<span>' + escapeHtml(state.loadError) + '</span></div>' : '') +
    '</div>' +
    '<div class="dock"><div class="dock__in">' +
      '<button onclick="handleJoinGameCode()" class="btn btn--volt btn--lg btn--block">כניסה למשחק</button>' +
    '</div></div>' +
    '</div>';
}

/* ------------------------------------------------------------------ */
/* Captain selection                                                   */
/* ------------------------------------------------------------------ */

function renderCaptains(game) {
  if (!isHost(game)) return renderWaitingForHost(game);

  const picked = state.captains.length;
  const assignedCount = state.captains.filter(id => TEAM_COLORS.indexOf(state.teamAssignments[id]) > -1).length;
  const ready = picked === 3 && assignedCount === 3;

  let html = '<div class="scr" style="--glow:rgba(255,197,61,.20);--dock-h:96px">' +
    appBar(game, { title: 'קפטנים' }) +
    '<div class="wrap page stack-24">' +

    '<div class="stack-12">' +
      '<div class="row row--between">' +
        '<span class="t-h1">👑 בחר שלושה קפטנים</span>' +
      '</div>' +
      codeRow(game) +
    '</div>' +

    '<div class="stack-12">' +
      '<div class="sect-title"><span class="t-micro">כל השחקנים</span><span class="t-micro num">' + picked + '/3</span></div>' +
      '<div class="namegrid">';
  game.players.forEach(player => {
    const selected = state.captains.includes(player.id);
    html += '<button data-player-id="' + escapeHtml(player.id) + '" aria-pressed="' + (selected ? 'true' : 'false') + '" onclick="handleToggleCaptain(\'' + escapeHtml(player.id) + '\')" class="namebtn' + (selected ? ' namebtn--on' : '') + '">' +
      (selected ? icon('crown', 15) : '') + '<span>' + escapeHtml(player.name) + '</span></button>';
  });
  html += '</div></div>';

  if (picked === 3) {
    html += '<div class="stack-12 anim-rise">' +
      '<div class="sect-title"><span class="t-micro">צבע לכל קפטן</span>' +
        '<button onclick="handleRandomizeColors()" class="btn btn--xs btn--ghost">' + icon('shuffle', 13) + 'ערבב</button>' +
      '</div>';
    state.captains.forEach(captainId => {
      const captain = game.players.find(p => p.id === captainId);
      if (!captain) return;
      html += '<div class="card" style="padding:14px">' +
        '<div class="row" style="margin-block-end:10px"><span class="captain-line">' + icon('crown', 14) + escapeHtml(captain.name) + '</span></div>' +
        '<div class="shirtpick">';
      TEAM_COLORS.forEach(color => {
        const assigned = state.teamAssignments[captainId] === color;
        html += '<button data-color-btn="' + escapeHtml(captainId + ':' + color) + '" data-team="' + color + '" aria-pressed="' + (assigned ? 'true' : 'false') + '" onclick="handleAssignTeamColor(\'' + escapeHtml(captainId) + '\',\'' + color + '\')" class="shirtopt' + (assigned ? ' shirtopt--on' : '') + '">' +
          renderTeamShirt(color, 'shirt--md') +
          '<span>' + escapeHtml(colorHe(color)) + '</span></button>';
      });
      html += '</div></div>';
    });
    html += '</div>';
  } else {
    html += '<div class="problem problem--warn">' + icon('bolt', 18) +
      '<span>אחרי שלושה קפטנים ייפתחו כאן צבעי הקבוצות.</span></div>';
  }

  html += '</div>' +
    '<div class="dock"><div class="dock__in">' +
      '<button data-finalize onclick="handleFinalizeCaptains()" ' + (ready ? '' : 'disabled') + ' class="btn btn--volt btn--lg btn--block">' +
        (picked < 3
          ? 'בחר עוד ' + (3 - picked) + ' קפטנים'
          : (assignedCount < 3 ? 'תן צבע לכל קפטן' : '<span>פתח את אולם ההמתנה</span>' + icon('back', 20))) +
      '</button>' +
    '</div></div>' +
    '</div>';
  return html;
}

function renderWaitingForHost(game) {
  return '<div class="scr" style="--glow:rgba(255,197,61,.16)">' +
    appBar(game, { title: 'קפטנים' }) +
    '<div class="wrap page stack-16">' +
      '<div class="card stack-12 t-center">' +
        '<div class="row center" style="gap:8px"><span class="livedot t-volt"></span><span class="t-micro">מחובר</span></div>' +
        '<div class="t-h1">ממתין למנהל</div>' +
        '<p class="t-body t-dim t-balance" data-waiting-host>המנהל בוחר עכשיו את שלושת הקפטנים ואת צבעי הקבוצות. המסך הזה יתעדכן לבד.</p>' +
        '<div class="stack-8">' +
          '<div class="skeleton" style="height:54px"></div>' +
          '<div class="skeleton" style="height:54px"></div>' +
          '<div class="skeleton" style="height:54px"></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' + codeRow(game) + '</div>' +
      hostRecoveryBlock() +
    '</div></div>';
}

/* ------------------------------------------------------------------ */
/* Lobby                                                               */
/* ------------------------------------------------------------------ */

// The old lobby showed the three teams, and then showed them a second time
// as a separate "pick your team" grid. Here the team slot *is* the claim
// control: one list, one tap, and the state of every team is visible in it.
function teamSlot(game, team, opts) {
  const o = opts || {};
  const compact = !!o.compact;
  const claimant = claimantOf(game, team.id);
  const mine = claimant && claimant.id === state.clientId;
  const iAmUnassigned = o.canClaim;
  const cls = 'slot' + (compact ? ' slot--compact' : '') + (mine ? ' slot--mine' : (!claimant && iAmUnassigned ? ' slot--open' : ''));
  const tag = (!claimant && iAmUnassigned) ? 'button' : 'div';
  const attrs = (!claimant && iAmUnassigned)
    ? ' onclick="handleClaimTeam(\'' + escapeHtml(team.id) + '\')"'
    : '';

  let sub;
  if (mine) sub = '<span class="t-volt">זו הקבוצה שלך</span>';
  else if (claimant) sub = 'מחובר: ' + escapeHtml(claimant.nick);
  else sub = iAmUnassigned ? 'פנוי — לחץ אם אתה הקפטן' : 'ממתין לקפטן';

  return '<' + tag + ' class="' + cls + '" data-team="' + escapeHtml(team.color) + '" data-claim-btn="' + escapeHtml(team.color) + '"' + attrs + '>' +
    renderTeamShirt(team.color, compact ? 'shirt--sm' : 'shirt--lg') +
    '<span class="slot__body">' +
      '<span class="slot__title team-name">' + escapeHtml(colorHe(team.color)) + '</span>' +
      '<span class="slot__sub"><span class="captain-line">' + icon('crown', 13) + escapeHtml(playerName(game, team.captainId)) + '</span></span>' +
      '<span class="slot__sub">' + sub + '</span>' +
    '</span>' +
    '<span class="slot__cta">' +
      (mine ? '<span class="chip chip--volt">' + icon('check', 12) + 'אתה</span>'
        : claimant ? '<span class="chip chip--good">' + icon('check', 12) + 'מחובר</span>'
        : iAmUnassigned ? '<span class="chip chip--volt">בחר</span>'
        : '<span class="chip chip--warn">פנוי</span>') +
    '</span>' +
    (o.showRelease && claimant ? '<button class="btn btn--xs btn--danger" onclick="event.stopPropagation();handleReleaseTeam(\'' + escapeHtml(team.id) + '\')">שחרר</button>' : '') +
    '</' + tag + '>';
}

function renderLobby(game, anim) {
  const me = myParticipant(game);
  const teams = game.teams || [];
  const claimedCount = teams.filter(t => claimantOf(game, t.id)).length;
  const host = isHost(game);
  const canClaim = !!me && !me.teamId;

  // Joining is the only thing that matters until you have a name.
  if (!me) return renderJoinCard(game, 'מי אתה?', 'הקפטנים בוחרים קבוצה, כל השאר צופים. אפשר לשנות אחר כך.');

  let html = '<div class="scr" style="--glow:rgba(90,150,255,.20);--dock-h:' + (host ? (claimedCount === 3 ? '108px' : '146px') : '76px') + '">' +
    appBar(game, { title: 'אולם המתנה' }) +
    '<div class="wrap page stack-24">' +

    '<div class="stack-12">' +
      '<div class="row" style="gap:8px"><span class="livedot t-good"></span><span class="t-micro">בשידור חי</span></div>' +
      '<div class="t-h1"><span class="num">' + claimedCount + '</span> מתוך <span class="num">3</span> קפטנים מחוברים</div>' +
      codeRow(game) +
    '</div>' +

    '<div class="stack-8">' +
      '<div class="sect-title"><span class="t-micro">הקבוצות</span></div>';
  teams.forEach(team => { html += teamSlot(game, team, { canClaim, showRelease: host }); });
  html += '</div>';

  if (canClaim && claimedCount === 3) {
    html += '<div class="problem problem--warn" data-no-open-teams>' + icon('eye', 18) +
      '<span>כל הקבוצות תפוסות — אתה עוקב אחרי הדראפט כצופה.</span></div>';
  }

  html += '<div class="stack-8">' +
    '<div class="sect-title"><span class="t-micro">מי כאן</span><span class="t-micro num">' + (game.participants || []).length + '</span></div>' +
    '<div class="people">';
  (game.participants || []).forEach(p => {
    const team = p.teamId ? teamById(game, p.teamId) : null;
    html += '<span class="person' + (p.id === state.clientId ? ' person--me' : '') + '" data-participant="' + escapeHtml(p.nick) + '" data-team="' + escapeHtml(team ? team.color : '') + '">' +
      (team ? renderTeamShirt(team.color, 'shirt--xs') : '<span class="avatar">' + escapeHtml(initials(p.nick)) + '</span>') +
      '<span>' + escapeHtml(p.nick) + '</span>' +
      (p.id === game.hostId ? '<span class="t-micro" style="letter-spacing:.04em">מנהל</span>' : '') +
      '</span>';
  });
  html += '</div></div>';

  if (host) {
    html += '<div class="stack-12">' +
      '<div class="sect-title"><span class="t-micro">סדר הבחירה</span>' +
        '<button onclick="handleToggleManualOrder()" class="btn btn--xs btn--ghost">' +
          (state.manualOrder ? 'חזור לאקראי' : 'קבע ידנית') + '</button>' +
      '</div>';
    if (state.manualOrder && state.draftOrder.length) {
      html += '<div class="card stack-8" style="padding:14px">' +
        '<div class="row row--between"><span class="t-meta">הסדר מתהפך בכל סיבוב (סנייק)</span>' +
        '<button onclick="handleRandomizeDraftOrder()" class="btn btn--xs btn--ghost">' + icon('shuffle', 13) + 'ערבב</button></div>';
      state.draftOrder.forEach((teamId, index) => {
        const team = teamById(game, teamId);
        if (!team) return;
        html += '<div class="roster__item" data-team="' + escapeHtml(team.color) + '">' +
          '<span class="roster__n num">' + (index + 1) + '</span>' +
          renderTeamShirt(team.color, 'shirt--xs') +
          '<span class="grow">' + escapeHtml(colorHe(team.color)) + ' <span class="t-faint">· ' + escapeHtml(playerName(game, team.captainId)) + '</span></span>' +
          '<button class="btn btn--xs btn--ghost" ' + (index === 0 ? 'disabled' : '') + ' onclick="handleMoveDraftOrder(\'' + escapeHtml(teamId) + '\',-1)" aria-label="הזז למעלה">↑</button>' +
          '<button class="btn btn--xs btn--ghost" ' + (index === state.draftOrder.length - 1 ? 'disabled' : '') + ' onclick="handleMoveDraftOrder(\'' + escapeHtml(teamId) + '\',1)" aria-label="הזז למטה">↓</button>' +
          '</div>';
      });
      html += '</div>';
    } else {
      html += '<div class="roster__empty">הסדר ייקבע אקראית ברגע ההתחלה, ויתהפך בכל סיבוב.</div>';
    }
    html += '</div>';
    html += '<div class="t-center"><button onclick="handleOpenHostMenu()" class="linkish">כלי מנהל</button></div>';
  } else {
    html += '<div class="card row" data-waiting-start><span class="livedot t-volt"></span>' +
      '<span class="t-meta grow">ממתין שהמנהל יתחיל את הדראפט…</span></div>' +
      hostRecoveryBlock();
  }

  html += '</div>';

  if (host) {
    const allClaimed = claimedCount === 3;
    html += '<div class="dock"><div class="dock__in stack-8">' +
      '<button data-start-draft onclick="handleStartDraft()" ' + (allClaimed ? '' : 'disabled') + ' class="btn btn--volt btn--lg btn--block">' +
        icon('bolt', 20) + 'התחל דראפט</button>' +
      (!allClaimed
        ? '<button data-start-anyway onclick="handleStartDraftAnyway()" class="linkish" style="display:block;width:100%">חסרים ' + (3 - claimedCount) + ' קפטנים — התחל בלעדיהם ואני אנהל אותן</button>'
        : '') +
      '</div></div>';
  } else {
    html += '<div class="dock"><div class="dock__in">' +
      '<div class="row center" style="gap:8px"><span class="livedot t-good"></span><span class="t-meta">מחכים למנהל</span></div>' +
      '</div></div>';
  }

  html += hostMenuSheet(game, anim) + '</div>';
  return html;
}

function renderJoinCard(game, title, sub) {
  return '<div class="scr" style="--glow:rgba(90,150,255,.20);--dock-h:88px">' +
    appBar(game) +
    '<div class="wrap page stack-16">' +
      '<div class="stack-12" data-join-form>' +
        '<div class="t-display">' + escapeHtml(title) + '</div>' +
        '<p class="t-body t-dim t-balance">' + escapeHtml(sub) + '</p>' +
      '</div>' +
      '<div>' +
        '<label class="field-label" for="nicknameInput">הכינוי שלך</label>' +
        '<input id="nicknameInput" type="text" autocomplete="nickname" value="' + escapeHtml(state.nickname) + '" oninput="handleNicknameInput(this.value)" class="field" placeholder="איך קוראים לך?">' +
      '</div>' +
      '<div class="card">' + codeRow(game) + '</div>' +
    '</div>' +
    '<div class="dock"><div class="dock__in">' +
      '<button onclick="handleJoinGame()" class="btn btn--volt btn--lg btn--block">כניסה</button>' +
    '</div></div>' +
    '</div>';
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
    return '<div class="hud' + animCls + '"><div class="hud__top"><div class="hud__who">' +
      '<div class="hud__eyebrow">הדראפט</div><div class="hud__name">מסתנכרן…</div></div></div></div>';
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
        '<div class="hud__sub"><span class="team-dot"></span> <span data-turn-team class="team-name">' + escapeHtml(colorHe(turn.team.color)) + '</span>' +
          (mine ? '' : ' · ' + escapeHtml(turn.claimant ? turn.claimant.nick : 'ללא קפטן מחובר')) + '</div>' +
      '</div>' +
    '</div>' +
    (turn.unclaimed
      ? '<div class="chip chip--warn" style="margin-block-start:10px" data-unclaimed-turn>' + icon('bolt', 12) +
        (isHost(game) ? 'אין קפטן מחובר — אתה מנהל את הקבוצה הזו' : 'אין קפטן מחובר לקבוצה הזו') + '</div>'
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
    html += '<div class="feed__row' + (i === 0 && anim.pickLanded ? ' anim-land' : '') + '" data-team="' + escapeHtml(team ? team.color : '') + '" data-feed-pick="' + escapeHtml(pick.playerId) + '">' +
      '<span class="feed__pickno num">#' + (pick.seq + 1) + '</span>' +
      '<span class="feed__name">' + escapeHtml(pick.playerName || playerName(game, pick.playerId)) + '</span>' +
      '<span class="feed__team">' + escapeHtml(team ? colorHe(team.color) : '') + '</span>' +
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
          (claimant ? escapeHtml(claimant.nick) : '<span class="t-faint">אין קפטן מחובר</span>') + '</div>' +
      '</div>' +
      '<span class="teamcard__count num">' + roster.length + '</span>' +
    '</div>';

  if (o.showRoster !== false) {
    html += '<div class="roster">';
    roster.forEach((id, i) => {
      const isCap = id === team.captainId;
      html += '<div class="roster__item' + (isCap ? ' roster__item--captain' : '') + '" data-roster-player="' + escapeHtml(id) + '">' +
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
  const me = myParticipant(game);
  const host = isHost(game);

  if (!me) return renderJoinCard(game, 'הצטרף לדראפט', 'קפטן שחזר, או צופה שרוצה לעקוב — שניהם מתחילים בכינוי.');

  const canPick = !!(turn && turn.isMine && !game.pendingPick);
  const hasPending = !!game.pendingPick;

  let html = '<div class="scr" style="--glow:' + (turn && turn.isMine ? 'rgba(216,255,62,.24)' : 'rgba(30,180,120,.16)') + ';--dock-h:0px">' +
    appBar(game, { trailing: (host ? '<button class="btn btn--quiet btn--icon" onclick="handleOpenHostMenu()" aria-label="כלי מנהל">' + icon('dots', 20) + '</button>' : '') + meChip(game) }) +
    '<div class="wrap page stack-16">' +
    draftHud(game, turn, anim) +
    pulseBar(game, turn);

  // A captain who has not claimed a team yet still needs the claim list.
  if (!me.teamId) {
    const teams = game.teams || [];
    const open = teams.filter(t => !claimantOf(game, t.id));
    if (open.length) {
      html += '<div class="stack-8"><div class="sect-title"><span class="t-micro">קבוצה פנויה — אם אתה הקפטן</span></div>';
      open.forEach(t => { html += teamSlot(game, t, { canClaim: true, compact: true }); });
      html += '</div>';
    }
  }

  let poolHtml = '<div class="stack-8">' +
    '<div class="sect-title"><span class="t-micro">' + (canPick ? 'בחר את השחקן שלך' : 'עדיין על המדף') + '</span>' +
    '<span class="t-micro num">' + availablePlayers(game).length + '</span></div>' +
    '<div class="pool">';
  availablePlayers(game).forEach(player => {
    poolHtml += '<button data-pick-player="' + escapeHtml(player.id) + '" data-pick-name="' + escapeHtml(player.name) + '" ' +
      'onclick="handleMakePick(\'' + escapeHtml(player.id) + '\')" ' + (canPick ? '' : 'disabled') +
      ' class="pick' + (canPick ? ' pick--live' : '') + '">' + escapeHtml(player.name) + '</button>';
  });
  poolHtml += '</div>';
  if (!availablePlayers(game).length) poolHtml += '<div class="pool-empty">כל השחקנים חולקו</div>';
  poolHtml += '</div>';

  // A captain always gets the pool first — that is the thing they act on, and
  // the layout must not reshuffle every time their turn ends. A spectator has
  // nothing to tap, so they get the board first instead.
  const spectating = !me.teamId;
  html += spectating
    ? pickFeed(game, anim, 0) + poolHtml
    : poolHtml + pickFeed(game, anim);

  html += '<div class="stack-12">' +
    '<div class="sect-title"><span class="t-micro">הקבוצות</span></div>';
  orderedTeams(game).forEach(team => {
    html += teamPanel(game, team, { isTurn: !!(turn && turn.teamId === team.id) });
  });
  html += '</div>';

  if (!host) html += hostRecoveryBlock();

  html += '</div>';
  if (hasPending) html += pendingSheet(game, turn, host, anim);
  html += hostMenuSheet(game, anim) + '</div>';
  return html;
}

// The confirm step used to be a card that scrolled with the page: pick the
// 19th name and the button was several hundred pixels above you. It is now a
// sheet pinned to the thumb, so drafting is two taps and no scrolling — and
// spectators get the same reveal, which is what makes watching fun.
function pendingSheet(game, turn, host, anim) {
  const pending = game.pendingPick;
  const canConfirm = turn && turn.isMine && pending.teamId === turn.teamId;
  const team = teamById(game, pending.teamId);
  const name = pending.playerName || playerName(game, pending.playerId);

  const enter = anim && anim.pendingOpened ? ' sheet--in' : '';
  let html = (canConfirm ? '<div class="sheet__scrim' + (enter ? ' sheet__scrim--in' : '') + '"></div>' : '') +
    '<div class="sheet' + enter + '" data-pending role="dialog" aria-modal="false"><div class="sheet__in stack-16">' +
    '<div class="sheet__grip"></div>' +
    '<div class="stack-8 t-center" data-team="' + escapeHtml(team ? team.color : '') + '">' +
      '<div class="row center" style="gap:7px"><span class="team-dot"></span>' +
        '<span class="t-micro">' + escapeHtml(canConfirm ? 'אתה בוחר' : (team ? colorHe(team.color) + ' בוחר' : 'בחירה')) + '</span></div>' +
      '<div class="sheet__name" data-pending-name>' + escapeHtml(name) + '</div>' +
    '</div>';

  if (canConfirm) {
    html += '<div class="row" style="gap:10px">' +
      '<button data-confirm-pick onclick="handleConfirmPick()" class="btn btn--volt btn--lg grow">' + icon('check', 20) + 'אישור</button>' +
      '<button data-cancel-pending onclick="handleCancelPending()" class="btn btn--ghost" style="flex:0 0 34%">' + icon('x', 18) + 'החלף</button>' +
      '</div>';
  } else {
    html += '<div class="row center" style="gap:8px"><span class="livedot t-volt"></span>' +
      '<span class="t-meta">ממתין לאישור הקפטן…</span></div>';
    if (host) {
      html += '<button data-cancel-pending onclick="handleCancelPending()" class="btn btn--danger btn--block">ביטול הבחירה (מנהל)</button>';
    }
  }
  html += '</div></div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Host tools                                                          */
/* ------------------------------------------------------------------ */

// Undo / reset / release used to sit inline under the player pool, one
// mis-tap away from a live draft. They now live behind a deliberate sheet.
function hostMenuSheet(game, anim) {
  if (!state.hostMenu || !isHost(game)) return '';
  const made = (game.picks || []).length;
  const claimed = (game.teams || []).filter(t => claimantOf(game, t.id));

  const enter = anim && anim.hostMenuOpened ? ' sheet--in' : '';
  let html = '<div class="sheet__scrim' + (enter ? ' sheet__scrim--in' : '') + '" onclick="handleCloseHostMenu()"></div>' +
    '<div class="sheet' + enter + '" data-host-menu role="dialog"><div class="sheet__in stack-12">' +
    '<div class="sheet__grip"></div>' +
    '<div class="row row--between"><span class="t-h2">כלי מנהל</span>' +
      '<button class="btn btn--quiet btn--icon" onclick="handleCloseHostMenu()" aria-label="סגירה">' + icon('x', 18) + '</button></div>';

  if (state.phase === 'draft' && made > 0) {
    html += '<button data-undo onclick="handleUndoPick()" class="btn btn--ghost btn--block">' + icon('undo', 18) + 'בטל את הבחירה האחרונה</button>';
  }
  claimed.forEach(t => {
    const holder = claimantOf(game, t.id);
    html += '<button class="btn btn--ghost btn--block" onclick="handleReleaseTeam(\'' + escapeHtml(t.id) + '\')" data-team="' + escapeHtml(t.color) + '">' +
      '<span class="team-dot"></span>שחרר את ' + escapeHtml(colorHe(t.color)) + ' מ' + escapeHtml(holder.nick) + '</button>';
  });
  html += '<button onclick="handleResetDraft()" class="btn btn--danger btn--block">' + icon('refresh', 18) +
    (state.phase === 'complete' ? 'דראפט חדש עם אותם קפטנים' : 'אפס את כל הבחירות') + '</button>' +
    '<button onclick="handleFullReset()" class="linkish">יציאה מהמשחק במכשיר הזה</button>' +
    '</div></div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Completed teams                                                     */
/* ------------------------------------------------------------------ */

function renderComplete(game, anim) {
  const host = isHost(game);
  // The results are the one screen people crowd around. On anything wider than
  // a phone the three teams sit side by side instead of stacking.
  let html = '<div class="scr" style="--glow:rgba(255,176,32,.24);--dock-h:172px">' +
    appBar(game, { title: 'התוצאות', wide: true }) +
    '<div class="wrap wrap--wide page stack-24">' +

    '<div class="stack-12 t-center anim-rise">' +
      '<div class="trophy">🏆</div>' +
      '<div class="t-display" data-complete>הקבוצות סגורות</div>' +
      '<p class="t-body t-dim t-balance">שלוש קבוצות, <span class="num">' + (game.players || []).length + '</span> שחקנים. בהצלחה הערב.</p>' +
    '</div>' +

    '<div class="final-grid">';
  (game.teams || []).forEach((team, i) => {
    html += '<div class="anim-rise anim-rise-' + Math.min(3, i + 1) + '" data-final-team="' + escapeHtml(team.color) + '">' +
      teamPanel(game, team, { showRoster: true }) + '</div>';
  });
  html += '</div>';

  html += '<div class="card stack-8">' + codeRow(game) + '</div>';
  if (!host) html += hostRecoveryBlock();
  if (host) html += '<div class="t-center"><button onclick="handleOpenHostMenu()" class="linkish">כלי מנהל</button></div>';

  html += '</div>' +
    '<div class="dock dock--wide"><div class="dock__in stack-8">' +
      '<button data-share-wa onclick="handleShareWhatsApp()" class="btn btn--good btn--lg btn--block">' + icon('share', 20) + 'שתף בוואטסאפ</button>' +
      '<button data-copy-teams onclick="handleCopyTeams()" class="btn btn--ghost btn--block">' + icon('copy', 18) + 'העתק כטקסט</button>' +
    '</div></div>' +
    hostMenuSheet(game, anim) +
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
window.handleGoJoin = () => { state.homeView = 'join'; state.loadError = ''; render(); };
window.handleOpenHostMenu = () => { state.hostMenu = true; render(); };
window.handleCloseHostMenu = () => { state.hostMenu = false; render(); };
window.handleJoinCodeInput = v => { state.joinCode = v; };
window.handleNicknameInput = v => { state.nickname = v; };
window.handleHostKeyInput = v => { state.hostKeyInput = v; };
window.handleInitGame = initGame;
window.handleToggleCaptain = toggleCaptain;
window.handleRandomizeColors = randomizeColors;
window.handleAssignTeamColor = assignTeamColor;
window.handleFinalizeCaptains = finalizeCaptains;
window.handleJoinGame = joinGame;
window.handleClaimTeam = claimTeam;
window.handleReleaseTeam = id => { state.hostMenu = false; return releaseTeam(id); };
window.handleToggleManualOrder = toggleManualOrder;
window.handleMoveDraftOrder = moveDraftOrder;
window.handleRandomizeDraftOrder = randomizeDraftOrder;
window.handleStartDraft = () => startDraft(false);
window.handleStartDraftAnyway = () => {
  if (!confirm('להתחיל בלי כל הקפטנים? אתה תנהל את הקבוצות שאין להן קפטן מחובר.')) return;
  startDraft(true);
};
window.handleMakePick = makePick;
window.handleConfirmPick = confirmPick;
window.handleUndoPick = () => { state.hostMenu = false; return undoPick(); };
window.handleCancelPending = cancelPendingPick;
window.handleResetDraft = () => { state.hostMenu = false; return resetDraft(); };
window.handleShareWhatsApp = shareWhatsApp;
window.handleFullReset = () => { state.hostMenu = false; fullReset(); };
window.handleRecoverHost = recoverHost;
window.handleCopyTeams = () => {
  if (!state.gameData) return;
  copyText(buildWhatsAppText(state.gameData), () => showSuccess('הטקסט הועתק'));
};
window.handleReconnect = reconnect;
window.handleJoinGameCode = () => {
  const code = state.joinCode.trim().toLowerCase();
  if (!code) { showError('הזן קוד משחק'); return; }
  state.loadError = '';
  state.arrivedViaHash = true;
  state.firstSnapshot = true;
  setGameId(code);
  subscribeToGame();
};
window.handleOpenLastGame = () => {
  if (!state.lastCompleteGame) return;
  state.loadError = '';
  state.arrivedViaHash = true;
  state.firstSnapshot = true;
  setGameId(state.lastCompleteGame);
  subscribeToGame();
};
window.handleCopyLink = () => {
  const url = window.location.origin + window.location.pathname + '#' + state.gameId;
  copyText(url, () => {
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
