// Little synthesized sounds (no audio files): Web Audio tones for joins, guesses, turns and the last seconds.
// The volume (0–100, set in the settings dialog) is remembered in this browser.

export type Sound = 'join' | 'leave' | 'guessed' | 'correct' | 'close' | 'turn' | 'myturn' | 'tick' | 'reveal' | 'end' | 'kick';

const NOTES: Record<Sound, [number, number, OscillatorType?, number?][]> = {
  // [frequency, duration s, wave, delay s]
  join: [[660, 0.07, 'sine', 0], [990, 0.09, 'sine', 0.07]],
  leave: [[440, 0.08, 'sine', 0], [294, 0.12, 'sine', 0.08]],
  guessed: [[880, 0.08, 'triangle', 0], [1175, 0.12, 'triangle', 0.08]],
  correct: [[523, 0.08, 'triangle', 0], [659, 0.08, 'triangle', 0.08], [784, 0.08, 'triangle', 0.16], [1047, 0.18, 'triangle', 0.24]],
  close: [[587, 0.06, 'square', 0], [554, 0.1, 'square', 0.07]],
  turn: [[392, 0.09, 'sine', 0], [523, 0.14, 'sine', 0.09]],
  myturn: [[523, 0.09, 'triangle', 0], [659, 0.09, 'triangle', 0.1], [784, 0.2, 'triangle', 0.2]],
  tick: [[1320, 0.03, 'square', 0]],
  reveal: [[698, 0.1, 'sine', 0], [523, 0.16, 'sine', 0.1]],
  end: [[784, 0.1, 'triangle', 0], [659, 0.1, 'triangle', 0.1], [784, 0.1, 'triangle', 0.2], [1047, 0.3, 'triangle', 0.3]],
  kick: [[220, 0.15, 'sawtooth', 0], [165, 0.2, 'sawtooth', 0.15]],
};

const KEY = 'sketch-volume';
let audio: AudioContext | null = null;

function load() {
  try {
    const saved = localStorage.getItem(KEY);
    // the old on/off switch: muted meant 0
    if (saved === null) return localStorage.getItem('sketch-muted') === '1' ? 0 : 80;
    const value = Number(saved);
    return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 80;
  } catch {
    return 80;
  }
}

export function useSounds() {
  const volume = useState<number>('volume', load);

  function setVolume(value: number) {
    volume.value = Math.max(0, Math.min(100, Math.round(value)));
    try {
      localStorage.setItem(KEY, String(volume.value));
    } catch {
      /* storage blocked */
    }
  }

  function play(sound: Sound) {
    if (!volume.value || typeof AudioContext === 'undefined') return;
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const start = audio.currentTime + 0.01;
    const loudness = (volume.value / 100) ** 2;
    for (const [freq, duration, wave = 'sine', delay = 0] of NOTES[sound]) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      const level = (wave === 'square' || wave === 'sawtooth' ? 0.035 : 0.08) * loudness;
      gain.gain.setValueAtTime(0, start + delay);
      gain.gain.linearRampToValueAtTime(level, start + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(start + delay);
      osc.stop(start + delay + duration + 0.02);
    }
  }

  return { volume, setVolume, play };
}
