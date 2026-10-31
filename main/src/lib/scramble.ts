import { SqCubie, scrambleFromState } from './solver';

/**
 * Parses a hex-encoded cube state ("12 hex digits | 12 hex digits") into a
 * SqCubie. The separator "|" denotes middle-layer up, "/" down.
 */
export function parseHexFormat(input: string): SqCubie {
  const cubie = new SqCubie();
  const cleaned = input.replace(/\s/g, '');

  const parts = cleaned.split(/[|/]/);
  if (parts.length !== 2) {
    throw new Error('Invalid format. Expected: 12 hex digits + separator + 12 hex digits');
  }

  const upperPart = parts[0];
  const lowerPart = parts[1];
  if (upperPart.length !== 12 || lowerPart.length !== 12) {
    throw new Error('Each part must be exactly 12 hex digits');
  }

  cubie.ul = parseInt(upperPart.substring(0, 6), 16);
  cubie.ur = parseInt(upperPart.substring(6, 12), 16);
  cubie.dl = parseInt(lowerPart.substring(0, 6), 16);
  cubie.dr = parseInt(lowerPart.substring(6, 12), 16);
  cubie.ml = cleaned.includes('/') ? 1 : 0;

  return cubie;
}

export interface ScrambleGenerationResult {
  scramble: string | null;
  error: string | null;
}

/** Generates a scramble for a hex-encoded state, returning either the scramble or an error. */
export function generateScrambleFromHex(hexInput: string): ScrambleGenerationResult {
  if (!hexInput.trim()) {
    return { scramble: null, error: 'Please enter a hex format state first.' };
  }
  try {
    const state = parseHexFormat(hexInput);
    const scramble = scrambleFromState(state);
    if (scramble) {
      return { scramble, error: null };
    }
    return { scramble: null, error: 'Could not generate scramble for this state.' };
  } catch (error) {
    return { scramble: null, error: 'Error: ' + (error as Error).message };
  }
}
