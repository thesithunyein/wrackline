// When the next wave lands.
//
// The calm between surges used to be one number per wave: base window, closed by the
// season, scaled by the tide. That made the whole run a metronome. A player who knew the
// clock could clear the beach on the beat, bank on the beat, and never once be caught
// out, which is the wrong way round for a game whose whole idea is that greed is a risk.
//
// So the hush is a roll now. Most hushes land near the window the season has always
// given, one in three is a sneak that opens the shore for about as long as it takes to
// cross it, and the occasional breath pays the fright back with a window long enough to
// get greedy in. The player can no longer infer the next wave from the last one.
//
// What is deliberately NOT random is the warning. The sea drawing back is the tell, and
// it keeps its full length on every wave at every tide, so a short hush is a decision the
// player lost, not a wave that appeared from nowhere. This module only owns the calm.

export interface HushRoll {
  /** The low tide this wave would have had under the old fixed clock. */
  base: number;
  /** 0 on the opening wave, which must not be cut short before the player can play. */
  waveIndex: number;
  rng: () => number;
}

export interface Hush {
  /** Low tide, in seconds, before the draw begins. */
  seconds: number;
  /** The shortest the clock allows: the shore is open for one crossing and no more. */
  sneak: boolean;
  /** A long window, so a run of short ones is not the whole story. */
  breath: boolean;
}

/** One hush in three is cut to the bone. */
export const SNEAK_CHANCE = 0.3;
/** One in eight is a long one. */
export const BREATH_CHANCE = 0.12;
/** A sneak is this share of the wave's usual calm. */
export const SNEAK_FACTOR = 0.42;
/** A breath is this share of it. */
export const BREATH_FACTOR = 1.45;
/** An ordinary hush drifts this far either side of the window the season has earned. */
export const DRIFT_LOW = 0.78;
export const DRIFT_HIGH = 1.18;
/**
 * Never hand the player less low tide than this, whatever the arithmetic says. At the
 * end of a STORM season the closing factor alone would time the shore at under a second,
 * and a wave you cannot see coming round on you that fast is a glitch, not a dare.
 */
export const MIN_HUSH_SECONDS = 1.1;

export function rollHush({ base, waveIndex, rng }: HushRoll): Hush {
  // The opening shore is the tutorial. It is never a sneak: the player is still reading
  // the controls, and a three second first window reads as a broken game, not a hard one.
  if (waveIndex === 0) {
    const seconds = base * (0.95 + rng() * 0.25);
    return { seconds: Math.max(MIN_HUSH_SECONDS, seconds), sneak: false, breath: false };
  }

  // One roll picks the kind of hush. The ordinary ones then take a second roll for their
  // drift, so tuning the sneak or breath odds cannot silently move where the ordinary
  // hushes land.
  const kind = rng();
  if (kind < SNEAK_CHANCE) {
    return {
      seconds: Math.max(MIN_HUSH_SECONDS, base * SNEAK_FACTOR),
      sneak: true,
      breath: false
    };
  }
  if (kind < SNEAK_CHANCE + BREATH_CHANCE) {
    return { seconds: base * BREATH_FACTOR, sneak: false, breath: true };
  }
  const drift = DRIFT_LOW + rng() * (DRIFT_HIGH - DRIFT_LOW);
  return { seconds: Math.max(MIN_HUSH_SECONDS, base * drift), sneak: false, breath: false };
}
