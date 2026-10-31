// Game audio for WRACKLINE. Two generated samples do the water - the ambient sea bed and the
// breaker's swell (public/audio/, declared in the README) - fetched once at the first input
// and decoded into memory. Everything else is synthesised in the Web Audio graph.

let audioCtx: AudioContext | null = null;
let rumbleOsc: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;
let rumbleFilter: BiquadFilterNode | null = null;

// The sea bed. One loop, crossfaded into itself at load so the seam is not audible; the
// synthesised wash below is only the fallback when the file does not arrive.
let ambientNoise: AudioBufferSourceNode | null = null;
let ambientSource: AudioBufferSourceNode | null = null;
let ambientGain: GainNode | null = null;
let ambientLevel = 0.55;
let ambientLoading = false;
let seaHushed = false;

// The generated breaker, and the voice it is currently playing through.
let waveSample: AudioBuffer | null = null;
let waveLoading = false;
let waveSource: AudioBufferSourceNode | null = null;
let waveGain: GainNode | null = null;

const AMBIENT_URL = '/audio/wavebg.mp3';
const AMBIENT_SEAM = 1.5;
const SYNTH_AMBIENT_LEVEL = 0.04;
const WAVE_URL = '/audio/wave.mp3';
// The sample peaks at -7.8 dBFS and sits around -30 dB mean, so it needs a lift to hold
// its own against the synthesised effects around it without touching the ceiling.
const WAVE_GAIN = 1.4;

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
      startAmbient();
      loadWaveSample();
    }
  } catch {
    // Audio restricted or not supported
  }
}

function fetchAudio(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  return fetch(url)
    .then(res => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then(buffer => ctx.decodeAudioData(buffer));
}

// Fetched and decoded behind the first input, so the first breaker already has it. If it
// never arrives - a cold load, a host that does not serve it - playWave falls back to the
// synthesised crash and the wave is simply the sound it used to be.
function loadWaveSample() {
  if (!audioCtx || waveSample || waveLoading) return;
  const ctx = audioCtx;
  waveLoading = true;
  fetchAudio(ctx, WAVE_URL)
    .then(decoded => {
      waveSample = decoded;
    })
    .catch(() => {
      waveLoading = false;
    });
}

function startAmbient() {
  if (!audioCtx || ambientSource || ambientNoise || ambientLoading) return;
  const ctx = audioCtx;
  ambientLoading = true;
  fetchAudio(ctx, AMBIENT_URL)
    .then(buffer => startAmbientLoop(ctx, makeSeamless(ctx, buffer, AMBIENT_SEAM)))
    .catch(() => startAmbientOcean());
}

// Crossfade the tail into the head and return a shorter buffer whose end meets its start,
// so an 11-second sea can loop for a whole run without a drop-out every time it wraps.
function makeSeamless(ctx: AudioContext, buffer: AudioBuffer, seconds: number): AudioBuffer {
  const seam = Math.min(Math.floor(seconds * buffer.sampleRate), Math.floor(buffer.length / 3));
  const length = buffer.length - seam;
  const out = ctx.createBuffer(buffer.numberOfChannels, length, buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = out.getChannelData(ch);
    dst.set(src.subarray(0, length));
    for (let i = 0; i < seam; i++) {
      const phase = (i / seam) * Math.PI * 0.5;
      dst[i] = src[i] * Math.sin(phase) + src[length + i] * Math.cos(phase);
    }
  }
  return out;
}

function ensureAmbientGain(): GainNode | null {
  if (!audioCtx) return null;
  if (!ambientGain) {
    ambientGain = audioCtx.createGain();
    ambientGain.gain.value = 0.0001;
    ambientGain.connect(audioCtx.destination);
  }
  return ambientGain;
}

function ambientTarget(): number {
  return isMuted || seaHushed ? 0.0001 : ambientLevel;
}

function fadeAmbient(seconds: number) {
  const gain = ensureAmbientGain();
  if (!gain || !audioCtx) return;
  const t = audioCtx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
  gain.gain.exponentialRampToValueAtTime(ambientTarget(), t + seconds);
}

// Called when the breaker lands: the sea bed drops away so the wave owns the moment.
export function hushSea() {
  seaHushed = true;
  fadeAmbient(0.35);
}

// Called when the shore is open again, and when a run ends, so the sea is always there.
export function wakeSea() {
  seaHushed = false;
  fadeAmbient(1.1);
}

function startAmbientLoop(ctx: AudioContext, buffer: AudioBuffer) {
  const gain = ensureAmbientGain();
  if (!gain) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.connect(gain);
  const t = ctx.currentTime;
  gain.gain.cancelScheduledValues(t);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(ambientTarget(), t + 1.4);
  source.start(t);
  ambientSource = source;
}

export function toggleMute(): boolean {
  isMuted = !isMuted;
  fadeAmbient(0.12);
  // The breaker runs for four seconds, so muting has to reach a sample already in flight.
  if (isMuted) stopWave(0.08);
  return isMuted;
}

export function getIsMuted(): boolean {
  return isMuted;
}

// Fallback sea bed: pinkish noise under a slow lowpass, used only if the sample fails.
function startAmbientOcean() {
  if (!audioCtx || ambientNoise) return;
  try {
    const ctx = audioCtx;
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.0555179;
      b1 = 0.96300 * b1 + white * 0.0750759;
      b2 = 0.57000 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.2;
    }

    ambientNoise = ctx.createBufferSource();
    ambientNoise.buffer = buffer;
    ambientNoise.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, ctx.currentTime);

    // LFO to simulate gentle sea swells breathing
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.12, ctx.currentTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(120, ctx.currentTime);
    lfo.connect(filter.frequency);
    lfo.start();

    const gain = ensureAmbientGain();
    if (!gain) return;
    ambientLevel = SYNTH_AMBIENT_LEVEL;
    gain.gain.setValueAtTime(ambientTarget(), ctx.currentTime);

    ambientNoise.connect(filter);
    filter.connect(gain);
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

// Crash when wave lands on the beach. The synthesised fallback: used when the recording
// has not arrived yet, and for the hit that takes a heart.
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
  } catch {}
  playImpactThump();
}

// The breaker landing on the shore. The recorded swell replaces the noise burst above,
// which read as flat hiss on laptop speakers; the thump stays under it, because the
// recording has no transient and the shore still has to feel hit. The swell opens quiet,
// builds for about a second, and washes on through the sweep and the retreat.
export function playWave() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  if (!waveSample) {
    playCrash();
    return;
  }
  try {
    stopWave(0.02);
    const ctx = audioCtx;
    const t = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = waveSample;
    const gain = ctx.createGain();
    // Faded in and out over the sample's own length, so the tail never ends on a click.
    const out = Math.max(0.15, waveSample.duration - 0.5);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(WAVE_GAIN, t + 0.09);
    gain.gain.setValueAtTime(WAVE_GAIN, t + out);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + out + 0.45);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.onended = () => {
      if (waveSource === source) {
        waveSource = null;
        waveGain = null;
      }
    };
    source.start(t);
    waveSource = source;
    waveGain = gain;
  } catch {
    playCrash();
    return;
  }
  playImpactThump();
}

function stopWave(fadeSeconds: number) {
  if (!audioCtx || !waveSource) return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  const source = waveSource;
  const gain = waveGain;
  waveSource = null;
  waveGain = null;
  try {
    if (!gain) {
      source.stop();
      return;
    }
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + fadeSeconds);
    source.stop(t + fadeSeconds + 0.02);
  } catch {}
}

// The physical part of the hit: a sub-bass drop a phone speaker cannot make but a lap can
// feel. Shared by the recorded wave and the synthesised fallback.
function playImpactThump() {
  if (!audioCtx || audioCtx.state !== 'running' || isMuted) return;
  try {
    const t = audioCtx.currentTime;
    const sub = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, t);
    sub.frequency.exponentialRampToValueAtTime(26, t + 0.4);
    subGain.gain.setValueAtTime(0.5, t);
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
