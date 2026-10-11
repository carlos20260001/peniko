import { describe, expect, it } from 'vitest';

import { D65 } from './chromaticity.js';
import {
  HueFirst,
  HueThird,
  LinearSrgb,
  Rectangular,
  Srgb,
  convert,
  lin_to_srgb,
  srgb_to_lin,
  to_linear_srgb_absolute,
} from './colorspace.js';

/**
 * The transfer functions are the one place where a small transcription error
 * corrupts every pixel, so the expected values here are written out
 * independently: some from the Rust source's arithmetic, spelled out again, and
 * some from the sRGB standard itself, so an error in the port cannot cancel
 * against the same error in the expectation.
 */
describe('srgb_to_lin', () => {
  it('is the identity at the endpoints', () => {
    expect(srgb_to_lin(0)).toBe(0);
    expect(srgb_to_lin(1)).toBe(1);
  });

  it('matches the published sRGB decode of 8-bit mid grey', () => {
    // 128/255 decodes to 0.2158605… in linear light, per IEC 61966-2-1.
    expect(srgb_to_lin(128 / 255)).toBeCloseTo(0.2158605, 6);
  });

  it('takes the linear segment below the threshold', () => {
    // Both segments are continuous at 0.04045, so the branch boundary is
    // observable only by matching the standard's value at it.
    expect(srgb_to_lin(0.04045)).toBeCloseTo(0.0031308, 6);
    expect(srgb_to_lin(0.01)).toBeCloseTo(0.01 / 12.92, 10);
  });

  it('applies the 2.4 power above the threshold', () => {
    // The Rust formula, transcribed independently: ((x + 0.055) / 1.055) ^ 2.4.
    const x = 0.5;
    const expected = Math.pow((Math.abs(x) + 0.055) * (1 / 1.055), 2.4);
    expect(srgb_to_lin(x)).toBeCloseTo(expected, 12);
  });

  it('keeps the sign of a negative input', () => {
    // The branch is chosen on the magnitude and the sign restored afterwards,
    // so a negative value decodes to the negated positive decode.
    expect(srgb_to_lin(-0.5)).toBeCloseTo(-srgb_to_lin(0.5), 12);
    expect(srgb_to_lin(-1)).toBe(-1);
  });

  it('is odd, including deep inside the linear segment', () => {
    for (const x of [0.02, -0.02, 0.04045, -0.04045, 0.3, -0.9]) {
      expect(srgb_to_lin(x)).toBeCloseTo(-srgb_to_lin(-x), 12);
    }
  });
});

describe('lin_to_srgb', () => {
  it('is the identity at the endpoints', () => {
    expect(lin_to_srgb(0)).toBe(0);
    // `1.055 - 0.055` is one ulong below 1 in binary floating point, so this
    // compares close rather than exactly; Rust's f32 lands on 1.0 exactly.
    expect(lin_to_srgb(1)).toBeCloseTo(1, 12);
  });

  it('matches the published sRGB encode of mid grey', () => {
    // 0.2140411 (the decode of 0.5) encodes back to exactly 0.5.
    expect(lin_to_srgb(srgb_to_lin(0.5))).toBeCloseTo(0.5, 12);
  });

  it('takes the linear segment below the threshold', () => {
    expect(lin_to_srgb(0.0031308)).toBeCloseTo(0.04045, 4);
    expect(lin_to_srgb(0.001)).toBeCloseTo(0.001 * 12.92, 12);
  });

  it('restores the sign of a negative input', () => {
    expect(lin_to_srgb(-0.5)).toBeCloseTo(-lin_to_srgb(0.5), 12);
    expect(lin_to_srgb(-1)).toBeCloseTo(-1, 12);
  });
});

describe('round trip', () => {
  it('lin -> srgb -> lin is the identity across the range', () => {
    for (let i = 0; i <= 64; i++) {
      const v = i / 64;
      expect(lin_to_srgb(v)).toBeGreaterThanOrEqual(0);
      expect(lin_to_srgb(v)).toBeLessThanOrEqual(1);
      expect(srgb_to_lin(lin_to_srgb(v))).toBeCloseTo(v, 10);
    }
  });
});

describe('color space descriptors', () => {
  it('agrees about their layout and white point', () => {
    expect(Srgb.IS_LINEAR).toBe(false);
    expect(LinearSrgb.IS_LINEAR).toBe(true);
    expect(Srgb.LAYOUT).toBe(Rectangular);
    expect(Srgb.WHITE_POINT).toBe(D65);
    expect(Srgb.WHITE_COMPONENTS).toEqual([1, 1, 1]);
    expect(Srgb.TAG).toBe(0);
  });

  it('does not touch the hue component of a cylindrical layout', () => {
    // Premultiplication must leave hue alone, or interpolation through a
    // transparent colour takes the long way round the wheel.
    expect(HueFirst.scale([10, 0.2, 0.3], 0.5)).toEqual([10, 0.1, 0.15]);
    expect(HueThird.scale([0.3, 0.2, 10], 0.5)).toEqual([0.15, 0.1, 10]);
    expect(Rectangular.scale([0.2, 0.3, 0.4], 0.5)).toEqual([0.1, 0.15, 0.2]);
    expect(Rectangular.hue_channel()).toBe(null);
    expect(HueFirst.hue_channel()).toBe(0);
    expect(HueThird.hue_channel()).toBe(2);
  });

  it('converts srgb to linear light, channel by channel', () => {
    const lin = convert(Srgb, LinearSrgb, [0.5, 0.25, 1]);
    expect(lin[0]).toBeCloseTo(srgb_to_lin(0.5), 12);
    expect(lin[1]).toBeCloseTo(srgb_to_lin(0.25), 12);
    expect(lin[2]).toBeCloseTo(1, 12);
  });

  it('returns the same array for a space converting to itself', () => {
    const src: readonly [number, number, number] = [0.2, 0.4, 0.6];
    expect(convert(Srgb, Srgb, src)).toBe(src);
  });

  it('leaves a D65 space alone when converting absolutely', () => {
    // The absolute variants skip the chromatic adaptation, which for a D65 space
    // is the identity — so they agree with the adapting ones here.
    const src: readonly [number, number, number] = [0.2, 0.4, 0.6];
    const absolute = to_linear_srgb_absolute(Srgb, src);
    expect(absolute[0]).toBeCloseTo(srgb_to_lin(0.2), 12);
    expect(absolute[1]).toBeCloseTo(srgb_to_lin(0.4), 12);
    expect(absolute[2]).toBeCloseTo(srgb_to_lin(0.6), 12);
  });
});

describe('chromaticity', () => {
  it('reports xy', () => {
    expect(D65.x).toBe(0.3127);
    expect(D65.y).toBe(0.329);
  });

  it('converts xy to XYZ with Y = 1', () => {
    const [x, y, z] = D65.to_xyz();
    expect(y).toBe(1);
    // Z = (1 - x - y) / y, per the crate's comment.
    expect(x).toBeCloseTo(0.3127 / 0.329, 10);
    expect(z).toBeCloseTo((1 - 0.3127 - 0.329) / 0.329, 10);
  });
});
