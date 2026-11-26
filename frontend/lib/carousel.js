// Slide index helpers for the homepage feature carousel.

/** `index` moved into 0..count-1, wrapping round both ends (so -1 is the last slide). */
export function wrapIndex(index, count) {
  if (!Number.isInteger(count) || count <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return ((Math.trunc(index) % count) + count) % count;
}

/** The slide `step` places on from `index` (step -1 = previous, +1 = next). */
export function stepIndex(index, step, count) {
  return wrapIndex(index + step, count);
}
