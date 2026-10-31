import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LATE_DROP_FROM,
  LATE_DROP_TO,
  MAX_LATE_DROPS,
  planWaveLoot
} from '../src/game/loot.ts';

test('a wave keeps its piece count when the split applies', () => {
  for (let count = 3; count <= 10; count++) {
    const plan = planWaveLoot(count);
    assert.equal(plan.early + plan.lateAt.length, count, `count ${count}`);
  }
});

test('never spawns the whole wave late, and never holds back more than three', () => {
  for (let count = 3; count <= 30; count++) {
    const plan = planWaveLoot(count);
    assert.ok(plan.early >= 1, `count ${count} left the beach empty`);
    assert.ok(plan.lateAt.length >= 1, `count ${count} held nothing back`);
    assert.ok(plan.lateAt.length <= MAX_LATE_DROPS, `count ${count} held back too much`);
  }
});

test('late drops land inside the draw, in order, with a beat left to grab them', () => {
  for (let count = 3; count <= 10; count++) {
    const { lateAt } = planWaveLoot(count);
    assert.equal(lateAt[0], LATE_DROP_FROM);
    for (let i = 1; i < lateAt.length; i++) {
      assert.ok(lateAt[i] > lateAt[i - 1], 'drops must be ascending');
    }
    for (const at of lateAt) {
      assert.ok(at >= LATE_DROP_FROM && at <= LATE_DROP_TO, `${at} outside the draw`);
    }
    if (lateAt.length > 1) {
      assert.equal(lateAt[lateAt.length - 1], LATE_DROP_TO);
    }
  }
});

test('a single held-back piece washes in at the start of the draw', () => {
  assert.deepEqual(planWaveLoot(3).lateAt, [LATE_DROP_FROM]);
});

test('the plan is pure, so a seeded daily tide lands the same wrack for everyone', () => {
  assert.deepEqual(planWaveLoot(8), planWaveLoot(8));
});
