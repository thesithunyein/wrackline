import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  initAudio,
  playTick,
  playThock,
  playWrackCrunch,
  startRumble,
  stopRumble,
  playCrash,
  playSparkle,
  playTremolo,
  playDeath,
  playSandStep,
  toggleMute,
  getIsMuted
} from './audio';
import { Wrackline3D, Loot3DItem, groundHeightAt } from './game3d';
import { WracklineLogo } from './Logo';

interface DiffConfig {
  name: string;
  mult: string;
  keyHint: string;
  baseLowTide: number;
  warningDuration: number;
  multiplier: number;
  haulSpeed: number;
  hearts: number;
}

const DIFFS: Record<string, DiffConfig> = {
  CALM: {
    name: 'CALM',
    mult: '1.0X',
    keyHint: '1',
    baseLowTide: 7.0,
    warningDuration: 1.8,
    multiplier: 1.0,
    haulSpeed: 790,
    hearts: 4
  },
  SURF: {
    name: 'SURF',
    mult: '1.7X',
    keyHint: '2',
    baseLowTide: 5.0,
    warningDuration: 1.3,
    multiplier: 1.7,
    haulSpeed: 700,
    hearts: 3
  },
  STORM: {
    name: 'STORM',
    mult: '2.8X',
    keyHint: '3',
    baseLowTide: 3.6,
    warningDuration: 0.9,
    multiplier: 2.8,
    haulSpeed: 630,
    hearts: 2
  }
};

// A season is thirteen waves, and surviving all of them is the win. Hearts are the only
// losing condition, so the wrack line never ends a run by surprise — it just keeps
// eating the shore, which makes the closing waves tighter. Every ending has a cause.
//
// The low-tide window used to floor out at wave seven, which meant waves seven through
// a hundred were all the same wave. It now keeps closing to the last wave, so the
// season reads as a ladder rather than a plateau.
type EndCause = 'SURGE' | 'SURVIVED';
const SEASON_WAVES = 13;
const WRACK_LINE_RETREAT = 8;
const INVULN_TIME = 1.2;

// Digging in. Held under the sand the surge passes over you unharmed, and the price is
// everything in your claws: the haul spills onto the sand and the water takes it.
const DIG_IN_TIME = 0.3;

// Named stretches of the season, so a run has rungs without a level-select screen.
const TIERS: { from: number; name: string }[] = [
  { from: 1, name: 'SHALLOWS' },
  { from: 4, name: 'THE WRACK' },
  { from: 7, name: 'DEEP DRAW' },
  { from: 10, name: 'BLACK TIDE' },
  { from: 13, name: "SEASON'S END" }
];

function tierForWave(wave: number): string {
  let name = TIERS[0].name;
  for (const t of TIERS) if (wave >= t.from) name = t.name;
  return name;
}

interface FloatingPopup {
  id: number;
  text: string;
  x: number;
  y: number;
  alpha: number;
  isGold: boolean;
  // Grabs tick past in a stream, so they are quiet and small. Banks are the loud ones.
  size: 'small' | 'big';
}

export default function App() {
  const [appState, setAppState] = useState<'LOADING' | 'TITLE' | 'PLAYING' | 'DEAD' | 'WIN' | 'ERROR'>(
    'LOADING'
  );
  const [webglFailed, setWebglFailed] = useState<boolean>(false);
  const [paused, setPaused] = useState<boolean>(false);
  const [waveIntro, setWaveIntro] = useState<string | null>(null);
  const [burrowed, setBurrowed] = useState<boolean>(false);
  const [loadProgress, setLoadProgress] = useState<number>(0);

  const [selectedDiff, setSelectedDiff] = useState<DiffConfig>(DIFFS.SURF);
  const [bankedScore, setBankedScore] = useState<number>(0);
  const [displayedBanked, setDisplayedBanked] = useState<number>(0);
  const [heldScore, setHeldScore] = useState<number>(0);
  const [bestScore, setBestScore] = useState<number>(() => {
    try {
      const s = localStorage.getItem('wrackline_best');
      return s ? parseInt(s, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });
  const [isNewBest, setIsNewBest] = useState<boolean>(false);
  const [isKingTide, setIsKingTide] = useState<boolean>(false);
  const [isWaveWarning, setIsWaveWarning] = useState<boolean>(false);
  const [hearts, setHearts] = useState<number>(DIFFS.SURF.hearts);
  const [endCause, setEndCause] = useState<EndCause>('SURGE');
  const [hurtFlash, setHurtFlash] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(getIsMuted);
  const [popups, setPopups] = useState<FloatingPopup[]>([]);
  const [wavesSurvived, setWavesSurvived] = useState<number>(0);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showInputCue, setShowInputCue] = useState<boolean>(true);

  // Active key state for UI visual feedback on buttons
  const [activeKeys, setActiveKeys] = useState({
    forward: false,
    backward: false,
    haul: false,
    burrow: false
  });

  // 3D Container & Engine Ref
  const container3dRef = useRef<HTMLDivElement | null>(null);
  const engine3dRef = useRef<Wrackline3D | null>(null);

  // Keys Ref for instant, zero-latency physics tick
  const keysRef = useRef({
    forward: false,
    backward: false,
    haul: false,
    burrow: false
  });

  // Pause lives in a ref as well as state: the animation frame reads the ref, and the
  // HUD reads the state.
  const pausedRef = useRef(false);
  const introTimerRef = useRef<number | null>(null);

  // Synchronous Game State Ref
  const stateRef = useRef({
    gameState: 'LOADING' as 'LOADING' | 'TITLE' | 'PLAYING' | 'DEAD' | 'WIN' | 'ERROR',
    hearts: 3,
    heartLostThisWave: false,
    invulnTimer: 0,
    endCause: 'SURGE' as EndCause,
    currentDiff: DIFFS.SURF,
    banked: 0,
    held: 0,
    best: 0,
    isNewBest: false,
    waveIndex: 0,
    cyclePhase: 'LOW_TIDE' as 'LOW_TIDE' | 'WARNING' | 'WAVE_SWEEP' | 'WAVE_RETREAT',
    phaseTimer: 0,
    phaseDuration: 4.5,
    isKingTide: false,
    lastWaveWasKing: false,
    dryWaves: 0,
    wrackLineX: 780,
    isHolding: false,
    // Digging in: a wind-up, then safe under the sand, at the price of the haul.
    digging: false,
    digTimer: 0,
    isBurrowed: false,
    hasGivenFirstInput: false,
    deathTime: 0,

    playerX3D: 0.0,
    isMoving: false,
    moveDir: 0,

    waveX: 1450,
    waveSpeed: 760,
    tearOffTimer: 0,

    playerRadius: 18,
    playerSquashX: 1,
    playerSquashY: 1,

    loot3D: [] as Loot3DItem[],
    attached3D: [] as Loot3DItem[],
    screenShake: 0
  });

  useEffect(() => {
    stateRef.current.best = bestScore;
  }, [bestScore]);

  // Loading Screen Progression
  useEffect(() => {
    let p = 0;
    const interval = setInterval(() => {
      // If the 3D engine could not start, the loader must not march on to the title
      // screen behind the failure notice.
      if (stateRef.current.gameState === 'ERROR') {
        clearInterval(interval);
        return;
      }
      p += Math.floor(Math.random() * 25 + 20);
      if (p >= 100) {
        p = 100;
        setLoadProgress(100);
        clearInterval(interval);
        setTimeout(() => {
          setAppState('TITLE');
          stateRef.current.gameState = 'TITLE';
        }, 220);
      } else {
        setLoadProgress(p);
      }
    }, 60);
    return () => clearInterval(interval);
  }, []);

  // Smooth Banked Score Odometer Rollup
  useEffect(() => {
    if (displayedBanked === bankedScore) return;
    const diff = bankedScore - displayedBanked;
    const step = Math.max(1, Math.ceil(Math.abs(diff) * 0.18));
    const timer = setTimeout(() => {
      setDisplayedBanked(prev => {
        if (prev < bankedScore) return Math.min(bankedScore, prev + step);
        if (prev > bankedScore) return Math.max(bankedScore, prev - step);
        return bankedScore;
      });
    }, 16);
    return () => clearTimeout(timer);
  }, [bankedScore, displayedBanked]);

  const checkSaveBest = useCallback((score: number) => {
    if (score > stateRef.current.best) {
      stateRef.current.best = score;
      stateRef.current.isNewBest = true;
      setIsNewBest(true);
      setBestScore(score);
      try {
        localStorage.setItem('wrackline_best', String(score));
      } catch {}
    } else {
      stateRef.current.isNewBest = false;
      setIsNewBest(false);
    }
  }, []);

  // Spawn Loot in 3D
  const spawnCycleLoot = useCallback(() => {
    const s = stateRef.current;
    if (!engine3dRef.current) return;

    // Clear old unattached items
    for (const item of s.loot3D) {
      if (!item.isAttached) {
        engine3dRef.current.scene.remove(item.mesh);
      }
    }
    s.loot3D = s.loot3D.filter(i => i.isAttached);

    const baseCount = Math.floor(4 + Math.random() * 3 + s.waveIndex * 0.8);
    const count = Math.min(10, baseCount);

    const types = [0, 1, 2, 3, 4, 6]; // Ammonite, Glass, Doubloon, Driftwood, Clam, Bottle

    for (let i = 0; i < count; i++) {
      const typeIndex = types[Math.floor(Math.random() * types.length)];
      const band: 'near' | 'mid' | 'far' = i < 3 ? 'near' : i < 6 ? 'mid' : 'far';
      const mesh = engine3dRef.current.createLootMesh(typeIndex, band);

      const spawnX = 14 + Math.random() * 18 + i * 2.2;
      const spawnZ = (Math.random() - 0.5) * 11;
      const groundY = groundHeightAt(spawnX, spawnZ) + 0.3;

      mesh.position.set(spawnX, groundY, spawnZ);
      engine3dRef.current.scene.add(mesh);

      let baseVal = 100;
      if (typeIndex === 0) baseVal = 320;
      else if (typeIndex === 1) baseVal = 140;
      else if (typeIndex === 2) baseVal = 120;
      else if (typeIndex === 3) baseVal = 80;
      else if (typeIndex === 4) baseVal = 250;
      else if (typeIndex === 6) baseVal = 180;

      // Risk pays. The surge arrives from the seaward end and takes the furthest loot
      // first, so the further up the shore a piece sits the less time there is to
      // reach it — and the more it is worth for the trouble.
      const risk = Math.max(0, Math.min(1, (spawnX - 14) / 30));
      const val = Math.round(baseVal * s.currentDiff.multiplier * (1 + risk * 1.2));

      s.loot3D.push({
        id: Date.now() + i + Math.random(),
        mesh,
        type: typeIndex,
        band,
        baseVal,
        val,
        x: spawnX,
        y: groundY,
        z: spawnZ,
        origX: spawnX,
        isAttached: false,
        attachAngle: Math.random() * Math.PI * 2,
        attachElev: (Math.random() - 0.5) * 0.8
      });
    }
  }, []);

  // Cycle State Transitions
  const enterLowTide = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'LOW_TIDE';
    s.phaseTimer = 0;
    setIsWaveWarning(false);

    // The window closes all season. The old 0.65 floor was reached at wave seven, so
    // every wave after it played identically; the floor now sits out past the last
    // wave and the closing waves are genuinely thin.
    const waveFactor = Math.max(0.42, 1 - s.waveIndex * 0.045);
    s.phaseDuration = s.currentDiff.baseLowTide * waveFactor;

    // King Tide is rolled, not scheduled. Odds climb as the run goes on so late
    // waves feel the most dangerous, it never lands twice in a row, and a pity
    // roll guarantees a long calm stretch still pays off. First eligible on wave 3.
    // A run is thirteen waves, so the pity window has room to work: three dry waves
    // and the next one is guaranteed to roll.
    const KING_TIDE_FIRST_WAVE = 3;
    const KING_TIDE_PITY_WAVES = 3;

    let isKing = false;
    if (s.waveIndex >= KING_TIDE_FIRST_WAVE) {
      if (s.dryWaves >= KING_TIDE_PITY_WAVES) {
        isKing = true;
      } else if (!s.lastWaveWasKing) {
        isKing = Math.random() < Math.min(0.45, 0.18 + s.waveIndex * 0.03);
      }
    }

    s.isKingTide = isKing;
    s.lastWaveWasKing = isKing;
    s.dryWaves = isKing ? 0 : s.dryWaves + 1;
    setIsKingTide(isKing);

    if (s.isKingTide) {
      playTremolo();
    }

    spawnCycleLoot();

    // Announce the wave you have just walked into. This is progress, not danger — the
    // water carries the danger now — and it is what gives the season its rungs.
    setWaveIntro(`WAVE ${s.waveIndex + 1} · ${tierForWave(s.waveIndex + 1)} · ${s.currentDiff.name}`);
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = window.setTimeout(() => setWaveIntro(null), 1800);
  }, [spawnCycleLoot]);

  const enterWarning = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'WARNING';
    s.phaseTimer = 0;
    s.phaseDuration = s.currentDiff.warningDuration;
    setIsWaveWarning(true);
    startRumble(s.currentDiff.warningDuration);
  }, []);

  const enterSweep = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'WAVE_SWEEP';
    s.phaseTimer = 0;
    s.waveX = 1400;
    s.tearOffTimer = 0;
    s.heartLostThisWave = false;
    setIsWaveWarning(false);
    stopRumble();
    playCrash();

    if (engine3dRef.current) {
      engine3dRef.current.triggerImpactShake(0.55);
    }
  }, []);

  const enterRetreat = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'WAVE_RETREAT';
  }, []);

  // End the run with a cause the player can name. Survivors get a win screen and the
  // offer of a harder tide; the caught get told exactly what caught them.
  const endRun = useCallback((cause: EndCause) => {
    const s = stateRef.current;
    s.endCause = cause;
    s.gameState = cause === 'SURVIVED' ? 'WIN' : 'DEAD';
    s.deathTime = Date.now();
    stopRumble();
    setEndCause(cause);
    setAppState(cause === 'SURVIVED' ? 'WIN' : 'DEAD');
    if (cause === 'SURVIVED') {
      playThock();
    } else {
      playDeath();
    }
    checkSaveBest(s.banked);
  }, [checkSaveBest]);

  const finishCycle = useCallback(() => {
    const s = stateRef.current;
    s.waveIndex += 1;
    setWavesSurvived(s.waveIndex);

    // The tide keeps taking the shore, but it never kills on its own: it just pushes
    // the wrack line further up the beach, so the closing waves are thinner pickings.
    s.wrackLineX -= WRACK_LINE_RETREAT;
    playWrackCrunch();

    if (s.waveIndex >= SEASON_WAVES) {
      endRun('SURVIVED');
      return;
    }

    enterLowTide();
  }, [endRun, enterLowTide]);

  // Start / Restart Game
  const startGame = useCallback((diff: DiffConfig) => {
    initAudio();
    const s = stateRef.current;
    s.gameState = 'PLAYING';
    s.currentDiff = diff;
    s.banked = 0;
    s.held = 0;
    s.waveIndex = 0;
    s.wrackLineX = 780;
    s.isHolding = false;
    s.isKingTide = false;
    s.lastWaveWasKing = false;
    s.dryWaves = 0;
    s.hearts = diff.hearts;
    s.heartLostThisWave = false;
    s.invulnTimer = 0;
    s.endCause = 'SURGE';
    s.hasGivenFirstInput = false;
    s.playerX3D = 0;
    s.isMoving = false;
    s.moveDir = 0;
    s.attached3D = [];
    s.digging = false;
    s.digTimer = 0;
    s.isBurrowed = false;
    keysRef.current.burrow = false;

    setAppState('PLAYING');
    setSelectedDiff(diff);
    setBankedScore(0);
    setDisplayedBanked(0);
    setHeldScore(0);
    setIsNewBest(false);
    setIsKingTide(false);
    setIsWaveWarning(false);
    setHearts(diff.hearts);
    setHurtFlash(false);
    setWavesSurvived(0);
    setPopups([]);
    setShowInputCue(true);
    setBurrowed(false);
    setWaveIntro(null);
    setPaused(false);
    pausedRef.current = false;
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);

    if (engine3dRef.current) {
      for (const item of s.loot3D) {
        engine3dRef.current.scene.remove(item.mesh);
      }
    }
    s.loot3D = [];

    enterLowTide();
  }, [enterLowTide]);

  // Bank Held Score
  const bankHeldScore = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    if (s.attached3D.length === 0) return;

    let earned = 0;
    for (const item of s.attached3D) earned += item.val;

    const isKing = s.isKingTide;
    if (isKing) {
      earned *= 2;
    }

    s.banked += earned;
    s.held = 0;
    setBankedScore(s.banked);
    setHeldScore(0);

    const newPopup: FloatingPopup = {
      id: Date.now(),
      text: isKing ? `+${earned} (2X)` : `+${earned}`,
      x: 50,
      y: 45,
      alpha: 1,
      isGold: isKing,
      size: 'big'
    };
    setPopups(prev => [...prev.slice(-3), newPopup]);

    if (engine3dRef.current) {
      for (const item of s.attached3D) {
        engine3dRef.current.scene.remove(item.mesh);
      }
    }
    s.attached3D = [];
    s.loot3D = s.loot3D.filter(i => !i.isAttached);

    playThock();
    if (engine3dRef.current) {
      engine3dRef.current.triggerImpactShake(0.35);
    }
    s.playerSquashY = 0.65;
    s.playerSquashX = 1.35;
    s.playerRadius = 18;
  }, []);

  // Haul action triggered by pointer or key
  const startHaul = useCallback(() => {
    initAudio();
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    s.isHolding = true;
    keysRef.current.haul = true;
    setActiveKeys(prev => ({ ...prev, haul: true }));
    if (showInputCue) setShowInputCue(false);
  }, [showInputCue]);

  const endHaul = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    s.isHolding = false;
    keysRef.current.haul = false;
    setActiveKeys(prev => ({ ...prev, haul: false }));
    bankHeldScore();
  }, [bankHeldScore]);

  // Releasing the dig key brings the creature straight back up. There is no emerge
  // animation: being able to move again immediately is what makes diving a real
  // choice rather than a trap.
  const startDig = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    initAudio();
    keysRef.current.burrow = true;
    setActiveKeys(prev => ({ ...prev, burrow: true }));
    if (!s.isBurrowed && !s.digging) {
      s.digging = true;
      s.digTimer = 0;
    }
  }, []);

  const endDig = useCallback(() => {
    keysRef.current.burrow = false;
    setActiveKeys(prev => ({ ...prev, burrow: false }));
  }, []);

  // Pause. Dropping the keys on the way in matters: without it the creature keeps
  // scuttling under the pause card and comes back somewhere unexpected.
  const dropKeys = useCallback(() => {
    keysRef.current.forward = false;
    keysRef.current.backward = false;
    keysRef.current.haul = false;
    keysRef.current.burrow = false;
    stateRef.current.isHolding = false;
    setActiveKeys({ forward: false, backward: false, haul: false, burrow: false });
    stopRumble();
  }, []);

  const togglePause = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    if (next) dropKeys();
  }, [dropKeys]);

  // A phone call or a switched tab is the most common way to lose a run. Pausing on the
  // way out means coming back does not cost a heart.
  useEffect(() => {
    const autoPause = () => {
      if (stateRef.current.gameState !== 'PLAYING') return;
      if (pausedRef.current) return;
      pausedRef.current = true;
      setPaused(true);
      dropKeys();
    };
    const onVisibility = () => {
      if (document.hidden) autoPause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', autoPause);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', autoPause);
    };
  }, [dropKeys]);

  // Floating popups tick
  useEffect(() => {
    if (popups.length === 0) return;
    const interval = setInterval(() => {
      setPopups(prev =>
        prev
          .map(p => ({ ...p, y: p.y - 1.2, alpha: p.alpha - 0.04 }))
          .filter(p => p.alpha > 0)
      );
    }, 32);
    return () => clearInterval(interval);
  }, [popups]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const handleToggleMute = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    initAudio();
    const isM = toggleMute();
    setMuted(isM);
  }, []);

  // Initialize 3D Engine
  useEffect(() => {
    if (container3dRef.current && !engine3dRef.current) {
      // A device with no WebGL throws here. Failing without a word leaves a visitor
      // staring at a blank blue page with no idea what happened, so the failure has
      // to become a screen.
      try {
        const e3d = new Wrackline3D(container3dRef.current);
        engine3dRef.current = e3d;
      } catch (err) {
        console.error('WRACKLINE could not start the 3D view', err);
        stateRef.current.gameState = 'ERROR';
        setWebglFailed(true);
        setAppState('ERROR');
      }
    }
    return () => {
      if (engine3dRef.current) {
        engine3dRef.current.dispose();
        engine3dRef.current = null;
      }
    };
  }, []);

  // Keyboard Shortcuts (Intuitive WASD, Arrows, Space, 1, 2, 3, H, M, F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      initAudio();
      const code = e.code;
      const key = e.key;

      // One press back into the water. Runs are about a minute, so making the retry
      // free is what turns a loss into "one more go" instead of a stop point.
      if (
        (code === 'KeyR' || code === 'Enter') &&
        (stateRef.current.gameState === 'DEAD' || stateRef.current.gameState === 'WIN')
      ) {
        startGame(stateRef.current.currentDiff);
        return;
      }

      if (code === 'KeyM') {
        setMuted(toggleMute());
        return;
      }
      if (code === 'KeyF') {
        toggleFullscreen();
        return;
      }
      if (code === 'KeyH' || key === '?' || key === '/') {
        setShowGuide(prev => !prev);
        return;
      }
      if (code === 'Escape' || code === 'KeyP') {
        togglePause();
        return;
      }

      // Quick Difficulty Select
      if (code === 'Digit1' || key === '1') {
        setSelectedDiff(DIFFS.CALM);
        return;
      }
      if (code === 'Digit2' || key === '2') {
        setSelectedDiff(DIFFS.SURF);
        return;
      }
      if (code === 'Digit3' || key === '3') {
        setSelectedDiff(DIFFS.STORM);
        return;
      }

      // Movement & Hauling during PLAYING
      if (stateRef.current.gameState === 'PLAYING') {
        if (code === 'KeyD' || code === 'ArrowRight') {
          keysRef.current.forward = true;
          setActiveKeys(prev => ({ ...prev, forward: true }));
          playSandStep();
        }
        if (code === 'KeyA' || code === 'ArrowLeft') {
          keysRef.current.backward = true;
          setActiveKeys(prev => ({ ...prev, backward: true }));
          playSandStep();
        }
        if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
          if (!keysRef.current.haul) {
            startHaul();
          }
          e.preventDefault();
        }
        if (code === 'KeyS' || code === 'ArrowDown') {
          endHaul();
          e.preventDefault();
        }
        // Dig in and hold. Shift is the reflex key, B is the one the guide names.
        if (code === 'KeyB' || code === 'ShiftLeft' || code === 'ShiftRight') {
          if (!keysRef.current.burrow) startDig();
          e.preventDefault();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;

      if (code === 'KeyD' || code === 'ArrowRight') {
        keysRef.current.forward = false;
        setActiveKeys(prev => ({ ...prev, forward: false }));
      }
      if (code === 'KeyA' || code === 'ArrowLeft') {
        keysRef.current.backward = false;
        setActiveKeys(prev => ({ ...prev, backward: false }));
      }
      if (code === 'Space' || code === 'KeyW' || code === 'ArrowUp') {
        endHaul();
      }
      if (code === 'KeyB' || code === 'ShiftLeft' || code === 'ShiftRight') {
        endDig();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startHaul, endHaul, toggleFullscreen, startGame, startDig, endDig, togglePause]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const s = stateRef.current;

      if (s.gameState === 'PLAYING' && !pausedRef.current) {
        s.invulnTimer = Math.max(0, s.invulnTimer - dt);

        // Digging in. Once the shell is under the sand the shell comes up empty: the
        // haul spills around you, marked so it can never be gathered again, and the
        // surge takes it as it crosses. That cost is the whole mechanic — without it
        // diving would just delete the decision the game is built on.
        if (s.digging && !s.isBurrowed) {
          if (!keysRef.current.burrow) {
            // Let go before the shell is under and nothing happened. The wind-up is
            // what makes a dive a commitment instead of a reflex.
            s.digging = false;
            s.digTimer = 0;
          } else {
            s.digTimer += dt;
            if (s.digTimer >= DIG_IN_TIME) {
              s.digging = false;
              s.digTimer = 0;
              s.isBurrowed = true;
              setBurrowed(true);
              playWrackCrunch();

              if (s.attached3D.length > 0) {
                for (const item of s.attached3D) {
                  item.isAttached = false;
                  item.doomed = true;
                  item.x = s.playerX3D + 1.4 + Math.random() * 2.4;
                  item.z = (Math.random() - 0.5) * 5;
                }
                s.attached3D = [];
                s.held = 0;
                setHeldScore(0);
                playSparkle();
              }
            }
          }
        }

        // Facing the sea again, the creature is back on the surface the instant the
        // key comes up: no emerge delay, or diving would be a trap rather than a choice.
        if (!keysRef.current.burrow && s.isBurrowed) {
          s.isBurrowed = false;
          setBurrowed(false);
        }

        let moveDir = 0;
        // Buried, or on the way down, you are not going anywhere.
        if (!s.isBurrowed && !s.digging) {
          if (keysRef.current.forward) moveDir += 1;
          if (keysRef.current.backward) moveDir -= 1;
        }

        s.isMoving = moveDir !== 0;
        s.moveDir = moveDir;

        const moveSpeed3D = 6.8;
        if (moveDir !== 0) {
          s.playerX3D += moveDir * moveSpeed3D * dt;
          s.playerX3D = Math.max(-2.5, Math.min(18.5, s.playerX3D));
          playSandStep();
        }

        // Pull loot towards player when hauling
        const isCurrentlyHolding =
          (s.isHolding || keysRef.current.haul) && !s.isBurrowed && !s.digging;
        if (isCurrentlyHolding) {
          const speed3D = (s.currentDiff.haulSpeed / 1000) * 16.5;

          for (const item of s.loot3D) {
            // Spilled loot is on the sand, not in reach: it is gone, and it is meant
            // to be seen going.
            if (!item.isAttached && !item.doomed) {
              const pullRate = speed3D + (moveDir > 0 ? 4.5 : 0);
              item.x -= pullRate * dt;
              item.z += (0 - item.z) * Math.min(1, dt * 3.2);

              const blobR3D = (s.playerRadius / 18) * 1.25;
              if (item.x <= s.playerX3D + blobR3D + 0.45) {
                item.isAttached = true;
                s.attached3D.push(item);
                s.held += item.val;
                setHeldScore(s.held);
                playTick();

                // Every grab says what it was worth. The model shapes are the only
                // other clue and nothing on screen teaches which is which.
                const grab: FloatingPopup = {
                  id: Date.now() + Math.random(),
                  text: `+${item.val}`,
                  x: 50 + (Math.random() - 0.5) * 12,
                  y: 55,
                  alpha: 0.9,
                  isGold: item.val >= 250,
                  size: 'small'
                };
                setPopups(prev => [...prev.slice(-5), grab]);
              }
            }
          }
        }

        s.phaseTimer += dt;
        if (s.cyclePhase === 'LOW_TIDE') {
          if (s.phaseTimer >= s.phaseDuration) enterWarning();
        } else if (s.cyclePhase === 'WARNING') {
          if (s.phaseTimer >= s.phaseDuration) enterSweep();
        } else if (s.cyclePhase === 'WAVE_SWEEP') {
          s.waveX -= s.waveSpeed * dt;

          const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));
          const wave3DX = 52 - waveRatio * 55;
          // The shell swells as you hold more, and that swell is real: a fat blob is a
          // wider target, so the wave reaches it sooner than a lean one.
          const growR = engine3dRef.current?.blobGrowScale ?? 1;
          const blobR3D = (s.playerRadius / 18) * 1.25 * growR;

          if (wave3DX <= s.playerX3D + blobR3D + 1.5) {
            // The surge only wounds you if it catches you still holding loot. Wading
            // through it with empty claws is survivable, so the mistake has a name:
            // greed. One heart per wave, with a moment of grace after the hit.
            if (s.attached3D.length > 0 && !s.heartLostThisWave && s.invulnTimer <= 0) {
              s.heartLostThisWave = true;
              s.invulnTimer = INVULN_TIME;
              s.hearts -= 1;
              setHearts(s.hearts);
              setHurtFlash(true);
              window.setTimeout(() => setHurtFlash(false), 420);
              playCrash();
              if (engine3dRef.current) engine3dRef.current.triggerImpactShake(0.85);

              if (s.hearts <= 0) {
                endRun('SURGE');
              }
            }

            s.tearOffTimer += dt;
            if (s.tearOffTimer >= 0.125 && s.attached3D.length > 0) {
              s.tearOffTimer = 0;
              const torn3D = s.attached3D.pop();
              if (torn3D && engine3dRef.current) {
                torn3D.isAttached = false;
                engine3dRef.current.scene.remove(torn3D.mesh);
                s.loot3D = s.loot3D.filter(i => i !== torn3D);
                s.held = Math.max(0, s.held - torn3D.val);
                setHeldScore(s.held);
                playSparkle();
              }
            }
          }

          // The surge takes whatever you spilled when you dug in.
          s.loot3D = s.loot3D.filter(i => {
            if (i.doomed && wave3DX <= i.x) {
              engine3dRef.current!.scene.remove(i.mesh);
              return false;
            }
            return true;
          });

          if (s.waveX <= 510) enterRetreat();
        } else if (s.cyclePhase === 'WAVE_RETREAT') {
          s.waveX += s.waveSpeed * dt;

          const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));
          const wave3DX = 52 - waveRatio * 55;
          // The shell swells as you hold more, and that swell is real: a fat blob is a
          // wider target, so the wave reaches it sooner than a lean one.
          const growR = engine3dRef.current?.blobGrowScale ?? 1;
          const blobR3D = (s.playerRadius / 18) * 1.25 * growR;

          if (wave3DX <= s.playerX3D + blobR3D + 1.5) {
            s.tearOffTimer += dt;
            if (s.tearOffTimer >= 0.125 && s.attached3D.length > 0) {
              s.tearOffTimer = 0;
              const torn3D = s.attached3D.pop();
              if (torn3D && engine3dRef.current) {
                torn3D.isAttached = false;
                engine3dRef.current.scene.remove(torn3D.mesh);
                s.loot3D = s.loot3D.filter(i => i !== torn3D);
                s.held = Math.max(0, s.held - torn3D.val);
                setHeldScore(s.held);
                playSparkle();
              }
            }
          }

          if (s.waveX >= 1400) finishCycle();
        }
      }

      if (engine3dRef.current && !pausedRef.current) {
        const wrackRatio = Math.max(0, Math.min(1, (s.wrackLineX - 650) / 130));
        const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));

        // The draw, as a number: the sea falls away through the warning, stays away
        // through the surge, and climbs back as the wave retreats. With the text
        // warning gone this is the tell, so it is written large.
        let drawdown = 0;
        if (s.cyclePhase === 'WARNING') {
          drawdown = Math.min(1, s.phaseTimer / Math.max(0.001, s.phaseDuration));
        } else if (s.cyclePhase === 'WAVE_SWEEP') {
          drawdown = 1;
        } else if (s.cyclePhase === 'WAVE_RETREAT') {
          drawdown = Math.max(0, 1 - (s.waveX - 510) / 890);
        }

        // Update loot meshes
        for (const item of s.loot3D) {
          if (item.isAttached) {
            const growR = engine3dRef.current?.blobGrowScale ?? 1;
            const blobR3D = (s.playerRadius / 18) * 1.25 * growR;
            const slopeY = groundHeightAt(s.playerX3D, 0);
            item.mesh.position.set(
              s.playerX3D + Math.cos(item.attachAngle) * blobR3D,
              slopeY + 1.0 * growR + Math.sin(item.attachAngle) * blobR3D * 0.6,
              item.attachElev * blobR3D
            );
            item.mesh.rotation.y += dt * 1.5;
          } else {
            // Bedded on the sand the item is sitting on, so loot stays visible on
            // the slope instead of sinking into it or hovering over it.
            item.mesh.position.set(item.x, groundHeightAt(item.x, item.z) + 0.3, item.z);
            if (s.isHolding || keysRef.current.forward) {
              item.mesh.rotation.y += dt * 3.0;
            }
          }
        }

        engine3dRef.current.update(
          dt,
          s.held,
          s.isHolding || keysRef.current.haul,
          wrackRatio,
          waveRatio,
          s.cyclePhase,
          s.isKingTide,
          s.loot3D,
          s.playerX3D,
          s.isMoving,
          s.moveDir,
          s.isBurrowed ? 1 : s.digging ? Math.min(1, s.digTimer / DIG_IN_TIME) : 0,
          drawdown
        );
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [enterWarning, enterSweep, enterRetreat, finishCycle, endRun]);

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#D4E6F4] flex items-center justify-center font-ui">
      {/* 3D Viewport (Full Screen Canvas) */}
      <div
        ref={container3dRef}
        className="absolute inset-0 w-full h-full block cursor-pointer"
        onMouseDown={appState === 'PLAYING' ? startHaul : undefined}
        onMouseUp={appState === 'PLAYING' ? endHaul : undefined}
        onTouchStart={
          appState === 'PLAYING'
            ? e => {
                e.preventDefault();
                startHaul();
              }
            : undefined
        }
        onTouchEnd={
          appState === 'PLAYING'
            ? e => {
                e.preventDefault();
                endHaul();
              }
            : undefined
        }
      />

      {/* Top Header Controls: Low-Poly Tactile 3D Buttons */}
      <div className="absolute top-4 right-4 md:top-5 md:right-5 z-40 flex items-center gap-2 md:gap-3">
        <button
          onClick={() => setShowGuide(prev => !prev)}
          title="Guide & Controls (H)"
          aria-label="How to play"
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] font-bold text-base flex items-center justify-center transition-all cursor-pointer"
        >
          ?
        </button>

        <button
          onClick={() => handleToggleMute()}
          title="Toggle Audio (M)"
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] text-sm flex items-center justify-center transition-all cursor-pointer"
        >
          {muted ? '🔇' : '🔊'}
        </button>

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen (F)"
          aria-label="Toggle fullscreen"
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] text-base flex items-center justify-center transition-all cursor-pointer"
        >
          ⛶
        </button>
      </div>

      {/* Floating Score Popups */}
      {popups.map(p => (
        <div
          key={p.id}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            opacity: p.alpha
          }}
          className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none font-game transition-transform ${
            p.size === 'small' ? 'text-xl md:text-2xl' : 'text-4xl'
          } ${
            p.isGold ? 'text-[#F6C445] drop-shadow-[0_2px_0_#17181C]' : 'text-[#17181C] drop-shadow-sm'
          }`}
        >
          {p.text}
        </div>
      ))}

      {/* Top Left: Best Record Badge (when in Title state) */}
      {bestScore > 0 && appState === 'TITLE' && (
        <div className="absolute top-5 left-5 z-40 bg-[#FDFBF7] border-2 border-[#17181C] rounded-2xl px-4 py-2 shadow-[0_3px_0_#17181C] flex items-center gap-2 pointer-events-none">
          <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
            BEST
          </span>
          <span className="font-game text-xl font-bold text-[#24698F] leading-none">
            {bestScore}
          </span>
        </div>
      )}

      {/* 0. NO WEBGL. A device that cannot run the 3D view gets told so in words,
             instead of a blank blue page and no explanation. */}
      {appState === 'ERROR' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#D4E8F8] p-6 text-center">
          <WracklineLogo size="sm" showTitle={false} className="mb-4" />
          <h2 className="font-game text-2xl md:text-3xl text-[#17181C] mb-3 tracking-wide">
            THIS BROWSER CANNOT RUN THE SHORE
          </h2>
          <p className="text-xs md:text-sm font-bold text-[#17181C]/75 max-w-sm">
            {webglFailed
              ? 'WRACKLINE draws its beach with WebGL, and this browser either does not support it or has it switched off. Another browser, or hardware acceleration turned back on, will do it.'
              : 'Something stopped the shore from loading. A reload usually fixes it.'}
          </p>
        </div>
      )}

      {/* 1. LOW-POLY LOADING SCREEN */}
      {appState === 'LOADING' && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#D4E8F8]/95 backdrop-blur-md">
          <WracklineLogo size="md" className="animate-pulse mb-6" />
          <div className="w-52 h-4 bg-[#FDFBF7] border-2 border-[#17181C] rounded-lg p-0.5 shadow-[0_4px_0_#17181C]">
            <div
              className="h-full bg-[#24698F] rounded-xs transition-all duration-150 ease-out"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
          <span className="font-game text-xs text-[#24698F] tracking-widest mt-4 uppercase">
            LOADING WORLD
          </span>
        </div>
      )}

      {/* 2. TITLE SCREEN: Spacious, Uncluttered Low-Poly 3D Art Menu */}
      {appState === 'TITLE' && (
        <div className="absolute inset-0 flex flex-col justify-between items-center z-40 bg-gradient-to-b from-[#D4E6F4]/25 via-transparent to-[#D4E6F4]/35 pointer-events-auto px-6 pt-7 pb-10 md:pt-9 md:pb-14 select-none">
          {/* Top Zone: Clean Title & Subtitle with plenty of air */}
          <div className="flex flex-col items-center mt-1 md:mt-2 pointer-events-none">
            <WracklineLogo size="md" className="mb-3 md:mb-4" />
            <p className="font-game text-xs md:text-sm text-[#17181C]/75 tracking-widest uppercase leading-relaxed">
              SURVIVE THE TIDE · HARVEST THE SHORE
            </p>
          </div>

          {/* Center Zone: Single Prominent PLAY Button + Labeled Tide Selector */}
          <div className="flex flex-col items-center w-full max-w-xs md:max-w-sm my-auto">
            {/* Primary Action Button: Clear, Big, Unmistakable Breathing Room */}
            <button
              onClick={() => startGame(selectedDiff)}
              className="w-full py-4 md:py-5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-2xl md:text-3xl tracking-widest border-2 border-[#17181C] shadow-[0_6px_0_#0D0E10] hover:shadow-[0_8px_0_#0D0E10] active:translate-y-[3px] active:shadow-[0_2px_0_#0D0E10] transition-all cursor-pointer flex items-center justify-center gap-3 mb-7 md:mb-9"
            >
              <span>▶</span>
              <span>PLAY</span>
            </button>

            {/* Tide Intensity / Difficulty (Clearly Separated & Labeled) */}
            <div className="flex flex-col items-center w-full bg-[#FDFBF7]/90 backdrop-blur-xs p-3 md:p-3.5 rounded-2xl border-2 border-[#17181C] shadow-[0_4px_0_#17181C]">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest mb-2.5">
                TIDE INTENSITY
              </span>
              <div className="grid grid-cols-3 gap-2 md:gap-2.5 w-full">
                {(['CALM', 'SURF', 'STORM'] as const).map(key => {
                  const d = DIFFS[key];
                  const isSelected = selectedDiff.name === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedDiff(d)}
                      className={`py-2.5 px-2 rounded-xl font-game text-sm tracking-wider transition-all cursor-pointer flex flex-col items-center justify-center border-2 border-[#17181C] ${
                        isSelected
                          ? 'bg-[#24698F] text-white shadow-[0_3px_0_#10364C] translate-y-[-2px]'
                          : 'bg-white text-[#17181C]/75 hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C]'
                      }`}
                    >
                      <span>{d.name}</span>
                      <span className="text-[10px] font-ui font-bold opacity-80 mt-0.5 leading-none">{d.mult}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Zone: 3-Step Instant Guide - Immediately Explains What Game Is For */}
          <div className="flex flex-wrap items-center justify-center gap-4 md:gap-7 bg-[#FDFBF7]/90 backdrop-blur-xs border-2 border-[#17181C] px-6 py-3 rounded-2xl shadow-[0_4px_0_#17181C] text-xs font-bold text-[#17181C] mb-1 md:mb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-game text-sm text-[#24698F]">01</span>
              <span>SCUTTLE [A / D]</span>
            </div>
            <span className="text-[#17181C]/25 hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5">
              <span className="font-game text-sm text-[#24698F]">02</span>
              <span>HAUL [SPACE]</span>
            </div>
            <span className="text-[#17181C]/25 hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5">
              <span className="font-game text-sm text-[#E25B45]">03</span>
              <span>BANK BEFORE THE SURGE</span>
            </div>
            <span className="text-[#17181C]/25 hidden sm:inline">|</span>
            <div className="flex items-center gap-1.5">
              <span className="font-game text-sm text-[#F6C445]">04</span>
              <span>DIG IN [B] TO RIDE IT OUT</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. PLAYING HUD */}
      {appState === 'PLAYING' && (
        <>
          {/* Damage flash — fires the moment a surge catches you holding loot */}
          {hurtFlash && (
            <div className="absolute inset-0 z-20 pointer-events-none bg-[#E25B45]/25 border-8 border-[#E25B45]/60" />
          )}

          {/* Low-Poly Score Card (Top Left) */}
          <div className="absolute top-4 left-4 md:top-6 md:left-8 pointer-events-none flex flex-col gap-0.5 bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl p-3 md:p-3.5 shadow-[0_4px_0_#17181C]">
            <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
              SCORE
            </span>
            <span className="font-game text-4xl md:text-5xl font-bold text-[#17181C] tracking-tight leading-none">
              {displayedBanked}
            </span>
            {/* Hearts: the only way to lose. A wave that catches you holding costs
                one. Spent hearts change shape as well as colour — colour on its own
                left them nearly invisible against the card. */}
            <div
              className="flex items-center gap-1 mt-1"
              role="img"
              aria-label={`${hearts} of ${selectedDiff.hearts} hearts left`}
            >
              {Array.from({ length: selectedDiff.hearts }).map((_, i) => (
                <span
                  key={i}
                  className={`text-base leading-none ${i < hearts ? 'text-[#E25B45]' : 'text-[#17181C]/45'}`}
                >
                  {i < hearts ? '♥' : '♡'}
                </span>
              ))}
            </div>
          </div>

          {/* Low-Poly Best & Wave Pill (Top Center-Right) */}
          <div className="absolute top-16 right-4 md:top-6 md:right-48 pointer-events-none flex items-center gap-2 md:gap-3">
            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                BEST
              </span>
              <span className="font-game text-xl md:text-2xl font-bold text-[#24698F] leading-none">
                {bestScore}
              </span>
            </div>

            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-3 py-2 md:px-3.5 md:py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                WAVE
              </span>
              <span className="font-game text-xl md:text-2xl font-bold text-[#E8A317] leading-none">
                {Math.min(wavesSurvived + 1, SEASON_WAVES)}
                <span className="text-[#17181C]/40 text-sm md:text-base">/{SEASON_WAVES}</span>
              </span>
            </div>
          </div>

          {/* Floating Held Score Over Player */}
          {heldScore > 0 && (
            <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-12 pointer-events-none flex items-center font-game text-3xl text-[#17181C] bg-[#FDFBF7] border-2 border-[#17181C] rounded-2xl px-5 py-1.5 shadow-[0_4px_0_#17181C] animate-bounce">
              +{heldScore}
            </div>
          )}

          {/* The draw. "WAVE INCOMING!" is gone: the sea pulling back is the warning
              now, and this rim is what makes it impossible to miss on a small screen. */}
          {isWaveWarning && (
            <div className="absolute inset-0 z-20 pointer-events-none animate-pulse border-4 border-[#E25B45]/45 shadow-[inset_0_0_90px_26px_rgba(23,24,28,0.45)]" />
          )}

          {/* King Tide Banner. It now shows through the draw as well, so a doubling
              wave is announced before it lands and not only between waves. */}
          {isKingTide && (
            <div className="absolute top-32 md:top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-game bg-[#F6C445] border-2 border-[#17181C] text-[#17181C] text-base md:text-xl px-5 md:px-7 py-2 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest animate-pulse max-w-[92vw] text-center">
              KING TIDE · 2X
            </div>
          )}

          {/* Which wave you just walked into. Progress, not danger, so it never
              competes with the King Tide call. */}
          {waveIntro && !isKingTide && (
            <div className="absolute top-24 md:top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-game bg-[#FDFBF7] border-2 border-[#17181C] text-[#17181C] text-xs md:text-base px-3.5 md:px-6 py-1.5 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest max-w-[92vw] text-center">
              {waveIntro}
            </div>
          )}

          {/* Held under the sand: the claws are empty and the surge is going over. */}
          {burrowed && (
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 z-30 pointer-events-none bg-[#F6C445] border-2 border-[#17181C] px-4 py-1.5 rounded-xl shadow-[0_4px_0_#17181C] font-game text-xs md:text-sm tracking-widest text-[#17181C] uppercase">
              Dug in · safe, and empty clawed
            </div>
          )}

          {/* Short Real Game Input Prompt */}
          {showInputCue && (
            <div className="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-none bg-[#FDFBF7]/95 border-2 border-[#17181C] px-6 py-2.5 rounded-xl shadow-[0_3px_0_#17181C]">
              <span className="font-game text-sm text-[#17181C] tracking-wider uppercase">
                HOLD [SPACE] TO HAUL
              </span>
            </div>
          )}

          {/* Low-Poly Tactile 3D On-Screen Controls */}
          {/* w-max matters. An absolutely positioned row with only `left` set is sized
              against the space left of it, which on a phone is about half the screen —
              wrap onto that and the four controls stack into three rows. w-max sizes
              the row to its contents, and the -translate centres it. */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex w-max items-center justify-center gap-2 md:gap-4">
            <button
              // Pointer events with capture: on a phone the finger often slides off the
              // button mid-hold, and capture keeps the key held until it is released.
              onPointerDown={e => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                keysRef.current.backward = true;
                setActiveKeys(prev => ({ ...prev, backward: true }));
              }}
              onPointerUp={() => {
                keysRef.current.backward = false;
                setActiveKeys(prev => ({ ...prev, backward: false }));
              }}
              onPointerCancel={() => {
                keysRef.current.backward = false;
                setActiveKeys(prev => ({ ...prev, backward: false }));
              }}
              className={`w-14 h-14 rounded-xl border-2 border-[#17181C] font-game text-xl flex items-center justify-center transition-all cursor-pointer ${
                activeKeys.backward
                  ? 'bg-[#24698F] text-white translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
              title="Move Left (A / Left Arrow)"
              aria-label="Move down the shore (A or Left Arrow)"
            >
              ◀
            </button>

            <button
              onMouseDown={startHaul}
              onMouseUp={endHaul}
              onTouchStart={e => {
                e.preventDefault();
                startHaul();
              }}
              onTouchEnd={e => {
                e.preventDefault();
                endHaul();
              }}
              onTouchCancel={e => {
                e.preventDefault();
                endHaul();
              }}
              aria-label="Hold to haul loot in, release to bank it (Space)"
              className={`px-5 md:px-9 h-14 rounded-xl border-2 border-[#17181C] font-game text-lg tracking-widest flex items-center gap-2 transition-all cursor-pointer ${
                activeKeys.haul
                  ? 'bg-[#F6C445] text-[#17181C] translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#17181C] text-white hover:bg-[#24698F] shadow-[0_5px_0_#0D0E10]'
              }`}
            >
              <span>⚡</span>
              <span>HAUL</span>
            </button>

            <button
              onPointerDown={e => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                keysRef.current.forward = true;
                setActiveKeys(prev => ({ ...prev, forward: true }));
              }}
              onPointerUp={() => {
                keysRef.current.forward = false;
                setActiveKeys(prev => ({ ...prev, forward: false }));
              }}
              onPointerCancel={() => {
                keysRef.current.forward = false;
                setActiveKeys(prev => ({ ...prev, forward: false }));
              }}
              className={`w-14 h-14 rounded-xl border-2 border-[#17181C] font-game text-xl flex items-center justify-center transition-all cursor-pointer ${
                activeKeys.forward
                  ? 'bg-[#24698F] text-white translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
              title="Move Right (D / Right Arrow)"
              aria-label="Move up the shore (D or Right Arrow)"
            >
              ▶
            </button>

            <button
              // Hold to dig in. Capture again, so a thumb sliding off does not pop the
              // creature face-first out of the sand mid-surge.
              onPointerDown={e => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                startDig();
              }}
              onPointerUp={endDig}
              onPointerCancel={endDig}
              title="Dig In (B / Shift)"
              aria-label="Hold to dig into the sand and ride out the surge (B or Shift)"
              className={`px-3 h-14 rounded-xl border-2 border-[#17181C] font-game text-base tracking-widest flex items-center gap-1 transition-all cursor-pointer ${
                activeKeys.burrow || burrowed
                  ? 'bg-[#F6C445] text-[#17181C] translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
            >
              <span>▼</span>
              <span>DIG</span>
            </button>
          </div>

          {/* Pause. The game pauses itself when the tab goes away, so this card is
              mostly reached for deliberately — to answer a message mid-run. */}
          {paused && (
            <div className="absolute inset-0 z-40 bg-[#D4E6F4]/75 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-auto">
              <span className="font-game text-4xl md:text-5xl text-[#17181C] tracking-widest mb-2">
                PAUSED
              </span>
              <span className="text-[10px] md:text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-6 text-center px-6">
                the tide is holding its breath · wave {Math.min(wavesSurvived + 1, SEASON_WAVES)} of{' '}
                {SEASON_WAVES}
              </span>
              <button
                onClick={togglePause}
                aria-label="Resume playing"
                className="px-8 py-3.5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#0D0E10] active:translate-y-[2px] active:shadow-[0_1px_0_#0D0E10] transition-all cursor-pointer"
              >
                RESUME
              </button>
              <span className="mt-5 text-[10px] font-black text-[#17181C]/45 uppercase tracking-widest text-center px-6">
                ESC or P to pause · switching tabs pauses for you
              </span>
            </div>
          )}
        </>
      )}

      {/* 4. LOW-POLY TUTORIAL MODAL */}
      {showGuide && (
        <div
          className="absolute inset-0 z-50 bg-[#17181C]/50 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setShowGuide(false)}
        >
          <div
            // Capped to the viewport and scrollable inside: the guide now carries a
            // card for digging in and a price list, and on a phone it grew past the
            // screen — clipping the first card and putting GOT IT out of reach.
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl max-w-sm w-full max-h-[92dvh] overflow-y-auto overscroll-contain p-6 shadow-[0_8px_0_#17181C] relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-game text-2xl text-[#17181C] tracking-wide">HOW TO PLAY</h3>
              <button
                onClick={() => setShowGuide(false)}
                className="w-8 h-8 rounded-lg bg-[#EAD7B0] hover:bg-[#DFC798] border-2 border-[#17181C] shadow-[0_2px_0_#17181C] active:translate-y-[1px] active:shadow-none flex items-center justify-center font-bold text-xs cursor-pointer text-[#17181C]"
              >
                ✕
              </button>
            </div>

            {/* Short Low-Poly Guide Cards */}
            <div className="space-y-2.5 mb-6">
              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">01</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">MOVE</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Hold [A] / [D], the arrow keys, or the buttons on screen.
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">02</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">HAUL</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Hold [SPACE] or Click to vacuum loot.
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">03</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">BANK</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Release to deposit score safely.
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#E25B45]">04</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">DON&apos;T GET CAUGHT HOLDING</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    A surge that hits you while you still hold loot costs a heart ♥. Bank first, wade
                    through with empty claws, or dig in and lose the haul.
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#F6C445]">05</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">DIG IN</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Hold [B] or [SHIFT], or hold the DIG button, to bury yourself. The surge rolls
                    over you and costs nothing — but everything in your claws spills onto the sand
                    and the water takes it. You cannot move or haul while you are under.
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">06</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">OUTLAST THE SEASON</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Survive all {SEASON_WAVES} waves, from the Shallows to the Season&apos;s End. The
                    calm between surges keeps shrinking as you go. Lose your last heart and the
                    surge takes you.
                  </span>
                </div>
              </div>

              {/* What the shore is worth. Nothing else teaches this, and the model
                  shapes are the only other clue you get. */}
              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20">
                <span className="font-game text-sm text-[#17181C] block mb-1.5">
                  WHAT&apos;S WORTH WHAT
                </span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-bold text-[#17181C]/85">
                  <span>
                    AMMONITE <b className="text-[#24698F]">320</b>
                  </span>
                  <span>
                    CLAM <b className="text-[#24698F]">250</b>
                  </span>
                  <span>
                    BOTTLE <b className="text-[#24698F]">180</b>
                  </span>
                  <span>
                    SEA GLASS <b className="text-[#24698F]">140</b>
                  </span>
                  <span>
                    DOUBLOON <b className="text-[#24698F]">120</b>
                  </span>
                  <span>
                    DRIFTWOOD <b className="text-[#24698F]">80</b>
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#17181C]/70 block mt-1.5">
                  Base values — your tide multiplies them, and the further up the shore you pull a
                  piece from, the more it pays.
                </span>
              </div>
            </div>

            {/* Low-Poly Action Button */}
            <button
              onClick={() => setShowGuide(false)}
              // Sticky, because the guide scrolls on a phone and the way out should
              // never be something you have to hunt for.
              className="sticky bottom-0 w-full py-3 rounded-xl bg-[#24698F] hover:bg-[#1B5575] text-white font-game text-base tracking-wider border-2 border-[#17181C] shadow-[0_4px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* 5. LOW-POLY END-OF-RUN SCREEN — the season's result, win or loss */}
      {(appState === 'DEAD' || appState === 'WIN') && (
        <div className="absolute inset-0 bg-[#D4E6F4]/92 backdrop-blur-sm flex flex-col items-center justify-center z-50 pointer-events-auto p-5 md:p-6">
          <WracklineLogo size="sm" showTitle={false} className="mb-3 md:mb-4" />

          {/* The headline names the cause: survived the season, or caught by a surge */}
          <h2 className={`font-game text-3xl md:text-5xl tracking-wide text-center mb-2 ${endCause === 'SURVIVED' ? 'text-[#24698F]' : 'text-[#17181C]'}`}>
            {endCause === 'SURVIVED' ? 'OUTLASTED THE TIDE' : 'THE SURGE TOOK YOU'}
          </h2>
          <p className="text-[10px] md:text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-5 md:mb-7 text-center">
            {endCause === 'SURVIVED'
              ? `all ${SEASON_WAVES} waves survived · ${selectedDiff.name} tide`
              : `caught holding loot on wave ${wavesSurvived + 1}`}
          </p>

          {/* Low-Poly Faceted Scorecard */}
          <div className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl shadow-[0_8px_0_#17181C] w-76 flex flex-col items-center p-6 md:p-7 mb-7 md:mb-9">
            <span className="text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-2">
              FINAL SCORE
            </span>
            <span className="font-game text-6xl text-[#24698F] mb-3">{bankedScore}</span>

            {isNewBest && (
              <span className="font-game text-xs tracking-widest text-[#17181C] bg-[#F6C445] border-2 border-[#17181C] px-3.5 py-1 rounded-lg shadow-[0_2px_0_#17181C] mb-3">
                NEW RECORD!
              </span>
            )}

            <div className="w-full pt-4 border-t-2 border-[#17181C]/15 flex justify-between gap-4 text-xs font-bold text-[#17181C]/75">
              <span>BEST: {bestScore}</span>
              <span>
                WAVES: {wavesSurvived}
              </span>
            </div>
          </div>

          {/* Near-miss framing: how close the last run came is the pull to go again */}
          {endCause === 'SURGE' && !isNewBest && bestScore > bankedScore && (
            <p className="font-game text-sm md:text-base text-[#E25B45] mb-5 md:mb-6">
              {bestScore - bankedScore} TO BEAT YOUR BEST
            </p>
          )}

          {/* Low-Poly Tactile Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
            {endCause === 'SURVIVED' && (
              <button
                onClick={() => startGame(selectedDiff.name === 'CALM' ? DIFFS.SURF : DIFFS.STORM)}
                className="px-7 py-3.5 rounded-2xl bg-[#F6C445] hover:bg-[#EAD7B0] text-[#17181C] font-game text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
              >
                HARDER TIDE
              </button>
            )}

            <button
              onClick={() => startGame(selectedDiff)}
              className="px-8 py-3.5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#0D0E10] active:translate-y-[2px] active:shadow-[0_1px_0_#0D0E10] transition-all cursor-pointer"
            >
              PLAY AGAIN
            </button>

            <button
              onClick={() => setAppState('TITLE')}
              className="px-6 py-3.5 rounded-2xl bg-[#FDFBF7] hover:bg-[#EAD7B0] text-[#17181C] font-game text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              MENU
            </button>
          </div>

          <p className="mt-5 text-[10px] font-black text-[#17181C]/45 uppercase tracking-widest">
            Press R to go again
          </p>
        </div>
      )}
    </div>
  );
}
