import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MY_TRANSLATIONS,
  placeholders,
  translate
} from '../src/game/i18n.ts';

// Arcade words that stay as they are in both languages, because the sound is the point.
const COGNATES = new Set(['SURGE +{n}', '+{n} (2X)']);

test('every Burmese entry is filled in', () => {
  for (const [key, value] of Object.entries(MY_TRANSLATIONS)) {
    assert.ok(value.trim().length > 0, `${key} has no Burmese text`);
    if (!COGNATES.has(key)) assert.notEqual(value, key, `${key} was never translated`);
  }
});

test('placeholders survive translation, none gained and none lost', () => {
  for (const [key, value] of Object.entries(MY_TRANSLATIONS)) {
    assert.deepEqual(
      placeholders(value),
      placeholders(key),
      `${key} changes its placeholders in Burmese`
    );
  }
});

test('English passes through untouched, even with variables', () => {
  assert.equal(translate('en', 'PLAY'), 'PLAY');
  assert.equal(translate('en', 'WAVE {wave} of {total}', { wave: 3, total: 13 }), 'WAVE 3 of 13');
});

test('Burmese fills its variables and leaves stranger slots alone', () => {
  assert.equal(
    translate('my', 'WAVE {wave} · {tier} · {tide}{mod}', {
      wave: 4,
      tier: 'THE WRACK',
      tide: 'CALM',
      mod: ''
    }),
    'လှိုင်း 4 · THE WRACK · CALM'
  );
  assert.equal(translate('my', '{n} PTS', { other: 3 }), '{n} အမှတ်');
});

test('a key with no translation falls back to the English words', () => {
  assert.equal(translate('my', 'SOME NEW LABEL'), 'SOME NEW LABEL');
});

test('the settings strings a Myanmar player needs are present', () => {
  for (const key of [
    'SETTINGS',
    'SOUND',
    'LANGUAGE',
    'FULLSCREEN',
    'ON',
    'OFF',
    'PLAY',
    'HAUL',
    'DIG',
    'PAUSED',
    'RESUME'
  ]) {
    assert.ok(MY_TRANSLATIONS[key], `${key} is missing`);
  }
});
