import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  visualizeFromHex,
  visualizeFromScramble,
  visualizeFromSolution,
  visualizeShapes,
} from '../drawScramble';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawScramble visualizer', () => {
  it('renders a valid two-svg layout from a hex code', () => {
    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4');
    expect(html).toContain('<svg');
    expect(html).toContain('</svg>');
    expect(html).toContain('<polygon');
    expect(html).toContain('display:flex;align-items:center;');
    expect(html).toContain('class="sq1-pieces"');
  });

  it('applies custom colors through the color scheme', () => {
    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4', 200, {
      topColor: '#123456',
    });
    expect(html).toContain('#123456');
  });

  it('uses the dark theme text color for white cube faces', () => {
    vi.stubGlobal('document', {
      documentElement: {
        getAttribute: () => 'dark',
      },
    });
    vi.stubGlobal('getComputedStyle', () => ({
      getPropertyValue: () => '#e2e4ed',
    }));

    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4', 200, {
      topColor: '#fff',
      bottomColor: '#FFFFFF',
      frontColor: '#fff',
      rightColor: '#ffffff',
      backColor: '#FFF',
      leftColor: '#FFFFFF',
    });
    expect(html).toContain('#e2e4ed');
    expect(html).not.toContain('#FFFFFF');
  });

  it('supports default argument values for size', () => {
    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4');
    // The core renders the puzzle at size * (220/400) inside a padded viewBox.
    expect(html).toContain('data-puzzle-size="110');
  });

  it('renders from scramble notation', () => {
    const html = visualizeFromScramble('(1,0) / (3,3) / (-1,0)');
    expect(html).toContain('<svg');
    expect(html).toContain('<polygon');
  });

  it('renders from solution notation (inverted)', () => {
    const solutionHtml = visualizeFromSolution('(1,0) / (3,3) / (-1,0)');
    const scrambleHtml = visualizeFromScramble('(1,0) / (3,3) / (-1,0)');
    expect(solutionHtml).toContain('<svg');
    expect(scrambleHtml).toContain('<svg');
  });

  it('renders shape outlines from a shape index', () => {
    const html = visualizeShapes(0);
    expect(html).toContain('<svg');
    expect(html).toContain('<polygon');
    expect(html).toContain('fill="transparent"');
  });

  it('applies the requested shape outline stroke width in SVG units', () => {
    const html = visualizeShapes('6e0cc804a2a6|0e8c64ee20c4', 200, 'transparent', 'transparent', '#333333', 3);
    const stickerStrokeWidths = [...html.matchAll(/<polygon class="sticker"[^>]*stroke-width="([^"]+)"/g)].map(
      ([, strokeWidth]) => strokeWidth,
    );
    expect(stickerStrokeWidths.length).toBeGreaterThan(0);
    expect(stickerStrokeWidths.every((strokeWidth) => strokeWidth === '3.00')).toBe(true);
  });

  it('renders shape outlines from a hex code with pipe separator', () => {
    const html = visualizeShapes('6e0cc804a2a6|0e8c64ee20c4');
    expect(html).toContain('<svg');
  });

  it('renders shape outlines from a scramble', () => {
    const html = visualizeShapes('(1,0) / (3,3) / (-1,0)');
    expect(html).toContain('<svg');
  });

  it('leniently ignores unrecognized tokens (legacy behavior)', () => {
    const html = visualizeFromScramble('not a scramble !!!');
    expect(html).toContain('<svg');
  });

  it('throws on malformed hex code', () => {
    expect(() => visualizeFromHex('short')).toThrow(/24 data characters/);
  });

  it('emits the animation hooks the viewer relies on (two svg layers with origin data)', () => {
    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4');
    const svgCount = html.match(/<svg/g)?.length ?? 0;
    expect(svgCount).toBe(2);
    expect(html).toContain('data-origin-x="');
    expect(html).toContain('data-origin-y="');
  });

  it('wraps pieces in .sq1-piece groups inside .sq1-pieces for turn animation', () => {
    const html = visualizeFromHex('6e0cc804a2a6|0e8c64ee20c4');
    const pieceGroups = html.match(/class="sq1-piece"/g)?.length ?? 0;
    expect(pieceGroups).toBeGreaterThan(8);
    expect(html).toContain('class="sq1-pieces"');
  });
});
