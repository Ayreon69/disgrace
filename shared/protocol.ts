// Contrat partagé entre le serveur et le client de Disgrâce : constantes, cartes, desseins et vues.
// Chacun ne reçoit que sa propre vue : sa main, ses desseins secrets, et la table telle qu'on la voit
// autour d'une vraie table. Les Incognitos posés restent face cachée pour tout le monde, même pour qui les a posés.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const HAND = 3;

/** Les six Maisons qui se disputent la faveur de la Duchesse. */
export const HOUSES = ['parfum', 'verre', 'horloge', 'soie', 'sucre', 'carte'] as const;
export type House = (typeof HOUSES)[number];

export const HOUSE_NAME: Record<House, string> = {
  parfum: 'Parfumeurs',
  verre: 'Verriers',
  horloge: 'Horlogers',
  soie: 'Soyeux',
  sucre: 'Confiseurs',
  carte: 'Cartographes',
};

/** Les rôles : un Membre compte une fois, une Éminence deux fois ; un Incognito se pose face cachée ;
 *  une Vipère chasse une carte là où on la pose ; un Intouchable ne peut pas être chassé. */
export const ROLES = ['membre', 'eminence', 'incognito', 'vipere', 'intouchable'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_NAME: Record<Role, string> = {
  membre: 'Membre',
  eminence: 'Éminence',
  incognito: 'Incognito',
  vipere: 'Vipère',
  intouchable: 'Intouchable',
};

/** Combien de cartes de chaque rôle dans chaque Maison (15 par Maison, 90 en tout). */
export const ROLE_COUNT: Record<Role, number> = { membre: 4, eminence: 4, incognito: 2, vipere: 2, intouchable: 3 };

/** Cartes retirées sans les voir au début, selon le nombre de joueurs. */
export function removedAtStart(players: number): number {
  return players <= 2 ? 30 : players === 3 ? 18 : players === 4 ? 6 : 0;
}

export function weight(role: Role): number {
  return role === 'eminence' ? 2 : 1;
}

/** Secondes par tour (trois cartes) ; 0 : sans limite. */
export const TURN_TIMES = [45, 75, 120, 0] as const;
export type TurnTime = (typeof TURN_TIMES)[number];
/** Desseins secrets : deux (un petit et un grand), un seul petit, ou aucun. */
export const MISSION_MODES = [2, 1, 0] as const;
export type MissionMode = (typeof MISSION_MODES)[number];

export const AVATARS = ['chapeau', 'rose', 'bougie', 'violon', 'coupe', 'paon', 'cle', 'diamant', 'masque', 'cygne', 'gateau', 'ruban'] as const;
export const EMOTES = ['👏', '😂', '😮', '🤫', '😈', '🙄', '🥂', '💔'] as const;
export const TAUNTS = ['Quelle disgrâce !', 'Touché…', 'Bien joué !', 'Méfiance…', 'Ma foi !'] as const;

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface Settings {
  turn: TurnTime;
  missions: MissionMode;
}

export function isTurnTime(v: unknown): v is TurnTime {
  return typeof v === 'number' && (TURN_TIMES as readonly number[]).includes(v);
}
export function isMissionMode(v: unknown): v is MissionMode {
  return typeof v === 'number' && (MISSION_MODES as readonly number[]).includes(v);
}
export function isHouse(v: unknown): v is House {
  return typeof v === 'string' && (HOUSES as readonly string[]).includes(v);
}

// ───────────────────────────── Desseins secrets ─────────────────────────────

export type MissionKind = 'petit' | 'grand';
export const MISSION_POINTS: Record<MissionKind, number> = { petit: 3, grand: 5 };

/**
 * Un dessein s'écrit par un identifiant : « chute:soie », « paire:verre:sucre », « eminences »…
 * Les mêmes identifiants servent au serveur (pour juger) et au client (pour l'écrire).
 */
export function missionKind(id: string): MissionKind {
  const k = id.split(':')[0];
  return k === 'paire' || k === 'faveurs' || k === 'pur' || k === 'foule' || k === 'neutres' || k === 'clan' ? 'grand' : 'petit';
}

export function missionText(id: string): string {
  const [k, a, b] = id.split(':');
  const h = (x: string) => HOUSE_NAME[x as House] ?? '?';
  switch (k) {
    case 'chute':
      return `Les ${h(a)} finissent en disgrâce.`;
    case 'gloire':
      return `Les ${h(a)} finissent en grâce.`;
    case 'eventail':
      return 'Chez toi, des cartes d’au moins 5 Maisons.';
    case 'eminences':
      return 'Chez toi, au moins 3 Éminences.';
    case 'gardes':
      return 'Chez toi, au moins 2 Intouchables.';
    case 'paire':
      return `Les ${h(a)} en grâce et les ${h(b)} en disgrâce.`;
    case 'faveurs':
      return 'Chez toi, des cartes d’au moins 3 Maisons en grâce.';
    case 'pur':
      return 'Chez toi, aucune carte d’une Maison en disgrâce.';
    case 'foule':
      return 'Chez toi, plus de cartes que chez chacun des autres.';
    case 'neutres':
      return 'À la fin, au moins 2 Maisons neutres.';
    case 'clan':
      return 'Chez toi, au moins 5 cartes d’une même Maison.';
    default:
      return '?';
  }
}

// ───────────────────────────── Vues ─────────────────────────────

/** Une carte vue : face cachée, sa Maison est inconnue (house null) ; on sait seulement que c'est un Incognito. */
export interface CardView {
  id: number;
  house: House | null;
  role: Role;
}

export interface Column {
  /** À la lumière : la Maison gagne en estime. */
  up: CardView[];
  /** Dans l'ombre : la Maison perd en estime. */
  down: CardView[];
}

export interface SalonView {
  houses: Record<House, Column>;
  /** La loge de la Duchesse : les Incognitos posés au salon, face cachée. */
  veiled: Column;
}

export type Area = 'salon' | 'home' | 'rival';
export const AREAS: Area[] = ['salon', 'home', 'rival'];

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  wins: number;
  /** Place autour de la table, de 1 à 5 ; null hors partie. */
  seat: number | null;
  /** Les cartes posées devant lui (son domaine) ; null hors partie. */
  domain: CardView[] | null;
}

/** La dernière carte posée : qui, quoi, où, et la carte qu'une Vipère a chassée. */
export interface Placement {
  n: number;
  by: string;
  card: CardView;
  area: Area;
  /** Au salon : à la lumière (up) ou dans l'ombre (down). */
  side: 'up' | 'down' | null;
  /** Le domaine où la carte est posée (soi, ou un rival) ; null au salon. */
  owner: string | null;
  /** La carte chassée par une Vipère, et d'où. */
  removed: { card: CardView; owner: string | null } | null;
  /** Posée par le pilote automatique ou à la fin du temps. */
  auto: boolean;
}

export interface GameView {
  order: string[];
  turn: string;
  /** Les endroits déjà servis ce tour-ci (une carte à chacun). */
  used: Area[];
  /** Fin du tour en cours (heure du serveur) ; 0 : sans limite. */
  endsAt: number;
  /** Cartes restant dans la pioche (on la voit autour d'une vraie table). */
  deck: number;
  salon: SalonView;
  last: Placement | null;
  /** Ma main ; null pour un spectateur. */
  hand: CardView[] | null;
  /** Mes desseins secrets ; null pour un spectateur. */
  missions: string[] | null;
  /** Une courte pause entre deux tours, le temps que tout le monde voie la dernière carte. */
  pause: boolean;
}

export type Standing = 'grace' | 'disgrace' | 'neutre';

export interface FinalHouse {
  house: House;
  up: number;
  down: number;
  standing: Standing;
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  seat: number;
  /** Son domaine, Incognitos retournés (veiled : il était face cachée). */
  domain: (CardView & { veiled: boolean })[];
  /** Points des cartes, Maison par Maison. */
  houses: { house: House; cards: number; points: number }[];
  missions: { id: string; ok: boolean; points: number }[];
  score: number;
  place: number;
  winner: boolean;
  wins: number;
  gone: boolean;
}

export interface FinalView {
  /** Le salon à la fin, Incognitos retournés et rangés dans leur Maison (veiled : il était face cachée). */
  salon: Record<House, { up: (CardView & { veiled: boolean })[]; down: (CardView & { veiled: boolean })[] }>;
  houses: FinalHouse[];
  players: FinalPlayer[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;
