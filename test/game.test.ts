import { describe, expect, it } from 'vitest';
import { HOUSES, MISSION_POINTS, ROLE_COUNT, ROLES, missionKind, missionText, removedAtStart } from '../shared/protocol';
import { Brain, SKILLS } from '../server/bots';
import { Game, dealMissions, judgeMission, makeDeck, standingOf, type Card } from '../server/game';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Une pioche choisie : les cartes données d'abord, puis le reste du paquet. */
function deckWith(first: Omit<Card, 'id'>[], players: number): Card[] {
  const base = makeDeck();
  const lead = first.map((c, i) => ({ ...c, id: 9000 + i }));
  // Les cartes retirées au départ sont prises sur le dessus : on les place avant celles qu'on veut distribuer.
  return [...base.slice(0, removedAtStart(players)), ...lead, ...base.slice(removedAtStart(players))];
}

describe('le paquet', () => {
  it('90 cartes, 15 par Maison, dans les bonnes proportions', () => {
    const deck = makeDeck();
    expect(deck).toHaveLength(90);
    expect(new Set(deck.map((c) => c.id)).size).toBe(90);
    for (const h of HOUSES) {
      const mine = deck.filter((c) => c.house === h);
      expect(mine).toHaveLength(15);
      for (const r of ROLES) expect(mine.filter((c) => c.role === r)).toHaveLength(ROLE_COUNT[r]);
    }
  });

  it('retire 30, 18, 6 ou 0 cartes selon la table, et chacun joue autant de tours', () => {
    for (const n of [2, 3, 4, 5]) {
      const g = new Game(ids(n), 2);
      const total = g.deck.length + n * 3;
      expect(total).toBe(90 - removedAtStart(n));
      expect(total % (3 * n)).toBe(0);
    }
  });
});

describe('un tour', () => {
  const two = (first: Omit<Card, 'id'>[]) => new Game(['a', 'b'], 0, deckWith(first, 2));

  it('trois cartes, une à chaque endroit', () => {
    // Distribution alternée : a reçoit les cartes 0, 2 et 4.
    const g = two([
      { house: 'soie', role: 'membre' },
      { house: 'verre', role: 'membre' },
      { house: 'sucre', role: 'eminence' },
      { house: 'verre', role: 'membre' },
      { house: 'carte', role: 'membre' },
      { house: 'verre', role: 'membre' },
    ]);
    const [c1, c2, c3] = g.handOf('a');
    expect(g.play('b', { card: g.handOf('b')[0].id, area: 'home' })).toBeTypeOf('string');
    expect(g.play('a', { card: c1.id, area: 'salon' })).toBeTypeOf('string');
    expect(g.play('a', { card: c1.id, area: 'salon', side: 'up' })).toMatchObject({ area: 'salon', side: 'up' });
    expect(g.salon.soie.up.map((c) => c.id)).toEqual([c1.id]);
    expect(g.play('a', { card: c2.id, area: 'salon', side: 'down' })).toBe('Tu as déjà posé une carte au salon ce tour-ci.');
    expect(g.play('a', { card: c2.id, area: 'rival', rival: 'a' })).toBeTypeOf('string');
    expect(g.play('a', { card: c2.id, area: 'rival', rival: 'b' })).toMatchObject({ owner: 'b' });
    expect(g.play('a', { card: c3.id, area: 'home' })).toMatchObject({ owner: 'a' });
    expect(g.turnDone).toBe(true);
    expect(g.endTurn()).toBe(false);
    expect(g.turn).toBe('b');
    expect(g.handOf('a')).toHaveLength(3);
    expect(g.domainOf('b').map((c) => c.house)).toEqual(['sucre']);
  });

  it("un Incognito va dans la loge de la Duchesse, face cachée, et rejoint sa Maison à la fin", () => {
    const g = two([
      { house: 'parfum', role: 'incognito' },
      { house: 'verre', role: 'membre' },
      { house: 'parfum', role: 'membre' },
      { house: 'verre', role: 'membre' },
      { house: 'parfum', role: 'membre' },
      { house: 'verre', role: 'membre' },
    ]);
    const spy = g.handOf('a')[0];
    const p = g.play('a', { card: spy.id, area: 'salon', side: 'down' });
    expect(p).toMatchObject({ card: { id: spy.id, house: null, role: 'incognito' } });
    expect(g.veiled.down).toHaveLength(1);
    expect(g.salon.parfum.down).toHaveLength(0);
    const s = g.revealedSalon();
    expect(s.parfum.down).toEqual([expect.objectContaining({ id: spy.id, veiled: true })]);
  });

  it('une Vipère chasse une carte là où elle arrive, jamais un Intouchable', () => {
    const g = two([
      { house: 'soie', role: 'intouchable' },
      { house: 'verre', role: 'eminence' },
      { house: 'soie', role: 'membre' },
      { house: 'verre', role: 'vipere' },
      { house: 'carte', role: 'membre' },
      { house: 'horloge', role: 'membre' },
    ]);
    const [guard, member, carte] = g.handOf('a');
    g.play('a', { card: guard.id, area: 'salon', side: 'up' });
    g.play('a', { card: member.id, area: 'salon', side: 'up' }); // refusé : salon déjà servi
    g.play('a', { card: member.id, area: 'home' });
    g.play('a', { card: carte.id, area: 'rival', rival: 'b' });
    g.endTurn();
    const [emin, viper] = g.handOf('b');
    g.play('b', { card: emin.id, area: 'home' });
    expect(g.play('b', { card: viper.id, area: 'salon', side: 'down', target: guard.id })).toBe('Cette carte ne peut pas être chassée d’ici.');
    expect(g.play('b', { card: viper.id, area: 'salon', side: 'down', target: member.id })).toBe('Cette carte ne peut pas être chassée d’ici.');
    const res = g.play('b', { card: viper.id, area: 'rival', rival: 'a', target: member.id });
    expect(res).toMatchObject({ removed: { card: { id: member.id }, owner: 'a' } });
    expect(g.domainOf('a').map((c) => c.id)).toEqual([viper.id]);
    expect(g.play('b', { card: g.handOf('b')[0].id, area: 'salon', side: 'up', target: guard.id })).toBe('Seule une Vipère chasse une carte.');
  });
});

describe('le décompte', () => {
  it('grâce, disgrâce ou neutre ; une Éminence compte double', () => {
    expect(standingOf(3, 2)).toBe('grace');
    expect(standingOf(1, 2)).toBe('disgrace');
    expect(standingOf(2, 2)).toBe('neutre');
    const g = new Game(['a', 'b'], 0);
    g.hands.set('a', []);
    g.hands.set('b', []);
    g.deck = [];
    const c = (house: Card['house'], role: Card['role'], id: number): Card => ({ house, role, id });
    g.salon.soie.up.push(c('soie', 'eminence', 1));
    g.salon.soie.down.push(c('soie', 'membre', 2));
    g.veiled.down.push(c('soie', 'incognito', 3), c('verre', 'incognito', 4));
    g.salon.verre.up.push(c('verre', 'membre', 5));
    g.salon.sucre.down.push(c('sucre', 'membre', 6));
    g.domains.set('a', [c('soie', 'eminence', 7), c('soie', 'membre', 8), c('sucre', 'eminence', 9), c('verre', 'membre', 10)]);
    g.domains.set('b', [c('sucre', 'membre', 11)]);
    const t = Object.fromEntries(g.houseTally().map((h) => [h.house, h]));
    // Soie : 2 en haut, 1 + 1 (Incognito) en bas : neutre. Verre : 1 contre 1 : neutre. Sucre : disgrâce.
    expect(t.soie).toMatchObject({ up: 2, down: 2, standing: 'neutre' });
    expect(t.verre).toMatchObject({ up: 1, down: 1, standing: 'neutre' });
    expect(t.sucre.standing).toBe('disgrace');
    expect(t.parfum.standing).toBe('neutre');
    const scores = g.scores();
    expect(scores.find((s) => s.id === 'a')!.score).toBe(-2);
    expect(scores.find((s) => s.id === 'b')!.score).toBe(-1);
    expect(scores[0].id).toBe('b');
    expect(scores.map((s) => s.place)).toEqual([1, 2]);
  });

  it('des ex æquo partagent la place', () => {
    const g = new Game(['a', 'b', 'c'], 0);
    g.domains.set('a', []);
    g.domains.set('b', []);
    g.domains.set('c', []);
    expect(g.scores().map((s) => s.place)).toEqual([1, 1, 1]);
  });
});

describe('les desseins', () => {
  it('chacun reçoit un petit et un grand dessein, différents de ceux des autres', () => {
    for (let k = 0; k < 200; k++) {
      const m = dealMissions(5, 2);
      expect(m.every((x) => x.length === 2 && missionKind(x[0]) === 'petit' && missionKind(x[1]) === 'grand')).toBe(true);
      expect(new Set(m.map((x) => x[0])).size).toBe(5);
      expect(new Set(m.map((x) => x[1])).size).toBe(5);
      for (const [p, g] of m) {
        const hp = p.split(':').slice(1);
        expect(g.split(':').slice(1).some((h) => hp.includes(h))).toBe(false);
      }
    }
    expect(dealMissions(3, 1).every((x) => x.length === 1)).toBe(true);
    expect(dealMissions(3, 0).every((x) => x.length === 0)).toBe(true);
  });

  it('chaque dessein a un texte, et se juge', () => {
    const c = (house: Card['house'], role: Card['role'], id: number): Card => ({ house, role, id });
    const domains = new Map<string, Card[]>([
      ['a', [c('soie', 'eminence', 1), c('soie', 'eminence', 2), c('verre', 'eminence', 3), c('sucre', 'intouchable', 4), c('carte', 'intouchable', 5)]],
      ['b', [c('soie', 'membre', 6)]],
    ]);
    const st = { parfum: 'grace', verre: 'grace', horloge: 'neutre', soie: 'grace', sucre: 'disgrace', carte: 'neutre' } as const;
    const ok = (id: string) => judgeMission(id, 'a', domains, st);
    expect(ok('chute:sucre')).toBe(true);
    expect(ok('gloire:sucre')).toBe(false);
    expect(ok('eminences')).toBe(true);
    expect(ok('gardes')).toBe(true);
    expect(ok('eventail')).toBe(false);
    expect(ok('paire:verre:sucre')).toBe(true);
    expect(ok('faveurs')).toBe(false);
    expect(ok('pur')).toBe(false);
    expect(ok('foule')).toBe(true);
    expect(ok('neutres')).toBe(true);
    expect(ok('clan')).toBe(false);
    for (const id of ['chute:soie', 'gloire:verre', 'eventail', 'eminences', 'gardes', 'paire:soie:carte', 'faveurs', 'pur', 'foule', 'neutres', 'clan']) {
      expect(missionText(id)).not.toBe('?');
      expect(MISSION_POINTS[missionKind(id)]).toBeGreaterThan(0);
    }
  });
});

describe('les bots', () => {
  it('jouent des parties entières sans coup refusé, et ne voient pas les Incognitos des autres', () => {
    for (const n of [2, 3, 5]) {
      const order = ids(n);
      const g = new Game(order, 2);
      const brains = new Map(order.map((id, i) => [id, new Brain(SKILLS[i % SKILLS.length])]));
      let guard = 0;
      while (!g.over && guard++ < 500) {
        while (!g.turnDone) {
          const choice = brains.get(g.turn)!.choose(g, g.turn);
          const res = g.play(g.turn, choice);
          expect(typeof res).not.toBe('string');
        }
        g.endTurn();
      }
      expect(g.over).toBe(true);
      expect(g.scores()).toHaveLength(n);
    }
  });
});
