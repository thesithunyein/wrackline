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
import { Wrackline3D, Loot3DItem, groundHeightAt, waterSurfaceY } from './game3d';
import { WracklineLogo } from './Logo';
import { buildShareCard, sanitizeName, shareFileName, ShareCardData } from './shareCard';
import { mmtDayKey, msUntilNextMmtDay } from './game/clock';
import {
  SEASON_MOD,
  SHELLS,
  applyRun,
  dailyMissionsFor,
  dailySeed,
  dailyTideFor,
  loadDailySave,
  loadShellId,
  missionProgress,
  mulberry32,
  resolveShell,
  saveDailySave,
  saveShellId,
  shorePoints,
  unlockedShells,
  type DailySave,
  type MissionDef,
  type RunSummary,
  type TideMod
} from './game/retention';
import {
  createRunId,
  ensurePlayerName,
  fetchBoard,
  getPlayerId,
  loadLocalBoard,
  markPlayerEntry,
  saveLocalRun,
  submitRun,
  syncPlayerName
} from './game/leaderboard';
import type { BoardEntry, BoardId } from './game/leaderboardCore';
import { planWaveLoot } from './game/loot';
import { rollHush } from './game/waveClock';
import {
  LANGUAGES,
  loadLang,
  saveLang,
  translate,
  type Lang,
  type Vars
} from './game/i18n';
import { renderShellThumbnails } from './shellPreview';

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
// losing condition, so the wrack line never ends a run by surprise: it just keeps
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

// Banking in the last breath of the warning, before the surge lands on the shore.
// Rate-limited to once per wave on purpose: if every bank paid the bonus the score would
// inflate and the greed decision the whole game rests on would stop meaning anything.
// Where the player's name for the share card lives. The score is already kept in
// localStorage, so the name joins it there: same device, same lifetime, no account.
const SHARE_NAME_KEY = 'wrackline_name';
// Sound is a setting now, so it survives a reload like the language does.
const MUTED_KEY = 'wrackline_muted';
// Where a shared run sends people. One constant, so the share text cannot drift from
// the canonical host in index.html.
const SITE_URL = 'https://wrackline.sithunyein.com';

const NEAR_MISS_WINDOW = 0.45;
const NEAR_MISS_BONUS = 1.5;
// A short slow-motion beat sells the escape. The clock is scaled in exactly one place.
const NEAR_MISS_SLOW_FACTOR = 0.45;
const NEAR_MISS_SLOW_FRAMES = 10;

// Riding the surge. While the wave is on the shore the wrack rides the water instead of
// sitting on the sand. It floats, so it can be seen and taken through the wave rather
// than hidden by it; the surge carries it, pushing it inland as it runs up the beach and
// dragging it back out as it leaves; and anything taken off moving water pays a bonus,
// because holding loot while the surge is on the shore is what costs hearts. Without
// this the wave was a window where hauling did nothing at all: every piece pulled in was
// torn off again before it could be banked.
const SURGE_GRAB_BONUS = 1.75;
const SURGE_CARRY_INLAND = 9.0;
// Measured against the real loop: with the drag at 7.0 a wave moved the wrack 2.4
// units inland through the sweep and then took 1.6 of it back out on the retreat, so
// the tide shuttled the wrack back and forth rather than delivering it. At 4.0 the
// sweep still carries 1.9 inland and the retreat takes 0.8 of it back, so a wave nets
// about a unit of real inland progress, and with the claws' reach capped that drag is
// what carries wrack in to a player standing out at the waterline instead of past
// them: it delivered 935 a hand off the edge of the reach in one run.
const SURGE_CARRY_SEA = 4.0;
const SURGE_FLOAT_LIFT = 0.55;
// The water claws on a tick: every 0.4 seconds it reaches, and lands a little over half
// the time, so the haul bleeds at about 1.4 pieces a second rather than the one every
// 0.125 seconds it used to strip. Eight a second is faster than anyone can haul, which is
// what made the surge untakeable; this rate leaves a quick pair of claws something to win.
const SURGE_TEAR_INTERVAL = 0.4;
const SURGE_TEAR_CHANCE = 0.55;
// The band of beach the tide leaves its wrack on. Measured against the terrain: x = 14
// is the last x that is sand at every z, so nothing in the band can come to rest under
// the sea surface, and the whole band sits inside the player's walk (x clamps at 18.5).
const WRACK_NEAR_X = 1.5;
const WRACK_FAR_X = 14;
// Where the wash stops on its way up the shore, just behind the player's start.
const SURGE_STOP_X = -0.5;

// How far the claws reach. The wrack lands across a band 12.5 units wide
// (WRACK_NEAR_X to WRACK_FAR_X) that runs from just ahead of the player's start to
// the waterline, and the player walks 6.8 a second. A reach of 6 covers about half
// that band from one spot, so the near pieces can be taken where you stand and the
// fatter seaward ones have to be walked to, which is the only thing that makes the
// spawn values mean anything: measured, without a reach the haul took the whole band
// from a standstill at the top of the beach in a single low tide.
const HAUL_REACH_X = 6.0;

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

// Wrack still out on the water when the tide drops. It washes in at `at`, a fraction
// of the warning, so it lands inside the escape window rather than before it.
interface PendingLoot {
  type: number;
  x: number;
  z: number;
  at: number;
}

// Line-art icons, drawn rather than typed. The emoji speaker arrived as a different
// picture on every platform (on iOS it looked like a telephone handset), and a mismatched
// glyph sitting beside flat low-poly geometry is exactly the detail that reads as
// unfinished. Two strokes each, so they match the ◀ ▶ ▼ controls under them.
const IconSound: React.FC<{ muted: boolean }> = ({ muted }) => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 9.4h3.3L11.6 6v12L7.3 14.6H4z" fill="currentColor" stroke="none" />
    {muted ? (
      <path d="M15.2 9.6l4.8 4.8m0-4.8l-4.8 4.8" />
    ) : (
      <>
        <path d="M15 9.3a4.2 4.2 0 010 5.4" />
        <path d="M18 6.9a8 8 0 010 10.2" />
      </>
    )}
  </svg>
);

const IconExpand: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 9V4h5" />
    <path d="M20 15v5h-5" />
    <path d="M15 4h5v5" />
    <path d="M9 20H4v-5" />
  </svg>
);

const IconExternal: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M14 4h6v6" />
    <path d="M20 4l-8 8" />
    <path d="M18.5 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1h4.5" />
  </svg>
);

const IconGear: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {/* A toothed cog, not a hub with eight separated spokes: at 20px the old one
        read as the brightness/sun icon sitting in the settings slot. */}
    <path d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z" />
    <circle cx="12" cy="12" r="2.9" />
  </svg>
);

const IconBoard: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M8 20h8" />
    <path d="M12 16v4" />
    <path d="M7 4h10v4.5a5 5 0 01-10 0z" />
    <path d="M7 5.5H4v1.5a3 3 0 003 3" />
    <path d="M17 5.5h3v1.5a3 3 0 01-3 3" />
  </svg>
);

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
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTED_KEY) === '1';
    } catch {
      return getIsMuted();
    }
  });
  // Language and settings. The ref lets the game loop and the share handlers read the
  // current language without taking a dependency on it: a language switch must never
  // restart the render loop mid-run.
  const [lang, setLang] = useState<Lang>(loadLang);
  const langRef = useRef<Lang>(lang);
  langRef.current = lang;
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  // Browsers change fullscreen outside React (Esc, the F11 key, the phone gesture), so
  // the row's label has to follow the document rather than the last click.
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== 'undefined' && !!document.fullscreenElement
  );
  const [shellThumbs, setShellThumbs] = useState<Record<string, string>>({});
  const t = (text: string, vars?: Vars) => translate(lang, text, vars);
  const [popups, setPopups] = useState<FloatingPopup[]>([]);
  const [wavesSurvived, setWavesSurvived] = useState<number>(0);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  // Read once, and only ever used to choose which words to show. A phone has no A, D,
  // Space or B key, and printing key names at someone holding a phone is the fastest way
  // to make a game look like it was never opened on one. Coarse or hoverless pointer
  // covers phones and tablets without catching a desktop that merely has a touchscreen.
  const [isTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
  });
  const [showInputCue, setShowInputCue] = useState<boolean>(true);
  const [shareNote, setShareNote] = useState<string>('');
  // The name on the share card. Asked once, kept on the device, never sent anywhere:
  // there is no server to send it to.
  const [playerName, setPlayerName] = useState<string>(() => {
    try {
      return localStorage.getItem(SHARE_NAME_KEY) || '';
    } catch {
      return '';
    }
  });
  const [askName, setAskName] = useState<boolean>(false);
  const [nameDraft, setNameDraft] = useState<string>('');
  const [cardState, setCardState] = useState<'IDLE' | 'WORKING' | 'SAVED' | 'FAILED'>('IDLE');

  // The season, or today's tide. The daily tide is one modifier seeded from the
  // MMT date, so everyone who plays today plays the same shore and the daily
  // board compares like with like. All three are refreshed when a new run starts,
  // so a tab left open overnight starts the next day's shore rather than yesterday's.
  const [runMode, setRunMode] = useState<'SEASON' | 'DAILY'>('SEASON');
  const [dayKey, setDayKey] = useState<string>(() => mmtDayKey());
  const [todayTide, setTodayTide] = useState<TideMod>(() => dailyTideFor(mmtDayKey()));
  const [todayMissions, setTodayMissions] = useState<MissionDef[]>(() => dailyMissionsFor(mmtDayKey()));
  const [dailySave, setDailySave] = useState<DailySave>(() => loadDailySave());
  const dailySaveRef = useRef<DailySave>(dailySave);
  const playerNameRef = useRef<string>('');
  const [completedMissions, setCompletedMissions] = useState<string[]>([]);
  const [showDailySheet, setShowDailySheet] = useState<boolean>(false);
  const [resetLabel, setResetLabel] = useState<string>('');

  // The tide boards. `online` is only ever true when the endpoint admitted to
  // durable storage; otherwise the sheet shows the device's own best.
  const [boardOpen, setBoardOpen] = useState<boolean>(false);
  const [boardTab, setBoardTab] = useState<BoardId>('season');
  const [boardEntries, setBoardEntries] = useState<BoardEntry[]>([]);
  const [boardOnline, setBoardOnline] = useState<boolean>(false);
  const [boardLoading, setBoardLoading] = useState<boolean>(false);
  const [boardError, setBoardError] = useState<string>('');
  const [onlineRank, setOnlineRank] = useState<number | null>(null);
  // Where the run landed on the device's own board, shown when the world board
  // cannot be reached: a score with no rank at all reads like it was not counted.
  const [deviceRank, setDeviceRank] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [shellId, setShellId] = useState<string | null>(() => loadShellId());
  const shorePointTotal = shorePoints(dailySave);
  const shell = resolveShell(shorePointTotal, shellId);

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
  // Slow-motion frames still owed from a last-instant bank, and the wave already paid for.
  const nearMissSlowRef = useRef(0);
  const lastNearMissWaveRef = useRef(-1);
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

    // Which shore this is, and the dice it rolls. A daily tide seeds its own
    // randomness so the wrack lands in the same places for everyone.
    runMode: 'SEASON' as 'SEASON' | 'DAILY',
    mods: SEASON_MOD,
    rng: Math.random as () => number,
    // The wave clock rolls on its own stream. Drawing it from the shore's stream would
    // shift every loot placement on a daily tide the moment this shipped, and today's
    // board would stop comparing like with like.
    waveRng: Math.random as () => number,
    surgeGrabs: 0,
    kingBanks: 0,
    itemsHauled: 0,
    dug: false,
    runStart: 0,

    playerX3D: 0.0,
    isMoving: false,
    moveDir: 0,

    waveX: 1450,
    waveSpeed: 760,
    // The world x of the surge's leading toe, written every frame the wave is on the
    // move. Everything that asks "is the water over this piece?" reads it here.
    wave3DX: 52,
    tearOffTimer: 0,

    playerRadius: 18,
    playerSquashX: 1,
    playerSquashY: 1,

    loot3D: [] as Loot3DItem[],
    pendingLoot: [] as PendingLoot[],
    washedIn: 0,
    attached3D: [] as Loot3DItem[],
    screenShake: 0
  });

  useEffect(() => {
    stateRef.current.best = bestScore;
  }, [bestScore]);

  useEffect(() => {
    dailySaveRef.current = dailySave;
  }, [dailySave]);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  // The carapace colour is the whole of the unlock track's payoff, and it has to
  // survive a run starting: the shell is rebuilt only when the engine is.
  useEffect(() => {
    engine3dRef.current?.setShellColor(shell.color);
  }, [shell.color]);

  // Sound is a saved setting now. The audio module owns the mute flag, so this brings
  // it in line with the stored choice and keeps the two from drifting apart.
  useEffect(() => {
    if (getIsMuted() !== muted) toggleMute();
    try {
      localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
    } catch {}
  }, [muted]);

  // The document language drives the font stack in index.html, which is what gives
  // Burmese real glyphs instead of a wall of boxes.
  useEffect(() => {
    document.documentElement.lang = lang;
    saveLang(lang);
  }, [lang]);

  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Portraits are drawn the first time the shell row is opened, a frame after the
  // sheet paints, so the sheet is never held up by a WebGL render nobody has seen yet.
  useEffect(() => {
    if (!showDailySheet) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      const thumbs = renderShellThumbnails(SHELLS.map(candidate => candidate.color), 192);
      if (alive && Object.keys(thumbs).length > 0) setShellThumbs(thumbs);
    }, 30);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [showDailySheet]);

  // How long until tomorrow's shore. Ticked only while the sheet is open, so the
  // countdown is right when it is read and costs nothing when it is not.
  useEffect(() => {
    if (!showDailySheet) return;
    const tick = () => {
      const minutes = Math.max(0, Math.ceil(msUntilNextMmtDay() / 60_000));
      const hours = Math.floor(minutes / 60);
      setResetLabel(hours > 0 ? `${hours}H ${minutes % 60}M` : `${minutes}M`);
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [showDailySheet]);

  // The board is fetched only when it is actually opened, so a first visit never
  // pays for a request it will not look at.
  useEffect(() => {
    if (!boardOpen) return;
    let alive = true;
    setBoardLoading(true);
    setBoardError('');
    fetchBoard(boardTab).then(result => {
      if (!alive) return;
      setBoardOnline(result.online);
      if (result.online) {
        setBoardEntries(markPlayerEntry(result.entries, getPlayerId()));
      } else {
        setBoardEntries(loadLocalBoard());
        setBoardError(result.error || '');
      }
      setBoardLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [boardOpen, boardTab]);

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

  // Puts one piece of wrack on the sand. Shared by the pieces the low tide has already
  // stranded and the ones that wash in with the draw, so both pay the same way.
  const placeLoot = useCallback((typeIndex: number, spawnX: number, spawnZ: number): Loot3DItem | null => {
    const s = stateRef.current;
    if (!engine3dRef.current) return null;

    const groundY = groundHeightAt(spawnX, spawnZ) + 0.3;

    // The sparkle marker rides the pieces that carry the most risk, so it is read
    // off the piece's place on the shore rather than its index in the loop.
    const shoreFrac = (spawnX - WRACK_NEAR_X) / (WRACK_FAR_X - WRACK_NEAR_X);
    const band: 'near' | 'mid' | 'far' =
      shoreFrac < 0.34 ? 'near' : shoreFrac < 0.67 ? 'mid' : 'far';
    const mesh = engine3dRef.current.createLootMesh(typeIndex, band);

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
    // reach it, and the more it is worth for the trouble. The daily tide's own
    // multiplier is applied here, once, so nothing downstream has to know about it.
    const risk = Math.max(0, Math.min(1, shoreFrac));
    const val = Math.round(
      baseVal * s.currentDiff.multiplier * (1 + risk * 1.2) * s.mods.lootValue
    );

    const item: Loot3DItem = {
      id: Date.now() + s.loot3D.length + s.rng(),
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
      attachAngle: s.rng() * Math.PI * 2,
      attachElev: (s.rng() - 0.5) * 0.8
    };
    s.loot3D.push(item);
    return item;
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
    s.pendingLoot = [];
    s.washedIn = 0;

    const rng = s.rng;

    const baseCount = Math.floor(4 + rng() * 3 + s.waveIndex * 0.8) + s.mods.lootCount;
    const count = Math.max(3, Math.min(10, baseCount));

    const types = [0, 1, 2, 3, 4, 6]; // Ammonite, Glass, Doubloon, Driftwood, Clam, Bottle
    const { early, lateAt } = planWaveLoot(count);

    // The wrack lands on the sand the tide can actually leave it on: see the WRACK_NEAR_X
    // and WRACK_FAR_X notes above for why the band is where it is.
    for (let i = 0; i < early; i++) {
      const typeIndex = types[Math.floor(rng() * types.length)];

      // Spread the pieces across the sand instead of marching them out to sea. The
      // gradient from the near piece to the one at the waterline IS the reward for
      // walking up the shore, and it only reads if every piece is on ground you can
      // stand on. The last piece is clamped, so a wide roll cannot float it off the
      // beach and back under the swell.
      const spread = i / Math.max(1, early - 1);
      const spawnX = Math.min(
        WRACK_FAR_X,
        WRACK_NEAR_X + (WRACK_FAR_X - WRACK_NEAR_X) * spread + (rng() - 0.5) * 1.2
      );
      const spawnZ = (rng() - 0.5) * 11;
      placeLoot(typeIndex, spawnX, spawnZ);
    }

    // The rest is still out on the water. It comes in with the draw, which is the one
    // stretch of the cycle where the water is already moving and there is still
    // something worth one more grab, so the beach can no longer be cleared and banked
    // before the surge has even been called.
    for (const at of lateAt) {
      s.pendingLoot.push({
        type: types[Math.floor(rng() * types.length)],
        x: WRACK_FAR_X - rng() * 3.2,
        z: (rng() - 0.5) * 11,
        at
      });
    }
  }, [placeLoot]);

  // Cycle State Transitions
  const enterLowTide = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'LOW_TIDE';
    s.phaseTimer = 0;
    setIsWaveWarning(false);

    // The window closes all season. The old 0.65 floor was reached at wave seven, so
    // every wave after it played identically; the floor now sits out past the last
    // wave and the closing waves are genuinely thin. What the season earns here is the
    // *centre* of the window, though, not its length on any one wave: the hush is rolled
    // around it, so the shore can open for a sneak one wave and a long breath the next.
    const waveFactor = Math.max(0.42, 1 - s.waveIndex * 0.045);
    const baseLowTide = s.currentDiff.baseLowTide * waveFactor * s.mods.lowTide;
    s.phaseDuration = rollHush({
      base: baseLowTide,
      waveIndex: s.waveIndex,
      rng: s.waveRng
    }).seconds;

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
        isKing = s.rng() < Math.min(0.45, (0.18 + s.waveIndex * 0.03) * s.mods.kingOdds);
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

    // Announce the wave you have just walked into. This is progress, not danger. The
    // water carries the danger now, and it is what gives the season its rungs.
    const phrase = (text: string) => translate(langRef.current, text);
    setWaveIntro(
      translate(langRef.current, 'WAVE {wave} · {tier} · {tide}{mod}', {
        wave: s.waveIndex + 1,
        tier: phrase(tierForWave(s.waveIndex + 1)),
        tide: phrase(s.currentDiff.name),
        mod: s.runMode === 'DAILY' ? ` · ${phrase(s.mods.name)}` : ''
      })
    );
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);
    introTimerRef.current = window.setTimeout(() => setWaveIntro(null), 1800);
  }, [spawnCycleLoot]);

  const enterWarning = useCallback(() => {
    const s = stateRef.current;
    s.cyclePhase = 'WARNING';
    s.phaseTimer = 0;
    s.phaseDuration = s.currentDiff.warningDuration * s.mods.warning;
    setIsWaveWarning(true);
    startRumble(s.phaseDuration);
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

    // One finished tide feeds three things that outlive it: today's missions, the
    // on-device board, and — when the endpoint has durable storage — the world board.
    const summary: RunSummary = {
      score: s.banked,
      waves: s.waveIndex,
      survived: cause === 'SURVIVED',
      surgeGrabs: s.surgeGrabs,
      kingBanks: s.kingBanks,
      itemsHauled: s.itemsHauled,
      dug: s.dug
    };

    // The day the score will be filed under is the day the server will compute,
    // so the missions folded here use that day's shore too.
    const today = mmtDayKey();
    const folded = applyRun(
      dailySaveRef.current,
      today,
      summary,
      today === dayKey ? todayMissions : dailyMissionsFor(today),
      s.runMode === 'DAILY'
    );
    dailySaveRef.current = folded.save;
    saveDailySave(folded.save);
    setDailySave(folded.save);
    setCompletedMissions(folded.completed);

    // A run that banked nothing is not a score: the board only takes positive tides.
    if (s.banked <= 0) {
      setOnlineRank(null);
      setDeviceRank(null);
      return;
    }

    const name = ensurePlayerName();
    if (name !== playerNameRef.current) setPlayerName(name);

    const run = {
      playerId: getPlayerId(),
      runId: createRunId(),
      name,
      score: s.banked,
      waves: s.waveIndex,
      tide: s.currentDiff.name,
      durationMs: Math.max(0, Date.now() - s.runStart)
    };

    setDeviceRank(saveLocalRun(run).rank || null);
    setSubmitting(true);
    void submitRun(s.runMode === 'DAILY' ? 'daily' : 'season', run)
      .then(result => {
        setSubmitting(false);
        if (!result.ok) {
          setOnlineRank(null);
          return;
        }
        setOnlineRank(result.rank);
        setBoardOnline(true);
        setBoardEntries(markPlayerEntry(result.entries, run.playerId));
      })
      .catch(() => setSubmitting(false));
  }, [checkSaveBest, todayMissions, dayKey]);

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
  const startGame = useCallback((diff: DiffConfig, mode: 'SEASON' | 'DAILY' = 'SEASON') => {
    initAudio();
    const s = stateRef.current;

    // A tab can outlive its day. If the Myanmar date has turned since this screen
    // was drawn, the run starts on the new shore: yesterday's tide and missions
    // must not be handed out tomorrow.
    const today = mmtDayKey();
    const tide = today === dayKey ? todayTide : dailyTideFor(today);
    if (today !== dayKey) {
      setDayKey(today);
      setTodayTide(tide);
      setTodayMissions(dailyMissionsFor(today));
    }

    s.gameState = 'PLAYING';
    s.currentDiff = diff;
    s.runMode = mode;
    // The daily tide is one modifier and one seeded shore: everyone who plays it
    // today gets the same rules and the same wrack, which is what makes its board
    // a fair comparison rather than a draw from the same dice.
    s.mods = mode === 'DAILY' ? tide : SEASON_MOD;
    s.rng = mode === 'DAILY' ? mulberry32(dailySeed(today)) : Math.random;
    // Same day, same clock: the daily tide hands every player the same beats as well as
    // the same shore, so its board still measures the player and not the dice.
    s.waveRng =
      mode === 'DAILY' ? mulberry32(dailySeed(today) ^ 0x5bf03635) : Math.random;
    s.surgeGrabs = 0;
    s.kingBanks = 0;
    s.itemsHauled = 0;
    s.dug = false;
    s.runStart = Date.now();
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
    s.pendingLoot = [];
    s.digging = false;
    s.digTimer = 0;
    s.isBurrowed = false;
    keysRef.current.burrow = false;

    setAppState('PLAYING');
    setSelectedDiff(diff);
    setRunMode(mode);
    setBankedScore(0);
    setDisplayedBanked(0);
    setHeldScore(0);
    setIsNewBest(false);
    setIsKingTide(false);
    setCardState('IDLE');
    setShareNote('');
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
    setCompletedMissions([]);
    setOnlineRank(null);
    setDeviceRank(null);
    if (introTimerRef.current !== null) window.clearTimeout(introTimerRef.current);

    if (engine3dRef.current) {
      for (const item of s.loot3D) {
        engine3dRef.current.scene.remove(item.mesh);
      }
    }
    s.loot3D = [];

    enterLowTide();
  }, [enterLowTide, todayTide, dayKey]);

  // Bank Held Score
  const bankHeldScore = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== 'PLAYING') return;
    if (s.attached3D.length === 0) return;

    let earned = 0;
    for (const item of s.attached3D) earned += item.val;
    s.itemsHauled += s.attached3D.length;

    const isKing = s.isKingTide;
    if (isKing) {
      earned *= 2;
      s.kingBanks += 1;
    }

    // Snuck it: banking in the last breath of the warning, with the surge already moving.
    // This is the moment the run is remembered for, so it is loud where an ordinary bank
    // is quiet, but it only pays once per wave (see lastNearMissWaveRef).
    const timeLeft = s.phaseDuration - s.phaseTimer;
    const nearMiss =
      s.cyclePhase === 'WARNING' &&
      timeLeft > 0 &&
      timeLeft <= NEAR_MISS_WINDOW &&
      lastNearMissWaveRef.current !== s.waveIndex;

    if (nearMiss) {
      lastNearMissWaveRef.current = s.waveIndex;
      earned = Math.max(1, Math.round(earned * NEAR_MISS_BONUS));
      nearMissSlowRef.current = NEAR_MISS_SLOW_FRAMES;
    }

    s.banked += earned;
    s.held = 0;
    setBankedScore(s.banked);
    setHeldScore(0);

    const newPopup: FloatingPopup = {
      id: Date.now(),
      text: nearMiss
        ? translate(langRef.current, 'SNUCK IT +{n}', { n: earned })
        : isKing
          ? translate(langRef.current, '+{n} (2X)', { n: earned })
          : `+${earned}`,
      x: 50,
      y: 45,
      alpha: 1,
      isGold: nearMiss || isKing,
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
      engine3dRef.current.triggerImpactShake(nearMiss ? 0.95 : 0.35);
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

  const fullscreenAvailable = typeof document !== 'undefined' && document.fullscreenEnabled;

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
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
      // While the name prompt is open the keyboard belongs to it: without this, Enter in
      // the field would submit the form and restart the run behind it at the same time.
      const target = e.target as HTMLElement | null;
      if (askName || target?.tagName === 'INPUT') return;

      initAudio();
      const code = e.code;
      const key = e.key;

      // One press back into the water. Runs are about a minute, so making the retry
      // free is what turns a loss into "one more go" instead of a stop point.
      if (
        (code === 'KeyR' || code === 'Enter') &&
        (stateRef.current.gameState === 'DEAD' || stateRef.current.gameState === 'WIN')
      ) {
        startGame(stateRef.current.currentDiff, stateRef.current.runMode);
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
  }, [startHaul, endHaul, toggleFullscreen, startGame, startDig, endDig, togglePause, askName]);

  // Main 60FPS Game Loop
  useEffect(() => {
    let lastTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      // A last-instant bank drops the world into a brief slow motion. Everything in the
      // simulation reads this one clock, so scaling it here slows all of it coherently.
      const slowing = nearMissSlowRef.current > 0;
      if (slowing) nearMissSlowRef.current -= 1;
      const dt =
        Math.min((now - lastTime) / 1000, 0.05) * (slowing ? NEAR_MISS_SLOW_FACTOR : 1);
      lastTime = now;

      const s = stateRef.current;

      // The wave is on the shore, or pulling back over it, rather than out at sea. This
      // is the whole difference between wrack resting on sand and wrack riding water.
      const surgeOnShore = s.cyclePhase === 'WAVE_SWEEP' || s.cyclePhase === 'WAVE_RETREAT';

      if (s.gameState === 'PLAYING' && !pausedRef.current) {
        s.invulnTimer = Math.max(0, s.invulnTimer - dt);

        // Digging in. Once the shell is under the sand the shell comes up empty: the
        // haul spills around you, marked so it can never be gathered again, and the
        // surge takes it as it crosses. That cost is the whole mechanic, and without it
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
              s.dug = true;
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
              // Out of reach: the claws do not touch it, so it neither moves nor is
              // taken. Walking the wrack line is the price of the far, fatter pieces.
              if (Math.abs(item.x - s.playerX3D) > HAUL_REACH_X) continue;

              const pullRate = speed3D + (moveDir > 0 ? 4.5 : 0);
              item.x -= pullRate * dt;
              item.z += (0 - item.z) * Math.min(1, dt * 3.2);

              const blobR3D = (s.playerRadius / 18) * 1.25;
              if (item.x <= s.playerX3D + blobR3D + 0.45) {
                // Taken off moving water, the piece pays more. This is the grab the
                // surge is for, and it is worth a heart because the alternative was a
                // window where nothing could be kept at all.
                const tookFromSurge = surgeOnShore;
                if (tookFromSurge) item.val = Math.round(item.val * SURGE_GRAB_BONUS);

                item.isAttached = true;
                s.attached3D.push(item);
                s.held += item.val;
                s.itemsHauled += 1;
                if (tookFromSurge) s.surgeGrabs += 1;
                setHeldScore(s.held);
                playTick();

                // Every grab says what it was worth. The model shapes are the only
                // other clue and nothing on screen teaches which is which, so a grab
                // that paid the surge bonus says so in words.
                const grab: FloatingPopup = {
                  id: Date.now() + Math.random(),
                  text: tookFromSurge
                    ? translate(langRef.current, 'SURGE +{n}', { n: item.val })
                    : `+${item.val}`,
                  x: 50 + (Math.random() - 0.5) * 12,
                  y: 55,
                  alpha: 0.9,
                  isGold: tookFromSurge || item.val >= 250,
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
          // The draw brings wrack in. Anything scheduled for this point in the warning
          // lands now, so the beach is never fully cleared before the water arrives.
          // It is read off the phase clock rather than a timer, so a pause holds the
          // rest of the wave out on the water instead of dropping it behind a blurred
          // screen.
          const progress = s.phaseTimer / Math.max(0.001, s.phaseDuration);
          while (s.pendingLoot.length > 0 && s.pendingLoot[0].at <= progress) {
            const drop = s.pendingLoot.shift();
            if (!drop) break;
            const item = placeLoot(drop.type, drop.x, drop.z);
            if (!item) continue;
            playSparkle();
            // Out over the surf, stepping down the screen per drop, so three arrivals
            // in one draw stay readable instead of stacking on the bank number.
            const slot = s.washedIn++ % 3;
            setPopups(prev => [
              ...prev.slice(-5),
              {
                id: Date.now() + Math.random(),
                text: translate(langRef.current, 'WASHED IN +{n}', { n: item.val }),
                x: 70 + slot * 5,
                y: 44 + slot * 7,
                alpha: 0.9,
                isGold: true,
                size: 'small'
              }
            ]);
          }
          if (s.phaseTimer >= s.phaseDuration) enterSweep();
        } else if (s.cyclePhase === 'WAVE_SWEEP') {
          s.waveX -= s.waveSpeed * dt;

          const waveRatio = Math.max(0, Math.min(1, (1400 - s.waveX) / 890));
          const wave3DX = 52 - waveRatio * 55;
          s.wave3DX = wave3DX;
          // The shell swells as you hold more, and that swell is real: a fat blob is a
          // wider target, so the wave reaches it sooner than a lean one.
          const growR = engine3dRef.current?.blobGrowScale ?? 1;
          const blobR3D = (s.playerRadius / 18) * 1.25 * growR;

          // Running up the beach, the surge pushes the wrack inland with it, toward
          // the player, so the wave is what carries the trash along with it. Only the
          // pieces the water is actually over move: the surge pushes what it touches,
          // and it stops where the wash stops rather than shoving the top of the shore
          // out of the play area. Spilled loot stays put and is washed away below.
          for (const item of s.loot3D) {
            if (item.isAttached || item.doomed) continue;
            if (item.x >= wave3DX - 0.6) {
              item.x = Math.max(SURGE_STOP_X, item.x - SURGE_CARRY_INLAND * dt);
            }
          }

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

            // The timer has to be spent when the interval elapses, whether or not the
            // water takes anything: rolling again every frame would turn a twice a
            // second claw-back into a per-frame one, which is the bug this replaced.
            s.tearOffTimer += dt;
            if (s.tearOffTimer >= SURGE_TEAR_INTERVAL) {
              s.tearOffTimer = 0;
              if (s.attached3D.length > 0 && Math.random() < SURGE_TEAR_CHANCE) {
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
          s.wave3DX = wave3DX;
          // The shell swells as you hold more, and that swell is real: a fat blob is a
          // wider target, so the wave reaches it sooner than a lean one.
          const growR = engine3dRef.current?.blobGrowScale ?? 1;
          const blobR3D = (s.playerRadius / 18) * 1.25 * growR;

          if (wave3DX <= s.playerX3D + blobR3D + 1.5) {
            s.tearOffTimer += dt;
            if (s.tearOffTimer >= SURGE_TEAR_INTERVAL) {
              s.tearOffTimer = 0;
              if (s.attached3D.length > 0 && Math.random() < SURGE_TEAR_CHANCE) {
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
          }

          // Pulling back out, the water drags the wrack seaward with it: each piece is
          // pulled only while the receding toe is still over it, so the sand above the
          // wash is left alone and the pieces down in the wash slide back toward the sea.
          // That is what makes the retreat a window: grab it off the moving water now,
          // because it is being taken back out to where you cannot walk.
          for (const item of s.loot3D) {
            if (item.isAttached || item.doomed) continue;
            if (item.x >= wave3DX - 0.6) item.x += SURGE_CARRY_SEA * dt;
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
            // the slope instead of sinking into it or hovering over it. While the
            // surge is on the shore the piece rides the water instead: the sheet sits
            // a hand above the sand, so anything left bedded is under the wave, which
            // is the other half of why the wave used to be a window with nothing in it.
            const bedY = groundHeightAt(item.x, item.z) + 0.3;
            // The same drawn-down waterline the breaker is draped onto, so a piece
            // riding the surge floats on the water that is actually there.
            const floatY =
              waterSurfaceY(item.x, item.z, drawdown) +
              SURGE_FLOAT_LIFT +
              Math.sin(now / 260 + item.attachAngle * 3) * 0.06;
            // Only the pieces the water is actually over float: the toe of the surge is
            // the line, so wrack on dry sand further up the shore keeps sitting on the
            // sand instead of hovering a hand above it.
            const wet = surgeOnShore && item.x >= s.wave3DX - 0.6;
            item.mesh.position.set(item.x, wet ? Math.max(bedY, floatY) : bedY, item.z);
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
          drawdown,
          // 0 on the first wave, 1 on the last: the season's gloom, applied in the engine.
          Math.min(1, s.waveIndex / (SEASON_WAVES - 1))
        );
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [enterWarning, enterSweep, enterRetreat, finishCycle, endRun, placeLoot]);

  // The score card exists only inside this browser, so one run is invisible to everyone
  // else. This puts it where a friend or a judge can see it. It fails silently on purpose:
  // a share button that throws is worse than no share button.
  const shareResult = useCallback(async () => {
    const tr = (text: string, vars?: Vars) => translate(langRef.current, text, vars);
    const headline =
      endCause === 'SURVIVED'
        ? tr('I OUTLASTED THE TIDE in WRACKLINE · {score}', { score: bankedScore })
        : tr('The surge took me on wave {wave} · {score} in WRACKLINE', {
            wave: wavesSurvived + 1,
            score: bankedScore
          });
    const url = SITE_URL;
    const text = tr('{headline} · {tide} tide', {
      headline,
      tide: tr(selectedDiff.name)
    });

    // Clipboard first, share sheet second. The sheet is the nicer gesture on a phone, but
    // on a desktop it is a native dialog that can simply sit there, and this path only runs
    // when the card could not be saved, so it should not be able to stall too.
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setShareNote(translate(langRef.current, 'COPIED'));
        window.setTimeout(() => setShareNote(''), 1600);
        return;
      }
    } catch {
      // A refused clipboard falls through to the share sheet rather than giving up.
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'WRACKLINE', text, url });
      }
    } catch {
      // A dismissed share sheet is not a failure worth showing anyone.
    }
  }, [endCause, wavesSurvived, bankedScore, selectedDiff]);

  // The share button draws the card, writes the record and the name onto it, and saves it.
  //
  // The download is the action, deliberately. Handing the file to navigator.share is not
  // the same thing as saving it: the sheet gives the picture to another app, it can be
  // dismissed, and on a desktop that advertises file support it is a native dialog that
  // never hands anything back. The button promises a picture of your run; a file on disk
  // is that promise kept, on every platform, with no dialog in the way.
  const saveShareCard = useCallback(
    async (name: string) => {
      setCardState('WORKING');
      setShareNote('');
      const data: ShareCardData = {
        name,
        best: bestScore,
        score: bankedScore,
        wave: wavesSurvived,
        season: SEASON_WAVES,
        tide: selectedDiff.name,
        survived: endCause === 'SURVIVED',
        isNewBest
      };

      try {
        const blob = await buildShareCard(data);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = shareFileName(data);
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
        // Revoked on a later turn, not this one: a download that starts and then has
        // its blob pulled out from under it is a truncated file.
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
        setCardState('SAVED');
        setShareNote(translate(langRef.current, 'IMAGE SAVED'));
      } catch (err) {
        // A card that cannot be drawn or saved still leaves the run shareable as text.
        console.error('WRACKLINE could not save the share card', err);
        setCardState('FAILED');
        void shareResult();
      }
      window.setTimeout(() => setShareNote(''), 2600);
    },
    [bestScore, bankedScore, wavesSurvived, selectedDiff, endCause, isNewBest, shareResult]
  );

  // Share asks who is hauling the first time, and only the first time.
  const handleShare = useCallback(() => {
    if (!playerName) {
      setNameDraft('');
      setAskName(true);
      return;
    }
    void saveShareCard(playerName);
  }, [playerName, saveShareCard]);

  const submitName = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const clean = sanitizeName(nameDraft);
      setPlayerName(clean);
      try {
        localStorage.setItem(SHARE_NAME_KEY, clean);
      } catch {
        // Storage being unavailable costs the player the name next session, nothing else.
      }
      setAskName(false);
      void saveShareCard(clean);
      // The board row carries the same name, so renaming the card renames the
      // player on the world board too. Best-effort: the device keeps it regardless.
      void syncPlayerName(getPlayerId(), clean);
    },
    [nameDraft, saveShareCard]
  );

  // Everything above is the fallback path: a card that cannot be drawn still shares as text.

  return (
    <div
      data-lang={lang}
      className="relative w-full app-shell overflow-hidden select-none bg-[#D4E6F4] flex items-center justify-center font-ui"
    >
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

      {/* Top Header Controls: Low-Poly Tactile 3D Buttons.
          Three buttons, in the order they are reached for: the boards, the guide,
          the settings. Sound and fullscreen moved inside settings, which is where a
          player looks for them and which keeps this row from growing a fourth icon.
          z-50, above the title card but below the end screen and the sheets. */}
      <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] md:top-5 md:right-5 z-50 flex flex-col items-end gap-2 md:flex-row-reverse md:items-start md:gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={() => setBoardOpen(true)}
            title={t('Tide boards')}
            aria-label={t('Open the tide boards')}
            className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] flex items-center justify-center transition-all cursor-pointer"
          >
            <IconBoard />
          </button>

          <button
            onClick={() => setShowGuide(prev => !prev)}
            title={t('HOW TO PLAY')}
            aria-label={t('How to play')}
            className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] font-bold text-base flex items-center justify-center transition-all cursor-pointer"
          >
            ?
          </button>

          <button
            onClick={() => setSettingsOpen(true)}
            title={t('SETTINGS')}
            aria-label={t('Open settings')}
            className="w-10 h-10 md:w-11 md:h-11 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] text-[#17181C] flex items-center justify-center transition-all cursor-pointer"
          >
            <IconGear />
          </button>
        </div>

        {/* Best and wave ride in the same flow as the buttons: on a phone they stack
            underneath, on a wide screen they sit to the left of the icon row. Two
            separate absolute offsets used to guess at the button row's width, and
            the wave card lost that guess as soon as the header grew a fourth button. */}
        {appState === 'PLAYING' && (
          <div className="pointer-events-none flex items-center gap-2 md:mt-1 md:gap-3">
            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-3 py-2 md:px-4 md:py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-end gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                {t('BEST')}
              </span>
              <span className="font-game text-lg min-[385px]:text-xl md:text-2xl font-bold text-[#24698F] leading-none tabular-nums">
                {bestScore}
              </span>
            </div>

            <div className="bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl px-3 py-2 md:px-3.5 md:py-2.5 shadow-[0_4px_0_#17181C] flex flex-col items-center gap-0.5">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
                {t('WAVE')}
              </span>
              <span className="font-game text-lg min-[385px]:text-xl md:text-2xl font-bold text-[#E8A317] leading-none tabular-nums">
                {Math.min(wavesSurvived + 1, SEASON_WAVES)}
                <span className="text-[#17181C]/40 text-sm md:text-base">/{SEASON_WAVES}</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Floating Score Popups */}
      {popups.map(p => (
        <div
          key={p.id}
          style={{
            // The clamp keeps a wide popup from hanging off a phone edge when it
            // lands out at the waterline on slot 3.
            left: `clamp(88px, ${p.x}%, calc(100% - 88px))`,
            top: `${p.y}%`,
            opacity: p.alpha,
            // Gold sits over white foam as often as sand, and a soft shadow
            // disappears there. Five hard offsets make a 2px outline instead.
            textShadow: p.isGold
              ? '-2px -2px 0 #17181C, 2px -2px 0 #17181C, -2px 2px 0 #17181C, 2px 2px 0 #17181C, 0 3px 0 #17181C'
              : '0 1px 2px rgba(23, 24, 28, 0.3)'
          }}
          className={`absolute w-max -translate-x-1/2 -translate-y-1/2 pointer-events-none font-game transition-transform ${
            p.size === 'small' ? 'text-xl md:text-2xl' : 'text-4xl'
          } ${p.isGold ? 'text-[#F6C445]' : 'text-[#17181C]'}`}
        >
          {p.text}
        </div>
      ))}

      {/* Top Left: Best Record Badge (when in Title state) */}
      {bestScore > 0 && appState === 'TITLE' && (
        <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] md:top-5 md:left-5 z-40 bg-[#FDFBF7] border-2 border-[#17181C] rounded-2xl px-4 py-2 shadow-[0_3px_0_#17181C] flex items-center gap-2 pointer-events-none">
          <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
            {t('BEST')}
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
            {t('THIS BROWSER CANNOT RUN THE SHORE')}
          </h2>
          <p className="text-xs md:text-sm font-bold text-[#17181C]/75 max-w-sm">
            {webglFailed
              ? t('WRACKLINE draws its beach with WebGL, and this browser either does not support it or has it switched off. Another browser, or hardware acceleration turned back on, will do it.')
              : t('Something stopped the shore from loading. A reload usually fixes it.')}
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
            {t('LOADING WORLD')}
          </span>
        </div>
      )}

      {/* 2. TITLE SCREEN: Spacious, Uncluttered Low-Poly 3D Art Menu */}
      {appState === 'TITLE' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center bg-gradient-to-b from-[#D4E6F4]/25 via-transparent to-[#D4E6F4]/35 pointer-events-auto px-5 md:px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] md:pt-9 md:pb-14 select-none">
          {/* Top Zone: Clean Title & Subtitle with plenty of air */}
          <div className="flex flex-col items-center shrink-0 pt-14 pointer-events-none md:pt-2">
            <WracklineLogo size="md" className="mb-3 md:mb-4" />
            <p className="font-game text-xs md:text-sm text-[#17181C]/75 tracking-widest uppercase leading-relaxed text-center">
              {t('SURVIVE THE TIDE · HARVEST THE SHORE')}
            </p>
          </div>

          {/* Center Zone: Single Prominent PLAY Button + Labeled Tide Selector */}
          <div className="flex flex-1 flex-col items-center justify-center w-full max-w-xs my-3 md:my-auto md:max-w-sm">
            {/* Which shore PLAY starts. The daily tide is the same shore, seeded from
                today's date, for everyone who plays it before the day turns. */}
            <div className="grid grid-cols-2 gap-2 w-full mb-3">
              {(['SEASON', 'DAILY'] as const).map(mode => {
                const isSelected = runMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setRunMode(mode)}
                    aria-pressed={isSelected}
                    className={`py-2 rounded-xl font-game text-sm tracking-widest border-2 border-[#17181C] transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#17181C] text-[#FFFDF8] shadow-[0_3px_0_#0D0E10] translate-y-[-1px]'
                        : 'bg-[#FDFBF7]/90 text-[#17181C]/70 hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C]'
                    }`}
                  >
                    {t(mode === 'SEASON' ? 'SEASON' : 'DAILY TIDE')}
                  </button>
                );
              })}
            </div>

            {/* Primary Action Button: Clear, Big, Unmistakable Breathing Room */}
            <button
              onClick={() => startGame(selectedDiff, runMode)}
              className="w-full py-4 md:py-5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-2xl md:text-3xl tracking-widest border-2 border-[#17181C] shadow-[0_6px_0_#0D0E10] hover:shadow-[0_8px_0_#0D0E10] active:translate-y-[3px] active:shadow-[0_2px_0_#0D0E10] transition-all cursor-pointer flex items-center justify-center gap-3 mb-5 md:mb-7"
            >
              <span>▶</span>
              <span>{t('PLAY')}</span>
            </button>

            {/* Tide Intensity / Difficulty (Clearly Separated & Labeled) */}
            <div className="flex flex-col items-center w-full bg-[#FDFBF7]/90 backdrop-blur-xs p-3 md:p-3.5 rounded-2xl border-2 border-[#17181C] shadow-[0_4px_0_#17181C]">
              <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest mb-2.5">
                {t('TIDE INTENSITY')}
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
                      <span>{t(d.name)}</span>
                      <span className="text-[10px] font-ui font-bold opacity-80 mt-0.5 leading-none">{d.mult}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Today's tide, and the reason to come back tomorrow. One line on a phone,
                opening the sheet that holds the missions and the shell track. */}
            <button
              onClick={() => setShowDailySheet(true)}
              className="w-full mt-3 flex items-center justify-between gap-3 bg-[#FDFBF7]/90 backdrop-blur-xs px-3.5 py-2.5 rounded-2xl border-2 border-[#17181C] shadow-[0_3px_0_#17181C] hover:bg-[#EAD7B0]/60 active:translate-y-[1px] active:shadow-[0_2px_0_#17181C] transition-all cursor-pointer text-left"
              aria-label={t("Open today's tide, missions and shells")}
            >
              <span className="flex flex-col leading-tight">
                <span className="text-[9px] font-black text-[#17181C]/55 uppercase tracking-widest">
                  {t("TODAY'S TIDE")}
                </span>
                <span className="font-game text-sm tracking-wider text-[#24698F]">
                  {t(todayTide.name)}
                </span>
              </span>
              <span className="flex flex-col items-end leading-tight">
                <span className="text-[9px] font-black text-[#17181C]/55 uppercase tracking-widest">
                  {dailySave.streak > 0
                    ? t('{n} DAY STREAK', { n: dailySave.streak })
                    : t('NO STREAK')}
                </span>
                <span className="font-game text-sm tracking-wider text-[#17181C]">
                  {t('{done}/{total} MISSIONS', {
                    done: dailySave.done.length,
                    total: todayMissions.length
                  })}
                </span>
              </span>
            </button>
          </div>

        </div>
      )}

      {/* 3. PLAYING HUD */}
      {appState === 'PLAYING' && (
        <>
          {/* Damage flash: fires the moment a surge catches you holding loot */}
          {hurtFlash && (
            <div className="absolute inset-0 z-20 pointer-events-none bg-[#E25B45]/25 border-8 border-[#E25B45]/60" />
          )}

          {/* Low-Poly Score Card (Top Left) */}
          <div className="absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] md:top-6 md:left-8 pointer-events-none flex flex-col gap-0.5 bg-[#FDFBF7]/95 border-2 border-[#17181C] rounded-2xl p-3 md:p-3.5 shadow-[0_4px_0_#17181C]">
            <span className="text-[10px] font-black text-[#17181C]/60 uppercase tracking-widest">
              {t('SCORE')}
            </span>
            {/* Six-figure scores are the normal case, and at 360px the wider type
                ran into the icon row. The score steps down before the layout has to. */}
            <span className="font-game text-3xl min-[385px]:text-4xl md:text-5xl font-bold text-[#17181C] tracking-tight leading-none tabular-nums">
              {displayedBanked}
            </span>
            {/* Hearts: the only way to lose. A wave that catches you holding costs
                one. Spent hearts change shape as well as colour, because colour on its own
                left them nearly invisible against the card. */}
            <div
              className="flex items-center gap-1 mt-1"
              role="img"
              aria-label={t('{hearts} of {total} hearts left', {
                hearts,
                total: selectedDiff.hearts
              })}
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
            <div className="absolute top-[calc(max(1rem,env(safe-area-inset-top))+8rem)] md:top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-max font-game bg-[#F6C445] border-2 border-[#17181C] text-[#17181C] text-base md:text-xl px-5 md:px-7 py-2 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest animate-pulse max-w-[92vw] text-center">
              {t('KING TIDE · 2X')}
            </div>
          )}

          {/* Which wave you just walked into. Progress, not danger, so it never
              competes with the King Tide call. */}
          {waveIntro && !isKingTide && (
            <div className="absolute top-[calc(max(1rem,env(safe-area-inset-top))+8rem)] md:top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none w-max font-game bg-[#FDFBF7] border-2 border-[#17181C] text-[#17181C] text-xs md:text-base px-3.5 md:px-6 py-1.5 rounded-xl shadow-[0_4px_0_#17181C] tracking-widest max-w-[92vw] text-center">
              {waveIntro}
            </div>
          )}

          {/* Held under the sand: the claws are empty and the surge is going over. */}
          {burrowed && (
            <div className="absolute top-[58%] left-1/2 -translate-x-1/2 z-30 pointer-events-none w-max bg-[#F6C445] border-2 border-[#17181C] px-4 py-1.5 rounded-xl shadow-[0_4px_0_#17181C] font-game text-xs md:text-sm tracking-widest text-[#17181C] uppercase">
              {t('Dug in · safe, and empty clawed')}
            </div>
          )}

          {/* Short Real Game Input Prompt */}
          {showInputCue && (
            <div className="absolute bottom-[calc(max(1.5rem,env(safe-area-inset-bottom))+5.5rem)] left-1/2 -translate-x-1/2 pointer-events-none w-max bg-[#FDFBF7]/95 border-2 border-[#17181C] px-6 py-2.5 rounded-xl shadow-[0_3px_0_#17181C]">
              <span className="font-game text-sm text-[#17181C] tracking-wider uppercase">
                {isTouch ? t('HOLD HAUL TO LOOT') : t('HOLD [SPACE] TO HAUL')}
              </span>
            </div>
          )}

          {/* Low-Poly Tactile 3D On-Screen Controls */}
          {/* w-max matters. An absolutely positioned row with only `left` set is sized
              against the space left of it, which on a phone is about half the screen,
              wrap onto that and the four controls stack into three rows. w-max sizes
              the row to its contents, and the -translate centres it. */}
          <div className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-30 flex w-max items-center justify-center gap-2 md:gap-4">
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
              className={`px-4 md:px-9 h-14 rounded-xl border-2 border-[#17181C] font-game text-lg tracking-widest flex items-center gap-2 transition-all cursor-pointer ${
                activeKeys.haul
                  ? 'bg-[#F6C445] text-[#17181C] translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#17181C] text-white hover:bg-[#24698F] shadow-[0_5px_0_#0D0E10]'
              }`}
            >
              <span>⚡</span>
              <span>{t('HAUL')}</span>
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
              className={`px-2.5 md:px-3 h-14 rounded-xl border-2 border-[#17181C] font-game text-base tracking-widest flex items-center gap-1 transition-all cursor-pointer ${
                activeKeys.burrow || burrowed
                  ? 'bg-[#F6C445] text-[#17181C] translate-y-[2px] shadow-[0_1px_0_#17181C]'
                  : 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0] shadow-[0_4px_0_#17181C]'
              }`}
            >
              <span>▼</span>
              <span>{t('DIG')}</span>
            </button>
          </div>

          {/* Pause. The game pauses itself when the tab goes away, so this card is
              mostly reached for deliberately, to answer a message mid-run. */}
          {paused && (
            <div className="absolute inset-0 z-50 bg-[#D4E6F4]/75 backdrop-blur-[2px] flex flex-col items-center justify-center pointer-events-auto">
              <span className="font-game text-4xl md:text-5xl text-[#17181C] tracking-widest mb-2">
                {t('PAUSED')}
              </span>
              <span className="text-[10px] md:text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-6 text-center px-6">
                {t('the tide is holding its breath · wave {wave} of {total}', {
                  wave: Math.min(wavesSurvived + 1, SEASON_WAVES),
                  total: SEASON_WAVES
                })}
              </span>
              <button
                onClick={togglePause}
                aria-label={t('Resume playing')}
                className="px-8 py-3.5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#0D0E10] active:translate-y-[2px] active:shadow-[0_1px_0_#0D0E10] transition-all cursor-pointer"
              >
                {t('RESUME')}
              </button>
              <span className="mt-5 text-[10px] font-black text-[#17181C]/45 uppercase tracking-widest text-center px-6">
                {isTouch
                  ? t('switching tabs pauses for you')
                  : t('ESC or P to pause · switching tabs pauses for you')}
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
            // screen, clipping the first card and putting GOT IT out of reach.
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl max-w-sm w-full max-h-[92dvh] overflow-y-auto overscroll-contain p-6 shadow-[0_8px_0_#17181C] relative"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-game text-2xl text-[#17181C] tracking-wide">{t('HOW TO PLAY')}</h3>
              <button
                onClick={() => setShowGuide(false)}
                aria-label={t('Close the guide')}
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
                  <span className="font-game text-sm text-[#17181C] block">{t('MOVE')}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t(isTouch ? 'Hold the ◀ and ▶ buttons to walk the shore.' : 'Hold [A] / [D], the arrow keys, or the buttons on screen.')}
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">02</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">{t('HAUL')}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t(isTouch
                      ? 'Hold the HAUL button to pull in wrack within claw reach. Walk the wrack line to take the far, fatter pieces.'
                      : 'Hold [SPACE] or Click to pull in wrack within claw reach. Walk the wrack line to take the far, fatter pieces.')}
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">03</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">{t('BANK')}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t('Release to deposit score safely.')}
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#E25B45]">04</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">{t("DON'T GET CAUGHT HOLDING")}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t('A surge that hits you while you still hold loot costs a heart ♥. Bank first, wade through with empty claws, or dig in and lose the haul. You can still haul while the water is on the shore, and the surge carries the wrack up the beach with it, so the wave is a window rather than a wall: just expect the water to claw pieces back as you go.')}
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#F6C445]">05</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">{t('DIG IN')}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t(isTouch
                      ? 'Hold the DIG button to bury yourself. The surge rolls over you and costs nothing, but everything in your claws spills onto the sand and the water takes it. You cannot move or haul while you are under.'
                      : 'Hold [B] or [SHIFT], or hold the DIG button, to bury yourself. The surge rolls over you and costs nothing, but everything in your claws spills onto the sand and the water takes it. You cannot move or haul while you are under.')}
                  </span>
                </div>
              </div>

              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20 flex items-start gap-3">
                <span className="font-game text-xl text-[#24698F]">06</span>
                <div>
                  <span className="font-game text-sm text-[#17181C] block">{t('OUTLAST THE SEASON')}</span>
                  <span className="text-xs text-[#17181C]/85 font-bold">
                    {t("Survive all {n} waves, from the Shallows to the Season's End. The calm between surges keeps shrinking as you go. Lose your last heart and the surge takes you.", { n: SEASON_WAVES })}
                  </span>
                </div>
              </div>

              {/* What the shore is worth. Nothing else teaches this, and the model
                  shapes are the only other clue you get. */}
              <div className="bg-[#EAD7B0]/30 p-3 rounded-xl border-2 border-[#17181C]/20">
                <span className="font-game text-sm text-[#17181C] block mb-1.5">
                  {t("WHAT'S WORTH WHAT")}
                </span>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-bold text-[#17181C]/85">
                  <span>
                    {t('AMMONITE')} <b className="text-[#24698F]">320</b>
                  </span>
                  <span>
                    {t('CLAM')} <b className="text-[#24698F]">250</b>
                  </span>
                  <span>
                    {t('BOTTLE')} <b className="text-[#24698F]">180</b>
                  </span>
                  <span>
                    {t('SEA GLASS')} <b className="text-[#24698F]">140</b>
                  </span>
                  <span>
                    {t('DOUBLOON')} <b className="text-[#24698F]">120</b>
                  </span>
                  <span>
                    {t('DRIFTWOOD')} <b className="text-[#24698F]">80</b>
                  </span>
                </div>
                <span className="text-[11px] font-bold text-[#17181C]/70 block mt-1.5">
                  {t('Base values. Your tide multiplies them, and the further up the shore you pull a piece from, the more it pays.')}
                </span>
                <span className="text-[11px] font-bold text-[#17181C] block mt-1">
                  {t('Taken off moving water, while the surge is on the shore: {mult}, and the grab says SURGE. That is the payment for the heart it can cost.', { mult: '1.75x' })}
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
              {t('GOT IT')}
            </button>
          </div>
        </div>
      )}

      {/* 5. LOW-POLY END-OF-RUN SCREEN: the season's result, win or loss */}
      {(appState === 'DEAD' || appState === 'WIN') && (
        <div className="absolute inset-0 bg-[#D4E6F4]/92 backdrop-blur-sm flex flex-col items-center justify-center z-50 pointer-events-auto overflow-y-auto p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] md:p-6">
          <WracklineLogo size="sm" showTitle={false} className="mb-3 md:mb-4" />

          {/* The headline names the cause: survived the season, or caught by a surge */}
          <h2 className={`font-game text-3xl md:text-5xl tracking-wide text-center mb-2 ${endCause === 'SURVIVED' ? 'text-[#24698F]' : 'text-[#17181C]'}`}>
            {endCause === 'SURVIVED' ? t('OUTLASTED THE TIDE') : t('THE SURGE TOOK YOU')}
          </h2>
          <p className="text-[10px] md:text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-5 md:mb-7 text-center">
            {endCause === 'SURVIVED'
              ? t('all {n} waves survived · {tide} tide', {
                  n: SEASON_WAVES,
                  tide: t(selectedDiff.name)
                })
              : t('caught holding loot on wave {wave}', { wave: wavesSurvived + 1 })}
            {runMode === 'DAILY' ? ` · ${t(todayTide.name)}` : ''}
          </p>

          {/* Low-Poly Faceted Scorecard */}
          <div className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl shadow-[0_8px_0_#17181C] w-76 max-w-full flex flex-col items-center p-6 md:p-7 mb-7 md:mb-9">
            <span className="text-xs font-black text-[#17181C]/60 uppercase tracking-widest mb-2">
              {t('FINAL SCORE')}
            </span>
            <span className="font-game text-6xl text-[#24698F] mb-3">{bankedScore}</span>

            {(submitting || onlineRank !== null || deviceRank !== null) && (
              <span className="font-game text-xs tracking-widest text-white bg-[#24698F] border-2 border-[#17181C] px-3.5 py-1 rounded-lg shadow-[0_2px_0_#17181C] mb-3">
                {submitting
                  ? t('FILING YOUR TIDE…')
                  : onlineRank !== null
                    ? t('TIDE RANK #{rank}', { rank: onlineRank })
                    : t('THIS DEVICE #{rank}', { rank: deviceRank ?? 0 })}
              </span>
            )}

            {isNewBest && (
              <span className="font-game text-xs tracking-widest text-[#17181C] bg-[#F6C445] border-2 border-[#17181C] px-3.5 py-1 rounded-lg shadow-[0_2px_0_#17181C] mb-3">
                {t('NEW RECORD!')}
              </span>
            )}

            <div className="w-full pt-4 border-t-2 border-[#17181C]/15 flex justify-between gap-4 text-xs font-bold text-[#17181C]/75">
              <span>{t('BEST: {n}', { n: bestScore })}</span>
              <span>{t('WAVES: {n}', { n: wavesSurvived })}</span>
            </div>
          </div>

          {/* Near-miss framing: how close the last run came is the pull to go again */}
          {endCause === 'SURGE' && !isNewBest && bestScore > bankedScore && (
            <p className="font-game text-sm md:text-base text-[#E25B45] mb-5 md:mb-6">
              {t('{n} TO BEAT YOUR BEST', { n: bestScore - bankedScore })}
            </p>
          )}

          {/* The missions this run just cleared, named so the next visit has a thread
              to pull. The board files the score either way; this is the progress. */}
          {completedMissions.length > 0 && (
            <p className="font-game text-xs md:text-sm text-[#24698F] mb-5 md:mb-6 text-center max-w-sm px-2">
              {t(completedMissions.length > 1 ? 'MISSIONS CLEARED · {list}' : 'MISSION CLEARED · {list}', {
                list: completedMissions
                  .map(id => {
                    const label = todayMissions.find(mission => mission.id === id)?.label ?? id;
                    return t(label);
                  })
                  .join(' · ')
              })}
            </p>
          )}

          {/* Low-Poly Tactile Action Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 md:gap-5">
            {endCause === 'SURVIVED' && (
              <button
                onClick={() => startGame(selectedDiff.name === 'CALM' ? DIFFS.SURF : DIFFS.STORM, runMode)}
                className="px-5 py-3 md:px-7 md:py-3.5 rounded-2xl bg-[#F6C445] hover:bg-[#EAD7B0] text-[#17181C] font-game text-lg md:text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
              >
                {t('HARDER TIDE')}
              </button>
            )}

            <button
              onClick={() => startGame(selectedDiff, runMode)}
              className="px-6 py-3 md:px-8 md:py-3.5 rounded-2xl bg-[#17181C] hover:bg-[#24698F] text-[#FFFDF8] font-game text-lg md:text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#0D0E10] active:translate-y-[2px] active:shadow-[0_1px_0_#0D0E10] transition-all cursor-pointer"
            >
              {t('PLAY AGAIN')}
            </button>

            <button
              onClick={() => setAppState('TITLE')}
              className="px-5 py-3 md:px-6 md:py-3.5 rounded-2xl bg-[#FDFBF7] hover:bg-[#EAD7B0] text-[#17181C] font-game text-lg md:text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              {t('MENU')}
            </button>

            <button
              onClick={() => {
                setBoardTab(runMode === 'DAILY' ? 'daily' : 'season');
                setBoardOpen(true);
              }}
              className="px-5 py-3 md:px-6 md:py-3.5 rounded-2xl bg-[#FDFBF7] hover:bg-[#EAD7B0] text-[#17181C] font-game text-lg md:text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              {t('BOARD')}
            </button>

            <button
              onClick={handleShare}
              aria-label={t('Save a share card of this run')}
              className="px-5 py-3 md:px-6 md:py-3.5 rounded-2xl bg-[#FDFBF7] hover:bg-[#EAD7B0] text-[#17181C] font-game text-lg md:text-xl tracking-wider border-2 border-[#17181C] shadow-[0_5px_0_#17181C] active:translate-y-[2px] active:shadow-[0_1px_0_#17181C] transition-all cursor-pointer"
            >
              {cardState === 'WORKING' ? t('MAKING CARD...') : shareNote || t('SHARE')}
            </button>
          </div>

          {/* Who the card is signed by, so the name is visible before it is asked for. */}
          <p className="mt-4 text-[10px] font-black text-[#17181C]/45 uppercase tracking-widest text-center max-w-xs">
            {playerName ? (
              <>
                {t('the card signs as')}{' '}
                <button
                  onClick={() => {
                    setNameDraft(playerName);
                    setAskName(true);
                  }}
                  aria-label={t('Change the name on your share card')}
                  className="underline decoration-dotted underline-offset-2 cursor-pointer text-[#24698F]"
                >
                  {playerName}
                </button>
              </>
            ) : (
              t('share asks for a name the first time, and keeps it on this device')
            )}
          </p>

          <p className="mt-3 text-[10px] font-black text-[#17181C]/45 uppercase tracking-widest">
            {isTouch ? t('Tap PLAY AGAIN for another run') : t('Press R to go again')}
          </p>
        </div>
      )}

      {/* THE TIDE BOARDS. Two boards behind one endpoint: the season, and today's
          shore. The label under the tabs says which one the rows came from, so a
          score is never shown as world-filed when it is only held on this device. */}
      {boardOpen && (
        <div
          className="absolute inset-0 z-[70] bg-[#17181C]/55 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setBoardOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl w-full max-w-md max-h-[88dvh] flex flex-col shadow-[0_8px_0_#17181C] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-2 border-[#17181C]/10">
              <h3 className="font-game text-xl text-[#17181C] tracking-wide">{t('TIDE BOARDS')}</h3>
              <button
                onClick={() => setBoardOpen(false)}
                aria-label={t('Close the tide boards')}
                className="w-8 h-8 rounded-lg bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] font-bold text-sm text-[#17181C] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 px-4 pt-3">
              {(['season', 'daily'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setBoardTab(tab)}
                  aria-pressed={boardTab === tab}
                  className={`py-2 rounded-xl font-game text-sm tracking-widest border-2 border-[#17181C] transition-all cursor-pointer ${
                    boardTab === tab
                      ? 'bg-[#24698F] text-white shadow-[0_2px_0_#10364C]'
                      : 'bg-white text-[#17181C]/70 hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C]'
                  }`}
                >
                  {tab === 'season' ? t('SEASON') : t("TODAY'S TIDE")}
                </button>
              ))}
            </div>

            <div className="px-4 pt-2.5 pb-1 flex items-center justify-between gap-2">
              <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/55">
                {boardOnline ? t('LIVE · EVERY PLAYER') : t('ON THIS DEVICE')}
              </span>
              <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/40">
                {boardTab === 'daily' ? dayKey : t('BEST RUNS')}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-5">
              {boardLoading && (
                <p className="py-8 text-center font-game text-sm text-[#17181C]/55 tracking-wider">
                  {t('READING THE WRACK…')}
                </p>
              )}

              {!boardLoading && boardEntries.length === 0 && (
                <p className="py-8 text-center font-game text-sm text-[#17181C]/55 tracking-wider leading-relaxed">
                  {t('No runs filed yet.')}
                  <br />
                  {t('Be the first on this shore.')}
                </p>
              )}

              {!boardLoading &&
                boardEntries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-3 px-3 py-2.5 my-1.5 rounded-xl border-2 border-[#17181C] ${
                      entry.isPlayer
                        ? 'bg-[#F6C445]/45 shadow-[0_2px_0_#17181C]'
                        : 'bg-white shadow-[0_2px_0_#17181C]/25'
                    }`}
                  >
                    <span className="font-game text-lg text-[#17181C]/55 w-7 text-right shrink-0">
                      {index + 1}
                    </span>
                    <span className="flex flex-col leading-tight flex-1 min-w-0">
                      <span className="font-game text-sm text-[#17181C] tracking-wider truncate">
                        {entry.name}
                        {entry.isPlayer && (
                          <span className="ml-1.5 text-[8px] font-black tracking-widest text-[#24698F] align-top">
                            {t('YOU')}
                          </span>
                        )}
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/45">
                        {t('wave {wave} · {tide} · {date}', {
                          wave: entry.waves,
                          tide: entry.tide,
                          date: entry.date
                        })}
                      </span>
                    </span>
                    <span className="font-game text-base text-[#24698F] shrink-0">{entry.score}</span>
                  </div>
                ))}

              {!boardLoading && !boardOnline && boardError && (
                <p className="pt-3 text-center text-[9px] font-black uppercase tracking-widest text-[#17181C]/35 leading-relaxed">
                  {t('world board unreachable — showing the best run kept here')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TODAY'S SHORE. The modifier, the streak, the three missions and the shell
          track, all in one place. Everything on it is already saved locally, so it
          reads the same offline as on. */}
      {showDailySheet && (
        <div
          className="absolute inset-0 z-[70] bg-[#17181C]/55 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setShowDailySheet(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl w-full max-w-md max-h-[88dvh] flex flex-col shadow-[0_8px_0_#17181C] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-2 border-[#17181C]/10">
              <h3 className="font-game text-xl text-[#17181C] tracking-wide">{t("TODAY'S SHORE")}</h3>
              <button
                onClick={() => setShowDailySheet(false)}
                aria-label={t("Close today's shore")}
                className="w-8 h-8 rounded-lg bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] font-bold text-sm text-[#17181C] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="rounded-2xl border-2 border-[#17181C] bg-[#24698F] text-white px-4 py-3 shadow-[0_3px_0_#10364C] mb-4">
                <span className="text-[9px] font-black uppercase tracking-widest opacity-75">
                  {t('{date} · resets in {time}', {
                    date: dayKey,
                    time: resetLabel || t('a moment')
                  })}
                </span>
                <p className="font-game text-lg tracking-wider mt-0.5">{t(todayTide.name)}</p>
                <p className="text-[11px] font-bold leading-snug opacity-85 mt-0.5">
                  {t(todayTide.blurb)}
                </p>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/55">
                  {t('MISSIONS · {done}/{total}', {
                    done: dailySave.done.length,
                    total: todayMissions.length
                  })}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/55">
                  {dailySave.streak > 0
                    ? t('{n} DAY STREAK', { n: dailySave.streak })
                    : t('PLAY DAILY TO START A STREAK')}
                </span>
              </div>

              <div className="flex flex-col gap-2 mb-5">
                {missionProgress(dailySave, todayMissions).map(({ mission, value, done }) => {
                  const pct = Math.min(100, Math.round((value / mission.target) * 100));
                  return (
                    <div
                      key={mission.id}
                      className="rounded-xl border-2 border-[#17181C] bg-white px-3 py-2 shadow-[0_2px_0_#17181C]/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-[#17181C] leading-snug">
                          {t(mission.label)}
                        </span>
                        <span
                          className={`text-[9px] font-black uppercase tracking-widest shrink-0 ${
                            done ? 'text-[#24698F]' : 'text-[#17181C]/40'
                          }`}
                        >
                          {done ? t('CLEARED') : `${Math.min(value, mission.target)}/${mission.target}`}
                        </span>
                      </div>
                      <div className="h-1.5 mt-1.5 rounded-full bg-[#17181C]/10 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${done ? 'bg-[#24698F]' : 'bg-[#E8A317]'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/55">
                  {t('SHELLS · {n} SHORE PTS', { n: shorePointTotal })}
                </span>
                <span className="text-[9px] font-black uppercase tracking-widest text-[#17181C]/40">
                  {t('EARNED BY BANKING')}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {SHELLS.map(candidate => {
                  const unlocked = candidate.points <= shorePointTotal;
                  const isSelected = shell.id === candidate.id;
                  const thumb = shellThumbs[candidate.color];
                  return (
                    <button
                      key={candidate.id}
                      disabled={!unlocked}
                      onClick={() => {
                        saveShellId(candidate.id);
                        setShellId(candidate.id);
                      }}
                      aria-pressed={isSelected}
                      className={`rounded-xl border-2 px-1.5 py-2 flex flex-col items-center gap-1 transition-all ${
                        isSelected
                          ? 'border-[#17181C] shadow-[0_2px_0_#17181C] bg-[#F6C445]/35'
                          : 'border-[#17181C]/25 bg-white'
                      } ${unlocked ? 'cursor-pointer hover:bg-[#EAD7B0]/50' : 'opacity-55 cursor-not-allowed'}`}
                    >
                      {/* The creature itself, drawn from the same geometry as the one
                          you play, so the shell you are buying looks like the shell you
                          will wear. The flat disc is only the WebGL-less fallback. */}
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          draggable={false}
                          className={`w-12 h-12 object-contain -my-1 select-none ${
                            unlocked ? '' : 'grayscale'
                          }`}
                        />
                      ) : (
                        <span
                          className="w-9 h-9 rounded-full border-2 border-[#17181C]/70"
                          style={{ backgroundColor: unlocked ? candidate.color : '#C9C4BA' }}
                        />
                      )}
                      <span className="text-[8px] font-black uppercase tracking-wider text-[#17181C] leading-none">
                        {t(candidate.name)}
                      </span>
                      <span className="text-[8px] font-bold text-[#17181C]/45 leading-none">
                        {unlocked
                          ? isSelected
                            ? t('WORN')
                            : t('WEAR')
                          : t('{n} PTS', { n: candidate.points })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS. Sound, language and fullscreen live here rather than on the top
          bar, which keeps that row to the three things a run actually reaches for.
          Everything on this sheet is remembered on this device and nowhere else. */}
      {settingsOpen && (
        <div
          className="absolute inset-0 z-[70] bg-[#17181C]/55 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto"
          onClick={() => setSettingsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl w-full max-w-sm shadow-[0_8px_0_#17181C] overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b-2 border-[#17181C]/10">
              <h3 className="font-game text-xl text-[#17181C] tracking-wide">{t('SETTINGS')}</h3>
              <button
                onClick={() => setSettingsOpen(false)}
                aria-label={t('Close settings')}
                className="w-8 h-8 rounded-lg bg-[#FDFBF7] hover:bg-[#EAD7B0] border-2 border-[#17181C] font-bold text-sm text-[#17181C] flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="px-4 py-4 flex flex-col gap-2.5">
              {/* Sound */}
              <div className="rounded-2xl border-2 border-[#17181C] bg-white px-3.5 py-3 shadow-[0_2px_0_#17181C]/15">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-[#EAD7B0]/60 border-2 border-[#17181C]/15 text-[#17181C] flex items-center justify-center">
                    <IconSound muted={muted} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-game text-sm text-[#17181C] tracking-wider block">
                      {t('SOUND')}
                    </span>
                    <span className="text-[10px] leading-snug font-bold text-[#17181C]/55 block">
                      {t('Waves, clicks and the shore. M toggles it anywhere.')}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                  {[true, false].map(on => {
                    const selected = on ? !muted : muted;
                    return (
                      <button
                        key={String(on)}
                        onClick={() => {
                          // A click is the gesture the browser wants before it will
                          // make a sound, so enabling starts the audio context here.
                          initAudio();
                          setMuted(!on);
                        }}
                        aria-pressed={selected}
                        className={`py-2 rounded-lg font-game text-xs tracking-widest border-2 border-[#17181C] transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#24698F] text-white shadow-[0_2px_0_#10364C]'
                            : 'bg-[#FDFBF7] text-[#17181C]/70 hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C]'
                        }`}
                      >
                        {on ? t('ON') : t('OFF')}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language */}
              <div className="rounded-2xl border-2 border-[#17181C] bg-white px-3.5 py-3 shadow-[0_2px_0_#17181C]/15">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-[#EAD7B0]/60 border-2 border-[#17181C]/15 text-[#17181C] font-game text-xs flex items-center justify-center">
                    EN
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-game text-sm text-[#17181C] tracking-wider block">
                      {t('LANGUAGE')}
                    </span>
                    <span className="text-[10px] leading-snug font-bold text-[#17181C]/55 block">
                      {t('The whole shore, labels and guide.')}
                    </span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                  {LANGUAGES.map(option => (
                    <button
                      key={option.id}
                      onClick={() => setLang(option.id)}
                      aria-pressed={lang === option.id}
                      // The names of languages are not translated: someone looking
                      // for their own language has to be able to read the label.
                      className={`py-2 rounded-lg font-game text-xs tracking-normal border-2 border-[#17181C] transition-all cursor-pointer ${
                        lang === option.id
                          ? 'bg-[#24698F] text-white shadow-[0_2px_0_#10364C]'
                          : 'bg-[#FDFBF7] text-[#17181C]/70 hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C]'
                      }`}
                    >
                      <span
                        // Myanmar letters sit lower than Latin caps at the same px, so
                        // the endonym needs a step up to match "English" beside it.
                        className={option.id === 'my' ? 'text-base leading-none' : undefined}
                        // The label has to be readable from the other language, so it
                        // always uses the Myanmar face even while the game is in English.
                        style={{ fontFamily: "'Aka08-Regular', 'Noto Sans Myanmar', 'Space Grotesk', system-ui, sans-serif" }}
                      >
                        {option.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fullscreen */}
              <div className="rounded-2xl border-2 border-[#17181C] bg-white px-3.5 py-3 shadow-[0_2px_0_#17181C]/15">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-[#EAD7B0]/60 border-2 border-[#17181C]/15 text-[#17181C] flex items-center justify-center">
                    <IconExpand />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-game text-sm text-[#17181C] tracking-wider block">
                      {t('FULLSCREEN')}
                    </span>
                    <span className="text-[10px] leading-snug font-bold text-[#17181C]/55 block">
                      {t('Fill the screen. F toggles it anywhere.')}
                    </span>
                  </span>
                </div>
                <button
                  onClick={toggleFullscreen}
                  // iOS Safari has no element fullscreen on a phone; the row stays
                  // visible but says so rather than failing silently on a tap.
                  disabled={!fullscreenAvailable}
                  className={`mt-2.5 w-full py-2 rounded-lg font-game text-xs tracking-widest border-2 border-[#17181C] transition-all ${
                    fullscreenAvailable
                      ? 'bg-[#FDFBF7] text-[#17181C] hover:bg-[#EAD7B0]/60 shadow-[0_2px_0_#17181C] cursor-pointer'
                      : 'bg-[#EAD7B0]/40 text-[#17181C]/40 shadow-none cursor-not-allowed'
                  }`}
                >
                  {isFullscreen ? t('EXIT FULLSCREEN') : t('ENTER FULLSCREEN')}
                </button>
              </div>

              {/* Source. A jam judge or a curious player should be able to reach the
                  repository in one tap without leaving the game first. */}
              <a
                href="https://github.com/thesithunyein/wrackline"
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border-2 border-[#17181C] bg-white px-3.5 py-3 shadow-[0_2px_0_#17181C]/15 hover:bg-[#EAD7B0]/40 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 shrink-0 rounded-lg bg-[#EAD7B0]/60 border-2 border-[#17181C]/15 text-[#17181C] flex items-center justify-center">
                    <IconExternal />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="font-game text-sm text-[#17181C] tracking-wider block">
                      {t('SOURCE CODE')}
                    </span>
                    <span className="text-[10px] leading-snug font-bold text-[#17181C]/55 block">
                      {t('The whole game, on GitHub.')}
                    </span>
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#17181C]/40">
                    {t('OPEN')}
                  </span>
                </div>
              </a>

              <p className="text-center text-[9px] font-black uppercase tracking-widest text-[#17181C]/35 leading-relaxed pt-0.5">
                {t('Sound and language are saved on this device.')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* The name prompt comes before the card, not after it: the card is signed, so
          asking afterwards would mean drawing it twice. */}
      {askName && (
        <div className="absolute inset-0 z-[60] bg-[#17181C]/50 backdrop-blur-xs flex items-center justify-center p-4 pointer-events-auto">
          <form
            onSubmit={submitName}
            className="bg-[#FDFBF7] border-3 border-[#17181C] rounded-3xl max-w-sm w-full p-6 shadow-[0_8px_0_#17181C]"
          >
            <h3 className="font-game text-2xl text-[#17181C] tracking-wide mb-2">
              {t('WHO IS HAULING?')}
            </h3>
            <p className="text-xs font-bold text-[#17181C]/70 mb-4">
              {t('Your name goes on the card. It stays on this device, like your best score: no account, no server.')}
            </p>
            <input
              autoFocus
              value={nameDraft}
              onChange={e => setNameDraft(e.target.value)}
              maxLength={16}
              placeholder={t('SCUTTLER')}
              aria-label={t('Name to sign your share card with')}
              className="w-full px-4 py-3 rounded-xl bg-[#EAD7B0]/40 border-2 border-[#17181C] font-game text-lg tracking-widest uppercase text-[#17181C] placeholder:text-[#17181C]/35 mb-4"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-[#24698F] hover:bg-[#1B5575] text-white font-game text-base tracking-wider border-2 border-[#17181C] shadow-[0_4px_0_#17181C] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer mb-2"
            >
              {t('MAKE MY CARD')}
            </button>
            <button
              type="button"
              onClick={() => setAskName(false)}
              className="w-full py-2.5 rounded-xl bg-[#FDFBF7] hover:bg-[#EAD7B0] text-[#17181C] font-game text-sm tracking-wider border-2 border-[#17181C] shadow-[0_3px_0_#17181C] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer"
            >
              {t('NOT NOW')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
