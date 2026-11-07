// Test de bout en bout sur le serveur compilé, en mode accéléré (DG_FAST=1 : pauses éclair, 1,5 s par tour).
// Partie 1 : 4 humains (socket.io) + 1 bot, deux desseins chacun. Une spectatrice arrive en route, Bob se déconnecte
//   puis reprend sa place, une session volée est refusée, Chloé quitte la table (pilote automatique), Dan ne joue
//   jamais (ses cartes partent d'office à la fin du temps).
// Partie 2 : revanche à 5 sans dessein, sans limite de temps. Partie 3 : à 2, un seul dessein.
// À chaque état reçu, on vérifie qu'aucune information cachée ne fuit : ni la Maison d'un Incognito posé (salon,
// domaines, dernière carte, carte chassée), ni la main ou les desseins d'un autre, ni la pioche elle-même ; qu'aucun
// état n'arrive pour rien ; on rejoue chaque carte posée sur l'état d'avant (bon tour, endroit libre, bonne place,
// Vipère et Intouchables) ; et à la fin, on recompte tout à partir de ce qui est dévoilé.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = `http://localhost:${PORT}`;
const server = spawn(process.execPath, ['dist/server/index.mjs'], {
  env: { ...process.env, PORT: String(PORT), DG_FAST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (4 min)'), 240_000).unref();
await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

// Recopié de la règle, pour ne pas dépendre du code testé.
const HOUSES = ['parfum', 'verre', 'horloge', 'soie', 'sucre', 'carte'];
const REMOVED = { 2: 30, 3: 18, 4: 6, 5: 0 };
const weight = (c) => (c.role === 'eminence' ? 2 : 1);
const SIGN = { grace: 1, disgrace: -1, neutre: 0 };
const POINTS = { chute: 3, gloire: 3, eventail: 3, eminences: 3, gardes: 3, paire: 5, faveurs: 5, pur: 5, foule: 5, neutres: 5, clan: 5 };
function judge(id, me, domains, standing) {
  const mine = domains.get(me) ?? [];
  const [k, a, b] = id.split(':');
  const here = new Set(mine.map((c) => c.house));
  switch (k) {
    case 'chute':
      return standing[a] === 'disgrace';
    case 'gloire':
      return standing[a] === 'grace';
    case 'eventail':
      return here.size >= 5;
    case 'eminences':
      return mine.filter((c) => c.role === 'eminence').length >= 3;
    case 'gardes':
      return mine.filter((c) => c.role === 'intouchable').length >= 2;
    case 'paire':
      return standing[a] === 'grace' && standing[b] === 'disgrace';
    case 'faveurs':
      return [...here].filter((h) => standing[h] === 'grace').length >= 3;
    case 'pur':
      return mine.length > 0 && mine.every((c) => standing[c.house] !== 'disgrace');
    case 'foule':
      return [...domains].every(([id, cards]) => id === me || mine.length > cards.length);
    case 'neutres':
      return HOUSES.filter((h) => standing[h] === 'neutre').length >= 2;
    case 'clan':
      return HOUSES.some((h) => mine.filter((c) => c.house === h).length >= 5);
  }
  fail(`dessein inconnu ${id}`);
}

const PLAYER_KEYS = 'autopilot,avatar,connected,domain,id,isBot,isHost,name,seat,status,wins';
const GAME_KEYS = 'deck,endsAt,hand,last,missions,order,pause,salon,turn,used';
const CARD_KEYS = 'house,id,role';
const LAST_KEYS = 'area,auto,by,card,n,owner,removed,side';
const stats = { states: 0, gestures: 0, moves: 0, auto: 0, hunts: 0, incognitos: 0, refused: new Map() };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const keys = (o) => Object.keys(o).sort().join(',');

/** La Maison vue de chaque carte posée : elle ne change jamais, et un Incognito n'en montre aucune. */
const houseOf = new Map();
/** Les clés anti-doublon d'une partie, remises à zéro à chaque nouvelle partie. */
let game = { n: 0, domains: new Map(), players: 0, missions: 2 };

function client(name, { avatar = 'chapeau', mode = 'actif' } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, avatar, mode, view: null, session: null, inFlight: 0, actedAt: 0, busy: false };
  socket.on('state', (v) => {
    const prev = c.view;
    c.view = v;
    audit(c, prev, v);
    void play(c);
  });
  socket.on('disconnect', () => (c.view = null));
  c.call = (event, payload = {}) => {
    c.inFlight++;
    c.actedAt = performance.now();
    stats.gestures++;
    return new Promise((res) =>
      socket.emit(event, payload, (r) => {
        // Marqué ici, dans l'accusé de réception : l'état qui suit un geste n'est pas « pour rien ».
        c.inFlight--;
        c.actedAt = performance.now();
        if (!r.ok) stats.refused.set(r.error, (stats.refused.get(r.error) ?? 0) + 1);
        if (r.error === 'Erreur inattendue du serveur.') fail(`${event} : erreur du serveur`);
        res(r);
      }),
    );
  };
  c.timer = setInterval(() => void play(c), 50);
  return c;
}

const connected = (c) => new Promise((r) => (c.socket.connected ? r() : c.socket.once('connect', r)));
async function waitFor(what, test, ms = 6000) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    if (test()) return;
    await pause(15);
  }
  fail(`attente trop longue : ${what}`);
}

const shown = (v) => JSON.stringify({ ...v, serverNow: 0 });
const salonCards = (s) => [...HOUSES.flatMap((h) => [...s.houses[h].up, ...s.houses[h].down]), ...s.veiled.up, ...s.veiled.down];

/** Une carte posée, vue de tous : un Incognito sans Maison, les autres avec la même Maison à chaque fois. */
function placed(card, where) {
  if (keys(card) !== CARD_KEYS) fail(`${where} : une carte vue avec ${keys(card)}`);
  if (card.role === 'incognito') {
    if (card.house !== null) fail(`${where} : un Incognito posé montre sa Maison`);
    return;
  }
  if (!HOUSES.includes(card.house)) fail(`${where} : une carte sans Maison`);
  if (houseOf.has(card.id) && houseOf.get(card.id) !== card.house) fail(`la carte ${card.id} a changé de Maison`);
  houseOf.set(card.id, card.house);
}

function audit(c, prev, v) {
  stats.states++;
  const json = JSON.stringify(v);
  for (const word of ['"token"', '"hands"', '"skill', '"brain', '"memory', '"deckCards"', '"autoAt"', '"pauseUntil"']) {
    if (json.includes(word)) fail(`la vue de ${c.name} contient ${word}`);
  }
  if (v.game && Array.isArray(v.game.deck)) fail('la pioche elle-même est visible');
  // En partie, tout est public sauf la main : un état identique au précédent trahirait un geste caché.
  if (prev?.phase === 'playing' && v.phase === 'playing' && shown(prev) === shown(v) && c.inFlight === 0 && performance.now() - c.actedAt > 40) {
    fail(`${c.name} reçoit un état sans rien de neuf`);
  }
  for (const p of v.players) if (keys(p) !== PLAYER_KEYS) fail(`un joueur vu avec ${keys(p)}`);
  if (v.phase !== 'finished' && v.final) fail('un tableau final avant la fin');
  if (v.phase !== 'playing') {
    if (v.game) fail('une partie visible hors jeu');
    if (v.players.some((p) => p.seat !== null || p.domain !== null)) fail('un siège ou un domaine hors jeu');
    if (v.phase === 'finished') checkFinal(c, v);
    return;
  }
  const g = v.game;
  if (keys(g) !== GAME_KEYS) fail(`une partie vue avec ${keys(g)}`);
  const seated = g.order.includes(v.me);
  if (seated !== !!g.hand || seated !== !!g.missions) fail(`${c.name} : main ou desseins visibles pour un siège ${seated}`);
  if (g.hand) {
    if (g.hand.length > 3) fail(`${c.name} a ${g.hand.length} cartes en main`);
    for (const h of g.hand) {
      if (keys(h) !== CARD_KEYS || !HOUSES.includes(h.house)) fail(`${c.name} : une carte en main sans sa Maison`);
      if (otherHolds(v.me, h.id)) fail(`la carte ${h.id} est dans deux mains`);
    }
    const want = game.missions === 2 ? ['petit', 'grand'] : game.missions === 1 ? ['petit'] : [];
    const kinds = g.missions.map((m) => (POINTS[m.split(':')[0]] === 3 ? 'petit' : 'grand'));
    if (kinds.join() !== want.join()) fail(`${c.name} : desseins ${g.missions.join(' ')} pour le réglage ${game.missions}`);
  }
  for (const p of v.players) {
    if (g.order.includes(p.id) ? p.domain === null || p.seat === null : p.domain !== null) fail(`domaine de ${p.name} mal annoncé`);
    for (const card of p.domain ?? []) placed(card, `domaine de ${p.name}`);
  }
  for (const card of salonCards(g.salon)) placed(card, 'salon');
  for (const h of HOUSES) for (const card of [...g.salon.houses[h].up, ...g.salon.houses[h].down]) if (card.house !== h || card.role === 'incognito') fail(`une carte rangée chez les ${h} à tort`);
  for (const card of [...g.salon.veiled.up, ...g.salon.veiled.down]) if (card.role !== 'incognito') fail('une carte visible dans la loge');
  // La pioche au départ : 90 cartes, moins celles retirées, moins trois par joueur.
  if (!g.last && !prev?.game) {
    const n = g.order.length;
    if (g.deck !== 90 - REMOVED[n] - 3 * n) fail(`pioche de ${g.deck} cartes au départ à ${n}`);
  }
  if (g.last) {
    if (keys(g.last) !== LAST_KEYS) fail(`dernière carte vue avec ${keys(g.last)}`);
    placed(g.last.card, 'dernière carte');
    if (g.last.removed) placed(g.last.removed.card, 'carte chassée');
  }
  // La carte qui vient d'être posée : on la rejoue sur l'état d'avant.
  const m = g.last;
  const pg = prev?.phase === 'playing' ? prev.game : null;
  if (m && pg && pg.last?.n !== m.n) {
    if (m.n !== (pg.last?.n ?? 0) + 1) fail(`${c.name} a sauté une carte (${pg.last?.n} → ${m.n})`);
    if (m.by !== pg.turn) fail(`${m.by} a joué hors de son tour`);
    if (pg.used.includes(m.area)) fail(`deux cartes ${m.area} le même tour`);
    if (pg.pause) fail('une carte posée pendant la pause');
    const domainOf = (view, id) => view.players.find((p) => p.id === id)?.domain ?? [];
    let where;
    if (m.area === 'salon') {
      if (!m.side || m.owner) fail('une carte au salon sans côté');
      where = m.card.role === 'incognito' ? g.salon.veiled[m.side] : g.salon.houses[m.card.house][m.side];
    } else {
      const owner = m.area === 'home' ? m.by : m.owner;
      if (m.area === 'home' && m.owner !== m.by) fail('une carte « chez soi » posée ailleurs');
      if (m.area === 'rival' && (m.owner === m.by || !g.order.includes(m.owner))) fail('une carte chez un rival qui n’en est pas un');
      if (m.side) fail('un côté hors du salon');
      where = domainOf(v, owner);
    }
    if (!where.some((x) => x.id === m.card.id)) fail(`coup ${m.n} : la carte n'est pas où elle devait aller`);
    if (m.removed) {
      if (m.card.role !== 'vipere') fail('une carte chassée sans Vipère');
      if (m.removed.card.role === 'intouchable') fail('un Intouchable chassé');
      const before = m.area === 'salon' ? salonCards(pg.salon) : domainOf(prev, m.area === 'home' ? m.by : m.owner);
      if (!before.some((x) => x.id === m.removed.card.id)) fail('une carte chassée hors de l’endroit visé');
      const after = [...salonCards(g.salon), ...v.players.flatMap((p) => p.domain ?? [])];
      if (after.some((x) => x.id === m.removed.card.id)) fail('la carte chassée est restée en jeu');
      if (c === watcher) stats.hunts++;
    }
    if (m.by === v.me && g.hand?.some((h) => h.id === m.card.id)) fail('la carte posée est restée en main');
    if (c === watcher) {
      stats.moves++;
      if (m.auto) stats.auto++;
      if (m.card.role === 'incognito') stats.incognitos++;
    }
  }
  if (c === watcher) for (const p of v.players) if (p.domain) game.domains.set(p.id, p.domain.map((x) => x.id).sort().join());
}

const all = [];
function otherHolds(me, id) {
  return all.some((x) => x.view?.me !== me && x.view?.game?.hand?.some((h) => h.id === id));
}

function checkFinal(c, v) {
  const f = v.final;
  if (!f) fail('une fin sans tableau');
  if (c !== watcher || game.checked) return;
  game.checked = true;
  // Le salon dévoilé : chaque carte dans sa Maison, et le jugement de la Duchesse recalculé.
  const standing = {};
  for (const h of HOUSES) {
    const col = f.salon[h];
    for (const card of [...col.up, ...col.down]) {
      if (card.house !== h) fail(`fin : une carte rangée chez les ${h} à tort`);
      if (card.veiled !== (card.role === 'incognito')) fail('fin : un Incognito mal marqué');
      if (houseOf.has(card.id) && houseOf.get(card.id) !== h) fail('fin : une carte a changé de Maison');
    }
    const up = col.up.reduce((s, x) => s + weight(x), 0);
    const down = col.down.reduce((s, x) => s + weight(x), 0);
    standing[h] = up > down ? 'grace' : down > up ? 'disgrace' : 'neutre';
    const fh = f.houses.find((x) => x.house === h);
    if (!fh || fh.up !== up || fh.down !== down || fh.standing !== standing[h]) fail(`fin : jugement des ${h} faux`);
  }
  const domains = new Map(f.players.map((p) => [p.id, p.domain]));
  const best = Math.max(...f.players.map((p) => p.score));
  for (const p of f.players) {
    const ids = p.domain.map((x) => x.id).sort().join();
    if (game.domains.has(p.id) && game.domains.get(p.id) !== ids) fail(`fin : le domaine de ${p.name} a changé`);
    for (const card of p.domain) {
      if (!HOUSES.includes(card.house)) fail('fin : une carte de domaine sans Maison');
      if (card.veiled !== (card.role === 'incognito')) fail('fin : un Incognito de domaine mal marqué');
    }
    let score = 0;
    for (const h of HOUSES) {
      const cards = p.domain.filter((x) => x.house === h);
      const pts = cards.reduce((s, x) => s + weight(x), 0) * SIGN[standing[h]];
      const line = p.houses.find((x) => x.house === h);
      if (cards.length ? !line || line.points !== pts || line.cards !== cards.length : line) fail(`fin : ${p.name}, ${h} mal compté`);
      score += pts;
    }
    if (p.missions.length !== game.missions) fail(`fin : ${p.name} a ${p.missions.length} desseins`);
    for (const ms of p.missions) {
      const ok = judge(ms.id, p.id, domains, standing);
      if (ms.ok !== ok || ms.points !== (ok ? POINTS[ms.id.split(':')[0]] : 0)) fail(`fin : dessein ${ms.id} de ${p.name} mal jugé`);
      score += ms.points;
    }
    if (score !== p.score) fail(`fin : ${p.name} a ${p.score} au lieu de ${score}`);
    if (p.winner !== (p.score === best)) fail('fin : gagnant mal désigné');
    if (p.place !== 1 + f.players.filter((q) => q.score > p.score).length) fail(`fin : place de ${p.name} fausse`);
  }
  if (f.players.length !== game.players) fail(`fin : ${f.players.length} joueurs au classement au lieu de ${game.players}`);
}

/** Un joueur au hasard : une carte, un endroit encore libre, un côté, un rival, une proie pour la Vipère. */
async function play(c) {
  const v = c.view;
  if (!v || v.phase !== 'playing' || c.mode !== 'actif' || c.inFlight || c.busy) return;
  const g = v.game;
  if (g.pause || g.turn !== v.me || !g.hand?.length || (g.endsAt && g.endsAt <= v.serverNow)) return;
  c.busy = true;
  await pause(Math.random() * 60);
  try {
    if (c.view !== v) return;
    const card = pick(g.hand);
    const area = pick(['salon', 'home', 'rival'].filter((a) => !g.used.includes(a)));
    const rivals = g.order.filter((id) => id !== v.me);
    const rival = area === 'rival' ? pick(rivals) : null;
    const side = area === 'salon' ? pick(['up', 'down']) : null;
    let target = null;
    if (card.role === 'vipere' && Math.random() < 0.8) {
      const pool = area === 'salon' ? salonCards(g.salon) : v.players.find((p) => p.id === (area === 'home' ? v.me : rival)).domain;
      const prey = pool.filter((x) => x.role !== 'intouchable');
      if (prey.length) target = pick(prey).id;
    }
    await c.call('card:play', { card: card.id, area, side, rival, target });
  } finally {
    c.busy = false;
  }
}

// ───────────── Partie 1 ─────────────
const ana = client('Ana', { avatar: 'rose' });
const bob = client('Bob', { avatar: 'violon' });
const chloe = client('Chloé', { avatar: 'paon' });
const dan = client('Dan', { avatar: 'cle', mode: 'absent' });
all.push(ana, bob, chloe, dan);
let watcher = ana;
await Promise.all(all.map(connected));

const created = await ana.call('room:create', { name: 'Ana', avatar: 'rose' });
if (!created.ok) fail(`création : ${created.error}`);
ana.session = created.data;
const code = created.data.code;
if ((await ana.call('game:start')).ok) fail('une partie lancée seul');
for (const c of [bob, chloe, dan]) {
  const res = await c.call('room:join', { code, name: c.name, avatar: c.avatar });
  if (!res.ok) fail(`${c.name} : ${res.error}`);
  c.session = res.data;
}
if ((await bob.call('card:play', { card: 1, area: 'home' })).ok) fail('une carte posée dans le salon d’attente');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
if ((await bob.call('room:settings', { missions: 0 })).ok) fail('un invité a changé les réglages');
if (!(await ana.call('room:settings', { turn: 45, missions: 2 })).ok) fail('réglages refusés');
if (!(await ana.call('room:addBot')).ok) fail('bot refusé');
await waitFor('5 joueurs au salon', () => ana.view?.players.length === 5);
game = { n: 0, domains: new Map(), players: 5, missions: 2 };
houseOf.clear();
if (!(await ana.call('game:start')).ok) fail('lancement refusé');
await waitFor('la partie', () => all.every((c) => c.view?.phase === 'playing'));

// Une carte hors de son tour, deux au salon le même tour, une proie sans Vipère.
{
  const g = ana.view.game;
  const other = all.find((c) => c.view.me !== g.turn && c.view.game.hand?.length);
  if ((await other.call('card:play', { card: other.view.game.hand[0].id, area: 'home' })).ok) fail('une carte posée hors de son tour');
}
bob.mode = 'pause';
await waitFor('un tour de Bob', () => bob.view?.game?.turn === bob.view?.me && !bob.view.game.pause && !bob.view.game.used.length, 30_000);
{
  const g = bob.view.game;
  const plain = g.hand.find((x) => x.role !== 'vipere');
  if (plain) {
    const some = salonCards(g.salon)[0];
    if (some && (await bob.call('card:play', { card: plain.id, area: 'salon', side: 'up', target: some.id })).ok) fail('une carte chassée sans Vipère');
  }
  const first = g.hand[0];
  const r1 = await bob.call('card:play', { card: first.id, area: 'salon', side: 'down', target: first.role === 'vipere' ? null : undefined });
  if (!r1.ok) fail(`Bob ne peut pas jouer : ${r1.error}`);
  {
    const second = bob.view.game.hand.find((x) => x.id !== first.id);
    if (!second) fail('Bob n’a plus de carte');
    const r2 = await bob.call('card:play', { card: second.id, area: 'salon', side: 'up' });
    if (r2.ok || !/salon/.test(r2.error)) fail('deux cartes au salon le même tour');
  }
}
bob.mode = 'actif';

// Une spectatrice arrive : elle voit le salon et les domaines, sans main ni dessein, et ne peut rien poser.
const eve = client('Ève', { avatar: 'cygne' });
all.push(eve);
await connected(eve);
const joined = await eve.call('room:join', { code, name: 'Ève', avatar: 'cygne' });
if (!joined.ok) fail(`spectatrice : ${joined.error}`);
eve.session = joined.data;
await waitFor('la vue de la spectatrice', () => eve.view?.game && eve.view.game.hand === null && eve.view.game.missions === null);
if ((await eve.call('card:play', { card: 1, area: 'home' })).ok) fail('la spectatrice a posé une carte');

await pause(300);
// Bob se déconnecte, puis revient avec sa session ; un intrus tente de prendre sa place avec un faux jeton.
bob.socket.disconnect();
await pause(400);
bob.socket.connect();
await connected(bob);
const back = await bob.call('room:join', { code, playerId: bob.session.playerId, token: bob.session.token, resumeOnly: true });
if (!back.ok) fail(`reprise refusée : ${back.error}`);
await waitFor('Bob revient', () => bob.view?.phase === 'playing' && bob.view.game.hand !== null);
const intruder = client('Intrus');
await connected(intruder);
if ((await intruder.call('room:join', { code, playerId: bob.session.playerId, token: 'faux', resumeOnly: true })).ok) fail('une session volée a été acceptée');
intruder.socket.disconnect();
clearInterval(intruder.timer);

// Chloé quitte la table : le pilote automatique la remplace.
await chloe.call('room:leave');
clearInterval(chloe.timer);
await waitFor('le pilote de Chloé', () => ana.view?.phase !== 'playing' || ana.view.players.find((p) => p.id === chloe.session.playerId)?.autopilot);

await waitFor('la fin de la partie 1', () => ana.view?.phase === 'finished', 150_000);
await waitFor('tout le monde voit la fin', () => [ana, bob, dan, eve].every((c) => c.view?.phase === 'finished'));
const f1 = ana.view.final;
if (!game.checked) fail('fin de la partie 1 non vérifiée');
console.log(`✓ partie 1 : ${stats.moves} cartes suivies (${stats.auto} d'office, ${stats.hunts} chassées, ${stats.incognitos} Incognitos), gagnant ${f1.players.filter((p) => p.winner).map((p) => p.name).join(' et ')} (${f1.players[0].score})`);
if (!stats.auto) fail('aucune carte posée d’office pour Dan');

// ───────────── Partie 2 : revanche à 5, sans dessein, sans limite ─────────────
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await ana.call('game:restart')).ok) fail('revanche refusée');
await waitFor('le salon', () => ana.view?.phase === 'lobby');
dan.mode = 'actif';
if (!(await ana.call('room:settings', { missions: 0, turn: 0 })).ok) fail('réglages refusés');
// Ève, spectatrice, prend la place libérée par Chloé.
await waitFor('Ève assise', () => ana.view.players.find((p) => p.id === eve.session.playerId)?.status !== 'spectator');
while (ana.view.players.filter((p) => p.status !== 'spectator').length < 5) {
  if (!(await ana.call('room:addBot')).ok) fail('bot refusé');
  await pause(30);
}
if ((await ana.call('room:addBot')).ok) fail('un 6e joueur accepté');
watcher = eve;
game = { n: 0, domains: new Map(), players: 5, missions: 0 };
houseOf.clear();
if (!(await ana.call('game:start')).ok) fail('lancement de la revanche refusé');
await waitFor('la revanche', () => [ana, bob, dan, eve].every((c) => c.view?.phase === 'playing'));
if (ana.view.game.endsAt !== 0) fail('un chrono alors que le temps est sans limite');
await waitFor('la fin de la partie 2', () => ana.view?.phase === 'finished', 150_000);
if (!game.checked) fail('fin de la partie 2 non vérifiée');
const f2 = ana.view.final;
console.log(`✓ partie 2 : ${f2.players.length} joueurs, gagnant ${f2.players.filter((p) => p.winner).map((p) => p.name).join(' et ')} (${f2.players[0].score})`);

// L'hôte part : un autre humain prend la main.
await ana.call('room:leave');
clearInterval(ana.timer);
await waitFor('le nouvel hôte', () => bob.view && bob.view.hostId !== ana.session.playerId && [bob, dan, eve].some((c) => c.session.playerId === bob.view.hostId));

// ───────────── Partie 3 : à deux, un seul dessein ─────────────
const solo = client('Solène', { avatar: 'ruban' });
all.push(solo);
await connected(solo);
const s3 = await solo.call('room:create', { name: 'Solène', avatar: 'ruban' });
if (!s3.ok) fail(`création 3 : ${s3.error}`);
if (!(await solo.call('room:settings', { missions: 1, turn: 75 })).ok) fail('réglages 3 refusés');
if (!(await solo.call('room:addBot')).ok) fail('bot 3 refusé');
watcher = solo;
game = { n: 0, domains: new Map(), players: 2, missions: 1 };
houseOf.clear();
if (!(await solo.call('game:start')).ok) fail('lancement 3 refusé');
await waitFor('la fin de la partie 3', () => solo.view?.phase === 'finished', 60_000);
if (!game.checked) fail('fin de la partie 3 non vérifiée');
console.log(`✓ partie 3 : à deux, ${solo.view.final.players.map((p) => `${p.name} ${p.score}`).join(', ')}`);

console.log(`✓ ${stats.states} états vérifiés, ${stats.gestures} gestes, ${stats.moves} cartes suivies (${stats.auto} d'office, ${stats.hunts} chassées, ${stats.incognitos} Incognitos)`);
if (stats.refused.size) console.log('  refus :', [...stats.refused].map(([k, n]) => `${k} ×${n}`).join(' · '));
for (const c of all) {
  clearInterval(c.timer);
  c.socket.disconnect();
}
server.kill();
process.exit(0);
