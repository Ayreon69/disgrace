// Accueil : un petit salon où une carte monte à la lumière ou descend dans l'ombre, et le cachet tombe ;
// pseudo + avatar, créer / rejoindre une table, jouer contre des bots, règles.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, House, LogIn, MessageSquare, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, type CardView, type House as HouseId } from '../../../shared/protocol';
import { AVATAR_EMOJI, AVATAR_LABELS, Backdrop, Button, HouseIcon, Logo, Token } from '../components/Ui';
import { cls, reducedMotion } from '../lib/util';
import { codeFromUrl, createRoom, joinRoom } from '../net';
import { useStore } from '../store';

const BOTS_KEY = 'dg.bots';
const MAX_BOTS = MAX_PLAYERS - 1;
const MIN_BOTS = MIN_PLAYERS - 1;

function savedBots(): number {
  try {
    const n = Number(localStorage.getItem(BOTS_KEY));
    return n >= MIN_BOTS && n <= MAX_BOTS ? n : 2;
  } catch {
    return 2;
  }
}

const tk = (id: number, house: HouseId, role: CardView['role'] = 'membre'): CardView => ({ id, house, role });
type Demo = { house: HouseId; up: CardView[]; down: CardView[]; card: CardView; side: 'up' | 'down'; seal: 'grace' | 'disgrace' };
/** Les exemples de l'accueil : une colonne du salon, et la carte qui vient faire pencher la balance. */
const DEMOS: Demo[] = [
  { house: 'verre', up: [tk(1, 'verre')], down: [tk(2, 'verre'), tk(3, 'verre')], card: tk(4, 'verre', 'eminence'), side: 'up', seal: 'grace' },
  { house: 'soie', up: [tk(5, 'soie', 'eminence')], down: [tk(6, 'soie')], card: tk(7, 'soie', 'eminence'), side: 'down', seal: 'disgrace' },
  { house: 'carte', up: [tk(8, 'carte'), tk(9, 'carte', 'intouchable')], down: [tk(10, 'carte', 'eminence')], card: tk(11, 'carte', 'vipere'), side: 'down', seal: 'disgrace' },
];
const DECOR: { house: HouseId; up: CardView[]; down: CardView[] }[] = [
  { house: 'parfum', up: [tk(20, 'parfum'), tk(21, 'parfum', 'eminence')], down: [tk(22, 'parfum')] },
  { house: 'sucre', up: [tk(23, 'sucre')], down: [tk(24, 'sucre', 'eminence'), tk(25, 'sucre', 'vipere')] },
];

/** Le salon de l'accueil : la carte arrive dans sa colonne, puis le cachet de cire tombe. */
function HeroSalon() {
  const still = reducedMotion();
  const [i, setI] = useState(0);
  const [step, setStep] = useState(still ? 2 : 0);
  useEffect(() => {
    if (still) return;
    const t = window.setTimeout(
      () => {
        if (step < 2) setStep(step + 1);
        else {
          setStep(0);
          setI((x) => (x + 1) % DEMOS.length);
        }
      },
      step === 0 ? 1200 : step === 1 ? 900 : 2600,
    );
    return () => window.clearTimeout(t);
  }, [step, still]);
  const d = DEMOS[i];
  const cols = [DECOR[0], d, DECOR[1]];
  return (
    <div className="hero-salon" aria-hidden>
      <div className="hero-light" />
      {cols.map((c, k) => {
        const active = k === 1;
        const up = active && step >= 1 && d.side === 'up' ? [...c.up, d.card] : c.up;
        const down = active && step >= 1 && d.side === 'down' ? [...c.down, d.card] : c.down;
        return (
          <div key={`${k}-${active ? i : 'x'}`} className={cls('hero-col', active && 'is-active', `h-${c.house}`)}>
            <div className="hero-zone is-up">
              <AnimatePresence initial={false}>
                {up.map((t) => (
                  <motion.span key={t.id} initial={{ y: -36, opacity: 0, scale: 1.25 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
                    <Token card={t} />
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            <span className="hero-rail">
              <HouseIcon house={c.house} />
            </span>
            <div className="hero-zone is-down">
              <AnimatePresence initial={false}>
                {down.map((t) => (
                  <motion.span key={t.id} initial={{ y: 36, opacity: 0, scale: 1.25 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
                    <Token card={t} />
                  </motion.span>
                ))}
              </AnimatePresence>
            </div>
            {active && step === 2 && (
              <motion.span className={cls('seal', `is-${d.seal}`, 'hero-seal')} initial={{ scale: 2, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: -8, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 15 }}>
                {d.seal === 'grace' ? 'En grâce !' : 'Disgrâce !'}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Home() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const conn = useStore((s) => s.conn);
  const [invited, setInvited] = useState(codeFromUrl);
  const [code, setCode] = useState('');
  const [bots, setBots] = useState(savedBots);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    const sync = () => setInvited(codeFromUrl());
    window.addEventListener('dg:url', sync);
    return () => window.removeEventListener('dg:url', sync);
  }, []);
  const nameOk = profile.name.trim().length > 0;

  const run = async (key: string, fn: () => Promise<boolean>) => {
    if (busy) return;
    if (!nameOk) {
      useStore.getState().showToast('Choisis d’abord un pseudo.', 'info');
      document.getElementById('pseudo')?.focus();
      return;
    }
    setBusy(key);
    await fn();
    setBusy(null);
  };

  const changeBots = (d: number) => {
    const n = Math.max(MIN_BOTS, Math.min(MAX_BOTS, bots + d));
    setBots(n);
    try {
      localStorage.setItem(BOTS_KEY, String(n));
    } catch {
      /* stockage indisponible */
    }
  };

  const cleanCode = code.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);

  return (
    <Backdrop className="home">
      <div className="home-links">
        <a className="all-games" href="https://akhis-games.onrender.com">
          <House size={16} aria-hidden /> Tous les jeux
        </a>
        <a className="all-games" href="https://akhis-games.onrender.com/feedback.html?jeu=disgrace">
          <MessageSquare size={16} aria-hidden /> Feedback
        </a>
      </div>
      <header className="home-hero">
        <motion.div initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <Logo size="lg" />
        </motion.div>
        <p className="tagline">
          Chez la Duchesse, six Maisons se disputent sa faveur. Pousse tes alliées <b>à la lumière</b>, jette tes rivales <b>dans l’ombre</b>… et garde pour toi les cartes qui finiront en grâce.
        </p>
        <HeroSalon />
      </header>

      <motion.section className="panel home-panel" initial={{ y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15, duration: 0.45 }}>
        {invited && (
          <div className="invite-banner">
            Invitation à la table <b>{invited}</b> : choisis ton pseudo et entre&nbsp;!
          </div>
        )}
        <label className="field-label" htmlFor="pseudo">
          Ton pseudo
        </label>
        <input
          id="pseudo"
          className="input input-lg"
          placeholder="Ex. Hortense"
          value={profile.name}
          maxLength={16}
          autoComplete="nickname"
          onChange={(e) => setProfile({ name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && invited) void run('join', () => joinRoom(invited));
          }}
        />
        <span className="field-label" id="avatar-label">
          Ton avatar
        </span>
        <div className="avatar-picker" role="radiogroup" aria-labelledby="avatar-label">
          {AVATARS.map((a) => (
            <button key={a} type="button" role="radio" aria-checked={profile.avatar === a} aria-label={AVATAR_LABELS[a]} className={cls('avatar-opt', profile.avatar === a && 'is-on')} onClick={() => setProfile({ avatar: a })}>
              {AVATAR_EMOJI[a]}
            </button>
          ))}
        </div>

        {invited ? (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<LogIn size={20} />} disabled={!!busy} onClick={() => run('join', () => joinRoom(invited))}>
              {busy === 'join' ? 'Connexion…' : `Rejoindre la table ${invited}`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.history.replaceState(null, '', '/');
                setInvited(null);
              }}
            >
              Créer ma propre table à la place
            </Button>
          </div>
        ) : (
          <div className="home-actions">
            <Button variant="primary" className="btn-lg" icon={<Plus size={20} />} disabled={!!busy} onClick={() => run('create', () => createRoom())}>
              {busy === 'create' ? 'Création…' : 'Créer une table'}
            </Button>
            <div className="join-row">
              <input
                className="input code-input"
                placeholder="CODE"
                value={cleanCode}
                maxLength={4}
                aria-label="Code de la table"
                autoCapitalize="characters"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && cleanCode.length === 4) void run('join', () => joinRoom(cleanCode));
                }}
              />
              <Button icon={<LogIn size={18} />} disabled={cleanCode.length !== 4 || !!busy} onClick={() => run('join', () => joinRoom(cleanCode))}>
                Rejoindre
              </Button>
            </div>
            <div className="bots-row">
              <Button className="bots-go" icon={<Bot size={18} />} disabled={!!busy} onClick={() => run('bots', () => createRoom({ bots, autostart: true }))}>
                {busy === 'bots' ? 'Préparation…' : `Jouer contre ${bots} bot${bots > 1 ? 's' : ''}`}
              </Button>
              <div className="stepper" role="group" aria-label="Nombre de bots">
                <button type="button" className="icon-btn" aria-label="Un bot de moins" disabled={bots <= MIN_BOTS} onClick={() => changeBots(-1)}>
                  <Minus size={16} />
                </button>
                <button type="button" className="icon-btn" aria-label="Un bot de plus" disabled={bots >= MAX_BOTS} onClick={() => changeBots(1)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
        <Button variant="ghost" className="rules-link" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
          Les règles en 1 minute
        </Button>
        {conn !== 'online' && (
          <p className="wake-note" role="status">
            <span className="spinner" /> Réveil du serveur… (jusqu'à une minute la première fois)
          </p>
        )}
      </motion.section>

      <footer className="home-foot">
        Inspiré d’un jeu de cartes de cour. Création de fans, non officielle&nbsp;: nom, Maisons, desseins et dessins originaux.
      </footer>
    </Backdrop>
  );
}
