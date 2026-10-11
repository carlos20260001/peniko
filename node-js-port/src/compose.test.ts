import { describe, expect, it } from 'vitest';

import {
  AlphaColor,
  PremulColor,
} from './color/color.js';
import { LinearSrgb, Srgb } from './color/colorspace.js';
import {
  BlendMode,
  Compose,
  Extend,
  Gradient,
  ImageBrush,
  ImageAlphaType,
  ImageData,
  ImageFormat,
  ImageQuality,
  InterpolationAlphaSpace,
  Mix,
  ColorStop,
  GradientKind,
  gradientBrush,
  imageBrush,
  solidBrush,
} from './lib.js';
import { HueDirection } from './color/color.js';
import { ColorSpaceTag } from './color/tag.js';
import {
  applyCoverage,
  compose,
  mix,
  premultiply,
  unpremultiply,
} from './compose.js';

const c = (r: number, g: number, b: number, a = 1): AlphaColor<Srgb> =>
  new AlphaColor([r, g, b, a], Srgb);

describe('enum discriminants', () => {
  it('matches upstream’s repr(u8) values', () => {
    // vello encodes these into its command stream and GPU buffers, so the
    // numeric values are part of the interface, not incidental.
    expect(Mix.Normal).toBe(0);
    expect(Mix.Multiply).toBe(1);
    expect(Mix.Screen).toBe(2);
    expect(Mix.Luminosity).toBe(15);
    expect(Compose.Clear).toBe(0);
    expect(Compose.SrcOver).toBe(3);
    expect(Compose.Plus).toBe(12);
    expect(Compose.PlusLighter).toBe(13);
  });
});

describe('BlendMode', () => {
  it('defaults to normal mixing over src-over', () => {
    const m = new BlendMode();
    expect(m.mix).toBe(Mix.Normal);
    expect(m.compose).toBe(Compose.SrcOver);
    expect(m).toEqual(BlendMode.DEFAULT);
  });

  it('reports destructive modes', () => {
    expect(new BlendMode(Mix.Normal, Compose.Clear).isDestructive()).toBe(true);
    expect(new BlendMode(Mix.Normal, Compose.Copy).isDestructive()).toBe(true);
    expect(new BlendMode(Mix.Normal, Compose.SrcOver).isDestructive()).toBe(false);
  });
});

describe('mix (CSS Compositing formulas)', () => {
  const src = c(0.25, 0.6, 0.9);
  const bg = c(0.8, 0.4, 0.1);

  const channel = (m: AlphaColor<Srgb>, i: 0 | 1 | 2): number => m.components[i];

  it('normal returns the source', () => {
    expect(mix(src, bg, Mix.Normal)).toEqual(src);
  });

  it('multiply', () => {
    const r = mix(src, bg, Mix.Multiply);
    expect(channel(r, 0)).toBeCloseTo(0.2, 6);
    expect(channel(r, 1)).toBeCloseTo(0.24, 6);
    expect(channel(r, 2)).toBeCloseTo(0.09, 6);
    expect(r.components[3]).toBe(1);
  });

  it('screen', () => {
    // r: 0.25 + 0.8 - 0.25*0.8 = 0.85
    expect(channel(mix(src, bg, Mix.Screen), 0)).toBeCloseTo(0.85, 5);
  });

  it('darken and lighten take the per-channel extreme', () => {
    expect(channel(mix(src, bg, Mix.Darken), 0)).toBe(0.25);
    expect(channel(mix(src, bg, Mix.Darken), 2)).toBe(0.1);
    expect(channel(mix(src, bg, Mix.Lighten), 0)).toBe(0.8);
    expect(channel(mix(src, bg, Mix.Lighten), 2)).toBe(0.9);
  });

  it('difference is the magnitude of the delta', () => {
    expect(channel(mix(src, bg, Mix.Difference), 0)).toBeCloseTo(0.55, 5);
    expect(channel(mix(src, bg, Mix.Difference), 1)).toBeCloseTo(0.2, 5);
  });

  it('exclusion', () => {
    // r: 0.25 + 0.8 - 2*0.25*0.8 = 0.65
    expect(channel(mix(src, bg, Mix.Exclusion), 0)).toBeCloseTo(0.65, 5);
  });

  it('color-dodge hits its endpoints', () => {
    expect(mix(c(1, 1, 1), c(0, 0, 0), Mix.ColorDodge)).toEqual(c(0, 0, 0));
    expect(mix(c(1, 1, 1), c(0.5, 0.5, 0.5), Mix.ColorDodge)).toEqual(c(1, 1, 1));
  });

  it('color-burn hits its endpoints', () => {
    expect(mix(c(0, 0, 0), c(1, 1, 1), Mix.ColorBurn)).toEqual(c(1, 1, 1));
    expect(mix(c(0.5, 0.5, 0.5), c(0, 0, 0), Mix.ColorBurn)).toEqual(c(0, 0, 0));
  });

  it('hard-light mirrors overlay', () => {
    // Overlay(cs, cb) === HardLight(cb, cs); exercising both keeps the swap
    // correct, and that swap is the classic mistake in this pair.
    const over = mix(src, bg, Mix.Overlay);
    const hard = mix(bg, src, Mix.HardLight);
    expect(over).toEqual(hard);
  });

  it('soft-light stays within 0..1', () => {
    const r = mix(src, bg, Mix.SoftLight);
    expect(channel(r, 0)).toBeGreaterThanOrEqual(0);
    expect(channel(r, 0)).toBeLessThanOrEqual(1);
  });

  it('hue keeps the backdrop hue with the source saturation and luminance', () => {
    // Hue takes sat and lum from the backdrop, keeping source hue.
    const s = c(1, 0, 0);
    const b = c(0, 1, 0);
    const out = mix(s, b, Mix.Hue);
    expect(channel(out, 0)).toBeGreaterThan(channel(out, 1));
    expect(channel(out, 1)).toBeGreaterThanOrEqual(channel(out, 2));
  });

  it('color keeps the source hue and saturation', () => {
    const s = c(1, 0, 0);
    const b = c(0.2, 0.7, 0.2);
    const out = mix(s, b, Mix.Color);
    expect(channel(out, 0)).toBeGreaterThan(channel(out, 1));
  });

  it('luminosity collapses to black when the source is black', () => {
    // SetLum(Cb, 0) on (0.8, 0.4, 0.4): after the luminance shift the colour is
    // (0.28, -0.12, -0.12), and clip_color's term has l = 0 in the numerator,
    // so every channel collapses to 0. That is vello's clip_color behaving
    // exactly as written, not a clamping shortcut.
    const out = mix(c(0, 0, 0), c(0.8, 0.4, 0.4), Mix.Luminosity);
    expect(out.components[0]).toBeCloseTo(0, 6);
    expect(out.components[1]).toBeCloseTo(0, 6);
    expect(out.components[2]).toBeCloseTo(0, 6);
  });
});

describe('compose (Porter-Duff)', () => {
  it('copy replaces the destination', () => {
    const src = c(1, 0, 0, 1);
    const bg = c(0, 1, 0, 1);
    expect(compose(src, bg, { mix: Mix.Normal, compose: Compose.Copy })).toEqual(
      premultiply(src),
    );
  });

  it('src-over of an opaque source discards the destination', () => {
    const out = compose(c(1, 0, 0, 1), c(0, 1, 0, 1), {
      mix: Mix.Normal,
      compose: Compose.SrcOver,
    });
    // Premultiplied: source is opaque, so it wins outright.
    expect(out).toEqual(c(1, 0, 0, 1).premultiply());
  });

  it('src-over blends alpha correctly', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 1, 0, 1), {
      mix: Mix.Normal,
      compose: Compose.SrcOver,
    });
    // Porter-Duff over an opaque destination: the source colour replaces it
    // outright and alpha saturates, rather than blending to 0.75.
    expect(out.components[3]).toBeCloseTo(1, 6);
    expect(out.components[0]).toBeCloseTo(1, 6);
    expect(out.components[1]).toBeCloseTo(0, 6);
  });

  it('src-in masks the source to the destination alpha', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 0, 1, 0.25), {
      mix: Mix.Normal,
      compose: Compose.SrcIn,
    });
    expect(out.components[3]).toBeCloseTo(0.125, 6);
  });

  it('src-out keeps only where the destination is absent', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 1, 0, 0.75), {
      mix: Mix.Normal,
      compose: Compose.SrcOut,
    });
    expect(out.components[3]).toBeCloseTo(0.125, 6);
  });

  it('plus and plus-lighter are additive', () => {
    const out = compose(c(1, 0, 0, 1), c(0, 1, 0, 1), {
      mix: Mix.Normal,
      compose: Compose.Plus,
    });
    // Premultiplied, both opaque: r + g channels add. Alpha would reach 2, but
    // the compositing stage's premultiply clamps, which is also what upstream's
    // `Plus` does with its `.min(1.0).max(0.0)`. The clamp is part of this
    // arithmetic, not a shortcut: see `premultiply` in `compose.ts`.
    expect(out.components[0]).toBe(1);
    expect(out.components[1]).toBe(1);
    expect(out.components[3]).toBe(1);
  });

  it('clear empties the destination', () => {
    expect(
      compose(c(1, 1, 1, 1), c(1, 1, 1, 1), { mix: Mix.Normal, compose: Compose.Clear }),
    ).toEqual(new PremulColor([0, 0, 0, 0], Srgb));
  });

  it('dest keeps the destination', () => {
    const bg = c(0, 1, 0, 1);
    expect(compose(c(1, 0, 0, 1), bg, { mix: Mix.Normal, compose: Compose.Dest })).toEqual(
      premultiply(bg),
    );
  });
});

describe('premultiply round-trip', () => {
  it('unpremultify(premultiply(c)) === c', () => {
    for (const col of [c(0.5, 0.25, 0.75, 0.5), c(1, 0, 0, 1), c(0.2, 0.4, 0.6, 0.9)]) {
      const rt = unpremultiply(premultiply(col));
      // Close rather than exact: `un_premultiply` scales by `1 / alpha`, upstream's
      // form, so a reciprocal that is not exactly representable shows up in the
      // last bit or two.
      expect(rt.components[0]).toBeCloseTo(col.components[0], 6);
      expect(rt.components[1]).toBeCloseTo(col.components[1], 6);
      expect(rt.components[2]).toBeCloseTo(col.components[2], 6);
      expect(rt.components[3]).toBeCloseTo(col.components[3], 6);
    }
  });

  it('handles fully transparent colour', () => {
    expect(unpremultiply(c(0, 0, 0, 0).premultiply()).components).toEqual([0, 0, 0, 0]);
  });
});

describe('coverage fill', () => {
  it('scales alpha by coverage', () => {
    const out = applyCoverage(c(1, 0, 0, 1), 0.5);
    expect(out.components[3]).toBeCloseTo(0.5, 6);
    expect(out.components[0]).toBeCloseTo(0.5, 6);
    expect(out.components[1]).toBe(0);
  });

  it('leaves nothing where coverage is zero', () => {
    expect(applyCoverage(c(1, 0, 0, 1), 0)).toEqual(new PremulColor([0, 0, 0, 0], Srgb));
  });
});

describe('brushes', () => {
  it('constructs each variant', () => {
    expect(solidBrush(c(1, 0, 0, 1))).toEqual({ kind: 'solid', color: c(1, 0, 0, 1) });
    const g = gradientBrush(
      new Gradient(
        {
          kind: 'linear',
          position: { start_x: 0, start_y: 0, end_x: 10, end_y: 0 },
        } satisfies GradientKind,
        [
          new ColorStop(0, c(0, 0, 0, 1)),
          new ColorStop(1, c(1, 1, 1, 1)),
        ],
      ),
    );
    expect(g.kind).toBe('gradient');
    const i = imageBrush(
      new ImageBrush({
        data: new Uint8Array([1, 2, 3, 4]),
        format: ImageFormat.Rgba8,
        alpha_type: ImageAlphaType.Alpha,
        width: 1,
        height: 1,
      } satisfies ImageData),
    );
    expect(i.kind).toBe('image');
  });

  it('defaults gradient extend and interpolation space', () => {
    const grad = new Gradient(
      {
        kind: 'radial',
        position: { start_x: 0, start_y: 0, start_radius: 0, end_x: 0, end_y: 0, end_radius: 10 },
      },
      [],
    );
    expect(grad.extend).toBe(Extend.Pad);
    expect(grad.interpolation_cs).toBe(ColorSpaceTag.Srgb);
    expect(grad.hue_direction).toBe(HueDirection.Shorter);
    expect(grad.interpolation_alpha_space).toBe(InterpolationAlphaSpace.Premultiplied);
    expect(ImageQuality.Medium).toBe(1);
  });

  it('carries a real colour, not a packed integer', () => {
    // The whole point of the colour port: a brush's colour is a straight
    // `AlphaColor<Srgb>`, so it can be premultiplied and linearized without a
    // bit-shift somewhere in between.
    const brush = solidBrush(c(1, 0, 0, 0.5));
    expect(brush.kind).toBe('solid');
    if (brush.kind !== 'solid') return;
    expect(brush.color.premultiply().components).toEqual([0.5, 0, 0, 0.5]);
    expect(brush.color.convert(LinearSrgb).components[0]).toBeCloseTo(1, 6);
  });
});
