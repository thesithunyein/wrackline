import { daysBetweenKeys, mmtDayKey } from './clock.ts';

/**
 * Everything that gives a reason to come back tomorrow.
 *
 * The daily tide is the anchor: one modifier, seeded from the Myanmar calendar
 * date, identical for every player, so the daily board compares runs played
 * under the same rules. Missions and shore points ride on top of it, and both
 * are pure functions of the run summary so they can be tested without a browser.
 */

export interface TideMod {
  id: string;
  name: string;
  blurb: string;
  /** Multiplier on every piece's value. */
  lootValue: number;
  /** Added to the number of pieces that land each wave (clamped below). */
  lootCount: number;
  /** Multiplier on the low-tide window. */
  lowTide: number;
  /** Multiplier on the warning before a surge. */
  warning: number;
  /** Multiplier on the chance a King Tide rolls. */
  kingOdds: number;
}

export const SEASON_MOD: TideMod = {
  id: 'SEASON',
  name: 'OPEN SEASON',
  blurb: 'The shore as it always is.',
  lootValue: 1,
  lootCount: 0,
  lowTide: 1,
  warning: 1,
  kingOdds: 1
};

export const DAILY_TIDES: TideMod[] = [
  {
    id: 'RICH_WRACK',
    name: 'RICH WRACK',
    blurb: 'Every piece on the sand pays 1.4x.',
    lootValue: 1.4,
    lootCount: 0,
    lowTide: 1,
    warning: 1,
    kingOdds: 1
  },
  {
    id: 'THIN_SHORE',
    name: 'THIN SHORE',
    blurb: 'Fewer pieces land, and each one pays double.',
    lootValue: 2,
    lootCount: -2,
    lowTide: 1,
    warning: 1,
    kingOdds: 1
  },
  {
    id: 'LONG_DRAW',
    name: 'LONG DRAW',
    blurb: 'The low tide holds 30% longer. More time, more greed.',
    lootValue: 1,
    lootCount: 0,
    lowTide: 1.3,
    warning: 1,
    kingOdds: 1
  },
  {
    id: 'KING_SEASON',
    name: 'KING SEASON',
    blurb: 'King Tides roll twice as often.',
    lootValue: 1,
    lootCount: 0,
    lowTide: 1,
    warning: 1,
    kingOdds: 2
  },
  {
    id: 'SHORT_FUSE',
    name: 'SHORT FUSE',
    blurb: 'The sea draws back for a quarter less time before the surge.',
    lootValue: 1,
    lootCount: 0,
    lowTide: 1,
    warning: 0.75,
    kingOdds: 1
  }
];

/** FNV-1a, so a day key maps to the same number in every browser and on the server. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Small deterministic PRNG; the same seed always yields the same tide. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyTideFor(day: string): TideMod {
  return DAILY_TIDES[hashString(`${day}:tide`) % DAILY_TIDES.length];
}

/** Seed for the run's own randomness, so everyone's daily shore lands the same. */
export function dailySeed(day: string): number {
  return hashString(`${day}:shore`);
}

export type MissionMetric =
  | 'score'
  | 'waves'
  | 'surgeGrabs'
  | 'kingBanks'
  | 'itemsHauled'
  | 'season';

export interface MissionDef {
  id: string;
  label: string;
  metric: MissionMetric;
  target: number;
}

export const MISSION_POOL: MissionDef[] = [
  { id: 'BANK_2000', label: 'Bank 2,000 in a single tide', metric: 'score', target: 2000 },
  { id: 'REACH_7', label: 'Reach wave 7', metric: 'waves', target: 7 },
  { id: 'SURGE_4', label: 'Take 4 pieces off the surge', metric: 'surgeGrabs', target: 4 },
  { id: 'KING_2', label: 'Bank during 2 King Tides', metric: 'kingBanks', target: 2 },
  { id: 'OUTLAST', label: 'Outlast the whole season', metric: 'season', target: 1 },
  { id: 'FULL_CLAWS', label: 'Haul 30 pieces in a single tide', metric: 'itemsHauled', target: 30 }
];

/** Three distinct missions, stable for a given day. */
export function dailyMissionsFor(day: string): MissionDef[] {
  const random = mulberry32(hashString(`${day}:missions`));
  const pool = [...MISSION_POOL];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export interface RunSummary {
  score: number;
  waves: number;
  survived: boolean;
  surgeGrabs: number;
  kingBanks: number;
  itemsHauled: number;
  dug: boolean;
}

export interface DailySave {
  /** The MMT day this progress belongs to. */
  day: string;
  streak: number;
  /** Last day a daily tide was finished, so a skipped day breaks the streak. */
  lastDailyDay: string | null;
  /** Best value of each mission metric today. */
  best: Record<string, number>;
  /** Mission ids completed today. */
  done: string[];
  lifetimeBanked: number;
  missionsDone: number;
  seasons: number;
}

export const DAILY_KEY = 'wrackline_daily_v1';
export const SHELL_KEY = 'wrackline_shell';

export function emptyDailySave(day: string): DailySave {
  return {
    day,
    streak: 0,
    lastDailyDay: null,
    best: {},
    done: [],
    lifetimeBanked: 0,
    missionsDone: 0,
    seasons: 0
  };
}

/** Rolls stored progress onto a new day, keeping streaks and lifetime totals. */
export function normalizeDailySave(save: DailySave | null, day: string): DailySave {
  if (!save) return emptyDailySave(day);
  if (save.day === day) return save;
  return { ...save, day, best: {}, done: [] };
}

function metricValue(metric: MissionMetric, summary: RunSummary): number {
  switch (metric) {
    case 'score':
      return summary.score;
    case 'waves':
      return summary.waves;
    case 'surgeGrabs':
      return summary.surgeGrabs;
    case 'kingBanks':
      return summary.kingBanks;
    case 'itemsHauled':
      return summary.itemsHauled;
    case 'season':
      return summary.survived ? 1 : 0;
    default:
      return 0;
  }
}

/**
 * Folds one finished run into today's progress.
 *
 * Every metric is a per-run best rather than a running total: a mission says
 * "bank 2,000 in a single tide", so two runs of 1,200 each must not complete it.
 * Returns the mission ids this run just finished, for the end screen to name.
 */
export function applyRun(
  save: DailySave,
  day: string,
  summary: RunSummary,
  missions: MissionDef[],
  daily = true
): { save: DailySave; completed: string[] } {
  const today = normalizeDailySave(save, day);
  const best = { ...today.best };
  const done = [...today.done];
  const completed: string[] = [];

  for (const mission of missions) {
    if (done.includes(mission.id)) continue;
    const value = metricValue(mission.metric, summary);
    best[mission.id] = Math.max(best[mission.id] ?? 0, value);
    if (best[mission.id] >= mission.target) {
      done.push(mission.id);
      completed.push(mission.id);
    }
  }

  // Only a daily tide moves the streak; a season run still counts toward the
  // missions, it just does not prove you showed up for today's shore.
  let streak = today.streak;
  let lastDailyDay = today.lastDailyDay;
  if (daily && lastDailyDay !== day) {
    streak = lastDailyDay && daysBetweenKeys(lastDailyDay, day) === 1 ? streak + 1 : 1;
    lastDailyDay = day;
  }

  return {
    save: {
      ...today,
      day,
      streak,
      lastDailyDay,
      best,
      done,
      lifetimeBanked: today.lifetimeBanked + Math.max(0, summary.score),
      missionsDone: today.missionsDone + completed.length,
      seasons: today.seasons + (summary.survived ? 1 : 0)
    },
    completed
  };
}

/** Progress toward each mission as 0..1, for the title card bars. */
export function missionProgress(
  save: DailySave,
  missions: MissionDef[]
): { mission: MissionDef; value: number; done: boolean }[] {
  return missions.map(mission => {
    const value = save.done.includes(mission.id) ? mission.target : save.best[mission.id] ?? 0;
    return { mission, value, done: save.done.includes(mission.id) };
  });
}

export function shorePoints(save: DailySave): number {
  return Math.floor(save.lifetimeBanked / 100) + save.missionsDone * 25 + save.seasons * 100;
}

export interface Shell {
  id: string;
  name: string;
  color: string;
  points: number;
}

export const SHELLS: Shell[] = [
  { id: 'TIDEGLASS', name: 'TIDE GLASS', color: '#2278A6', points: 0 },
  { id: 'EMBER', name: 'EMBER', color: '#C4622D', points: 250 },
  { id: 'BONE', name: 'BONE', color: '#E4DCC8', points: 900 },
  { id: 'ABYSS', name: 'ABYSS', color: '#2B2F45', points: 2400 }
];

export function unlockedShells(points: number): Shell[] {
  return SHELLS.filter(shell => shell.points <= points);
}

export function resolveShell(points: number, wanted: string | null): Shell {
  const unlocked = unlockedShells(points);
  return unlocked.find(shell => shell.id === wanted) ?? SHELLS[0];
}

export function loadDailySave(now: number = Date.now()): DailySave {
  const day = mmtDayKey(now);
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return emptyDailySave(day);
    const parsed = JSON.parse(raw) as DailySave;
    if (!parsed || typeof parsed !== 'object' || typeof parsed.day !== 'string') {
      return emptyDailySave(day);
    }
    return normalizeDailySave(parsed, day);
  } catch {
    return emptyDailySave(day);
  }
}

export function saveDailySave(save: DailySave): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(save));
  } catch {}
}

export function loadShellId(): string | null {
  try {
    return localStorage.getItem(SHELL_KEY);
  } catch {
    return null;
  }
}

export function saveShellId(id: string): void {
  try {
    localStorage.setItem(SHELL_KEY, id);
  } catch {}
}
