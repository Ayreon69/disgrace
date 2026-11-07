// Le moteur de Disgrâce, sans réseau : la pioche, les mains, le salon de la Duchesse, les domaines, les desseins.
// Règle : à son tour, on pose ses trois cartes, une à chaque endroit : au salon (à la lumière ou dans l'ombre,
// dans la colonne de sa Maison), chez soi, et chez un rival. Une Vipère peut chasser une carte là où elle arrive
// (jamais un Intouchable). Un Incognito se pose face cachée ; au salon, il attend dans la loge de la Duchesse.
// Quand la pioche et les mains sont vides, on retourne les Incognitos : une Maison plus à la lumière que dans l'ombre
// est en grâce (+1 par carte chez soi), l'inverse en disgrâce (−1), sinon neutre. Une Éminence compte double partout.
import crypto from 'node:crypto';
import {
  AREAS,
  HAND,
  HOUSES,
  MISSION_POINTS,
  ROLE_COUNT,
  ROLES,
  missionKind,
  removedAtStart,
  weight,
  type Area,
  type CardView,
  type FinalHouse,
  type House,
  type MissionMode,
  type Placement,
  type Role,
  type Standing,
} from '../shared/protocol';

export interface Card {
  id: number;
  house: House;
  role: Role;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Les 90 cartes, avec des numéros tirés au hasard : un numéro ne dit rien de la Maison d'un Incognito. */
export function makeDeck(): Card[] {
  const cards: Omit<Card, 'id'>[] = [];
  for (const house of HOUSES) for (const role of ROLES) for (let k = 0; k < ROLE_COUNT[role]; k++) cards.push({ house, role });
  const ids = shuffle(Array.from({ length: cards.length }, (_, i) => 100 + i * 7 + crypto.randomInt(7)));
  return shuffle(cards.map((c, i) => ({ ...c, id: ids[i] })));
}

/** Ce que tout le monde voit d'une carte posée. */
export function seen(c: Card): CardView {
  return c.role === 'incognito' ? { id: c.id, house: null, role: 'incognito' } : { id: c.id, house: c.house, role: c.role };
}
export function face(c: Card): CardView {
  return { id: c.id, house: c.house, role: c.role };
}

export interface Col {
  up: Card[];
  down: Card[];
}

export interface PlayInput {
  card: number;
  area: Area;
  side?: 'up' | 'down' | null;
  rival?: string | null;
  /** La carte qu'une Vipère chasse ; null ou absent : elle ne chasse personne. */
  target?: number | null;
}

// ───────────────────────────── Desseins ─────────────────────────────

const PETITS_FIXES = ['eventail', 'eminences', 'gardes'];
const GRANDS_FIXES = ['faveurs', 'pur', 'foule', 'neutres', 'clan'];

function housesIn(id: string): string[] {
  return id.split(':').slice(1);
}

/** Tire les desseins de chacun : un petit (et un grand si la table le veut), sans deux fois la même Maison chez la même personne. */
export function dealMissions(players: number, mode: MissionMode): string[][] {
  if (!mode) return Array.from({ length: players }, () => []);
  // Les desseins liés à une Maison sont plus nombreux que les autres : on en tire autant que des fixes.
  const petits = shuffle([...shuffle(HOUSES.flatMap((h) => [`chute:${h}`, `gloire:${h}`])).slice(0, 5), ...PETITS_FIXES]);
  const pairs: string[] = [];
  for (const a of HOUSES) for (const b of HOUSES) if (a !== b) pairs.push(`paire:${a}:${b}`);
  const grands = shuffle([...shuffle(pairs).slice(0, 4), ...GRANDS_FIXES]);
  const out: string[][] = [];
  const usedPetits = new Set<string>();
  const usedGrands = new Set<string>();
  for (let i = 0; i < players; i++) {
    const petit = petits.find((m) => !usedPetits.has(m)) ?? petits[0];
    usedPetits.add(petit);
    const mine = [petit];
    if (mode === 2) {
      const taken = new Set(housesIn(petit));
      const grand = grands.find((m) => !usedGrands.has(m) && !housesIn(m).some((h) => taken.has(h))) ?? grands.find((m) => !usedGrands.has(m)) ?? grands[0];
      usedGrands.add(grand);
      mine.push(grand);
    }
    out.push(mine);
  }
  return out;
}

export function standingOf(up: number, down: number): Standing {
  return up > down ? 'grace' : down > up ? 'disgrace' : 'neutre';
}

export function judgeMission(id: string, me: string, domains: Map<string, Card[]>, standing: Record<House, Standing>): boolean {
  const mine = domains.get(me) ?? [];
  const [k, a, b] = id.split(':');
  const housesHere = new Set(mine.map((c) => c.house));
  const count = (house: House) => mine.filter((c) => c.house === house).length;
  switch (k) {
    case 'chute':
      return standing[a as House] === 'disgrace';
    case 'gloire':
      return standing[a as House] === 'grace';
    case 'eventail':
      return housesHere.size >= 5;
    case 'eminences':
      return mine.filter((c) => c.role === 'eminence').length >= 3;
    case 'gardes':
      return mine.filter((c) => c.role === 'intouchable').length >= 2;
    case 'paire':
      return standing[a as House] === 'grace' && standing[b as House] === 'disgrace';
    case 'faveurs':
      return [...housesHere].filter((h) => standing[h] === 'grace').length >= 3;
    case 'pur':
      return mine.length > 0 && mine.every((c) => standing[c.house] !== 'disgrace');
    case 'foule':
      return [...domains].every(([id, cards]) => id === me || mine.length > cards.length);
    case 'neutres':
      return HOUSES.filter((h) => standing[h] === 'neutre').length >= 2;
    case 'clan':
      return HOUSES.some((h) => count(h) >= 5);
    default:
      return false;
  }
}

// ───────────────────────────── La partie ─────────────────────────────

export interface Score {
  id: string;
  houses: { house: House; cards: number; points: number }[];
  missions: { id: string; ok: boolean; points: number }[];
  score: number;
  place: number;
}

export class Game {
  readonly order: string[];
  deck: Card[];
  hands = new Map<string, Card[]>();
  domains = new Map<string, Card[]>();
  missions = new Map<string, string[]>();
  salon: Record<House, Col>;
  veiled: Col = { up: [], down: [] };
  turnIndex = 0;
  used: Area[] = [];
  moves = 0;
  last: Placement | null = null;
  over = false;

  constructor(order: string[], missionMode: MissionMode, deck?: Card[]) {
    this.order = [...order];
    const all = deck ? [...deck] : makeDeck();
    this.deck = all.slice(removedAtStart(order.length));
    this.salon = Object.fromEntries(HOUSES.map((h) => [h, { up: [], down: [] }])) as unknown as Record<House, Col>;
    const missions = dealMissions(order.length, missionMode);
    order.forEach((id, i) => {
      this.hands.set(id, []);
      this.domains.set(id, []);
      this.missions.set(id, missions[i]);
    });
    for (let k = 0; k < HAND; k++) for (const id of order) this.hands.get(id)!.push(this.deck.shift()!);
  }

  has(id: string): boolean {
    return this.order.includes(id);
  }

  get turn(): string {
    return this.order[this.turnIndex];
  }

  handOf(id: string): Card[] {
    return this.hands.get(id) ?? [];
  }

  domainOf(id: string): Card[] {
    return this.domains.get(id) ?? [];
  }

  /** Les cartes qu'une Vipère pourrait chasser si elle arrivait là. */
  targetsIn(area: Area, owner: string | null): Card[] {
    const pool = area === 'salon' ? [...HOUSES.flatMap((h) => [...this.salon[h].up, ...this.salon[h].down]), ...this.veiled.up, ...this.veiled.down] : this.domainOf(owner ?? '');
    return pool.filter((c) => c.role !== 'intouchable');
  }

  /** Le joueur dont c'est le tour pose une carte de sa main. */
  play(by: string, input: PlayInput, auto = false): Placement | string {
    if (this.over) return 'La partie est finie.';
    if (by !== this.turn) return "Ce n'est pas ton tour.";
    const hand = this.hands.get(by)!;
    const at = hand.findIndex((c) => c.id === input.card);
    if (at < 0) return "Cette carte n'est pas dans ta main.";
    if (!AREAS.includes(input.area)) return 'Endroit inconnu.';
    if (this.used.includes(input.area)) return input.area === 'salon' ? 'Tu as déjà posé une carte au salon ce tour-ci.' : input.area === 'home' ? 'Tu as déjà posé une carte chez toi ce tour-ci.' : 'Tu as déjà posé une carte chez un rival ce tour-ci.';
    const card = hand[at];
    let owner: string | null = null;
    let side: 'up' | 'down' | null = null;
    if (input.area === 'salon') {
      if (input.side !== 'up' && input.side !== 'down') return 'À la lumière ou dans l’ombre\u00a0?';
      side = input.side;
    } else if (input.area === 'home') owner = by;
    else {
      if (!input.rival || input.rival === by || !this.has(input.rival)) return 'Choisis chez quel rival poser la carte.';
      owner = input.rival;
    }
    // La Vipère : sa cible doit être là où elle arrive, et ne pas être Intouchable.
    let victim: Card | null = null;
    if (input.target !== undefined && input.target !== null) {
      if (card.role !== 'vipere') return 'Seule une Vipère chasse une carte.';
      victim = this.targetsIn(input.area, owner).find((c) => c.id === input.target) ?? null;
      if (!victim) return 'Cette carte ne peut pas être chassée d’ici.';
    }

    hand.splice(at, 1);
    let removed: Placement['removed'] = null;
    if (victim) {
      const where = this.removeCard(victim.id);
      removed = { card: seen(victim), owner: where };
    }
    if (input.area === 'salon') {
      const col = card.role === 'incognito' ? this.veiled : this.salon[card.house];
      col[side!].push(card);
    } else this.domains.get(owner!)!.push(card);

    this.used.push(input.area);
    this.moves++;
    this.last = { n: this.moves, by, card: seen(card), area: input.area, side, owner, removed, auto };
    return this.last;
  }

  /** Retire une carte du salon ou d'un domaine ; rend le domaine d'où elle part (null : le salon). */
  private removeCard(id: number): string | null {
    for (const col of [...HOUSES.map((h) => this.salon[h]), this.veiled]) {
      for (const side of ['up', 'down'] as const) {
        const i = col[side].findIndex((c) => c.id === id);
        if (i >= 0) {
          col[side].splice(i, 1);
          return null;
        }
      }
    }
    for (const [pid, cards] of this.domains) {
      const i = cards.findIndex((c) => c.id === id);
      if (i >= 0) {
        cards.splice(i, 1);
        return pid;
      }
    }
    return null;
  }

  /** Le tour est-il complet (plus de carte en main) ? */
  get turnDone(): boolean {
    return this.handOf(this.turn).length === 0;
  }

  /** Fin du tour : on pioche trois cartes, puis on passe au suivant. Rend vrai si la partie est finie. */
  endTurn(): boolean {
    const id = this.turn;
    const hand = this.hands.get(id)!;
    while (hand.length < HAND && this.deck.length) hand.push(this.deck.shift()!);
    this.used = [];
    this.turnIndex = (this.turnIndex + 1) % this.order.length;
    if (this.order.every((p) => !this.handOf(p).length)) {
      this.over = true;
      return true;
    }
    return false;
  }

  // ───────────────────────────── Fin et décompte ─────────────────────────────

  /** Le salon une fois les Incognitos retournés et rangés dans leur Maison, du même côté. */
  revealedSalon(): Record<House, { up: (Card & { veiled: boolean })[]; down: (Card & { veiled: boolean })[] }> {
    const out = Object.fromEntries(
      HOUSES.map((h) => [h, { up: this.salon[h].up.map((c) => ({ ...c, veiled: false })), down: this.salon[h].down.map((c) => ({ ...c, veiled: false })) }]),
    ) as unknown as Record<House, { up: (Card & { veiled: boolean })[]; down: (Card & { veiled: boolean })[] }>;
    for (const side of ['up', 'down'] as const) for (const c of this.veiled[side]) out[c.house][side].push({ ...c, veiled: true });
    return out;
  }

  houseTally(): FinalHouse[] {
    const s = this.revealedSalon();
    return HOUSES.map((house) => {
      const up = s[house].up.reduce((n, c) => n + weight(c.role), 0);
      const down = s[house].down.reduce((n, c) => n + weight(c.role), 0);
      return { house, up, down, standing: standingOf(up, down) };
    });
  }

  scores(): Score[] {
    const tally = this.houseTally();
    const standing = Object.fromEntries(tally.map((t) => [t.house, t.standing])) as Record<House, Standing>;
    const rows = this.order.map((id) => {
      const domain = this.domainOf(id);
      const houses = HOUSES.map((house) => {
        const cards = domain.filter((c) => c.house === house);
        const w = cards.reduce((n, c) => n + weight(c.role), 0);
        const sign = standing[house] === 'grace' ? 1 : standing[house] === 'disgrace' ? -1 : 0;
        return { house, cards: cards.length, points: w * sign };
      }).filter((h) => h.cards > 0);
      const missions = (this.missions.get(id) ?? []).map((m) => {
        const ok = judgeMission(m, id, this.domains, standing);
        return { id: m, ok, points: ok ? MISSION_POINTS[missionKind(m)] : 0 };
      });
      const score = houses.reduce((n, h) => n + h.points, 0) + missions.reduce((n, m) => n + m.points, 0);
      return { id, houses, missions, score, place: 0 };
    });
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    for (const r of rows) r.place = 1 + sorted.filter((x) => x.score > r.score).length;
    return sorted;
  }
}
