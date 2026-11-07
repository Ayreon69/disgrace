// Le salon de la Duchesse et les domaines des joueurs.
// Le salon : une colonne par Maison, la loge de la Duchesse au milieu ; au-dessus de la table dorée, la lumière
// (la Maison gagne en estime), en dessous, l'ombre. Une carte choisie allume sa colonne : on touche le haut ou le bas.
// Un domaine : les cartes posées devant quelqu'un, rangées par Maison, les Incognitos de dos.
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, ScrollText, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { HOUSES, HOUSE_NAME, type CardView, type House, type PlayerView, type SalonView } from '../../../shared/protocol';
import { cls } from '../lib/util';
import { Avatar, Fan, HouseIcon, Token } from './Ui';

/** L'ordre des colonnes : trois Maisons, la loge de la Duchesse, trois Maisons. */
const COLUMNS: (House | 'veiled')[] = ['parfum', 'verre', 'horloge', 'veiled', 'soie', 'sucre', 'carte'];

const exit = { scale: 0.3, rotate: -30, opacity: 0, filter: 'saturate(0) brightness(0.6)', transition: { duration: 0.5 } };

function Stack({ cards, fresh, prey, onPrey }: { cards: CardView[]; fresh: number | null; prey: Set<number> | null; onPrey?: (id: number) => void }) {
  return (
    <AnimatePresence initial={false}>
      {cards.map((c) => (
        <motion.span key={c.id} className="stack-item" layout="position" initial={{ opacity: 0, scale: 1.6 }} animate={{ opacity: 1, scale: 1 }} exit={exit} transition={{ type: 'spring', stiffness: 320, damping: 24 }}>
          <Token card={c} fresh={c.id === fresh} prey={!!prey?.has(c.id)} onClick={prey?.has(c.id) && onPrey ? () => onPrey(c.id) : undefined} />
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

export function Salon({
  salon,
  armed,
  onPick,
  fresh,
  prey,
  onPrey,
}: {
  salon: SalonView;
  /** La colonne qui s'allume pour la carte choisie (sa Maison, ou la loge pour un Incognito). */
  armed: House | 'veiled' | null;
  onPick: (side: 'up' | 'down') => void;
  fresh: number | null;
  /** Les cartes qu'une Vipère peut chasser ici. */
  prey: Set<number> | null;
  onPrey: (id: number) => void;
}) {
  return (
    <section className={cls('salon', armed && 'is-armed', prey && 'is-hunting')} aria-label="Le salon de la Duchesse">
      <div className="salon-glow" aria-hidden />
      <div className="salon-grid">
        {COLUMNS.map((key) => {
          const col = key === 'veiled' ? salon.veiled : salon.houses[key];
          const on = armed === key;
          const label = key === 'veiled' ? 'la loge de la Duchesse' : `les ${HOUSE_NAME[key]}`;
          const zone = (side: 'up' | 'down') => {
            const cards = side === 'up' ? col.up : col.down;
            const content = <Stack cards={cards} fresh={fresh} prey={prey} onPrey={onPrey} />;
            const classes = cls('zone', `is-${side}`, on && 'is-target');
            if (on) {
              return (
                <button type="button" className={classes} onClick={() => onPick(side)} aria-label={`Poser chez ${label}, ${side === 'up' ? 'à la lumière' : 'dans l’ombre'}`} onMouseDown={(e) => e.preventDefault()}>
                  {content}
                  <span className="zone-cue" aria-hidden>
                    {side === 'up' ? 'Lumière' : 'Ombre'}
                  </span>
                </button>
              );
            }
            return <div className={classes}>{content}</div>;
          };
          return (
            <div key={key} className={cls('column', key === 'veiled' ? 'is-veiled' : `h-${key}`, on && 'is-on')}>
              {zone('up')}
              <span className="rail" title={key === 'veiled' ? 'Loge de la Duchesse\u00a0: les Incognitos, face cachée' : HOUSE_NAME[key]}>
                {key === 'veiled' ? <Fan /> : <HouseIcon house={key} />}
              </span>
              {zone('down')}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Les cartes d'un domaine, rangées par Maison ; les Incognitos de dos, à la fin. */
export function DomainCards({ cards, fresh, prey, onPrey, empty }: { cards: CardView[]; fresh: number | null; prey: Set<number> | null; onPrey?: (id: number) => void; empty?: string }) {
  const groups: { key: string; cards: CardView[] }[] = [];
  for (const h of HOUSES) {
    const mine = cards.filter((c) => c.house === h);
    if (mine.length) groups.push({ key: h, cards: mine });
  }
  const hidden = cards.filter((c) => !c.house);
  if (hidden.length) groups.push({ key: 'hidden', cards: hidden });
  if (!cards.length) return <span className="domain-empty">{empty ?? 'Rien pour l’instant'}</span>;
  return (
    <span className="domain-cards">
      <AnimatePresence initial={false}>
        {groups.map((g) => (
          <motion.span key={g.key} className="domain-group" layout="position" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Stack cards={g.cards} fresh={fresh} prey={prey} onPrey={onPrey} />
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  );
}

/** Le domaine d'un joueur : son nom, son avatar, ses cartes. Il s'allume quand on peut y poser la carte choisie. */
export function Domain({
  p,
  me,
  turn,
  armed,
  onPick,
  fresh,
  prey,
  onPrey,
  emote,
  extra,
  onMissions,
}: {
  p: PlayerView;
  me: boolean;
  turn: boolean;
  armed: boolean;
  onPick: () => void;
  fresh: number | null;
  prey: Set<number> | null;
  onPrey: (id: number) => void;
  emote?: string;
  extra?: ReactNode;
  onMissions?: () => void;
}) {
  const head = (
    <span className="domain-head">
      <Avatar avatar={p.avatar} className="domain-avatar" />
      <span className="domain-name">{me ? 'Toi' : p.name}</span>
      {p.autopilot && <Bot size={14} aria-label="pilote automatique" className="domain-flag" />}
      {!p.connected && !p.isBot && <WifiOff size={13} aria-label="hors ligne" className="domain-flag" />}
      {turn && <span className="domain-turn">à son tour</span>}
    </span>
  );
  const body = <DomainCards cards={p.domain ?? []} fresh={fresh} prey={prey} onPrey={onPrey} empty={me ? 'Ton domaine est vide' : undefined} />;
  return (
    <li className={cls('domain', me && 'is-me', turn && 'is-turn', armed && 'is-target', prey && 'is-hunting')} data-player={p.id}>
      {armed ? (
        <button type="button" className="domain-hit" onClick={onPick} aria-label={me ? 'Poser chez toi' : `Poser chez ${p.name}`} onMouseDown={(e) => e.preventDefault()}>
          {head}
          {body}
          <span className="domain-cue" aria-hidden>
            {me ? 'Chez toi' : 'Ici'}
          </span>
        </button>
      ) : (
        <div className="domain-hit">
          {head}
          {body}
        </div>
      )}
      {onMissions && (
        <button type="button" className="missions-btn" onClick={onMissions} aria-label="Mes desseins secrets">
          <ScrollText size={16} aria-hidden /> Desseins
        </button>
      )}
      {extra}
      <AnimatePresence>
        {emote && (
          <motion.span key={emote} className="bubble" initial={{ y: 6, opacity: 0, scale: 0.8 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            {emote}
          </motion.span>
        )}
      </AnimatePresence>
    </li>
  );
}
