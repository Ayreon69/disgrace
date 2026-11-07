// La table : en haut, à qui le tour et la dernière carte posée ; au centre, le salon de la Duchesse ;
// puis les domaines des rivaux et le mien ; en bas, ma main. Je touche une carte, puis l'endroit qui s'allume
// (le haut ou le bas de sa colonne au salon, mon domaine, celui d'un rival). Une Vipère demande ensuite qui chasser.
// Sur ordinateur, les rivaux à gauche, le salon au milieu, mon domaine et ma main à droite.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Flag, Home as HomeIcon, Landmark, LogOut, MoreHorizontal, Smile, Swords, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EMOTES, HOUSES, MISSION_POINTS, TAUNTS, missionKind, missionText, type Area, type CardView, type PlayerView, type RoomView } from '../../../shared/protocol';
import { Domain, Salon } from '../components/Salon';
import { Avatar, Button, CardFace, Logo, Modal, cardLabel } from '../components/Ui';
import { sfx } from '../lib/sound';
import { deName, placementText } from '../lib/text';
import { cls, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore } from '../store';

function useWide(): boolean {
  const query = '(min-width: 1000px)';
  const [wide, setWide] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

function ReactionTray({ onClose }: { onClose: () => void }) {
  const emit = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <motion.div className="reactions" role="menu" aria-label="Réactions" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
      <div className="reaction-emojis">
        {EMOTES.map((e) => (
          <button key={e} type="button" role="menuitem" onClick={() => emit(e)} aria-label={`Réaction ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <div className="reaction-taunts">
        {TAUNTS.map((t) => (
          <button key={t} type="button" role="menuitem" onClick={() => emit(t)}>
            {t}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Le temps qui reste au tour : un anneau qui se vide. */
function TurnClock({ endsAt, mine }: { endsAt: number; mine: boolean }) {
  const now = useTick(200);
  const total = useRef(0);
  const left = Math.max(0, endsAt - now);
  if (!total.current || left > total.current) total.current = left;
  const frac = total.current ? left / total.current : 0;
  const sec = Math.ceil(left / 1000);
  const last = useRef(0);
  useEffect(() => {
    if (mine && sec > 0 && sec <= 5 && sec !== last.current) {
      last.current = sec;
      sfx.tick();
    }
  }, [sec, mine]);
  return (
    <span className={cls('turn-clock', sec <= 10 && 'is-short')} role="timer" aria-label={`${sec} secondes`}>
      <svg viewBox="0 0 36 36" aria-hidden>
        <circle className="tc-back" cx="18" cy="18" r="15.5" />
        <circle className="tc-front" cx="18" cy="18" r="15.5" style={{ strokeDasharray: `${(frac * 97.4).toFixed(2)} 97.4` }} />
      </svg>
      <b>{sec}</b>
    </span>
  );
}

const AREA_ICON: Record<Area, typeof Landmark> = { salon: Landmark, home: HomeIcon, rival: Swords };
const AREA_NAME: Record<Area, string> = { salon: 'au salon', home: 'chez toi', rival: 'chez un rival' };

/** Les trois endroits du tour : ceux qui ont reçu leur carte sont cochés. */
function TurnSlots({ used }: { used: Area[] }) {
  return (
    <span className="turn-slots" aria-label={`Déjà posé\u00a0: ${used.length ? used.map((a) => AREA_NAME[a]).join(', ') : 'rien'}`}>
      {(['salon', 'home', 'rival'] as Area[]).map((a) => {
        const Icon = AREA_ICON[a];
        return (
          <i key={a} className={cls(used.includes(a) && 'is-done')}>
            <Icon size={12} strokeWidth={2.4} aria-hidden />
          </i>
        );
      })}
    </span>
  );
}

function Missions({ ids }: { ids: string[] }) {
  return (
    <ul className="missions">
      {ids.map((id) => {
        const kind = missionKind(id);
        return (
          <li key={id} className={cls('mission', `is-${kind}`)}>
            <span className="mission-kind">
              {kind === 'petit' ? 'Petit dessein' : 'Grand dessein'} <b>+{MISSION_POINTS[kind]}</b>
            </span>
            <span className="mission-text">{missionText(id)}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface Chase {
  card: number;
  area: Area;
  side: 'up' | 'down' | null;
  rival: string | null;
  prey: Set<number>;
}

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const wide = useWide();
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const emotes = useStore((s) => s.emotes);
  const [selected, setSelected] = useState<number | null>(null);
  const [chase, setChase] = useState<Chase | null>(null);
  const [react, setReact] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [sending, setSending] = useState(false);
  const [missionsOpen, setMissionsOpen] = useState(false);
  const isHost = view.hostId === view.me;
  const hand = g.hand;
  const seated = !!hand;
  const forced = view.settings.turn > 0 && g.endsAt === 0 && !g.pause;
  const myTurn = seated && g.turn === view.me && !g.pause && !forced;
  const players = g.order.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PlayerView => !!p);
  const meP = players.find((p) => p.id === view.me);
  const rivals = players.filter((p) => p.id !== view.me);
  const turnP = players.find((p) => p.id === g.turn);
  const selCard = hand?.find((c) => c.id === selected) ?? null;
  const freshId = g.last?.card.id ?? null;

  // Les desseins s'affichent une fois au début de la partie.
  const gameKey = `dg.intro.${view.code}.${g.order.join('.')}`;
  const [intro, setIntro] = useState(() => {
    if (!g.missions?.length) return false;
    try {
      return !sessionStorage.getItem(gameKey);
    } catch {
      return true;
    }
  });
  const closeIntro = () => {
    setIntro(false);
    try {
      sessionStorage.setItem(gameKey, '1');
    } catch {
      /* stockage indisponible */
    }
  };

  // Une carte choisie qui n'est plus dans la main est oubliée ; hors de mon tour, rien n'est choisi.
  const handIds = hand?.map((c) => c.id).join(',') ?? '';
  useEffect(() => {
    if (!myTurn) {
      setSelected(null);
      setChase(null);
      return;
    }
    if (selected !== null && !hand?.some((c) => c.id === selected)) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handIds, myTurn]);

  // Les sons : une carte posée (à la lumière, dans l'ombre), une Vipère qui chasse, mon tour.
  const seen = useRef({ n: g.last?.n ?? 0, turn: '' });
  useEffect(() => {
    const s = seen.current;
    const m = g.last;
    if (!m || m.n === s.n) return;
    s.n = m.n;
    sfx.place();
    const t = window.setTimeout(() => {
      if (m.removed) sfx.hiss();
      else if (m.side === 'up') sfx.up();
      else if (m.side === 'down') sfx.down();
      if (m.removed && (m.removed.owner === view.me)) vibrate([60, 40, 60]);
    }, 260);
    return () => window.clearTimeout(t);
  }, [g.last, view.me]);
  useEffect(() => {
    const s = seen.current;
    const key = `${g.turn}|${g.last?.n ?? 0}`;
    if (myTurn && !g.used.length && s.turn !== key) {
      s.turn = key;
      sfx.turn();
      vibrate(40);
    }
  }, [myTurn, g.turn, g.last?.n, g.used.length]);

  const emoteOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of emotes) m.set(e.playerId, e.emoji);
    return m;
  }, [emotes]);

  const can = (a: Area) => myTurn && !!selCard && !g.used.includes(a) && !sending && !chase;

  /** Les cartes qu'une Vipère pourrait chasser à cet endroit. */
  const preyAt = (area: Area, owner: string | null): Set<number> => {
    let pool: CardView[];
    if (area === 'salon') pool = [...HOUSES.flatMap((h) => [...g.salon.houses[h].up, ...g.salon.houses[h].down]), ...g.salon.veiled.up, ...g.salon.veiled.down];
    else pool = players.find((p) => p.id === owner)?.domain ?? [];
    return new Set(pool.filter((c) => c.role !== 'intouchable').map((c) => c.id));
  };

  const submit = async (card: number, area: Area, side: 'up' | 'down' | null, rival: string | null, target: number | null) => {
    setSending(true);
    setChase(null);
    setSelected(null);
    const ok = await send('card:play', { card, area, side, rival, target });
    if (!ok) setSelected(card);
    setSending(false);
  };

  const go = (area: Area, side: 'up' | 'down' | null, rival: string | null) => {
    if (!selCard || !can(area)) return;
    if (selCard.role === 'vipere') {
      const prey = preyAt(area, area === 'home' ? view.me : rival);
      if (prey.size) {
        sfx.tap();
        setChase({ card: selCard.id, area, side, rival, prey });
        return;
      }
    }
    void submit(selCard.id, area, side, rival, null);
  };

  const pick = (c: CardView) => {
    if (!myTurn || sending) return;
    sfx.pick();
    setChase(null);
    setSelected((x) => (x === c.id ? null : c.id));
  };

  // Ce que la table dit : la dernière carte posée, puis ce que je peux faire.
  const chronicle = g.last ? placementText(view, g.last) : 'La partie commence. Chacun a reçu trois cartes et ses desseins secrets.';
  const left = (['salon', 'home', 'rival'] as Area[]).filter((a) => !g.used.includes(a));
  let prompt: string;
  let tone: 'mine' | 'hunt' | '' = '';
  if (!seated) prompt = 'Tu regardes la partie\u00a0: tu joueras à la prochaine.';
  else if (chase) {
    tone = 'hunt';
    prompt = 'Ta Vipère peut chasser une carte\u00a0: touche celle qui doit partir.';
  } else if (myTurn) {
    tone = 'mine';
    if (selCard) prompt = `${capitalFirst(cardLabel(selCard))}\u00a0: touche l’endroit qui s’allume.`;
    else if (!g.used.length) prompt = 'À toi ! Pose tes 3 cartes\u00a0: une au salon, une chez toi, une chez un rival.';
    else prompt = `Encore ${left.map((a) => AREA_NAME[a]).join(' et ')}.`;
  } else if (forced && g.turn === view.me) prompt = 'Temps écoulé\u00a0: tes cartes partent d’office.';
  else if (g.pause) prompt = g.turn === view.me ? 'Tu reprends trois cartes…' : 'Le tour passe…';
  else prompt = `Au tour ${deName(turnP?.name ?? '?')}${turnP?.autopilot ? ' (pilote automatique)' : ''}…`;

  const salonArmed = can('salon') && selCard ? (selCard.role === 'incognito' ? 'veiled' : selCard.house) : null;
  const chaseIn = (area: Area, owner: string | null) => (chase && chase.area === area && (area === 'salon' || (area === 'home' ? owner === view.me : chase.rival === owner)) ? chase.prey : null);
  const hunt = (id: number) => chase && void submit(chase.card, chase.area, chase.side, chase.rival, id);

  const salonView = (
    <Salon salon={g.salon} armed={salonArmed} onPick={(side) => go('salon', side, null)} fresh={freshId} prey={chaseIn('salon', null)} onPrey={hunt} />
  );

  const rivalsView = (
    <ul className="domains" aria-label="Les domaines des rivaux">
      {rivals.map((p) => (
        <Domain
          key={p.id}
          p={p}
          me={false}
          turn={p.id === g.turn}
          armed={can('rival')}
          onPick={() => go('rival', null, p.id)}
          fresh={freshId}
          prey={chaseIn('rival', p.id)}
          onPrey={hunt}
          emote={emoteOf.get(p.id)}
        />
      ))}
    </ul>
  );

  const myDomain = meP && (
    <ul className="domains is-mine" aria-label="Mon domaine">
      <Domain
        p={meP}
        me
        turn={g.turn === view.me}
        armed={can('home')}
        onPick={() => go('home', null, null)}
        fresh={freshId}
        prey={chaseIn('home', view.me)}
        onPrey={hunt}
        emote={emoteOf.get(view.me)}
        onMissions={!wide && g.missions?.length ? () => setMissionsOpen(true) : undefined}
      />
    </ul>
  );

  const handView = hand && (
    <section className={cls('hand', myTurn && 'is-mine', !myTurn && 'is-waiting', chase && 'is-hunting')} aria-label="Ma main">
      <p className={cls('prompt', tone && `is-${tone}`)} aria-live="polite">
        {prompt}
      </p>
      {chase ? (
        <div className="hunt-actions">
          <Button variant="primary" onClick={() => void submit(chase.card, chase.area, chase.side, chase.rival, null)}>
            Ne chasser personne
          </Button>
          <Button variant="ghost" onClick={() => setChase(null)}>
            Changer d’endroit
          </Button>
        </div>
      ) : hand.length ? (
        <div className="hand-cards">
          <AnimatePresence initial={false}>
            {hand.map((c, i) => (
              <motion.div key={c.id} className="hand-slot" layout initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { delay: i * 0.05 } }} exit={{ y: -70, opacity: 0, scale: 0.7 }}>
                <CardFace card={c} selected={selected === c.id} onClick={() => pick(c)} className={cls(myTurn && 'is-playable')} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      ) : (
        <p className="hand-empty">Plus de carte en main.</p>
      )}
    </section>
  );

  return (
    <div className={cls('table-screen', wide && 'is-wide', myTurn && 'is-my-turn')}>
      <div className="velvet" aria-hidden />
      <header className="table-top">
        <span className="table-logo">
          <Logo size="sm" />
        </span>
        <div className={cls('turn-pill', myTurn && 'is-mine')} aria-live="polite">
          <Avatar avatar={turnP?.avatar ?? 'chapeau'} className="turn-avatar" />
          <span className="turn-text">
            <b>
              <span className="sr-only">Au tour de </span>
              {g.turn === view.me ? 'Toi !' : turnP?.name ?? '?'}
            </b>
            <TurnSlots used={g.used} />
          </span>
          {g.endsAt > 0 && !g.pause && <TurnClock endsAt={g.endsAt} mine={myTurn} />}
        </div>
        <div className="table-tools">
          <span className="deck" title="La pioche" aria-label={`Pioche\u00a0: ${g.deck} cartes`}>
            <i aria-hidden />
            <b>{g.deck}</b>
          </span>
          <button type="button" className={cls('icon-btn', react && 'is-on')} aria-label="Réagir" aria-expanded={react} onClick={() => setReact((x) => !x)}>
            <Smile size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <MoreHorizontal size={20} />
          </button>
        </div>
        {react && <ReactionTray onClose={() => setReact(false)} />}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={g.last?.n ?? 0} className={cls('chronicle', g.last?.removed && 'is-hunt')} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1, transition: { duration: 0.25 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }} aria-live="polite">
          {chronicle}
        </motion.p>
      </AnimatePresence>

      {wide ? (
        <div className="table-body">
          <aside className="side side-rivals">
            <h3 className="side-title">{rivals.length > 1 ? 'Les rivaux' : 'Ton rival'}</h3>
            {rivalsView}
          </aside>
          <main className="table-main">{salonView}</main>
          <aside className="side side-me">
            {myDomain}
            {g.missions && g.missions.length > 0 && (
              <div className="side-missions">
                <h3 className="side-title">Tes desseins secrets</h3>
                <Missions ids={g.missions} />
              </div>
            )}
            {handView ?? <p className="prompt">{prompt}</p>}
          </aside>
        </div>
      ) : (
        <>
          <main className="table-main">
            {salonView}
            {rivalsView}
            {myDomain}
          </main>
          {handView ?? (
            <section className="hand is-waiting">
              <p className="prompt">{prompt}</p>
            </section>
          )}
        </>
      )}

      <Modal open={intro} onClose={closeIntro} title="Tes desseins secrets" footer={<Button variant="primary" data-autofocus onClick={closeIntro}>C’est noté</Button>}>
        <p className="muted">Toi seul les connais. Ils rapportent des points s’ils sont remplis à la fin de la partie.</p>
        <Missions ids={g.missions ?? []} />
      </Modal>

      <Modal open={missionsOpen} onClose={() => setMissionsOpen(false)} title="Tes desseins secrets" sheet>
        <Missions ids={g.missions ?? []} />
        <p className="muted small">Toi seul les connais. Ils comptent s’ils sont remplis à la fin.</p>
      </Modal>

      <Modal
        open={menu}
        onClose={() => {
          setMenu(false);
          setConfirmStop(false);
        }}
        title="Menu"
      >
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            Son&nbsp;: {prefs.sound ? 'activé' : 'coupé'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              variant="danger"
              icon={<Flag size={18} />}
              onClick={() => {
                // Deux appuis : un geste malheureux ne doit pas couper la partie de toute la table.
                if (!confirmStop) {
                  setConfirmStop(true);
                  return;
                }
                setConfirmStop(false);
                setMenu(false);
                void send('game:end');
              }}
            >
              {confirmStop ? 'Confirmer\u00a0: arrêter pour tout le monde' : 'Arrêter la partie'}
            </Button>
          )}
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function capitalFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
