import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  MAX_BOARD_ENTRIES,
  formatRunDate,
  sortLeaderboard,
  type BoardEntry,
  type ValidRun
} from '../src/game/leaderboardCore.ts';

/**
 * Server-side board stores.
 *
 * An online board must never live in a module-level array: serverless functions
 * and dev servers both restart, and an array silently resets the board. If no
 * durable store is configured the API reports `storage: 'unavailable'` and the
 * client stays on the on-device board instead of pretending to be online.
 */

export interface StoredRun {
  playerId?: string;
  runId: string;
  name: string;
  score: number;
  waves: number;
  tide: string;
  savedAt: number;
}

export interface SubmitResult {
  record: BoardEntry;
  rank: number;
  duplicate: boolean;
  /** True when this submission replaced the player's row on the board. */
  improved: boolean;
  entries: BoardEntry[];
  totalPlayers: number;
}

function playerKey(run: { playerId?: string; runId: string }): string {
  return run.playerId && run.playerId.length > 0 ? run.playerId : run.runId;
}

export interface LeaderboardStore {
  readonly durable: boolean;
  readonly description: string;
  submit(board: string, run: ValidRun): Promise<SubmitResult>;
  /** Updates the display name on a player's existing row; never adds a row. */
  rename(board: string, playerId: string, name: string): Promise<BoardEntry[]>;
  list(board: string, limit?: number): Promise<BoardEntry[]>;
  /** Sliding window limiter; returns false when the caller is over budget. */
  consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}

function toEntry(run: StoredRun, now = Date.now()): BoardEntry {
  return {
    id: run.runId,
    name: run.name,
    score: run.score,
    waves: run.waves,
    tide: run.tide,
    playerId: run.playerId,
    date: formatRunDate(run.savedAt, now),
    isPlayer: false
  };
}

function buildResult(
  runs: StoredRun[],
  key: string,
  duplicate: boolean,
  improved: boolean
): SubmitResult {
  const sorted = sortLeaderboard(runs);
  const now = Date.now();
  const rank = sorted.findIndex(run => playerKey(run) === key) + 1;
  const entries = sorted.slice(0, MAX_BOARD_ENTRIES).map(run => toEntry(run, now));
  const record = sorted.find(run => playerKey(run) === key);
  if (!record) throw new Error(`Player ${key} is missing after insert`);

  return {
    record: toEntry(record, now),
    rank,
    duplicate,
    improved,
    entries,
    totalPlayers: sorted.length
  };
}

function isStoredRun(value: unknown): value is StoredRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.runId === 'string' &&
    run.runId.length > 0 &&
    (run.playerId === undefined || typeof run.playerId === 'string') &&
    typeof run.name === 'string' &&
    typeof run.score === 'number' &&
    typeof run.waves === 'number' &&
    typeof run.tide === 'string' &&
    typeof run.savedAt === 'number'
  );
}

/**
 * File-backed store for local runs. Survives restarts, so a dev server shows
 * real persistence instead of an array that empties when it reloads.
 */
export class FileLeaderboardStore implements LeaderboardStore {
  readonly durable = true;
  readonly description: string;
  private boards = new Map<string, Map<string, StoredRun>>();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();
  private rateBuckets = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly filePath: string) {
    this.description = `file:${path.basename(filePath)}`;
  }

  private board(name: string): Map<string, StoredRun> {
    let runs = this.boards.get(name);
    if (!runs) {
      runs = new Map();
      this.boards.set(name, runs);
    }
    return runs;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);
      const boards = (parsed as { boards?: unknown })?.boards;
      if (boards && typeof boards === 'object') {
        for (const [name, rows] of Object.entries(boards as Record<string, unknown>)) {
          if (!Array.isArray(rows)) continue;
          const bucket = this.board(name);
          for (const run of rows) {
            if (isStoredRun(run)) bucket.set(playerKey(run), run);
          }
        }
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    const boards: Record<string, StoredRun[]> = {};
    for (const [name, runs] of this.boards) boards[name] = [...runs.values()];
    const payload = JSON.stringify({ boards }, null, 2);
    // Serialize writes so two near-simultaneous submissions cannot interleave.
    this.writeChain = this.writeChain.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmpPath = `${this.filePath}.tmp`;
      await fs.writeFile(tmpPath, payload, 'utf8');
      await fs.rename(tmpPath, this.filePath);
    });
    await this.writeChain;
  }

  async submit(board: string, run: ValidRun): Promise<SubmitResult> {
    await this.ensureLoaded();
    const runs = this.board(board);
    const key = playerKey(run);
    const existing = runs.get(key);

    // A retried runId is idempotent, and a worse run never overwrites a better
    // one, so the board holds one row per player: their best tide.
    if (existing && (existing.runId === run.runId || existing.score >= run.score)) {
      return buildResult([...runs.values()], key, existing.runId === run.runId, false);
    }

    runs.set(key, {
      playerId: run.playerId,
      runId: run.runId,
      name: run.name,
      score: run.score,
      waves: run.waves,
      tide: run.tide,
      savedAt: Date.now()
    });
    await this.persist();
    return buildResult([...runs.values()], key, false, true);
  }

  async rename(board: string, playerId: string, name: string): Promise<BoardEntry[]> {
    await this.ensureLoaded();
    const runs = this.board(board);
    const existing = runs.get(playerId);
    if (existing && existing.name !== name) {
      runs.set(playerId, { ...existing, name });
      await this.persist();
    }
    return this.list(board);
  }

  async list(board: string, limit: number = MAX_BOARD_ENTRIES): Promise<BoardEntry[]> {
    await this.ensureLoaded();
    const now = Date.now();
    return sortLeaderboard([...this.board(board).values()])
      .slice(0, limit)
      .map(run => toEntry(run, now));
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const now = Date.now();
    const bucket = this.rateBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.rateBuckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }
}

interface UpstashResponse {
  result?: unknown;
  error?: string;
}

/**
 * Upstash-compatible Redis REST store (also used by Vercel KV). No SDK and no
 * dependencies: rows live in one hash per board, keyed by playerId, so an
 * improved score replaces that player's row and the board survives cold starts.
 */
export class RedisRestLeaderboardStore implements LeaderboardStore {
  readonly durable = true;
  readonly description = 'redis-rest';
  private readonly prefix = 'wrackline:leaderboard';

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private boardKey(board: string): string {
    return `${this.prefix}:${board}`;
  }

  private async command(args: (string | number)[]): Promise<unknown> {
    const res = await this.fetchImpl(this.url.replace(/\/$/, ''), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(args)
    });
    if (!res.ok) {
      throw new Error(`Leaderboard storage request failed with HTTP ${res.status}`);
    }
    const data = (await res.json()) as UpstashResponse;
    if (data.error) throw new Error(data.error);
    return data.result;
  }

  private parseHashResponse(raw: unknown): Map<string, StoredRun> {
    const runs = new Map<string, StoredRun>();
    if (!Array.isArray(raw)) return runs;
    for (let i = 0; i < raw.length; i += 2) {
      const value = raw[i + 1];
      if (typeof value !== 'string') continue;
      try {
        const parsed: unknown = JSON.parse(value);
        if (isStoredRun(parsed)) runs.set(playerKey(parsed), parsed);
      } catch {}
    }
    return runs;
  }

  private async readAll(board: string): Promise<StoredRun[]> {
    return [...this.parseHashResponse(await this.command(['HGETALL', this.boardKey(board)])).values()];
  }

  async submit(board: string, run: ValidRun): Promise<SubmitResult> {
    const stored: StoredRun = {
      playerId: run.playerId,
      runId: run.runId,
      name: run.name,
      score: run.score,
      waves: run.waves,
      tide: run.tide,
      savedAt: Date.now()
    };

    // Read the player's current row first: the board keeps one row per player
    // holding their best score, and a retried runId must not add a second row.
    const current = await this.command(['HGET', this.boardKey(board), run.playerId]);
    if (typeof current === 'string') {
      try {
        const existing: unknown = JSON.parse(current);
        if (isStoredRun(existing) && (existing.runId === run.runId || existing.score >= run.score)) {
          return buildResult(await this.readAll(board), run.playerId, existing.runId === run.runId, false);
        }
      } catch {}
    }

    await this.command(['HSET', this.boardKey(board), run.playerId, JSON.stringify(stored)]);
    return buildResult(await this.readAll(board), run.playerId, false, true);
  }

  async rename(board: string, playerId: string, name: string): Promise<BoardEntry[]> {
    const current = await this.command(['HGET', this.boardKey(board), playerId]);
    if (typeof current === 'string') {
      try {
        const existing: unknown = JSON.parse(current);
        if (isStoredRun(existing) && existing.name !== name) {
          await this.command([
            'HSET',
            this.boardKey(board),
            playerId,
            JSON.stringify({ ...existing, name })
          ]);
        }
      } catch {}
    }
    return this.list(board);
  }

  async list(board: string, limit: number = MAX_BOARD_ENTRIES): Promise<BoardEntry[]> {
    const now = Date.now();
    return sortLeaderboard(await this.readAll(board))
      .slice(0, limit)
      .map(run => toEntry(run, now));
  }

  async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    const bucketKey = `wrackline:ratelimit:${key}`;
    const count = await this.command(['INCR', bucketKey]);
    if (typeof count !== 'number') return true;
    if (count === 1) {
      await this.command(['EXPIRE', bucketKey, windowSeconds]);
    }
    return count <= limit;
  }
}

/** Returns a durable store only when its credentials are fully configured. */
export function createUpstashStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env
): LeaderboardStore | null {
  const pairs: Array<[string | undefined, string | undefined]> = [
    [env.LEADERBOARD_KV_REST_URL, env.LEADERBOARD_KV_REST_TOKEN],
    [env.KV_REST_API_URL, env.KV_REST_API_TOKEN],
    [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN]
  ];
  for (const [url, token] of pairs) {
    if (url && token) return new RedisRestLeaderboardStore(url, token);
  }
  return null;
}
