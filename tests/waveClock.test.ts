import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BREATH_CHANCE,
  BREATH_FACTOR,
  DRIFT_HIGH,
  DRIFT_LOW,
  MIN_HUSH_SECONDS,
  SNEAK_CHANCE,
  SNEAK_FACTOR,
  rollHush
} from '../src/game/waveClock.ts';
import { mulberry32 } from '../src/game/retention.ts';

const SURF = 5.0;

function rollMany(count: number, base = SURF, seed = 1234) {
  const rng = mulberry32(seed);
  const out = [];
  for (let i = 0; i < count; i++) {
    out.push(rollHush({ base, waveIndex: 1 + (i % 12), rng }));
  }
  return out;
}

test('the opening shore is never cut short, and it is never a sneak', () => {
  const rng = mulberry32(9);
  for (let i = 0; i < 200; i++) {
    const hush = rollHush({ base: SURF, waveIndex: 0, rng });
    assert.equal(hush.sneak, false);
    assert.ok(hush.seconds >= SURF * 0.95, `${hush.seconds} would rush the tutorial`);
    assert.ok(hush.seconds <= SURF * 1.2, `${hush.seconds} is longer than the opening allows`);
  }
});

test('every hush is long enough to play, on every tide', () => {
  for (const base of [7.0, 5.0, 3.6, 1.51, 0.9]) {
    for (const hush of rollMany(400, base)) {
      assert.ok(hush.seconds >= MIN_HUSH_SECONDS, `${hush.seconds} at base ${base} is under the floor`);
    }
  }
});

test('a sneak is about a third of the usual calm, and hits roughly three seconds of total gap on SURF', () => {
  const sneaks = rollMany(4000).filter(h => h.sneak);
  assert.ok(sneaks.length > 900, `only ${sneaks.length} sneaks in 4000 rolls`);
  for (const hush of sneaks) {
    const expected = Math.max(MIN_HUSH_SECONDS, SURF * SNEAK_FACTOR);
    assert.equal(hush.seconds, expected);
  }
  // SURF warns for 1.3s, which is the reaction window the player actually gets.
  assert.ok(Math.abs(sneaks[0].seconds + 1.3 - 3.4) < 0.01, 'a sneak should land near three seconds');
});

test('the mix is the promised one: three sneaks in ten, one breath in eight', () => {
  const rolls = rollMany(20000, SURF, 77);
  const sneakShare = rolls.filter(h => h.sneak).length / rolls.length;
  const breathShare = rolls.filter(h => h.breath).length / rolls.length;
  assert.ok(Math.abs(sneakShare - SNEAK_CHANCE) < 0.02, `sneaks came up ${sneakShare}`);
  assert.ok(Math.abs(breathShare - BREATH_CHANCE) < 0.02, `breaths came up ${breathShare}`);
});

test('ordinary hushes stay near the window the season has earned', () => {
  for (const hush of rollMany(4000).filter(h => !h.sneak && !h.breath)) {
    assert.ok(hush.seconds >= SURF * DRIFT_LOW - 1e-9);
    assert.ok(hush.seconds <= SURF * DRIFT_HIGH + 1e-9);
  }
});

test('a breath pays the fright back with a long window, but not a season-opening one', () => {
  for (const hush of rollMany(4000).filter(h => h.breath)) {
    assert.equal(hush.seconds, SURF * BREATH_FACTOR);
    assert.ok(hush.seconds > SURF * DRIFT_HIGH);
  }
});

test('the clock is seeded, so a daily tide plays the same beats for everyone', () => {
  const a = rollMany(12, SURF, 4242).map(h => h.seconds);
  const b = rollMany(12, SURF, 4242).map(h => h.seconds);
  assert.deepEqual(a, b);
  const c = rollMany(12, SURF, 4243).map(h => h.seconds);
  assert.notDeepEqual(a, c);
});

test('a season of thirteen waves actually surprises: no two runs share a rhythm', () => {
  const rhythms = new Set<string>();
  for (let seed = 0; seed < 50; seed++) {
    rhythms.add(rollMany(12, SURF, seed).map(h => h.seconds.toFixed(3)).join(','));
  }
  assert.equal(rhythms.size, 50);
});
