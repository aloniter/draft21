// The Firebase SDK is vendored under vendor/ so the app shell has no runtime
// dependency on a CDN. See vendor/README.md before upgrading.
import { initializeApp } from './vendor/firebase-app.js';
import { getFirestore, doc, onSnapshot, setDoc, runTransaction } from './vendor/firebase-firestore.js';

const app = initializeApp({
  apiKey: "AIzaSyBqz4oHoqGtnzjWqgzjWmwsUv6Kny75QpM",
  authDomain: "draft21-eabc3.firebaseapp.com",
  projectId: "draft21-eabc3",
  storageBucket: "draft21-eabc3.firebasestorage.app",
  messagingSenderId: "489648686113",
  appId: "1:489648686113:web:94d3605a0e5a871a434f60",
});

const db = getFirestore(app);

// Bumped whenever the game document shape changes in a non-backwards-compatible way.
const SCHEMA = 2;
const MAX_PLAYERS = 21;
const MIN_PLAYERS = 6;
const TEAM_COLORS = ['Red', 'White', 'Black'];
const TEAM_COLOR_HE = { Red: 'אדום', White: 'לבן', Black: 'שחור' };

const TEAM_JERSEY_STYLES = {
  Red: {
    top: '#fb7185',
    base: '#ef4444',
    bottom: '#b91c1c',
    trim: '#fef2f2',
    panel: '#991b1b',
    number: '#ffffff',
    seam: '#fecdd3',
    outline: '#7f1d1d'
  },
  White: {
    top: '#ffffff',
    base: '#f8fafc',
    bottom: '#cbd5e1',
    trim: '#334155',
    panel: '#e2e8f0',
    number: '#0f172a',
    seam: '#94a3b8',
    outline: '#64748b'
  },
  Black: {
    top: '#374151',
    base: '#111827',
    bottom: '#030712',
    trim: '#d1d5db',
    panel: '#4b5563',
    number: '#f9fafb',
    seam: '#9ca3af',
    outline: '#111827'
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
  showToast(msg, 'bg-red-500');
}

function showNotice(msg) {
  showToast(msg, 'bg-slate-800');
}

function showToast(msg, bgClass) {
  const el = document.createElement('div');
  el.className = 'fixed top-4 left-1/2 -translate-x-1/2 ' + bgClass + ' text-white px-6 py-3 rounded-xl shadow-lg z-50 font-bold max-w-md text-center';
  el.setAttribute('data-toast', '');
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function renderTeamShirt(color, sizeClass = 'w-12 h-12', centered = true) {
  const style = TEAM_JERSEY_STYLES[color] || {
    top: '#f3f4f6',
    base: '#d1d5db',
    bottom: '#9ca3af',
    trim: '#374151',
    panel: '#6b7280',
    number: '#111827',
    seam: '#e5e7eb',
    outline: '#6b7280'
  };
  const alignClass = centered ? ' mx-auto' : '';
  const id = String(shirtSvgSeq++);
  const gradId = 'jersey-grad-' + id;
  const shineId = 'jersey-shine-' + id;
  return '<svg viewBox="0 0 64 64" class="'+sizeClass+' shrink-0'+alignClass+'" role="img" aria-label="'+escapeHtml('חולצה '+colorHe(color))+'">'+
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
  arrivedViaHash: false, firstSnapshot: true, lastCompleteGame: ''
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
  document.body.classList.toggle('d21-has-connbar', !!state.offlineBanner);
  if (!state.offlineBanner) { bar.innerHTML = ''; return; }
  const msg = state.netDown
    ? '⚠️ אין חיבור לאינטרנט — הדראפט לא מתעדכן כרגע'
    : '⚠️ החיבור אבד — מנסה להתחבר מחדש';
  bar.innerHTML = '<div data-offline-bar class="d21-connbar bg-amber-500 text-white text-center px-4 py-2 text-sm font-bold shadow-lg">'+
    msg+'<button onclick="handleReconnect()" class="ms-3 underline font-bold">נסה שוב</button></div>';
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
  if (ok) showConfetti();
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

function showConfetti() {
  const emojis = ['🎉','🎊','⚽','🏆','⭐','✨'];
  for (let i = 0; i < 30; i++) {
    setTimeout(() => {
      const particle = document.createElement('div');
      particle.className = 'confetti';
      particle.textContent = emojis[Math.floor(Math.random()*emojis.length)];
      particle.style.left = Math.random()*100+'%';
      particle.style.top = '-50px';
      document.body.appendChild(particle);
      setTimeout(() => particle.remove(), 3000);
    }, i*100);
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

  let html = '';
  if (state.phase === 'captains' && game) html = renderCaptains(game);
  else if (state.phase === 'lobby' && game) html = renderLobby(game);
  else if (state.phase === 'draft' && game) html = renderDraft(game);
  else if (state.phase === 'complete' && game) html = renderComplete(game);
  else if (state.gameId && !game && !state.loadError) html = renderConnecting();
  else html = renderSetup();

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
}

function gameCodeBar(accentBg, accentText) {
  const game = state.gameData;
  let html = '<div class="mt-3 flex flex-wrap items-center justify-center gap-2">'+
    '<span class="text-sm text-gray-500">קוד משחק: <strong>'+escapeHtml(state.gameId)+'</strong></span>'+
    '<button data-copy-btn onclick="handleCopyLink()" class="'+accentBg+' '+accentText+' px-3 py-1 rounded-lg text-sm font-bold">🔗 העתק קישור</button>';
  if (isHost(game) && game && game.hostKey) {
    html += '<span class="text-xs text-gray-400">קוד מנהל: <strong>'+escapeHtml(game.hostKey)+'</strong></span>';
  }
  html += '</div>';
  return html;
}

function hostRecoveryBlock() {
  const game = state.gameData;
  if (!game || isHost(game)) return '';
  return '<details class="mt-4 text-center"><summary class="text-xs text-gray-400 cursor-pointer">שחזור הרשאות מנהל</summary>'+
    '<div class="mt-2 flex gap-2 max-w-xs mx-auto">'+
    '<input id="hostKeyInput" type="text" value="'+escapeHtml(state.hostKeyInput)+'" oninput="handleHostKeyInput(this.value)" class="flex-1 p-2 border-2 border-gray-300 rounded-lg text-center text-sm" placeholder="קוד מנהל">'+
    '<button onclick="handleRecoverHost()" class="bg-gray-200 text-gray-700 px-3 py-2 rounded-lg text-sm font-bold">אישור</button>'+
    '</div></details>';
}

// Shown while the first snapshot is still on its way — including a cold start
// with no reception, where the shell loads from cache but the game cannot.
function renderConnecting() {
  return '<div class="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">'+
    '<div class="bg-white rounded-3xl shadow-2xl p-8 max-w-sm w-full text-center">'+
    '<div class="text-6xl mb-4">'+(state.offlineBanner ? '📡' : '⚽')+'</div>'+
    '<h1 class="text-2xl font-bold text-gray-800 mb-2">Draft21</h1>'+
    (state.offlineBanner
      ? '<p class="text-gray-600 mb-4" data-connecting-offline>אין חיבור לאינטרנט. האפליקציה נטענה, אבל אי אפשר לטעון את המשחק כרגע.</p>'+
        '<button onclick="handleReconnect()" class="w-full bg-blue-500 text-white py-3 rounded-xl font-bold mb-2">נסה שוב</button>'
      : '<p class="text-gray-600 mb-4 animate-pulse" data-connecting>מתחבר למשחק '+escapeHtml(state.gameId)+'…</p>')+
    '<button onclick="handleFullReset()" class="text-sm text-gray-400 underline">חזור למסך הבית</button>'+
    '</div></div>';
}

function renderSetup() {
  let html = '<div class="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">'+
    '<div class="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-lg">'+
    '<div class="text-center mb-6"><div class="text-6xl mb-4">⚽</div>'+
    '<h1 class="text-4xl font-bold text-gray-800 mb-2">Draft21</h1>'+
    '<p class="text-gray-600">כלי דראפט מתקדם לכדורגל</p></div>';
  if (state.loadError) {
    html += '<div data-load-error class="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-xl text-red-700 text-sm text-center font-bold">'+escapeHtml(state.loadError)+'</div>';
  }
  html += '<div class="space-y-4"><h2 class="text-xl font-bold text-gray-700">הזן את רשימת השחקנים:</h2>'+
    '<p class="text-sm text-gray-600">הדבק רשימה של שמות (עד '+MAX_PLAYERS+' שחקנים), שורה אחת לכל שם</p>'+
    '<textarea id="playerInput" oninput="handlePlayerInput(this.value)" class="w-full h-64 p-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-mono text-right resize-none" placeholder="שם שחקן\nשם שחקן\nשם שחקן\n...">'+escapeHtml(state.input)+'</textarea>'+
    '<button onclick="handleInitGame()" class="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-xl font-bold text-lg hover:shadow-lg transform hover:scale-105 transition">➡️ התחל משחק חדש</button>'+
    '<div class="border-t-2 pt-4 mt-2"><p class="text-sm text-gray-600 text-center mb-3">או הצטרף למשחק קיים:</p>'+
    '<div class="flex gap-2"><input id="joinCode" type="text" value="'+escapeHtml(state.joinCode)+'" oninput="handleJoinCodeInput(this.value)" class="flex-1 p-3 border-2 border-gray-300 rounded-xl text-center" placeholder="הזן קוד משחק">'+
    '<button onclick="handleJoinGameCode()" class="bg-green-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-600">הצטרף</button></div></div>';
  if (state.lastCompleteGame) {
    html += '<div class="border-t-2 pt-4 mt-2 text-center">'+
      '<button data-last-game onclick="handleOpenLastGame()" class="text-sm text-blue-600 underline">הדראפט הקודם הסתיים — הצג את התוצאות</button></div>';
  }
  html += '</div></div></div>';
  return html;
}

function renderCaptains(game) {
  if (!isHost(game)) {
    return '<div class="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 p-4 flex items-center justify-center">'+
      '<div class="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full text-center">'+
      '<div class="text-6xl mb-4">⏳</div><h2 class="text-2xl font-bold mb-2">ממתין למנהל</h2>'+
      '<p class="text-gray-600" data-waiting-host>המנהל בוחר כרגע את שלושת הקפטנים ואת צבעי הקבוצות.</p>'+
      gameCodeBar('bg-purple-100', 'text-purple-700')+
      hostRecoveryBlock()+
      '</div></div>';
  }

  let html = '<div class="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 p-4"><div class="max-w-4xl mx-auto">'+
    '<div class="bg-white rounded-3xl shadow-2xl p-8 mb-6"><div class="text-center mb-8">'+
    '<div class="text-6xl mb-4">👑</div><h2 class="text-3xl font-bold mb-2">בחירת קפטנים</h2>'+
    '<p class="text-gray-600">בחר 3 שחקנים להיות קפטנים</p>'+
    gameCodeBar('bg-purple-100', 'text-purple-700')+
    '</div>'+
    '<div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">';
  game.players.forEach(player => {
    const selected = state.captains.includes(player.id);
    html += '<button data-player-id="'+escapeHtml(player.id)+'" onclick="handleToggleCaptain(\''+escapeHtml(player.id)+'\')" class="p-4 rounded-xl border-2 transition '+(selected?'bg-gradient-to-br from-yellow-400 to-orange-500 text-white border-yellow-600 scale-105':'bg-white border-gray-300 hover:border-purple-500')+'">'+escapeHtml(player.name)+'</button>';
  });
  html += '</div>';
  if (state.captains.length === 3) {
    const assignedCount = state.captains.filter(id => TEAM_COLORS.indexOf(state.teamAssignments[id]) > -1).length;
    html += '<div class="border-t-2 pt-6"><h3 class="text-xl font-bold mb-4 text-center">הקצה צבעי קבוצות:</h3>'+
      '<button onclick="handleRandomizeColors()" class="w-full bg-purple-100 text-purple-700 py-2 rounded-xl font-bold hover:bg-purple-200 mb-4">🎨 ערבב צבעים אקראי</button>'+
      '<div class="space-y-4">';
    state.captains.forEach(captainId => {
      const captain = game.players.find(p => p.id === captainId);
      if (!captain) return;
      html += '<div class="bg-gray-50 rounded-xl p-4"><p class="font-bold mb-3">'+escapeHtml(captain.name)+'</p><div class="grid grid-cols-3 gap-2">';
      TEAM_COLORS.forEach(color => {
        const assigned = state.teamAssignments[captainId] === color;
        html += '<button data-color-btn="'+escapeHtml(captainId+':'+color)+'" onclick="handleAssignTeamColor(\''+escapeHtml(captainId)+'\',\''+color+'\')" class="p-3 rounded-lg border-2 '+(assigned?'ring-4 ring-blue-400 scale-105':'border-gray-300')+'">'+
          renderTeamShirt(color, 'w-12 h-12')+
          '<p class="text-sm font-bold">'+escapeHtml(colorHe(color))+'</p></button>';
      });
      html += '</div></div>';
    });
    html += '</div><button data-finalize onclick="handleFinalizeCaptains()" class="w-full bg-gradient-to-r from-green-500 to-teal-600 text-white py-4 rounded-xl font-bold text-lg mt-6 disabled:opacity-50" '+(assignedCount===3?'':'disabled')+'>✓ סיים הגדרת קפטנים</button></div>';
  }
  html += '</div></div></div>';
  return html;
}

function teamCard(game, team, opts) {
  const options = opts || {};
  const claimant = claimantOf(game, team.id);
  let html = '<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border-2 border-gray-300" data-team-card="'+escapeHtml(team.color)+'">'+
    renderTeamShirt(team.color, 'w-16 h-16')+
    '<h3 class="text-2xl font-bold text-center mb-2">'+escapeHtml(colorHe(team.color))+'</h3>'+
    '<div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-2 mb-3">'+
    '<p class="text-center font-bold text-yellow-800 text-sm">👑 '+escapeHtml(playerName(game, team.captainId))+'</p></div>'+
    '<p class="text-xs text-center '+(claimant?'text-green-700':'text-orange-600')+' font-bold mb-2" data-claim-status="'+escapeHtml(team.color)+'">'+
    (claimant ? '🔗 מחובר: '+escapeHtml(claimant.nick) : '⚠️ אין קפטן מחובר')+'</p>';
  if (options.showRelease && claimant) {
    html += '<button onclick="handleReleaseTeam(\''+escapeHtml(team.id)+'\')" class="w-full text-xs bg-red-100 text-red-700 py-1 rounded-lg font-bold hover:bg-red-200">שחרר קבוצה</button>';
  }
  if (options.showRoster) {
    html += '<div class="space-y-2 mt-3">';
    teamRoster(game, team.id).filter(id => id !== team.captainId).forEach(id => {
      html += '<div class="bg-white p-2 rounded-lg text-center text-sm border border-gray-200" data-roster-player="'+escapeHtml(id)+'">'+escapeHtml(playerName(game, id))+'</div>';
    });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function claimPanel(game) {
  const me = myParticipant(game);
  if (!me) return '';
  if (me.teamId) return '';
  const teams = game.teams || [];
  const openTeams = teams.filter(t => !claimantOf(game, t.id));
  if (!openTeams.length) {
    return '<div class="mb-4 p-4 bg-gray-50 border-2 border-gray-200 rounded-xl text-center text-sm text-gray-600" data-no-open-teams>כל הקבוצות תפוסות. אתה עוקב אחרי הדראפט כצופה.</div>';
  }
  let html = '<div class="mb-4 p-4 bg-yellow-50 border-2 border-yellow-300 rounded-xl">'+
    '<p class="font-bold text-yellow-800 mb-3 text-center">אם אתה קפטן, בחר את הקבוצה שלך:</p><div class="grid grid-cols-3 gap-3">';
  teams.forEach(team => {
    const claimant = claimantOf(game, team.id);
    const taken = !!claimant;
    html += '<button data-claim-btn="'+escapeHtml(team.color)+'" onclick="handleClaimTeam(\''+escapeHtml(team.id)+'\')" '+(taken?'disabled':'')+' class="p-4 rounded-xl '+(taken?'bg-gray-200 opacity-50 cursor-not-allowed':'bg-white border-2 border-gray-300 hover:border-blue-500')+'">'+
      renderTeamShirt(team.color, 'w-12 h-12')+
      '<p class="font-bold text-sm">'+escapeHtml(colorHe(team.color))+'</p><p class="text-xs text-gray-600">'+escapeHtml(playerName(game, team.captainId))+'</p>'+
      (taken?'<p class="text-xs text-red-600 mt-1">תפוס</p>':'')+'</button>';
  });
  html += '</div></div>';
  return html;
}

function joinForm(labelText) {
  return '<div class="max-w-md mx-auto mb-6" data-join-form><p class="font-bold mb-3">'+escapeHtml(labelText)+'</p>'+
    '<input id="nicknameInput" type="text" value="'+escapeHtml(state.nickname)+'" oninput="handleNicknameInput(this.value)" class="w-full p-3 border-2 border-gray-300 rounded-xl mb-3 text-right" placeholder="הכינוי שלך">'+
    '<button onclick="handleJoinGame()" class="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600">הצטרף</button></div>';
}

function renderLobby(game) {
  const me = myParticipant(game);
  const teams = game.teams || [];
  const claimedCount = teams.filter(t => claimantOf(game, t.id)).length;
  const host = isHost(game);

  let html = '<div class="min-h-screen bg-gradient-to-br from-indigo-500 to-blue-600 p-4"><div class="max-w-6xl mx-auto">'+
    '<div class="bg-white rounded-3xl shadow-2xl p-8 mb-6"><div class="text-center mb-8">'+
    '<div class="text-6xl mb-4">🎮</div><h2 class="text-3xl font-bold mb-2">אולם המתנה</h2>'+
    '<p class="text-gray-600">שלושת הקפטנים צריכים לבחור את הקבוצה שלהם</p>'+
    gameCodeBar('bg-blue-100', 'text-blue-700')+
    '</div>';

  if (!me) html += joinForm('הזן את הכינוי שלך:');

  html += '<div class="mb-8"><h3 class="text-xl font-bold mb-4">הקבוצות ('+claimedCount+'/3 קפטנים מחוברים):</h3><div class="grid md:grid-cols-3 gap-4">';
  teams.forEach(team => { html += teamCard(game, team, { showRelease: host }); });
  html += '</div></div>';

  html += '<div class="border-t-2 pt-6"><h3 class="text-xl font-bold mb-4">משתתפים ('+(game.participants||[]).length+'):</h3>'+
    '<div class="grid grid-cols-2 md:grid-cols-4 gap-3">';
  (game.participants || []).forEach(participant => {
    const team = participant.teamId ? teamById(game, participant.teamId) : null;
    html += '<div class="bg-white rounded-xl p-4 border-2 border-gray-300 flex items-center justify-between gap-2" data-participant="'+escapeHtml(participant.nick)+'">'+
      '<div class="flex items-center gap-2">'+renderTeamShirt(team?team.color:null, 'w-8 h-8', false)+
      '<div><p class="font-bold text-sm">'+escapeHtml(participant.nick)+(participant.id===game.hostId?' <span class="text-xs text-purple-600">(מנהל)</span>':'')+'</p>'+
      (team?'<p class="text-xs text-gray-600">'+escapeHtml(colorHe(team.color))+'</p>':'<p class="text-xs text-gray-400">צופה</p>')+
      '</div></div>'+(team?'<span class="text-2xl">✓</span>':'')+'</div>';
  });
  html += '</div></div>';

  if (me) html += '<div class="mt-6">'+claimPanel(game)+'</div>';

  if (host) {
    html += '<div class="border-t-2 pt-6 mt-6"><h3 class="text-xl font-bold mb-4">הגדרות דראפט</h3><div class="mb-4">'+
      '<button onclick="handleToggleManualOrder()" class="w-full py-3 rounded-xl font-medium '+(state.manualOrder?'bg-purple-500 text-white':'bg-gray-200 text-gray-700')+'">'+(state.manualOrder?'✓ סדר ידני פעיל':'סדר אקראי (לחץ לסדר ידני)')+'</button></div>';
    if (state.manualOrder && state.draftOrder.length) {
      html += '<div class="bg-gray-50 rounded-xl p-4 mb-4"><div class="flex items-center justify-between mb-3">'+
        '<h4 class="font-bold text-gray-700">סדר הקבוצות:</h4>'+
        '<button onclick="handleRandomizeDraftOrder()" class="text-sm bg-purple-100 text-purple-700 px-3 py-1 rounded-lg hover:bg-purple-200">🔀 ערבב</button></div>'+
        '<p class="text-xs text-gray-500 mb-3">הסדר יהפוך כל סיבוב</p><div class="space-y-2">';
      state.draftOrder.forEach((teamId, index) => {
        const team = teamById(game, teamId);
        if (!team) return;
        html += '<div class="flex items-center gap-2 bg-white p-3 rounded-lg"><span class="font-bold text-lg text-gray-500 w-8">'+(index+1)+'.</span>'+
          renderTeamShirt(team.color, 'w-8 h-8', false)+'<div class="flex-1">'+
          '<span class="font-bold">'+escapeHtml(colorHe(team.color))+'</span><span class="text-sm text-gray-500 mr-2">('+escapeHtml(playerName(game, team.captainId))+')</span></div>'+
          '<div class="flex gap-1"><button onclick="handleMoveDraftOrder(\''+escapeHtml(teamId)+'\',-1)" '+(index===0?'disabled':'')+' class="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">↑</button>'+
          '<button onclick="handleMoveDraftOrder(\''+escapeHtml(teamId)+'\',1)" '+(index===state.draftOrder.length-1?'disabled':'')+' class="w-8 h-8 bg-gray-200 rounded hover:bg-gray-300 disabled:opacity-30">↓</button></div></div>';
      });
      html += '</div></div>';
    }
    html += '</div>';

    const allClaimed = claimedCount === 3;
    html += '<button data-start-draft onclick="handleStartDraft()" '+(allClaimed?'':'disabled')+' class="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white py-4 rounded-xl font-bold text-lg disabled:opacity-50 flex items-center justify-center gap-2 mb-2">▶️ התחל דראפט</button>';
    if (!allClaimed) {
      html += '<p class="text-xs text-center text-gray-500 mb-2">ממתין ל-'+(3-claimedCount)+' קפטנים שיתחברו</p>'+
        '<button data-start-anyway onclick="handleStartDraftAnyway()" class="w-full bg-gray-200 text-gray-700 py-2 rounded-xl text-sm font-bold mb-4">התחל בלי כולם — אני אנהל את הקבוצות החסרות</button>';
    }
    html += '<div class="border-t-2 pt-4 mt-4"><div class="flex gap-2">'+
      '<button onclick="handleResetDraft()" class="flex-1 bg-gray-500 text-white py-3 rounded-xl font-bold hover:bg-gray-600">🔄 אפס בחירות</button>'+
      '<button onclick="handleFullReset()" class="px-4 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600" title="צא מהמשחק במכשיר הזה">🚪</button></div></div>';
  } else {
    html += '<div class="border-t-2 pt-4 mt-6 text-center text-sm text-gray-500" data-waiting-start>ממתין שהמנהל יתחיל את הדראפט…</div>'+
      hostRecoveryBlock()+
      '<div class="mt-4 text-center"><button onclick="handleFullReset()" class="text-xs text-gray-400 underline">צא מהמשחק במכשיר הזה</button></div>';
  }

  html += '</div></div></div>';
  return html;
}

function renderDraft(game) {
  const turn = getCurrentTurn(game);
  const me = myParticipant(game);
  const host = isHost(game);
  const total = totalPicksNeeded(game);
  const made = (game.picks || []).length;

  let html = '<div class="min-h-screen bg-gradient-to-br from-green-600 to-teal-600 p-4"><div class="max-w-6xl mx-auto">';

  if (turn) {
    html += '<div data-turn-banner data-turn-color="'+escapeHtml(turn.team.color)+'" data-pick-no="'+(made+1)+'" class="mb-6 p-6 rounded-3xl shadow-xl '+(turn.isMine?'bg-yellow-400':'bg-white')+'">'+
      '<div class="text-center" aria-live="polite"><p class="text-2xl font-bold mb-2">'+(turn.isMine?'🔥 התור שלך לבחור! 🔥':'⏳ התור של: '+escapeHtml(turn.captainName))+'</p>'+
      '<p class="text-lg font-medium">קבוצה: <span class="font-bold" data-turn-team>'+escapeHtml(colorHe(turn.team.color))+'</span></p>'+
      '<p class="text-sm text-gray-700 mt-1">סבב '+turn.round+' · בחירה '+(made+1)+' מתוך '+total+'</p>'+
      (turn.unclaimed?'<p class="text-sm font-bold text-orange-700 mt-1" data-unclaimed-turn>⚠️ לקבוצה הזו אין קפטן מחובר'+(host?' — אתה מנהל אותה':'')+'</p>':'')+
      '<div class="mt-2 inline-flex items-center gap-2 text-xs '+(turn.isMine?'text-gray-700':'text-green-600')+' bg-white bg-opacity-50 px-3 py-1 rounded-full">'+
      '<div class="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>מסונכרן בזמן אמת</div></div></div>';
  }

  if (!me) html += '<div class="bg-white rounded-3xl shadow-2xl p-6 mb-6">'+joinForm('הצטרף לדראפט (קפטן שהתחבר מחדש או צופה):')+'</div>';
  else if (!me.teamId) html += '<div class="bg-white rounded-3xl shadow-2xl p-6 mb-6">'+claimPanel(game)+'</div>';

  if (game.pendingPick) {
    const pending = game.pendingPick;
    const canConfirm = turn && turn.isMine && pending.teamId === turn.teamId;
    // Sticky: with 21 names on screen the confirm button would otherwise be
    // scrolled hundreds of pixels off the top by the time you pick someone
    // near the bottom of the list.
    html += '<div data-pending class="d21-pending-sticky mb-6 p-6 rounded-2xl bg-orange-100 border-4 border-orange-400 shadow-xl">'+
      '<div class="text-center"><p class="text-lg font-bold text-orange-800 mb-3">✓ נבחר: <span data-pending-name>'+escapeHtml(pending.playerName || playerName(game, pending.playerId))+'</span></p>';
    if (canConfirm) {
      html += '<div class="flex gap-3 justify-center flex-wrap">'+
        '<button data-confirm-pick onclick="handleConfirmPick()" class="bg-green-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-green-600">✓ סיימתי - עבור לתור הבא</button>'+
        '<button data-cancel-pending onclick="handleCancelPending()" class="bg-gray-400 text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-500">✗ בטל בחירה</button>'+
        '</div>';
    } else {
      html += '<p class="text-sm text-gray-600 mt-2">ממתין לאישור הקפטן...</p>';
      if (host) html += '<button data-cancel-pending onclick="handleCancelPending()" class="mt-3 bg-gray-400 text-white px-6 py-2 rounded-xl font-bold text-sm">בטל בחירה (מנהל)</button>';
    }
    html += '</div></div>';
  }

  html += '<div class="bg-white rounded-3xl shadow-2xl p-6 mb-6"><div class="flex items-center justify-between mb-4 flex-wrap gap-2">'+
    '<h3 class="text-2xl font-bold">שחקנים זמינים</h3>';
  if (host && made > 0) {
    html += '<button data-undo onclick="handleUndoPick()" class="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold hover:bg-red-200">↶ אחורה (מנהל)</button>';
  }
  html += '</div><div class="grid grid-cols-2 md:grid-cols-4 gap-3">';
  availablePlayers(game).forEach(player => {
    const canPick = !!(turn && turn.isMine && !game.pendingPick);
    html += '<button data-pick-player="'+escapeHtml(player.id)+'" data-pick-name="'+escapeHtml(player.name)+'" onclick="handleMakePick(\''+escapeHtml(player.id)+'\')" '+(!canPick?'disabled':'')+' class="p-4 rounded-xl border-2 '+(canPick?'bg-gradient-to-br from-blue-400 to-purple-500 text-white border-purple-600 hover:scale-105':'bg-gray-100 text-gray-500 border-gray-300 cursor-not-allowed')+'">'+escapeHtml(player.name)+'</button>';
  });
  html += '</div></div><div class="grid md:grid-cols-3 gap-4 mb-6">';
  (game.teams || []).forEach(team => {
    html += teamCard(game, team, { showRoster: true, showRelease: host });
  });
  html += '</div>';

  if (host) {
    html += '<div class="flex gap-2"><button onclick="handleResetDraft()" class="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600">🔄 אפס בחירות</button>'+
      '<button onclick="handleFullReset()" class="px-4 bg-gray-500 text-white py-3 rounded-xl font-bold hover:bg-gray-600" title="צא מהמשחק במכשיר הזה">🚪</button></div>';
  } else {
    html += hostRecoveryBlock();
  }
  html += '</div></div>';
  return html;
}

function renderComplete(game) {
  const host = isHost(game);
  let html = '<div class="min-h-screen bg-gradient-to-br from-yellow-400 to-orange-500 p-4"><div class="max-w-4xl mx-auto">'+
    '<div class="bg-white rounded-3xl shadow-2xl p-8 mb-6"><div class="text-center mb-8">'+
    '<div class="text-7xl mb-4 animate-bounce">🏆</div><h2 class="text-4xl font-bold mb-2" data-complete>הדראפט הסתיים!</h2>'+
    '<p class="text-gray-600">הנה הקבוצות שלכם</p></div><div class="grid md:grid-cols-3 gap-6 mb-8">';
  (game.teams || []).forEach(team => {
    html += '<div class="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-6 border-4 border-gray-300" data-final-team="'+escapeHtml(team.color)+'">'+
      renderTeamShirt(team.color, 'w-16 h-16')+
      '<h3 class="text-2xl font-bold text-center mb-3">'+escapeHtml(colorHe(team.color))+'</h3>'+
      '<div class="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-3 mb-4">'+
      '<p class="text-center font-bold text-yellow-800">👑 '+escapeHtml(playerName(game, team.captainId))+'</p></div><div class="space-y-2">';
    teamRoster(game, team.id).filter(id => id !== team.captainId).forEach(id => {
      html += '<div class="bg-white p-3 rounded-lg text-center border border-gray-200" data-roster-player="'+escapeHtml(id)+'">'+escapeHtml(playerName(game, id))+'</div>';
    });
    html += '</div></div>';
  });
  html += '</div><div class="space-y-4">'+
    '<button data-share-wa onclick="handleShareWhatsApp()" class="w-full bg-green-500 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-600 flex items-center justify-center gap-2">📤 שתף בוואטסאפ</button>'+
    '<button data-copy-teams onclick="handleCopyTeams()" class="w-full bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">📋 העתק את הטקסט</button>';
  if (host) {
    html += '<div class="flex gap-2">'+
      '<button onclick="handleResetDraft()" class="flex-1 bg-gray-500 text-white py-3 rounded-xl font-bold hover:bg-gray-600">🔄 התחל דראפט חדש</button>'+
      '<button onclick="handleFullReset()" class="px-4 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600" title="צא מהמשחק במכשיר הזה">🚪</button></div>';
  } else {
    html += hostRecoveryBlock();
  }
  html += '</div></div></div></div>';
  return html;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

window.handlePlayerInput = v => { state.input = v; };
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
window.handleReleaseTeam = releaseTeam;
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
window.handleUndoPick = undoPick;
window.handleCancelPending = cancelPendingPick;
window.handleResetDraft = resetDraft;
window.handleShareWhatsApp = shareWhatsApp;
window.handleFullReset = fullReset;
window.handleRecoverHost = recoverHost;
window.handleCopyTeams = () => {
  if (!state.gameData) return;
  copyText(buildWhatsAppText(state.gameData), () => showNotice('הטקסט הועתק'));
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
    const btn = document.querySelector('[data-copy-btn]');
    if (btn) { btn.textContent = 'הועתק!'; setTimeout(() => { btn.textContent = '🔗 העתק קישור'; }, 2000); }
  });
};

init();
