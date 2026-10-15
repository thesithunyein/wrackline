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
}

const DIFFS: Record<string, DiffConfig> = {
  CALM: {
    name: 'CALM',
    mult: '1.0X',
    keyHint: '1',
    baseLowTide: 7.0,
    warningDuration: 1.8,
    multiplier: 1.0,
    haulSpeed: 790
  },
  SURF: {
    name: 'SURF',
    mult: '1.7X',
    keyHint: '2',
    baseLowTide: 5.0,
    warningDuration: 1.3,
    multiplier: 1.7,
    haulSpeed: 700
  },
  STORM: {
    name: 'STORM',
    mult: '2.8X',
    keyHint: '3',
    baseLowTide: 3.6,
    warningDuration: 0.9,
    multiplier: 2.8,
    haulSpeed: 630
  }
};

interface FloatingPopup {
  id: number;
  text: string;
  x: number;
  y: number;
  alpha: number;
  isGold: boolean;
}

export default function App() {
  const [appState, setAppState] = useState<'LOADING' | 'TITLE' | 'PLAYING' | 'DEAD'>('LOADING');
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
  const [muted, setMuted] = useState<boolean>(getIsMuted);
  const [popups, setPopups] = useState<FloatingPopup[]>([]);
  const [wavesSurvived, setWavesSurvived] = useState<number>(0);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [showInputCue, setShowInputCue] = useState<boolean>(true);

  // Active key state for UI visual feedback on buttons
  const [activeKeys, setActiveKeys] = useState({
    forward: false,
    backward: false,
    haul: false
  });

  // 3D Container & Engine Ref
  const container3dRef = useRef<HTMLDivElement | null>(null);
  const engine3dRef = useRef<Wrackline3D | null>(null);

  // Keys Ref for instant, zero-latency physics tick
  const keysRef = useRef({
    forward: false,
    backward: false,
    haul: false
  });

  // Synchronous Game State Ref
  const stateRef = useRef({
    gameState: 'LOADING' as 'LOADING' | 'TITLE' | 'PLAYING' | 'DEAD',
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
    wrackLineX: 780,
    isHolding: false,
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

      const val = Math.round(baseVal * s.currentDiff.multiplier);

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

    const waveFactor = Math.max(0.65, 1 - s.waveIndex * 0.05);
    s.phaseDuration = s.currentDiff.baseLowTide * waveFactor;

    s.isKingTide = s.waveIndex > 1 && Math.random() < 0.28;
    setIsKingTide(s.isKingTide);

    if (s.isKingTide) {
      playTremolo();
    }

    spawnCycleLoot();
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

  const finishCycle = useCallback(() => {
    const s = stateRef.current;
    s.waveIndex += 1;
    setWavesSurvived(s.waveIndex);

    s.wrackLineX -= 18;
    playWrackCrunch();

    if (s.wrackLineX <= 660) {
      s.gameState = 'DEAD';
      s.deathTime = Date.now();
      setAppState('DEAD');
      playDeath();
      checkSaveBest(s.banked);
      return;
    }

    enterLowTide();
  }, [checkSaveBest, enterLowTide]);

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
    s.hasGivenFirstInput = false;
    s.playerX3D = 0;
    s.isMoving = false;
    s.moveDir = 0;
    s.attached3D = [];

    setAppState('PLAYING');
    setSelectedDiff(diff);
    setBankedScore(0);
    setDisplayedBanked(0);
    setHeldScore(0);
    setIsNewBest(false);
    setIsKingTide(false);
    setIsWaveWarning(false);
    setWavesSurvived(0);
    setPopups([]);
    setShowInputCue(true);

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
      isGold: isKing
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
      const e3d = new Wrackline3D(container3dRef.current);
      engine3dRef.current = e3d;
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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [startHaul, endHaul, toggleFullscreen]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;

      const s = stateRef.current;

      if (s.gameState === 'PLAYING') {
        let moveDir = 0;
        if (keysRef.current.forward) moveDir += 1;
        if (keysRef.current.backward) moveDir -= 1;

        s.isMoving = moveDir !== 0;
        s.moveDir = moveDir;

        const moveSpeed3D = 6.8;
        if (moveDir !== 0) {
          s.playerX3D += moveDir * moveSpeed3D * dt;
          s.playerX3D = Math.max(-2.5, Math.min(18.5, s.playerX3D));
          playSandStep();
        }

        // Pull loot towards player when hauling
        const isCurrentlyHolding = s.isHolding || keysRef.current.haul;
        if (isCurrentlyHolding) {
          const speed3D = (s.currentDiff.haulSpeed / 1000) * 16.5;

          for (const item of s.loot3D) {
            if (!item.isAttached) {
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
          const blobR3D = (s.playerRadius / 18) * 1.25;

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

          if (s.waveX <= 510) enterRetreat();
        } else if (s.cyclePhase === 'WAVE_RETREAT') {
          s.waveX += s.waveSpeed * dt;

          const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));
          const wave3DX = 52 - waveRatio * 55;
          const blobR3D = (s.playerRadius / 18) * 1.25;

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

      if (engine3dRef.current) {
        const wrackRatio = Math.max(0, Math.min(1, (s.wrackLineX - 650) / 130));
        const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));

        // Update loot meshes
        for (const item of s.loot3D) {
          if (item.isAttached) {
            const blobR3D = (s.playerRadius / 18) * 1.25;
            const slopeY = groundHeightAt(s.playerX3D, 0);
            item.mesh.position.set(
              s.playerX3D + Math.cos(item.attachAngle) * blobR3D,
              slopeY + 1.0 + Math.sin(item.attachAngle) * blobR3D * 0.6,
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
          s.moveDir
        );
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [enterWarning, enterSweep, enterRetreat, finishCycle]);

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
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] font-bold text-base flex items-center justify-center transition-all cursor-pointer"
        >
          ?
        </button>

        <button
          onClick={() => handleToggleMute()}
          title="Toggle Audio (M)"
          className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] text-sm flex items-center justify-center transition-all cursor-pointer"
        >
          {muted ? '🔇' : '🔊'}
        </button>

        <button
          onClick={toggleFullscreen}
          title="Toggle Fullscreen (F)"
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
          className={`absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none font-game text-4xl transition-transform ${
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
              <span>FLEE HIGH TIDE</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. PLAYING HUD */}
      {appState === 'PLAYING' && (
        <>
          {/* Low-Poly Score Card (Top Left) */}
          <div className="absolute top-6 left-8 pointer-events-none flex flex-col gap-0.5 bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl p-3.5 shadow-[0_4px_0_#17181C]">
            <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
              SCORE
            </span>
            <span className="font-game text-4xl md:text-5xl font-bold text-[#17181C] tracking-tight leading-none">
              {displayedBanked}
            </span>
          </div>

          {/* Low-Poly Best & Wave Pill (Top Center-Right) */}
          <div className="absolute top-24 right-4 md:top-6 md:right-48 pointer-events-none flex items-center gap-2 md:gap-3">
            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-4 py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                BEST
              </span>
              <span className="font-game text-2xl font-bold text-[#24698F] leading-none">
                {bestScore}
              </span>
            </div>

            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-3.5 py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                WAVE
              </span>
              <span className="font-game text-2xl font-bold text-[#E8A317] leading-none">
                {wavesSurvived + 1}
              </span>
            </div>
          </div>

          {/* Floating Held Score Over Player */}
          {heldScore > 0 && (
            <div className="absolute top-[48%] left-1/2 -translate-x-1/2 -translate-y-12 pointer-events-none flex items-center font-game text-3xl text-[#17181C] bg-[#FDFBF7] border-2 border-[#17181C] rounded-2xl px-5 py-1.5 shadow-[0_4px_0_#17181C] animate-bounce">
              +{heldScore}
            </div>
          )}

          {/* Wave Warning Banner */}
          {isWaveWarning && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-game bg-[#E25B45] border-2 border-[#17181C] text-white text-lg md:text-xl px-7 py-2 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest animate-pulse">
              WAVE INCOMING!
            </div>
          )}

          {/* King Tide Banner */}
          {isKingTide && !isWaveWarning && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none font-game bg-[#F6C445] border-2 border-[#17181C] text-[#17181C] text-lg md:text-xl px-7 py-2 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest animate-pulse">
              KING TIDE · 2X
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
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4">
            <button
              onMouseDown={() => {
                keysRef.current.backward = true;
                setActiveKeys(prev => ({ ...prev, backward: true }));
              }}
              onMouseUp={() => {
                keysRef.current.backward = false;
                setActiveKeys(prev => ({ ...prev, backward: false }));
              }}
              onTouchStart={e => {
                e.preventDefault();
                keysRef.current.backward = true;
                setActiveKeys(prev => ({ ...prev, backward: true }));
              }}
              onTouchEnd={e => {
                e.preventDefault();
                keysRef.current.backward = false;
                setActiveKeys(prev => ({ ...prev, backward: false }));
              }}
              className={`w-14 h-14 rounded-xl border-2 border-[#17181C] font-game text-xl flex items-center justify-center transition-all cursor-pointer ${
                activeKeys.backward
                  ? 'bg-[#24698F] text-white translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
              title="Move Left (A / Left Arrow)"
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
              className={`px-9 h-14 rounded-xl border-2 border-[#17181C] font-game text-lg tracking-widest flex items-center gap-2 transition-all cursor-pointer ${
                activeKeys.haul
                  ? 'bg-[#F6C445] text-[#17181C] translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#17181C] text-white hover:bg-[#24698F] shadow-[0_5px_0_#0D0E10]'
              }`}
            >
              <span>⚡</span>
              <span>HAUL</span>
            </button>

            <button
              onMouseDown={() => {
                keysRef.current.forward = true;
                setActiveKeys(prev => ({ ...prev, forward: true }));
              }}
              onMouseUp={() => {
                keysRef.current.forward = false;
                setActiveKeys(prev => ({ ...prev, forward: false }));
              }}
              onTouchStart={e => {
                e.preventDefault();
                keysRef.current.forward = true;
                setActiveKeys(prev => ({ ...prev, forward: true }));
              }}
              onTouchEnd={e => {
                e.preventDefault();
                keysRef.current.forward = false;
                setActiveKeys(prev => ({ ...prev, forward: false }));
              }}
              className={`w-14 h-14 rounded-xl border-2 border-[#17181C] font-game text-xl flex items-center justify-center transition-all cursor-pointer ${
                activeKeys.forward
                  ? 'bg-[#24698F] text-white translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
              title="Move Right (D / Right Arrow)"
            >
              ▶
            </button>
          </div>
        </>
      )}

      {/* 4. LOW-POLY TUTORIAL MODAL */}
      {showGuide && (
        <div
          className="absolute inset-0 z-50 bg-[#17181C]/50 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl max-w-sm w-full p-6 shadow-[0_8px_0_#17181C] relative"
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
                    [A] / [D] or Arrows to scuttle beach.
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
                  <span className="font-game text-sm text-[#17181C] block">SURVIVE</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    Retreat before the ocean wave crashes!
                  </span>
                </div>
              </div>
            </div>

            {/* Low-Poly Action Button */}
            <button
              onClick={() => setShowGuide(false)}
              className="w-full py-3 rounded-xl bg-[#24698F] hover:bg-[#1B5575] text-white font-game text-base tracking-wider border-2 border-[#17181C] shadow-[0_4px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              GOT IT
            </button>
          </div>
        </div>
      )}

      {/* 5. LOW-POLY GAME OVER SCREEN */}
      {appState === 'DEAD' && (
        <div className="absolute inset-0 bg-[#D4E6F4]/92 backdrop-blur-sm flex flex-col items-center justify-center z-50 pointer-events-auto p-5 md:p-6">
          <WracklineLogo size="sm" showTitle={false} className="mb-3 md:mb-4" />

          {/* Short Game Title */}
          <h2 className="font-game text-4xl md:text-5xl text-[#17181C] tracking-wide mb-6 md:mb-8">
            HIGH TIDE
          </h2>

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

          {/* Low-Poly Tactile Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
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
        </div>
      )}
    </div>
  );
}
