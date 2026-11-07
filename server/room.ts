// Une table de Disgrâce : salon, partie au tour par tour (trois cartes par tour), bots, pilote automatique,
// chrono du tour, courte pause entre deux tours, décompte final et vue de chacun.
// Tout est public sauf les mains, les desseins et la Maison des Incognitos posés : chacun ne reçoit que ce qu'il verrait.
import crypto from 'node:crypto';
import {
  AVATARS,
  HOUSES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  isMissionMode,
  isTurnTime,
  type Area,
  type CardView,
  type FinalView,
  type GameView,
  type House,
  type PlayerStatus,
  type RoomView,
  type Settings,
} from '../shared/protocol';
import { AUTOPILOT, Brain, randomSkill } from './bots';
import { Game, face, seen, shuffle, type Col, type PlayInput } from './game';

const BOT_NAMES = ['Albertine', 'Anatole', 'Bérénice', 'Céleste', 'Eugène', 'Hortense', 'Isidore', 'Léontine', 'Octave', 'Philomène', 'Séraphin', 'Victoire', 'Aurèle', 'Clémence'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (DG_FAST=1) : pauses éclair, bots pressés, 1,5 s par tour. */
const FAST = process.env.DG_FAST === '1';
const T = {
  /** Le temps que tout le monde voie la dernière carte d'un tour. */
  pause: FAST ? 30 : 1_300,
  /** Un premier tour qui laisse le temps de lire ses desseins. */
  opening: FAST ? 60 : 2_500,
  turn: (s: number) => (FAST ? (s ? 1_500 : 0) : s * 1000),
  think: (range: readonly [number, number]) => (FAST ? [6, 30] : range),
  /** Le temps est écoulé : les cartes qui restent partent une à une, au rythme d'une main. */
  forced: FAST ? [5, 20] : [650, 1_000],
} as const;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

function between([a, b]: readonly [number, number] | readonly number[]): number {
  return a + crypto.randomInt(Math.max(1, b - a + 1));
}

function pickOne<T>(arr: readonly T[]): T {
  return arr[crypto.randomInt(arr.length)];
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { turn: 75, missions: 2 };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  brains = new Map<string, Brain>();
  /** Fin du tour en cours ; 0 : sans limite. */
  turnEndsAt = 0;
  /** Une pause entre deux tours, jusqu'à cette heure (0 : pas de pause). */
  pauseUntil = 0;
  /** Quand le bot ou le pilote automatique posera sa prochaine carte. */
  autoAt = 0;
  /** Le temps du tour est écoulé : le reste de la main part d'office. */
  forced = false;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Ceux qu'on a déjà annoncés en pilote automatique. */
  private autoSeen = new Set<string>();
  private dirty = false;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined | null): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      // Pas de trait d'union ni d'espace qui pendent avant le numéro.
      const candidate = `${name.slice(0, 13).replace(/[\s-]+$/, '')} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    const status: PlayerStatus = this.phase === 'lobby' && this.seated.length < MAX_PLAYERS ? 'lobby' : 'spectator';
    const p = this.makePlayer(name, avatar, false, status);
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs au plus).`;
    const used = new Set(this.players.map((p) => p.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const name = names.length ? pickOne(names) : `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    this.players.push(this.makePlayer(name, pickOne(free.length ? free : AVATARS), true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer quelqu'un.";
    if (this.phase !== 'lobby') return "On ne peut retirer quelqu'un que dans le salon.";
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa place reste à la table : le pilote automatique la tient.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else {
      p.left = true;
      if (this.phase === 'playing') this.autoSeen.add(id);
    }
    if (this.hostId === id) this.transferHost();
    this.planAuto();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    this.autoSeen.delete(p.id);
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
    // Revenu à temps : le pilote automatique ne jouera pas à sa place (sauf si son temps est déjà écoulé).
    if (this.phase === 'playing' && this.game?.turn === p.id && !this.forced) this.autoAt = 0;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if (isTurnTime(payload.turn)) this.settings.turn = payload.turn;
    if (isMissionMode(payload.missions)) this.settings.missions = payload.missions;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, this.settings.missions);
    this.brains.clear();
    this.autoSeen.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.brains.set(p.id, new Brain(randomSkill()));
    this.phase = 'playing';
    this.final = null;
    this.pauseUntil = 0;
    this.beginTurn(T.opening);
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.brains.clear();
    this.forced = false;
    this.autoAt = 0;
    this.turnEndsAt = 0;
    this.pauseUntil = 0;
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Un nouveau tour commence : le chrono part, et un bot ou un absent jouera tout seul. */
  private beginTurn(extra = 0): void {
    const now = Date.now();
    const ms = T.turn(this.settings.turn);
    this.turnEndsAt = ms ? now + extra + ms : 0;
    this.autoAt = 0;
    this.forced = false;
    this.planAuto(extra);
  }

  /** Le joueur dont c'est le tour est un bot, un absent, ou n'a plus de temps : il posera tout seul. */
  private planAuto(extra = 0): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g || this.pauseUntil || this.autoAt || !g.handOf(g.turn).length) return;
    const p = this.get(g.turn);
    if (!p) return;
    if (this.forced) {
      this.autoAt = Date.now() + between(T.forced);
      return;
    }
    if (!this.isAuto(p)) return;
    const brain = this.brains.get(p.id);
    this.autoAt = Date.now() + extra + between(T.think(brain ? brain.skill.think : AUTOPILOT.think));
  }

  play(by: string, payload: Record<string, unknown>): string | undefined {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return "Aucune partie n'est en cours.";
    if (!g.has(by)) return 'Tu regardes la partie\u00a0: tu joueras à la prochaine.';
    if (this.pauseUntil) return 'Un instant\u00a0: le tour passe au suivant.';
    if (this.forced && g.turn === by) return 'Le temps est écoulé\u00a0: tes cartes partent d’office.';
    const area = payload.area;
    if (area !== 'salon' && area !== 'home' && area !== 'rival') return 'Endroit inconnu.';
    const side = payload.side === 'up' || payload.side === 'down' ? payload.side : null;
    const target = typeof payload.target === 'number' ? payload.target : null;
    const rival = typeof payload.rival === 'string' ? payload.rival : null;
    return this.apply(by, { card: Number(payload.card), area: area as Area, side, rival, target }, false);
  }

  private apply(by: string, input: PlayInput, auto: boolean): string | undefined {
    const g = this.game!;
    const res = g.play(by, input, auto);
    if (typeof res === 'string') return res;
    this.autoAt = 0;
    const p = this.get(by);
    if (p?.isBot && !FAST && res.removed && Math.random() < 0.45) {
      setTimeout(() => this.onEmote(by, pickOne(['😈', '🤫', 'Touché…', 'Méfiance…'])), 700 + crypto.randomInt(600));
    }
    if (g.turnDone) {
      this.turnEndsAt = 0;
      this.forced = false;
      this.pauseUntil = Date.now() + T.pause;
    }
    return undefined;
  }

  /** La carte automatique : un bot réfléchit, un absent ou un retardataire pose comme il peut. */
  private autoPlay(): void {
    const g = this.game!;
    const id = g.turn;
    if (!g.handOf(id).length) return;
    let brain = this.brains.get(id);
    const isBot = !!brain && !!this.get(id)?.isBot;
    if (!brain) {
      brain = new Brain(AUTOPILOT);
      this.brains.set(id, brain);
    }
    const choice = brain.choose(g, id);
    const err = this.apply(id, choice, !isBot);
    // Un choix refusé (cela ne devrait pas arriver) : on pose la première carte au premier endroit libre.
    if (err) {
      const card = g.handOf(id)[0];
      const area = (['salon', 'home', 'rival'] as Area[]).find((a) => !g.used.includes(a))!;
      const rival = g.order.find((x) => x !== id) ?? null;
      this.apply(id, { card: card.id, area, side: 'up', rival, target: null }, !isBot);
    }
  }

  private finishGame(): void {
    const g = this.game;
    if (!g) return;
    const rows = g.scores();
    const best = rows[0]?.score;
    for (const r of rows) if (r.score === best) this.wins.set(r.id, (this.wins.get(r.id) ?? 0) + 1);
    const salon = g.revealedSalon();
    this.final = {
      salon: Object.fromEntries(HOUSES.map((h) => [h, { up: salon[h].up.map((c) => ({ ...face(c), veiled: c.veiled })), down: salon[h].down.map((c) => ({ ...face(c), veiled: c.veiled })) }])) as FinalView['salon'],
      houses: g.houseTally(),
      players: rows.map((r) => {
        const p = this.get(r.id);
        return {
          id: r.id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          seat: g.order.indexOf(r.id) + 1,
          domain: g.domainOf(r.id).map((c) => ({ ...face(c), veiled: c.role === 'incognito' })),
          houses: r.houses,
          missions: r.missions,
          score: r.score,
          place: r.place,
          winner: r.score === best,
          wins: this.wins.get(r.id) ?? 0,
          gone: !!p?.left,
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries et diffusion ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis envoie l'état à toute la table. */
  commit(changed = true): void {
    if (changed) this.dirty = true;
    this.planAuto();
    this.reschedule();
    if (this.dirty) {
      this.dirty = false;
      this.onChange();
    }
  }

  private dueAt(): number {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return Infinity;
    let due = Infinity;
    if (this.pauseUntil) due = this.pauseUntil;
    else {
      if (this.turnEndsAt && !this.forced) due = Math.min(due, this.turnEndsAt);
      if (this.autoAt) due = Math.min(due, this.autoAt);
    }
    // Un absent qui bascule en pilote automatique : tout le monde le voit, et il ne doit plus faire attendre la table.
    const now = Date.now();
    for (const id of g.order) {
      const p = this.get(id);
      if (p && !p.isBot && !p.left && !p.connected && p.disconnectedAt + GRACE_MS > now) due = Math.min(due, p.disconnectedAt + GRACE_MS);
    }
    return due;
  }

  private reschedule(): void {
    this.clearTimer();
    const due = this.dueAt();
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      // Une minuterie peut sonner une milliseconde trop tôt : on se rendort sans rien diffuser.
      if (Date.now() < due) return this.reschedule();
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit(false);
    }, Math.max(0, Math.min(due - Date.now(), 2_147_000_000)));
  }

  /** Fait avancer la table. */
  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();

    for (const id of g.order) {
      const p = this.get(id);
      if (!p || p.isBot) continue;
      const auto = this.isAuto(p);
      if (auto !== this.autoSeen.has(id)) {
        if (auto) this.autoSeen.add(id);
        else this.autoSeen.delete(id);
        this.dirty = true;
      }
    }

    if (this.pauseUntil) {
      if (now < this.pauseUntil) return;
      this.pauseUntil = 0;
      this.dirty = true;
      if (g.endTurn()) return this.finishGame();
      this.beginTurn();
      return;
    }
    if (this.turnEndsAt && !this.forced && now >= this.turnEndsAt) {
      // Le temps est écoulé : les cartes qui restent partent une à une ; on le voit au chrono vide.
      this.forced = true;
      this.turnEndsAt = 0;
      this.autoAt = 0;
      this.dirty = true;
      this.planAuto();
      return;
    }
    if (this.autoAt && now >= this.autoAt) {
      this.dirty = true;
      this.autoPlay();
    }
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewerId: string): GameView {
    const seated = g.has(viewerId);
    const col = (c: Col) => ({ up: c.up.map(seen), down: c.down.map(seen) });
    return {
      order: [...g.order],
      turn: g.turn,
      used: [...g.used],
      endsAt: this.turnEndsAt,
      deck: g.deck.length,
      salon: {
        houses: Object.fromEntries(HOUSES.map((h) => [h, col(g.salon[h])])) as Record<House, { up: CardView[]; down: CardView[] }>,
        veiled: col(g.veiled),
      },
      last: g.last ? { ...g.last, card: { ...g.last.card }, removed: g.last.removed ? { ...g.last.removed, card: { ...g.last.removed.card } } : null } : null,
      hand: seated ? g.handOf(viewerId).map(face) : null,
      missions: seated ? [...(g.missions.get(viewerId) ?? [])] : null,
      pause: !!this.pauseUntil,
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => {
        const seat = g ? g.order.indexOf(p.id) : -1;
        return {
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          isBot: p.isBot,
          isHost: p.id === this.hostId,
          connected: p.isBot || p.connected,
          autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
          status: p.status,
          wins: this.wins.get(p.id) ?? 0,
          seat: seat >= 0 ? seat + 1 : null,
          domain: g && seat >= 0 ? g.domainOf(p.id).map(seen) : null,
        };
      }),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}
