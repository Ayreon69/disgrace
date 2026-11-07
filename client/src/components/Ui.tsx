// Briques d'interface communes : boutons, fenêtres (empilées : Échap ne ferme que celle du dessus), pastilles,
// sélecteurs, logo, avatars, emblèmes des Maisons et des rôles, et les cartes : en main (grande face) et posées (jeton).
import { X } from 'lucide-react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { HOUSE_NAME, ROLE_NAME, type CardView, type House, type Role } from '../../../shared/protocol';
import { ROLE_HINT } from '../lib/text';
import { cls } from '../lib/util';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'ghost' | 'danger' | 'soft';
  icon?: ReactNode;
}

export function Button({ variant = 'default', icon, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cls('btn', `btn-${variant}`, className)} {...rest}>
      {icon}
      {children && <span className="btn-label">{children}</span>}
    </button>
  );
}

// ───────────────────────────── Emblèmes ─────────────────────────────

/** Les emblèmes des six Maisons, dessinés au trait comme une gravure dorée. */
const HOUSE_PATHS: Record<House, ReactNode> = {
  // Un flacon de parfum à bouchon taillé.
  parfum: (
    <>
      <path d="M9.5 3.5h5l-.8 3h-3.4z" />
      <path d="M10.4 6.5v1.6C7 9 5.5 11.4 5.5 14.3c0 3.6 2.9 6.2 6.5 6.2s6.5-2.6 6.5-6.2c0-2.9-1.5-5.3-4.9-6.2V6.5" />
      <path d="M8.6 14.6c.6 1.7 1.9 2.7 3.4 2.7" />
    </>
  ),
  // Une coupe de verre soufflé.
  verre: (
    <>
      <path d="M6 3.5h12c0 5.2-2.5 8.6-6 8.6S6 8.7 6 3.5z" />
      <path d="M12 12.1v5.6" />
      <path d="M8 20.5c.8-1.7 2.2-2.8 4-2.8s3.2 1.1 4 2.8z" />
      <path d="M8.4 6.4c.6 1.8 1.9 3 3.4 3.2" />
    </>
  ),
  // Une montre à gousset et sa couronne.
  horloge: (
    <>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M10.6 4.2h2.8M12 4.2v2.3" />
      <path d="M12 9.6v4l2.7 1.8" />
      <path d="M12 7.6v.6M17.9 13.5h-.6M12 19.4v-.6M6.1 13.5h.6" />
    </>
  ),
  // Une bobine de fil de soie.
  soie: (
    <>
      <path d="M6.5 3.5h11M6.5 20.5h11" />
      <path d="M8 3.5c1.2 2 1.2 15 0 17M16 3.5c-1.2 2-1.2 15 0 17" />
      <path d="M8.9 7.5l6.2 2.2M8.9 11l6.2 2.2M8.9 14.5l6.2 2.2" />
      <path d="M15.6 17.4c2.4.6 3.3 1.8 3.9 3.4" />
    </>
  ),
  // Un bonbon dans sa papillote.
  sucre: (
    <>
      <ellipse cx="12" cy="12" rx="4.6" ry="3.6" />
      <path d="M7.5 11 3.5 8v8l4-3M16.5 11l4-3v8l-4-3" />
      <path d="M10.4 9.1c-.9 1.8-.9 4 0 5.8M13.6 9.1c.9 1.8.9 4 0 5.8" />
    </>
  ),
  // Une rose des vents.
  carte: (
    <>
      <path d="M12 2.8 14 10l7.2 2-7.2 2-2 7.2-2-7.2L2.8 12 10 10z" />
      <path d="M12 10v4M10 12h4" />
      <circle cx="12" cy="12" r="5.6" strokeDasharray="1.2 1.6" />
    </>
  ),
};

export function HouseIcon({ house, className, title }: { house: House; className?: string; title?: string }) {
  return (
    <svg className={cls('house-icon', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {HOUSE_PATHS[house]}
    </svg>
  );
}

/** Les marques des rôles : couronne, masque, serpent, bouclier. Le Membre n'en a pas. */
const ROLE_PATHS: Record<Exclude<Role, 'membre'>, ReactNode> = {
  eminence: <path d="M4 17.5h16M4.8 17.5 3.5 8l5 3.8L12 5l3.5 6.8 5-3.8-1.3 9.5" />,
  incognito: (
    <>
      <path d="M3 9.5c2.8-1.6 6-1.4 9 .4 3-1.8 6.2-2 9-.4-.3 3.8-2.4 6.3-5.3 6.3-1.6 0-2.8-.9-3.7-2.4-.9 1.5-2.1 2.4-3.7 2.4-2.9 0-5-2.5-5.3-6.3z" />
      <path d="M6.6 11.6c.9-.5 1.9-.5 2.8 0M14.6 11.6c.9-.5 1.9-.5 2.8 0" />
    </>
  ),
  vipere: (
    <>
      <path d="M17.5 5.5c-2.4-1.7-6.6-1.2-6.6 1.8 0 3.4 7.3 2.6 7.3 6.8 0 3.2-3.4 4.9-7.1 4.4-2.6-.4-4.5-1.7-5.6-3.5" />
      <path d="M5.5 15l-1.5-.9M5.5 15l.2 1.8" />
      <circle cx="16.3" cy="5.4" r=".4" fill="currentColor" />
    </>
  ),
  intouchable: <path d="M12 3.2 19 6v5.6c0 4.4-2.9 7.8-7 9.2-4.1-1.4-7-4.8-7-9.2V6z" />,
};

export function RoleIcon({ role, className }: { role: Role; className?: string }) {
  if (role === 'membre') return null;
  return (
    <svg className={cls('role-icon', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ROLE_PATHS[role]}
    </svg>
  );
}

/** L'éventail de la Duchesse : il marque sa loge, au centre du salon. */
export function Fan({ className }: { className?: string }) {
  return (
    <svg className={cls('fan', className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20 3.4 9.6C5.6 6.4 8.6 4.8 12 4.8s6.4 1.6 8.6 4.8z" />
      <path d="M12 20 7.2 6.1M12 20V4.8M12 20l4.8-13.9M12 20 4.9 7.6M12 20l7.1-12.4" />
      <circle cx="12" cy="20" r="1" fill="currentColor" />
    </svg>
  );
}

// ───────────────────────────── Logo et décor ─────────────────────────────

/** Le titre : « Disgrâce » en italique Didone, l'accent circonflexe en or. Sur la table, l'emblème seul. */
export function Logo({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  if (size === 'sm') {
    return (
      <span className="logo logo-sm" role="img" aria-label="Disgrâce">
        <span className="logo-mark" aria-hidden>
          <Fan />
        </span>
        <span className="logo-name" aria-hidden>
          Disgrâce
        </span>
      </span>
    );
  }
  return (
    <div className={cls('logo', `logo-${size}`)} role="img" aria-label="Disgrâce">
      <span className="logo-orn" aria-hidden />
      <span className="logo-word" aria-hidden>
        Disgrâce
      </span>
      <span className="logo-sub" aria-hidden>
        au salon de la Duchesse
      </span>
    </div>
  );
}

/** Le décor : velours aubergine, motif de damas, lueur du lustre. */
export function Backdrop({ children, className, quiet = false }: { children: ReactNode; className?: string; quiet?: boolean }) {
  return (
    <div className={cls('backdrop', quiet && 'is-quiet', className)}>
      <div className="velvet" aria-hidden />
      <div className="backdrop-body">{children}</div>
    </div>
  );
}

export function Pill({ tone, children, className }: { tone?: 'ink' | 'soft' | 'red' | 'gold'; children: ReactNode; className?: string }) {
  return <span className={cls('pill', tone && `pill-${tone}`, className)}>{children}</span>;
}

interface SegmentedOption<T> {
  value: T;
  label: string;
  sub?: string;
  disabled?: boolean;
}

export function Segmented<T extends string | number | boolean>({ options, value, onChange, disabled, label, className }: { options: SegmentedOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; label: string; className?: string }) {
  return (
    <div className={cls('segmented', className)} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || o.disabled}
          className={cls('seg', o.value === value && 'is-on')}
          onClick={() => onChange(o.value)}
        >
          <b>{o.label}</b>
          {o.sub && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

// ───────────────────────────── Fenêtres ─────────────────────────────

/** La pile des fenêtres ouvertes : Échap ne ferme que celle du dessus. */
const stack: symbol[] = [];

/**
 * Une fenêtre, rendue à la racine du document pour ne dépendre d'aucun parent.
 * « sheet » : sur téléphone, elle monte du bas de l'écran, à portée de pouce.
 */
export function Modal({ open, onClose, title, children, wide, sheet, footer, className }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean; sheet?: boolean; footer?: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const me = Symbol('modal');
    stack.push(me);
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) {
        e.stopPropagation();
        close.current();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => box.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true }), 30);
    return () => {
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      before?.focus?.({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;
  return createPortal(
    <div className={cls('modal-back', sheet && 'is-sheet')} onClick={onClose}>
      <div ref={box} className={cls('modal', wide && 'is-wide', sheet && 'is-sheet', className)} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

// ───────────────────────────── Avatars ─────────────────────────────

export const AVATAR_EMOJI: Record<string, string> = {
  chapeau: '🎩',
  rose: '🌹',
  bougie: '🕯️',
  violon: '🎻',
  coupe: '🍷',
  paon: '🦚',
  cle: '🗝️',
  diamant: '💎',
  masque: '🎭',
  cygne: '🦢',
  gateau: '🍰',
  ruban: '🎀',
};

export const AVATAR_LABELS: Record<string, string> = {
  chapeau: 'Haut-de-forme',
  rose: 'Rose',
  bougie: 'Bougie',
  violon: 'Violon',
  coupe: 'Coupe',
  paon: 'Paon',
  cle: 'Clé',
  diamant: 'Diamant',
  masque: 'Masque',
  cygne: 'Cygne',
  gateau: 'Gâteau',
  ruban: 'Ruban',
};

export function Avatar({ avatar, className }: { avatar: string; className?: string }) {
  return (
    <span className={cls('avatar', className)} aria-hidden>
      {AVATAR_EMOJI[avatar] ?? '🎩'}
    </span>
  );
}

// ───────────────────────────── Cartes ─────────────────────────────

/** Comment on dit une carte à voix haute : « une Éminence des Verriers », « un Incognito ». */
export function cardLabel(c: CardView): string {
  const art = c.role === 'eminence' || c.role === 'vipere' ? 'une' : 'un';
  if (!c.house) return `${art} ${ROLE_NAME[c.role]}`;
  return `${art} ${ROLE_NAME[c.role]} des ${HOUSE_NAME[c.house]}`;
}

/** Une carte en main, en grand : la Maison en haut, son emblème, son rôle en bas. */
export function CardFace({ card, selected, disabled, onClick, className, small }: { card: CardView; selected?: boolean; disabled?: boolean; onClick?: () => void; className?: string; small?: boolean }) {
  const house = card.house!;
  const body = (
    <>
      <span className="cf-house">{HOUSE_NAME[house]}</span>
      <span className="cf-art">
        <HouseIcon house={house} className="cf-emblem" />
        {card.role === 'eminence' && <span className="cf-double">×2</span>}
      </span>
      <span className="cf-role">
        <RoleIcon role={card.role} className="cf-role-icon" />
        <b>{ROLE_NAME[card.role]}</b>
      </span>
      <span className="cf-hint">{ROLE_HINT[card.role]}</span>
    </>
  );
  const classes = cls('card-face', `h-${house}`, `r-${card.role}`, selected && 'is-selected', small && 'is-small', className);
  if (!onClick) return <span className={classes}>{body}</span>;
  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${cardLabel(card)}${ROLE_HINT[card.role] ? `\u00a0: ${ROLE_HINT[card.role]}` : ''}`}
      // Une carte touchée ne garde pas le focus : Entrée ne doit pas la reprendre.
      onMouseDown={(e) => e.preventDefault()}
    >
      {body}
    </button>
  );
}

/** Une carte posée, en petit : la couleur de sa Maison, son emblème, la marque de son rôle. Un Incognito montre son dos. */
export function Token({ card, className, fresh, prey, onClick, veiled }: { card: CardView; className?: string; fresh?: boolean; prey?: boolean; onClick?: () => void; veiled?: boolean }) {
  const hidden = !card.house;
  const inner = hidden ? (
    <span className="tk-back">
      <RoleIcon role="incognito" className="tk-mask" />
    </span>
  ) : (
    <>
      <HouseIcon house={card.house!} className="tk-emblem" />
      {card.role !== 'membre' && <RoleIcon role={card.role} className="tk-role" />}
    </>
  );
  const classes = cls('token', hidden ? 'is-hidden' : `h-${card.house}`, `r-${card.role}`, fresh && 'is-fresh', prey && 'is-prey', veiled && 'was-veiled', className);
  const label = hidden ? 'un Incognito face cachée' : cardLabel(card);
  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick} aria-label={`Chasser ${label}`} onMouseDown={(e) => e.preventDefault()}>
        {inner}
      </button>
    );
  }
  return (
    <span className={classes} title={label} role="img" aria-label={label}>
      {inner}
    </span>
  );
}
