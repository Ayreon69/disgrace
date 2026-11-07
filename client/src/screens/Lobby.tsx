// Salon : partage de la table, joueurs, réglages de l'hôte (temps par tour, desseins secrets), lancement.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, Trophy, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, MISSION_MODES, TURN_TIMES, removedAtStart, type MissionMode, type PlayerView, type RoomView, type TurnTime } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ view, p, i, isHost }: { view: RoomView; p: PlayerView; i: number; isHost: boolean }) {
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <span className="player-num">{String(i + 1).padStart(2, '0')}</span>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      {p.wins > 0 && (
        <Pill tone="gold" className="wins-pill">
          <Trophy size={12} aria-hidden /> {p.wins}
        </Pill>
      )}
      {p.isHost && (
        <Pill tone="ink">
          <Crown size={12} aria-hidden /> Hôte
        </Pill>
      )}
      {p.isBot && <Pill tone="soft">Bot</Pill>}
      {!p.connected && <Pill>Hors ligne</Pill>}
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const blocked = seated.length < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : null;
  const removed = removedAtStart(Math.max(MIN_PLAYERS, seated.length));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Disgrâce', text: `Rejoins ma table de Disgrâce (code ${view.code})\u00a0!`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Backdrop quiet>
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} initial={{ y: -18, rotate: -6 }} animate={{ y: 0, rotate: i % 2 ? 2 : -2 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 14 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
        </motion.section>

        <div className="lobby-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>
                Joueurs <span className="muted">{seated.length}/{MAX_PLAYERS}</span>
              </h3>
              {isHost && (
                <Button variant="soft" icon={<Bot size={18} />} disabled={seated.length >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                  Ajouter un bot
                </Button>
              )}
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} view={view} p={p} i={i} isHost={isHost} />
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - seated.length) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-num">{String(seated.length + i + 1).padStart(2, '0')}</span>
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">En attente d'un joueur…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
            <p className="muted small lobby-note">De 2 à 5 joueurs. Les bots ne voient que ce que tu vois, et ils n’ont pas tous la même finesse.</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Réglages</h3>
              {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
            </div>
            <span className="field-label">Temps par tour</span>
            <Segmented<TurnTime>
              label="Temps par tour"
              className="seg-turns"
              value={s.turn}
              disabled={!isHost}
              onChange={(turn) => void send('room:settings', { turn })}
              options={TURN_TIMES.map((t) => ({ value: t, label: t ? String(t) : '∞', sub: t ? 'secondes' : 'sans limite' }))}
            />
            <p className="muted small lobby-note">{s.turn ? `Au bout de ${s.turn} secondes, la carte est posée d'office.` : 'Chacun prend son temps.'}</p>
            <span className="field-label">Desseins secrets</span>
            <Segmented<MissionMode>
              label="Desseins secrets"
              className="seg-missions"
              value={s.missions}
              disabled={!isHost}
              onChange={(missions) => void send('room:settings', { missions })}
              options={MISSION_MODES.map((m) => ({ value: m, label: m === 2 ? 'Deux' : m === 1 ? 'Un' : 'Aucun', sub: m === 2 ? 'petit + grand' : m === 1 ? 'un petit' : 'cartes seules' }))}
            />
            <p className="muted small lobby-note">{s.missions === 2 ? 'Chacun reçoit un petit dessein (+3) et un grand (+5), gardés secrets.' : s.missions === 1 ? 'Chacun reçoit un petit dessein (+3), gardé secret.' : 'Pas de dessein\u00a0: seules les cartes comptent.'}</p>
            <p className="muted small lobby-note">{removed ? `À ${Math.max(MIN_PLAYERS, seated.length)}, ${removed} cartes sont retirées sans être vues.` : 'À 5, on joue avec les 90 cartes.'}</p>
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!blocked} onClick={() => void send('game:start')}>
              {blocked ?? `Lancer la partie (${seated.length} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau&nbsp;? Les règles en 1&nbsp;minute
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#f7efdf" fgColor="#2a1530" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Backdrop>
  );
}
