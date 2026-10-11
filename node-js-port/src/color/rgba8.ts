/**
 * A TypeScript port of the `color` crate's `rgba8.rs`: the packed 8-bit
 * representations of sRGB colour.
 *
 * These are the two types a render target actually holds — premultiplied on the
 * way out, straight on the way in. Upstream the components are `u8`, which Node
 * has no distinct type for; the port uses `number` and treats values outside
 * `0..=255` as a programming error rather than silently truncating, which is
 * what Rust's cast would do.
 */

import { AlphaColor, PremulColor } from './color.js';
import type { Srgb } from './colorspace.js';

/** A packed representation of sRGB colors, upstream `Rgba8`. */
export class Rgba8 {
  constructor(
    /** Red component. */
    readonly r: number,
    /** Green component. */
    readonly g: number,
    /** Blue component. */
    readonly b: number,
    /** Alpha component. Alpha is interpreted as separated alpha. */
    readonly a: number,
  ) {}

  /** Returns the color as a `[r, g, b, a]` array. */
  to_u8_array(): [number, number, number, number] {
    return [this.r, this.g, this.b, this.a];
  }

  /** Convert the `[r, g, b, a]` byte array into an `Rgba8` color. */
  static from_u8_array([r, g, b, a]: readonly [number, number, number, number]): Rgba8 {
    return new Rgba8(r, g, b, a);
  }

  /**
   * Returns the color as a little-endian packed value, with `r` the least
   * significant byte and `a` the most significant, upstream `to_u32`.
   */
  to_u32(): number {
    return (
      ((this.a << 24) | (this.b << 16) | (this.g << 8) | this.r) >>> 0
    );
  }

  /** Interpret the little-endian packed value as a color, upstream `from_u32`. */
  static from_u32(packed_bytes: number): Rgba8 {
    return new Rgba8(
      packed_bytes & 0xff,
      (packed_bytes >>> 8) & 0xff,
      (packed_bytes >>> 16) & 0xff,
      (packed_bytes >>> 24) & 0xff,
    );
  }

  /** `From<Rgba8> for AlphaColor<Srgb>`. */
  to_alpha_color(): AlphaColor<Srgb> {
    return AlphaColor.from_rgba8(this.r, this.g, this.b, this.a);
  }
}

/** A packed representation of pre-multiplied sRGB colors, upstream `PremulRgba8`. */
export class PremulRgba8 {
  constructor(
    /** Red component. */
    readonly r: number,
    /** Green component. */
    readonly g: number,
    /** Blue component. */
    readonly b: number,
    /** Alpha component. */
    readonly a: number,
  ) {}

  /** Returns the color as a `[r, g, b, a]` array. */
  to_u8_array(): [number, number, number, number] {
    return [this.r, this.g, this.b, this.a];
  }

  /** Convert the `[r, g, b, a]` byte array into a `PremulRgba8` color. */
  static from_u8_array([r, g, b, a]: readonly [number, number, number, number]): PremulRgba8 {
    return new PremulRgba8(r, g, b, a);
  }

  /**
   * Returns the color as a little-endian packed value, with `r` the least
   * significant byte and `a` the most significant, upstream `to_u32`.
   */
  to_u32(): number {
    return (
      ((this.a << 24) | (this.b << 16) | (this.g << 8) | this.r) >>> 0
    );
  }

  /** Interpret the little-endian packed value as a color, upstream `from_u32`. */
  static from_u32(packed_bytes: number): PremulRgba8 {
    return new PremulRgba8(
      packed_bytes & 0xff,
      (packed_bytes >>> 8) & 0xff,
      (packed_bytes >>> 16) & 0xff,
      (packed_bytes >>> 24) & 0xff,
    );
  }

  /** `From<PremulRgba8> for PremulColor<Srgb>`. */
  to_premul_color(): PremulColor<Srgb> {
    return PremulColor.from_rgba8(this.r, this.g, this.b, this.a);
  }
}
