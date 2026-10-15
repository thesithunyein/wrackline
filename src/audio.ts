// Procedural Web Audio Synthesizer for WRACKLINE - Professional AAA Game Sound Design
// 100% Procedurally Synthesized - Zero External Audio Files - Zero Network Requests

let audioCtx: AudioContext | null = null;
let rumbleOsc: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;
let rumbleFilter: BiquadFilterNode | null = null;

// Ambient ocean surf wash nodes
let ambientNoise: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let ambientFilter: BiquadFilterNode | null = null;

let isMuted = false;
let audioStarted = false;
let consecutivePicks = 0;
let lastPickTime = 0;

export function initAudio() {
  if (audioStarted && audioCtx && audioCtx.state === 'running') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      if (!audioCtx) {
        audioCtx = new AudioContextClass();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      audioStarted = true;
      startAmbientOcean();
    }
  } catch {
    // Audio restricted or not supported
  }
}

export function toggleMute(): boolean {
  isMuted = !isMuted;
  if (ambientGain && audioCtx) {
    ambientGain.gain.setValueAtTime(isMuted ? 0 : 0.04, audioCtx.currentTime);
  }
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

// Gentle continuous procedural ocean surf breeze in background (soft, atmospheric)
function startAmbientOcean() {
  if (!audioCtx || ambientNoise) return;
  try {
    const bufferSize = audioCtx.sampleRate * 4;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    // Pinkish noise for natural sea breeze
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0555179;
      b1 = 0.96300 * b1 + white * 0.0750759;
      b2 = 0.57000 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.2;
    }

    ambientNoise = audioCtx.createBufferSource();
    ambientNoise.buffer = buffer;
    ambientNoise.loop = true;

    ambientFilter = audioCtx.createBiquadFilter();
    ambientFilter.type = 'lowpass';
    ambientFilter.frequency.setValueAtTime(320, audioCtx.currentTime);

    // LFO to simulate gentle sea swells breathing
    const lfo = audioCtx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, audioCtx.currentTime);
    const lfoGain = audioCtx.createGain();
    lfoGain.gain.setValueAtTime(120, audioCtx.currentTime);
    lfo.connect(ambientFilter.frequency);
    lfo.start();

    ambientGain = audioCtx.createGain();
    ambientGain.gain.setValueAtTime(isMuted ? 0 : 0.035, audioCtx.currentTime);

    ambientNoise.connect(ambientFilter);
    ambientFilter.connect(ambientGain);
    ambientGain.connect(audioCtx.destination);

    ambientNoise.start();
  } catch {}
}

// Small crisp tick when you grab an item - pitches up musically with consecutive grabs!
export function playTick() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const now = performance.now();
    if (now - lastPickTime < 600) {
      consecutivePicks = Math.min(6, consecutivePicks + 1);
    } else {
      consecutivePicks = 0;
    }
    lastPickTime = now;

    // Musical pentatonic scale for pickups (C5, D5, E5, G5, A5, C6)
    const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66];
    const baseFreq = scale[consecutivePicks % scale.length];

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq * 1.5, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq, t + 0.03);
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {}
}

// Thock when you bank - rich wooden/watery pop with body and warm sub resonance
export function playThock() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    // Main warm body oscillator
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.14);
    gain.gain.setValueAtTime(0.48, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.17);

    // Pop click transient
    const osc2 = audioCtx.createOscillator();
    const gain2 = audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(750, t);
    gain2.gain.setValueAtTime(0.28, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    osc2.connect(gain2);
    gain2.connect(audioCtx.destination);
    osc2.start(t);
    osc2.stop(t + 0.03);
  } catch {}
}

// Sound when wrack line creeps forward (dry flotsam scrape / sand crunch)
export function playWrackCrunch() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.15);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(450, t);
    filter.Q.setValueAtTime(3, t);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  } catch {}
}

// Swelling ocean warning rumble before breaker sweeps in
export function startRumble(duration: number) {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    stopRumble();
    const t = audioCtx.currentTime;
    rumbleOsc = audioCtx.createOscillator();
    rumbleGain = audioCtx.createGain();
    rumbleFilter = audioCtx.createBiquadFilter();

    rumbleOsc.type = 'triangle';
    rumbleOsc.frequency.setValueAtTime(36, t);
    rumbleOsc.frequency.linearRampToValueAtTime(58, t + duration);

    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(75, t);
    rumbleFilter.frequency.linearRampToValueAtTime(190, t + duration);

    rumbleGain.gain.setValueAtTime(0.001, t);
    rumbleGain.gain.linearRampToValueAtTime(0.32, t + duration * 0.9);

    rumbleOsc.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(audioCtx.destination);

    rumbleOsc.start(t);
  } catch {}
}

export function stopRumble() {
  if (!audioCtx || !rumbleGain) return;
  try {
    const t = audioCtx.currentTime;
    rumbleGain.gain.linearRampToValueAtTime(0.001, t + 0.06);
    if (rumbleOsc) {
      rumbleOsc.stop(t + 0.08);
      rumbleOsc = null;
    }
    rumbleGain = null;
  } catch {}
}

// Crash when wave lands on the beach
export function playCrash() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const bufferSize = Math.floor(audioCtx.sampleRate * 0.85);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.19));
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1700, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + 0.7);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(t);

    // Deep sub bass impact
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.4);
    subGain.gain.setValueAtTime(0.55, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
    sub.connect(subGain);
    subGain.connect(audioCtx.destination);
    sub.start(t);
    sub.stop(t + 0.48);
  } catch {}
}

// Sparkle note each time an item gets torn off by the wave
export function playSparkle() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const freqs = [1046, 1318, 1568, 1760, 2093, 2349, 2637];
    const f = freqs[Math.floor(Math.random() * freqs.length)];
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.08, t + 0.2);
    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.26);
  } catch {}
}

// Tremolo chord for King Tide
export function playTremolo() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const lfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.setValueAtTime(587.33, t + 0.35);
    osc.frequency.setValueAtTime(659.25, t + 0.7);

    lfo.frequency.setValueAtTime(7, t);
    lfoGain.gain.setValueAtTime(0.16, t);
    lfo.connect(gain.gain);

    gain.gain.setValueAtTime(0.26, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 1.45);
    osc.stop(t + 1.45);
  } catch {}
}

// Descending mournful tone when you die
export function playDeath() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 1.35);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(680, t);
    filter.frequency.exponentialRampToValueAtTime(85, t + 1.35);

    gain.gain.setValueAtTime(0.32, t);
    gain.gain.linearRampToValueAtTime(0.26, t + 0.85);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.45);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(t);
    osc.stop(t + 1.5);
  } catch {}
}

let lastStepTime = 0;
// Gentle sand footstep crunch when scuttling forward or backward
export function playSandStep() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  const now = performance.now();
  if (now - lastStepTime < 190) return;
  lastStepTime = now;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(550 + Math.random() * 250, t);
    filter.Q.setValueAtTime(2.2, t);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95 + Math.random() * 40, t);
    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.065);
  } catch {}
}
