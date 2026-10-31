import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_TIDES,
  MISSION_POOL,
  SHELLS,
  applyRun,
  dailyMissionsFor,
  dailySeed,
  dailyTideFor,
  emptyDailySave,
  hashString,
  missionProgress,
  mulberry32,
  normalizeDailySave,
  resolveShell,
  shorePoints,
  unlockedShells,
  type DailySave,
  type MissionDef
} from '../src/game/retention.ts';

const DAY = '2026-11-01';
const NEXT_DAY = '2026-11-02';

function summary(overrides: Partial<Parameters<typeof applyRun>[2]> = {}) {
  return {
    score: 0,
    waves: 0,
    survived: false,
    surgeGrabs: 0,
    kingBanks: 0,
    itemsHauled: 0,
    dug: false,
    ...overrides
  };
}

function save(overrides: Partial<DailySave> = {}): DailySave {
  return { ...emptyDailySave(DAY), ...overrides };
}

function mission(id: string): MissionDef {
  const found = MISSION_POOL.find(candidate => candidate.id === id);
  if (!found) throw new Error(`unknown mission ${id}`);
  return found;
}

test('the daily tide is one shore for everyone, stable for the day', () => {
  assert.equal(dailyTideFor(DAY).id, dailyTideFor(DAY).id);
  assert.ok(DAILY_TIDES.some(tide => tide.id === dailyTideFor(DAY).id));
  const seeds = new Set([dailyTideFor('2026-11-01'), dailyTideFor('2026-11-02'), dailyTideFor('2026-11-03')]);
  assert.ok(seeds.size >= 1);
  assert.equal(dailySeed(DAY), dailySeed(DAY));
  assert.notEqual(dailySeed(DAY), dailySeed(NEXT_DAY));
});

test('the seeded PRNG is deterministic, so the shore lands the same for all', () => {
  const a = mulberry32(dailySeed(DAY));
  const b = mulberry32(dailySeed(DAY));
  const first = [a(), a(), a(), a()];
  const second = [b(), b(), b(), b()];
  assert.deepEqual(first, second);
  assert.ok(first.every(value => value >= 0 && value < 1));

  const other = mulberry32(dailySeed(NEXT_DAY));
  assert.notDeepEqual(first, [other(), other(), other(), other()]);
});

test('hashString is stable and spreads days apart', () => {
  assert.equal(hashString('2026-11-01:tide'), hashString('2026-11-01:tide'));
  assert.notEqual(hashString('2026-11-01:tide'), hashString('2026-11-02:tide'));
});

test('each day draws three distinct missions', () => {
  const missions = dailyMissionsFor(DAY);
  assert.equal(missions.length, 3);
  assert.equal(new Set(missions.map(mission => mission.id)).size, 3);
  assert.deepEqual(
    dailyMissionsFor(DAY).map(mission => mission.id),
    missions.map(mission => mission.id)
  );
  assert.ok(missions.every(pick => MISSION_POOL.some(candidate => candidate.id === pick.id)));
});

test('missions score a per-run best, not a running total', () => {
  const bank = mission('BANK_2000');
  const missions = [bank];

  const first = applyRun(save(), DAY, summary({ score: 1200 }), missions);
  assert.deepEqual(first.completed, []);
  assert.equal(first.save.best[bank.id], 1200);

  const second = applyRun(first.save, DAY, summary({ score: 1500 }), missions);
  assert.deepEqual(second.completed, [], 'two 1,200/1,500 runs must not add up to 2,000');

  const third = applyRun(second.save, DAY, summary({ score: 2100 }), missions);
  assert.deepEqual(third.completed, [bank.id]);
  assert.equal(third.save.done.includes(bank.id), true);

  const fourth = applyRun(third.save, DAY, summary({ score: 3000 }), missions);
  assert.deepEqual(fourth.completed, [], 'an already-cleared mission does not clear twice');
});

test('surviving the season completes the outlast mission', () => {
  const outlast = mission('OUTLAST');
  const result = applyRun(save(), DAY, summary({ survived: true, waves: 13 }), [outlast]);
  assert.deepEqual(result.completed, [outlast.id]);
  assert.equal(result.save.seasons, 1);
});

test('a daily tide builds a streak, and a skipped day breaks it', () => {
  const dayOne = applyRun(save(), DAY, summary({ score: 100 }), []);
  assert.equal(dayOne.save.streak, 1);
  assert.equal(dayOne.save.lastDailyDay, DAY);

  const sameDay = applyRun(dayOne.save, DAY, summary({ score: 100 }), []);
  assert.equal(sameDay.save.streak, 1, 'playing twice in a day is still one day');

  const consecutive = applyRun(sameDay.save, NEXT_DAY, summary({ score: 100 }), []);
  assert.equal(consecutive.save.streak, 2);

  const skipped = applyRun(consecutive.save, '2026-11-05', summary({ score: 100 }), []);
  assert.equal(skipped.save.streak, 1, 'a missed day starts the streak over');
});

test('a season run never moves the daily streak', () => {
  const seasonRun = applyRun(save(), DAY, summary({ score: 500 }), [], false);
  assert.equal(seasonRun.save.streak, 0);
  assert.equal(seasonRun.save.lastDailyDay, null);
  assert.equal(seasonRun.save.lifetimeBanked, 500);
});

test('rolling to a new day clears today but keeps lifetime progress', () => {
  const played = applyRun(
    save({ lifetimeBanked: 5000, missionsDone: 4, seasons: 2, streak: 3, lastDailyDay: '2026-10-31' }),
    DAY,
    summary({ score: 900 }),
    [mission('BANK_2000')]
  );
  assert.equal(played.save.streak, 4, 'yesterday to today continues the streak');
  assert.equal(played.save.lifetimeBanked, 5900);

  const rolled = normalizeDailySave(played.save, NEXT_DAY);
  assert.equal(rolled.day, NEXT_DAY);
  assert.deepEqual(rolled.done, []);
  assert.deepEqual(rolled.best, {});
  assert.equal(rolled.lifetimeBanked, 5900);
  assert.equal(rolled.missionsDone, 4);
  assert.equal(rolled.seasons, 2);
  assert.equal(rolled.streak, 4, 'the streak survives to be judged when the next tide is played');
});

test('mission progress reads as 0..1 with cleared missions pinned to the target', () => {
  const missions = [mission('BANK_2000'), mission('REACH_7')];
  const progress = missionProgress(save({ best: { BANK_2000: 500 } }), missions);
  assert.equal(progress[0].value, 500);
  assert.equal(progress[0].done, false);
  assert.equal(progress[1].value, 0);

  const cleared = missionProgress(save({ done: ['BANK_2000'], best: { BANK_2000: 500 } }), missions);
  assert.equal(cleared[0].value, 2000);
  assert.equal(cleared[0].done, true);
});

test('shore points add up from banking, missions and seasons', () => {
  assert.equal(shorePoints(emptyDailySave(DAY)), 0);
  assert.equal(
    shorePoints(save({ lifetimeBanked: 12_345, missionsDone: 2, seasons: 1 })),
    123 + 50 + 100
  );
});

test('shells unlock in order and an unknown pick falls back', () => {
  assert.deepEqual(
    unlockedShells(0).map(shell => shell.id),
    ['TIDEGLASS']
  );
  assert.deepEqual(
    unlockedShells(250).map(shell => shell.id),
    ['TIDEGLASS', 'EMBER']
  );
  assert.equal(unlockedShells(2399).length, 3);
  assert.equal(unlockedShells(2400).length, SHELLS.length);

  assert.equal(resolveShell(0, 'ABYSS').id, 'TIDEGLASS', 'a locked shell is never worn');
  assert.equal(resolveShell(2400, 'ABYSS').id, 'ABYSS');
  assert.equal(resolveShell(250, 'no-such-shell').id, 'TIDEGLASS');
});
