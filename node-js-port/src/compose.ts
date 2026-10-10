/**
 * Blend and compose arithmetic, replacing vello's `fine::highp` blend stage and
 * peniko's blend definitions.
 *
 * Upstream splits this three ways: `peniko::blend` defines the `Mix` and
 * `Compose` enums, `vello_cpu::fine::highp::blend` implements the per-channel
 * mixing, and `vello_cpu::fine::highp::compose` implements the alpha
 * compositing. The port keeps it in one module because the two are only ever
 * used together — `compose` needs a mixed source colour to composite.
 *
 * ## The pipeline, reproduced exactly
 *
 * 1. Both source and destination are **unpremultiplied** to straight colour.
 * 2. `mix` combines the colours per channel (CSS blend modes).
 * 3. `compose` recombines alpha:
 *
 *    `(1 - bg_a) * src + bg_a * mix(src, bg)`, then premultiplied by `src_a`.
 *
 * Step 3 is vello's `apply_alpha` and it is the part that is easy to get wrong:
 * premultiplying happens *after* the mix, and the destination contributes only
 * through `bg_a`, not through its own alpha in the alpha channel.
 *
 * The per-channel formulas are the CSS Compositing and Blending spec's, which
 * is what upstream implements. The two non-separable modes (`Hue`,
 * `Saturation`, `Color`, `Luminosity`) use vello's `lum`/`sat`/`set_lum`/
 * `set_sat` helpers, so the luminance weights match even where the spec's are
 * written differently.
 *
 * Colours are straight (unpremultiplied) RGBA in 0..=1 throughout. The port
 * operates on plain numbers rather than vello's explicit SIMD types, which is a
 * pure representation change: the arithmetic is identical and the scalar path
 * is what a Node process gets.
 */

import { Compose, Mix } from './peniko.js';

/** A straight RGBA colour, 0..=1 per channel. */
export interface Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Luminance, as vello's `lum`: 0.3R + 0.59G + 0.11B. */
function lum(c: Color4): number {
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
}

/** Saturation, as vello's `sat`: max - min. */
function sat(c: Color4): number {
  return Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
}

/**
 * Sets luminance, as vello's `set_lum`: shift all channels by the luminance
 * delta, then `clip_color`.
 *
 * Clamping each channel at 0 and 1 is *not* the same thing. vello's
 * `clip_color` moves the channels toward each other along the luminance line
 * until they are in gamut, which is the CSS spec's `ClipColor`. With L = 0 on
 * (0.8, 0.4, 0.4), the shift gives (0.28, -0.12, -0.12); clamping leaves
 * (0.28, 0, 0) while `clip_color` moves all three to (0.40, 0, 0).
 */
function setLum(c: Color4, l: number): void {
  const d = l - lum(c);
  c.r = c.r + d;
  c.g = c.g + d;
  c.b = c.b + d;
  clipColor(c);
}

/**
 * Sets saturation, as vello's `set_sat`: scale each channel's distance from
 * the minimum, then the spec's `clip_color`.
 *
 * A channel of an already-grey colour maps to 0, not to the minimum, which is
 * what vello's `scale_sat_channel` does for a zero-saturation input.
 */
function setSat(c: Color4, s: number): void {
  const mn = Math.min(c.r, c.g, c.b);
  const cur = Math.max(c.r, c.g, c.b) - mn;
  const channel = (v: number): number => (cur === 0 ? 0 : (v - mn) * s / cur);
  c.r = channel(c.r);
  c.g = channel(c.g);
  c.b = channel(c.b);
  clipColor(c);
}

/** CSS `ClipColor` / vello's `clip_color`. */
function clipColor(c: Color4): void {
  const l = lum(c);
  const n = Math.min(c.r, c.g, c.b);
  const x = Math.max(c.r, c.g, c.b);

  if (n < 0) {
    // Move each channel toward the others along the luminance line.
    c.r = l + ((c.r - l) * l) / (l - n);
    c.g = l + ((c.g - l) * l) / (l - n);
    c.b = l + ((c.b - l) * l) / (l - n);
  }
  if (x > 1) {
    c.r = l + ((c.r - l) * (1 - l)) / (x - l);
    c.g = l + ((c.g - l) * (1 - l)) / (x - l);
    c.b = l + ((c.b - l) * (1 - l)) / (x - l);
  }
}

/**
 * Blends two **straight** colours per channel, as vello's `mix_inner`.
 *
 * The result is straight colour; alpha is handled separately by `compose`.
 */
export function mix(src: Color4, bg: Color4, mode: Mix): Color4 {
  switch (mode) {
    case Mix.Normal:
      return { ...src };

    case Mix.Multiply:
      return { r: src.r * bg.r, g: src.g * bg.g, b: src.b * bg.b, a: src.a };

    case Mix.Screen:
      return per((cs, cb) => cb + cs - cs * cb, src, bg);

    case Mix.Overlay:
      // Upstream implements Overlay as HardLight with the operands swapped.
      return per((cs, cb) => hardLight(cb, cs), src, bg);

    case Mix.Darken:
      return per((cs, cb) => Math.min(cs, cb), src, bg);

    case Mix.Lighten:
      return per((cs, cb) => Math.max(cs, cb), src, bg);

    case Mix.Difference:
      return per((cs, cb) => Math.abs(cb - cs), src, bg);

    case Mix.Exclusion:
      return per((cs, cb) => cb + cs - 2 * cb * cs, src, bg);

    case Mix.ColorDodge:
      // cb == 0 gives 0, cs == 1 gives 1, else min(1, cb / (1 - cs)).
      return per((cs, cb) => colorDodge(cs, cb), src, bg);

    case Mix.ColorBurn:
      // cb == 1 gives 1, cs == 0 gives 0, else 1 - min(1, (1 - cb) / cs).
      return per((cs, cb) => colorBurn(cs, cb), src, bg);

    case Mix.HardLight:
      return per((cs, cb) => hardLight(cs, cb), src, bg);

    case Mix.SoftLight:
      return per((cs, cb) => softLight(cs, cb), src, bg);

    case Mix.Hue: {
      const cs = { ...src };
      const cb = { ...bg };
      const cbSat = sat(cb);
      const cbLum = lum(cb);
      setSat(cs, cbSat);
      setLum(cs, cbLum);
      return cs;
    }

    case Mix.Saturation: {
      const cs = { ...src };
      const cb = { ...bg };
      const cbLum = lum(cb);
      setSat(cb, sat(cs));
      setLum(cb, cbLum);
      return cb;
    }

    case Mix.Color: {
      const cs = { ...src };
      setLum(cs, lum(bg));
      return cs;
    }

    case Mix.Luminosity: {
      const cb = { ...bg };
      setLum(cb, lum(src));
      return cb;
    }
  }
}

/** Applies a per-channel function across RGB, keeping alpha. */
function per(f: (cs: number, cb: number) => number, src: Color4, bg: Color4): Color4 {
  return {
    r: f(src.r, bg.r),
    g: f(src.g, bg.g),
    b: f(src.b, bg.b),
    a: src.a,
  };
}

/** CSS `hard-light`. */
function hardLight(cs: number, cb: number): number {
  if (cs <= 0.5) return mul(cb, 2 * cs);
  return screen(cb, 2 * cs - 1);
}

/** CSS `multiply`. */
function mul(cs: number, cb: number): number {
  return cs * cb;
}

/** CSS `screen`. */
function screen(cs: number, cb: number): number {
  return cb + cs - cs * cb;
}

/** CSS `color-dodge`. */
function colorDodge(cs: number, cb: number): number {
  if (cb === 0) return 0;
  if (cs === 1) return 1;
  return Math.min(1, cb / (1 - cs));
}

/** CSS `color-burn`. */
function colorBurn(cs: number, cb: number): number {
  if (cb === 1) return 1;
  if (cs === 0) return 0;
  return 1 - Math.min(1, (1 - cb) / cs);
}

/** CSS `soft-light`, with vello's same `d` term. */
function softLight(cs: number, cb: number): number {
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
  return cb + (2 * cs - 1) * (d - cb);
}

/**
 * Composites a source over a destination, as vello's `compose`.
 *
 * `src` and `bg` are straight (unpremultiplied) RGBA; the result is
 * **premultiplied** by the source's alpha, which is what the caller expects to
 * write into a premultiplied buffer.
 *
 * `(1 - bg_a) * src + bg_a * mixed`, premultiplied by `src_a`.
 */
export function compose(
  src: Color4,
  bg: Color4,
  mode: { readonly mix: Mix; readonly compose: Compose },
): Color4 {
  const mixed = mix(src, bg, mode.mix);

  switch (mode.compose) {
    case Compose.Clear:
      return { r: 0, g: 0, b: 0, a: 0 };

    case Compose.Copy:
      return premultiply(src);

    case Compose.Dest:
      return premultiply(bg);

    case Compose.SrcOver:
      // The same (1 - bg_a) * src + bg_a * mixed form as the general path,
      // spelled out because this is the mode every caller uses.
      return premultiply({
        r: (1 - bg.a) * mixed.r + bg.a * mixed.r,
        g: (1 - bg.a) * mixed.g + bg.a * mixed.g,
        b: (1 - bg.a) * mixed.b + bg.a * mixed.b,
        a: src.a + bg.a * (1 - src.a),
      });

    case Compose.DestOver:
      return premultiply({
        r: bg.r * bg.a + mixed.r * (1 - bg.a) * src.a,
        g: bg.g * bg.a + mixed.g * (1 - bg.a) * src.a,
        b: bg.b * bg.a + mixed.b * (1 - bg.a) * src.a,
        a: bg.a + src.a * (1 - bg.a),
      });

    case Compose.SrcIn:
      return premultiply({ r: mixed.r, g: mixed.g, b: mixed.b, a: src.a * bg.a });

    case Compose.DestIn:
      return premultiply({ r: bg.r, g: bg.g, b: bg.b, a: src.a * bg.a });

    case Compose.SrcOut:
      return premultiply({ r: mixed.r, g: mixed.g, b: mixed.b, a: src.a * (1 - bg.a) });

    case Compose.DestOut:
      return premultiply({ r: bg.r, g: bg.g, b: bg.b, a: bg.a * (1 - src.a) });

    case Compose.SrcAtop:
      return premultiply({
        r: mixed.r * src.a * bg.a + bg.r * (1 - src.a) * bg.a,
        g: mixed.g * src.a * bg.a + bg.g * (1 - src.a) * bg.a,
        b: mixed.b * src.a * bg.a + bg.b * (1 - src.a) * bg.a,
        a: src.a * bg.a + bg.a * (1 - src.a) * bg.a,
      });

    case Compose.DestAtop:
      return premultiply({
        r: mixed.r * src.a * (1 - bg.a) + bg.r * bg.a * (1 - src.a),
        g: mixed.g * src.a * (1 - bg.a) + bg.g * bg.a * (1 - src.a),
        b: mixed.b * src.a * (1 - bg.a) + bg.b * bg.a * (1 - src.a),
        a: src.a * (1 - bg.a) + bg.a * (1 - src.a),
      });

    case Compose.Xor:
      return premultiply({
        r: mixed.r * src.a * (1 - bg.a) + bg.r * bg.a * (1 - src.a),
        g: mixed.g * src.a * (1 - bg.a) + bg.g * bg.a * (1 - src.a),
        b: mixed.b * src.a * (1 - bg.a) + bg.b * bg.a * (1 - src.a),
        a: src.a * (1 - bg.a) + bg.a * (1 - src.a),
      });

    case Compose.Plus:
    case Compose.PlusLighter:
      // Upstream treats both as additive; `PlusLighter` is the CSS
      // `lighter` keyword that Porter-Duff calls `Plus`.
      return premultiply({
        r: mixed.r * src.a + bg.r * bg.a,
        g: mixed.g * src.a + bg.g * bg.a,
        b: mixed.b * src.a + bg.b * bg.a,
        a: src.a + bg.a,
      });
  }
}

/** Converts straight colour to premultiplied, clamping each channel. */
export function premultiply(c: Color4): Color4 {
  return {
    r: clamp01(c.r * c.a),
    g: clamp01(c.g * c.a),
    b: clamp01(c.b * c.a),
    a: clamp01(c.a),
  };
}

/** Converts premultiplied colour back to straight, as vello's `unpremultiply`. */
export function unpremultiply(c: Color4): Color4 {
  if (c.a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  return { r: c.r / c.a, g: c.g / c.a, b: c.b / c.a, a: c.a };
}

/**
 * Applies alpha coverage to a span, as vello's coverage-based fill does.
 *
 * `coverage` is the antialiased coverage of a pixel in 0..=1; a fully covered
 * pixel composites normally, a non-covered one leaves the destination alone.
 */
export function applyCoverage(src: Color4, coverage: number): Color4 {
  const pm = premultiply(src);
  return { r: clamp01(pm.r * coverage), g: clamp01(pm.g * coverage), b: clamp01(pm.b * coverage), a: clamp01(pm.a * coverage) };
}
