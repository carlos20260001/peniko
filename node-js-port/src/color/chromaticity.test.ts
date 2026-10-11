import { describe, expect, it } from 'vitest';

import { ACES, D50, D65 } from './chromaticity.js';
import { matmatmul, matvecmul } from './floatfuncs.js';

describe('Chromaticity', () => {
  it('adapts a white point to itself with the identity matrix', () => {
    // This is the test that keeps the three Bradford matrices honest: adapting
    // D65 to D65 scales every channel by 1, so the product must be the identity
    // whether or not the short-circuit applies.
    const m = D65.linear_srgb_chromatic_adaptation_matrix(D65);
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        expect(m[row]![col]!).toBeCloseTo(row === col ? 1 : 0, 6);
      }
    }
    expect(matvecmul(m, [1, 1, 1])[0]).toBeCloseTo(1, 6);
  });

  it('composes a real adaptation deterministically', () => {
    const d65_to_d50 = D65.linear_srgb_chromatic_adaptation_matrix(D50);
    // A chromatic adaptation maps white to white, so the linear sRGB value of
    // the adapted white has to stay inside the gamut with all channels positive.
    const adapted_white = matvecmul(d65_to_d50, [1, 1, 1]);
    expect(adapted_white[0]).toBeGreaterThan(0);
    expect(adapted_white[1]).toBeGreaterThan(0);
    expect(adapted_white[2]).toBeGreaterThan(0);

    // Applying the inverse adaptation undoes it.
    const back = matmatmul(D50.linear_srgb_chromatic_adaptation_matrix(D65), d65_to_d50);
    const round_tripped = matvecmul(back, [0.4, 0.5, 0.6]);
    expect(round_tripped[0]).toBeCloseTo(0.4, 5);
    expect(round_tripped[1]).toBeCloseTo(0.5, 5);
    expect(round_tripped[2]).toBeCloseTo(0.6, 5);
  });

  it('carries the ACES white point for the spaces this port omits', () => {
    expect(ACES.x).toBeCloseTo(0.32168, 10);
  });
});
