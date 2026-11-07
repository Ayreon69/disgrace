// Les mots de la table : noms, rôles, places, et la phrase qui raconte chaque carte posée.
import { HOUSE_NAME, ROLE_NAME, type CardView, type Placement, type Role, type RoomView, type Standing, type TurnTime } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « de Céleste », mais « d'Octave » : l'élision devant une voyelle ou un h. */
export function deName(name: string): string {
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(name) ? `d'${name}` : `de ${name}`;
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

/** « 1re », « 2e ». */
export function placeLabel(n: number): string {
  return n === 1 ? '1re' : `${n}e`;
}

export const ROLE_HINT: Record<Role, string> = {
  membre: 'compte une fois',
  eminence: 'compte double',
  incognito: 'se pose face cachée',
  vipere: 'chasse une carte',
  intouchable: 'à l’abri des Vipères',
};

export const STANDING_NAME: Record<Standing, string> = {
  grace: 'En grâce',
  disgrace: 'Disgrâce',
  neutre: 'Neutre',
};

export function turnLabel(t: TurnTime): string {
  return t ? `${t} s` : 'Sans limite';
}

function article(c: CardView): string {
  const une = c.role === 'eminence' || c.role === 'vipere';
  if (!c.house) return `${une ? 'une' : 'un'} ${ROLE_NAME[c.role]}`;
  return `${une ? 'une' : 'un'} ${ROLE_NAME[c.role]} des ${HOUSE_NAME[c.house]}`;
}

/** La phrase qui raconte la dernière carte posée : « Octave pose une Éminence des Verriers dans l'ombre. » */
export function placementText(view: RoomView, p: Placement): string {
  const me = p.by === view.me;
  const who = me ? 'Tu' : nameOf(view, p.by);
  const verb = me ? 'poses' : 'pose';
  const what = p.card.role === 'incognito' && !p.card.house ? 'un Incognito, face cachée,' : article(p.card);
  let where: string;
  if (p.area === 'salon') {
    const side = p.side === 'up' ? 'à la lumière' : 'dans l’ombre';
    where = p.card.role === 'incognito' ? `dans la loge de la Duchesse, ${side}` : `au salon, ${side}`;
  } else if (p.owner === p.by) where = me ? 'chez toi' : 'dans son domaine';
  else where = p.owner === view.me ? 'chez toi' : `chez ${nameOf(view, p.owner)}`;
  let text = `${who} ${verb} ${what} ${where}.`;
  if (p.removed) {
    const from = p.removed.owner === null ? 'du salon' : p.removed.owner === view.me ? 'de chez toi' : `de chez ${nameOf(view, p.removed.owner)}`;
    text += ` La Vipère chasse ${article(p.removed.card)} ${from} !`;
  }
  if (p.auto) text += me ? ' (posée pour toi)' : ' (pilote automatique)';
  return text;
}
