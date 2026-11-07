// Mesure la force des bots de Disgrâce.
//   npx tsx test/sim.ts [parties]
// 1. Chaque niveau seul contre un joueur naïf (carte et endroit au hasard), à deux.
// 2. Chaque niveau contre un autre, à deux.
// 3. Tables mêlées de 3 à 5 bots : écart de points, desseins réussis, temps de calcul.
import { performance } from 'node:perf_hooks';
import { Brain, SKILLS, naiveChoice, type Skill } from '../server/bots';
import { Game } from '../server/game';

const N = Number(process.argv[2] ?? 400);
type P = Skill | 'naive';

function play(players: P[]): { scores: number[]; missions: number; missionsOk: number; ms: number; choices: number } {
  const ids = players.map((_, i) => `p${i}`);
  const brains = new Map(players.map((p, i) => [ids[i], p === 'naive' ? null : new Brain(p)]));
  const order = [...ids].sort(() => Math.random() - 0.5);
  const g = new Game(order, 2);
  let ms = 0;
  let choices = 0;
  while (!g.over) {
    while (!g.turnDone) {
      const id = g.turn;
      const brain = brains.get(id);
      const t = performance.now();
      const choice = brain ? brain.choose(g, id) : naiveChoice(g, id);
      ms += performance.now() - t;
      choices++;
      const res = g.play(id, choice);
      if (typeof res === 'string') throw new Error(res);
    }
    g.endTurn();
  }
  const rows = g.scores();
  const scores = ids.map((id) => rows.find((r) => r.id === id)!.score);
  const missions = rows.reduce((n, r) => n + r.missions.length, 0);
  const missionsOk = rows.reduce((n, r) => n + r.missions.filter((m) => m.ok).length, 0);
  return { scores, missions, missionsOk, ms, choices };
}

function duel(a: P, b: P): { win: number; tie: number; diff: number } {
  let win = 0;
  let tie = 0;
  let diff = 0;
  for (let i = 0; i < N; i++) {
    const { scores } = play([a, b]);
    if (scores[0] > scores[1]) win++;
    else if (scores[0] === scores[1]) tie++;
    diff += scores[0] - scores[1];
  }
  return { win: win / N, tie: tie / N, diff: diff / N };
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const name = (p: P) => (p === 'naive' ? 'naïf' : p.name);

console.log(`${N} parties par ligne\n`);
console.log('1. Contre un joueur naïf, à deux');
for (const s of SKILLS) {
  const r = duel(s, 'naive');
  console.log(`   ${name(s).padEnd(7)} gagne ${pct(r.win)} (égalités ${pct(r.tie)}), écart moyen ${r.diff.toFixed(1)} points`);
}
console.log('\n2. Entre niveaux, à deux');
for (const [a, b] of [
  [SKILLS[1], SKILLS[0]],
  [SKILLS[2], SKILLS[1]],
  [SKILLS[2], SKILLS[0]],
] as const) {
  const r = duel(a, b);
  console.log(`   ${name(a)} contre ${name(b)} : ${pct(r.win)} (égalités ${pct(r.tie)}), écart moyen ${r.diff.toFixed(1)}`);
}
console.log('\n3. Tables mêlées');
for (const n of [2, 3, 4, 5]) {
  let ms = 0;
  let choices = 0;
  let missions = 0;
  let ok = 0;
  let best = 0;
  let spread = 0;
  const games = Math.max(40, Math.round(N / 4));
  for (let i = 0; i < games; i++) {
    const r = play(Array.from({ length: n }, (_, k) => SKILLS[k % 3]));
    ms += r.ms;
    choices += r.choices;
    missions += r.missions;
    ok += r.missionsOk;
    best += Math.max(...r.scores);
    spread += Math.max(...r.scores) - Math.min(...r.scores);
  }
  console.log(
    `   ${n} joueurs : ${choices / games / n} cartes chacun, score gagnant moyen ${(best / games).toFixed(1)}, écart ${(spread / games).toFixed(1)}, desseins réussis ${pct(ok / missions)}, ${(ms / choices).toFixed(1)} ms par carte`,
  );
}
