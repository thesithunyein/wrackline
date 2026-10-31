import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { daysBetweenKeys, dayIndex, mmtDayKey, msUntilNextMmtDay } from '../src/game/clock.ts';
import {
  MAX_LEADERBOARD_SCORE,
  generatePlayerName,
  isRenderableEntry,
  rankOfRun,
  sanitizePlayerName,
  sortLeaderboard,
  validateRunPayload
} from '../src/game/leaderboardCore.ts';
import { createLeaderboardHandler } from '../api/leaderboard.ts';
import { FileLeaderboardStore } from '../server/leaderboardStore.ts';

const PLAYER = 'player-0001';
const OTHER = 'player-0002';

function run(overrides: Record<string, unknown> = {}) {
  return {
    playerId: PLAYER,
    runId: 'run-00000001',
    name: 'SALT_CRAB42',
    score: 1200,
    waves: 5,
    tide: 'SURF',
    durationMs: 90_000,
    ...overrides
  };
}

function mockResponse() {
  const out = {
    code: 0,
    body: null as unknown,
    headers: {} as Record<string, string | string[]>
  };
  const res = {
    status(code: number) {
      out.code = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return out;
    },
    setHeader(name: string, value: string | string[]) {
      out.headers[name] = value;
    },
    end() {}
  };
  return { res, out };
}

test('mmtDayKey turns the day over at Myanmar midnight, not UTC', () => {
  const before = Date.UTC(2026, 9, 31, 17, 29); // 23:59 MMT on 31 Oct
  const after = Date.UTC(2026, 9, 31, 17, 31); // 00:01 MMT on 1 Nov
  assert.equal(mmtDayKey(before), '2026-10-31');
  assert.equal(mmtDayKey(after), '2026-11-01');
});

test('day arithmetic counts whole days and orders keys', () => {
  assert.equal(daysBetweenKeys('2026-10-31', '2026-11-01'), 1);
  assert.equal(daysBetweenKeys('2026-10-30', '2026-11-01'), 2);
  assert.equal(daysBetweenKeys('2026-11-01', '2026-10-31'), -1);
  assert.ok(dayIndex('2026-11-01') > dayIndex('2026-10-31'));
});

test('msUntilNextMmtDay is the gap to the next Myanmar midnight', () => {
  const lateOct31 = Date.UTC(2026, 9, 31, 17, 31); // 00:01 MMT on 1 Nov
  assert.equal(msUntilNextMmtDay(lateOct31), 86_400_000 - 60_000);
  const gap = msUntilNextMmtDay();
  assert.ok(gap > 0 && gap <= 86_400_000);
});

test('a normal run validates and keeps its fields', () => {
  const parsed = validateRunPayload(run());
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.run.playerId, PLAYER);
  assert.equal(parsed.run.score, 1200);
  assert.equal(parsed.run.tide, 'SURF');
});

test('malformed runs are rejected with a reason', () => {
  const cases: Array<[unknown, string]> = [
    [null, 'Run payload is required'],
    [run({ playerId: 'short' }), 'playerId'],
    [run({ runId: 'has spaces in it' }), 'runId'],
    [run({ score: 0 }), 'score'],
    [run({ score: 12.5 }), 'score'],
    [run({ score: MAX_LEADERBOARD_SCORE + 1 }), 'score'],
    [run({ waves: 14 }), 'waves'],
    [run({ waves: -1 }), 'waves'],
    [run({ tide: 'TSUNAMI' }), 'tide']
  ];
  for (const [payload, expected] of cases) {
    const parsed = validateRunPayload(payload);
    assert.equal(parsed.ok, false, `expected ${String((payload as Record<string, unknown>)?.score)} to fail`);
    if (parsed.ok) continue;
    assert.match(parsed.error, new RegExp(expected));
  }
});

test('a big score has to be possible in the run time it claims', () => {
  const missing = validateRunPayload(run({ score: 40_000, durationMs: undefined }));
  assert.equal(missing.ok, false);

  const tooFast = validateRunPayload(run({ score: 60_000, durationMs: 8_000 }));
  assert.equal(tooFast.ok, false);
  if (!tooFast.ok) assert.match(tooFast.error, /not possible/);

  const possible = validateRunPayload(run({ score: 40_000, durationMs: 60_000 }));
  assert.equal(possible.ok, true);
});

test('names are sanitized to something a board can render', () => {
  assert.equal(sanitizePlayerName(undefined), 'SCUTTLER');
  assert.equal(sanitizePlayerName('   '), 'SCUTTLER');
  assert.equal(sanitizePlayerName('a\u0000b\nc'), 'a b c');
  assert.equal(sanitizePlayerName('X'.repeat(40)).length, 16);

  const generated = generatePlayerName(() => 0.42);
  assert.match(generated, /^[A-Z]+_[A-Z]+\d{2}$/);
  assert.equal(generated.length <= 16, true);
});

test('the board sorts by score, then by how far the run got', () => {
  const rows = sortLeaderboard([
    { id: 'a', score: 100, waves: 2 },
    { id: 'b', score: 300, waves: 4 },
    { id: 'c', score: 300, waves: 7 },
    { id: 'd', score: 100, waves: 9 }
  ]);
  assert.deepEqual(
    rows.map(row => row.id),
    ['c', 'b', 'd', 'a']
  );
  assert.equal(rankOfRun(rows, 'b'), 2);
  assert.equal(rankOfRun(rows, 'nope'), 0);
});

test('stored rows are only rendered when they can be trusted', () => {
  assert.equal(isRenderableEntry({ id: 'a', name: 'A', score: 10, waves: 2 }), true);
  assert.equal(isRenderableEntry({ id: 'a', name: 'A', score: 0, waves: 2 }), false);
  assert.equal(isRenderableEntry({ id: '', name: 'A', score: 10, waves: 2 }), false);
  assert.equal(isRenderableEntry({ id: 'a', score: 10, waves: 2 }), false);
  assert.equal(isRenderableEntry(null), false);
});

test('the file store keeps one row per player, holding their best', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wrackline-store-'));
  try {
    const store = new FileLeaderboardStore(path.join(dir, 'board.json'));

    const first = await store.submit('season', { ...run(), playerId: PLAYER, runId: 'run-00000001', score: 1200 });
    assert.equal(first.rank, 1);
    assert.equal(first.improved, true);

    const retry = await store.submit('season', { ...run(), playerId: PLAYER, runId: 'run-00000001', score: 1200 });
    assert.equal(retry.duplicate, true);
    assert.equal(retry.improved, false);

    const worse = await store.submit('season', { ...run(), playerId: PLAYER, runId: 'run-00000002', score: 900 });
    assert.equal(worse.improved, false);
    assert.equal(worse.entries.length, 1);

    const better = await store.submit('season', { ...run(), playerId: PLAYER, runId: 'run-00000003', score: 5000 });
    assert.equal(better.improved, true);

    await store.submit('season', { ...run(), playerId: OTHER, runId: 'run-00000004', score: 9000 });
    const board = await store.list('season');
    assert.deepEqual(
      board.map(row => row.playerId),
      [OTHER, PLAYER]
    );

    // Boards are separate: today's tide starts empty even though the season has rows.
    assert.deepEqual(await store.list('daily:2026-11-01'), []);

    await store.rename('season', PLAYER, 'RENAMED');
    const renamed = (await store.list('season')).find(row => row.playerId === PLAYER);
    assert.equal(renamed?.name, 'RENAMED');

    // A reopened store reloads the same rows from disk.
    const reopened = new FileLeaderboardStore(path.join(dir, 'board.json'));
    assert.equal((await reopened.list('season')).length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the endpoint refuses to pretend it is online without durable storage', async () => {
  const handler = createLeaderboardHandler(() => null);
  const { res, out } = mockResponse();
  await handler({ method: 'GET' }, res);
  assert.equal(out.code, 503);
  assert.equal((out.body as { storage: string }).storage, 'unavailable');
});

test('the endpoint files a run, dedupes retries and keeps the boards apart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wrackline-api-'));
  try {
    const store = new FileLeaderboardStore(path.join(dir, 'board.json'));
    const handler = createLeaderboardHandler(() => store);

    const get = mockResponse();
    await handler({ method: 'GET', query: { board: 'season' } }, get.res);
    assert.equal(get.out.code, 200);
    assert.equal((get.out.body as { storage: string }).storage, 'durable');
    assert.deepEqual((get.out.body as { entries: unknown[] }).entries, []);

    const post = mockResponse();
    await handler({ method: 'POST', body: run(), headers: { 'x-forwarded-for': '10.0.0.1' } }, post.res);
    assert.equal(post.out.code, 200);
    const filed = post.out.body as { rank: number; board: string; duplicate: boolean; entries: unknown[] };
    assert.equal(filed.rank, 1);
    assert.equal(filed.board, 'season');
    assert.equal(filed.duplicate, false);
    assert.equal(filed.entries.length, 1);

    const retry = mockResponse();
    await handler({ method: 'POST', body: run(), headers: { 'x-forwarded-for': '10.0.0.1' } }, retry.res);
    assert.equal(retry.out.code, 200);
    assert.equal((retry.out.body as { duplicate: boolean }).duplicate, true);

    // A daily submission lands on today's board, keyed server-side, never client-side.
    const daily = mockResponse();
    await handler(
      {
        method: 'POST',
        body: { ...run(), playerId: OTHER, runId: 'run-00000005', score: 700, board: 'daily' },
        headers: { 'x-forwarded-for': '10.0.0.1' }
      },
      daily.res
    );
    assert.equal(daily.out.code, 200);
    assert.match((daily.out.body as { board: string }).board, /^daily:\d{4}-\d{2}-\d{2}$/);

    const badBoard = mockResponse();
    await handler({ method: 'GET', query: { board: 'weekly' } }, badBoard.res);
    assert.equal(badBoard.out.code, 400);

    const badScore = mockResponse();
    await handler({ method: 'POST', body: run({ score: -5 }) }, badScore.res);
    assert.equal(badScore.out.code, 400);

    const rename = mockResponse();
    await handler(
      { method: 'POST', body: { action: 'rename', playerId: PLAYER, name: '  new   name  ' } },
      rename.res
    );
    assert.equal(rename.out.code, 200);
    const rows = (rename.out.body as { entries: Array<{ playerId?: string; name: string }> }).entries;
    assert.equal(rows.find(row => row.playerId === PLAYER)?.name, 'new name');

    const method = mockResponse();
    await handler({ method: 'DELETE' }, method.res);
    assert.equal(method.out.code, 405);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a submission flood is rate limited instead of filling the board', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wrackline-rl-'));
  try {
    const store = new FileLeaderboardStore(path.join(dir, 'board.json'));
    const handler = createLeaderboardHandler(() => store);
    let lastCode = 0;
    for (let i = 0; i < 8; i++) {
      const { res, out } = mockResponse();
      await handler(
        {
          method: 'POST',
          body: run({ runId: `run-0000000${i}`, score: 100 + i }),
          headers: { 'x-forwarded-for': '10.9.9.9' }
        },
        res
      );
      lastCode = out.code;
    }
    assert.equal(lastCode, 429);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
