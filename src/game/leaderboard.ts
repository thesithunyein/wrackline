import {
  MAX_BOARD_ENTRIES,
  formatRunDate,
  generatePlayerName,
  isRenderableEntry,
  isValidPlayerId,
  sanitizePlayerName,
  sortLeaderboard,
  type BoardEntry,
  type BoardId,
  type ValidRun
} from './leaderboardCore.ts';

/**
 * Client side of the tide boards.
 *
 * The on-device board always works. The online board is used only when the
 * endpoint reports durable storage; otherwise the UI says "on this device"
 * instead of pretending a server is holding the score.
 */

export const LOCAL_BOARD_KEY = 'wrackline_board_v1';
export const PLAYER_NAME_KEY = 'wrackline_name';
export const PLAYER_ID_KEY = 'wrackline_player_id';
const REQUEST_TIMEOUT_MS = 6000;

export function isLeaderboardApiConfigured(): boolean {
  try {
    return import.meta.env.VITE_LEADERBOARD_API !== 'false';
  } catch {
    return false;
  }
}

export function createRunId(): string {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One stable id per browser, so improving a score replaces a row, not adds one. */
export function getPlayerId(): string {
  try {
    const stored = localStorage.getItem(PLAYER_ID_KEY);
    if (isValidPlayerId(stored)) return stored;
  } catch {}
  const created = createRunId();
  try {
    localStorage.setItem(PLAYER_ID_KEY, created);
  } catch {}
  return created;
}

export function loadPlayerName(): string {
  try {
    const stored = localStorage.getItem(PLAYER_NAME_KEY);
    if (stored) return sanitizePlayerName(stored);
  } catch {}
  return '';
}

export function savePlayerName(raw: unknown): string {
  const name = sanitizePlayerName(raw);
  try {
    localStorage.setItem(PLAYER_NAME_KEY, name);
  } catch {}
  return name;
}

/** A board name that already exists on the device, or a fresh one to pin on it. */
export function ensurePlayerName(): string {
  const existing = loadPlayerName();
  return existing || savePlayerName(generatePlayerName());
}

interface StoredRun extends BoardEntry {
  addedAt: number;
}

function readStoredRuns(): StoredRun[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LOCAL_BOARD_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(isRenderableEntry).map(entry => ({
      ...entry,
      isPlayer: true,
      addedAt:
        typeof (entry as StoredRun).addedAt === 'number' ? (entry as StoredRun).addedAt : now
    }));
  } catch {
    return [];
  }
}

function toBoardRows(runs: StoredRun[]): BoardEntry[] {
  const now = Date.now();
  const byPlayer = new Map<string, StoredRun>();
  for (const run of runs) byPlayer.set(run.playerId || run.id, run);
  return sortLeaderboard([...byPlayer.values()])
    .slice(0, MAX_BOARD_ENTRIES)
    .map(entry => ({
      id: entry.id,
      name: entry.name,
      score: entry.score,
      waves: entry.waves,
      tide: entry.tide,
      playerId: entry.playerId,
      date: formatRunDate(entry.addedAt, now),
      isPlayer: true
    }));
}

/** Persists one run on this device, keeping only this player's best. */
export function saveLocalRun(run: ValidRun): { entries: BoardEntry[]; rank: number } {
  const stored = readStoredRuns();
  const key = run.playerId;
  const existing = stored.find(entry => (entry.playerId || entry.id) === key);

  if (!existing || existing.score < run.score) {
    const kept = stored.filter(entry => (entry.playerId || entry.id) !== key);
    kept.push({
      id: run.runId,
      name: run.name,
      score: run.score,
      waves: run.waves,
      tide: run.tide,
      playerId: run.playerId,
      date: 'Just now',
      isPlayer: true,
      addedAt: Date.now()
    });
    try {
      localStorage.setItem(LOCAL_BOARD_KEY, JSON.stringify(kept));
    } catch {}
    const rows = toBoardRows(kept);
    return { entries: rows, rank: rows.findIndex(entry => entry.id === run.runId) + 1 };
  }

  return { entries: toBoardRows(stored), rank: 0 };
}

export function loadLocalBoard(): BoardEntry[] {
  return toBoardRows(readStoredRuns());
}

export function markPlayerEntry(entries: BoardEntry[], playerId: string | null): BoardEntry[] {
  return entries.map(entry => ({ ...entry, isPlayer: entry.playerId === playerId }));
}

function sanitizeOnlineEntries(rawEntries: unknown): BoardEntry[] {
  if (!Array.isArray(rawEntries)) return [];
  return rawEntries
    .filter(isRenderableEntry)
    .slice(0, MAX_BOARD_ENTRIES)
    .map(entry => ({
      id: entry.id,
      name: entry.name,
      score: entry.score,
      waves: entry.waves,
      tide: typeof entry.tide === 'string' ? entry.tide : 'SURF',
      playerId: typeof entry.playerId === 'string' ? entry.playerId : undefined,
      date: typeof entry.date === 'string' ? entry.date : 'Earlier',
      isPlayer: false
    }));
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface OnlineBoardResult {
  online: boolean;
  entries: BoardEntry[];
  error?: string;
}

/** Probes the endpoint before the board is labelled online. */
export async function fetchBoard(board: BoardId): Promise<OnlineBoardResult> {
  if (!isLeaderboardApiConfigured()) return { online: false, entries: [], error: 'Disabled in this build' };
  try {
    const res = await fetchWithTimeout(`/api/leaderboard?board=${board}`, {
      headers: { Accept: 'application/json' }
    });
    if (!res.ok) return { online: false, entries: [], error: `HTTP ${res.status}` };
    const data = (await res.json()) as { storage?: unknown; entries?: unknown };
    if (data?.storage !== 'durable') {
      return { online: false, entries: [], error: 'Online storage is not durable' };
    }
    return { online: true, entries: sanitizeOnlineEntries(data.entries) };
  } catch (error) {
    return { online: false, entries: [], error: error instanceof Error ? error.message : 'Network error' };
  }
}

/** Best-effort rename of an existing row; a failure is silent by design. */
export async function syncPlayerName(playerId: string, name: string): Promise<boolean> {
  if (!isLeaderboardApiConfigured()) return false;
  try {
    const res = await fetchWithTimeout('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ action: 'rename', playerId, name })
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type OnlineSubmitResult =
  | { ok: true; rank: number; entries: BoardEntry[]; duplicate: boolean; improved: boolean }
  | { ok: false; error: string };

/** Sends one run. The server is idempotent on runId, so a retry is safe. */
export async function submitRun(board: BoardId, run: ValidRun): Promise<OnlineSubmitResult> {
  if (!isLeaderboardApiConfigured()) return { ok: false, error: 'Disabled in this build' };
  try {
    const res = await fetchWithTimeout('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...run, board })
    });
    const data = (await res.json().catch(() => null)) as
      | {
          rank?: unknown;
          entries?: unknown;
          duplicate?: unknown;
          improved?: unknown;
          error?: unknown;
          storage?: unknown;
        }
      | null;

    if (!res.ok || !data) {
      const message = typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
      return { ok: false, error: message };
    }
    if (data.storage !== 'durable' || typeof data.rank !== 'number' || !Number.isInteger(data.rank)) {
      return { ok: false, error: 'Server did not return a persisted rank' };
    }
    return {
      ok: true,
      rank: data.rank,
      entries: sanitizeOnlineEntries(data.entries),
      duplicate: data.duplicate === true,
      improved: data.improved !== false
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}
