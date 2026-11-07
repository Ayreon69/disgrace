// Fin de partie : les Incognitos se retournent, puis le cachet de cire tombe sur chaque Maison (en grâce, en disgrâce,
// neutre). Ensuite seulement, le décompte de chacun (cartes Maison par Maison, desseins dévoilés), le tampon du gagnant,
// les victoires de la soirée et la revanche. Rien du résultat n'est visible avant son cachet.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, FastForward, LogOut, RotateCcw, Trophy, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { HOUSE_NAME, MISSION_POINTS, missionKind, missionText, type FinalPlayer, type RoomView } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Fan, HouseIcon, Logo, Token } from '../components/Ui';
import { DomainCards } from '../components/Salon';
import { sfx } from '../lib/sound';
import { STANDING_NAME, listing, placeLabel } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

const SEAL_MS = 650;
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const mine = final.players.find((p) => p.id === view.me);
  const winners = final.players.filter((p) => p.winner);
  const good = !!mine?.winner;
  const still = reducedMotion();
  const houses = final.houses;
  // 0 : les Incognitos se retournent ; 1 à 6 : un cachet par Maison ; 7 : le décompte ; 8 : le gagnant.
  const [step, setStep] = useState(still ? 8 : 0);
  const done = step >= 8;
  useEffect(() => {
    if (step >= 8) return;
    const t = window.setTimeout(() => setStep((s) => s + 1), step === 0 ? 1100 : step < 6 ? SEAL_MS : step === 6 ? 900 : 1400);
    return () => window.clearTimeout(t);
  }, [step]);
  useEffect(() => {
    if (step >= 1 && step <= 6) {
      const h = houses[step - 1];
      sfx.seal(h.standing === 'grace' ? true : h.standing === 'disgrace' ? false : null);
    }
  }, [step, houses]);
  const once = useRef(false);
  useEffect(() => {
    if (!done || once.current) return;
    once.current = true;
    sfx.fanfare(good);
    if (still || !good) return;
    void confetti({ particleCount: 150, spread: 90, origin: { y: 0.3 }, colors: ['#d8b25c', '#f1d892', '#c8456e', '#1e9aa0', '#7d54b0', '#5fa85a', '#f7efdf'], scalar: 0.9, disableForReducedMotion: true });
  }, [done, good, still]);

  const who = (p: FinalPlayer | undefined) => (!p ? '?' : p.id === view.me ? 'Toi' : p.name);
  const title = good ? (winners.length > 1 ? 'Victoire partagée !' : 'Tu gagnes !') : winners.length > 3 ? `${winners.length} ex æquo` : winners.length > 1 ? `${listing(winners.map(who))} à égalité` : `${winners[0]?.name ?? '?'} gagne`;

  return (
    <Backdrop quiet>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <section className={cls('final-hero', done && good && 'is-good')}>
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="win" className="final-win" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className="final-avatars">
                  {winners.slice(0, 3).map((w) => (
                    <Avatar key={w.id} avatar={w.avatar} className="final-avatar" />
                  ))}
                </span>
                <motion.div className="stamp is-big" initial={{ scale: 1.7, rotate: -14, opacity: 0 }} animate={{ scale: 1, rotate: -4, opacity: 1 }} transition={{ type: 'spring', stiffness: 360, damping: 16 }}>
                  <b>{title}</b>
                  <small>{winners[0] ? `${signed(winners[0].score)} point${Math.abs(winners[0].score) > 1 ? 's' : ''}` : ''}</small>
                </motion.div>
                {mine && !mine.winner && <p className="final-reason">Tu finis {placeLabel(mine.place)} avec {signed(mine.score)}.</p>}
              </motion.div>
            ) : (
              <motion.div key="count" className="final-count" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h2>Le décompte</h2>
                <p className="muted">{step === 0 ? 'Les Incognitos se retournent…' : step <= 6 ? 'La Duchesse rend son jugement…' : 'Chacun compte ses cartes…'}</p>
                <Button variant="ghost" icon={<FastForward size={16} />} onClick={() => setStep(8)}>
                  Tout montrer
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <section className="panel final-salon" aria-label="Le salon à la fin">
          <div className="fs-grid">
            {houses.map((h, i) => {
              const col = final.salon[h.house];
              const sealed = step >= i + 1;
              return (
                <div key={h.house} className={cls('fs-col', `h-${h.house}`, sealed && `is-${h.standing}`)}>
                  <div className="fs-zone is-up">
                    {col.up.map((c) => (
                      <motion.span key={c.id} initial={c.veiled && !still ? { rotateY: 180 } : false} animate={{ rotateY: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
                        <Token card={c} veiled={c.veiled} />
                      </motion.span>
                    ))}
                  </div>
                  <span className="fs-rail">
                    <HouseIcon house={h.house} title={HOUSE_NAME[h.house]} />
                  </span>
                  <div className="fs-zone is-down">
                    {col.down.map((c) => (
                      <motion.span key={c.id} initial={c.veiled && !still ? { rotateY: 180 } : false} animate={{ rotateY: 0 }} transition={{ delay: 0.3, duration: 0.6 }}>
                        <Token card={c} veiled={c.veiled} />
                      </motion.span>
                    ))}
                  </div>
                  {sealed && (
                    <motion.span className={cls('seal', `is-${h.standing}`)} initial={still ? false : { scale: 2.2, rotate: -25, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 15 }}>
                      {STANDING_NAME[h.standing]}
                      <small>
                        {h.up}&nbsp;–&nbsp;{h.down}
                      </small>
                    </motion.span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="muted small fs-note">
            <Fan className="fs-fan" /> Les cartes cerclées d’or étaient des Incognitos. Une Éminence compte double.
          </p>
        </section>

        {step >= 7 && (
          <section className="panel final-table">
            <h3>Le décompte de chacun</h3>
            <ol className="final-list">
              {final.players.map((p, i) => (
                <motion.li key={p.id} className={cls('final-row', done && p.winner && 'is-winner', p.id === view.me && 'is-me')} initial={still ? false : { y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.12 }}>
                  <div className="final-line">
                    <span className="final-place">{done ? placeLabel(p.place) : ''}</span>
                    <Avatar avatar={p.avatar} className="final-av" />
                    <span className="final-who">
                      <b className="final-name">{who(p)}</b>
                      {p.gone && <span className="final-stats">parti en route</span>}
                    </span>
                    <span className={cls('final-score', p.score < 0 && 'is-neg')}>{signed(p.score)}</span>
                    {done && p.wins > 0 && (
                      <span className="final-wins" title="Parties gagnées à cette table, ce soir">
                        <Trophy size={13} aria-hidden /> {p.wins}
                      </span>
                    )}
                  </div>
                  <DomainCards cards={p.domain} fresh={null} prey={null} empty="Domaine vide" />
                  <ul className="final-detail">
                    {p.houses.map((h) => {
                      const st = houses.find((x) => x.house === h.house)!.standing;
                      return (
                        <li key={h.house} className={cls(`h-${h.house}`, `is-${st}`)}>
                          <HouseIcon house={h.house} />
                          <span>
                            {HOUSE_NAME[h.house]} <span className="muted">({STANDING_NAME[st].toLowerCase()})</span>
                          </span>
                          <b>{signed(h.points)}</b>
                        </li>
                      );
                    })}
                    {p.missions.map((m) => (
                      <li key={m.id} className={cls('is-mission', m.ok ? 'is-ok' : 'is-ko')}>
                        {m.ok ? <Check size={15} aria-label="rempli" /> : <X size={15} aria-label="manqué" />}
                        <span>
                          <span className="muted">{missionKind(m.id) === 'petit' ? 'Petit dessein' : 'Grand dessein'}&nbsp;: </span>
                          {missionText(m.id)}
                        </span>
                        <b>{m.ok ? `+${MISSION_POINTS[missionKind(m.id)]}` : '0'}</b>
                      </li>
                    ))}
                  </ul>
                </motion.li>
              ))}
            </ol>
            {done && <p className="muted small">Le trophée compte les parties gagnées à cette table ce soir.</p>}
          </section>
        )}

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
