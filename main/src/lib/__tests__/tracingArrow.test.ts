import { describe, expect, test } from 'vitest';
import { calculateArrowAngle, calculateParityFromHex, hexToUnits } from '../parityAnalyzer';

describe('tracing arrow gap', () => {
  const cornerFirstSquare = ['1', '0', '3', '2', '5', '4', '7', '6'];
  const edgeFirstSquare = ['0', '1', '2', '3', '4', '5', '6', '7'];

  test.each(['TOP', 'BOTTOM'] as const)('%s leaves a 60-degree gap when the rotated trace ends on a corner', (layer) => {
    const arrow = calculateArrowAngle(1, cornerFirstSquare, layer);
    expect(arrow.arcDegrees).toBe(300);
    expect(arrow.startAngle).toBe(layer === 'TOP' ? 30 : 240);
  });

  test.each(['TOP', 'BOTTOM'] as const)('%s leaves a 30-degree gap when the rotated trace ends on an edge', (layer) => {
    const arrow = calculateArrowAngle(1, edgeFirstSquare, layer);
    expect(arrow.arcDegrees).toBe(330);
    expect(arrow.startAngle).toBe(layer === 'TOP' ? 60 : 270);
  });

  test('an unrotated trace still uses the original final piece', () => {
    expect(calculateArrowAngle(0, edgeFirstSquare, 'TOP').arcDegrees).toBe(300);
    expect(calculateArrowAngle(0, cornerFirstSquare, 'TOP').arcDegrees).toBe(330);
  });

  test('the square tracing pipeline leaves the final corner uncovered on both layers', () => {
    // Corner-first square on top, edge-first square on bottom. Hex layers are
    // read right-to-left, with corners occupying two slots.
    const topHex = '677455233011';
    const bottomHex = 'ffeddcbba998';
    const parity = calculateParityFromHex(topHex, bottomHex, false, false);
    const { topUnits, botUnits } = hexToUnits(topHex, bottomHex);
    expect(parity.topMatch.name).toBe('Square');
    expect(parity.botMatch.name).toBe('Square');
    expect(calculateArrowAngle(parity.topTraceRotation, topUnits, 'TOP').arcDegrees).toBe(300);
    expect(calculateArrowAngle(parity.botTraceRotation, botUnits, 'BOTTOM').arcDegrees).toBe(300);
  });
});
