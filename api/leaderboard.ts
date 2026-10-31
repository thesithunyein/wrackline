import { mmtDayKey } from '../src/game/clock.ts';
import {
  isBoardId,
  isValidPlayerId,
  sanitizePlayerName,
  validateRunPayload
} from '../src/game/leaderboardCore.ts';
import { createUpstashStoreFromEnv, type LeaderboardStore } from '../server/leaderboardStore.ts';

/**
 * /api/leaderboard — the only server this game has.
 *
 * Requires durable storage (Vercel KV / Upstash Redis REST). Without it the
 * endpoint answers 503 with `storage: 'unavailable'`, and the game falls back to
 * the on-device board rather than inventing a "live global" leaderboard.
 *
 * Two boards live behind this one route:
 *   season — every player's best tide, one row per player, forever.
 *   daily  — the same board for everyone who played today's tide. The day is
 *            computed here in Myanmar time, never supplied by the client, so a
 *            score cannot be filed onto a day it was not played on.
 *
 * Scores are self-reported: this is a community board, not a cheat-proof
 * tournament. Only a signed run or a replay could justify that claim.
 */

const RATE_LIMIT_MAX_SUBMISSIONS = 6;
const RATE_LIMIT_WINDOW_SECONDS = 60;

interface ApiRequest {
  method?: string;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface ApiResponse {
  status(code: number): ApiResponse;
  json(body: unknown): unknown;
  setHeader(name: string, value: string | string[]): unknown;
  end(body?: string): unknown;
}

function clientKey(req: ApiRequest): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  const headerValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = headerValue?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** Turns the public board id into the key the store persists under. */
function storeBoard(board: unknown, now: number): string | null {
  if (!isBoardId(board)) return null;
  return board === 'daily' ? `daily:${mmtDayKey(now)}` : 'season';
}

export function createLeaderboardHandler(getStore: () => LeaderboardStore | null) {
  return async function handler(req: ApiRequest, res: ApiResponse): Promise<unknown> {
    const store = getStore();
    if (!store) {
      return res.status(503).json({
        status: 'disabled',
        storage: 'unavailable',
        error: 'Online board storage is not configured'
      });
    }

    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      const requested = req.query?.board;
      const board = storeBoard(Array.isArray(requested) ? requested[0] : requested ?? 'season', Date.now());
      if (!board) {
        return res.status(400).json({ status: 'error', error: 'board must be season or daily' });
      }

      try {
        const entries = await store.list(board);
        return res.status(200).json({
          status: 'ok',
          storage: 'durable',
          board,
          entries,
          updatedAt: new Date().toISOString()
        });
      } catch (error) {
        return res.status(500).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Leaderboard unavailable'
        });
      }
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;

      // Renaming is separate from scoring: a player who changes their name should
      // see it on their existing row without replaying a tide.
      if (body.action === 'rename') {
        if (!isValidPlayerId(body.playerId)) {
          return res.status(400).json({
            status: 'error',
            storage: 'durable',
            error: 'playerId must be 8-64 URL-safe characters'
          });
        }

        const board = storeBoard(body.board ?? 'season', Date.now());
        if (!board) {
          return res.status(400).json({ status: 'error', error: 'board must be season or daily' });
        }

        try {
          const allowed = await store.consumeRateLimit(
            `rename:${clientKey(req)}`,
            RATE_LIMIT_MAX_SUBMISSIONS,
            RATE_LIMIT_WINDOW_SECONDS
          );
          if (!allowed) {
            return res.status(429).json({
              status: 'error',
              storage: 'durable',
              error: 'Too many requests, try again in a minute'
            });
          }

          const name = sanitizePlayerName(body.name);
          const entries = await store.rename(board, body.playerId, name);
          return res.status(200).json({ status: 'ok', storage: 'durable', name, entries });
        } catch (error) {
          return res.status(500).json({
            status: 'error',
            error: error instanceof Error ? error.message : 'Name could not be saved'
          });
        }
      }

      const board = storeBoard(body.board ?? 'season', Date.now());
      if (!board) {
        return res.status(400).json({ status: 'error', error: 'board must be season or daily' });
      }

      const parsed = validateRunPayload(body);
      if (!parsed.ok) {
        return res.status(400).json({ status: 'error', storage: 'durable', error: parsed.error });
      }

      try {
        // Rate limiting lives inside the same guard: a datastore outage must
        // answer 500, not leave the request hanging on an unhandled rejection.
        const allowed = await store.consumeRateLimit(
          `submit:${board}:${clientKey(req)}`,
          RATE_LIMIT_MAX_SUBMISSIONS,
          RATE_LIMIT_WINDOW_SECONDS
        );
        if (!allowed) {
          return res.status(429).json({
            status: 'error',
            storage: 'durable',
            error: 'Too many submissions, try again in a minute'
          });
        }

        const result = await store.submit(board, parsed.run);
        return res.status(200).json({
          status: 'ok',
          storage: 'durable',
          board,
          rank: result.rank,
          duplicate: result.duplicate,
          improved: result.improved,
          newRecord: result.record,
          entries: result.entries,
          totalPlayers: result.totalPlayers
        });
      } catch (error) {
        return res.status(500).json({
          status: 'error',
          error: error instanceof Error ? error.message : 'Score could not be persisted'
        });
      }
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res
      .status(405)
      .json({ status: 'error', error: `Method ${req.method ?? 'UNKNOWN'} not allowed` });
  };
}

export default createLeaderboardHandler(() => createUpstashStoreFromEnv());
