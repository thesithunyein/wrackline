/**
 * Shared, platform-free rules for the tide boards.
 *
 * Imported by the React client, the dev file store and the serverless endpoint so
 * all three agree on what a valid run is. Nothing here touches the DOM, storage
 * or the network.
 */

export interface BoardEntry {
  id: string;
  name: string;
  score: number;
  waves: number;
  tide: string;
  playerId?: string;
  serverDate?: string;
  date: string;
  isPlayer?: boolean;
}

/** Hard ceiling for a single tide, well above any legitimate run. */
export const MAX_LEADERBOARD_SCORE = 2_000_000;
/** Above this a submission must carry the run duration it was set in. */
export const PLAUSIBILITY_SCORE_THRESHOLD = 20_000;
/** The fastest a season can physically pay out, per second of play. */
export const MAX_SCORE_PER_SECOND = 6_000;
export const MIN_RUN_DURATION_MS = 8_000;
export const MAX_RUN_DURATION_MS = 30 * 60_000;
export const MAX_SEASON_WAVES = 13;
export const MAX_PLAYER_NAME_LENGTH = 16;
export const MAX_BOARD_ENTRIES = 20;
export const DEFAULT_PLAYER_NAME = 'SCUTTLER';

export const TIDE_IDS = ['CALM', 'SURF', 'STORM'] as const;
export type TideId = (typeof TIDE_IDS)[number];

/** The two boards the game ships with. */
export const BOARD_IDS = ['season', 'daily'] as const;
export type BoardId = (typeof BOARD_IDS)[number];

export interface ValidRun {
  playerId: string;
  runId: string;
  name: string;
  score: number;
  waves: number;
  tide: string;
  /** Run length in milliseconds; required above the plausibility threshold. */
  durationMs?: number;
}

export type RunValidation = { ok: true; run: ValidRun } | { ok: false; error: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidPlayerId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isValidRunId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

export function isBoardId(value: unknown): value is BoardId {
  return typeof value === 'string' && (BOARD_IDS as readonly string[]).includes(value);
}

export function isTideId(value: unknown): value is TideId {
  return typeof value === 'string' && (TIDE_IDS as readonly string[]).includes(value);
}

// Names a first-time player is given, so nobody is asked to type anything before
// their first score counts.
export const PLAYER_NAME_PREFIXES = [
  'SALT',
  'BRINE',
  'TIDE',
  'REEF',
  'DRIFT',
  'KELP',
  'STORM',
  'LOW',
  'DEEP',
  'WRACK'
] as const;
export const PLAYER_NAME_NOUNS = [
  'CRAB',
  'GULL',
  'CLAW',
  'SHELL',
  'SCUTTLE',
  'PIPER',
  'NIPPER',
  'DRIFTER',
  'SANDER',
  'HULK'
] as const;

export function generatePlayerName(random: () => number = Math.random): string {
  const pick = <T>(list: readonly T[]): T => {
    const index = Math.floor(random() * list.length);
    return list[Math.min(list.length - 1, Math.max(0, index))];
  };
  const number = 10 + Math.floor(random() * 90);
  return sanitizePlayerName(`${pick(PLAYER_NAME_PREFIXES)}_${pick(PLAYER_NAME_NOUNS)}${number}`);
}

/** Strips control characters, collapses whitespace and enforces the length cap. */
export function sanitizePlayerName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_PLAYER_NAME;
  const cleaned = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PLAYER_NAME_LENGTH);
  return cleaned || DEFAULT_PLAYER_NAME;
}

/**
 * Validates a submission. Scores must be whole and in range, waves within the
 * season, the tide a real one, and big scores have to be possible in the time
 * they claim to have taken.
 */
export function validateRunPayload(raw: unknown): RunValidation {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Run payload is required' };
  const body = raw as Record<string, unknown>;

  if (!isValidPlayerId(body.playerId)) {
    return { ok: false, error: 'playerId must be 8-64 URL-safe characters' };
  }
  if (!isValidRunId(body.runId)) {
    return { ok: false, error: 'runId must be 8-64 URL-safe characters' };
  }

  const score = body.score;
  if (
    typeof score !== 'number' ||
    !Number.isFinite(score) ||
    !Number.isInteger(score) ||
    score <= 0 ||
    score > MAX_LEADERBOARD_SCORE
  ) {
    return {
      ok: false,
      error: `score must be a whole number between 1 and ${MAX_LEADERBOARD_SCORE.toLocaleString('en-US')}`
    };
  }

  const waves = body.waves;
  if (
    typeof waves !== 'number' ||
    !Number.isInteger(waves) ||
    waves < 0 ||
    waves > MAX_SEASON_WAVES
  ) {
    return { ok: false, error: `waves must be a whole number between 0 and ${MAX_SEASON_WAVES}` };
  }

  if (!isTideId(body.tide)) {
    return { ok: false, error: 'tide must be CALM, SURF or STORM' };
  }

  let durationMs: number | undefined;
  if (score > PLAUSIBILITY_SCORE_THRESHOLD) {
    const claimed = body.durationMs;
    if (
      typeof claimed !== 'number' ||
      !Number.isFinite(claimed) ||
      !Number.isInteger(claimed) ||
      claimed < MIN_RUN_DURATION_MS ||
      claimed > MAX_RUN_DURATION_MS
    ) {
      return {
        ok: false,
        error: `a score above ${PLAUSIBILITY_SCORE_THRESHOLD.toLocaleString('en-US')} needs the run duration in milliseconds`
      };
    }
    if (score > (claimed / 1000) * MAX_SCORE_PER_SECOND) {
      return { ok: false, error: 'score is not possible in the reported run time' };
    }
    durationMs = claimed;
  } else if (
    typeof body.durationMs === 'number' &&
    Number.isInteger(body.durationMs) &&
    body.durationMs > 0
  ) {
    durationMs = body.durationMs;
  }

  return {
    ok: true,
    run: {
      playerId: body.playerId,
      runId: body.runId,
      name: sanitizePlayerName(body.name),
      score,
      waves,
      tide: body.tide,
      ...(durationMs === undefined ? {} : { durationMs })
    }
  };
}

export function rankOfRun(entries: readonly { id: string }[], runId: string): number {
  const index = entries.findIndex(entry => entry.id === runId);
  return index === -1 ? 0 : index + 1;
}

/** Sorts by score, then by how deep into the season the run got. */
export function sortLeaderboard<T extends { score: number; waves: number }>(entries: T[]): T[] {
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        b.entry.score - a.entry.score || b.entry.waves - a.entry.waves || a.index - b.index
    )
    .map(({ entry }) => entry);
}

/** Keeps only rows that could plausibly render, used when reading old storage. */
export function isRenderableEntry(entry: unknown): entry is BoardEntry {
  if (!entry || typeof entry !== 'object') return false;
  const row = entry as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.name === 'string' &&
    typeof row.score === 'number' &&
    Number.isFinite(row.score) &&
    row.score > 0 &&
    row.score <= MAX_LEADERBOARD_SCORE &&
    typeof row.waves === 'number' &&
    Number.isFinite(row.waves)
  );
}

/** Date label used on boards without a real per-run timestamp. */
export function formatRunDate(addedAt: number, now: number = Date.now()): string {
  const minutes = Math.floor(Math.max(0, now - addedAt) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
