import { describe, expect, it } from 'vitest';

import {
  AlphaColor,
  HueDirection,
  OpaqueColor,
  PremulColor,
  fast_round_to_u8,
} from './color.js';
import { LinearSrgb, Srgb } from './colorspace.js';
import { PremulRgba8, Rgba8 } from './rgba8.js';

describe('AlphaColor', () => {
  it('splits and re-attaches alpha', () => {
    const c = new AlphaColor([0.1, 0.2, 0.3, 0.4], Srgb);
    const [opaque, alpha] = c.split();
    expect(opaque.components).toEqual([0.1, 0.2, 0.3]);
    expect(alpha).toBe(0.4);
    expect(opaque.with_alpha(alpha)).toEqual(c);
    expect(c.discard_alpha()).toEqual(opaque);
  });

  it('replaces alpha rather than scaling it', () => {
    const c = new AlphaColor([0.1, 0.2, 0.3, 0.4], Srgb);
    expect(c.with_alpha(0.9).components[3]).toBe(0.9);
    expect(c.multiply_alpha(2).components[3]).toBe(0.8);
  });

  it('premultiplies the channels and leaves alpha alone', () => {
    const c = new AlphaColor([0.8, 0.4, 0.2, 0.5], Srgb);
    expect(c.premultiply().components).toEqual([0.4, 0.2, 0.1, 0.5]);
  });

  it('premultiplies every channel of a rectangular space', () => {
    // A cylindrical space leaves the hue channel out; sRGB has no hue, so all
    // three channels scale. This is the property vignelli relies on.
    const c = new AlphaColor([0.5, 0.5, 0.5, 0.25], Srgb);
    expect(c.premultiply().components).toEqual([0.125, 0.125, 0.125, 0.25]);
  });

  it('converts colour spaces without touching alpha', () => {
    const c = new AlphaColor([0.5, 0.5, 0.5, 0.25], Srgb);
    const lin = c.convert(LinearSrgb);
    expect(lin.cs).toBe(LinearSrgb);
    expect(lin.components[3]).toBe(0.25);
    expect(lin.components[0]).toBeCloseTo(0.21404114, 6);
  });

  it('maps components', () => {
    const col = new AlphaColor([0.1, 0.2, 0.3, 0.4], Srgb);
    const doubled = col.map((r, g, b, a) => [r * 2, g * 2, b * 2, a * 2]);
    expect(doubled.components).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
});

describe('PremulColor', () => {
  it('un-premultiplies back to the straight colour', () => {
    const c = new AlphaColor([0.8, 0.4, 0.2, 0.5], Srgb);
    expect(c.premultiply().un_premultiply()).toEqual(c);
  });

  it('round-trips at every alpha, including the fully transparent one', () => {
    // Premultiply then unpremultiply is the pair every composite goes through.
    // A transparent premultiplied colour has no colour left to recover — the
    // channels were scaled by zero — so that case is asserted separately.
    for (const alpha of [0.01, 0.25, 0.5, 0.9, 1]) {
      const back = new AlphaColor([0.8, 0.4, 0.2, alpha], Srgb).premultiply().un_premultiply();
      expect(back.components[0]).toBeCloseTo(0.8, 6);
      expect(back.components[1]).toBeCloseTo(0.4, 6);
      expect(back.components[2]).toBeCloseTo(0.2, 6);
      expect(back.components[3]).toBeCloseTo(alpha, 6);
    }
    const clear = new AlphaColor([0.8, 0.4, 0.2, 0], Srgb);
    expect(clear.premultiply().components).toEqual([0, 0, 0, 0]);
    expect(clear.premultiply().un_premultiply().components).toEqual([0, 0, 0, 0]);
  });

  it('keeps the premultiply when both spaces are linear', () => {
    // sRGB is not linear, so premultiplied sRGB must be unpremultiplied before
    // the transfer function is applied; between two linear spaces the matrix
    // commute with the premultiply and it carries straight through.
    const premul = new AlphaColor([0.5, 0.5, 0.5, 0.5], Srgb).premultiply();
    expect(premul.components).toEqual([0.25, 0.25, 0.25, 0.5]);
    const lin = premul.convert(LinearSrgb);
    // Unpremultiplied first, so the transfer function sees 0.5, not 0.25.
    expect(lin.components[0]).toBeCloseTo(0.21404114 * 0.5, 6);
    expect(lin.components[3]).toBe(0.5);
  });

  it('multiplies alpha and the channels together', () => {
    const premul = new PremulColor([0.25, 0.25, 0.25, 0.5], Srgb);
    const doubled = premul.multiply_alpha(2);
    expect(doubled.components[3]).toBe(1);
    expect(doubled.components[0]).toBe(0.5);
  });
});

describe('OpaqueColor', () => {
  it('gets an opaque alpha by default', () => {
    const c = new OpaqueColor([0.1, 0.2, 0.3], Srgb);
    expect(c.with_alpha(1).components).toEqual([0.1, 0.2, 0.3, 1]);
  });
});

describe('to_rgba8', () => {
  it('saturates out-of-range components, matching Rust’s cast', () => {
    const ac = new AlphaColor([-1.01, -0.5, 1.01, 2.0], Srgb);
    expect(ac.to_rgba8()).toEqual(new Rgba8(0, 0, 255, 255));

    const pc = new PremulColor([-1.01, -0.5, 1.01, 2.0], Srgb);
    expect(pc.to_rgba8()).toEqual(new PremulRgba8(0, 0, 255, 255));
  });

  it('converts out of linear light on the way out', () => {
    // Round-tripping 8-bit grey through linear light has to land back on 128,
    // which is the whole point of the transfer functions being exact inverses.
    const grey = AlphaColor.from_rgba8(128, 0, 0, 255);
    expect(grey.convert(LinearSrgb).to_rgba8()).toEqual(new Rgba8(128, 0, 0, 255));
  });

  it('round-trips every 8-bit value through a straight colour', () => {
    for (let i = 0; i < 256; i++) {
      const c = AlphaColor.from_rgba8(i, 255 - i, 128, i);
      expect(c.to_rgba8()).toEqual(new Rgba8(i, 255 - i, 128, i));
    }
  });

  it('round-trips every 8-bit value through a premultiplied colour', () => {
    for (let i = 0; i < 256; i++) {
      const c = PremulColor.from_rgba8(i, 255 - i, 128, 255);
      expect(c.to_rgba8()).toEqual(new PremulRgba8(i, 255 - i, 128, 255));
    }
  });

  it('round-trips the packed forms back into a colour', () => {
    const straight = new Rgba8(1, 2, 3, 4);
    expect(straight.to_alpha_color().to_rgba8()).toEqual(straight);
    const premul = new PremulRgba8(0xaa, 0xbb, 0xcc, 0xff);
    expect(premul.to_premul_color().to_rgba8()).toEqual(premul);
  });
});

describe('fast_round_to_u8', () => {
  it('rounds ties up and saturates outside 0..=255', () => {
    expect(fast_round_to_u8(0.5)).toBe(1);
    expect(fast_round_to_u8(1.5)).toBe(2);
    expect(fast_round_to_u8(0)).toBe(0);
    expect(fast_round_to_u8(255)).toBe(255);
    expect(fast_round_to_u8(-0.001)).toBe(0);
    expect(fast_round_to_u8(300)).toBe(255);
    expect(fast_round_to_u8(NaN)).toBe(0);
  });

  it('rounds ties up, and does not move values a true round would leave', () => {
    // Upstream's note claims the only divergence in range is 0.49999997, which
    // rounds up because the addition happens in f32. The port adds in f64, so
    // that value stays at 0 and this agrees with a true round everywhere.
    expect(fast_round_to_u8(0.5)).toBe(1);
    expect(fast_round_to_u8(0.49999997)).toBe(0);
    expect(fast_round_to_u8(0.4999999)).toBe(0);
    expect(fast_round_to_u8(0.49999999999)).toBe(0);
  });
});

describe('HueDirection', () => {
  it('keeps upstream’s discriminants', () => {
    expect(HueDirection.Shorter).toBe(0);
    expect(HueDirection.Longer).toBe(1);
    expect(HueDirection.Increasing).toBe(2);
    expect(HueDirection.Decreasing).toBe(3);
  });
});
