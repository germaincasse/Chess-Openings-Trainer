// Wooden piece sounds synthesized with WebAudio (no audio assets to ship). Each knock is a very
// short band-passed noise burst (the impact), a few damped inharmonic partials (the wood ringing)
// and a low thump (the board), slightly randomized so repeated moves never sound identical.

type SoundKind = 'move' | 'capture' | 'error' | 'success';

interface Knock {
  /** Fundamental of the wood partials (Hz). */
  pitch: number;
  /** Overall level, 0 to 1. */
  gain: number;
  /** Time for the fundamental to die out (s); the upper partials fade faster. */
  decay: number;
  /** Centre of the impact noise band (Hz) and its level. */
  click: number;
  clickGain: number;
  /** Board thump frequency (Hz) and level (0: none). */
  thump: number;
  thumpGain: number;
  /** Level of the upper partials: lower sounds duller. */
  bright: number;
}

/** Modes of a free wooden bar: [frequency ratio, level, relative decay]. Inharmonic, hence "wood" and not "bell". */
const MODES: [number, number, number][] = [
  [1, 1, 1],
  [2.76, 0.45, 0.5],
  [5.4, 0.2, 0.28],
];

const MOVE: Knock = { pitch: 620, gain: 0.55, decay: 0.08, click: 2600, clickGain: 0.9, thump: 165, thumpGain: 0.5, bright: 1 };
// Capture: a lighter knock (the captured piece) then the heavier, lower landing.
const CAPTURE_HIT: Knock = { pitch: 540, gain: 0.4, decay: 0.06, click: 2300, clickGain: 0.9, thump: 140, thumpGain: 0.35, bright: 0.9 };
const CAPTURE_LAND: Knock = { pitch: 440, gain: 0.62, decay: 0.11, click: 1800, clickGain: 1, thump: 115, thumpGain: 0.8, bright: 0.75 };
// Error: muted low thud, almost no ring.
const ERROR: Knock = { pitch: 240, gain: 0.6, decay: 0.15, click: 800, clickGain: 0.6, thump: 85, thumpGain: 0.75, bright: 0.3 };
// Success: two light ascending knocks (a fourth apart).
const SUCCESS_LOW: Knock = { pitch: 880, gain: 0.45, decay: 0.07, click: 3400, clickGain: 0.6, thump: 0, thumpGain: 0, bright: 0.7 };
const SUCCESS_HIGH: Knock = { ...SUCCESS_LOW, pitch: 880 * (4 / 3), gain: 0.5, decay: 0.09 };

interface Noise {
  white: AudioBuffer;
  brown: AudioBuffer;
}

interface Out {
  c: BaseAudioContext;
  dest: AudioNode;
  noise: Noise;
}

const jitter = (x: number, amount: number) => x * (1 + (Math.random() * 2 - 1) * amount);

/** Half a second of white and brown noise, computed once. */
function makeNoise(c: BaseAudioContext): Noise {
  const length = Math.floor(c.sampleRate * 0.5);
  const white = c.createBuffer(1, length, c.sampleRate);
  const brown = c.createBuffer(1, length, c.sampleRate);
  const w = white.getChannelData(0);
  const b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    w[i] = Math.random() * 2 - 1;
    last = (last + 0.02 * w[i]) / 1.02;
    b[i] = last * 3.5;
  }
  return { white, brown };
}

/** Gain node with a near-instant attack and an exponential fade to silence, wired to the output. */
function envelope(o: Out, t: number, peak: number, decay: number, attack = 0.001): GainNode {
  const g = o.c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(o.dest);
  return g;
}

/** Filtered noise burst read from a random offset of a precomputed buffer. */
function burst(o: Out, buffer: AudioBuffer, t: number, type: BiquadFilterType, freq: number, peak: number, decay: number) {
  const src = o.c.createBufferSource();
  src.buffer = buffer;
  const filter = o.c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = type === 'bandpass' ? 1.2 : 0.7;
  src.connect(filter).connect(envelope(o, t, peak, decay, 0.0005));
  src.start(t, Math.random() * (buffer.duration - decay - 0.05), decay + 0.01);
}

/** Damped sine partial; starts slightly sharp, as a struck body does. */
function ring(o: Out, t: number, freq: number, peak: number, decay: number, drop = 1.02) {
  const osc = o.c.createOscillator();
  osc.frequency.setValueAtTime(freq * drop, t);
  osc.frequency.exponentialRampToValueAtTime(freq, t + 0.02);
  osc.connect(envelope(o, t, peak, decay));
  osc.start(t);
  osc.stop(t + decay + 0.01);
}

function knock(o: Out, t: number, k: Knock, tune: number) {
  const pitch = k.pitch * tune * jitter(1, 0.02);
  const level = jitter(k.gain, 0.1);
  // Impact: a few milliseconds of band-passed noise.
  burst(o, o.noise.white, t, 'bandpass', jitter(k.click, 0.15), level * k.clickGain * 1.6, jitter(0.012, 0.25));
  // Wood: inharmonic partials, the higher ones dying first.
  MODES.forEach(([ratio, amp, decay], i) => {
    ring(o, t, pitch * jitter(ratio, 0.01), level * amp * (i ? k.bright : 1) * 0.5, k.decay * decay);
  });
  // Board: low pitched-down thump with a little rumble.
  if (k.thumpGain) {
    ring(o, t, jitter(k.thump, 0.05), level * k.thumpGain * 0.55, k.decay * 0.8, 1.35);
    burst(o, o.noise.brown, t, 'lowpass', k.thump * 3, level * k.thumpGain * 0.6, k.decay * 0.6);
  }
}

function play(o: Out, kind: SoundKind, t: number) {
  const tune = jitter(1, 0.06);
  if (kind === 'move') knock(o, t, MOVE, tune);
  else if (kind === 'capture') {
    knock(o, t, CAPTURE_HIT, tune);
    knock(o, t + jitter(0.05, 0.15), CAPTURE_LAND, tune);
  } else if (kind === 'error') knock(o, t, ERROR, tune);
  else {
    knock(o, t, SUCCESS_LOW, tune);
    knock(o, t + 0.1, SUCCESS_HIGH, tune);
  }
}

let live: (Out & { c: AudioContext }) | null = null;

/** Single AudioContext, created on first use; a limiter keeps overlapping knocks from clipping. */
function output(): Out & { c: AudioContext } {
  if (live) return live;
  const c = new AudioContext();
  const master = c.createGain();
  master.gain.value = 0.9;
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 3;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;
  master.connect(limiter).connect(c.destination);
  live = { c, dest: master, noise: makeNoise(c) };
  return live;
}

export function playMoveSound(kind: SoundKind) {
  // Browsers refuse audio before the first user gesture.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    const o = output();
    if (o.c.state === 'suspended') o.c.resume().catch(() => {});
    play(o, kind, o.c.currentTime + 0.005);
  } catch {
    // Audio unavailable or blocked: moves stay silent.
  }
}
