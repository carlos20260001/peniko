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
 * ## Colour
 *
 * The port's earlier hand-rolled `Color4` is gone. `mix` takes straight
 * `AlphaColor`s and `compose` returns a `PremulColor`, so a caller cannot
 * accidentally feed the blend a premultiplied colour or write a straight one
 * into a premultiplied target. Colours stay straight and in 0..=1 for the
 * per-channel arithmetic, which is what the spec is written for; the conversion
 * to and from that is the colour types' `premultiply` / `un_premultiply`, and it
 * happens here rather than at every call site.
 *
 * The types are generic over the colour space, because every formula below is
 * per-channel and therefore space-agnostic. Whether the *pipeline* should be in
 * linear light is not this module's decision — see the crate README. What is
 * this module's decision, inherited from the arithmetic it ports, is that the
 * premultiply at the end of `compose` clamps; see the note on `premultiply`.
 */

import { AlphaColor, PremulColor } from './color/color.js';
import type { ColorSpace } from './color/lib.js';
import { Compose, Mix } from './blend.js';

/**
 * A straight RGBA colour as four plain numbers.
 *
 * The per-channel helpers below mutate in place, which is how upstream spells
 * `set_lum` and `clip_color`; this is their working shape, and the boundaries
 * of the module convert to and from the colour types.
 */
interface Straight {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function to_straight<CS extends ColorSpace>(c: AlphaColor<CS>): Straight {
  const [r, g, b, a] = c.components;
  return { r, g, b, a };
}

function from_straight<CS extends ColorSpace>(s: Straight, cs: CS): AlphaColor<CS> {
  return new AlphaColor([s.r, s.g, s.b, s.a], cs);
}

/**
 * The premultiply this module's arithmetic is written against, and the one the
 * exported `premultiply` delegates to.
 *
 * It clamps, which `AlphaColor::premultiply` does not: the compositing formulas
 * below are vello's `apply_alpha` followed by the Porter-Duff combination, and
 * the result is read back out of a `PremulColor` that is expected to be in
 * gamut. The clamp is therefore part of the arithmetic, not a shortcut — see the
 * note on the exported `premultiply`.
 */
function premultiply_straight<CS extends ColorSpace>(s: Straight, cs: CS): PremulColor<CS> {
  return new PremulColor(
    [clamp01(s.r * s.a), clamp01(s.g * s.a), clamp01(s.b * s.a), clamp01(s.a)],
    cs,
  );
}

/** Luminance, as vello's `lum`: 0.3R + 0.59G + 0.11B. */
function lum(c: Straight): number {
  return 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
}

/** Saturation, as vello's `sat`: max - min. */
function sat(c: Straight): number {
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
function setLum(c: Straight, l: number): void {
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
function setSat(c: Straight, s: number): void {
  const mn = Math.min(c.r, c.g, c.b);
  const cur = Math.max(c.r, c.g, c.b) - mn;
  const channel = (v: number): number => (cur === 0 ? 0 : (v - mn) * s / cur);
  c.r = channel(c.r);
  c.g = channel(c.g);
  c.b = channel(c.b);
  clipColor(c);
}

/** CSS `ClipColor` / vello's `clip_color`. */
function clipColor(c: Straight): void {
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
export function mix<CS extends ColorSpace>(
  src: AlphaColor<CS>,
  bg: AlphaColor<CS>,
  mode: Mix,
): AlphaColor<CS> {
  const s = to_straight(src);
  const b = to_straight(bg);
  return from_straight(mixStraight(s, b, mode), src.cs);
}

function mixStraight(src: Straight, bg: Straight, mode: Mix): Straight {
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
function per(f: (cs: number, cb: number) => number, src: Straight, bg: Straight): Straight {
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
 * `src` and `bg` are straight (unpremultiplied) colours; the result is
 * **premultiplied** by the source's alpha, which is what the caller expects to
 * write into a premultiplied buffer.
 *
 * `(1 - bg_a) * src + bg_a * mixed`, premultiplied by `src_a`.
 */
export function compose<CS extends ColorSpace>(
  src: AlphaColor<CS>,
  bg: AlphaColor<CS>,
  mode: { readonly mix: Mix; readonly compose: Compose },
): PremulColor<CS> {
  const s = to_straight(src);
  const b = to_straight(bg);
  const mixed = mixStraight(s, b, mode.mix);

  switch (mode.compose) {
    case Compose.Clear:
      return premultiply_straight({ r: 0, g: 0, b: 0, a: 0 }, src.cs);

    case Compose.Copy:
      return premultiply(src);

    case Compose.Dest:
      return premultiply(bg);

    case Compose.SrcOver:
      // The same (1 - bg_a) * src + bg_a * mixed form as the general path,
      // spelled out because this is the mode every caller uses.
      return premultiply_straight(
        {
          r: (1 - b.a) * mixed.r + b.a * mixed.r,
          g: (1 - b.a) * mixed.g + b.a * mixed.g,
          b: (1 - b.a) * mixed.b + b.a * mixed.b,
          a: s.a + b.a * (1 - s.a),
        },
        src.cs,
      );

    case Compose.DestOver:
      return premultiply_straight(
        {
          r: b.r * b.a + mixed.r * (1 - b.a) * s.a,
          g: b.g * b.a + mixed.g * (1 - b.a) * s.a,
          b: b.b * b.a + mixed.b * (1 - b.a) * s.a,
          a: b.a + s.a * (1 - b.a),
        },
        src.cs,
      );

    case Compose.SrcIn:
      return premultiply_straight(
        { r: mixed.r, g: mixed.g, b: mixed.b, a: s.a * b.a },
        src.cs,
      );

    case Compose.DestIn:
      return premultiply_straight(
        { r: b.r, g: b.g, b: b.b, a: s.a * b.a },
        src.cs,
      );

    case Compose.SrcOut:
      return premultiply_straight(
        { r: mixed.r, g: mixed.g, b: mixed.b, a: s.a * (1 - b.a) },
        src.cs,
      );

    case Compose.DestOut:
      return premultiply_straight(
        { r: b.r, g: b.g, b: b.b, a: b.a * (1 - s.a) },
        src.cs,
      );

    case Compose.SrcAtop:
      return premultiply_straight(
        {
          r: mixed.r * s.a * b.a + b.r * (1 - s.a) * b.a,
          g: mixed.g * s.a * b.a + b.g * (1 - s.a) * b.a,
          b: mixed.b * s.a * b.a + b.b * (1 - s.a) * b.a,
          a: s.a * b.a + b.a * (1 - s.a) * b.a,
        },
        src.cs,
      );

    case Compose.DestAtop:
      return premultiply_straight(
        {
          r: mixed.r * s.a * (1 - b.a) + b.r * b.a * (1 - s.a),
          g: mixed.g * s.a * (1 - b.a) + b.g * b.a * (1 - s.a),
          b: mixed.b * s.a * (1 - b.a) + b.b * b.a * (1 - s.a),
          a: s.a * (1 - b.a) + b.a * (1 - s.a),
        },
        src.cs,
      );

    case Compose.Xor:
      return premultiply_straight(
        {
          r: mixed.r * s.a * (1 - b.a) + b.r * b.a * (1 - s.a),
          g: mixed.g * s.a * (1 - b.a) + b.g * b.a * (1 - s.a),
          b: mixed.b * s.a * (1 - b.a) + b.b * b.a * (1 - s.a),
          a: s.a * (1 - b.a) + b.a * (1 - s.a),
        },
        src.cs,
      );

    case Compose.Plus:
    case Compose.PlusLighter:
      // Upstream treats both as additive; `PlusLighter` is the CSS
      // `lighter` keyword that Porter-Duff calls `Plus`.
      return premultiply_straight(
        {
          r: mixed.r * s.a + b.r * b.a,
          g: mixed.g * s.a + b.g * b.a,
          b: mixed.b * s.a + b.b * b.a,
          a: s.a + b.a,
        },
        src.cs,
      );
  }
}

/**
 * Converts straight colour to premultiplied, clamped per channel.
 *
 * This is the port's spelling of vello's `apply_alpha` premultiply, and it
 * clamps — unlike `AlphaColor::premultiply`, which does not, because the colour
 * crate has no reason to and vello's does not. The clamp is load-bearing for
 * the compositing arithmetic in this module, so it is kept here rather than
 * delegated; `ColorSpace::clip` is what a caller wants otherwise.
 */
export function premultiply<CS extends ColorSpace>(c: AlphaColor<CS>): PremulColor<CS> {
  return premultiply_straight(to_straight(c), c.cs);
}

/** Converts premultiplied colour back to straight, as `PremulColor::un_premultiply`. */
export function unpremultiply<CS extends ColorSpace>(c: PremulColor<CS>): AlphaColor<CS> {
  return c.un_premultiply();
}

/**
 * Applies alpha coverage to a span, as vello's coverage-based fill does.
 *
 * `coverage` is the antialiased coverage of a pixel in 0..=1; a fully covered
 * pixel composites normally, a non-covered one leaves the destination alone.
 */
export function applyCoverage<CS extends ColorSpace>(
  src: AlphaColor<CS>,
  coverage: number,
): PremulColor<CS> {
  const pm = premultiply(src);
  const [r, g, b, a] = pm.components;
  return new PremulColor(
    [clamp01(r * coverage), clamp01(g * coverage), clamp01(b * coverage), clamp01(a * coverage)],
    src.cs,
  );
}
