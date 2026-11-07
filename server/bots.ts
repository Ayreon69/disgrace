// Les bots de Disgrâce : ils ne voient que ce qu'un joueur voit (le salon, les domaines, leur main, leurs desseins).
// Un Incognito posé reste une carte inconnue, sauf ceux que le bot a posés lui-même, et il en oublie parfois.
// À chaque carte, il essaie toutes les façons de finir son tour (quelle carte où, à la lumière ou dans l'ombre,
// chez quel rival, qui chasser avec une Vipère), estime la grâce de chaque Maison à la fin, et garde
// ce qui creuse l'écart avec ses rivaux, desseins compris.
import crypto from 'node:crypto';
import { HOUSES, MISSION_POINTS, missionKind, weight, type Area, type House, type Role } from '../shared/protocol';
import type { Card, Game, PlayInput } from './game';

export interface Skill {
  name: 'novice' | 'habile' | 'retors';
  /** Le bruit ajouté à son jugement. */
  noise: number;
  /** Chance d'oublier, à chaque tour, la Maison d'un Incognito qu'il a posé. */
  forget: number;
  /** Une chance de choisir un coup moins bon (une hésitation). */
  slip: number;
  /** Le temps de réflexion avant chaque carte, en millisecondes. */
  think: readonly [number, number];
}

export const SKILLS: Skill[] = [
  { name: 'novice', noise: 1.2, forget: 0.25, slip: 0.18, think: [1_400, 2_600] },
  { name: 'habile', noise: 0.5, forget: 0.12, slip: 0.07, think: [1_200, 2_300] },
  { name: 'retors', noise: 0.2, forget: 0.05, slip: 0.03, think: [1_100, 2_100] },
];

/** Le pilote automatique d'un absent : il pose ses cartes sans trop réfléchir. */
export const AUTOPILOT: Skill = { name: 'novice', noise: 1.5, forget: 1, slip: 0.25, think: [700, 1_300] };

export function randomSkill(): Skill {
  const r = crypto.randomInt(100);
  return r < 30 ? SKILLS[0] : r < 70 ? SKILLS[1] : SKILLS[2];
}

function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Une carte telle que le bot la connaît : la Maison d'un Incognito inconnu vaut null. */
interface K {
  id: number;
  house: House | null;
  role: Role;
}

/** Tout ce que le bot sait de la table. */
interface Known {
  up: Record<House, K[]>;
  down: Record<House, K[]>;
  /** Les Incognitos de la loge de la Duchesse, rangés par côté (Maison connue s'il s'en souvient). */
  veiledUp: K[];
  veiledDown: K[];
  domains: Map<string, K[]>;
  /** Tours qui restent, celui-ci compris. */
  turnsLeft: number;
  myTurnsLeft: number;
}

function cloneKnown(k: Known): Known {
  return {
    up: Object.fromEntries(HOUSES.map((h) => [h, [...k.up[h]]])) as Record<House, K[]>,
    down: Object.fromEntries(HOUSES.map((h) => [h, [...k.down[h]]])) as Record<House, K[]>,
    veiledUp: [...k.veiledUp],
    veiledDown: [...k.veiledDown],
    domains: new Map([...k.domains].map(([id, cards]) => [id, [...cards]])),
    turnsLeft: k.turnsLeft,
    myTurnsLeft: k.myTurnsLeft,
  };
}

export class Brain {
  /** La Maison des Incognitos qu'il a posés (tant qu'il s'en souvient). */
  private memory = new Map<number, House>();
  private forgotAt = -1;

  constructor(readonly skill: Skill) {}

  /** Ce qu'il voit, plus ce dont il se souvient. */
  private know(g: Game, me: string): Known {
    const mem = (c: Card): K => (c.role !== 'incognito' ? { id: c.id, house: c.house, role: c.role } : { id: c.id, house: this.memory.get(c.id) ?? null, role: 'incognito' });
    const up = Object.fromEntries(HOUSES.map((h) => [h, g.salon[h].up.map(mem)])) as Record<House, K[]>;
    const down = Object.fromEntries(HOUSES.map((h) => [h, g.salon[h].down.map(mem)])) as Record<House, K[]>;
    const domains = new Map(g.order.map((id) => [id, g.domainOf(id).map(mem)]));
    const inHands = g.order.reduce((n, id) => n + g.handOf(id).length, 0);
    const turnsLeft = Math.ceil((g.deck.length + inHands) / 3);
    const idx = g.order.indexOf(me);
    const fromTurn = (idx - g.turnIndex + g.order.length) % g.order.length;
    const myTurnsLeft = Math.max(0, Math.ceil((turnsLeft - fromTurn) / g.order.length));
    return { up, down, veiledUp: g.veiled.up.map(mem), veiledDown: g.veiled.down.map(mem), domains, turnsLeft, myTurnsLeft };
  }

  /** L'oubli : une fois par tour, il peut perdre le fil d'un Incognito posé. */
  private forget(g: Game): void {
    if (this.forgotAt === g.moves - g.used.length) return;
    this.forgotAt = g.moves - g.used.length;
    for (const id of [...this.memory.keys()]) if (Math.random() < this.skill.forget) this.memory.delete(id);
  }

  /** La carte à poser maintenant, et où. */
  choose(g: Game, me: string): PlayInput {
    this.forget(g);
    const hand = g.handOf(me);
    const known = this.know(g, me);
    const handK: K[] = hand.map((c) => ({ id: c.id, house: c.house, role: c.role }));
    const rivals = g.order.filter((id) => id !== me);
    const areas = (['salon', 'home', 'rival'] as Area[]).filter((a) => !g.used.includes(a));
    const missions = g.missions.get(me) ?? [];

    const plans: { first: PlayInput; value: number }[] = [];
    const explore = (state: Known, cards: K[], left: Area[], first: PlayInput | null) => {
      if (!cards.length || !left.length) {
        plans.push({ first: first!, value: this.value(state, me, missions) });
        return;
      }
      for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const others = cards.filter((_, j) => j !== i);
        for (const area of left) {
          const nextAreas = left.filter((a) => a !== area);
          const spots: { side: 'up' | 'down' | null; owner: string | null }[] =
            area === 'salon' ? [{ side: 'up', owner: null }, { side: 'down', owner: null }] : area === 'home' ? [{ side: null, owner: me }] : rivals.map((r) => ({ side: null, owner: r }));
          for (const spot of spots) {
            const targets: (number | null)[] = [null];
            if (card.role === 'vipere') targets.push(...this.targets(state, area, spot.owner).map((t) => t.id));
            for (const target of targets) {
              const next = cloneKnown(state);
              this.apply(next, card, area, spot.side, spot.owner, target);
              const input: PlayInput = { card: card.id, area, side: spot.side, rival: area === 'rival' ? spot.owner : null, target };
              explore(next, others, nextAreas, first ?? input);
            }
          }
        }
      }
    };
    explore(known, handK, areas, null);

    for (const p of plans) p.value += gauss() * this.skill.noise;
    plans.sort((a, b) => b.value - a.value);
    let pick = plans[0];
    if (plans.length > 1 && Math.random() < this.skill.slip) pick = plans[1 + crypto.randomInt(Math.min(4, plans.length - 1))];
    const chosen = pick.first;
    const card = hand.find((c) => c.id === chosen.card);
    if (card?.role === 'incognito') this.memory.set(card.id, card.house);
    return chosen;
  }

  private targets(k: Known, area: Area, owner: string | null): K[] {
    const pool = area === 'salon' ? [...HOUSES.flatMap((h) => [...k.up[h], ...k.down[h]]), ...k.veiledUp, ...k.veiledDown] : k.domains.get(owner ?? '') ?? [];
    return pool.filter((c) => c.role !== 'intouchable');
  }

  private apply(k: Known, card: K, area: Area, side: 'up' | 'down' | null, owner: string | null, target: number | null): void {
    if (target !== null) {
      const drop = (arr: K[]) => {
        const i = arr.findIndex((c) => c.id === target);
        if (i >= 0) arr.splice(i, 1);
        return i >= 0;
      };
      let done = false;
      for (const h of HOUSES) done = done || drop(k.up[h]) || drop(k.down[h]);
      done = done || drop(k.veiledUp) || drop(k.veiledDown);
      for (const cards of k.domains.values()) done = done || drop(cards);
    }
    if (area === 'salon') {
      if (card.role === 'incognito') (side === 'up' ? k.veiledUp : k.veiledDown).push(card);
      else (side === 'up' ? k.up : k.down)[card.house!].push(card);
    } else k.domains.get(owner!)!.push(card);
    k.turnsLeft = Math.max(0, k.turnsLeft);
  }

  /** L'espérance de grâce de chaque Maison à la fin, entre −1 (disgrâce sûre) et +1 (grâce sûre). */
  private outlook(k: Known): Record<House, number> {
    const unknown = [...k.veiledUp, ...k.veiledDown].filter((c) => c.house === null).length;
    const spread = 0.6 + Math.sqrt(Math.max(0, k.turnsLeft - 1) * 0.45 + unknown * 0.25);
    const out = {} as Record<House, number>;
    for (const h of HOUSES) {
      let b = k.up[h].reduce((n, c) => n + weight(c.role), 0) - k.down[h].reduce((n, c) => n + weight(c.role), 0);
      b += k.veiledUp.filter((c) => c.house === h).length - k.veiledDown.filter((c) => c.house === h).length;
      // Une égalité parfaite reste neutre : on la tire légèrement vers zéro.
      out[h] = Math.tanh(b / spread);
    }
    return out;
  }

  private domainValue(cards: K[], e: Record<House, number>): number {
    const mean = HOUSES.reduce((n, h) => n + e[h], 0) / HOUSES.length;
    return cards.reduce((n, c) => n + weight(c.role) * (c.house ? e[c.house] : mean), 0);
  }

  private value(k: Known, me: string, missions: string[]): number {
    const e = this.outlook(k);
    const mine = this.domainValue(k.domains.get(me) ?? [], e) + this.missionsValue(k, me, missions, e);
    const others = [...k.domains].filter(([id]) => id !== me).map(([, cards]) => this.domainValue(cards, e));
    if (!others.length) return mine;
    const max = Math.max(...others);
    const mean = others.reduce((a, b) => a + b, 0) / others.length;
    return mine - 0.6 * max - 0.4 * mean;
  }

  private missionsValue(k: Known, me: string, missions: string[], e: Record<House, number>): number {
    const mine = k.domains.get(me) ?? [];
    const r = k.myTurnsLeft;
    const pGrace = (h: House) => Math.max(0, Math.min(1, (1 + e[h]) / 2 - 0.08));
    const pFall = (h: House) => Math.max(0, Math.min(1, (1 - e[h]) / 2 - 0.08));
    // Une collection : sûre si elle est faite, d'autant plus probable qu'il reste de tours pour la finir.
    const progress = (have: number, need: number) => (have >= need ? 1 : Math.max(0, 1 - (need - have) / (r * 0.8 + 0.4)) * 0.85);
    let total = 0;
    for (const id of missions) {
      const [kind, a, b] = id.split(':');
      let p = 0;
      const housesHere = HOUSES.filter((h) => mine.some((c) => c.house === h));
      switch (kind) {
        case 'chute':
          p = pFall(a as House);
          break;
        case 'gloire':
          p = pGrace(a as House);
          break;
        case 'paire':
          p = pGrace(a as House) * pFall(b as House);
          break;
        case 'eventail':
          p = progress(housesHere.length, 5);
          break;
        case 'eminences':
          p = progress(mine.filter((c) => c.role === 'eminence').length, 3);
          break;
        case 'gardes':
          p = progress(mine.filter((c) => c.role === 'intouchable').length, 2);
          break;
        case 'clan':
          p = progress(Math.max(0, ...HOUSES.map((h) => mine.filter((c) => c.house === h).length)), 5);
          break;
        case 'faveurs':
          p = Math.min(1, housesHere.reduce((n, h) => n + pGrace(h), 0) / 3);
          break;
        case 'pur':
          p = mine.length ? housesHere.reduce((n, h) => n * (1 - pFall(h)), 1) : 0.3;
          break;
        case 'foule': {
          const most = Math.max(0, ...[...k.domains].filter(([id]) => id !== me).map(([, c]) => c.length));
          p = 1 / (1 + Math.exp(-(mine.length - most - 0.5) / 1.2));
          break;
        }
        case 'neutres':
          p = Math.min(1, HOUSES.reduce((n, h) => n + (1 - Math.abs(e[h])) * 0.45, 0) / 2);
          break;
      }
      total += p * MISSION_POINTS[missionKind(id)];
    }
    return total;
  }
}

/** Une référence naïve pour mesurer les bots : une carte et un endroit au hasard. */
export function naiveChoice(g: Game, me: string): PlayInput {
  const hand = g.handOf(me);
  const card = hand[crypto.randomInt(hand.length)];
  const areas = (['salon', 'home', 'rival'] as Area[]).filter((a) => !g.used.includes(a));
  const area = areas[crypto.randomInt(areas.length)];
  const rivals = g.order.filter((id) => id !== me);
  return { card: card.id, area, side: crypto.randomInt(2) ? 'up' : 'down', rival: area === 'rival' ? rivals[crypto.randomInt(rivals.length)] : null, target: null };
}
