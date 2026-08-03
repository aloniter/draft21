/* Draft21 — Firestore rules verification.
 *
 * Run this AFTER deploying firestore.rules to confirm the rules are live and
 * that they permit every legitimate draft operation.
 *
 *   node verify-rules.mjs
 *
 * It talks to Firestore over REST with the same public web API key the app
 * uses, i.e. as an ordinary untrusted client. It creates ONE dedicated test
 * game of its own and never reads, modifies or deletes any other document.
 *
 * Requires Node 18+ (uses global fetch). No dependencies.
 */

const PROJECT = 'draft21-eabc3';
const KEY = 'AIzaSyBqz4oHoqGtnzjWqgzjWmwsUv6Kny75QpM';
const ROOT = process.env.FS_ROOT || `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const USE_KEY = process.env.FS_KEY === '' ? '' : (process.env.FS_KEY || KEY);
const q = extra => (USE_KEY ? `?key=${USE_KEY}${extra ? '&' + extra : ''}` : (extra ? `?${extra}` : ''));

const TEST_ID = 'ruletest-' + Date.now().toString(36);

let pass = 0;
const failures = [];
function report(name, ok, detail = '') {
  if (ok) pass++; else failures.push(name + (detail ? ' — ' + detail : ''));
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
}

/* ---- typed-value encoding for the REST API ---- */
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  const fields = {};
  Object.entries(v).forEach(([k, val]) => { fields[k] = enc(val); });
  return { mapValue: { fields } };
}
const encFields = obj => {
  const fields = {};
  Object.entries(obj).forEach(([k, v]) => { fields[k] = enc(v); });
  return fields;
};

const create = (id, data) =>
  fetch(`${ROOT}/games${q('documentId=' + id)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encFields(data) })
  });

const patch = (id, data) => {
  const mask = Object.keys(data).map(k => `updateMask.fieldPaths=${k}`).join('&');
  return fetch(`${ROOT}/games/${id}${q(mask)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: encFields(data) })
  });
};

const del = id => fetch(`${ROOT}/games/${id}${q()}`, { method: 'DELETE' });
const read = id => fetch(`${ROOT}/games/${id}${q()}`);

async function allowed(name, res) {
  const r = await res;
  report(name, r.ok, r.ok ? '' : 'HTTP ' + r.status + ' ' + (await r.text()).slice(0, 120));
}
async function denied(name, res) {
  const r = await res;
  report(name, r.status === 403, r.status === 403 ? '' : 'HTTP ' + r.status + ' (expected 403)');
}

/* ---- fixtures mirroring what the app actually writes ---- */
const players = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, name: 'בדיקה ' + i }));
const TEAMS = [
  { id: 't0', color: 'Red', captainId: 'p0' },
  { id: 't1', color: 'White', captainId: 'p1' },
  { id: 't2', color: 'Black', captainId: 'p2' }
];
const ORDER = ['t1', 't0', 't2'];
const parts = TEAMS.map((t, i) => ({ id: 'dev' + i, nick: 'קפטן ' + i, teamId: t.id, ready: true }));
const pick = (pid, tid, seq) => ({ playerId: pid, playerName: 'בדיקה', teamId: tid, byId: 'dev0', seq });

console.log(`\nDraft21 rules verification`);
console.log(`endpoint: ${ROOT}`);
console.log(`test game: ${TEST_ID}\n`);

console.log('1. deletion is blocked');
await denied('arbitrary game deletion (non-existent id, nothing touched)', del('probe-does-not-exist'));

console.log('\n2. normal game creation works');
await allowed('create game', create(TEST_ID, {
  schema: 2, hostId: 'dev-host', hostKey: 'TEST', status: 'captains',
  players, teams: [], participants: [], picks: [],
  turn: { order: [], index: 0, direction: 1 },
  settings: { snake: true }, pendingPick: null, lastPick: null
}));
await allowed('read game', read(TEST_ID));

console.log('\n3. invalid creations are blocked');
await denied('create with only 5 players', create(TEST_ID + '-bad1', {
  schema: 2, hostId: 'h', hostKey: 'T', status: 'captains',
  players: players.slice(0, 5), teams: [], participants: [], picks: [],
  turn: { order: [], index: 0, direction: 1 }, settings: { snake: true }, pendingPick: null, lastPick: null
}));
await denied('create with an extra unknown field', create(TEST_ID + '-bad2', {
  schema: 2, hostId: 'h', hostKey: 'T', status: 'captains', backdoor: true,
  players, teams: [], participants: [], picks: [],
  turn: { order: [], index: 0, direction: 1 }, settings: { snake: true }, pendingPick: null, lastPick: null
}));

console.log('\n4. every legitimate draft mutation works');
await allowed('host finalizes captains', patch(TEST_ID, { teams: TEAMS, status: 'lobby' }));
await allowed('participant joins', patch(TEST_ID, { participants: [{ id: 'dev0', nick: 'קפטן 0', teamId: null, ready: false }] }));
await allowed('captain claims a team', patch(TEST_ID, { participants: parts }));
await allowed('host releases a team', patch(TEST_ID, { participants: parts.map((p, i) => i === 0 ? { ...p, teamId: null, ready: false } : p), pendingPick: null }));
await allowed('captain reclaims after losing local state', patch(TEST_ID, { participants: parts }));
await allowed('host starts the draft', patch(TEST_ID, { status: 'draft', turn: { order: ORDER, index: 0, direction: 1 }, picks: [], pendingPick: null, lastPick: null }));
await allowed('captain creates a pending pick', patch(TEST_ID, { pendingPick: { playerId: 'p3', playerName: 'בדיקה 3', teamId: 't1', byId: 'dev1' } }));
await allowed('captain cancels the pending pick', patch(TEST_ID, { pendingPick: null }));
await allowed('captain confirms a pick', patch(TEST_ID, {
  picks: [pick('p3', 't1', 0)], pendingPick: null, lastPick: pick('p3', 't1', 0),
  turn: { order: ORDER, index: 1, direction: 1 }, status: 'draft'
}));
await allowed('host undoes the pick', patch(TEST_ID, {
  picks: [], pendingPick: null, lastPick: null, turn: { order: ORDER, index: 0, direction: 1 }, status: 'draft'
}));
await allowed('draft reaches completion', patch(TEST_ID, {
  picks: [pick('p3', 't1', 0), pick('p4', 't0', 1), pick('p5', 't2', 2)],
  pendingPick: null, lastPick: pick('p5', 't2', 2),
  turn: { order: ORDER, index: 0, direction: 1 }, status: 'complete'
}));
await allowed('host resets to lobby', patch(TEST_ID, {
  status: 'lobby', picks: [], pendingPick: null, lastPick: null, turn: { order: [], index: 0, direction: 1 }
}));
await allowed('host recovery moves hostId alone', patch(TEST_ID, { hostId: 'dev-host-2' }));

console.log('\n5. protected game state cannot be modified');
await denied('rename a player', patch(TEST_ID, { players: players.map((p, i) => i === 0 ? { ...p, name: 'מושתל' } : p) }));
await denied('add a player', patch(TEST_ID, { players: players.concat([{ id: 'p99', name: 'גנוב' }]) }));
await denied('remove a player', patch(TEST_ID, { players: players.slice(0, 5) }));
await denied('change hostKey', patch(TEST_ID, { hostKey: 'HACK' }));
await denied('change schema', patch(TEST_ID, { schema: 3 }));
await denied('change settings', patch(TEST_ID, { settings: { snake: false } }));
await denied('hijack hostId alongside other fields', patch(TEST_ID, { hostId: 'attacker', status: 'complete' }));
await denied('set an invalid status', patch(TEST_ID, { status: 'setup' }));
await denied('add a 4th team', patch(TEST_ID, { teams: TEAMS.concat([{ id: 't3', color: 'Green', captainId: 'p5' }]) }));
await denied('add an unknown field', patch(TEST_ID, { backdoor: 'yes' }));

console.log('\n6. the test game itself cannot be deleted');
await denied('delete the test game', del(TEST_ID));

const total = pass + failures.length;
console.log(`\n${pass}/${total} checks passed`);
if (failures.length) {
  console.log('\nFAILURES:');
  failures.forEach(f => console.log(' - ' + f));
  console.log('\nRules are NOT behaving as expected. Do not rely on them yet.');
} else {
  console.log('\nRules are live and correct.');
}
// Report exactly which documents this run left behind. When the rules are live
// the two "-bad" creations are refused, so only the main test game remains.
const candidates = [TEST_ID, TEST_ID + '-bad1', TEST_ID + '-bad2'];
const leftover = [];
for (const id of candidates) {
  const r = await read(id);
  if (r.ok) leftover.push(id);
}
console.log('\nDocuments this run left behind:');
leftover.forEach(id => console.log('  games/' + id));
if (!leftover.length) console.log('  none');
else console.log('Rules (correctly) forbid client deletion, so remove them from the Firebase console.');
process.exit(failures.length ? 1 : 0);
