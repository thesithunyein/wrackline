/**
 * How a wave's wrack is split between the beach that is already exposed and the sea
 * that is still holding some back.
 *
 * The beach used to be emptied before the surge was even called: every piece landed
 * the moment the tide dropped, so a careful player hauled the lot, banked, and waited
 * with nothing to lose. The late pieces are the fix. They wash in while the sea is
 * drawing back, which is the one stretch where there is still something worth taking
 * and the water is already on its way.
 */

/** Share of a wave's wrack held back for the draw. */
export const LATE_DROP_SHARE = 0.4;
/** Three late pieces is already a scatter to run down; more is a shoal. */
export const MAX_LATE_DROPS = 3;
/** First and last wash-in, as a fraction of the warning. The last one still leaves
 *  a beat to grab and bank, which is the whole bet. */
export const LATE_DROP_FROM = 0.22;
export const LATE_DROP_TO = 0.52;

export interface WaveLootPlan {
  /** Pieces bedded on the sand while the tide is low. */
  early: number;
  /** Fractions of the warning at which the rest washes in, ascending. */
  lateAt: number[];
}

export function planWaveLoot(count: number): WaveLootPlan {
  const total = Math.max(1, Math.floor(count));
  const lateCount = Math.min(MAX_LATE_DROPS, Math.max(1, Math.round(total * LATE_DROP_SHARE)));
  const early = Math.max(1, total - lateCount);

  const lateAt = Array.from({ length: lateCount }, (_, i) =>
    lateCount === 1
      ? LATE_DROP_FROM
      : LATE_DROP_FROM + ((LATE_DROP_TO - LATE_DROP_FROM) * i) / (lateCount - 1)
  );

  return { early, lateAt };
}
