/**
 * A TypeScript port of the `color` crate's `colorspace.rs`, covering the trait
 * and the two color spaces the rendering pipeline composites in.
 *
 * Two deviations from upstream, both forced by the language:
 *
 * 1. A color space is a trait over a zero-sized marker upstream (`Srgb`,
 *    `LinearSrgb`, …), and conversion monomorphises on the target's `TypeId`.
 *    Here a space is a *singleton descriptor*: a value as well as a type, so
 *    `AlphaColor<Srgb>` is still the type and `Srgb` is still the value passed
 *    to `convert`. The `TypeId` identity test becomes `===` on the singleton,
 *    which is sound because there is exactly one descriptor per space.
 *
 * 2. Only `Srgb` and `LinearSrgb` are ported. They are what vello composites in
 *    — every colour that arrives as a brush or a gradient stop is converted to
 *    linear light exactly once, on the way in. The remaining spaces (Lab, Lch,
 *    Hsl, Hwb, Oklab, Oklch, DisplayP3, A98Rgb, ProphotoRgb, Rec2020, AcesCg,
 *    Aces2065-1, XyzD50, XyzD65) would add mat-multiplication constants without
 *    adding a call site, and are left out.
 *
 * `ColorSpace::scale_chroma` is left out with them: its default body routes the
 * components through Oklab, and nothing in this port scales chroma.
 */

import { Chromaticity, D50, D65 } from './chromaticity.js';
import { copysign, matvecmul, type Vec3 } from './floatfuncs.js';
import { ColorSpaceTag } from './tag.js';

/** Upstream `ColorSpaceLayout` is an enum with methods on it. */
export interface ColorSpaceLayout {
  /** Multiply all components except for hue by `scale`. */
  scale(components: Vec3, scale: number): Vec3;

  /** The index of the hue component, if the layout has one. */
  hue_channel(): number | null;
}

/** Rectangular layout: no hue component, so every channel scales. */
export const Rectangular: ColorSpaceLayout = {
  scale([c0, c1, c2], scale) {
    return [c0 * scale, c1 * scale, c2 * scale];
  },
  hue_channel() {
    return null;
  },
};

/** Hue is the first component, so it is left out of the scaling. */
export const HueFirst: ColorSpaceLayout = {
  scale([_, c1, c2], scale) {
    return [_, c1 * scale, c2 * scale];
  },
  hue_channel() {
    return 0;
  },
};

/** Hue is the third component, so it is left out of the scaling. */
export const HueThird: ColorSpaceLayout = {
  scale([c0, c1, _], scale) {
    return [c0 * scale, c1 * scale, _];
  },
  hue_channel() {
    return 2;
  },
};

/** The main trait for color spaces, upstream `ColorSpace`. */
export interface ColorSpace {
  /** Whether the color space is linear. */
  readonly IS_LINEAR: boolean;

  /** The layout of the color space. */
  readonly LAYOUT: ColorSpaceLayout;

  /** The tag corresponding to this color space, if a matching tag exists. */
  readonly TAG: ColorSpaceTag | null;

  /** The white point of the color space. */
  readonly WHITE_POINT: Chromaticity;

  /** The component values for the color white within this color space. */
  readonly WHITE_COMPONENTS: Vec3;

  /** Convert an opaque color to linear sRGB. */
  to_linear_srgb(src: Vec3): Vec3;

  /** Convert an opaque color from linear sRGB. */
  from_linear_srgb(src: Vec3): Vec3;

  /** Convert an opaque color to a different color space. */
  convert<TargetCS extends ColorSpace>(target: TargetCS, src: Vec3): Vec3;

  /** Convert an opaque color to linear sRGB, without chromatic adaptation. */
  to_linear_srgb_absolute(src: Vec3): Vec3;

  /** Convert an opaque color from linear sRGB, without chromatic adaptation. */
  from_linear_srgb_absolute(src: Vec3): Vec3;

  /** Convert an opaque color to a different color space, without adaptation. */
  convert_absolute<TargetCS extends ColorSpace>(target: TargetCS, src: Vec3): Vec3;

  /** Chromatically adapt the color between the given white point chromaticities. */
  chromatically_adapt(src: Vec3, from: Chromaticity, to: Chromaticity): Vec3;

  /** Clip the color's components to its natural gamut. */
  clip(src: Vec3): Vec3;
}

// The trait's default implementations. Each descriptor delegates to these, which
// is how the ones upstream does not override stay identical.

/**
 * Upstream compares `TypeId::of::<Self>() == TypeId::of::<TargetCS>()`.
 * TypeScript refuses `===` between two unrelated type parameters, so the test
 * goes through the base type; the operands are singletons, so `===` is still the
 * same question.
 */
export function same_space(a: ColorSpace, b: ColorSpace): boolean {
  return a === b;
}

/** Upstream `ColorSpace::convert`'s default body. */
export function convert<SourceCS extends ColorSpace, TargetCS extends ColorSpace>(
  source: SourceCS,
  target: TargetCS,
  src: Vec3,
): Vec3 {
  if (same_space(source, target)) return src;
  return target.from_linear_srgb(source.to_linear_srgb(src));
}

/** Upstream `ColorSpace::to_linear_srgb_absolute`'s default body. */
export function to_linear_srgb_absolute(self: ColorSpace, src: Vec3): Vec3 {
  const lin_srgb = self.to_linear_srgb(src);
  if (self.WHITE_POINT === D65) return lin_srgb;
  const adaptation_matrix = D65.linear_srgb_chromatic_adaptation_matrix(self.WHITE_POINT);
  return matvecmul(adaptation_matrix, lin_srgb);
}

/** Upstream `ColorSpace::from_linear_srgb_absolute`'s default body. */
export function from_linear_srgb_absolute(self: ColorSpace, src: Vec3): Vec3 {
  const adapted =
    self.WHITE_POINT === D65
      ? src
      : matvecmul(self.WHITE_POINT.linear_srgb_chromatic_adaptation_matrix(D65), src);
  return self.from_linear_srgb(adapted);
}

/** Upstream `ColorSpace::convert_absolute`'s default body. */
export function convert_absolute<SourceCS extends ColorSpace, TargetCS extends ColorSpace>(
  source: SourceCS,
  target: TargetCS,
  src: Vec3,
): Vec3 {
  if (same_space(source, target)) return src;
  return target.from_linear_srgb_absolute(source.to_linear_srgb_absolute(src));
}

/** Upstream `ColorSpace::chromatically_adapt`'s default body. */
export function chromatically_adapt(
  self: ColorSpace,
  src: Vec3,
  from: Chromaticity,
  to: Chromaticity,
): Vec3 {
  if (from === to) return src;

  // D65 <-> D50 are the two pairs with a hard-coded shortest path upstream.
  const adaptation_matrix =
    from === D65 && to === D50
      ? D65.linear_srgb_chromatic_adaptation_matrix(D50)
      : from === D50 && to === D65
        ? D50.linear_srgb_chromatic_adaptation_matrix(D65)
        : from.linear_srgb_chromatic_adaptation_matrix(to);

  const adapted = matvecmul(adaptation_matrix, to_linear_srgb_absolute(self, src));
  return from_linear_srgb_absolute(self, adapted);
}

/**
 * `ColorSpace::clip`, upstream: the per-channel clamp into the natural gamut.
 *
 * This is not vello's `clip_color`, despite the near-identical name — that one
 * moves channels along the luminance line and lives in `compose.ts` with the rest
 * of the blend arithmetic.
 */
function clip(src: Vec3): Vec3 {
  return [clamp01(src[0]), clamp01(src[1]), clamp01(src[2])];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function map3(src: Vec3, f: (x: number) => number): Vec3 {
  return [f(src[0]), f(src[1]), f(src[2])];
}

/**
 * The sRGB electro-optical transfer function, upstream `srgb_to_lin`.
 *
 * The sign handling is the point: the branch is chosen on the magnitude, so a
 * negative input takes the same branch as its absolute value and then has the
 * sign put back by `copysign`. Below the linear segment the multiply already
 * carries the sign, so `copysign` is not needed there.
 */
export function srgb_to_lin(x: number): number {
  if (Math.abs(x) <= 0.04045) {
    return x * (1.0 / 12.92);
  }
  return copysign(Math.pow((Math.abs(x) + 0.055) * (1.0 / 1.055), 2.4), x);
}

/** The inverse of {@link srgb_to_lin}, upstream `lin_to_srgb`. */
export function lin_to_srgb(x: number): number {
  if (Math.abs(x) <= 0.0031308) {
    return x * 12.92;
  }
  return copysign(1.055 * Math.pow(Math.abs(x), 1.0 / 2.4) - 0.055, x);
}

/**
 * The standard RGB color space, upstream `Srgb`.
 *
 * The marker interface stands in for the zero-sized marker type: it narrows
 * `TAG` to a single literal, which is what keeps `AlphaColor<Srgb>` and
 * `AlphaColor<LinearSrgb>` distinct types the way `PhantomData<CS>` does
 * upstream.
 */
export interface Srgb extends ColorSpace {
  readonly TAG: ColorSpaceTag.Srgb;
}

export const Srgb: Srgb = {
  IS_LINEAR: false,
  LAYOUT: Rectangular,
  TAG: ColorSpaceTag.Srgb,
  WHITE_POINT: D65,
  WHITE_COMPONENTS: [1, 1, 1],

  to_linear_srgb: (src) => map3(src, srgb_to_lin),
  from_linear_srgb: (src) => map3(src, lin_to_srgb),
  convert: (target, src) => convert(Srgb, target, src),
  to_linear_srgb_absolute: (src) => to_linear_srgb_absolute(Srgb, src),
  from_linear_srgb_absolute: (src) => from_linear_srgb_absolute(Srgb, src),
  convert_absolute: (target, src) => convert_absolute(Srgb, target, src),
  chromatically_adapt: (src, from, to) => chromatically_adapt(Srgb, src, from, to),
  clip,
};

/**
 * The linear-light RGB color space with sRGB primaries, upstream `LinearSrgb`.
 *
 * This is the space vello composites in: a premultiplied `AlphaColor<Srgb>`
 * converts to a premultiplied `PremulColor<LinearSrgb>` by unpremultiplying,
 * linearizing and premultiplying again, which `PremulColor::convert` does.
 */
export interface LinearSrgb extends ColorSpace {
  readonly TAG: ColorSpaceTag.LinearSrgb;
}

export const LinearSrgb: LinearSrgb = {
  IS_LINEAR: true,
  LAYOUT: Rectangular,
  TAG: ColorSpaceTag.LinearSrgb,
  WHITE_POINT: D65,
  WHITE_COMPONENTS: [1, 1, 1],

  to_linear_srgb: (src) => src,
  from_linear_srgb: (src) => src,
  convert: (target, src) => convert(LinearSrgb, target, src),
  to_linear_srgb_absolute: (src) => to_linear_srgb_absolute(LinearSrgb, src),
  from_linear_srgb_absolute: (src) => from_linear_srgb_absolute(LinearSrgb, src),
  convert_absolute: (target, src) => convert_absolute(LinearSrgb, target, src),
  chromatically_adapt: (src, from, to) => chromatically_adapt(LinearSrgb, src, from, to),
  clip,
};
