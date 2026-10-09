// Short synthesized move sounds (no audio assets to ship).

let ctx: AudioContext | null = null;

function tone(freq: number, duration: number, gain: number) {
  ctx ??= new AudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + duration);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration);
}

export function playMoveSound(kind: 'move' | 'capture' | 'error' | 'success') {
  // Browsers refuse audio before the first user gesture.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (kind === 'move') tone(420, 0.07, 0.18);
    else if (kind === 'capture') tone(260, 0.11, 0.3);
    else if (kind === 'error') tone(140, 0.22, 0.25);
    else {
      tone(660, 0.1, 0.15);
      setTimeout(() => tone(880, 0.14, 0.15), 90);
    }
  } catch {
    // Audio can be blocked until the first user gesture.
  }
}
