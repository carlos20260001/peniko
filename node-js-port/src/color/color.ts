/**
 * A TypeScript port of the `color` crate's `color.rs`: `OpaqueColor`,
 * `AlphaColor`, `PremulColor` and `HueDirection`.
 *
 * ## What `CS` is here
 *
 * Upstream the color space is a `PhantomData<CS>` marker and the space itself is
 * only ever named at the type level. A TypeScript object cannot name a compile
 * time space, so the port carries the descriptor on the instance: `new
 * AlphaColor(components, Srgb)`. The descriptor is a singleton per space, so the
 * identity checks upstream writes as `TypeId::of::<CS>() == TypeId::of::<T>()`
 * are `this.cs === target` here.
 *
 * ## The three representations
 *
 * `OpaqueColor` has no alpha, `AlphaColor` carries straight (unpremultiplied)
 * alpha, and `PremulColor` carries channels premultiplied by it. Compositing is
 * defined on the premultiplied form, so that is the one a render target holds;
 * colour-space conversion has to undo it first, because a transfer function is
 * not linear and therefore does not commute with the premultiply.
 */

import { PremulRgba8, Rgba8 } from './rgba8.js';
import { ColorSpace, same_space as is_same_space, Srgb } from './colorspace.js';
import { u8_to_f32, type Vec3, type Vec4 } from './floatfuncs.js';

/** The hue direction for interpolation, upstream `HueDirection`. */
export enum HueDirection {
  /** Hue angles take the shorter of the two arcs between starting and ending values. */
  Shorter = 0,
  /** Hue angles take the longer of the two arcs between starting and ending values. */
  Longer = 1,
  /** Hue angles increase as they are interpolated. */
  Increasing = 2,
  /** Hue angles decrease as they are interpolated. */
  Decreasing = 3,
}

/** A color in a color space known at compile time, without transparency. */
export class OpaqueColor<CS extends ColorSpace> {
  constructor(
    readonly components: Vec3,
    readonly cs: CS,
  ) {}

  /** `OpaqueColor::<CS>::BLACK`. A TS static cannot see the class type parameter. */
  static black<CS extends ColorSpace>(cs: CS): OpaqueColor<CS> {
    return new OpaqueColor([0, 0, 0], cs);
  }

  /** `OpaqueColor::<CS>::WHITE`. */
  static white<CS extends ColorSpace>(cs: CS): OpaqueColor<CS> {
    return new OpaqueColor(cs.WHITE_COMPONENTS, cs);
  }

  /** `OpaqueColor::<Srgb>::from_rgb8`. */
  static from_rgb8(r: number, g: number, b: number): OpaqueColor<Srgb> {
    return new OpaqueColor([u8_to_f32(r), u8_to_f32(g), u8_to_f32(b)], Srgb);
  }

  /** Add an alpha channel. */
  with_alpha(alpha: number): AlphaColor<CS> {
    const [r, g, b] = this.components;
    return new AlphaColor([r, g, b, alpha], this.cs);
  }

  /** Convert a color into a different color space. */
  convert<TargetCS extends ColorSpace>(target: TargetCS): OpaqueColor<TargetCS> {
    return new OpaqueColor(this.cs.convert(target, this.components), target);
  }

  /** Map components. */
  map(f: (x: number, y: number, z: number) => Vec3): OpaqueColor<CS> {
    const [x, y, z] = this.components;
    return new OpaqueColor(f(x, y, z), this.cs);
  }

  /**
   * Convert the color to sRGB and pack into 8 bit per component integers.
   *
   * Component values outside `0.0-1.0` saturate to 0 or 255.
   */
  to_rgba8(): Rgba8 {
    const [r, g, b] = this.convert(Srgb).components;
    return new Rgba8(
      fast_round_to_u8(r * 255),
      fast_round_to_u8(g * 255),
      fast_round_to_u8(b * 255),
      255,
    );
  }
}

/** A color in a color space known at compile time, with an alpha channel. */
export class AlphaColor<CS extends ColorSpace> {
  constructor(
    readonly components: Vec4,
    readonly cs: CS,
  ) {}

  /** `AlphaColor::<CS>::BLACK`, upstream's black opaque colour. */
  static black<CS extends ColorSpace>(cs: CS): AlphaColor<CS> {
    return new AlphaColor([0, 0, 0, 1], cs);
  }

  /** `AlphaColor::<CS>::TRANSPARENT`. */
  static transparent<CS extends ColorSpace>(cs: CS): AlphaColor<CS> {
    return new AlphaColor([0, 0, 0, 0], cs);
  }

  /** `AlphaColor::<CS>::WHITE`. */
  static white<CS extends ColorSpace>(cs: CS): AlphaColor<CS> {
    return new AlphaColor([...cs.WHITE_COMPONENTS, 1], cs);
  }

  /** `AlphaColor::<Srgb>::from_rgba8`. */
  static from_rgba8(r: number, g: number, b: number, a: number): AlphaColor<Srgb> {
    return new AlphaColor([u8_to_f32(r), u8_to_f32(g), u8_to_f32(b), u8_to_f32(a)], Srgb);
  }

  /** `AlphaColor::<Srgb>::from_rgb8`. */
  static from_rgb8(r: number, g: number, b: number): AlphaColor<Srgb> {
    return new AlphaColor([u8_to_f32(r), u8_to_f32(g), u8_to_f32(b), 1], Srgb);
  }

  /** Split into opaque and alpha components. */
  split(): [OpaqueColor<CS>, number] {
    return [this.discard_alpha(), this.components[3]];
  }

  /** Set the alpha channel, replacing the existing one. */
  with_alpha(alpha: number): AlphaColor<CS> {
    const [r, g, b] = this.components;
    return new AlphaColor([r, g, b, alpha], this.cs);
  }

  /** Split out the opaque components, discarding the alpha. */
  discard_alpha(): OpaqueColor<CS> {
    const [r, g, b] = this.components;
    return new OpaqueColor([r, g, b], this.cs);
  }

  /** Convert a color into a different color space. */
  convert<TargetCS extends ColorSpace>(target: TargetCS): AlphaColor<TargetCS> {
    const opaque = this.discard_alpha().convert(target);
    return new AlphaColor([...opaque.components, this.components[3]], target);
  }

  /** Convert a color to the corresponding premultiplied form. */
  premultiply(): PremulColor<CS> {
    const [r, g, b, a] = this.components;
    const [pr, pg, pb] = this.cs.LAYOUT.scale([r, g, b], a);
    return new PremulColor([pr, pg, pb, a], this.cs);
  }

  /** Multiply alpha by the given factor. */
  multiply_alpha(rhs: number): AlphaColor<CS> {
    return new AlphaColor(
      [this.components[0], this.components[1], this.components[2], this.components[3] * rhs],
      this.cs,
    );
  }

  /** Map components. */
  map(f: (x: number, y: number, z: number, a: number) => Vec4): AlphaColor<CS> {
    const [x, y, z, a] = this.components;
    return new AlphaColor(f(x, y, z, a), this.cs);
  }

  /** Convert the color to sRGB and pack into 8 bit per component integers. */
  to_rgba8(): Rgba8 {
    const [r, g, b, a] = this.convert(Srgb).components;
    return new Rgba8(
      fast_round_to_u8(r * 255),
      fast_round_to_u8(g * 255),
      fast_round_to_u8(b * 255),
      fast_round_to_u8(a * 255),
    );
  }
}

/** A color in a color space known at compile time, with premultiplied alpha. */
export class PremulColor<CS extends ColorSpace> {
  constructor(
    readonly components: Vec4,
    readonly cs: CS,
  ) {}

  /** `PremulColor::<CS>::BLACK`. */
  static black<CS extends ColorSpace>(cs: CS): PremulColor<CS> {
    return new PremulColor([0, 0, 0, 1], cs);
  }

  /** `PremulColor::<CS>::TRANSPARENT`. */
  static transparent<CS extends ColorSpace>(cs: CS): PremulColor<CS> {
    return new PremulColor([0, 0, 0, 0], cs);
  }

  /** `PremulColor::<CS>::WHITE`. */
  static white<CS extends ColorSpace>(cs: CS): PremulColor<CS> {
    return new PremulColor([...cs.WHITE_COMPONENTS, 1], cs);
  }

  /** `PremulColor::<Srgb>::from_rgba8`. */
  static from_rgba8(r: number, g: number, b: number, a: number): PremulColor<Srgb> {
    return new PremulColor([u8_to_f32(r), u8_to_f32(g), u8_to_f32(b), u8_to_f32(a)], Srgb);
  }

  /** `PremulColor::<Srgb>::from_rgb8`. */
  static from_rgb8(r: number, g: number, b: number): PremulColor<Srgb> {
    return new PremulColor([u8_to_f32(r), u8_to_f32(g), u8_to_f32(b), 1], Srgb);
  }

  /** Split out the opaque components, discarding the alpha. */
  discard_alpha(): OpaqueColor<CS> {
    return this.un_premultiply().discard_alpha();
  }

  /** Convert a color into a different color space. */
  convert<TargetCS extends ColorSpace>(target: TargetCS): PremulColor<TargetCS> {
    if (is_same_space(this.cs, target)) return new PremulColor(this.components, target);
    if (target.IS_LINEAR && this.cs.IS_LINEAR) {
      // Both spaces are linear, so a transfer function cannot change the
      // channels and the premultiply can be carried through the matrix.
      const [r, g, b, a] = this.components;
      const multiplied = this.cs.convert(target, [r, g, b]);
      return new PremulColor([...multiplied, a], target);
    }
    return this.un_premultiply().convert(target).premultiply();
  }

  /** Convert a color to the corresponding separate alpha form. */
  un_premultiply(): AlphaColor<CS> {
    const alpha = this.components[3];
    const scale = alpha === 0 ? 1 : 1 / alpha;
    const [r, g, b] = this.cs.LAYOUT.scale(
      [this.components[0], this.components[1], this.components[2]],
      scale,
    );
    return new AlphaColor([r, g, b, alpha], this.cs);
  }

  /** Multiply alpha by the given factor, scaling the premultiplied channels to match. */
  multiply_alpha(rhs: number): PremulColor<CS> {
    const [r, g, b] = this.cs.LAYOUT.scale(
      [this.components[0], this.components[1], this.components[2]],
      rhs,
    );
    return new PremulColor([r, g, b, this.components[3] * rhs], this.cs);
  }

  /** Convert the color to sRGB and pack into 8 bit per component integers. */
  to_rgba8(): PremulRgba8 {
    const [r, g, b, a] = this.convert(Srgb).components;
    return new PremulRgba8(
      fast_round_to_u8(r * 255),
      fast_round_to_u8(g * 255),
      fast_round_to_u8(b * 255),
      fast_round_to_u8(a * 255),
    );
  }
}

/**
 * Fast rounding of `f32` to integer `u8`, rounding ties up, upstream
 * `fast_round_to_u8`.
 *
 * Upstream this exists because a target's `roundf` call is branchy, and the
 * cast that follows it saturates in Rust. `Math.floor(a + 0.5)` is the same
 * arithmetic; the saturation is spelled out because JS has no saturating cast,
 * and `NaN` falls into the first branch rather than comparing false to both.
 *
 * Upstream documents one input where this differs from a true round,
 * `0.49999997`, which rounds up — but that is an artifact of adding in `f32`.
 * The port adds in `f64`, where it stays at 0.
 */
export function fast_round_to_u8(a: number): number {
  const v = Math.floor(a + 0.5);
  if (!(v >= 0)) return 0;
  if (v > 255) return 255;
  return v;
}
