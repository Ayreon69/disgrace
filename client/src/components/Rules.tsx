// Les règles, lisibles en une minute et consultables à tout moment.
import { Hand, Layers, ScrollText, Sparkles, Trophy } from 'lucide-react';
import { HOUSES, HOUSE_NAME, MISSION_POINTS, ROLES, ROLE_COUNT, ROLE_NAME } from '../../../shared/protocol';
import { ROLE_HINT } from '../lib/text';
import { useStore } from '../store';
import { HouseIcon, Modal, RoleIcon } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <section className="rule-hero">
          <p>
            Au salon de la Duchesse, <b>six Maisons</b> se disputent sa faveur. Tu fais briller celles que tu accueilles chez toi, et tu fais tomber celles que tu offres à tes rivaux. Le but&nbsp;: <b>le plus de points à la fin</b>.
          </p>
          <ul className="rule-houses" aria-label="Les six Maisons">
            {HOUSES.map((h) => (
              <li key={h} className={`h-${h}`}>
                <HouseIcon house={h} />
                {HOUSE_NAME[h]}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>
            <Hand size={18} aria-hidden /> À ton tour
          </h3>
          <p>
            Tu as <b>3&nbsp;cartes</b>. Tu les poses toutes, <b>une à chaque endroit</b>, dans l’ordre que tu veux&nbsp;:
          </p>
          <ul className="rule-list">
            <li>
              <b>au salon</b>, dans la colonne de sa Maison&nbsp;: <span className="up">à la lumière</span> (au-dessus de la table) ou <span className="down">dans l’ombre</span> (en dessous)&nbsp;;
            </li>
            <li>
              <b>chez toi</b>, dans ton domaine&nbsp;;
            </li>
            <li>
              <b>chez un rival</b>, dans son domaine.
            </li>
          </ul>
          <p>Puis tu reprends 3&nbsp;cartes. Touche une carte de ta main, puis l’endroit qui s’allume.</p>
        </section>

        <section>
          <h3>
            <Layers size={18} aria-hidden /> Les cartes
          </h3>
          <p className="muted small">Chaque Maison a 15&nbsp;cartes&nbsp;: {ROLES.map((r) => `${ROLE_COUNT[r]} ${ROLE_NAME[r]}${ROLE_COUNT[r] > 1 ? 's' : ''}`).join(', ')}.</p>
          <ul className="rule-roles">
            {ROLES.map((r) => (
              <li key={r}>
                <span className={`rule-role r-${r}`}>{r === 'membre' ? <span className="rule-dot" /> : <RoleIcon role={r} />}</span>
                <span>
                  <b>{ROLE_NAME[r]}</b>&nbsp;: {ROLE_HINT[r]}
                  {r === 'eminence' && ', au salon comme dans un domaine'}
                  {r === 'incognito' && '. Personne ne la regarde ensuite, pas même toi. Au salon, il attend dans la loge de la Duchesse, à la lumière ou dans l’ombre, et rejoint sa Maison à la fin'}
                  {r === 'vipere' && ' (au choix) là où tu la poses : au salon, n’importe laquelle ; dans un domaine, une carte de ce domaine. La carte chassée quitte la partie'}
                  {r === 'intouchable' && '. Une fois posé, il reste'}.
                </span>
              </li>
            ))}
          </ul>
          <p className="muted small">À 2&nbsp;joueurs, on retire 30&nbsp;cartes sans les regarder&nbsp;; 18 à 3, 6 à 4, aucune à 5.</p>
        </section>

        <section>
          <h3>
            <ScrollText size={18} aria-hidden /> Tes desseins secrets
          </h3>
          <p>
            Tu reçois un <b>petit dessein</b> (+{MISSION_POINTS.petit}&nbsp;points) et un <b>grand dessein</b> (+{MISSION_POINTS.grand}&nbsp;points), connus de toi seul. Ils comptent s’ils sont remplis à la fin. L’hôte peut n’en donner qu’un, ou aucun.
          </p>
        </section>

        <section>
          <h3>
            <Sparkles size={18} aria-hidden /> La fin
          </h3>
          <p>
            Quand la pioche et les mains sont vides, on retourne les Incognitos. Pour chaque Maison, on compare les cartes <span className="up">à la lumière</span> et <span className="down">dans l’ombre</span> (une Éminence compte double)&nbsp;:
          </p>
          <ul className="rule-list">
            <li>
              plus à la lumière&nbsp;: <b className="good">en grâce</b>, chaque carte chez toi rapporte <b>+1</b>&nbsp;;
            </li>
            <li>
              plus dans l’ombre&nbsp;: <b className="bad">en disgrâce</b>, chaque carte chez toi coûte <b>−1</b>&nbsp;;
            </li>
            <li>autant des deux côtés&nbsp;: neutre, 0.</li>
          </ul>
          <p className="muted small">Une Éminence chez toi compte double elle aussi&nbsp;: +2 ou −2. Les cartes qu’on t’a offertes comptent pour toi.</p>
        </section>

        <section className="rule-win">
          <h3>
            <Trophy size={18} aria-hidden /> Qui gagne&nbsp;?
          </h3>
          <p>Le plus de points, desseins compris. Des ex æquo partagent la victoire.</p>
        </section>
        <p className="muted small">Inspiré d’un jeu de cartes de cour. Création de fans, non officielle&nbsp;: nom, Maisons, desseins et dessins originaux.</p>
      </div>
    </Modal>
  );
}
