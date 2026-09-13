/**
 * Checked element access. With `noUncheckedIndexedAccess`, indexing yields `T | undefined`;
 * these helpers turn an out-of-range read into an immediate error instead of a silent `undefined`.
 */
export function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`Index ${index} out of range (length ${values.length})`);
  }
  return value;
}

export function lookup<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) {
    throw new RangeError(`Missing key ${String(key)}`);
  }
  return value;
}

export function mod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Parity of a permutation given as `perm[i]` = image (or source) of i. 0 = even, 1 = odd. */
export function permutationParity(perm: ArrayLike<number>): 0 | 1 {
  const seen = new Uint8Array(perm.length);
  let transpositions = 0;
  for (let start = 0; start < perm.length; start++) {
    if (seen[start] === 1) continue;
    let length = 0;
    let current = start;
    while (seen[current] !== 1) {
      seen[current] = 1;
      current = at(perm, current);
      length++;
    }
    transpositions += length - 1;
  }
  return (transpositions % 2) as 0 | 1;
}
