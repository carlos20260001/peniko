import { describe, expect, it } from 'vitest';

import {
  BlendMode,
  Compose,
  Extend,
  Gradient,
  ImageBrush,
  ImageQuality,
  Mix,
  gradientBrush,
  imageBrush,
  solidBrush,
} from './peniko.js';
import {
  applyCoverage,
  compose,
  mix,
  premultiply,
  unpremultiply,
  type Color4,
} from './compose.js';

const c = (r: number, g: number, b: number, a = 1): Color4 => ({ r, g, b, a });

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

  it('normal returns the source', () => {
    expect(mix(src, bg, Mix.Normal)).toEqual(src);
  });

  it('multiply', () => {
    const r = mix(src, bg, Mix.Multiply);
    expect(r.r).toBeCloseTo(0.2, 6);
    expect(r.g).toBeCloseTo(0.24, 6);
    expect(r.b).toBeCloseTo(0.09, 6);
    expect(r.a).toBe(1);
  });

  it('screen', () => {
    // r: 0.25 + 0.8 - 0.25*0.8 = 0.85
    expect(mix(src, bg, Mix.Screen).r).toBeCloseTo(0.85, 5);
  });

  it('darken and lighten take the per-channel extreme', () => {
    expect(mix(src, bg, Mix.Darken).r).toBe(0.25);
    expect(mix(src, bg, Mix.Darken).b).toBe(0.1);
    expect(mix(src, bg, Mix.Lighten).r).toBe(0.8);
    expect(mix(src, bg, Mix.Lighten).b).toBe(0.9);
  });

  it('difference is the magnitude of the delta', () => {
    expect(mix(src, bg, Mix.Difference).r).toBeCloseTo(0.55, 5);
    expect(mix(src, bg, Mix.Difference).g).toBeCloseTo(0.2, 5);
  });

  it('exclusion', () => {
    // r: 0.25 + 0.8 - 2*0.25*0.8 = 0.65
    expect(mix(src, bg, Mix.Exclusion).r).toBeCloseTo(0.65, 5);
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
    expect(r.r).toBeGreaterThanOrEqual(0);
    expect(r.r).toBeLessThanOrEqual(1);
  });

  it('hue keeps the backdrop hue with the source saturation and luminance', () => {
    // Hue takes sat and lum from the backdrop, keeping source hue.
    const s = c(1, 0, 0);
    const b = c(0, 1, 0);
    const out = mix(s, b, Mix.Hue);
    expect(out.r).toBeGreaterThan(out.g);
    expect(out.g).toBeGreaterThanOrEqual(out.b);
  });

  it('color keeps the source hue and saturation', () => {
    const s = c(1, 0, 0);
    const b = c(0.2, 0.7, 0.2);
    expect(mix(s, b, Mix.Color).r).toBeGreaterThan(mix(s, b, Mix.Color).g);
  });

  it('luminosity collapses to black when the source is black', () => {
    // SetLum(Cb, 0) on (0.8, 0.4, 0.4): after the luminance shift the colour is
    // (0.28, -0.12, -0.12), and clip_color's term has l = 0 in the numerator,
    // so every channel collapses to 0. That is vello's clip_color behaving
    // exactly as written, not a clamping shortcut.
    const out = mix(c(0, 0, 0), c(0.8, 0.4, 0.4), Mix.Luminosity);
    expect(out.r).toBeCloseTo(0, 6);
    expect(out.g).toBeCloseTo(0, 6);
    expect(out.b).toBeCloseTo(0, 6);
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
    expect(out).toEqual(c(1, 0, 0, 1));
  });

  it('src-over blends alpha correctly', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 1, 0, 1), {
      mix: Mix.Normal,
      compose: Compose.SrcOver,
    });
    // Porter-Duff over an opaque destination: the source colour replaces it
    // outright and alpha saturates, rather than blending to 0.75.
    expect(out.a).toBeCloseTo(1, 6);
    expect(out.r).toBeCloseTo(1, 6);
    expect(out.g).toBeCloseTo(0, 6);
  });

  it('src-in masks the source to the destination alpha', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 0, 1, 0.25), {
      mix: Mix.Normal,
      compose: Compose.SrcIn,
    });
    expect(out.a).toBeCloseTo(0.125, 6);
  });

  it('src-out keeps only where the destination is absent', () => {
    const out = compose(c(1, 0, 0, 0.5), c(0, 1, 0, 0.75), {
      mix: Mix.Normal,
      compose: Compose.SrcOut,
    });
    expect(out.a).toBeCloseTo(0.125, 6);
  });

  it('plus and plus-lighter are additive', () => {
    const out = compose(c(1, 0, 0, 1), c(0, 1, 0, 1), {
      mix: Mix.Normal,
      compose: Compose.Plus,
    });
    // Premultiplied, both opaque: r + g channels add, alpha saturates at 1.
    expect(out.r).toBe(1);
    expect(out.g).toBe(1);
    expect(out.a).toBe(1);
  });

  it('clear empties the destination', () => {
    expect(
      compose(c(1, 1, 1, 1), c(1, 1, 1, 1), { mix: Mix.Normal, compose: Compose.Clear }),
    ).toEqual(c(0, 0, 0, 0));
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
      expect(rt).toEqual(col);
    }
  });

  it('handles fully transparent colour', () => {
    expect(unpremultiply(c(0, 0, 0, 0))).toEqual(c(0, 0, 0, 0));
  });
});

describe('coverage fill', () => {
  it('scales alpha by coverage', () => {
    const out = applyCoverage(c(1, 0, 0, 1), 0.5);
    expect(out.a).toBeCloseTo(0.5, 6);
    expect(out.r).toBeCloseTo(0.5, 6);
    expect(out.g).toBe(0);
  });

  it('leaves nothing where coverage is zero', () => {
    expect(applyCoverage(c(1, 0, 0, 1), 0)).toEqual(c(0, 0, 0, 0));
  });
});

describe('brushes', () => {
  it('constructs each variant', () => {
    expect(solidBrush(0xff0000ff)).toEqual({ kind: 'solid', color: 0xff0000ff });
    const g = gradientBrush(
      new Gradient(
        { kind: 'linear', position: { startX: 0, startY: 0, endX: 10, endY: 0 } },
        [
          { offset: 0, color: 0 },
          { offset: 1, color: 0xffffffff },
        ],
      ),
    );
    expect(g.kind).toBe('gradient');
    const i = imageBrush(
      new ImageBrush({ kind: 'rgba8', data: new Uint8Array([1, 2, 3, 4]), width: 1, height: 1 }),
    );
    expect(i.kind).toBe('image');
  });

  it('defaults gradient extend and interpolation space', () => {
    const grad = new Gradient({
      kind: 'radial',
      position: { startX: 0, startY: 0, startRadius: 0, endX: 0, endY: 0, endRadius: 10 },
    }, []);
    expect(grad.extend).toBe(Extend.Pad);
    expect(grad.interpolationAlphaSpace).toBe('srgb');
    expect(grad.interpolationHueDirection).toBe('shorter');
    expect(ImageQuality.Medium).toBe('medium');
  });
});
