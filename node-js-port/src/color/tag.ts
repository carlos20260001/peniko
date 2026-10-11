/**
 * A TypeScript port of the `color` crate's `tag.rs`.
 *
 * Only the enum is ported. Upstream's tagged conversions (`to_linear_srgb`,
 * `from_linear_srgb`, `convert`) dispatch over all sixteen color spaces, so they
 * are only meaningful once those spaces exist; the missing-component machinery in
 * the rest of the file exists for `DynamicColor`, which this port does not carry.
 *
 * The discriminants are upstream's `#[repr(u8)]` values. They are not stable
 * across upstream releases by the crate's own admission, but `ColorSpaceTag` is
 * still a value that crosses the wire — peniko's `Gradient` stores one as its
 * interpolation space — so keeping the numbering is the safer default.
 */

export enum ColorSpaceTag {
  /** The `Srgb` color space. */
  Srgb = 0,
  /** The `LinearSrgb` color space. */
  LinearSrgb = 1,
  /** The `Lab` color space. */
  Lab = 2,
  /** The `Lch` color space. */
  Lch = 3,
  /** The `Hsl` color space. */
  Hsl = 4,
  /** The `Hwb` color space. */
  Hwb = 5,
  /** The `Oklab` color space. */
  Oklab = 6,
  /** The `Oklch` color space. */
  Oklch = 7,
  /** The `DisplayP3` color space. */
  DisplayP3 = 8,
  /** The `A98Rgb` color space. */
  A98Rgb = 9,
  /** The `ProphotoRgb` color space. */
  ProphotoRgb = 10,
  /** The `Rec2020` color space. */
  Rec2020 = 11,
  /** The `Aces2065_1` color space. */
  Aces2065_1 = 15,
  /** The `AcesCg` color space. */
  AcesCg = 12,
  /** The `XyzD50` color space. */
  XyzD50 = 13,
  /** The `XyzD65` color space. */
  XyzD65 = 14,
}
