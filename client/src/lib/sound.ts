// Sons synthétisés (Web Audio), aucun fichier à charger : un clavecin pincé, le froissé d'un éventail,
// le sifflement d'une Vipère, le cachet de cire qui tombe, et une petite fanfare de salon.
import { useStore } from '../store';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().prefs.sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; delay?: number; slide?: number; attack?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * opts.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.1, t0 + (opts.attack ?? 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, opts: { gain?: number; delay?: number; freq?: number; type?: BiquadFilterType; q?: number; fade?: number; sweep?: number } = {}): void {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + (opts.delay ?? 0);
  const buffer = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate);
  const data = buffer.getChannelData(0);
  const fade = opts.fade ?? 2;
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** fade;
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.freq ?? 2400, t0);
  if (opts.sweep) filter.frequency.exponentialRampToValueAtTime(opts.sweep, t0 + dur);
  if (opts.q) filter.Q.value = opts.q;
  const g = a.createGain();
  g.gain.value = opts.gain ?? 0.25;
  src.connect(filter).connect(g).connect(a.destination);
  src.start(t0);
}

/** Une corde de clavecin : attaque sèche, harmonique, extinction rapide. */
function pluck(freq: number, gain: number, delay = 0): void {
  tone(freq, 0.45, { type: 'triangle', gain, delay, attack: 0.002 });
  tone(freq * 2, 0.22, { type: 'square', gain: gain * 0.12, delay, attack: 0.002 });
}

export const sfx = {
  /** Une carte qu'on prend en main. */
  pick: () => noise(0.05, { gain: 0.14, freq: 3400, q: 1.5, fade: 4 }),
  /** Une carte posée sur la nappe : un froissé d'éventail. */
  place: () => {
    noise(0.18, { gain: 0.12, freq: 1200, sweep: 3600, q: 0.7, fade: 1.6 });
    pluck(587.33, 0.04, 0.05);
  },
  /** À la lumière : une corde pincée qui monte. */
  up: () => {
    pluck(783.99, 0.05);
    pluck(1174.66, 0.04, 0.08);
  },
  /** Dans l'ombre : une corde pincée qui descend. */
  down: () => {
    pluck(392, 0.05);
    pluck(293.66, 0.045, 0.09);
  },
  /** La Vipère chasse une carte : un sifflement. */
  hiss: () => {
    noise(0.5, { gain: 0.16, freq: 5200, q: 0.6, fade: 1.2, type: 'highpass' });
    tone(160, 0.25, { type: 'triangle', gain: 0.05, slide: 0.6, delay: 0.25 });
  },
  /** C'est ton tour : deux notes de clavecin. */
  turn: () => {
    pluck(1046.5, 0.05);
    pluck(1318.5, 0.045, 0.1);
  },
  /** Un tap discret. */
  tap: () => tone(660, 0.05, { type: 'triangle', gain: 0.025 }),
  /** Une des dernières secondes du tour. */
  tick: () => noise(0.015, { gain: 0.12, freq: 4200, q: 4, fade: 8 }),
  /** Le cachet de cire qui tombe sur une Maison. */
  seal: (good: boolean | null) => {
    noise(0.09, { gain: 0.2, freq: 260, q: 0.9, fade: 3 });
    tone(good ? 880 : good === false ? 196 : 440, 0.35, { type: 'triangle', gain: 0.045, delay: 0.04, slide: good === false ? 0.8 : 1 });
  },
  /** Fin de partie : une petite fanfare, ou une descente. */
  fanfare: (good: boolean) => {
    const notes = good ? [523.25, 659.25, 783.99, 1046.5, 1318.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((f, i) => pluck(f, 0.06, 0.12 + i * 0.13));
    if (good) tone(261.6, 1.8, { type: 'sine', gain: 0.05, delay: 0.1 });
  },
  /** Début de partie : les cartes sont distribuées. */
  deal: (n = 6) => {
    for (let i = 0; i < n; i++) noise(0.06, { gain: 0.11, freq: 1600 + i * 180, q: 1.2, fade: 3, delay: i * 0.08 });
  },
};
